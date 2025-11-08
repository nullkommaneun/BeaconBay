/**
 * js/logger.js (Version 13.3P - "Refactor Complete")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3P FIX: Speichert 'rssiHistory' jetzt als Objekt-Array
 * [{r: rssi, t: isoTimestamp}], um den UI-Chart-Absturz (V12.3) zu beheben.
 * - V13.3P FIX: Begrenzt 'rssiHistory' (Vermeidet Speicherleck).
 * - V13.3N: Fügt 'setScanStart'-Funktion hinzu (von bluetooth.js benötigt).
 * - V13.3L: Entfernt fehlerhaften 'getCompany'-Import.
 * - V13.3c: Verwendet AppConfig für Limits und Prompt.
 * - V13.1: Verwendet RingBuffer für 'advertisementHistory'.
 */

// V13.3-IMPORT: Lade die zentrale App-Konfiguration
import { AppConfig } from './config.js'; 
// V13.1-ABHÄNGIGKEIT: RingBuffer
import { RingBuffer } from './ringbuffer.js'; 

// === MODULE STATE ===
let deviceHistory = new Map();
let totalLoggedCount = 0;
let scanStartTime = null; // V13.3N
let appCallbacks = {}; // Callbacks zu app.js

/**
 * V13.3N: Wird von bluetooth.js aufgerufen, um den 
 * Startzeitpunkt des Scans zu markieren.
 */
export function setScanStart() {
    scanStartTime = new Date();
    console.log("[Logger] Scan-Startzeitpunkt gesetzt:", scanStartTime);
}

/**
 * Initialisiert das Logger-Modul.
 * @param {object} callbacks - Objekt mit Callback-Funktionen (z.B. onLogUpdated)
 */
export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null; // Zurücksetzen
    
    // V13.3c: Verwende die zentralen Konfigurationswerte
    console.log(`[Logger] Initialisiert. Maximale Geräte: ${AppConfig.Logger.MAX_TOTAL_DEVICES}, Max. Verlauf/Gerät: ${AppConfig.Logger.MAX_HISTORY_PER_DEVICE}`);
}

/**
 * Loggt ein empfangenes Advertisement-Paket.
 * Wendet die V13.1 Ring-Puffer-Logik an.
 * (V13.3P FIX: Korrigiert das Format von rssiHistory)
 * @param {BluetoothDevice} device - Das rohe BLE-Geräteobjekt.
 * @param {number} rssi - Aktueller RSSI.
 * @param {object} parsedData - Das von utils.js (V13.2) geparste Objekt.
 */
