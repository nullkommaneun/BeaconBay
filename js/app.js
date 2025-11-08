/**
 * js/app.js (Version 13.3P - "Refactor Complete")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3P FIX: Übergibt das vollständige Callback-Objekt
 * an setupUIListeners() (behebt "tote" Inspektor-Buttons).
 * - V13.3M: Initialisiert initLogger() korrekt.
 * - V13.3i: Synchronisiert mit errorManager.js (V13.3j).
 * - V12.3: (Unverändert) Lädt Company IDs VOR Bluetooth.
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3i IMPORTS
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
import { AppConfig } from './config.js';

// V11.5: Installiere globale Handler sofort
initGlobalErrorHandler(); 

// V11.5-FIX: Verwende earlyDiagLog für den frühestmöglichen Log-Punkt
earlyDiagLog("app.js (V13.3P) geladen. Warte auf DOMContentLoaded...");

async function initApp() {
    // V13.3i FIX: ErrorManager MUSS als ERSTES aufgerufen werden
    initErrorManager();
    
    diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

    // Deklarationen (V13.3M)
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let initLogger, getDeviceLog, generateLogFile; 

    try {
        // --- Dynamisches Laden der Module (V12.3) ---
        
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
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        diagLog('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        // V13.3P: Wir brauchen den Logger-Callback für die UI
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

        // --- Callbacks definieren (Dependency Inversion) ---
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = async () => { 
            diagLog("Aktion: Scan gestartet (via app.js)", "bt");
            try {
                const scanStarted = await startScan(); // V12.1
                if (scanStarted) {
                    startKeepAlive(); // V12.2
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
                 scanAction(); // Auto-Restart (V9.9)
            }
        };
        
        const gattDisconnectAction = () => {
            diagLog('Aktion: Trenne GATT-Verbindung (via app.js)', 'bt');
            disconnect();
        };
        
        const gattUnexpectedDisconnectAction = () => {
            diagLog(AppConfig.ErrorManager.MSG_UNEXPECTED_DISCONNECT, 'warn');
            scanAction(); // Auto-Restart (V9.9)
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
            diagLog(`Aktion: 'Modal-Schreiben' für ${charUuid}, Typ: ${type}, Wert: ${value}`, 'bt');
            
            if (value === null || value.trim() === "") {
                diagLog("Schreiben abgebrochen: Kein Wert.", 'ui');
                return;
            }

            let dataBuffer;
            try {
                switch (type) {
                    case 'hex':
                        dataBuffer = hexStringToArrayBuffer(value);
                        break;
                    case 'text':
                        const textEncoder = new TextEncoder();
                        dataBuffer = textEncoder.encode(value);
                        break;
                    case 'decimal':
                        const num = parseInt(value, 10);
                        if (isNaN(num) || num < 0 || num > 255) {
                            throw new Error("Dezimalwert muss zwischen 0 und 255 liegen (für 1 Byte).");
                        }
                        dataBuffer = new Uint8Array([num]).buffer;
                        break;
                    default:
                        throw new Error(`Unbekannter Schreib-Typ: ${type}`);
                }
                writeCharacteristic(charUuid, dataBuffer);
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
        
        // --- Initialisierung (V13.3P Korrektur) ---
        
        // V12.3 FIX: Lade IDs ZUERST
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();
        
        // V13.3M FIX: Initialisiere Logger
        diagLog('Initialisiere Logger-Modul...', 'utils');
        initLogger({
            diagLog: diagLog, // Für Log-Export-Fehler
            onLogUpdated: onLogUpdated, // V13.3P: UI-Callback
            onLogsCleared: onLogsCleared // V13.3P: UI-Callback
        }); 
        
        diagLog('Initialisiere Bluetooth-Modul...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 

        // --- UI-Listener mit Callbacks verbinden ---
        diagLog('Verbinde UI-Listener... (V13.3P)', 'info');
        
        // V13.3P FIX: Übergib die definierten Aktionen an die UI.
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
            onStaleToggle: () => {} // Wird intern von ui.js gehandhabt
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        diagLog(errorMsg, 'error');
        console.error(errorMsg, err);
    }
}

// Event Listener (V11.11 "DOM-Ready"-Fix)
window.addEventListener('DOMContentLoaded', initApp);
 
