/**
 * js/app.js (Version 13.3U/BB - "Callback-Verkabelung Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3BB FIX: Dies ist die V13.3U-Version, die die
 * 'onLogUpdated' und 'onLogsCleared'-Callbacks von 'ui.js'
 * korrekt an 'initLogger()' übergibt.
 * - (Behebt den "Silent Failure"-Bug, bei dem keine Geräte
 * angezeigt wurden, weil die UI nie benachrichtigt wurde).
 * - V13.3U: (Unverändert) Ruft 'clearLogs()' auf (V13.3U).
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

        // --- Callbacks definieren ---
        diagLog('Verbinde UI-Listener...', 'info');

        /**
         * V13.3U FIX: Ruft clearLogs() auf.
         */
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

        const stopScanAction = () => {
            diagLog("Aktion: Scan gestoppt (via app.js)", "bt");
            stopScan();
            stopKeepAlive();
        };
        
        const inspectAction = (deviceId) => {
            diagLog(`Aktion: Inspiziere ${deviceId.substring(0, 4)}...`, 'ui');
            const deviceLog = getDeviceLog(deviceId);
            if (deviceLog) {
                showInspectorView(deviceLog);
            } else {
                diagLog(`FEHLER: Konnte Log-Daten für ${deviceId} nicht finden.`, 'error');
            }
        };
        
        const gattConnectAction = async (deviceId) => {
            diagLog(`Aktion: GATT-Handshake für ${deviceId.substring(0, 4)}...`, 'bt');
            stopScan();
            stopKeepAlive();
            try {
                const authorizedDevice = await requestDeviceForHandshake(deviceId);
                if (!authorizedDevice) {
                    diagLog('Handshake vom Benutzer abgelehnt oder fehlgeschlagen. Starte Scan neu...', 'bt');
                    setGattConnectingUI(false, 'Handshake abgelehnt');
                    scanAction(); 
                    return; 
                }
                diagLog(`Handshake erfolgreich für ${authorizedDevice.name}. Verbinde...`, 'bt');
                const success = await connectWithAuthorizedDevice(authorizedDevice);
                if (!success) {
                    diagLog('Verbindung trotz Handshake fehlgeschlagen. Starte Scan neu...', 'bt');
                    scanAction(); 
                }
            } catch (err) {
                 diagLog(AppConfig.ErrorManager.MSG_CONNECTION_FAIL + ` (${err.message})`, 'error');
                 scanAction();
            }
        };
        
        const gattDisconnectAction = () => {
            diagLog('Aktion: Trenne GATT-Verbindung (via app.js)', 'bt');
            disconnect();
        };
        
        const gattUnexpectedDisconnectAction = () => {
            diagLog(AppConfig.ErrorManager.MSG_UNEXPECTED_DISCONNECT, 'warn');
            scanAction();
        };

        const readAction = (charUuid) => {
            diagLog(`Aktion: Lese Wert von ${charUuid}`, 'bt');
            readCharacteristic(charUuid);
        };
        
        const notifyAction = (charUuid) => {
            diagLog(`Aktion: Abonniere ${charUuid}`, 'bt');
            startNotifications(charUuid);
        };

        const modalWriteSubmitAction = (charUuid, value, type) => {
            // ... (V13.3U, unverändert) ...
            try {
                // ... (switch case, unverändert) ...
            } catch (e) {
                diagLog(`Ungültige Eingabe: ${e.message}`, 'error');
                alert(AppConfig.ErrorManager.MSG_GATT_FAIL + ` (Schreib-Eingabe: ${e.message})`);
            }
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

// Event Listener
window.addEventListener('DOMContentLoaded', initApp);
 
