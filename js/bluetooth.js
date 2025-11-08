/**
 * js/bluetooth.js (Version 13.3Q - "Robustness Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3Q FIX: Trennt 'logAdvertisement' und 'updateBeaconUI'
 * in 'handleAdvertisement' in separate try-catch-Blöcke.
 * - Ein Fehler im Logger (wie V13.3P) darf *niemals*
 * das UI-Update (V12.1) blockieren.
 * - V13.3N: (Unverändert) Verwendet AppConfig, korrigierte Imports.
 */

// V13.3N-IMPORTS (unverändert)
import { AppConfig } from './config.js';
import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js';
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

// === MODULE STATE (unverändert) ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;
let gattCharacteristicMap = new Map();
let appCallbacks = {}; 

// === KONSTANTEN ===
// V13.3N: (unverändert) Werte sind in AppConfig

// === PRIVATE HELPER: SCANNING ===

/**
 * V13.3Q FIX: Geteilte try-catch-Blöcke
 */
function handleAdvertisement(event) {
    
    // 1. Daten parsen (V13.3Q: liefert jetzt echtes Datum)
    // Dies kann fehlschlagen, wenn das Parsing scheitert
    let parsedData;
    try {
        const { device } = event; // Nur für den Fehlerfall
        parsedData = parseAdvertisementData(event);
        if (!parsedData) return; // (z.B. leeres Paket, von utils.js geloggt)
    } catch (err) {
        diagLog(`Fehler in parseAdvertisementData: ${err.message}`, 'error');
        return; // Abbruch, wenn Parsen fehlschlägt
    }

    // 2. Daten loggen (Best-Effort)
    // V13.3Q: Separater Block. Wenn dies fehlschlägt,
    // (z.B. V13.3P-Fehler), läuft die UI trotzdem weiter.
    try {
        const { device, rssi } = event; 
        logAdvertisement(device, rssi, parsedData);
    } catch (err) {
        // (Dieser Fehler sollte dank V13.3Q utils.js-Fix nicht mehr auftreten)
        diagLog(`Fehler in logAdvertisement: ${err.message}`, 'error');
    }
    
    // 3. UI aktualisieren (Kritisch)
    // V13.3Q: Dieser Block wird jetzt *immer* erreicht,
    // solange das Parsen (Schritt 1) erfolgreich war.
    try {
        const { device } = event;
        deviceMap.set(device.id, {
            deviceObject: device, 
            parsedData: parsedData
        });
        
        updateBeaconUI(device.id, parsedData);
    } catch (err) {
        diagLog(`Fehler in updateBeaconUI: ${err.message}`, 'error');
    }
}

/**
 * V13.3N FIX: Verwendet AppConfig (unverändert)
 */
function checkStaleDevices() {
    const now = Date.now();
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen > threshold) {
            setCardStale(deviceId);
        }
    });
}

// ... (onGattDisconnect, handleValueChange - V13.3N, unverändert) ...
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
    // ... (unverändert)
}

// === PUBLIC API: SCAN & BASE CONNECT ===

/**
 * V13.3N FIX: (unverändert)
 */
export function initBluetooth(callbacks) {
    appCallbacks = callbacks; 
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3N FIX: Verwendet AppConfig (unverändert)
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
            acceptAllAdvertisements: AppConfig.Bluetooth.SCAN_ACCEPT_ALL, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        setScanStart(); // Markiert Scan-Startzeit im Logger
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
        
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

// ... (stopScan, disconnect - V13.3N, unverändert) ...
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
    // ... (unverändert)
}

// === PUBLIC API: GATT INTERACTION (V13.3N, unverändert) ===

/**
 * V13.3N FIX: (unverändert)
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
         diagLog(`[HandGATT-Verbindungsfehler: ${err.message}shake V13.3N] FEHLER: Konnte Log für ${deviceId} nicht finden.`, 'error');
         return null;
    }

    const requestOptions = {
        optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES
    };
    
    const allAds = deviceLog.advertisementHistory.toArray();
    
    // (V13.3N: Dieser Teil muss eventuell angepasst werden, 
    // falls utils.js 'serviceUuid' nicht korrekt füllt)
    const serviceUuids = [...new Set(
        allAds
            .filter(ad => ad.type === 'serviceData' && ad.serviceUuid)
            .map(ad => ad.serviceUuid)
    )];

    if (serviceUuids.length > 0) {
        diagLog(`[Handshake V13.3N] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        diagLog(`[Handshake V13.3N] KEINE Services gefunden für ${deviceLog.deviceName}. Fallback...`, 'warn');
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
 * V11/V13.3N: (unverändert)
 */
export async function connectWithAuthorizedDevice(device) {
    diagLog(`[TRACE] connectWithAuthorizedDevice(${device.name}) gestartet.`, 'bt');
    
    gattCharacteristicMap.clear();

    try {
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        const services = await gattServer.getPrimaryServices();
        // ... (Rest der Funktion, V13.3N, unverändert) ...
        
        return true; // Erfolg melden

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect(); 
        setGattConnectingUI(false, err.message); 
        
        return false; // Misserfolg melden
    }
}


// ... (readCharacteristic, writeCharacteristic, startNotifications - V13.3N, unverändert) ...
export async function readCharacteristic(charUuid) {
    // ... (unverändert)
}
export async function writeCharacteristic(charUuid, dataBuffer) {
    // ... (unverändert)
}
export async function startNotifications(charUuid) {
    // ... (unverändert)
}
 
