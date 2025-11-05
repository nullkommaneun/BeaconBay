/**
 * js/bluetooth.js (Version 3 - Mit GATT-Verbindungslogik)
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 3.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js, ui.js
 * * ZWECK:
 * 1. Kapselt die Web Bluetooth API (Scan & Connect).
 * 2. Verwaltet die 'deviceMap' als "Single Source of Truth"
 * für *rohe* BluetoothDevice-Objekte und *geparste* Daten.
 * 3. Implementiert Scan-, Connect- und Disconnect-Logik.
 */

import { diagLog } from './errorManager.js';
import { parseAdvertisementData } from './utils.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,      // GATT-Renderer
    showConnectingState, // "Verbinde..."-Ansicht
    showView             // Ansicht-Umschalter
} from './ui.js';

// === MODULE STATE ===

/**
 * Die "Single Source of Truth" für alle erkannten Geräte.
 * Struktur: Map { 'deviceId' => { 
 * deviceObject: BluetoothDevice, // Das rohe Objekt für .connect()
 * parsedData: object           // Die von utils.js geparsten Daten
 * } 
 * }
 * @type {Map<string, object>}
 */
let deviceMap = new Map();

/**
 * Timer für die Stale-Device-Prüfung.
 * @type {number | null}
 */
let staleCheckInterval = null;

/**
 * Hält das aktive Scan-Objekt (von requestLEScan).
 * @type {BluetoothLEScan | null}
 */
let activeScan = null;

/**
 * Hält die Referenz zum verbundenen GATT-Server.
 * @type {BluetoothRemoteGATTServer | null}
 */
let gattServer = null;

// === KONSTANTEN ===
const STALE_DEVICE_THRESHOLD_MS = 10000; // 10 Sekunden
const STALE_CHECK_INTERVAL_MS = 2000; // Alle 2 Sekunden

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Callback für 'advertisementreceived'.
 * Parst Daten, aktualisiert die deviceMap und weist die UI zum Rendern an.
 * @param {Event} event - Das Advertisement-Event.
 */
function handleAdvertisement(event) {
    try {
        const { device } = event; // Das rohe BluetoothDevice-Objekt
        const parsedData = parseAdvertisementData(event);
        if (!parsedData) {
            return; // Parser hat Daten verworfen
        }
        
        // Speichere das rohe Objekt UND die geparsten Daten
        deviceMap.set(device.id, {
            deviceObject: device, 
            parsedData: parsedData
        });
        
        // Gebe nur die geparsten Daten an die UI
        updateBeaconUI(device.id, parsedData);

    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

/**
 * Prüft periodisch auf "stale" Geräte.
 */
function checkStaleDevices() {
    const now = Date.now();
    deviceMap.forEach((data, deviceId) => {
        const timeSinceSeen = now - data.parsedData.lastSeen;
        if (timeSinceSeen > STALE_DEVICE_THRESHOLD_MS) {
            // UI anweisen, Karte als "stale" zu markieren
            setCardStale(deviceId);
        }
    });
}

/**
 * (Intern) Aufräumfunktion, die aufgerufen wird, wenn die
 * GATT-Verbindung (absichtlich oder unabsichtlich) getrennt wird.
 */
function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    gattServer = null;
    showView('beacon'); // Zurück zur Beacon-Ansicht
    // Setze Scan-Buttons zurück (falls der Scan vorher lief)
    setScanStatus(false);
}

// === PUBLIC API ===

/**
 * Initialisiert das Bluetooth-Modul (setzt Maps zurück).
 */
export function initBluetooth() {
    deviceMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Device-Map geleert).', 'bt');
}

/**
 * Startet den Web Bluetooth LE Scan.
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return;
    }
    setScanStatus(true);
    clearUI(); 
    deviceMap.clear(); 
    
    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        // WICHTIG: `acceptAllAdvertisements` erfordert oft ein
        // experimentelles Flag im Browser.
        activeScan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: true, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

        if (staleCheckInterval) clearInterval(staleCheckInterval);
        staleCheckInterval = setInterval(checkStaleDevices, STALE_CHECK_INTERVAL_MS);

    } catch (err) {
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
            diagLog('Scan vom Benutzer abgelehnt.', 'warn');
        } else {
            diagLog(`FEHLER beim Starten des Scans: ${err.message}`, 'error');
        }
        setScanStatus(false);
        activeScan = null;
    }
}

/**
 * Stoppt den Web Bluetooth LE Scan.
 */
export function stopScan() {
    // Listener entfernen!
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);

    if (activeScan && activeScan.active) {
        try {
            activeScan.stop(); // Die korrekte Stop-Methode
            diagLog('Bluetooth-Scan wurde gestoppt.', 'bt');
        } catch (err) {
            diagLog(`Fehler beim Stoppen des Scans: ${err.message}`, 'error');
        }
        activeScan = null;
    }
    // Stale-Checker stoppen
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }
    setScanStatus(false);
    diagLog('Scan-Ressourcen bereinigt.', 'bt');
}

/**
 * Verbindet sich mit einem Gerät über dessen ID und liest den GATT-Baum aus.
 * @param {string} deviceId - Die ID des Geräts aus der deviceMap.
 */
export async function connectToDevice(deviceId) {
    const deviceData = deviceMap.get(deviceId);
    if (!deviceData || !deviceData.deviceObject) {
        diagLog(`Verbindung fehlgeschlagen: Gerät ${deviceId} nicht gefunden.`, 'error');
        return;
    }

    // Scan stoppen (notwendig für Verbindung)
    if (activeScan && activeScan.active) {
        stopScan();
    }
    
    // UI in "Verbinde..."-Zustand versetzen
    showConnectingState(deviceData.parsedData.name);

    try {
        const device = deviceData.deviceObject;
        diagLog(`Verbinde mit ${device.name || device.id}...`, 'bt');
        
        // Trennungs-Listener hinzufügen
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        
        // Verbinden
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        // Services auslesen
        const services = await gattServer.getPrimaryServices();
        diagLog(`Services gefunden: ${services.length}`, 'bt');
        
        const gattTree = [];
        // Asynchron über alle Services iterieren
        for (const service of services) {
            const serviceData = {
                uuid: service.uuid,
                characteristics: []
            };

            // Characteristics für jeden Service auslesen
            try {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    serviceData.characteristics.push({
                        uuid: char.uuid,
                        properties: char.properties // (z.B. read, write, notify)
                    });
                }
            } catch (err) {
                diagLog(`Fehler beim Lesen der Characteristics für ${service.uuid}: ${err.message}`, 'warn');
            }
            gattTree.push(serviceData);
        }
        
        // Fertigen Baum an die UI übergeben
        renderGattTree(gattTree, device.name);

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect(); // Aufräumen
    }
}

/**
 * Trennt die aktive GATT-Verbindung.
 */
export function disconnect() {
    if (!gattServer) {
        diagLog('Keine aktive GATT-Verbindung zum Trennen.', 'warn');
        return;
    }
    
    // WIE: .disconnect() löst den 'gattserverdisconnected'-Event
    // aus, der dann onGattDisconnect() aufruft.
    gattServer.disconnect();
}
