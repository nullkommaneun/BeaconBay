/**
 * js/logger.js (Version 13.3X - "diagLog Import Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3X FIX: Fügt den fehlenden 'diagLog'-Import hinzu.
 * - (Behebt "diagLog is not defined" Absturz in clearLogs()).
 * - V13.3U: (Unverändert) 'clearLogs()' löst Callback aus.
 * - V13.3R: (Unverändert) Baut ein vollständiges 'deviceData'-Objekt.
 * - V13.3P: (Unverändert) Speichert 'rssiHistory' als Objekt-Array.
 */

// V13.3X-IMPORTS:
import { AppConfig } from './config.js'; 
import { RingBuffer } from './ringbuffer.js'; 
import { diagLog } from './errorManager.js'; // V13.3X FIX: Fehlender Import

// === MODULE STATE ===
let deviceHistory = new Map();
let totalLoggedCount = 0;
let scanStartTime = null; 
let appCallbacks = {}; 

/**
 * V13.3N: (unverändert)
 */
export function setScanStart() {
    scanStartTime = new Date();
    console.log("[Logger] Scan-Startzeitpunkt gesetzt:", scanStartTime);
}

/**
 * V13.3U: (unverändert)
 */
export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null; 
    console.log(`[Logger] Initialisiert. Maximale Geräte: ${AppConfig.Logger.MAX_TOTAL_DEVICES}, Max. Verlauf/Gerät: ${AppConfig.Logger.MAX_HISTORY_PER_DEVICE}`);
}

/**
 * V13.3R: (unverändert)
 */
export function logAdvertisement(device, rssi, parsedData) {
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
            id: deviceId, 
            name: parsedData.name, 
            rssi: rssi,
            txPower: parsedData.txPower, 
            firstSeen: parsedData.lastSeen,
            lastSeen: parsedData.lastSeen,
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

    const deviceData = deviceHistory.get(deviceId);

    deviceData.lastSeen = parsedData.lastSeen;
    deviceData.rssi = rssi;
    deviceData.txPower = parsedData.txPower;

    deviceData.rssiHistory.push({ r: rssi, t: parsedData.lastSeen.toISOString() });
    if (deviceData.rssiHistory.length > AppConfig.Logger.MAX_HISTORY_PER_DEVICE) {
        deviceData.rssiHistory.shift();
    }
    
    if (parsedData.name !== '[Unbenannt]') deviceData.name = parsedData.name;
    if (parsedData.company !== 'N/A') deviceData.company = parsedData.company;
    if (parsedData.type !== 'N/A') deviceData.type = parsedData.type;
    if (parsedData.decodedData) deviceData.decodedData = parsedData.decodedData;
    if (Object.keys(parsedData.beaconData).length > 0) 
        deviceData.beaconData = parsedData.beaconData;
    if (Object.keys(parsedData.telemetry).length > 0) 
        deviceData.telemetry = parsedData.telemetry;
    
    deviceData.advertisementHistory.push(parsedData);

    if (appCallbacks.onLogUpdated) {
        appCallbacks.onLogUpdated(deviceData, isNewDevice);
    }
}

/**
 * V13.3U: (unverändert)
 */
export function getDeviceLog(deviceId) {
    return deviceHistory.get(deviceId);
}

/**
 * V13.3X: Verwendet jetzt 'diagLog' (das importiert wurde).
 */
export function clearLogs() {
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null;
    
    diagLog("Logger-Speicher (deviceHistory) geleert.", "utils"); // V13.3X: Funktioniert jetzt

    if (appCallbacks.onLogsCleared) {
        appCallbacks.onLogsCleared();
    }
}

/**
 * V13.3R: (unverändert)
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
            version: "BeaconBay V13.3X"
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
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BeaconBay_Log_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e) {
        // V13.3X: Dieser Callback funktioniert jetzt auch
        if (appCallbacks.diagLog) { 
            appCallbacks.diagLog(`Log-Generierung fehlgeschlagen: ${e.message}`, 'error');
        } else {
            console.error(`Log-Generierung fehlgeschlagen: ${e.message}`);
        }
    }
}
