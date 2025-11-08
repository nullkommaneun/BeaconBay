/**
 * js/app.js (Version 13.3U - "Clear-Logik Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3U FIX: Importiert 'clearLogs' aus logger.js.
 * - V13.3U FIX: 'scanAction' ruft jetzt 'clearLogs()' auf.
 * - 'clearLogs()' löscht den Speicher UND (via V13.3P Callback)
 * die UI ('clearUI()'). Dies ist die "Single Source of Truth".
 * - V13.3P: (Unverändert) Callback-Verkabelung.
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3i IMPORTS
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
import { AppConfig } from './config.js';

initGlobalErrorHandler(); 
earlyDiagLog("app.js (V13.3U) geladen. Warte auf DOMContentLoaded...");

async function initApp() {
    initErrorManager();
    diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

    // Deklarationen (V13.3U: clearLogs hinzugefügt)
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let initLogger, getDeviceLog, generateLogFile, clearLogs; // V13.3U

    try {
        // --- Dynamisches Laden der Module ---
        
        diagLog('Lade Layer 1 (browser.js)...', 'utils');
        const browserModule = await import('./browser.js');
        startKeepAlive = browserModule.startKeepAlive;
        stopKeepAlive = browserModule.stopKeepAlive;
        
        diagLog('Lade Layer 1 (utils.js)...', 'utils');
        const utilsModule = await import('./utils.js');
        loadCompanyIDs = utilsModule.loadCompanyIDs;
        hexStringToArrayBuffer = utilsModule.hexStringToArrayBuffer; 
        
        diagLog('Lade Layer 1 (logger.js)...', 'utils');
        const loggerModule = await import('./logger.js');
        initLogger = loggerModule.initLogger; 
        getDeviceLog = loggerModule.getDeviceLog;
        generateLogFile = loggerModule.generateLogFile;
        clearLogs = loggerModule.clearLogs; // V13.3U
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        diagLog('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        // V13.3P: (Unverändert) Callbacks holen
        const { onLogUpdated, onLogsCleared } = uiModule;
        
        diagLog('Lade Layer 3 (bluetooth.js)...', 'utils');
        const bluetoothModule = await import('./bluetooth.js');
        // ... (bluetooth-Funktionen, unverändert)
        initBluetooth = bluetoothModule.initBluetooth;
        startScan = bluetoothModule.startScan;
        stopScan = bluetoothModule.stopScan;
        // ... (Rest)

        diagLog('Alle Module erfolgreich geladen.', 'info');

        // --- Callbacks definieren ---
        diagLog('Verbinde UI-Listener...', 'info');

        /**
         * V13.3U FIX: Ruft clearLogs() auf.
         */
        const scanAction = async () => { 
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            
            // V13.3U FIX: Lösche den Speicher (Logger),
            // was (via Callback) auch die UI (clearUI) löscht.
            clearLogs();
            
            try {
                const scanStarted = await startScan();
                if (scanStarted) {
                    startKeepAlive();
                } else {
                    diagLog(AppConfig.ErrorManager.MSG_SCAN_START_FAIL, 'warn');
                }
            } catch (err) {
                diagLog(AppConfig.ErrorManager.MSG_SCAN_START_FAIL + ` (${err.message})`, 'error');
            }
        };

        const stopScanAction = () => {
            // ... (unverändert)
        };
        
        /**
         * V13.3U: Dieser Code ist korrekt, er schlug nur fehl,
         * weil die Logs (deviceHistory) nicht mit der UI synchron waren.
         */
        const inspectAction = (deviceId) => {
            diagLog(`Aktion: Inspiziere ${deviceId.substring(0, 4)}...`, 'ui');
            const deviceLog = getDeviceLog(deviceId);
            if (deviceLog) {
                showInspectorView(deviceLog);
            } else {
                diagLog(`FEHLER: Konnte Log-Daten für ${deviceId} nicht finden. (V13.3U: Speicher war nicht synchron)`, 'error');
            }
        };
        
        // ... (Rest der Callbacks: gattConnect, gattDisconnect etc. V13.3P, unverändert) ...

        
        // --- Initialisierung (V13.3P Korrektur) ---
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();
        
        diagLog('Initialisiere Logger-Modul...', 'utils');
        initLogger({
            diagLog: diagLog,
            onLogUpdated: onLogUpdated, 
            onLogsCleared: onLogsCleared // V13.3P: WICHTIG
        }); 
        
        diagLog('Initialisiere Bluetooth-Modul...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 

        // --- UI-Listener mit Callbacks verbinden (V13.3P) ---
        diagLog('Verbinde UI-Listener... (V13.3U)', 'info');
        
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onInspect: inspectAction,
            // ... (Rest der Callbacks, V13.3P, unverändert) ...
            onGetDeviceLog: getDeviceLog, 
            onSort: () => { diagLog("Sortieren (noch nicht implementiert)", "ui"); }, 
            onStaleToggle: () => {}
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        // ... (Fehlerbehandlung, V13.3P, unverändert) ...
    }
}

// Event Listener
window.addEventListener('DOMContentLoaded', initApp);
 
