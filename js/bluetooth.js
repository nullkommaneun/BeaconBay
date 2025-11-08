/**
 * js/bluetooth.js (Version 13.3N - "Config Refactor" & "V13-Sync")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3N FIX: Importiert 'AppConfig' (Refactoring).
 * - V13.3N FIX: Entfernt 'init as initLogger' Import (Fehler V13.3M).
 * - V13.3N FIX: 'handleAdvertisement' ruft 'logAdvertisement' 
 * mit der korrekten V13.3L-Signatur auf (Fehler 3).
 * - V13.3N FIX: 'requestDeviceForHandshake' nutzt V13.1 
 * 'advertisementHistory.toArray()' (Proaktiver Fix, Regel 2).
 * - V12.1: (Logik unverändert) startScan() gibt true/false zurück.
 */

// V13.3N-IMPORTS
import { AppConfig } from './config.js';
import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js';
// V13.3N FIX: Import korrigiert (Fehler 1 & 2)
import { logAdvertisement, setScanStart } from './logger.js';
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
let appCallbacks = {}; 

// === KONSTANTEN ===
// V13.3N-REFAKTOR: "Magic Numbers" entfernt (Fehler 4)
// const STALE_DEVICE_THRESHOLD_MS = 10000; // VERALTET
// const STALE_CHECK_INTERVAL_MS = 2000;    // VERALTET

// === PRIVATE HELPER: SCANNING ===

/**
 * V13.3N FIX: Angepasst an V13.3L Logger-Signatur (Fehler 3)
 */
function handleAdvertisement(event) {
    try {
        const { device, rssi } = event; 
        
        // 1. Daten parsen (V13.2)
        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        // 2. Daten loggen (V13.3L)
        // V13.3N FIX: Korrekte Signatur
        logAdvertisement(device, rssi, parsedData);
        
        // 3. UI-Daten-Map (V12.1)
        deviceMap.set(device.id, {
            deviceObject: device, 
            parsedData: parsedData
        });
        
        // 4. UI aktualisieren (V12.1)
        updateBeaconUI(device.id, parsedData);

    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

/**
 * V13.3N FIX: Verwendet AppConfig
 */
function checkStaleDevices() {
    const now = Date.now();
    // V13.3N-FIX:
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen > threshold) {
            setCardStale(deviceId);
        }
    });
}

// ... (onGattDisconnect, handleValueChange - unverändert) ...
function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    if (gattServer) gattServer.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
    gattServer = null;
    gattCharacteristicMap.clear();
    setScanStatus(false); 
    setGattConnectingUI(false, null);
    if (appCallbacks.onGattDisconnected) appCallbacks.onGattDisconnected();
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

/**
 * V13.3N FIX: 'initLogger()' entfernt (Fehler 1)
 */
export function initBluetooth(callbacks) {
    appCallbacks = callbacks; 
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    
    // V13.3M FIX: initLogger() wird von app.js aufgerufen
    // initLogger(); // VERALTET (V12.1)
    
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3N FIX: Verwendet AppConfig
 * V12.1 PATCH: (Unverändert) Gibt true/false zurück.
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return true;
    }
    showView('beacon');
    setScanStatus(true);
    clearUI(); 
    deviceMap.clear(); 
    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        activeScan = await navigator.bluetooth.requestLEScan({
            // V13.3N-FIX:
            acceptAllAdvertisements: AppConfig.Bluetooth.SCAN_ACCEPT_ALL, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        
        // V13.3N FIX: (Fehler 2)
        setScanStart(); // Markiert Scan-Startzeit im Logger
        
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
        
        // V13.3N-FIX:
        staleCheckInterval = setInterval(
            checkStaleDevices, 
            AppConfig.Bluetooth.STALE_CHECK_INTERVAL_MS
        );
        return true; // V12.1

    } catch (err) {
        diagLog(err.name === 'NotAllowedError' ? 'Scan vom Benutzer abgelehnt.' : `Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null;
        return false; // V12.1
    }
}

// ... (stopScan, disconnect - unverändert) ...
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
    if (gattServer.connected) {
        diagLog('[BT] Trenne aktive GATT-Verbindung (via disconnect)...', 'bt');
        gattServer.disconnect(); 
    }
}

// === PUBLIC API: GATT INTERACTION (V11.9 / V13.3N) ===

/**
 * V13.3N FIX: Verwendet AppConfig und V13.1 'advertisementHistory'
 * V11.9 PATCH: (Logik unverändert) Implementiert "Smart Filter".
 */
export async function requestDeviceForHandshake(deviceId) {
    diagLog(`[Handshake V13.3N] Starte "Smart Filter" für ${deviceId.substring(0, 4)}...`, 'bt');
    
    setGattConnectingUI(true); 

    if (!appCallbacks.onGetDeviceLog) {
         diagLog(`[Handshake V13.3N] FATALER FEHLER: appCallbacks.onGetDeviceLog fehlt.`, 'error');
         return null;
    }
    
    const deviceLog = appCallbacks.onGetDeviceLog(deviceId);
    if (!deviceLog) {
         diagLog(`[Handshake V13.3N] FEHLER: Konnte Log für ${deviceId} nicht finden.`, 'error');
         return null;
    }

    const requestOptions = {
        // V13.3N-FIX:
        optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES
    };
    
    // V13.3N-PROAKTIVER FIX (Regel 2):
    // V12.1 verwendete 'deviceLog.uniqueAdvertisements' (V11-Logik)
    // V13.1 verwendet 'deviceLog.advertisementHistory' (RingBuffer)
    const allAds = deviceLog.advertisementHistory.toArray();
    
    // Hole alle *einzigartigen* Service-UUIDs aus dem Verlauf
    const serviceUuids = [...new Set(
        allAds
            .filter(ad => ad.type === 'serviceData' && ad.serviceUuid) // (utils.js muss serviceUuid bereitstellen)
            .map(ad => ad.serviceUuid)
    )];

    if (serviceUuids.length > 0) {
        diagLog(`[Handshake V13.3N] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        diagLog(`[Handshake V13.3N] KEINE Services gefunden für ${deviceLog.deviceName}. Fallback...`, 'warn');
        // V13.3N-FIX:
        requestOptions.acceptAllDevices = AppConfig.Bluetooth.HANDSHAKE_FALLBACK_ACCEPT_ALL;
    }

    try {
        diagLog(`[Handshake V13.3N] Fordere Gerät an mit Optionen: ${JSON.stringify(requestOptions)}`, 'bt');
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        diagLog(`[Handshake V13.3N] Erlaubnis erteilt für: ${device.name}`, 'bt');
        return device; 

    } catch (err) {
        diagLog(`[Handshake V13.3N] FEHLER: ${err.message}`, 'error');
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
             diagLog('Handshake vom Benutzer abgelehnt oder kein Gerät ausgewählt/gefunden.', 'warn');
        }
        return null; 
    }
}

/**
 * V11: Verbindet mit autorisiertem Gerät.
 * (V13.3N: Keine Änderungen, Logik ist stabil)
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
            // ... (V12.1 Code unverändert) ...
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

// ... (readCharacteristic, writeCharacteristic, startNotifications - unverändert) ...
export async function readCharacteristic(charUuid) {
    // ... (V12.1 Code unverändert) ...
}
export async function writeCharacteristic(charUuid, dataBuffer) {
    // ... (V12.1 Code unverändert) ...
}
export async function startNotifications(charUuid) {
    // ... (V12.1 Code unverändert) ...
}
 
