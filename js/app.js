/**
 * js/app.js (Version 13.3f - "ErrorManager Sync" & "Config Refactor")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3f: Synchronisiert mit errorManager.js (V13.3e).
 * - Importiert und ruft initErrorManager() auf (V11.11 DOM-Ready-Fix).
 * - Entfernt den 'appInitLogger'-Wrapper (V13.3e macht ihn überflüssig).
 * - V13.3f: Importiert AppConfig für standardisierte Fehlermeldungen.
 * - V12.3: (Unverändert) Lädt Company IDs VOR Bluetooth.
 */

// Heartbeat
window.__app_heartbeat = false;

// V13.3f-IMPORT: Lade die *neue* initErrorManager Funktion
import { initErrorManager, diagLog, initGlobalErrorHandler, earlyDiagLog } from './errorManager.js';
// V13.3f-IMPORT: Lade die Konfiguration für Fehlermeldungen
import { AppConfig } from './config.js';

initGlobalErrorHandler(); // Installiere globale Handler sofort (V11.5)

// V13.3f-HINWEIS: Der 'appInitLogger' Wrapper (V12.3) wird
// nicht mehr benötigt, da V13.3e 'diagLog' robust genug ist.
// function appInitLogger(...) // VERALTET

async function initApp() {
    // V13.3f-FIX: initErrorManager() MUSS als ERSTES aufgerufen werden,
    // sobald der DOM bereit ist (V11.11-Logik), damit 'diagLog' das Panel findet.
    initErrorManager();
    
    // V13.3f-FIX: Ersetze appInitLogger durch direkten Aufruf
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
        // --- Dynamisches Laden der Module ---
        
        // V13.3f-FIX: Verwende diagLog direkt
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
        // V13.3f HINWEIS: logger.js (V13.3c) importiert und verwendet bereits 
        // 'AppConfig' intern, wir müssen hier nichts weiter tun.
        
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
            
            // V13.3f-FIX: Nutze AppConfig für Fehlermeldungen
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
            // ... (unverändert) ...
        };
        
        const inspectAction = (deviceId) => {
            // ... (unverändert) ...
        };
        
        const gattConnectAction = async (deviceId) => {
            diagLog(`Aktion: GATT-Handshake (Smart Filter) für ${deviceId.substring(0, 4)}... anfordern`, 'bt');
            
            stopScan();
            stopKeepAlive();
            
            // V13.3f-FIX: Nutze AppConfig für Fehlermeldungen
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
            // ... (unverändert) ...
        };
        
        const gattUnexpectedDisconnectAction = () => {
            // V13.3f-FIX: Nutze AppConfig
            diagLog(AppConfig.ErrorManager.MSG_UNEXPECTED_DISCONNECT, 'warn');
            scanAction(); // Auto-Restart (V9.9)
        };

        // ... (readAction, notifyAction unverändert) ...

        const modalWriteSubmitAction = (charUuid, value, type) => {
            // ... (Logik unverändert, aber wir fangen Fehler besser ab) ...
            
            if (value === null || value.trim() === "") {
                diagLog("Schreiben abgebrochen: Kein Wert.", 'ui');
                return;
            }

            let dataBuffer;
            try {
                // ... (Dein switch-case-Block, unverändert) ...
                
                writeCharacteristic(charUuid, dataBuffer);

            } catch (e) {
                // V13.3f-FIX: Nutze AppConfig
                diagLog(`Ungültige Eingabe: ${e.message}`, 'error');
                // V13.3f-FIX: Nutze AppConfig für die UI-Meldung
                alert(AppConfig.ErrorManager.MSG_GATT_FAIL + ` (Schreib-Eingabe: ${e.message})`);
            }
        };
        
        const downloadAction = () => {
            // ... (unverändert) ...
        };

        const viewToggleAction = () => {
            // ... (unverändert) ...
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
        diagLog('Verbinde UI-Listener... (V13.3f)', 'info');
        
        setupUIListeners({
            // ... (alle Actions wie oben definiert) ...
        });
        
        diagLog('BeaconBay ist initialisiert und bereit.', 'info');
        window.__app_heartbeat = true;

    } catch (err) {
        const errorMsg = `FATALER APP-LADEFEHLER: ${err.message}.`;
        // V13.3f-FIX: Verwende earlyDiagLog, falls initApp() *sehr* früh fehlschlägt
        // (bevor initErrorManager() lief)
        earlyDiagLog(errorMsg, true); // 'true' = isError
        console.error(errorMsg, err);
    }
}

window.addEventListener('DOMContentLoaded', initApp);
