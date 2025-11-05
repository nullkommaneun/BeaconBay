/**
 * js/bluetooth.js (Version 6 - Mit Logger-Integration)
 * * ARCHITEKTUR-HINWEIS:
 * - Importiert das neue logger.js Modul.
 * - Ruft logger.init() beim Start auf.
 * - Ruft logger.setScanStart() beim Scan-Start auf.
 * - Ruft logger.logAdvertisement(event) für JEDES Paket.
 */

import { diagLog } from './errorManager.js';
import { parseAdvertisementData } from './utils.js';
// NEU: Logger importieren
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
        // === NEUE LOGIK: Logger füttern ===
        // Wir übergeben das ROHE Event an den Logger,
        // damit er *alle* Daten hat (auch die, die wir nicht parsen).
        logAdvertisement(event);
        
        const { device, connectable } = event;
        const parsedData = parseAdvertisementData(event);
        if (!parsedData) return; 
        
        parsedData.isConnectable = connectable;
        
        deviceMap.set(device.id, {
            deviceObject: device,
            parsedData: parsedData
        });
        
        updateBeaconUI(device.id, parsedData);
    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

function checkStaleDevices() { /* ... (Keine Änderung) ... */ }
function onGattDisconnect() { /* ... (Keine Änderung) ... */ }
function handleValueChange(event) { /* ... (Keine Änderung) ... */ }

// === PUBLIC API: SCAN & BASE CONNECT ===

export function initBluetooth() {
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    
    // NEU: Logger ebenfalls initialisieren
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
        
        // NEU: Dem Logger sagen, dass der Scan jetzt läuft
        setScanStart();
        
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
        staleCheckInterval = setInterval(checkStaleDevices, STALE_CHECK_INTERVAL_MS);
    } catch (err) {
        diagLog(err.name === 'NotAllowedError' ? 'Scan vom Benutzer abgelehnt.' : `Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null;
    }
}

export function stopScan() { /* ... (Keine Änderung) ... */ }
export function disconnect() { /* ... (Keine Änderung) ... */ }

// === PUBLIC API: GATT INTERACTION ===
export async function connectToDevice(deviceId) { /* ... (Keine Änderung) ... */ }
export async function readCharacteristic(charUuid) { /* ... (Keine Änderung) ... */ }
export async function startNotifications(charUuid) { /* ... (Keine Änderung) ... */ }
