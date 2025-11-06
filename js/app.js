/**
 * js/app.js (Version 11 - "Write Modal")
 * * ARCHITEKTUR-HINWEIS:
 * - V11: 'writeAction' (mit prompt) wurde entfernt.
 * - V11: 'modalWriteSubmitAction' hinzugefügt. Diese Funktion
 * wird von ui.js aufgerufen, wenn im Modal auf "Senden" geklickt wird.
 * - V11: Konvertiert Text/Dezimal-Eingaben in ArrayBuffer.
 */

// Heartbeat
window.__app_heartbeat = false;

function earlyDiagLog(msg, isError = false) {
    // ... (unverändert)
}

async function initApp() {
    // Variablen für Modul-Funktionen
    let diagLog, initGlobalErrorHandler;
    let startKeepAlive, stopKeepAlive;
    let loadCompanyIDs, hexStringToArrayBuffer; 
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; 
    let requestDeviceForHandshake, connectWithAuthorizedDevice;
    let getDeviceLog, generateLogFile; 

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
        hexStringToArrayBuffer = utilsModule.hexStringToArrayBuffer; 
        
        diagLog('Lade Layer 1 (logger.js)...', 'utils');
        const loggerModule = await import('./logger.js');
        getDeviceLog = loggerModule.getDeviceLog;
        generateLogFile = loggerModule.generateLogFile;
        
        diagLog('Lade Layer 2 (ui.js)...', 'utils');
        const uiModule = await import('./ui.js');
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

        const scanAction = () => { /* ... (unverändert) ... */ };
        const stopScanAction = () => { /* ... (unverändert) ... */ };
        const inspectAction = (deviceId) => { /* ... (unverändert) ... */ };
        const gattConnectAction = async (deviceId) => { /* ... (unverändert) ... */ };
        const gattDisconnectAction = () => { /* ... (unverändert) ... */ };
        const gattUnexpectedDisconnectAction = () => { /* ... (unverändert) ... */ };
        const readAction = (charUuid) => { /* ... (unverändert) ... */ };
        const notifyAction = (charUuid) => { /* ... (unverändert) ... */ };
        const downloadAction = () => { /* ... (unverändert) ... */ };
        const viewToggleAction = () => { /* ... (unverändert) ... */ };

        /**
         * V11 NEU: Ersetzt die alte 'writeAction'.
         * Wird vom UI-Modal aufgerufen.
         * Konvertiert den Wert basierend auf dem Typ und sendet ihn.
         */
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
                
                // Sende den konvertierten Buffer an den Treiber
                writeCharacteristic(charUuid, dataBuffer);

            } catch (e) {
                diagLog(`Ungültige Eingabe: ${e.message}`, 'error');
                alert(`Ungültige Eingabe: ${e.message}`);
            }
        };

        
        // --- Initialisierung ---
        diagLog('Initialisiere Bluetooth-Modul (und Logger)...', 'bt');
        initBluetooth({
            onGattDisconnected: gattUnexpectedDisconnectAction,
            onGetDeviceLog: getDeviceLog 
        }); 
        
        diagLog('Lade Company IDs...', 'utils');
        await loadCompanyIDs();


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
            onModalWriteSubmit: modalWriteSubmitAction, // V11: Neuer Callback
            onDownload: downloadAction,
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
 
