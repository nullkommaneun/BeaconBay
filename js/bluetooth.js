/**
 * js/bluetooth.js (Version 2 - KORRIGIERT)
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 3.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js, ui.js
 * * KORREKTUR:
 * - Entfernt die fehlerhafte AbortController-Logik.
 * - Verwendet stattdessen das von `requestLEScan` zurückgegebene
 * `BluetoothLEScan`-Objekt und dessen `.stop()`-Methode.
 */

// Importiere Abhängigkeiten
import { diagLog } from './errorManager.js';
import { parseAdvertisementData } from './utils.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale 
} from './ui.js';

// === MODULE STATE ===

/**
 * Die "Single Source of Truth" für alle erkannten Geräte.
 * @type {Map<string, object>}
 */
let deviceMap = new Map();

/**
 * Ein Timer (setInterval) zur Überprüfung auf veraltete ("stale") Geräte.
 * @type {number | null}
 */
let staleCheckInterval = null;

/**
 * Hält das aktive Scan-Objekt, das von `requestLEScan` zurückgegeben wird.
 * Wir brauchen dies, um `.stop()` darauf aufzurufen.
 * @type {BluetoothLEScan | null}
 */
let activeScan = null; // <-- KORREKTUR: Ersetzt 'scanController'

// === KONSTANTEN ===
const STALE_DEVICE_THRESHOLD_MS = 10000; // 10 Sekunden
const STALE_CHECK_INTERVAL_MS = 2000; // Alle 2 Sekunden

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Die Callback-Funktion, die bei *jedem* empfangenen Advertisement-Paket
 * vom Browser aufgerufen wird.
 */
function handleAdvertisement(event) {
    try {
        const device = parseAdvertisementData(event);
        if (!device) {
            return; 
        }
        deviceMap.set(device.id, device);
        updateBeaconUI(device.id, device);
    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

/**
 * Überprüft periodisch die 'deviceMap' und markiert Geräte als "stale".
 */
function checkStaleDevices() {
    const now = Date.now();
    deviceMap.forEach((device, deviceId) => {
        const timeSinceSeen = now - device.lastSeen;
        if (timeSinceSeen > STALE_DEVICE_THRESHOLD_MS) {
            setCardStale(deviceId);
        }
    });
}

// === PUBLIC API ===

/**
 * Initialisiert das Bluetooth-Modul.
 */
export function initBluetooth() {
    deviceMap.clear();
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }
    diagLog('Bluetooth-Modul initialisiert (Device-Map geleert).', 'bt');
}

/**
 * Startet den Web Bluetooth LE Scan.
 */
export async function startScan() {
    // 0. Prüfen, ob ein Scan bereits läuft
    if (activeScan && activeScan.active) { // <-- KORREKTUR
        diagLog('Scan läuft bereits.', 'warn');
        return;
    }

    // 1. UI-Status aktualisieren
    setScanStatus(true);
    
    // 2. Alte UI-Karten und Zustände bereinigen
    clearUI(); 
    deviceMap.clear(); 
    
    // 3. (AbortController-Logik entfernt)

    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        
        const scanOptions = {
            acceptAllAdvertisements: true, 
        };
        
        // 4. Den Scan anfordern
        // WICHTIG: Wir speichern das zurückgegebene Objekt in 'activeScan'
        activeScan = await navigator.bluetooth.requestLEScan(scanOptions); // <-- KORREKTUR
        
        // 5. (Fehlerhafte 'scan.signal.addEventListener'-Logik entfernt)
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');

        // 6. Event-Listener binden
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

        // 7. Stale-Checking-Intervall starten
        if (staleCheckInterval) clearInterval(staleCheckInterval);
        staleCheckInterval = setInterval(checkStaleDevices, STALE_CHECK_INTERVAL_MS);

    } catch (err) {
        // Dieser Block fängt jetzt "User canceled" (Ihr Log 20:15:12)
        // ODER andere Fehler (wie "Bluetooth is not available").
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
            diagLog('Scan vom Benutzer abgelehnt oder kein Gerät ausgewählt.', 'warn');
        } else {
            diagLog(`FEHLER beim Starten des Scans: ${err.message}`, 'error');
        }
        
        // Scan fehlgeschlagen, UI zurücksetzen
        setScanStatus(false);
        activeScan = null; // Wichtig: Zustand zurücksetzen
    }
}

/**
 * Stoppt den Web Bluetooth LE Scan.
 */
export function stopScan() {
    // 1. Stoppe den Advertisement-Listener
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);

    // 2. Stoppe den Scan, indem wir die .stop()-Methode aufrufen
    if (activeScan && activeScan.active) { // <-- KORREKTUR
        try {
            activeScan.stop(); // <-- KORREKTUR: Dies ist der korrekte Weg
            diagLog('Bluetooth-Scan wurde gestoppt.', 'bt');
        } catch (err) {
            diagLog(`Fehler beim Stoppen des Scans: ${err.message}`, 'error');
        }
        activeScan = null;
    } else {
        diagLog('Kein aktiver Scan zum Stoppen vorhanden.', 'warn');
    }

    // 3. Stoppe das Stale-Checking-Intervall
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }

    // 4. UI-Status zurücksetzen
    setScanStatus(false);
    
    diagLog('Scan-Ressourcen bereinigt.', 'bt');
}
 
