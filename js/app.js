// js/app.js (Auszug)

// ... (ganz oben)

async function initApp() {
    // ... (alle imports)

    try {
        // ... (alle lade-logs)
        // ... (alle init-aufrufe)

        // --- Callbacks definieren (Dependency Inversion) ---
        diagLog('Verbinde UI-Listener...', 'info');

        const scanAction = () => { /* ... */ };
        const stopScanAction = () => { /* ... */ };
        
        const connectAction = (deviceId) => {
            // ==== [TRACE 5] ====
            // Kommt der Klick hier an?
            diagLog(`[TRACE] app.js: connectAction für ${deviceId.substring(0, 4)}... empfangen.`, 'bt');
            stopKeepAlive();
            connectToDevice(deviceId);
        };
        
        const gattDisconnectAction = () => { /* ... */ };
        const readAction = (charUuid) => { /* ... */ };
        const notifyAction = (charUuid) => { /* ... */ };
        const downloadAction = () => { /* ... */ };

        // --- UI-Listener mit Callbacks verbinden ---
        setupUIListeners({
            onScan: scanAction,
            onStopScan: stopScanAction,
            onConnect: connectAction, // Hier wird TRACE 5 übergeben
            onGattDisconnect: gattDisconnectAction,
            onRead: readAction,
            onNotify: notifyAction,
            onDownload: downloadAction,
            onSort: () => {},
            onStaleToggle: () => {}
        });
        
        // ... (rest der datei)
    } catch (err) {
        // ...
    }
}
window.addEventListener('DOMContentLoaded', initApp);
