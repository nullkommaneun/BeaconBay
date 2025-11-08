/**
 * js/bluetooth.js (Version 13.3AA - "Module State Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3AA FIX: Stellt den gelöschten 'Module State' wieder her
 * (let activeScan, let gattServer, etc.).
 * - (Behebt "activeScan is not defined" ReferenceError).
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

// === MODULE STATE (V13.3AA FIX: WIEDERHERGESTELLT) ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null; 
let gattServer = null; 
let gattCharacteristicMap = new Map();
let appCallbacks = {}; 

// === PRIVATE HELPER (V13.3U, unverändert) ===
function handleAdvertisement(event) {
    let parsedData;
    try {
        parsedData = parseAdvertisementData(event);
        if (!parsedData) return;
    } catch (err) {
        diagLog(`Fehler in parseAdvertisementData: ${err.message}`, 'error');
        return;
    }
    try {
        const { device, rssi } = event; 
        logAdvertisement(device, rssi, parsedData);
    } catch (err) {
        diagLog(`Fehler in logAdvertisement: ${err.message}`, 'error');
    }
    try {
         const { device } = event;
         deviceMap.set(device.id, {
             parsedData: parsedData 
         });
    } catch (e) {
        diagLog(`Fehler beim Füllen der deviceMap: ${e.message}`, 'warn');
    }
}
function checkStaleDevices() { /* ... (V13.3U, unverändert) ... */ }
function onGattDisconnect() { /* ... (V13.3U, unverändert) ... */ }
function handleValueChange(event) { /* ... (V13.3U, unverändert) ... */ }

// === PUBLIC API: SCAN & BASE CONNECT ===
export function initBluetooth(callbacks) {
    appCallbacks = callbacks;
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3Z/AA (Funktioniert jetzt)
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return true;
    }
    
    showView('beacon');
    setScanStatus(true);
    deviceMap.clear();
    
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
        diagLog(`Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null;
        return false; // V12.1
    }
}

export function stopScan() { /* ... (V13.3AA, unverändert) ... */ }
export function disconnect() { /* ... (V13.3AA, unverändert) ... */ }

// === PUBLIC API: GATT INTERACTION ===
export async function requestDeviceForHandshake(deviceId) { /* ... (V13.3V, unverändert) ... */ }
export async function connectWithAuthorizedDevice(device) { /* ... (V13.3V, unverändert) ... */ }
export async function readCharacteristic(charUuid) { /* ... (V13.3V, unverändert) ... */ }
export async function writeCharacteristic(charUuid, dataBuffer) { /* ... (V1t3.3V, unverändert) ... */ }
export async function startNotifications(charUuid) { /* ... (V13.3V, unverändert) ... */ }
