// ARCHITEKTUR-HINWEIS (V13.3e): Konfigurations-Modul.
// DATEIPFAD: /js/config.js

export const AppConfig = {
    
    /**
     * Einstellungen für das Logger-Modul (logger.js)
     * (Unverändert von V13.3b)
     */
    Logger: {
        MAX_TOTAL_DEVICES: 1000,
        MAX_HISTORY_PER_DEVICE: 500,
        SYSTEM_PROMPT: "Du bist ein professioneller BLE-Protokoll-Analyst..."
    },

    /**
     * V13.3e-REFAKTOR: Einstellungen für den ErrorManager (errorManager.js)
     * Basiert auf dem Code von V11.5.
     */
    ErrorManager: {
        // V11.5-Einstellung: Die maximale Anzahl von Einträgen, die
        // im Diagnose-Panel angezeigt werden, bevor rotiert wird.
        MAX_LOG_ENTRIES: 100,
        
        // V13.3-Standardmeldungen: Diese werden von app.js oder
        // anderen Modulen verwendet und an diagLog(msg, 'error') übergeben.
        MSG_SCAN_START_FAIL: "Scan konnte nicht gestartet werden. (Bluetooth/Standort aktiv?)",
        MSG_CONNECTION_FAIL: "Verbindung fehlgeschlagen. Gerät nicht in Reichweite?",
        MSG_GATT_FAIL: "GATT-Interaktion fehlgeschlagen.",
        MSG_UNEXPECTED_DISCONNECT: "Verbindung unerwartet getrennt. Starte Scan neu...",
        MSG_LOCATION_SERVICE_FAIL: "Standortdienste nicht verfügbar. Scan gestoppt.",
        MSG_GENERIC_FAIL: "Eine unerwartete Komponente ist fehlgeschlagen."
    },

    /**
     * V13.3-PLATZHALTER: (Unverändert)
     */
    Bluetooth: {
        // ...
    },
    Browser: {
        // ...
    }
};
