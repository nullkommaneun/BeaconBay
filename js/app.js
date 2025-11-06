/**
 * js/app.js (Version 11.5 - "Robuster Logger" Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - V11.5 FIX: Importiert 'errorManager.js' GANZ OBEN (global).
 * - Initialisiert 'diagLog' und 'initGlobalErrorHandler' sofort.
 * - Alle anderen Module werden jetzt *innerhalb* des try-Blocks
 * von initApp() geladen.
 * - Dies stellt sicher, dass, WENN ein Modul (wie ui.js)
 * beim Import abstürzt, wir den Fehler im Diagnose-Panel sehen.
 */

// Heartbeat
window.__app_heartbeat = false;

// V11.5 PATCH: Lade Logger SOFORT auf globaler Ebene.
import { diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
initGlobalErrorHandler(); // Installiere globale Handler sofort

/**
 * V11.5: Wrapper, da diagLog vielleicht noch nicht voll initialisiert ist,
 * aber earlyDiagLog sollte funktionieren.
 */
function appInitLogger(msg, level = 'bootstrap') {
    try {
        // Nutze das volle diagLog, wenn es bereits existiert
        diagLog(msg, level);
    } catch (e) {
        // Fallback auf das statische earlyDiagLog
        earlyDiagLog(msg, level === 'error');
    }
}

async function initApp() {
    appInitLogger('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

    // V11.5: Definiere Variablen hier
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let getDeviceLog, generateLogFile; 

    try {
        // --- Dynamisches Laden der Module ---
        // errorManager.js ist bereits geladen.
        
        appInitLogger('Lade Layer 1 (browser.js)...', 'utils');
        const browserModule = await import('./browser.js');
        startKeepAlive = browserModule.startKeepAlive;
        stopKeepAlive = browserModule.stopKeepAlive;
        
        appInitLogger('Lade Layer 1 (utils.js)...', 'utils');
        const utilsModule = await import('./utils.js');
        loadCompanyIDs = utilsModule.loadCompanyIDs;
        hexStringToArrayBuffer = utilsModule.hexStringToArrayBuffer; 
        
        appInitLogger('Lade Layer 1 (logger.js)...', 'utils');
        const loggerModule = await import('./logger.js');
        getDeviceLog = loggerModule.getDeviceLog;
        generateLogFile = loggerModule.generateLogFile;
        
        appInitLogger('Lade Layer 2 (ui.js)... (Potenzieller Absturzpunkt)', 'utils');
        const uiModule = await import('./ui.js'); // <-- Hier stürzt es wahrscheinlich ab
        appInitLogger('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        
        appInitLogger('Lade Layer 3 (bluetooth.js)...', 'utils');
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

        appInitLogger('Alle Module erfolgreich geladen.', 'info');

        // --- Callbacks definieren (Dependency Inversion) ---
        appInitLogger('Verbinde UI-Listener...', 'info');

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
        
        const gattConnectAction = async (deviceId) => {
            diagLog(`Aktion: GATT-Handshake (Smart Filter) für ${deviceId.substring(0, 4)}... anfordern`, 'bt');
            
            stopScan();
            stopKeepAlive();
            
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
        };
        
        const gattDisconnectAction = () => {
            diagLog('Aktion: Trenne GATT-Verbindung (via app.js)', 'bt');
            disconnect();
        };
        
        const gattUnexpectedDisconnectAction = () => {
            diagLog('Unerwartete Trennung (onGattDisconnect). Starte Scan neu...', 'bt');
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
                        const textEncoder = new TextEncoder(); // UTF-8 Encoder
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
                alert(`Ungültige Eingabe: ${e.message}`);
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
        
        // --- Initialisierung ---
        appInitLogger('Initialisiere Bluetooth-Modul (und Logger)...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 
        
        appInitLogger('Lade Company IDs...', 'utils');
        await loadCompanyIDs();


        // --- UI-Listener mit Callbacks verbinden ---
        appInitLogger('Verbinde UI-Listener... (V11.5)', 'info');
        
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
            onSort: () => {}, 
            onStaleToggle: () => {} 
        });
        
        appInitLogger('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        // Dieser 'catch' fängt jetzt den Import-Fehler von ui.js ab
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        appInitLogger(errorMsg, 'error');
        console.error(errorMsg, err);
    }
}

window.addEventListener('DOMContentLoaded', initApp);
