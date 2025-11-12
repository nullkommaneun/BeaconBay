/**
 * js/logger.js (Version 14.0 - Memory Optimized)
 * Speichert nur Änderungen (Deltas) statt voller Kopien.
 */

import { AppConfig } from './config.js';
import { RingBuffer } from './ringbuffer.js';
import { diagLog } from './errorManager.js';

let deviceHistory = new Map();
let totalLoggedCount = 0;
let scanStartTime = null;
let appCallbacks = {};

export function initLogger(callbacks) {
    appCallbacks = callbacks || {};
    deviceHistory.clear();
    totalLoggedCount = 0;
    scanStartTime = null;
    // Garbage Collection Hinweis erzwingen (indirekt)
    if (window.gc) window.gc(); 
}

export function setScanStart() {
    scanStartTime = new Date();
}

export function logAdvertisement(device, rssi, parsedData) {
    if (!parsedData) return;
    const deviceId = device.id;
    const now = Date.now(); // Nutze Integer Timestamp (schneller/kleiner)

    // Aufräumen wenn Limit erreicht (FIFO für Devices)
    if (!deviceHistory.has(deviceId) && deviceHistory.size >= AppConfig.Logger.MAX_TOTAL_DEVICES) {
        const oldestKey = deviceHistory.keys().next().value;
        deviceHistory.delete(oldestKey);
    }

    let entry = deviceHistory.get(deviceId);
    let isNew = false;

    // NEUES GERÄT
    if (!entry) {
        isNew = true;
        entry = {
            id: deviceId,
            // Stammdaten (werden nur einmal gespeichert)
            staticData: {
                name: parsedData.name,
                company: parsedData.company,
                type: parsedData.type,
                isFtf: parsedData.isFtf, // Wichtig für Filterung
                firstSeen: now
            },
            // Dynamische Daten
            lastSeen: now,
            rssi: rssi,
            txPower: parsedData.txPower,
            currentPayload: parsedData.beaconData.payload || "",
            
            // Optimierte Historien
            rssiHistory: [], // Speichert nur [timeDiff, rssi]
            payloadHistory: new RingBuffer(AppConfig.Logger.MAX_HISTORY_PER_DEVICE)
        };
        deviceHistory.set(deviceId, entry);
    }

    // UPDATE VORHANDENES GERÄT
    entry.lastSeen = now;
    entry.rssi = rssi;
    if (parsedData.txPower) entry.txPower = parsedData.txPower;

    // 1. RSSI Historie optimieren: Speichere Time-Delta statt absolutem String
    // [Delta in Sekunden, RSSI] -> Spart enorm Platz im RAM/JSON
    const timeSinceStart = scanStartTime ? Math.floor((now - scanStartTime.getTime()) / 1000) : 0;
    // Begrenze RSSI History Array Länge manuell (Array.shift ist langsam, aber hier ok für kleine Arrays)
    if (entry.rssiHistory.length >= 50) entry.rssiHistory.shift();
    entry.rssiHistory.push([timeSinceStart, rssi]);

    // 2. Stammdaten-Update (nur wenn sich was ändert, z.B. Name taucht erst später auf)
    if (parsedData.name !== '[Unbenannt]' && entry.staticData.name === '[Unbenannt]') {
        entry.staticData.name = parsedData.name;
    }
    if (parsedData.isFtf) entry.staticData.isFtf = true;

    // 3. Payload Historie (Deduplizierung!)
    // Wir speichern den Eintrag NUR in die History, wenn sich der Payload ändert 
    // ODER wenn es das erste Mal ist. Sonst aktualisieren wir nur 'lastSeen'.
    const newPayload = parsedData.beaconData.payload || "";
    
    if (newPayload !== entry.currentPayload || entry.payloadHistory.size === 0) {
        entry.currentPayload = newPayload;
        // Speichere kompakten Snapshot
        entry.payloadHistory.push({
            t: timeSinceStart, // Relativer Zeitstempel (Integer)
            r: rssi,
            p: newPayload // Payload nur speichern, wenn neu
        });
    } 
    
    totalLoggedCount++;

    if (appCallbacks.onLogUpdated) {
        // Callback mit gemischten Daten für die UI
        appCallbacks.onLogUpdated({
            ...entry.staticData,
            id: entry.id,
            rssi: entry.rssi,
            lastSeen: new Date(entry.lastSeen)
        }, isNew);
    }
}

export function clearLogs() {
    deviceHistory.clear();
    totalLoggedCount = 0;
    diagLog("Logs geleert.", "utils");
    if (appCallbacks.onLogsCleared) appCallbacks.onLogsCleared();
}

export async function generateLogFile() {
    // VW-spezifischer Prompt (Hardcoded für Stabilität)
    const prompt = `ANALYSE-ANWEISUNG VW-FTF:
1. Suche nach Geräten mit "staticData.isFtf = true". Das sind priorisierte Treffer.
2. Suche nach Payloads, die mit '06C5' (Cypress) oder '91' (Proprietär) beginnen.
3. Ignoriere Apple/Samsung/Consumer Geräte.
4. Analysiere die 'rssiHistory' auf Annäherung (steigende Werte).`;

    // Export-Datenstruktur transformieren (Rehydration für den Analyzer)
    const exportData = {
        systemPrompt: prompt,
        metadata: {
            timestamp: new Date().toISOString(),
            totalPackets: totalLoggedCount,
            deviceCount: deviceHistory.size
        },
        devices: Array.from(deviceHistory.values()).map(d => ({
            deviceId: d.id,
            // Flatten static data
            deviceName: d.staticData.name,
            company: d.staticData.company,
            type: d.staticData.type,
            isFtf: d.staticData.isFtf,
            // Times
            firstSeen: new Date(d.staticData.firstSeen).toISOString(),
            lastSeen: new Date(d.lastSeen).toISOString(),
            // Data
            rawDataPayload: d.currentPayload,
            // Expand RingBuffer
            history: d.payloadHistory.toArray(),
            rssiGraph: d.rssiHistory // [Zeit-Offset, Wert]
        }))
    };

    try {
        const jsonString = JSON.stringify(exportData, null, 2);
        const url = URL.createObjectURL(new Blob([jsonString], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `VW_FTF_Scan_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        diagLog("Export erfolgreich.", "utils");
    } catch (e) {
        console.error(e);
        diagLog("Export Fehler: " + e.message, "error");
    }
}
