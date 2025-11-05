/**
 * js/bluetooth.js (Version 9.6 - Handshake-Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - Behebt den "GATT operation not authorized"-Fehler.
 * - connectToDevice ruft jetzt navigator.bluetooth.requestDevice()
 * mit einem Namensfilter auf, um die explizite Benutzererlaubnis
 * über den Browser-Dialog (Handshake) einzuholen.
 * - Erst das *neue* Device-Objekt aus requestDevice wird für
 * device.gatt.connect() verwendet.
 */

import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js';
import { logAdvertisement, setScanStart, init as initLogger } from './logger.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,
    showView,
    updateCharacteristicValue,
    setGattConnectingUI
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
        
        const { device, manufacturerData, serviceData } = event;
        const isInteresting = (manufacturerData && manufacturerData.size > 0) || 
                              (serviceData && serviceData.size > 0);
        
        diagLog(`[TRACE] handleAdvertisement: Gerät ${device.id.substring(0, 4)}... hat isInteresting=${isInteresting}`, 'utils');

        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        parsedData.isConnectable = isInteresting;
        
        deviceMap.set(device.id, {
            deviceObject: device, // Wir behalten dies für Referenzen, aber nicht zum Verbinden
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

function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    if (gattServer) {
        gattServer.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
    }
    gattServer = null;
    gattCharacteristicMap.clear();
    setScanStatus(false); 
    setGattConnectingUI(false, null); 
}

function handleValueChange(event) {
    const charUuid = event.target.uuid;
    const value = event.target.value; 
    const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
    const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
    diagLog(`[Notify] Neuer Wert für ${charUuid}: ${decodedValue}`, 'bt');
    updateCharacteristicValue(charUuid, value, false, decodedValue);
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
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return;
    }
    showView('beacon');
    
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
    if (!gattServer) {
        diagLog('[BT] disconnect: Ignoriert, da gattServer null ist.', 'bt');
        return;
    }
    if (gattServer.connected) {
        diagLog('[BT] Trenne aktive GATT-Verbindung (via disconnect)...', 'bt');
        gattServer.disconnect(); 
    } else {
        diagLog('[BT] disconnect: Ignoriert, da gattServer nicht .connected ist.', 'bt');
    }
}

// === PUBLIC API: GATT INTERACTION ===

/**
 * V9.6 PATCH: Implementiert den Handshake (requestDevice).
 * @returns {Promise<boolean>} - True bei Erfolg, False bei Fehler.
 */
export async function connectToDevice(deviceId) {
    diagLog(`[TRACE] connectToDevice(${deviceId.substring(0, 4)}...) in bluetooth.js gestartet.`, 'bt');
    const deviceData = deviceMap.get(deviceId);
    
    if (!deviceData) {
        diagLog(`Verbindung fehlgeschlagen: Gerät ${deviceId} nicht gefunden.`, 'error');
        setGattConnectingUI(false, 'Gerät nicht gefunden');
        return false;
    }

    // Wir brauchen den Namen des Geräts für den Filter
    const deviceName = deviceData.parsedData.name;
    if (!deviceName) {
        diagLog(`Verbindung fehlgeschlagen: Gerät ${deviceId} hat keinen Namen, Handshake nicht möglich.`, 'error');
        setGattConnectingUI(false, 'Gerät hat keinen Namen');
        return false;
    }
    
    setGattConnectingUI(true); 
    gattCharacteristicMap.clear();

    try {
        // --- V9.6 HANDSHAKE START ---
        // 1. Explizite Erlaubnis vom Benutzer anfordern
        // Wir filtern nach dem Namen, den wir beim Scannen gesehen haben.
        diagLog(`[Handshake] Fordere Erlaubnis für Gerät mit Namen an: "${deviceName}"`, 'bt');
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ name: deviceName }],
            // Wir fordern optional die Dienste an, die wir später lesen wollen (Smart Driver)
            optionalServices: [
                '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
                '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
            ]
        });
        
        diagLog(`[Handshake] Erlaubnis erteilt. Verbinde mit ${device.name}...`, 'bt');
        // --- V9.6 HANDSHAKE ENDE ---

        // 2. Mit dem *neuen*, autorisierten 'device'-Objekt verbinden
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        // 3. Service Discovery (wie bisher)
        const services = await gattServer.getPrimaryServices();
        diagLog(`Services gefunden: ${services.length}`, 'bt');
        
        const gattTree = [];
        const gattSummary = {}; 

        for (const service of services) {
            const serviceUuid = service.uuid.toLowerCase();
            const shortUuid = serviceUuid.startsWith("0000") ? `0x${serviceUuid.substring(4, 8)}` : serviceUuid;
            const serviceName = KNOWN_SERVICES.get(shortUuid) || 'Unknown Service';
            
            const serviceData = {
                uuid: serviceUuid,
                name: serviceName,
                characteristics: []
            };

            let characteristics = [];
            try {
                 characteristics = await service.getCharacteristics();
            } catch (err) {
                diagLog(`Fehler beim Lesen der Characteristics für ${serviceName}: ${err.message}`, 'warn');
            }

            for (const char of characteristics) {
                const charUuid = char.uuid.toLowerCase();
                const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
                const charName = KNOWN_CHARACTERISTICS.get(shortCharUuid) || 'Unknown Characteristic';
                
                gattCharacteristicMap.set(charUuid, char);
                serviceData.characteristics.push({
                    uuid: charUuid,
                    name: charName,
                    properties: char.properties
                });

                // Smart Driver
                if (char.properties.read && 
                   (serviceName === 'Device Information' || serviceName === 'Battery Service')) 
                {
                    try {
                        const value = await char.readValue();
                        const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
                        gattSummary[charName] = decodedValue;
                        diagLog(`[SmartDriver] ${charName}: ${decodedValue}`, 'bt');
                    } catch (readErr) {
                        diagLog(`Fehler beim automatischen Lesen von ${charName}: ${readErr.message}`, 'warn');
                    }
                }
            }
            gattTree.push(serviceData);
        }
        
        // 4. Erfolg (wie bisher)
        setGattConnectingUI(false, null, true); 
        renderGattTree(gattTree, device.name, gattSummary);
        
        return true; // Erfolg melden

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
             diagLog('Handshake vom Benutzer abgelehnt oder Gerät nicht gefunden.', 'warn');
        }
        
        onGattDisconnect(); 
        setGattConnectingUI(false, err.message); 
        
        return false; // Misserfolg melden
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
        const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
        const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
        updateCharacteristicValue(charUuid, value, false, decodedValue);
    } catch (err) {
        diagLog(`Fehler beim Lesen von ${charUuid}: ${err.message}`, 'error');
    }
}

export async function startNotifications(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char || !(char.properties.notify || char.properties.indicate)) {
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