export function logAdvertisement(device, rssi, parsedData) {
    if (!parsedData) {
        return; // Konnte nicht geparst werden (V13.2)
    }

    const deviceId = device.id;
    // V9.13-FIX: 'connectable' ist nicht zuverlässig. 
    const isConnectable = true; 

    // V13.1-LOGIK: Ring-Puffer für die Gesamtanzahl der Geräte
    // V13.3c-FIX: Verwende den zentralen Konfigurationswert.
    if (!deviceHistory.has(deviceId) && deviceHistory.size >= AppConfig.Logger.MAX_TOTAL_DEVICES) {
        // Ältestes Gerät entfernen (FIFO)
        const oldestKey = deviceHistory.keys().next().value;
        deviceHistory.delete(oldestKey);
    }

    let isNewDevice = false;

    // Wenn Gerät neu ist, initialisiere die Datenstruktur
    if (!deviceHistory.has(deviceId)) {
        isNewDevice = true;
        
        // V13.3c-FIX: Hole die Größe des Verlaufs-Puffers aus der Config.
        const historySize = AppConfig.Logger.MAX_HISTORY_PER_DEVICE;

        deviceHistory.set(deviceId, {
            deviceId: deviceId,
            deviceName: parsedData.name,
            firstSeen: parsedData.lastSeen, // V13.2
            lastSeen: parsedData.lastSeen,  // V13.2
            
            // V13.3P FIX: Speichere das Objekt {r, t}, das ui.js (V12.3) erwartet
            rssiHistory: [{ r: rssi, t: parsedData.lastSeen.toISOString() }],
            
            // V13.1-LOGIK: Initialisiere den RingBuffer für die Advertisements
            advertisementHistory: new RingBuffer(historySize),
            isConnectable: isConnectable,
            company: parsedData.company, // V13.2
            services: [], 
            
            // V13.2-FIX: Speichere den rohen Payload
            rawData: parsedData.beaconData ? parsedData.beaconData.payload : null
        });
        totalLoggedCount++;
    }

    // Hole die (neuen oder alten) Daten des Geräts
    const deviceData = deviceHistory.get(deviceId);

    // Aktualisiere die Daten
    deviceData.lastSeen = parsedData.lastSeen;

    // V13.3P FIX: Speichere das Objekt {r, t}
    deviceData.rssiHistory.push({ r: rssi, t: parsedData.lastSeen.toISOString() });
    
    // V13.3P PROAKTIVER FIX (Regel 2): Verhindere Speicherleck bei RSSI.
    // Wir begrenzen den Verlauf (passend zur Config des Ad-Verlaufs).
    if (deviceData.rssiHistory.length > AppConfig.Logger.MAX_HISTORY_PER_DEVICE) {
        deviceData.rssiHistory.shift(); // Entferne den ältesten RSSI-Wert
    }
    
    // V13.2-LOGIK: Aktualisiere Name/Firma, falls sie sich ändern
    if (parsedData.name !== '[Unbenannt]') {
        deviceData.deviceName = parsedData.name;
    }
    if (parsedData.company !== 'N/A') {
        deviceData.company = parsedData.company;
    }
    
    // V13.1-LOGIK: Füge das neue Advertisement dem RingBuffer des Geräts hinzu.
    deviceData.advertisementHistory.push(parsedData);

    // Informiere die UI (app.js -> ui.js) über das Update
    if (appCallbacks.onLogUpdated) {
        appCallbacks.onLogUpdated(deviceData, isNewDevice);
    }
}

/**
 * Ruft die gesammelten Log-Daten für ein einzelnes Gerät ab.
 * (Wichtig für V11.9 "Smart Filter" Handshake)
 * @param {string} deviceId
 * @returns {object | undefined} Die Log-Daten des Geräts.
 */
export function getDeviceLog(deviceId) {
    return deviceHistory.get(deviceId);
}

/**
 * Löscht alle gespeicherten Logs.
 */
export function clearLogs() {
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null;
    if (appCallbacks.onLogsCleared) {
        appCallbacks.onLogsCleared();
    }
}

/**
 * Erstellt die V13.2 "Prompt-Export" JSON-Datei.
 * (V13.3N: scanStartTime hinzugefügt)
 */
export async function generateLogFile() {
    console.log("[Logger] Generiere Log-Datei...");
    
    const logData = {
        // V13.3c-FIX: Verwende den zentralen Konfigurationswert für den Prompt
        systemPrompt: AppConfig.Logger.SYSTEM_PROMPT,
        metadata: {
            timestamp: new Date().toISOString(),
            scanStartTime: scanStartTime ? scanStartTime.toISOString() : null, // V13.3N
            totalDevicesLogged: totalLoggedCount,
            devicesInExport: deviceHistory.size,
            version: "BeaconBay V13.3P"
        },
        devices: Array.from(deviceHistory.values()).map(dev => {
            // V13.2-LOGIK: Stelle sicher, dass der RingBuffer als Array exportiert wird
            return {
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                company: dev.company,
                firstSeen: dev.firstSeen,
                lastSeen: dev.lastSeen,
                isConnectable: dev.isConnectable,
                services: dev.services,
                rawDataPayload: dev.rawData, // V13.2
                // V13.1: Wandle den Puffer in ein lesbares Array um
                advertisementHistory: dev.advertisementHistory.toArray(),
                // V13.3P: Exportiere den RSSI-Verlauf
                rssiHistory: dev.rssiHistory 
            };
        })
    };

    try {
        const jsonString = JSON.stringify(logData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // Download-Link erstellen und klicken
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BeaconBay_Log_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e) {
        // V13.3j: Nutze den ErrorManager
        if (appCallbacks.diagLog) { // Prüfe, ob diagLog übergeben wurde
            appCallbacks.diagLog(`Log-Generierung fehlgeschlagen: ${e.message}`, 'error');
        } else {
            console.error(`Log-Generierung fehlgeschlagen: ${e.message}`);
        }
    }
}
