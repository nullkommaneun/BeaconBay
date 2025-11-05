/**
 * js/app.js (Version 3 - Selbst-diagnostizierend & GATT-fähig)
 * * ARCHITEKTUR-HINWEIS: Dies ist der Orchestrator (Layer 4).
 * * ABHÄNGIGKEITEN: Alle Module (dynamisch geladen).
 * * ZWECK:
 * 1. Dient als einziger Einstiegspunkt.
 * 2. Nutzt DYNAMISCHE IMPORTE (await import()), um Lade- und
 * Syntaxfehler in Modulen abzufangen und im Diagnose-Panel
 * anzuzeigen.
 * 3. Verbindet alle Module per Dependency Inversion (Callbacks).
 */

// Heartbeat für den Watchdog in index.html
window.__app_heartbeat = false;

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
            entry.className = `log-entry ${isError ? 'log-error' : 'log-bootstrap'}`;
            const timestamp = new Date().toLocaleTimeString('de-DE', { hour12: false });
            entry.textContent = `[${timestamp}] [BOOTSTRAP]: ${msg}`;
            panel.prepend(entry);
        } else {
            console.log(msg); // Fallback
        }
    } catch (e) { console.error("EarlyDiagLog FAILED:", e); }
}

/**
 * Die Haupt-Initialisierungsfunktion der Anwendung.
 * Wird nach DOMContentLoaded aufgerufen.
 */
async function initApp() {
    // Variablen für die geladenen Modul-Funktionen
    let diagLog, initGlobalErrorHandler;
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs;
    let setupUIListeners;
    let initBluetooth, startScan, stopScan, connectToDevice, disconnect;

    try {
        earlyDiagLog('App-Initialisierung wird gestartet (DOM content loaded)...');
        
        // ===== 4. MODULE DYNAMISCH LADEN (Fehlerabfang) =====
        // WIE: Jeder 'await import' ist ein Promise. Schlägt er fehl
        // (404, Syntaxfehler), springt der Code in den catch-Block.
        
        earlyDiagLog('Lade Layer 0 (errorManager.js)...');
        const errorModule = await import('./errorManager.js');
        diagLog = errorModule.diagLog;
        initGlobalErrorHandler = errorModule.initGlobalErrorHandler;
        
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
        
        diagLog('Lade Layer 3 (bluetooth.js)...', 'utils');
        const bluetoothModule = await import('./bluetooth.js');
        initBluetooth = bluetoothModule.initBluetooth;
        startScan = bluetoothModule.startScan;
        stopScan = bluetoothModule.stopScan;
        connectToDevice = bluetoothModule.connectToDevice;
        disconnect = bluetoothModule.disconnect;

        diagLog('Alle Module erfolgreich geladen.', 'info');

        // ===== 5. Module initialisieren (in Reihenfolge) =====
        
        diagLog('Initialisiere Bluetooth-Modul...', 'bt');
        initBluetooth();

        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();


        // ===== 6. Module verbinden (Dependency Inversion) =====
        diagLog('Verbinde UI-Listener...', 'info');

        // Definition der Aktionen, die passieren, wenn die UI Events meldet.
        // Das UI-Modul ist "dumm" und weiß nichts von diesen Aktionen.

        const scanAction = () => {
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            startKeepAlive(); // Sagt browser.js, aktiv zu bleiben
            startScan();      // Sagt bluetooth.js, zu scannen
        };

        const stopScanAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            stopScan();
            stopKeepAlive();
        };
        
        /**
         * Wird von ui.js aufgerufen, wenn auf eine Karte geklickt wird.
         * @param {string} deviceId 
         */
        const connectAction = (deviceId) => {
            diagLog(`Aktion: Verbinde mit ${deviceId} (via app.js)`, 'bt');
            stopKeepAlive(); // Im GATT-Modus nicht nötig
            connectToDevice(deviceId); // Sagt bluetooth.js, zu verbinden
        };
        
        /**
         * Wird von ui.js aufgerufen (GATT Disconnect Button).
         */
        const gattDisconnectAction = () => {
            diagLog('Aktion: Trenne GATT-Verbindung (via app.js)', 'bt');
            disconnect(); // Sagt bluetooth.js, zu trennen
        };
        
        // Übergebe das Bündel von Aktionen an das UI-Modul.
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onConnect: connectAction,
            onGattDisconnect: gattDisconnectAction,
            onSort: () => {}, // Wird von ui.js intern gehandhabt
            onStaleToggle: () => {} // Wird von ui.js intern gehandhabt
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');

        // ===== 7. HERZSCHLAG SETZEN (WICHTIG) =====
        // Signal an den Watchdog in index.html, dass alles gut gelaufen ist.
        window.__app_heartbeat = true;

    } catch (err) {
        // ===== DER WICHTIGSTE BLOCK =====
        // Fängt 404-Fehler, Syntaxfehler und Import-Fehler.
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}. Prüfen Sie die Datei, die gerade geladen wurde (siehe Log oben).`;
        earlyDiagLog(errorMsg, true); // Log mit unserer Fallback-Funktion
        console.error(errorMsg, err);
    }
}

// ===== 8. Anwendung starten =====
window.addEventListener('DOMContentLoaded', initApp);
 
