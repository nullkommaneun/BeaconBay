/**
 * js/bluetooth.js (Version 9.14 - "Smart Filter" Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - Implementiert den "Goldstandard"-Filter.
 * - requestDeviceForHandshake holt sich den deviceLog.
 * - Wenn 'serviceData'-UUIDs im Log vorhanden sind, wird
 * danach gefiltert (filters: [{ services: [...] }]).
 * - Wenn (wie beim Flipper) keine Services geloggt wurden,
 * wird auf 'acceptAllDevices: true' zurückgefallen.
 */

import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js';
// V9.14 HINWEIS: Wir brauchen getDeviceLog, das über app.js an initBluetooth
// und dann an appCallbacks übergeben wird.
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
let appCallbacks = {}; // (V9.9)

// === KONSTANTEN ===
const STALE_DEVICE_THRESHOLD_MS = 10000;
const STALE_CHECK_INTERVAL_MS = 2000;

// === PRIVATE HELPER: SCANNING ===

/**
 * V9.12 PATCH: 'isInteresting'-Logik entfernt.
 */
function handleAdvertisement(event) {
    try {
        logAdvertisement(event);
        
        const { device } = event; 
        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        parsedData.isConnectable = true; 
        
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
    // ... (unverändert)
    const now = Date.now();
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen > STALE_DEVICE_THRESHOLD_MS) {
            setCardStale(deviceId);
        }
    });
}

function onGattDisconnect() {
    // ... (unverändert)
    diagLog('GATT-Verbindung getrennt.', 'bt');
    if (gattServer) {
        gattServer.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
    }
    gattServer = null;
    gattCharacteristicMap.clear();
    setScanStatus(false); 
    setGattConnectingUI(false, null);
    
    if (appCallbacks.onGattDisconnected) {
        appCallbacks.onGattDisconnected();
    }
}

function handleValueChange(event) {
    // ... (unverändert)
    const charUuid = event.target.uuid;
    const value = event.target.value; 
    const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
    const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
    diagLog(`[Notify] Neuer Wert für ${charUuid}: ${decodedValue}`, 'bt');
    updateCharacteristicValue(charUuid, value, false, decodedValue);
}

// === PUBLIC API: SCAN & BASE CONNECT ===

export function initBluetooth(callbacks) {
    // ... (unverändert)
    appCallbacks = callbacks;
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    initLogger();
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

export async function startScan() {
    // ... (unverändert)
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
    // ... (unverändert)
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
    // ... (unverändert)
    if (!gattServer) {
        diagLog('[BT] disconnect: Ignoriert, da gattServer null ist.', 'bt');
        return;
    }
    if (gattServer.connected) {
        diagLog('[BT] Trenne aktive GATT-Verbindung (via disconnect)...', 'bt');
        gattServer.disconnect(); // Dies löst onGattDisconnect aus
    } else {
        diagLog('[BT] disconnect: Ignoriert, da gattServer nicht .connected ist.', 'bt');
    }
}

// === PUBLIC API: GATT INTERACTION (V9.14 PATCH) ===

/**
 * V9.14 (PATCH): Implementiert "Smart Filter".
 * Filtert nach geloggten Service-UUIDs oder fällt auf 'acceptAllDevices' zurück.
 * @param {string} deviceId - Die ID des Geräts, das verbunden werden soll.
 * @returns {Promise<BluetoothDevice | null>} - Das autorisierte Gerät oder null.
 */
export async function requestDeviceForHandshake(deviceId) {
    diagLog(`[Handshake V9.14] Starte "Smart Filter" für ${deviceId.substring(0, 4)}...`, 'bt');
    
    // UI in "Verbinde..."-Zustand versetzen
    setGattConnectingUI(true); 

    // 1. Hole die Log-Daten, um zu entscheiden, WIE wir filtern
    if (!appCallbacks.onGetDeviceLog) {
         diagLog(`[Handshake V9.14] FATALER FEHLER: appCallbacks.onGetDeviceLog fehlt.`, 'error');
         return null; // Dies sollte nicht passieren, wenn V9.9/V9.11-app.js geladen ist
    }
    
    const deviceLog = appCallbacks.onGetDeviceLog(deviceId);
    if (!deviceLog) {
         diagLog(`[Handshake V9.14] FEHLER: Konnte Log für ${deviceId} nicht finden.`, 'error');
         return null;
    }

    // 2. Baue die Filter-Optionen
    const requestOptions = {
        optionalServices: [
            '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
            '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
        ]
    };
    
    // 2a. Extrahiere Service-UUIDs aus dem Log
    const serviceUuids = deviceLog.uniqueAdvertisements
        .filter(ad => ad.type === 'serviceData' && ad.serviceUuid)
        .map(ad => ad.serviceUuid); // z.B. ['0xfe9f', '0x180f']

    if (serviceUuids.length > 0) {
        // Fall A: Wir haben Services! (Industrie-Ziel)
        diagLog(`[Handshake V9.14] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        // Fall B: Keine Services gefunden (Flipper). Fallback auf "No-Filter".
        diagLog(`[Handshake V9.14] KEINE Services gefunden für ${deviceLog.name}. Fallback auf 'acceptAllDevices'.`, 'warn');
        requestOptions.acceptAllDevices = true;
    }

    // 3. Führe den Handshake mit den "smarten" Optionen durch
    try {
        diagLog(`[Handshake V9.14] Fordere Gerät an mit Optionen: ${JSON.stringify(requestOptions)}`, 'bt');
        
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        
        diagLog(`[Handshake V9.14] Erlaubnis erteilt für: ${device.name}`, 'bt');
        return device; 

    } catch (err) {
        diagLog(`[Handshake V9.14] FEHLER: ${err.message}`, 'error');
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
             diagLog('Handshake vom Benutzer abgelehnt oder kein Gerät ausgewählt/gefunden.', 'warn');
        }
        return null; 
    }
}

/**
 * V9.14: Phase 2 - Unverändert. Verbindet mit autorisiertem Gerät.
 * @param {BluetoothDevice} device - Das autorisierte Gerät von requestDeviceForHandshake.
 * @returns {Promise<boolean>} - True bei Erfolg, False bei Fehler.
 */
export async function connectWithAuthorizedDevice(device) {
    diagLog(`[TRACE] connectWithAuthorizedDevice(${device.name}) gestartet.`, 'bt');
    
    gattCharacteristicMap.clear();

    try {
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
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
                const charName = KNOWN_CHARACTERISTICS.get(shortUuid) || 'Unknown Characteristic';
                
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
        
        setGattConnectingUI(false, null, true); 
        renderGattTree(gattTree, device.name, gattSummary);
        
        return true; // Erfolg melden

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect(); 
        setGattConnectingUI(false, err.message); 
        
        return false; // Misserfolg melden
    }
}


export async function readCharacteristic(charUuid) {
    // ... (unverändert)
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
    // ... (unverändert)
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
 
