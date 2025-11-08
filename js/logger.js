// V13.3-IMPORT: Lade die zentrale App-Konfiguration
import { AppConfig } from './config.js'; 
// V13.1-ABHÄNGIGKEIT: RingBuffer (wird für V13.3 nicht geändert)
import { RingBuffer } from './ringbuffer.js'; 
import { getCompany } from './utils.js';

// ARCHITEKTUR-HINWEIS (V13.1): Der "Ring-Puffer" für Geräte.
// Speichert die X zuletzt gesehenen Geräte (definiert in config.js).
let deviceHistory = new Map();
let totalLoggedCount = 0;
let appCallbacks = {}; // Callbacks zu app.js

// V13.3-REFAKTOR: Diese "Magic Number" ist veraltet und wird
// durch AppConfig.Logger.MAX_TOTAL_DEVICES ersetzt.
// const MAX_TOTAL_DEVICES_LIMIT = 1000; // V13.1 - Veraltet

/**
 * Initialisiert das Logger-Modul.
 * @param {object} callbacks - Objekt mit Callback-Funktionen (z.B. onLogUpdated)
 */
export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    console.log(`[Logger] Initialisiert. Maximale Geräte: ${AppConfig.Logger.MAX_TOTAL_DEVICES}, Max. Verlauf/Gerät: ${AppConfig.Logger.MAX_HISTORY_PER_DEVICE}`);
}

/**
 * Loggt ein empfangenes Advertisement-Paket.
 * Wendet die V13.1 Ring-Puffer-Logik an.
 */
export function logAdvertisement(device, rssi, parsedData) {
    const deviceId = device.id;
    // V9.13-FIX: 'connectable' ist nicht zuverlässig. Wir behandeln *alle* // Geräte als potenziell verbindbar (optimistische UI).
    const isConnectable = true; 

    // V13.1-LOGIK: Ring-Puffer für die Gesamtanzahl der Geräte
    // V13.3-FIX: Verwende den zentralen Konfigurationswert.
    if (!deviceHistory.has(deviceId) && deviceHistory.size >= AppConfig.Logger.MAX_TOTAL_DEVICES) {
        // Ältestes Gerät entfernen (FIFO), um Speicher zu sparen.
        const oldestKey = deviceHistory.keys().next().value;
        deviceHistory.delete(oldestKey);
    }

    let isNewDevice = false;

    // Wenn Gerät neu ist, initialisiere die Datenstruktur
    if (!deviceHistory.has(deviceId)) {
        isNewDevice = true;
        
        // V13.3-FIX: Hole die Größe des Verlaufs-Puffers aus der Config.
        const historySize = AppConfig.Logger.MAX_HISTORY_PER_DEVICE;

        deviceHistory.set(deviceId, {
            deviceId: deviceId,
            deviceName: device.name || 'N/A',
            firstSeen: new Date(),
            lastSeen: new Date(),
            rssiHistory: [rssi],
            // V13.1-LOGIK: Initialisiere den RingBuffer für die Advertisements dieses Geräts
            advertisementHistory: new RingBuffer(historySize),
            isConnectable: isConnectable,
            company: 'Unbekannt', // Wird unten aktualisiert
            services: [],
            // V13.2-FIX: Speichere den rohen Payload (wichtig für Prompt-Export)
            rawData: parsedData.payload 
        });
        totalLoggedCount++;
    }

    // ... (Rest der Funktion: deviceData aktualisieren, RSSI, lastSeen, etc.) ...
    
    // [CODE VON V13.2 HIER EINFÜGEN - z.B. deviceData.lastSeen = new Date(); ...]
    // [CODE VON V13.2 HIER EINFÜGEN - z.B. Aktualisierung von company, services etc. ...]

    // V13.1-LOGIK: Füge das neue Advertisement dem RingBuffer des Geräts hinzu.
    // Der Buffer (V13.3: Größe 500) verwirft automatisch das älteste Paket.
    const deviceData = deviceHistory.get(deviceId);
    deviceData.advertisementHistory.push(parsedData);

    // ... (Rest der Funktion: appCallbacks.onLogUpdated(deviceData, isNewDevice);) ...
}


/**
 * Erstellt die V13.2 "Prompt-Export" JSON-Datei.
 */
export async function generateLogFile() {
    console.log("[Logger] Generiere Log-Datei...");
    
    // ... (Code zum Sammeln der Daten aus deviceHistory, V13.2) ...
    
    const logData = {
        // V13.3-FIX: Verwende den zentralen Konfigurationswert für den Prompt
        systemPrompt: AppConfig.Logger.SYSTEM_PROMPT,
        metadata: {
            // ... (Metadaten, V13.2) ...
        },
        devices: Array.from(deviceHistory.values()).map(dev => {
            // ... (Daten-Mapping, V13.2) ...
            // WICHTIG: Sicherstellen, dass advertisementHistory als Array exportiert wird
            return {
                ...dev,
                advertisementHistory: dev.advertisementHistory.toArray() 
            };
        })
    };

    // ... (Rest der Funktion: JSON.stringify, Blob erstellen, V13.2) ...
    // ... (Rückgabe des Blobs) ...
}

// ... (Rest von logger.js: getDeviceLog, clearLogs, etc. bleiben unverändert) ...
