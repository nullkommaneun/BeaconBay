// ARCHITEKTUR-HINWEIS (V13.3h): Das Konfigurations-Modul.
// Diese Datei dient als "Single Source of Truth" für alle statischen
// Einstellungen der BeaconBay-App. Sie wird von anderen Modulen importiert.
// DATEIPFAD: /js/config.js

export const AppConfig = {
    
    /**
     * Einstellungen für das Logger-Modul (logger.js)
     * (Eingeführt in V13.3c)
     */
    Logger: {
        // V13.1-Einstellung: Maximale Geräte im Ringspeicher (Map)
        MAX_TOTAL_DEVICES: 1000,

        // V13.1-Einstellung: Max. Advertisements *pro Gerät* (RingBuffer)
        MAX_HISTORY_PER_DEVICE: 500,

        // V13.2-Einstellung: System-Prompt für den JSON-Export
        SYSTEM_PROMPT: "Du bist ein professioneller BLE-Protokoll-Analyst. Analysiere das folgende JSON-Log von BeaconBay. Achte auf Geräte-Interaktionen, ungewöhnliche Payloads und Verbindungsabbrüche."
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
     * V13.3h-REFAKTOR: Einstellungen für Browser-Fixes (browser.js)
     * Diese Werte spiegeln die V12.2-Logik wider.
     */
    Browser: {
        // V12.2-Einstellung: Zwingt die Nutzung von GPS/WLAN (aggressiver Keep-Alive)
        GEO_WATCH_HIGH_ACCURACY: true,
        
        // V12.2-Einstellung: Verhindert die Nutzung einer zwischengespeicherten Position
        GEO_WATCH_MAXIMUM_AGE: 0 
    },

    /**
     * V13.3-PLATZHALTER: Für das Refactoring von bluetooth.js
     */
    Bluetooth: {
        // Hier kommen als nächstes die V11.9 "Smart Filter"-Werte hin.
        // z.B. ACCEPT_ALL_DEVICES_FALLBACK: true
    }
};
 
