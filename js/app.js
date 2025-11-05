/**
 * js/app.js (Version 10 - GATT-Write Implementiert)
 * * ARCHITEKTUR-HINWEIS:
 * - Basiert auf der stabilen V9.15 (Smart Filter & Auto-Restart).
 * - V10: Importiert 'writeCharacteristic' (von bluetooth.js) und 'hexStringToArrayBuffer' (von utils.js).
 * - V10: Fügt 'writeAction' als neuen Callback hinzu (verwendet 'prompt()' für die Eingabe).
 * - V10: Übergibt 'onWrite' an setupUIListeners.
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
    let loadCompanyIDs, hexStringToArrayBuffer; // V10: Hinzugefügt
    let setupUIListeners, showInspectorView, showView, setGattConnectingUI; 
    let initBluetooth, startScan, stopScan, disconnect,
        readCharacteristic, startNotifications, writeCharacteristic; // V10: Hinzugefügt
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
        hexStringToArrayBuffer = utilsModule.hexStringToArrayBuffer; // V10: Hinzugefügt
        
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
        writeCharacteristic = bluetoothModule.writeCharacteristic; // V10: Hinzugefügt

        diagLog('Alle Module erfolgreich geladen.', 'info');

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

        /**
         * V10 NEU: Wird von ui.js aufgerufen, wenn auf "Schreiben" geklickt wird.
         */
        const writeAction = (charUuid) => {
            diagLog(`Aktion: Anforderung 'Schreiben' für ${charUuid}`, 'bt');
            
            // V10 TEST: Einfaches Pop-up
            const dataHex = prompt("Hex-Wert eingeben (z.B. '0x01' oder 'FF01AA')");
            
            if (dataHex === null || dataHex.trim() === "") {
                diagLog("Schreiben abgebrochen.", 'ui');
                return;
            }

            try {
                // Konvertiere den String in einen Buffer
                const dataBuffer = hexStringToArrayBuffer(dataHex); 
                // Sende an den Treiber
                writeCharacteristic(charUuid, dataBuffer);
            } catch (e) {
                diagLog(`Ungültiges Hex-Format: ${e.message}`, 'error');
                alert(`Ungültiges Format: ${e.message}. (z.B. '01' oder 'FF0A')`);
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
        diagLog('Initialisiere Bluetooth-Modul (und Logger)...', 'bt');
        /**
         * V9.15 PATCH: Übergibt 'onGetDeviceLog' an bluetooth.js
         * für den Smart Filter.
         */
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
            onWrite: writeAction, // V10 HINZUGEFÜGT
            onDownload: downloadAction,
            onGetDeviceLog: getDeviceLog, // (Für V9.2/V9.15 UI-Patch)
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
