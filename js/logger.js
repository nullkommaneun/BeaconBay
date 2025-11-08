/**
 * js/logger.js (Version 13.3R - "Single Source of Truth Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3R FIX: Das 'deviceData'-Objekt (der Log-Eintrag) ist
 * jetzt eine *vollständige* Kopie von 'parsedData' (von utils.js).
 * - Es speichert 'id', 'name', 'rssi', 'type' etc. korrekt.
 * - (Behebt den "undefined"-Bug in der UI).
 * - V13.3P: (Unverändert) Speichert 'rssiHistory' als Objekt-Array.
 */

// V13.3-IMPORT (unverändert)
import { AppConfig } from './config.js'; 
import { RingBuffer } from './ringbuffer.js'; 

// === MODULE STATE (unverändert) ===
let deviceHistory = new Map();
let totalLoggedCount = 0;
let scanStartTime = null; 
let appCallbacks = {}; 

// ... (setScanStart, initLogger - V13.3P, unverändert) ...
export function setScanStart() { /* ... */ }
export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null; 
    console.log(`[Logger] Initialisiert. Maximale Geräte: ${AppConfig.Logger.MAX_TOTAL_DEVICES}, Max. Verlauf/Gerät: ${AppConfig.Logger.MAX_HISTORY_PER_DEVICE}`);
}

/**
 * V13.3R FIX: Baut ein *vollständiges* deviceData-Objekt.
 */
export function logAdvertisement(device, rssi, parsedData) {
    if (!parsedData) return;

    const deviceId = device.id;
    const isConnectable = true; 

    // V13.1-LOGIK (unverändert)
    if (!deviceHistory.has(deviceId) && deviceHistory.size >= AppConfig.Logger.MAX_TOTAL_DEVICES) {
        const oldestKey = deviceHistory.keys().next().value;
        deviceHistory.delete(oldestKey);
    }

    let isNewDevice = false;

    // Wenn Gerät neu ist, initialisiere die Datenstruktur
    if (!deviceHistory.has(deviceId)) {
        isNewDevice = true;
        const historySize = AppConfig.Logger.MAX_HISTORY_PER_DEVICE;

        // V13.3R FIX: Dieses Objekt MUSS alle Felder enthalten,
        // die die UI (updateBeaconUI) benötigt.
        deviceHistory.set(deviceId, {
            // V13.3R: Felder spiegeln parsedData wider
            id: deviceId, 
            name: parsedData.name, 
            rssi: rssi, // V13.3R: Aktuellster RSSI
            txPower: parsedData.txPower, 

            firstSeen: parsedData.lastSeen,
            lastSeen: parsedData.lastSeen,
            
            // V13.3P FIX (unverändert)
            rssiHistory: [{ r: rssi, t: parsedData.lastSeen.toISOString() }],
            
            advertisementHistory: new RingBuffer(historySize),
            isConnectable: isConnectable,
            
            company: parsedData.company,
            type: parsedData.type, // V13.3R
            decodedData: parsedData.decodedData, // V13.3R
            beaconData: parsedData.beaconData, // V13.3R
            telemetry: parsedData.telemetry, // V13.3R
            
            rawData: parsedData.beaconData ? parsedData.beaconData.payload : null
        });
        totalLoggedCount++;
    }

    // Hole die (neuen oder alten) Daten des Geräts
    const deviceData = deviceHistory.get(deviceId);

    // Aktualisiere die Daten (V13.3R: Vollständiges Update)
    deviceData.lastSeen = parsedData.lastSeen;
    deviceData.rssi = rssi; // V13.3R
    deviceData.txPower = parsedData.txPower; // V13.3R

    // V13.3P FIX (unverändert)
    deviceData.rssiHistory.push({ r: rssi, t: parsedData.lastSeen.toISOString() });
    if (deviceData.rssiHistory.length > AppConfig.Logger.MAX_HISTORY_PER_DEVICE) {
        deviceData.rssiHistory.shift();
    }
    
    // V13.3R: Aktualisiere "volatile" (sich ändernde) Daten
    if (parsedData.name !== '[Unbenannt]') deviceData.name = parsedData.name;
    if (parsedData.company !== 'N/A') deviceData.company = parsedData.company;
    if (parsedData.type !== 'N/A') deviceData.type = parsedData.type;
    if (parsedData.decodedData) deviceData.decodedData = parsedData.decodedData;
    
    // V13.3R: Überschreibe BeaconData/Telemetry nur, wenn sie vorhanden sind
    if (Object.keys(parsedData.beaconData).length > 0) 
        deviceData.beaconData = parsedData.beaconData;
    if (Object.keys(parsedData.telemetry).length > 0) 
        deviceData.telemetry = parsedData.telemetry;
    
    // V13.1-LOGIK (unverändert)
    deviceData.advertisementHistory.push(parsedData);

    // V13.3R: Dieser Callback sendet jetzt das *vollständige*
    // deviceData-Objekt an die UI (via app.js).
    if (appCallbacks.onLogUpdated) {
        appCallbacks.onLogUpdated(deviceData, isNewDevice);
    }
}

// ... (getDeviceLog, clearLogs - V13.3P, unverändert) ...
export function getDeviceLog(deviceId) { /* ... */ }
export function clearLogs() { /* ... */ }

/**
 * V13.3P: (unverändert)
 */
export async function generateLogFile() {
    console.log("[Logger] Generiere Log-Datei...");
    
    const logData = {
        systemPrompt: AppConfig.Logger.SYSTEM_PROMPT,
        metadata: { /* ... (V13.3P) ... */ },
        devices: Array.from(deviceHistory.values()).map(dev => {
            // V13.3R: Da 'dev' (deviceData) jetzt vollständig ist,
            // können wir den Export vereinfachen (zukünftiges Refactoring).
            // Für V13.3P/R belassen wir es bei der alten Struktur:
            return {
                deviceId: dev.id, // V13.3R
                deviceName: dev.name, // V13.3R
                company: dev.company,
                firstSeen: dev.firstSeen,
                lastSeen: dev.lastSeen,
                isConnectable: dev.isConnectable,
                services: dev.services,
                rawDataPayload: dev.rawData,
                advertisementHistory: dev.advertisementHistory.toArray(),
                rssiHistory: dev.rssiHistory 
            };
        })
    };

    // ... (Download-Logik, V13.3P, unverändert) ...
}
 
