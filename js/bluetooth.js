/**
 * js/bluetooth.js
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 3.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js, ui.js
 * * ZWECK:
 * 1. Kapselt die gesamte Web Bluetooth LE Scan-Logik.
 * 2. Verwaltet den Anwendungszustand ("Single Source of Truth")
 * der erkannten Geräte in einer `deviceMap`.
 * 3. Ruft `utils.js` auf, um Rohdaten zu parsen.
 * 4. Ruft `ui.js` auf, um die geparsten Daten zu rendern.
 * 5. Implementiert die "Stale-Device"-Logik (Erkennen inaktiver Geräte).
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
 * Speichert das *letzte* von utils.js geparste Geräteobjekt.
 * WIE: Map { 'deviceId-123' => deviceObject, ... }
 * @type {Map<string, object>}
 */
let deviceMap = new Map();

/**
 * Ein Timer (setInterval) zur Überprüfung auf veraltete ("stale") Geräte.
 * @type {number | null}
 */
let staleCheckInterval = null;

/**
 * Ein AbortController, um den Web Bluetooth Scan sauber zu beenden.
 * * WARUM: Die `requestLEScan`-API hat keine `stop()`-Methode.
 * Sie wird gestoppt, indem das Signal eines AbortControllers
 * ausgelöst wird, das beim Start übergeben wurde.
 * @type {AbortController | null}
 */
let scanController = null;

// === KONSTANTEN ===

/**
 * Zeit in Millisekunden, nach der ein Gerät als "stale" (veraltet)
 * gilt, wenn kein neues Advertisement empfangen wurde.
 * 10 Sekunden.
 */
const STALE_DEVICE_THRESHOLD_MS = 10000; // 10 Sekunden

/**
 * Intervall, in dem die `checkStaleDevices`-Funktion ausgeführt wird.
 */
const STALE_CHECK_INTERVAL_MS = 2000; // Alle 2 Sekunden

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Die Callback-Funktion, die bei *jedem* empfangenen Advertisement-Paket
 * vom Browser aufgerufen wird.
 *
 * @param {Event} event - Das 'advertisementreceived' Event.
 */
function handleAdvertisement(event) {
    try {
        // 1. Rohdaten an das Utility-Modul zum Parsen übergeben
        const device = parseAdvertisementData(event);
        if (!device) {
            // Parser hat entschieden, dass diese Daten nicht relevant sind
            return; 
        }

        // 2. Zustand aktualisieren (Single Source of Truth)
        // WICHTIG: 'device.id' ist die eindeutige ID des Geräts.
        deviceMap.set(device.id, device);

        // 3. UI-Modul anweisen, die Daten zu rendern
        // Das UI-Modul kümmert sich darum, ob die Karte neu
        // erstellt oder nur aktualisiert werden muss.
        updateBeaconUI(device.id, device);

    } catch (err) {
        diagLog(`Fehler in handleAdvertisement: ${err.message}`, 'error');
    }
}

/**
 * Überprüft periodisch die 'deviceMap' und markiert Geräte als "stale",
 * wenn sie zu lange nicht gesehen wurden.
 */
function checkStaleDevices() {
    const now = Date.now();
    
    // Gehe durch alle Geräte, die wir kennen
    deviceMap.forEach((device, deviceId) => {
        // Berechne die Zeit seit dem letzten Kontakt
        const timeSinceSeen = now - device.lastSeen;

        if (timeSinceSeen > STALE_DEVICE_THRESHOLD_MS) {
            // Gerät ist "stale".
            // Wir weisen das UI-Modul an, die Karte zu markieren.
            setCardStale(deviceId);
            
            // Optional: Alte Geräte aus der Map entfernen, um Speicher
            // freizugeben (z.B. nach 60 Sekunden).
            // if (timeSinceSeen > 60000) {
            //     deviceMap.delete(deviceId);
            // }
        }
    });
}


// === PUBLIC API ===

/**
 * Initialisiert das Bluetooth-Modul.
 * Wird von app.js beim Start aufgerufen.
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
 * Wird von app.js aufgerufen (ausgelöst durch UI-Callback).
 */
