/**
 * js/app.js (Version 9.3 - Architektur-Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - Behebt den "gattServer is not defined" ReferenceError.
 * - viewToggleAction ruft jetzt sauber die disconnect()-Funktion des Treibers auf.
 * - Fügt onGetDeviceLog-Callback für ui.js (V9.2) hinzu.
 */

// Heartbeat
window.__app_heartbeat = false;

function earlyDiagLog(msg, isError = false) {
    try {
        const panel = document.getElementById('diag-log-panel');
        if (panel) {
            const entry = document.createElement('span');
            entry.className = `log-entry ${isError ? 'log-error' : 'log-bootstrap'}`;
            entry.textContent = `[${new Date().toLocaleTimeString('de-DE')}] [BOOTSTRAP]: ${msg}`;
            panel.prepend(entry);
        } else { console.log(msg); }
    } catch (e) { console.error("EarlyDiagLog FAILED:", e); }
}

async function initApp() {
    // Variablen für Modul-Funktionen
    let diagLog, initGlobalErrorHandler;
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs;
    let setupUIListeners, showInspectorView, showView; // UI-Funktionen
    let initBluetooth, startScan, stopScan, connectToDevice, disconnect,
        readCharacteristic, startNotifications; // Bluetooth-Funktionen
    let getDeviceLog, generateLogFile; // Logger-Funktionen

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
        getDeviceLog = loggerModule.getDeviceLog;
        generateLogFile = loggerModule.generateLogFile;
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        
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
        initBluetooth(); 
        
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
        
        const inspectAction = (deviceId) => {
            diagLog(`Aktion: Inspiziere ${deviceId.substring(0, 4)}... (Scan läuft)`, 'ui');
            const deviceLog = getDeviceLog(deviceId);
            if (deviceLog) {
                showInspectorView(deviceLog);
            } else {
                diagLog(`FEHLER: Konnte Log-Daten für ${deviceId} nicht finden.`, 'error');
            }
        };
        
        const gattConnectAction = (deviceId) => {
            diagLog(`Aktion: Verbinde GATT für ${deviceId.substring(0, 4)}...`, 'bt');
            stopScan();
            stopKeepAlive();
            connectToDevice(deviceId);
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

        /**
         * V9.3 PATCH: Behebt den ReferenceError.
         * Ruft jetzt sauber die 'disconnect'-Funktion des Treibers auf,
         * anstatt selbst 'gattServer' zu prüfen.
         */
        const viewToggleAction = () => {
            diagLog("Aktion: Wechsle zur Beacon-Ansicht", "ui");
            showView('beacon');
            
            // KORREKT: Sage dem Treiber (bluetooth.js), er soll die Verbindung trennen.
            // Der Treiber kümmert sich selbst darum, ob eine Verbindung besteht.
            disconnect();
        };

        // --- UI-Listener mit Callbacks verbinden ---
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onInspect: inspectAction,
            onGattConnect: gattConnectAction,
            onGattDisconnect: gattDisconnectAction,
            onViewToggle: viewToggleAction,
            onRead: readAction,
            onNotify: notifyAction,
            onDownload: downloadAction,
            
            /**
             * V9.3 PATCH: Hinzugefügt, da ui.js (V9.2) diesen Callback 
             * benötigt, um den Button-Status korrekt zurückzusetzen.
             */
            onGetDeviceLog: getDeviceLog,
            
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

window.addEventListener('DOMContentLoaded', initApp);
 
