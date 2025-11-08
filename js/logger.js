/**
 * js/logger.js (Version 13.3U - "Clear-Logik Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3U FIX: 'clearLogs()' wird jetzt von app.js aufgerufen
 * und löst den 'onLogsCleared'-Callback aus (Single Source of Truth).
 * - V13.3R: (Unverändert) Baut ein vollständiges 'deviceData'-Objekt.
 * - V13.3P: (Unverändert) Speichert 'rssiHistory' als Objekt-Array.
 * - V13.3N: (Unverändert) Enthält 'setScanStart'.
 * - V13.3c: (Unverändert) Verwendet AppConfig.
 * - V13.1: (Unverändert) Verwendet RingBuffer.
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

        // V13.3R FIX: Dieses Objekt MUSS alle Felder enthalten
        deviceHistory.set(deviceId, {
            id: deviceId, 
            name: parsedData.name, 
            rssi: rssi,
            txPower: parsedData.txPower, 
            firstSeen: parsedData.lastSeen,
            lastSeen: parsedData.lastSeen,
            
            // V13.3P FIX (unverändert)
            rssiHistory: [{ r: rssi, t: parsedData.lastSeen.toISOString() }],
            
            advertisementHistory: new RingBuffer(historySize),
            isConnectable: isConnectable,
            
            company: parsedData.company,
            type: parsedData.type,
            decodedData: parsedData.decodedData,
            beaconData: parsedData.beaconData,
            telemetry: parsedData.telemetry,
            
            rawData: parsedData.beaconData ? parsedData.beaconData.payload : null
        });
        totalLoggedCount++;
    }

    // Hole die (neuen oder alten) Daten des Geräts
    const deviceData = deviceHistory.get(deviceId);

    // Aktualisiere die Daten (V13.3R: Vollständiges Update)
    deviceData.lastSeen = parsedData.lastSeen;
    deviceData.rssi = rssi;
    deviceData.txPower = parsedData.txPower;

    // V13.3P FIX (unverändert)
    deviceData.rssiHistory.push({ r: rssi, t: parsedData.lastSeen.toISOString() });
    if (deviceData.rssiHistory.length > AppConfig.Logger.MAX_HISTORY_PER_DEVICE) {
        deviceData.rssiHistory.shift();
    }
    
    // V13.3R: (unverändert)
    if (parsedData.name !== '[Unbenannt]') deviceData.name = parsedData.name;
    if (parsedData.company !== 'N/A') deviceData.company = parsedData.company;
    if (parsedData.type !== 'N/A') deviceData.type = parsedData.type;
    if (parsedData.decodedData) deviceData.decodedData = parsedData.decodedData;
    if (Object.keys(parsedData.beaconData).length > 0) 
        deviceData.beaconData = parsedData.beaconData;
    if (Object.keys(parsedData.telemetry).length > 0) 
        deviceData.telemetry = parsedData.telemetry;
    
    // V13.1-LOGIK (unverändert)
    deviceData.advertisementHistory.push(parsedData);

    // V13.3R: (unverändert)
    if (appCallbacks.onLogUpdated) {
        appCallbacks.onLogUpdated(deviceData, isNewDevice);
    }
}

/**
 * Ruft die gesammelten Log-Daten für ein einzelnes Gerät ab.
 * (unverändert)
 */
export function getDeviceLog(deviceId) {
    return deviceHistory.get(deviceId);
}

/**
 * V13.3U: Diese Funktion wird jetzt von app.js:scanAction aufgerufen
 * und löst den UI-Clear-Callback aus.
 */
export function clearLogs() {
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null;
    
    diagLog("Logger-Speicher (deviceHistory) geleert.", "utils");

    // V13.3U: Löst den Callback aus, der ui.js:clearUI() aufruft.
    if (appCallbacks.onLogsCleared) {
        appCallbacks.onLogsCleared();
    }
}

/**
 * Erstellt die V13.2 "Prompt-Export" JSON-Datei.
 * (V13.3R: Export-Felder angepasst)
 */
export async function generateLogFile() {
    console.log("[Logger] Generiere Log-Datei...");
    
    const logData = {
        systemPrompt: AppConfig.Logger.SYSTEM_PROMPT,
        metadata: {
            timestamp: new Date().toISOString(),
            scanStartTime: scanStartTime ? scanStartTime.toISOString() : null,
            totalDevicesLogged: totalLoggedCount,
            devicesInExport: deviceHistory.size,
            version: "BeaconBay V13.3U"
        },
        devices: Array.from(deviceHistory.values()).map(dev => {
            return {
                deviceId: dev.id,
                deviceName: dev.name,
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
        if (appCallbacks.diagLog) {
            appCallbacks.diagLog(`Log-Generierung fehlgeschlagen: ${e.message}`, 'error');
        } else {
            console.error(`Log-Generierung fehlgeschlagen: ${e.message}`);
        }
    }
}
