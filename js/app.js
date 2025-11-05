/**
 * js/app.js (Version 5 - Mit Logger-Integration)
 * * ARCHITEKTUR-HINWEIS:
 * - Importiert das neue 'logger.js'-Modul dynamisch.
 * - Definiert den 'onDownload'-Callback.
 * - Übergibt den Callback an setupUIListeners.
 */

// Heartbeat
window.__app_heartbeat = false;

function earlyDiagLog(msg, isError = false) { /* ... (Keine Änderung) ... */ }

async function initApp() {
    // Variablen für Modul-Funktionen
    let diagLog, initGlobalErrorHandler;
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs;
    let setupUIListeners;
    let initBluetooth, startScan, stopScan, connectToDevice, disconnect,
        readCharacteristic, startNotifications;
    // NEU: Logger-Funktion
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
        
        // NEU: Lade Layer 1 (logger.js)
        diagLog('Lade Layer 1 (logger.js)...', 'utils');
        const loggerModule = await import('./logger.js');
        generateLogFile = loggerModule.generateLogFile;
        // initLogger() wird von bluetooth.js aufgerufen, um Timing-Konflikte zu vermeiden
        
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
        // WICHTIG: initBluetooth() ruft jetzt intern initLogger() auf
        initBluetooth(); 
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();

        // --- Callbacks definieren (Dependency Inversion) ---
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = () => { /* ... (Keine Änderung) ... */ };
        const stopScanAction = () => { /* ... (Keine Änderung) ... */ };
        const connectAction = (deviceId) => { /* ... (Keine Änderung) ... */ };
        const gattDisconnectAction = () => { /* ... (Keine Änderung) ... */ };
        const readAction = (charUuid) => { /* ... (Keine Änderung) ... */ };
        const notifyAction = (charUuid) => { /* ... (Keine Änderung) ... */ };
        
        // NEU: Download-Callback
        const downloadAction = () => {
            diagLog("Aktion: Download Log (via app.js)", "utils");
            generateLogFile(); // Sagt logger.js, die Datei zu erstellen
        };

        // --- UI-Listener mit Callbacks verbinden ---
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onConnect: connectAction,
            onGattDisconnect: gattDisconnectAction,
            onRead: readAction,
            onNotify: notifyAction,
            onDownload: downloadAction, // NEU
            onSort: () => {},
            onStaleToggle: () => {}
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        earlyDiagLog(errorMsg, true);
        console.error(errorMsg, err);
    }
}

// ===== 8. Anwendung starten =====
window.addEventListener('DOMContentLoaded', initApp);
