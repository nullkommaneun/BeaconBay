/**
 * js/bluetooth.js (Version 13.3Z - "Logging Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3Z FIX: 'startScan()' loggt jetzt den 'err.message'
 * (statt 'err.name') im 'catch'-Block (V13.3Y).
 * - (Behebt das "stille" Scheitern, falls V13.3V nicht funktioniert).
 * - V13.3V: (Unverändert) Tippfehler 'HANDSHAKE_' korrigiert.
 * - V13.3U: (Unverändert) 'clearUI()' entfernt.
 */

// V13.3N-IMPORTS (unverändert)
import { AppConfig } from './config.js';
import { diagLog } from './errorManager.js';
// ... (Rest der Imports, V13.3U, unverändert) ...
import { 
    setScanStatus, 
    // ...
} from './ui.js';

// === MODULE STATE (V13.3U, unverändert) ===
let deviceMap = new Map();
// ... (Rest des State, unverändert) ...

// === PRIVATE HELPER (V13.3U, unverändert) ===
function handleAdvertisement(event) { /* ... */ }
function checkStaleDevices() { /* ... */ }
function onGattDisconnect() { /* ... */ }
function handleValueChange(event) { /* ... */ }

// === PUBLIC API: SCAN & BASE CONNECT ===
export function initBluetooth(callbacks) { /* ... (V13.3U, unverändert) ... */ }

/**
 * V13.3Z FIX: Loggt 'err.message' im catch-Block.
 * V13.3U: (Unverändert) 'clearUI()' entfernt.
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return true;
    }
    
    // V13.3V: 'setScanStatus' wird jetzt durch V13.3Z 'ui.js' abgesichert
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
        // V13.3Z FIX: Logge die *echte* Fehlermeldung,
        // (z.B. "Cannot read property 'disabled' of null")
        diagLog(`Scan-Fehler: ${err.message}`, 'error');
        
        setScanStatus(false);
        activeScan = null;
        return false; // V12.1
    }
}

// ... (stopScan, disconnect - V13.3U, unverändert) ...
export function stopScan() { /* ... */ }
export function disconnect() { /* ... */ }

// === PUBLIC API: GATT INTERACTION ===
export async function requestDeviceForHandshake(deviceId) { /* ... (V13.3V, unverändert) ... */ }
export async function connectWithAuthorizedDevice(device) { /* ... (V13.3V, unverändert) ... */ }
export async function readCharacteristic(charUuid) { /* ... (V13.3V, unverändert) ... */ }
export async function writeCharacteristic(charUuid, dataBuffer) { /* ... (V13.3V, unverändert) ... */ }
export async function startNotifications(charUuid) { /* ... (V13.3V, unverändert) ... */ }
