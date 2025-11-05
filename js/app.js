/**
 * js/app.js (Version 9.5 - GATT-Stabilitätspatch)
 * * ARCHITEKTUR-HINWEIS:
 * - gattConnectAction ist jetzt 'async' und wartet auf das Ergebnis
 * von connectToDevice.
 * - Wenn connectToDevice 'false' zurückgibt (Verbindung fehlgeschlagen),
 * wird scanAction() automatisch aufgerufen, um den Scan neu zu starten
 * und die App stabil zu halten.
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
        
        /**
         * V9.5 PATCH: Wird 'async' gemacht, um auf das Ergebnis
         * von connectToDevice zu warten.
         * Stoppt den Scan, versucht zu verbinden. Wenn es fehlschlägt,
         * wird der Scan (scanAction) neu gestartet.
         */
        const gattConnectAction = async (deviceId) => { // 'async' hinzugefügt
            diagLog(`Aktion: Verbinde GATT für ${deviceId.substring(0, 4)}...`, 'bt');
            
            // 1. Scan stoppen (wie bisher)
            stopScan();
            stopKeepAlive();
            
            // 2. Bluetooth-Modul anweisen, zu verbinden UND auf Ergebnis warten
            const success = await connectToDevice(deviceId); // 'await' hinzugefügt
            
            // 3. V9.5 PATCH: Bei Misserfolg, Scan neu starten
            if (!success) {
                diagLog('GATT-Verbindung fehlgeschlagen. Starte Scan neu...', 'bt');
                
                // scanAction() startet den Scan neu UND bluetooth.js (startScan)
                // wird die UI (via showView('beacon')) zurücksetzen.
                scanAction(); 
            }
            // Wenn 'success' true ist, tun wir nichts. 
            // Der Benutzer ist dann verbunden und im Inspektor.
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
