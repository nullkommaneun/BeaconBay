/**
 * js/app.js (Version 9.4 - Keep-Alive-Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - Behebt den "Scan-Tod" (Bug 1) durch Implementierung eines "Scan-Re-Triggers".
 * - scanAction startet jetzt ein Intervall, das den Scan alle 4 Minuten
 * proaktiv stoppt und neu startet, um den OS-Stromsparmodus zu umgehen.
 * - Dieses Intervall wird von stopScanAction und gattConnectAction sauber beendet.
 */

// Heartbeat
window.__app_heartbeat = false;

// V9.4 PATCH: Intervall für den proaktiven Scan-Neustart
let scanRestartInterval = null;
const SCAN_RESTART_INTERVAL_MS = 4 * 60 * 1000; // 4 Minuten

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

        /**
         * V9.4 PATCH: Startet jetzt den Scan-Re-Trigger.
         */
        const scanAction = () => {
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            startKeepAlive();
            startScan(); // Startet den Scan (wie bisher)
            
            // V9.4 PATCH: Starte den Re-Trigger
            if (scanRestartInterval) clearInterval(scanRestartInterval);
            
            scanRestartInterval = setInterval(() => {
                diagLog("Aktion: Proaktiver Scan-Neustart (Keep-Alive V9.4)", "bt");
                // Rufe die Funktionen direkt auf, um einen sauberen Neustart zu erzwingen
                stopScan(); 
                setTimeout(() => {
                    startScan(); 
                }, 500); // 500ms Pause
            }, SCAN_RESTART_INTERVAL_MS);
        };

        /**
         * V9.4 PATCH: Stoppt jetzt auch den Scan-Re-Trigger.
         */
        const stopScanAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            
            // V9.4 PATCH: Stoppe den Re-Trigger
            if (scanRestartInterval) {
                clearInterval(scanRestartInterval);
                scanRestartInterval = null;
            }
            
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
        
        /**
         * V9.4 PATCH: Stoppt jetzt auch den Scan-Re-Trigger.
         */
        const gattConnectAction = (deviceId) => {
            diagLog(`Aktion: Verbinde GATT für ${deviceId.substring(0, 4)}...`, 'bt');

            // V9.4 PATCH: Stoppe den Re-Trigger, wenn wir verbinden
            if (scanRestartInterval) {
                clearInterval(scanRestartInterval);
                scanRestartInterval = null;
            }

            // 1. JETZT den Scan stoppen
            stopScan();
            stopKeepAlive();
            // 2. Bluetooth-Modul anweisen, zu verbinden
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

        const viewToggleAction = () => {
            diagLog("Aktion: Wechsle zur Beacon-Ansicht", "ui");
            showView('beacon');
            disconnect();
            
            // HINWEIS: Wir starten den Scan HIER NICHT neu, da 'stopScanAction'
            // (das den Re-Trigger stoppt) beim Verbinden aufgerufen wird.
            // Der Scan sollte im Hintergrund weiterlaufen, wenn er nicht
            // für eine GATT-Verbindung gestoppt wurde.
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
            onGetDeviceLog: getDeviceLog, // (Für V9.2 UI-Patch)
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
