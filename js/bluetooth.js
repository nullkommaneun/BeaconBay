/**
 * js/bluetooth.js (Version 6.3 - Mit Fehler-Trace-Route)
 * * ARCHITEKTUR-HINWEIS:
 * - Fügt [TRACE]-Logs hinzu, um den 'connectable'-Flag-Flow zu debuggen.
 */

import { diagLog } from './errorManager.js';
import { parseAdvertisementData } from './utils.js';
import { logAdvertisement, setScanStart, init as initLogger } from './logger.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,
    showConnectingState,
    showView,
    updateCharacteristicValue
} from './ui.js';

// === MODULE STATE ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;
let gattCharacteristicMap = new Map();

// === KONSTANTEN ===
const STALE_DEVICE_THRESHOLD_MS = 10000;
const STALE_CHECK_INTERVAL_MS = 2000;

// === PRIVATE HELPER: SCANNING ===

function handleAdvertisement(event) {
    try {
        logAdvertisement(event);
        
        const { device } = event;
        const { connectable } = device; 

        // ==== [TRACE 1] ====
        // Was meldet der Browser *wirklich*?
        diagLog(`[TRACE] handleAdvertisement: Gerät ${device.id.substring(0, 4)}... hat connectable=${connectable}`, 'utils');

        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        parsedData.isConnectable = connectable;
        
        deviceMap.set(device.id, {
            deviceObject: device, 
            parsedData: parsedData
        });
        
        // Wir übergeben das Objekt mit 'isConnectable' an die UI
        updateBeaconUI(device.id, parsedData);

    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

function checkStaleDevices() {
    const now = Date.now();
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen > STALE_DEVICE_THRESHOLD_MS) {
            setCardStale(deviceId);
        }
    });
}

function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    gattServer = null;
    gattCharacteristicMap.clear();
    showView('beacon');
    setScanStatus(false);
}

function handleValueChange(event) {
    const charUuid = event.target.uuid;
    const value = event.target.value; 
    diagLog(`[Notify] Neuer Wert für ${charUuid}:`, 'bt');
    updateCharacteristicValue(charUuid, value);
}

// === PUBLIC API: SCAN & BASE CONNECT ===

export function initBluetooth() {
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    initLogger();
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

export async function startScan() {
    if (activeScan && activeScan.active) return;
    setScanStatus(true);
    clearUI(); 
    deviceMap.clear(); 
    
    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        activeScan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: true, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        setScanStart();
        
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
        staleCheckInterval = setInterval(checkStaleDevices, STALE_CHECK_INTERVAL_MS);
    } catch (err) {
        diagLog(err.name === 'NotAllowedError' ? 'Scan vom Benutzer abgelehnt.' : `Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null;
    }
}

export function stopScan() {
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);
    if (activeScan && activeScan.active) {
        try {
            activeScan.stop();
            diagLog('Bluetooth-Scan wurde gestoppt.', 'bt');
        } catch (err) {
            diagLog(`Fehler beim Stoppen des Scans: ${err.message}`, 'error');
        }
        activeScan = null;
    }
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }
    setScanStatus(false);
    diagLog('Scan-Ressourcen bereinigt.', 'bt');
}

export function disconnect() {
    if (!gattServer) return;
    gattServer.disconnect(); 
}

// === PUBLIC API: GATT INTERACTION ===

export async function connectToDevice(deviceId) {
    // ==== [TRACE 5] ====
    // Ist der Klick-Befehl überhaupt hier angekommen?
    diagLog(`[TRACE] connectToDevice(${deviceId.substring(0, 4)}...) in bluetooth.js gestartet.`, 'bt');

    const deviceData = deviceMap.get(deviceId);
    if (!deviceData) return diagLog(`Verbindung fehlgeschlagen: Gerät ${deviceId} nicht gefunden.`, 'error');
    
    if (!deviceData.parsedData.isConnectable) {
        return diagLog(`Aktion blockiert: Gerät ${deviceId} ist nicht verbindungsfähig.`, 'warn');
    }

    if (activeScan && activeScan.active) stopScan();
    
    showConnectingState(deviceData.parsedData.name);
    gattCharacteristicMap.clear();

    try {
        const device = deviceData.deviceObject;
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        const services = await gattServer.getPrimaryServices();
        diagLog(`Services gefunden: ${services.length}`, 'bt');
        
        const gattTree = [];
        for (const service of services) {
            const serviceData = { uuid: service.uuid, characteristics: [] };
            try {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    gattCharacteristicMap.set(char.uuid, char);
                    serviceData.characteristics.push({
                        uuid: char.uuid,
                        properties: char.properties
                    });
                }
            } catch (err) {
                diagLog(`Fehler beim Lesen der Characteristics für ${service.uuid}: ${err.message}`, 'warn');
            }
            gattTree.push(serviceData);
        }
        
        renderGattTree(gattTree, device.name);
    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect();
    }
}

export async function readCharacteristic(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char || !char.properties.read) {
        return diagLog(`Lesefehler: Char ${charUuid} nicht gefunden oder nicht lesbar.`, 'error');
    }
    try {
        diagLog(`Lese Wert von ${charUuid}...`, 'bt');
        const value = await char.readValue();
        updateCharacteristicValue(charUuid, value);
    } catch (err) {
        diagLog(`Fehler beim Lesen von ${charUuid}: ${err.message}`, 'error');
    }
}

export async function startNotifications(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char || !char.properties.notify) {
        return diagLog(`Notify-Fehler: Char ${charUuid} nicht gefunden oder nicht abonnierbar.`, 'error');
    }
    try {
        diagLog(`Starte Notifications für ${charUuid}...`, 'bt');
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', handleValueChange);
        diagLog(`Notifications für ${charUuid} gestartet.`, 'bt');
        updateCharacteristicValue(charUuid, null, true);
    } catch (err) {
        diagLog(`Fehler beim Starten von Notifications: ${err.message}`, 'error');
    }
}
