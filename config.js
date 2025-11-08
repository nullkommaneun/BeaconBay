// ARCHITEKTUR-HINWEIS (V13.3): Das Konfigurations-Modul.
// Diese Datei dient als "Single Source of Truth" für alle statischen
// Einstellungen der BeaconBay-App. Das vermeidet "Magic Numbers"
// in der Codebasis und erleichtert die Wartung und Anpassung.

// Wir exportieren ein globales Objekt 'AppConfig', damit andere Module
// darauf zugreifen können (z.B. AppConfig.Logger.MAX_DEVICES).

export const AppConfig = {
    
    /**
     * Einstellungen für das Logger-Modul (logger.js)
     */
    Logger: {
        // V13.1-Einstellung: Die maximale Anzahl von Geräten, die im 
        // Ringspeicher (deviceHistory Map) gehalten werden.
        MAX_TOTAL_DEVICES: 1000,

        // V13.1-Einstellung: Die maximale Anzahl von Advertisements, 
        // die *pro Gerät* im (RingBuffer) gespeichert werden.
        MAX_HISTORY_PER_DEVICE: 500,

        // V13.2-Einstellung: Der System-Prompt, der in den 
        // JSON-Export eingebettet wird.
        SYSTEM_PROMPT: "Du bist ein professioneller BLE-Protokoll-Analyst. Analysiere das folgende JSON-Log von BeaconBay. Achte auf Geräte-Interaktionen, ungewöhnliche Payloads und Verbindungsabbrüche."
    },

    /**
     * Einstellungen für das Bluetooth-Modul (bluetooth.js)
     * HINWEIS: Bisher leer, vorbereitet für zukünftige Refaktorisierungen 
     * (z.B. Scan-Timeouts, Filter-UUIDs).
     */
    Bluetooth: {
        // z.B. SCAN_DURATION_MS: 30000 
    },

    /**
     * Einstellungen für die Benutzeroberfläche (ui.js)
     * HINWEIS: Bisher leer, vorbereitet für zukünftige Refaktorisierungen.
     */
    UI: {
        // z.B. RSSI_UPDATE_INTERVAL_MS: 1000
    }
};
