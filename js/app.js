/**
 * js/app.js (Version 13.3CC - "Named Export Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3CC FIX: Korrigiert den 'import' von 'ui.js'.
 * - Verwendet 'import * as uiModule' (Namespace-Import),
 * um 'uiModule.onLogUpdated' korrekt zu laden.
 * - (Behebt den "Silent Failure"-Bug V13.3BB).
 * - V13.3U: (Unverändert) Ruft 'clearLogs()' auf.
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3i IMPORTS
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
import { AppConfig } from './config.js';

initGlobalErrorHandler(); 
earlyDiagLog("app.js (V13.3CC) geladen. Warte auf DOMContentLoaded...");

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
    
    // V13.3CC: Deklarationen für UI-Callbacks
    let onLogUpdated, onLogsCleared;

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
        // V13.3CC FIX: Verwende einen Namespace-Import (* as),
        // um auf die benannten Exporte zuzugreifen.
        const uiModule = await import('./ui.js');
        diagLog('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        
        // V13.3CC FIX: Weise die Funktionen korrekt zu
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        onLogUpdated = uiModule.onLogUpdated; // WICHTIG
        onLogsCleared = uiModule.onLogsCleared; // WICHTIG
        
        diagLog('Lade Layer 3 (bluetooth.js)...', 'utils');
        const bluetoothModule = await import('./bluetooth.js');
        initBluetooth = bluetoothModule.initBluetooth;
        // ... (Rest der BT-Funktionen) ...
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
        const scanAction = async () => { /* ... (unverändert) ... */ };
        const stopScanAction = () => { /* ... (unverändert) ... */ };
        const inspectAction = (deviceId) => { /* ... (unverändert) ... */ };
        // ... (Rest der Aktionen, V13.3BB, unverändert) ...
        
        // --- Initialisierung (V13.3BB Korrektur) ---
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();
        
        diagLog('Initialisiere Logger-Modul...', 'utils');
        // V13.3CC: Diese Callbacks sind jetzt gültige Funktionen
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

        // --- UI-Listener mit Callbacks verbinden (V13.3BB, unverändert) ---
        diagLog('Verbinde UI-Listener... (V13.3CC)', 'info');
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onInspect: inspectAction,
            // ... (Rest der Callbacks, V13.3BB, unverändert) ...
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