export async function startScan() {
    // 0. Prüfen, ob ein Scan bereits läuft
    if (scanController) {
        diagLog('Scan läuft bereits.', 'warn');
        return;
    }

    // 1. UI-Status aktualisieren (Buttons sperren/entsperren)
    // Wir übergeben den Befehl an das UI-Modul.
    setScanStatus(true);
    
    // 2. Alte UI-Karten und Zustände bereinigen
    clearUI(); // UI anweisen, alle Karten zu entfernen
    deviceMap.clear(); // Lokalen Zustand leeren
    
    // 3. Neuen AbortController erstellen
    scanController = new AbortController();

    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        
        // 4. Den Scan anfordern
        // * WARUM: `requestLEScan` statt `requestDevice`?
        // `requestDevice` öffnet einen Popup-Filter und verbindet sich
        // nur mit *einem* Gerät.
        // `requestLEScan` ist der "Hintergrund-Scanner". Er erlaubt uns,
        // *alle* Advertisements von *allen* Geräten zu empfangen,
        // ohne dass der Benutzer ein Gerät auswählen muss.
        // * WICHTIG: `acceptAllAdvertisements: true` erfordert eine
        // spezielle Berechtigung in Chrome (z.B. chrome://flags/#enable-experimental-web-platform-features).
        // Für iBeacons (Apple) müssen wir ggf. Filter setzen,
        // aber für eine "Workbench" ist `acceptAllAdvertisements` ideal.
        
        // (HINWEIS: Für iBeacons ist oft ein Filter nötig,
        // aber wir versuchen es für die Workbench mit `acceptAllAdvertisements`)
        const scanOptions = {
            acceptAllAdvertisements: true, 
            // Alternativ (strenger, funktioniert oft besser für iBeacons):
            // filters: [
            //     { services: ['battery_service'] }, // Beispiel
            //     { manufacturerData: { companyIdentifier: 0x004C } } // Apple
            // ]
        };

        const scan = await navigator.bluetooth.requestLEScan(scanOptions);
        
        // 5. Signal an den AbortController binden
        // Wenn `scanController.abort()` aufgerufen wird,
        // wird das 'signal' hier ausgelöst und der Scan stoppt.
        scan.signal.addEventListener('abort', () => {
            diagLog('Bluetooth-Scan wurde abgebrochen.', 'bt');
        });

        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');

        // 6. Event-Listener binden
        // 'advertisementreceived' wird jetzt für jedes Paket gefeuert.
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);

        // 7. Stale-Checking-Intervall starten
        if (staleCheckInterval) clearInterval(staleCheckInterval);
        staleCheckInterval = setInterval(checkStaleDevices, STALE_CHECK_INTERVAL_MS);

    } catch (err) {
        // Der häufigste Fehler: Benutzer klickt im Popup auf "Abbrechen".
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
            diagLog('Scan vom Benutzer abgelehnt oder kein Gerät ausgewählt.', 'warn');
        } else {
            // Echter Fehler (z.B. Bluetooth deaktiviert, API nicht unterstützt)
            diagLog(`FEHLER beim Starten des Scans: ${err.message}`, 'error');
        }
        
        // Scan fehlgeschlagen, UI zurücksetzen
        setScanStatus(false);
        scanController = null; // Wichtig: Controller zurücksetzen
    }
}

/**
 * Stoppt den Web Bluetooth LE Scan.
 * Wird von app.js aufgerufen (ausgelöst durch UI-Callback).
 */
export function stopScan() {
    // 1. Stoppe den Advertisement-Listener
    // WICHTIG: Listener entfernen, sonst feuert er weiter!
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);

    // 2. Stoppe den Scan mittels AbortController
    if (scanController) {
        try {
            scanController.abort(); // Löst das 'abort'-Signal aus
        } catch (err) {
            diagLog(`Fehler beim Abbrechen des Scans: ${err.message}`, 'error');
        }
        scanController = null;
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
    
    diagLog('Scan gestoppt und Ressourcen bereinigt.', 'bt');
}
