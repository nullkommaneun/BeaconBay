/**
 * js/app.js (Version 13.3BB - "Callback-Verkabelung Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3BB FIX: Importiert 'onLogUpdated'/'onLogsCleared'
 * aus 'ui.js' und übergibt sie an 'initLogger()'.
 * - (Behebt den "Silent Failure"-Bug V13.3BB).
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3i IMPORTS
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
import { AppConfig } from './config.js';

initGlobalErrorHandler(); 
earlyDiagLog("app.js (V13.3BB) geladen. Warte auf DOMContentLoaded...");

async function initApp() {
    initErrorManager();
    diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

    // Deklarationen (V13.3U)
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let initLogger, getDeviceLog, generateLogFile, clearLogs; 

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
        clearLogs = loggerModule.clearLogs; 
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        diagLog('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        
        // V13.3BB FIX: Importiere die UI-Callbacks
        const { onLogUpdated, onLogsCleared } = uiModule;
        
        diagLog('Lade Layer 3 (bluetooth.js)...', 'utils');
        const bluetoothModule = await import('./bluetooth.js');
        initBluetooth = bluetoothModule.initBluetooth;
        startScan = bluetoothModule.startScan;
        stopScan = bluetoothModule.stopScan;
        requestDeviceForHandshake = bluetoothModule.requestDeviceForHandshake;
        connectWithAuthorizedDevice = bluetoothModule.connectWithAuthorizedDevice;
        disconnect = bluetoothModule.disconnect;
        readCharacteristic = bluetoothModule.readCharacteristic;
        startNotifications = bluetoothModule.startNotifications;
        writeCharacteristic = bluetoothModule.writeCharacteristic; 

        diagLog('Alle Module erfolgreich geladen.', 'info');

        // --- Callbacks definieren (V13.3U, unverändert) ---
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = async () => { 
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
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
        const stopScanAction = () => { /* ... (unverändert) ... */ };
        const inspectAction = (deviceId) => {
            diagLog(`Aktion: Inspiziere ${deviceId.substring(0, 4)}...`, 'ui');
            const deviceLog = getDeviceLog(deviceId);
            if (deviceLog) {
                showInspectorView(deviceLog);
            } else {
                diagLog(`FEHLER: Konnte Log-Daten für ${deviceId} nicht finden.`, 'error');
            }
        };
        const gattConnectAction = async (deviceId) => { /* ... (unverändert) ... */ };
        const gattDisconnectAction = () => { /* ... (unverändert) ... */ };
        const gattUnexpectedDisconnectAction = () => { /* ... (unverändert) ... */ };
        const readAction = (charUuid) => { /* ... (unverändert) ... */ };
        const notifyAction = (charUuid) => { /* ... (unverändert) ... */ };
        const modalWriteSubmitAction = (charUuid, value, type) => { /* ... (unverändert) ... */ };
        const downloadAction = () => { /* ... (unverändert) ... */ };
        const viewToggleAction = () => { /* ... (unverändert) ... */ };
        
        // --- Initialisierung (V13.3BB Korrektur) ---
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();
        
        diagLog('Initialisiere Logger-Modul...', 'utils');
        // V13.3BB FIX: Übergib die UI-Callbacks an den Logger
        initLogger({
            diagLog: diagLog,
            onLogUpdated: onLogUpdated, 
            onLogsCleared: onLogsCleared
        }); 
        
        diagLog('Initialisiere Bluetooth-Modul...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 

        // --- UI-Listener mit Callbacks verbinden ---
        diagLog('Verbinde UI-Listener... (V13.3BB)', 'info');
        
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onInspect: inspectAction,
            onGattConnect: gattConnectAction,
            onGattDisconnect: gattDisconnectAction,
            onViewToggle: viewToggleAction,
            onRead: readAction,
            onNotify: notifyAction,
            onModalWriteSubmit: modalWriteSubmitAction, 
            onDownload: downloadAction,
            onGetDeviceLog: getDeviceLog, 
            onSort: () => { diagLog("Sortieren (noch nicht implementiert)", "ui"); }, 
            onStaleToggle: () => {}
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        diagLog(errorMsg, 'error');
        console.error(errorMsg, err);
    }
}

window.addEventListener('DOMContentLoaded', initApp);
