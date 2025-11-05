/**
 * js/app.js (Version 6 - Mit Fehler-Trace-Route)
 * * ARCHITEKTUR-HINWEIS: Layer 4, der Orchestrator.
 * * ZWECK:
 * 1. Dient als einziger Einstiegspunkt.
 * 2. Nutzt DYNAMISCHE IMPORTE (await import()), um Lade- und
 * Syntaxfehler in Modulen abzufangen und im Diagnose-Panel
 * anzuzeigen.
 * 3. Verbindet alle Module per Dependency Inversion (Callbacks).
 * 4. Enthält [TRACE]-Logs, um den Klick-Pfad zu debuggen.
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
    let initBluetooth, startScan, stopScan, connectToDevice, disconnect,
        readCharacteristic, startNotifications;
    let generateLogFile; 

    try {
        earlyDiagLog('App-Initialisierung wird gestartet (DOM content loaded)...');
        
        // --- Dynamisches Laden der Module ---
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
        
        diagLog('Lade Layer 1 (logger.js)...', 'utils');
        const loggerModule = await import('./logger.js');
        generateLogFile = loggerModule.generateLogFile;
        
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
        readCharacteristic = bluetoothModule.readCharacteristic;
        startNotifications = bluetoothModule.startNotifications;

        diagLog('Alle Module erfolgreich geladen.', 'info');

        // --- Initialisierung ---
        diagLog('Initialisiere Bluetooth-Modul (und Logger)...', 'bt');
        initBluetooth(); // Ruft intern initLogger() auf
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();

        // --- Callbacks definieren (Dependency Inversion) ---
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = () => {
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            startKeepAlive();
            startScan();
        };

        const stopScanAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            stopScan();
            stopKeepAlive();
        };
        
        const connectAction = (deviceId) => {
            // ==== [TRACE 5] ====
            // Kommt der Klick hier an?
            diagLog(`[TRACE] app.js: connectAction für ${deviceId.substring(0, 4)}... empfangen.`, 'bt');
            stopKeepAlive();
            connectToDevice(deviceId); // Leitet an bluetooth.js weiter
        };
        
        const gattDisconnectAction = () => {
            diagLog('Aktion: Trenne GATT-Verbindung (via app.js)', 'bt');
            disconnect();
        };

        const readAction = (charUuid) => {
            diagLog(`Aktion: Lese Wert von ${charUuid}`, 'bt');
            readCharacteristic(charUuid);
        };
        
        const notifyAction = (charUuid) => {
            diagLog(`Aktion: Abonniere ${charUuid}`, 'bt');
            startNotifications(charUuid);
        };
        
        const downloadAction = () => {
            diagLog("Aktion: Download Log (via app.js)", "utils");
            generateLogFile();
        };

        // --- UI-Listener mit Callbacks verbinden ---
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onConnect: connectAction,
            onGattDisconnect: gattDisconnectAction,
            onRead: readAction,
            onNotify: notifyAction,
            onDownload: downloadAction,
            onSort: () => {}, // Wird von ui.js intern gehandhabt
            onStaleToggle: () => {} // Wird von ui.js intern gehandhabt
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');

        // ===== 7. HERZSCHLAG SETZEN (WICHTIG) =====
        window.__app_heartbeat = true;

    } catch (err) {
        // Fängt Lade- oder Initialisierungsfehler ab
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        earlyDiagLog(errorMsg, true);
        console.error(errorMsg, err);
    }
}

// ===== 8. Anwendung starten =====
window.addEventListener('DOMContentLoaded', initApp);
