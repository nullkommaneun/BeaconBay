/**
 * js/logger.js (Version 13 - "Pro-Logger" Upgrade)
 * * ARCHITEKTUR-HINWEIS:
 * - V13 (Wunsch 1): Implementiert einen 'MAX_TOTAL_DEVICES_LIMIT' (Ringspeicher).
 * Wenn das Limit erreicht ist, wird das älteste Gerät (FIFO)
 * aus dem 'logStore' entfernt, um Speicherabstürze bei Langzeit-Scans
 * zu verhindern.
 * - V13 (Wunsch 2): 'generateLogFile' fügt ein 'geminiPrompt'-Feld
 * an die Spitze der JSON-Datei für die spätere KI-Analyse hinzu.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js';

// === MODULE STATE ===
let logStore = new Map();
let scanStartTime = null;
const RSSI_HISTORY_LIMIT = 200;
const MAX_TOTAL_DEVICES_LIMIT = 1000; // V13 (Wunsch 1): Speicher-Limit

// === PRIVATE HELPER ===
function getTimestamp() {
    return new Date().toISOString();
}
function updateRssiHistory(historyArray, rssi) {
    historyArray.push({ t: getTimestamp(), r: rssi });
    if (historyArray.length > RSSI_HISTORY_LIMIT) {
        historyArray.shift();
    }
}
function updateAdvertisements(uniqueAdsSet, event) {
    const { device, manufacturerData, serviceData } = event;
    let adData = null;

    if (manufacturerData && manufacturerData.size > 0) {
        const [companyId, dataView] = manufacturerData.entries().next().value;
        adData = {
            type: "manufacturerData",
            companyId: `0x${companyId.toString(16)}`,
            payload: dataViewToHex(dataView)
        };
    }
    else if (serviceData && serviceData.size > 0) {
        const [serviceUuid, dataView] = serviceData.entries().next().value;
        adData = {
            type: "serviceData",
            serviceUuid: `0x${serviceUuid.toString(16)}`,
            payload: dataViewToHex(dataView)
        };
    }
    else if (device.name) {
        adData = {
            type: "nameOnly",
            name: device.name
        };
    } else {
        return; 
    }
    uniqueAdsSet.add(JSON.stringify(adData));
}

// === PUBLIC API ===

export function init() {
    logStore.clear();
    scanStartTime = null;
    diagLog("Logger-Modul initialisiert (Logbuch geleert).", "utils");
}

export function setScanStart() {
    scanStartTime = new Date().toISOString();
}

/**
 * Holt alle geloggten Daten für ein einzelnes Gerät.
 * (Unverändert)
 */
export function getDeviceLog(deviceId) {
    const entry = logStore.get(deviceId);
    if (!entry) {
        diagLog(`Konnte Log für ${deviceId} nicht finden.`, 'warn');
        return null;
    }
    
    return {
        ...entry,
        uniqueAdvertisements: Array.from(entry.uniqueAdvertisements).map(JSON.parse)
    };
}

/**
 * V13 (Wunsch 1): Fügt Ringspeicher-Logik hinzu.
 * V9.13: 'isInteresting'-Logik ist entfernt.
 */
export function logAdvertisement(event) {
    const { device, rssi } = event; 
    let entry = logStore.get(device.id);

    if (!entry) {
        
        // V13 (Wunsch 1): Ringspeicher-Prüfung
        if (logStore.size >= MAX_TOTAL_DEVICES_LIMIT) {
            // Map-Objekte sind insertion-ordered. 
            // .keys().next().value holt den ÄLTESTEN Schlüssel (FIFO).
            const oldestKey = logStore.keys().next().value;
            logStore.delete(oldestKey);
            diagLog(`Logger-Limit erreicht. Ältestes Gerät (${oldestKey.substring(0,4)}...) entfernt.`, 'warn');
        }

        entry = {
            id: device.id,
            name: device.name || '[Unbenannt]',
            isConnectable: true, // V9.13 Fix
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            uniqueAdvertisements: new Set(),
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }
    
    entry.lastSeen = new Date().toISOString();
    updateRssiHistory(entry.rssiHistory, rssi);
    updateAdvertisements(entry.uniqueAdvertisements, event);
}


/**
 * V13 (Wunsch 2): Fügt den 'geminiPrompt' hinzu.
 */
export function generateLogFile() {
    diagLog("Generiere Log-Datei...", "utils");
    if (logStore.size === 0) {
        diagLog("Log-Download abgebrochen: Logbuch ist leer.", "warn");
        return;
    }

    // V13 (Wunsch 2): Der Prompt für die Analyse-KI
    const geminiPrompt = `
Hallo Gemini. Dies ist ein Log-Export aus der BeaconBay-Analyse-App.
Bitte analysiere diese JSON-Daten als "Experte für Bluetooth-Indoor-Navigation".

Mein Ziel ist es, eine "Schatzkarte" (Fingerprint-Map) für eine Produktionshalle zu erstellen.
Bitte führe die folgenden Analyseschritte durch:

1.  **Daten-Validierung:** Bestätige die Scan-Dauer und die Gesamtzahl der gefundenen Geräte.
2.  **Identifiziere Statische Anker:** Finde die Top 10-20 "gesprächigsten" Beacons (die mit den meisten RSSI-Einträgen ODER den meisten 'uniqueAdvertisements'). Dies sind wahrscheinlich meine statischen Anker-Beacons.
3.  **Identifiziere Interessante Ziele:** Liste alle Geräte auf, die *nicht* 'nameOnly' sind (d.h. 'manufacturerData' oder 'serviceData' haben) und *keine* offensichtlichen Consumer-Geräte (Apple, Samsung, Google Fast Pair) sind. Suche speziell nach Company IDs wie 0xFFFF (Prototyp) oder 0x1006.
4.  **Zusammenfassung:** Gib mir eine tabellarische Übersicht der wichtigsten 5-10 Anker-Beacons (Name, ID, Firma, Datentyp).
    `;

    const logData = {
        // V13 (Wunsch 2): Hier ist der Prompt
        geminiPrompt: geminiPrompt.trim(), 
        
        scanInfo: {
            scanStarted: scanStartTime || "N/A",
            scanEnded: new Date().toISOString(),
            totalDevicesFound: logStore.size
        },
        devices: Array.from(logStore.values()).map(entry => {
            return {
                ...entry,
                uniqueAdvertisements: Array.from(entry.uniqueAdvertisements).map(JSON.parse)
            };
        })
    };

    try {
        const jsonString = JSON.stringify(logData, null, 2); 
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beaconbay_log_${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        diagLog("Log-Datei erfolgreich generiert.", "info");
    } catch (err) {
        diagLog(`Fehler beim Erstellen der Log-Datei: ${err.message}`, 'error');
    }
}
 
