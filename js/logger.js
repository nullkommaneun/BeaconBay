/**
 * js/logger.js (Version 13.3N - "setScanStart Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3N FIX: Fügt die fehlende 'setScanStart'-Funktion hinzu,
 * die von bluetooth.js (V12.1) benötigt wird.
 * - V13.3L: (Unverändert) Entfernt 'getCompany' Import.
 * - V13.3c: (Unverändert) Verwendet AppConfig.
 * - V13.1: (Unverändert) Verwendet RingBuffer.
 */

import { AppConfig } from './config.js'; 
import { RingBuffer } from './ringbuffer.js'; 

// === MODULE STATE ===
let deviceHistory = new Map();
let totalLoggedCount = 0;
let scanStartTime = null; // V13.3N: Hinzugefügt
let appCallbacks = {}; 

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
 * (V13.3L, unverändert)
 */
export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null; // Zurücksetzen
    
    console.log(`[Logger] Initialisiert. Maximale Geräte: ${AppConfig.Logger.MAX_TOTAL_DEVICES}, Max. Verlauf/Gerät: ${AppConfig.Logger.MAX_HISTORY_PER_DEVICE}`);
}

/**
 * Loggt ein empfangenes Advertisement-Paket.
 * (V13.3L, unverändert)
 */
export function logAdvertisement(device, rssi, parsedData) {
    // ... (Code von V13.3L, Antwort 16, unverändert) ...
    if (!parsedData) return;
    const deviceId = device.id;
    const isConnectable = true; 
    if (!deviceHistory.has(deviceId) && deviceHistory.size >= AppConfig.Logger.MAX_TOTAL_DEVICES) {
        const oldestKey = deviceHistory.keys().next().value;
        deviceHistory.delete(oldestKey);
    }
    let isNewDevice = false;
    if (!deviceHistory.has(deviceId)) {
        isNewDevice = true;
        const historySize = AppConfig.Logger.MAX_HISTORY_PER_DEVICE;
        deviceHistory.set(deviceId, {
            deviceId: deviceId,
            deviceName: parsedData.name,
            firstSeen: parsedData.lastSeen,
            lastSeen: parsedData.lastSeen,
            rssiHistory: [rssi],
            advertisementHistory: new RingBuffer(historySize),
            isConnectable: isConnectable,
            company: parsedData.company,
            services: [],
            rawData: parsedData.beaconData ? parsedData.beaconData.payload : null
        });
        totalLoggedCount++;
    }
    const deviceData = deviceHistory.get(deviceId);
    deviceData.lastSeen = parsedData.lastSeen;
    deviceData.rssiHistory.push(rssi);
    if (parsedData.name !== '[Unbenannt]') deviceData.deviceName = parsedData.name;
    if (parsedData.company !== 'N/A') deviceData.company = parsedData.company;
    deviceData.advertisementHistory.push(parsedData);
    if (appCallbacks.onLogUpdated) {
        appCallbacks.onLogUpdated(deviceData, isNewDevice);
    }
}

/**
 * Ruft die gesammelten Log-Daten für ein einzelnes Gerät ab.
 * (V13.3L, unverändert)
 */
export function getDeviceLog(deviceId) {
    return deviceHistory.get(deviceId);
}

// ... (clearLogs, unverändert) ...

/**
 * Erstellt die V13.2 "Prompt-Export" JSON-Datei.
 * (V13.3N: scanStartTime hinzugefügt)
 */
export async function generateLogFile() {
    console.log("[Logger] Generiere Log-Datei...");
    
    const logData = {
        systemPrompt: AppConfig.Logger.SYSTEM_PROMPT,
        metadata: {
            timestamp: new Date().toISOString(),
            scanStartTime: scanStartTime ? scanStartTime.toISOString() : null, // V13.3N
            totalDevicesLogged: totalLoggedCount,
            devicesInExport: deviceHistory.size,
            version: "BeaconBay V13.3N"
        },
        devices: Array.from(deviceHistory.values()).map(dev => {
            // V13.3L-Logik (unverändert)
            return {
                deviceId: dev.deviceId,
                deviceName: dev.deviceName,
                company: dev.company,
                firstSeen: dev.firstSeen,
                lastSeen: dev.lastSeen,
                advertisementHistory: dev.advertisementHistory.toArray() 
                // ... (andere Felder)
            };
        })
    };

    // ... (Rest der Download-Logik, V13.3L, unverändert) ...
    try {
        const jsonString = JSON.stringify(logData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
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
