/**
 * js/app.js (Version 2 - Selbst-diagnostizierend)
 * * ARCHITEKTUR-HINWEIS: Dies ist der Orchestrator (Layer 4).
 * * ZWECK:
 * 1. Dient als Einstiegspunkt.
 * 2. Nutzt DYNAMISCHE IMPORTE (await import()), um Lade- und
 * Syntaxfehler in Modulen abzufangen und im Diagnose-Panel
 * anzuzeigen. Dies löst das "Blinde-Fleck"-Problem von window.onerror.
 */

// Heartbeat für den Watchdog setzen
window.__app_heartheartbeat = false;

/**
 * Eine primitive Log-Funktion, die WÄHREND des Ladens funktioniert,
 * BEVOR der errorManager initialisiert ist.
 * @param {string} msg - Die Nachricht
 * @param {boolean} isError - Als Fehler formatieren?
 */
function earlyDiagLog(msg, isError = false) {
    try {
        const panel = document.getElementById('diag-log-panel');
        if (panel) {
            const entry = document.createElement('span');
            const level = isError ? 'log-error' : 'log-info';
            entry.className = `log-entry ${level}`;
            const timestamp = new Date().toLocaleTimeString('de-DE', { hour12: false });
            entry.textContent = `[${timestamp}] [BOOTSTRAP]: ${msg}`;
            panel.prepend(entry);
        } else {
            console.log(msg); // Fallback
        }
    } catch (e) {
        console.error("EarlyDiagLog FAILED:", e);
    }
}

/**
 * Die Haupt-Initialisierungsfunktion der Anwendung.
 */
async function initApp() {
    let diagLog, initGlobalErrorHandler;
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs;
    let setupUIListeners, sortBeaconCards, setStaleMode;
    let initBluetooth, startScan, stopScan;

    try {
        earlyDiagLog('App-Initialisierung wird gestartet (DOM content loaded)...');
        
        // ===== 4. MODULE DYNAMISCH LADEN (Fehlerabfang) =====
        // WIE: Jeder 'await import' wird einzeln ausgeführt.
        // Wenn einer fehlschlägt (404, Syntaxfehler), springt
        // der Code direkt in den 'catch'-Block und sagt uns,
        // welche Datei das Problem verursacht hat.
        
        earlyDiagLog('Lade Layer 0 (errorManager.js)...');
        const errorModule = await import('./errorManager.js');
        diagLog = errorModule.diagLog;
        initGlobalErrorHandler = errorModule.initGlobalErrorHandler;
        
        // Ab jetzt verwenden wir den echten diagLog
        diagLog('Globale Error-Handler werden installiert...', 'info');
        initGlobalErrorHandler();
        
        diagLog('Lade Layer 1 (browser.js)...', 'utils');
        const browserModule = await import('./browser.js');
        startKeepAlive = browserModule.startKeepAlive;
        stopKeepAlive = browserModule.stopKeepAlive;
        
        diagLog('Lade Layer 1 (utils.js)...', 'utils');
        const utilsModule = await import('./utils.js');
        loadCompanyIDs = utilsModule.loadCompanyIDs;
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        setupUIListeners = uiModule.setupUIListeners;
        // (Diese sind jetzt intern in ui.js, aber wir importieren sie zur Sicherheit)
        sortBeaconCards = uiModule.sortBeaconCards; 
        setStaleMode = uiModule.setStaleMode;
        
        diagLog('Lade Layer 3 (bluetooth.js)...', 'utils');
        const bluetoothModule = await import('./bluetooth.js');
        initBluetooth = bluetoothModule.initBluetooth;
        startScan = bluetoothModule.startScan;
        stopScan = bluetoothModule.stopScan;

        diagLog('Alle Module erfolgreich geladen.', 'info');

        // ===== 5. Module initialisieren (in Reihenfolge) =====
        
        diagLog('Initialisiere Bluetooth-Modul...', 'bt');
        initBluetooth();

        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();


        // ===== 6. Module verbinden (Dependency Inversion) =====
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = () => {
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            startKeepAlive();
            startScan();
        };

        const disconnectAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            stopScan();
            stopKeepAlive();
        };

        const sortAction = () => {
            diagLog("Aktion: UI Sortierung (via app.js)", "utils");
            // (ui.js handhabt dies jetzt intern)
        };

        const staleToggleAction = (isChecked) => {
            diagLog(`Aktion: Stale-Modus ${isChecked ? 'an' : 'aus'} (via app.js)`, 'utils');
            // (ui.js handhabt dies jetzt intern)
        };
        
        setupUIListeners({
            onScan: scanAction,
            onDisconnect: disconnectAction,
            onSort: sortAction,
            onStaleToggle: staleToggleAction
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');

        // ===== 7. HERZSCHLAG SETZEN (WICHTIG) =====
        window.__app_heartbeat = true;

    } catch (err) {
        // ===== DER WICHTIGSTE BLOCK =====
        // HIER landen alle 404-Fehler, Syntaxfehler und Import-Fehler.
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}. Prüfen Sie die Datei, die gerade geladen wurde (siehe Log oben). Es ist wahrscheinlich ein Syntaxfehler oder ein Tippfehler beim Import/Export.`;
        earlyDiagLog(errorMsg, true); // Log mit unserer Fallback-Funktion
        
        // (Wir loggen auch in der Konsole, falls das Panel selbst versagt)
        console.error(errorMsg);
        console.error(err);
    }
}

// ===== 8. Anwendung starten =====
window.addEventListener('DOMContentLoaded', initApp);

