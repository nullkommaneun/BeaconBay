/**
 * js/bluetooth.js (Version 13.3HH - "Module State Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3HH FIX: Stellt den gelöschten 'Module State' wieder her
 * (let activeScan, let gattServer, etc.).
 * - (Behebt "activeScan is not defined" ReferenceError beim Scan-Start).
 * - V13.3Z: (Unverändert) Loggt err.message im catch-Block.
 * - V13.3V: (Unverändert) Tippfehler 'HANDSHAKE_' korrigiert.
 * - V13.3U: (Unverändert) 'clearUI()' entfernt.
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

// === MODULE STATE (V13.3HH FIX: WIEDERHERGESTELLT) ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null; // V13.3HH: (War gelöscht)
let gattServer = null; // V13.3HH: (War gelöscht)
let gattCharacteristicMap = new Map(); // V13.3HH: (War gelöscht)
let appCallbacks = {}; // V13.3HH: (War gelöscht)

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
function checkStaleDevices() {
    const now = Date.now();
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen.getTime() > threshold) {
            setCardStale(deviceId);
        }
    });
}
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
export function initBluetooth(callbacks) {
    appCallbacks = callbacks; // V13.3HH: (Funktioniert jetzt)
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3Z: (unverändert)
 * V13.3HH: (Funktioniert jetzt, da 'activeScan' (V13.3HH) existiert)
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
        activeScan = null; // V13.3HH: (Funktioniert jetzt)
        return false; // V12.1
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
export async function requestDeviceForHandshake(deviceId) { /* ... (V13.3V, unverändert) ... */ }
export async function connectWithAuthorizedDevice(device) { /* ... (V13.3V, unverändert) ... */ }
export async function readCharacteristic(charUuid) { /* ... (V13.3V, unverändert) ... */ }
export async function writeCharacteristic(charUuid, dataBuffer) { /* ... (V13.3V, unverändert) ... */ }
export async function startNotifications(charUuid) { /* ... (V13.3V, unverändert) ... */ }
