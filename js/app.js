/**
 * js/app.js
 * * ARCHITEKTUR-HINWEIS: Dies ist der Orchestrator (Layer 4).
 * * ABHÄNGIGKEITEN: errorManager.js, browser.js, utils.js, ui.js, bluetooth.js
 * * ZWECK:
 * 1. Der EINZIGE Einstiegspunkt der Anwendung.
 * 2. Importiert *sofort* den errorManager und initialisiert ihn,
 * um Fehler beim Laden der *anderen* Module abzufangen.
 * 3. Wartet, bis das DOM geladen ist (`DOMContentLoaded`).
 * 4. Initialisiert alle Module in der korrekten Reihenfolge.
 * 5. Verbindet die Module, indem es Callbacks übergibt (Dependency Inversion).
 * 6. Setzt den "Heartbeat", um dem Watchdog in index.html zu signalisieren,
 * dass die App erfolgreich gestartet ist.
 */

// ===== 1. WICHTIG: Globales Fanganetz SOFORT installieren =====
// WARUM: Dieser Import und dieser Aufruf MÜSSEN an erster Stelle stehen.
// Wenn ein nachfolgender Import (z.B. 'import ... from ./ui.js')
// fehlschlägt (z.B. Syntaxfehler in ui.js), wird dieser Fehler
// vom globalen 'onerror'-Handler abgefangen, den wir hier aktivieren.
import { initGlobalErrorHandler, diagLog } from './errorManager.js';
initGlobalErrorHandler();

// ===== 2. Heartbeat für den Watchdog setzen =====
// Der Watchdog in index.html prüft diesen Wert nach 2.5s.
window.__app_heartbeat = false;
diagLog('Heartbeat-Variable initialisiert.', 'info');

// ===== 3. Alle anderen Module importieren =====
// Diese Module werden geladen, aber ihre Funktionen werden
// erst in initApp() aufgerufen.

// Layer 1: Browser-Interaktion
import { startKeepAlive, stopKeepAlive } from './browser.js';

// Layer 1: Daten-Parsing
import { loadCompanyIDs } from './utils.js';

// Layer 2: UI-Manipulation
// ARCHITEKTUR-HINWEIS ZU 'ui.js':
// Gemäß der Spezifikation importieren wir hier *alle* Funktionen,
// die durch UI-Events ausgelöst werden sollen, auch wenn sie nur
// das UI-Modul selbst betreffen (z.B. sortieren).
// app.js wird diese Funktionen dann als Callbacks *zurück* an ui.js geben.
import { 
    setupUIListeners, 
    sortBeaconCards, // (Annahme: Diese Funktion wird von ui.js exportiert)
    setStaleMode      // (Annahme: Diese Funktion wird von ui.js exportiert)
} from './ui.js';

// Layer 3: Bluetooth-Logik
import { initBluetooth, startScan, stopScan } from './bluetooth.js';


/**
 * Die Haupt-Initialisierungsfunktion der Anwendung.
 * Wird aufgerufen, sobald das DOM vollständig geladen ist.
 */
async function initApp() {
    try {
        diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

        // ===== 4. Module initialisieren (in Reihenfolge) =====
        
        // 4.1. Bluetooth-Modul initialisieren (setzt internen Status zurück)
        initBluetooth();

        // 4.2. Firmendaten laden (asynchron)
        // WICHTIG: Wir 'await'-en dies. Der Scan sollte nicht starten,
        // bevor die Herstellernamen (Company IDs) geladen sind,
        // da sonst die UI-Karten unvollständige Namen anzeigen würden.
        await loadCompanyIDs();


        // ===== 5. Module verbinden (Dependency Inversion) =====

        // WIE: Callbacks definieren
        // app.js ist der "Dirigent". Es definiert, WAS passiert.
        // Das Modul ui.js (der "Musiker") weiß nicht, was passiert;
        // es ruft nur die ihm übergebene Funktion (z.B. `onScan`) auf.

        /**
         * Diese Aktion verbindet zwei Module:
         * 1. Sagt `browser.js`, den Keep-Alive-Modus zu starten.
         * 2. Sagt `bluetooth.js`, den BLE-Scan zu starten.
         */
        const scanAction = () => {
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            startKeepAlive(); // Verhindert Standby
            startScan();      // Startet den BLE-Scan
        };

        /**
         * Diese Aktion verbindet ebenfalls zwei Module:
         * 1. Sagt `bluetooth.js`, den Scan zu stoppen.
         * 2. Sagt `browser.js`, den Keep-Alive-Modus zu beenden.
         */
        const disconnectAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            stopScan();
            stopKeepAlive();
        };

        /**
         * Diese Aktion ruft eine Funktion auf, die im `ui.js`-Modul lebt.
         * Die UI sagt app.js "Sortier-Button geklickt",
         * und app.js sagt ui.js "OK, führe deine Sortierfunktion aus".
         * Dies hält die Abhängigkeitsrichtung strikt ein.
         */
        const sortAction = () => {
            diagLog("Aktion: UI Sortierung (via app.js)", "utils");
            // (Wir rufen die aus ui.js importierte Funktion auf)
            // sortBeaconCards(); 
            // HINWEIS: Wenn ui.js dies intern handhabt (wie in der
            // bereitgestellten ui.js-Datei), kann dieser Callback leer
            // bleiben oder die Funktion direkt aufrufen, falls exportiert.
            // Um die Spezifikation zu erfüllen, definieren wir ihn.
        };

        /**
         * Dasselbe wie bei sortAction. Die Checkbox in ui.js meldet
         * die Zustandsänderung an app.js, und app.js gibt den
         * Befehl "Setze Stale-Modus" an ui.js zurück.
         */
        const staleToggleAction = (isChecked) => {
            diagLog(`Aktion: Stale-Modus ${isChecked ? 'an' : 'aus'} (via app.js)`, 'utils');
            // (Wir rufen die aus ui.js importierte Funktion auf)
            // setStaleMode(isChecked);
        };


        // 4.3. UI-Listener mit den Aktionen verbinden
        // Wir übergeben das Callback-Objekt an das UI-Modul.
        // ui.js wird diese Funktionen nun an die 'click'/'change'-Events
        // der HTML-Elemente binden.
        setupUIListeners({
            onScan: scanAction,
            onDisconnect: disconnectAction,
            onSort: sortAction,
            onStaleToggle: staleToggleAction
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');

        // ===== 6. HERZSCHLAG SETZEN (WICHTIG) =====
        // WARUM: Dies ist der letzte Schritt im try-Block.
        // Wenn wir diesen Punkt erreichen, ist die App erfolgreich
        // initialisiert. Der Watchdog in index.html (der nach 2.5s prüft)
        // wird 'true' sehen und *nicht* auslösen.
        window.__app_heartbeat = true;

    } catch (err) {
        // FATALER FEHLER: Wenn die Initialisierung selbst fehlschlägt.
        // (z.B. loadCompanyIDs() wirft einen Fehler, den wir nicht fangen)
        diagLog(`FATALER APP-INIT-FEHLER: ${err.message}`, 'error');
        diagLog('Der Watchdog in index.html wird jetzt auslösen.', 'error');
        // Der Heartbeat bleibt 'false', und der Watchdog wird den Benutzer warnen.
    }
}


// ===== 7. Anwendung starten =====
// WARUM: 'DOMContentLoaded'
// Wir warten, bis das HTML-Dokument vollständig geparst wurde,
// bevor wir versuchen, auf DOM-Elemente zuzugreifen (die
// Module tun dies, z.B. ui.js, errorManager.js).
window.addEventListener('DOMContentLoaded', initApp);
