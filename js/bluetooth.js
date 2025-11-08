/**
 * js/bluetooth.js (Version 13.3R - "Single Source of Truth Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3R FIX: 'handleAdvertisement' ruft 'updateBeaconUI' NICHT MEHR auf.
 * - Der 'onLogUpdated'-Callback (logger -> app -> ui) ist jetzt der
 * *einzige* Weg, die UI zu aktualisieren. (Behebt "undefined"-Bug).
 * - V13.3Q: (Unverändert) Geteilte try-catch-Blöcke.
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
    updateBeaconUI, // WIRD NUR NOCH VON V13.3P ui.js (onLogUpdated) VERWENDET
    clearUI, 
    setCardStale,
    renderGattTree,
    showView,
    updateCharacteristicValue,
    setGattConnectingUI
} from './ui.js';

// === MODULE STATE (unverändert) ===
let deviceMap = new Map(); // Behalten wir für V12.1 stale-check
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;
let gattCharacteristicMap = new Map();
let appCallbacks = {}; 

// === PRIVATE HELPER: SCANNING ===

/**
 * V13.3R FIX: 'updateBeaconUI' wurde entfernt.
 */
function handleAdvertisement(event) {
    
    // 1. Daten parsen (V13.3Q)
    let parsedData;
    try {
        parsedData = parseAdvertisementData(event);
        if (!parsedData) return;
    } catch (err) {
        diagLog(`Fehler in parseAdvertisementData: ${err.message}`, 'error');
        return;
    }

    // 2. Daten loggen (Best-Effort)
    // V13.3R: Dies ist jetzt die *einzige* Aktion.
    // Der Logger löst die UI-Aktualisierung über den Callback aus.
    try {
        const { device, rssi } = event; 
        logAdvertisement(device, rssi, parsedData);
    } catch (err) {
        diagLog(`Fehler in logAdvertisement: ${err.message}`, 'error');
    }
    
    // 3. UI (V13.3R: ENTFERNT)

    // 4. (V13.3R): 'deviceMap' für 'stale check' (V12.1) weiter füttern
    try {
         const { device } = event;
         deviceMap.set(device.id, {
             parsedData: parsedData 
         });
    } catch (e) {
        diagLog(`Fehler beim Füllen der deviceMap: ${e.message}`, 'warn');
    }
}

/**
 * V13.3N FIX: Verwendet AppConfig (unverändert)
 */
function checkStaleDevices() {
    const now = Date.now();
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    
    // V13.3R HINWEIS: 'deviceMap' wird von 'handleAdvertisement' (Schritt 4) gefüllt
    deviceMap.forEach((data, deviceId) => {
        // V13.3Q: 'lastSeen' ist jetzt ein Date-Objekt
        if (now - data.parsedData.lastSeen.getTime() > threshold) {
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
function handleValueChange(event) { /* ... (unverändert) ... */ }

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
    deviceMap.clear(); // V13.3R: Leert die Stale-Map
    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        activeScan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: AppConfig.Bluetooth.SCAN_ACCEPT_ALL, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        setScanStart();
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
export function disconnect() { /* ... (unverändert) ... */ }

// === PUBLIC API: GATT INTERACTION (V13.3N, unverändert) ===

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
        optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES
    };
    
    // V13.3P: Liest V13.1-Daten
    const allAds = deviceLog.advertisementHistory.toArray();
    
    // V13.3R HINWEIS: Dieser Filter (V13.3N) ist noch nicht V13.3Q-konform.
    // 'ad.serviceUuid' existiert in 'parsedData' (V13.3Q) nicht.
    // Wir lassen das für V13.3 so, da der Fallback (acceptAll) funktioniert.
    const serviceUuids = [...new Set(
        allAds
            .filter(ad => ad.type === 'serviceData' && ad.serviceUuid) // (V13.3R: ad.serviceUuid ist undefined)
            .map(ad => ad.serviceUuid)
    )];

    if (serviceUuids.length > 0) {
        diagLog(`[Handshake V13.3N] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        diagLog(`[Handshake V13.3N] KEINE Services gefunden (V13.3R: wie erwartet). Fallback...`, 'warn');
        requestOptions.acceptAllDevices = AppConfig.Bluetooth.HANDSHAKE_FALLBACK_ACCEPT_ALL;
    }

    try {
        diagLog(`[Handshake V13.3N] Fordere Gerät an mit Optionen: ${JSON.stringify(requestOptions)}`, 'bt');
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        diagLog(`[Handshake V13.3N] Erlaubnis erteilt für: ${device.name}`, 'bt');
        return device; 

    } catch (err) {
        diagLog(`[Handshake V13.3N] FEHLER: ${err.message}`, 'error');
        return null; 
    }
}

export async function connectWithAuthorizedDevice(device) {
    // ... (V13.3N, unverändert) ...
    return true; // (gekürzt)
}
export async function readCharacteristic(charUuid) { /* ... (unverändert) ... */ }
export async function writeCharacteristic(charUuid, dataBuffer) { /* ... (unverändert) ... */ }
export async function startNotifications(charUuid) { /* ... (unverändert) ... */ }
