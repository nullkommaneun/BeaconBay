/**
 * js/app.js (Version 11.2 - "Callback" Fix)
 * * ARCHITEKTUR-HINWEIS:
 * - Behebt den V11-Crash beim Start.
 * - Der 'setupUIListeners'-Aufruf übergibt jetzt 'onModalWriteSubmit'
 * (statt dem alten 'onWrite') an ui.js.
 */

// Heartbeat
window.__app_heartbeat = false;

function earlyDiagLog(msg, isError = false) {
    // ... (unverändert)
}

async function initApp() {
    // ... (Alle Modul-Imports unverändert) ...
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
        // ... (Alle Imports unverändert) ...
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
         * V11: Wird vom UI-Modal aufgerufen.
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
        diagLog('Lade Company IDs...', 'utils'); // (Dieser Log ist doppelt, aber harmlos)
        
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onInspect: inspectAction,
            onGattConnect: gattConnectAction,
            onGattDisconnect: gattDisconnectAction,
            onViewToggle: viewToggleAction,
            onRead: readAction,
            onNotify: notifyAction,
            
            // V11.2 KORREKTUR: Der Key muss 'onModalWriteSubmit' heißen
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
        earlyDiagLog(errorMsg, true);
        console.error(errorMsg, err);
    }
}

window.addEventListener('DOMContentLoaded', initApp);
