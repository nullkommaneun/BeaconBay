/**
 * js/bluetooth.js (Version 4 - Interaktive GATT-Logik)
 * * ARCHITEKTUR-HINWEIS:
 * - Speichert jetzt Live-Characteristic-Objekte in einer Map.
 * - Implementiert read/notify-Funktionen.
 * - Pusht Daten-Updates über `updateCharacteristicValue` an die UI.
 */

import { diagLog } from './errorManager.js';
import { parseAdvertisementData } from './utils.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,
    showConnectingState,
    showView,
    updateCharacteristicValue // NEU
} from './ui.js';

// === MODULE STATE ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;

/**
 * NEU: Speichert die echten BluetoothRemoteGATTCharacteristic-Objekte.
 * WIE: Map { 'charUuid' => BluetoothRemoteGATTCharacteristic }
 * HINWEIS: Dies ist eine Vereinfachung. In einer echten Multi-Service-App
 * müsste der Schlüssel eine Kombination aus Service- und Char-UUID sein.
 * @type {Map<string, BluetoothRemoteGATTCharacteristic>}
 */
let gattCharacteristicMap = new Map();


// === KONSTANTEN ===
const STALE_DEVICE_THRESHOLD_MS = 10000;
const STALE_CHECK_INTERVAL_MS = 2000;

// === PRIVATE HELPER: SCANNING ===

function handleAdvertisement(event) {
    try {
        const { device } = event;
        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        deviceMap.set(device.id, {
            deviceObject: device,
            parsedData: parsedData
        });
        
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

/**
 * (Intern) Aufräumfunktion bei GATT-Trennung.
 */
function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    gattServer = null;
    gattCharacteristicMap.clear(); // Wichtig: Char-Map leeren
    showView('beacon');
    setScanStatus(false);
}

/**
 * NEU: Callback für 'characteristicvaluechanged' (Notify/Indicate).
 * Wird ausgelöst, wenn der Sensor einen neuen Wert sendet.
 * @param {Event} event Das Event mit event.target.value (DataView)
 */
function handleValueChange(event) {
    const charUuid = event.target.uuid;
    const value = event.target.value; // Dies ist ein DataView
    
    diagLog(`[Notify] Neuer Wert für ${charUuid}:`, 'bt');
    
    // Daten-Update an die UI pushen
    updateCharacteristicValue(charUuid, value);
}

// === PUBLIC API: SCAN & BASE CONNECT ===

export function initBluetooth() {
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
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
            diagLog('Bluetooth-Scan gestoppt.', 'bt');
        } catch (err) {
            diagLog(`Fehler beim Stoppen des Scans: ${err.message}`, 'error');
        }
        activeScan = null;
    }
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    setScanStatus(false);
}

export function disconnect() {
    if (!gattServer) return;
    gattServer.disconnect(); // Löst onGattDisconnect via Event aus
}

// === PUBLIC API: GATT INTERACTION ===

export async function connectToDevice(deviceId) {
    const deviceData = deviceMap.get(deviceId);
    if (!deviceData) return diagLog(`Verbindung fehlgeschlagen: Gerät ${deviceId} nicht gefunden.`, 'error');

    if (activeScan && activeScan.active) stopScan();
    
    showConnectingState(deviceData.parsedData.name);
    gattCharacteristicMap.clear(); // Alte Chars löschen

    try {
        const device = deviceData.deviceObject;
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        const services = await gattServer.getPrimaryServices();
        diagLog(`Services gefunden: ${services.length}`, 'bt');
        
        const gattTree = [];
        for (const service of services) {
            const serviceData = {
                uuid: service.uuid,
                characteristics: []
            };

            try {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    // WICHTIG: Speichere das ECHTE Objekt in der Map
                    gattCharacteristicMap.set(char.uuid, char);
                    
                    serviceData.characteristics.push({
                        uuid: char.uuid,
                        properties: char.properties // (z.B. read, write, notify)
                    });
                }
            } catch (err) {
                diagLog(`Fehler beim Lesen der Characteristics für ${service.uuid}: ${err.message}`, 'warn');
            }
            gattTree.push(serviceData);
        }
        
        // Fertigen Baum (nur UUIDs/Properties) an die UI übergeben
        renderGattTree(gattTree, device.name);

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect(); // Aufräumen
    }
}

/**
 * NEU: Liest einen Wert von einer Characteristic.
 * @param {string} charUuid - Die UUID der Characteristic.
 */
export async function readCharacteristic(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char) {
        return diagLog(`Lesefehler: Characteristic ${charUuid} nicht gefunden.`, 'error');
    }
    if (!char.properties.read) {
        return diagLog(`Lesefehler: Characteristic ${charUuid} ist nicht lesbar.`, 'error');
    }
    
    try {
        diagLog(`Lese Wert von ${charUuid}...`, 'bt');
        const value = await char.readValue(); // Führt den Read aus
        
        // Daten-Update an die UI pushen
        updateCharacteristicValue(charUuid, value);
        
    } catch (err) {
        diagLog(`Fehler beim Lesen von ${charUuid}: ${err.message}`, 'error');
    }
}

/**
 * NEU: Startet Notifications für eine Characteristic.
 * @param {string} charUuid - Die UUID der Characteristic.
 */
export async function startNotifications(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char) {
        return diagLog(`Notify-Fehler: Characteristic ${charUuid} nicht gefunden.`, 'error');
    }
    if (!char.properties.notify) {
        return diagLog(`Notify-Fehler: Characteristic ${charUuid} kann nicht abonniert werden.`, 'error');
    }
    
    try {
        diagLog(`Starte Notifications für ${charUuid}...`, 'bt');
        await char.startNotifications();
        
        // WICHTIG: Den Event-Listener an diese Characteristic binden
        char.addEventListener('characteristicvaluechanged', handleValueChange);
        
        diagLog(`Notifications für ${charUuid} gestartet.`, 'bt');
        // UI-Update, um zu zeigen, dass Notify aktiv ist
        updateCharacteristicValue(charUuid, null, true); // true = "Notify aktiv"
        
    } catch (err) {
        diagLog(`Fehler beim Starten von Notifications: ${err.message}`, 'error');
    }
}

// TODO: writeCharacteristic(charUuid, value) - als nächster Schritt
