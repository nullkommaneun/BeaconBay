/**
 * js/app.js (Version 13.3i - "ErrorManager Sync" & "Config Refactor")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3i: Synchronisiert mit errorManager.js (V13.3e).
 * - Importiert und ruft initErrorManager() auf (V11.11 DOM-Ready-Fix).
 * - V13.3i: Importiert AppConfig für standardisierte Fehlermeldungen.
 * - V12.3: (Unverändert) Lädt Company IDs VOR Bluetooth.
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3f-IMPORT: Lade die *neue* initErrorManager Funktion
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
// V13.3f-IMPORT: Lade die Konfiguration für Fehlermeldungen
import { AppConfig } from './config.js';

// V11.5: Installiere globale Handler sofort (falls etwas VOR DOMContentLoaded fehlschlägt)
initGlobalErrorHandler(); 

// V11.5-FIX: Verwende earlyDiagLog für den frühestmöglichen Log-Punkt
earlyDiagLog("app.js (V13.3i) geladen. Warte auf DOMContentLoaded...");

async function initApp() {
    // V13.3i-FIX: initErrorManager() MUSS als ERSTES aufgerufen werden,
    // sobald der DOM bereit ist (V11.11-Logik), damit 'diagLog' das Panel findet.
    // Dies löscht auch die "initialisiert..." HTML-Nachricht.
    initErrorManager();
    
    diagLog('App-Initialisierung wird gestartet (DOM content loaded)...', 'info');

    // Deklarationen (unverändert)
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let getDeviceLog, generateLogFile; 

    try {
        // --- Dynamisches Laden der Module (V12.3) ---
        
        diagLog('Lade Layer 1 (browser.js)...', 'utils');
        // V13.3h HINWEIS: browser.js importiert jetzt selbst AppConfig
        const browserModule = await import('./browser.js');
        startKeepAlive = browserModule.startKeepAlive;
        stopKeepAlive = browserModule.stopKeepAlive;
        
        diagLog('Lade Layer 1 (utils.js)...', 'utils');
        const utilsModule = await import('./utils.js');
        loadCompanyIDs = utilsModule.loadCompanyIDs;
        hexStringToArrayBuffer = utilsModule.hexStringToArrayBuffer; 
        
        diagLog('Lade Layer 1 (logger.js)...', 'utils');
        // V13.3c HINWEIS: logger.js importiert jetzt selbst AppConfig
        const loggerModule = await import('./logger.js');
        getDeviceLog = loggerModule.getDeviceLog;
        generateLogFile = loggerModule.generateLogFile;
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
        diagLog('Layer 2 (ui.js) erfolgreich geladen.', 'info');
        
        setupUIListeners = uiModule.setupUIListeners;
        showInspectorView = uiModule.showInspectorView;
        showView = uiModule.showView;
        setGattConnectingUI = uiModule.setGattConnectingUI;
        
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
            
            // V13.3i-FIX: Nutze AppConfig für Fehlermeldungen
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
            
            // V13.3i-FIX: Nutze AppConfig für Fehlermeldungen
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
            // V13.3i-FIX: Nutze AppConfig
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
                // V13.3i-FIX: Nutze AppConfig für die UI-Meldung
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
        
        // --- Initialisierung ---
        
        // V12.3 FIX: Lade IDs ZUERST
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();
        
        diagLog('Initialisiere Bluetooth-Modul (und Logger)...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 

        // --- UI-Listener mit Callbacks verbinden ---
        diagLog('Verbinde UI-Listener... (V13.3i)', 'info');
        
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
 
