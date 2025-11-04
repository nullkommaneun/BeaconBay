/**
 * js/app.js
 * * ARCHITEKTUR-HINWEIS: Dies ist der Orchestrator (Layer 4).
 * * ABHÄNGIGKEITEN: errorManager.js (und später: browser, utils, ui, bluetooth)
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


// ===== 3. Alle anderen Module importieren (Platzhalter) =====
// Diese Module werden importiert, aber ihre Funktionen werden
// erst in initApp() aufgerufen.

// import { startKeepAlive, stopKeepAlive } from './browser.js';
// import { loadCompanyIDs } from './utils.js';
// import { setupUIListeners } from './ui.js';
// import { initBluetooth, startScan, stopScan } from './bluetooth.js';


/**
 * Die Haupt-Initialisierungsfunktion der Anwendung.
 * Wird aufgerufen, sobald das DOM vollständig geladen ist.
 */
async function initApp() {
    try {
        diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

        // ===== 4. Module initialisieren (in Reihenfolge) =====
        
        // 4.1. Bluetooth-Modul initialisieren (setzt internen Status zurück)
        // initBluetooth();

        // 4.2. Firmendaten laden (asynchron)
        // Warten, bis die Herstellernamen geladen sind, bevor wir scannen.
        // await loadCompanyIDs();


        // ===== 5. Module verbinden (Dependency Inversion) =====

        // WIE: Callbacks definieren
        // app.js definiert die Aktionen. Die UI (ui.js) weiß nicht,
        // WAS passiert, wenn man auf "Scan" klickt, sie ruft nur
        // die ihr übergebene Callback-Funktion `onScan` auf.

        const scanAction = () => {
            diagLog("Aktion: Scan gestartet", "bt");
            // startKeepAlive(); // Verhindert Standby
            // startScan();      // Startet den BLE-Scan
        };

        const disconnectAction = () => {
            diagLog("Aktion: Scan gestoppt", "bt");
            // stopScan();
            // stopKeepAlive();
        };

        const sortAction = () => {
            diagLog("Aktion: UI Sortierung", "utils");
            // sortBeaconCards(); // (Funktion wird in ui.js implementiert)
        };

        const staleToggleAction = (isChecked) => {
            diagLog(`Aktion: Stale-Modus ${isChecked ? 'an' : 'aus'}`, 'utils');
            // setStaleMode(isChecked); // (Funktion wird in ui.js implementiert)
        };

        // 4.3. UI-Listener mit den Aktionen verbinden
        // Wir übergeben das Callback-Objekt an das UI-Modul.
        /*
        setupUIListeners({
            onScan: scanAction,
            onDisconnect: disconnectAction,
            onSort: sortAction,
            onStaleToggle: staleToggleAction
        });
        */
        
        diagLog('BeaconBay ist bereit.', 'info');

        // ===== 6. HERZSCHLAG SETZEN (WICHTIG) =====
        // WARUM: Dies ist der letzte Schritt im try-Block.
        // Wenn wir diesen Punkt erreichen, ist die App erfolgreich
        // initialisiert. Der Watchdog in index.html wird beruhigt.
        window.__app_heartbeat = true;

    } catch (err) {
        // FATALER FEHLER: Wenn die Initialisierung selbst fehlschlägt.
        diagLog(`FATALER APP-INIT-FEHLER: ${err.message}`, 'error');
        // Der Heartbeat bleibt 'false', und der Watchdog wird auslösen.
    }
}


// ===== 7. Anwendung starten =====
// WARUM: 'DOMContentLoaded'
// Wir warten, bis das HTML-Dokument vollständig geparst wurde,
// bevor wir versuchen, auf DOM-Elemente (wie #diag-log-panel) zuzugreifen.
window.addEventListener('DOMContentLoaded', initApp);
