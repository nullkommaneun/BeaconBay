// ARCHITEKTUR-HINWEIS (V13.3N): Das Konfigurations-Modul.
// DATEIPFAD: /js/config.js
// V13.3EE HINWEIS: Diese Datei MUSS existieren,
// da sie von fast jedem Modul importiert wird.

export const AppConfig = {
    
    /**
     * Logger-Modul (logger.js)
     * (V13.3c)
     */
    Logger: {
        MAX_TOTAL_DEVICES: 1000,
        MAX_HISTORY_PER_DEVICE: 500,
        SYSTEM_PROMPT: "Du bist ein professioneller BLE-Protokoll-Analyst..."
    },

    /**
     * ErrorManager (errorManager.js)
     * (V13.3e)
     */
    ErrorManager: {
        MAX_LOG_ENTRIES: 100,
        MSG_SCAN_START_FAIL: "Scan konnte nicht gestartet werden. (Bluetooth/Standort aktiv?)",
        MSG_CONNECTION_FAIL: "Verbindung fehlgeschlagen. Gerät nicht in Reichweite?",
        MSG_GATT_FAIL: "GATT-Interaktion fehlgeschlagen.",
        MSG_UNEXPECTED_DISCONNECT: "Verbindung unerwartet getrennt. Starte Scan neu...",
        MSG_LOCATION_SERVICE_FAIL: "Standortdienste nicht verfügbar. Scan gestoppt.",
        MSG_GENERIC_FAIL: "Eine unerwartete Komponente ist fehlgeschlagen."
    },

    /**
     * Browser-Fixes (browser.js)
     * (V13.3h)
     */
    Browser: {
        GEO_WATCH_HIGH_ACCURACY: true,
        GEO_WATCH_MAXIMUM_AGE: 0 
    },

    /**
     * V13.3N-REFAKTOR: Bluetooth-Modul (bluetooth.js)
     */
    Bluetooth: {
        STALE_DEVICE_THRESHOLD_MS: 10000,
        STALE_CHECK_INTERVAL_MS: 2000,
        SCAN_ACCEPT_ALL: true,
        HANDSHAKE_OPTIONAL_SERVICES: [
            '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
            '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
        ],
        // V13.3V FIX: Tippfehler korrigiert
        HANDSHAKE_FALLBACK_ACCEPT_ALL: true
    }
};
