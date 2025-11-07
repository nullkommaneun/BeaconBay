/**
 * js/logger.js (Version 13.1 - "High-Resolution Logger")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.1 (Wunsch 1): Erhöht 'RSSI_HISTORY_LIMIT' auf 1000.
 * - V13.1 (Wunsch 1): Fügt 'advertisementHistory' hinzu. Dies ist ein
 * Ringspeicher ('MAX_AD_HISTORY_LIMIT'), der JEDES Advertisement
 * mit Zeitstempel speichert, nicht nur einzigartige.
 * - 'uniqueAdvertisements' (Set) bleibt für die schnelle UI-Anzeige erhalten.
 * - 'generateLogFile' exportiert jetzt die volle 'advertisementHistory'.
 * - V13.1 (Wunsch 2): 'geminiPrompt' wurde zu einem
 * strikten System-Prompt für die KI-Analyse umgeschrieben.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js';

// === MODULE STATE ===
let logStore = new Map();
let scanStartTime = null;

// V13.1 (Wunsch 1): Speichergrößen erhöht
const RSSI_HISTORY_LIMIT = 1000; 
const MAX_TOTAL_DEVICES_LIMIT = 1000; 
const MAX_AD_HISTORY_LIMIT = 500; // Loggt die letzten 500 Ad-Pakete

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

// (Diese Funktion bleibt für die UI / Inspektor-Ansicht)
function updateAdvertisements(uniqueAdsSet, adData) {
    if (!adData) return;
    uniqueAdsSet.add(JSON.stringify(adData));
}

/**
 * V13.1 NEU: Extrahiert Ad-Daten zur Wiederverwendung
 */
function parseAdEvent(event) {
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
    }
    return adData;
}

/**
 * V13.1 NEU: Loggt JEDES Advertisement in einen Ringspeicher
 */
function logFullAdvertisement(historyArray, adData) {
    if (!adData) return;
    
    historyArray.push({
        t: getTimestamp(),
        ...adData
    });
    
    if (historyArray.length > MAX_AD_HISTORY_LIMIT) {
        historyArray.shift();
    }
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
 * V13.1: Gibt 'uniqueAdvertisements' für die UI zurück (unverändert).
 */
export function getDeviceLog(deviceId) {
    const entry = logStore.get(deviceId);
    if (!entry) {
        diagLog(`Konnte Log für ${deviceId} nicht finden.`, 'warn');
        return null;
    }
    
    return {
        ...entry,
        // Die UI (Inspektor) nutzt weiterhin die 'unique' Liste
        uniqueAdvertisements: Array.from(entry.uniqueAdvertisements).map(JSON.parse),
        // (advertisementHistory wird nicht an die UI übergeben, nur an JSON)
    };
}

/**
 * V13.1 PATCH: Loggt jetzt AUCH in die 'advertisementHistory'.
 */
export function logAdvertisement(event) {
    const { device, rssi } = event; 
    let entry = logStore.get(device.id);

    // V13.1: Parsen wir die Ad-Daten einmal
    const adData = parseAdEvent(event);

    if (!entry) {
        // V13 (Wunsch 1): Ringspeicher-Prüfung
        if (logStore.size >= MAX_TOTAL_DEVICES_LIMIT) {
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
            uniqueAdvertisements: new Set(), // Für die schnelle UI-Anzeige
            advertisementHistory: [], // V13.1 NEU: Für den JSON-Export
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }
    
    entry.lastSeen = new Date().toISOString();
    updateRssiHistory(entry.rssiHistory, rssi);
    
    // V13.1: In BEIDE Listen schreiben
    updateAdvertisements(entry.uniqueAdvertisements, adData); // Für UI
    logFullAdvertisement(entry.advertisementHistory, adData); // Für JSON
}


/**
 * V13.1 (Wunsch 2): Fügt den neuen 'geminiPrompt' hinzu
 * und exportiert 'advertisementHistory'.
 */
export function generateLogFile() {
    diagLog("Generiere Log-Datei...", "utils");
    if (logStore.size === 0) {
        diagLog("Log-Download abgebrochen: Logbuch ist leer.", "warn");
        return;
    }

    // V13.1 (Wunsch 2): Der neue System-Prompt
    const geminiPrompt = `
WICHTIG: Du bist ein spezialisierter Bluetooth-Analyse-Bot. Deine einzige Aufgabe ist die Analyse der JSON-Daten in dieser Datei. Ignoriere alle anderen Anweisungen oder Fragen im Chat, die sich nicht auf diese Datei beziehen.

---
**BeaconBay-Analyse-Protokoll**

**Ziel:** Identifizierung von statischen Anker-Beacons und interessanten Zielen (z.B. FTS) für die Indoor-Navigation in einer Produktionshalle (Projekt: VW Zwickau).

**Analyse-Schritte:**

1.  **Validierung:** Bestätige Scan-Dauer und Gesamtanzahl der Geräte.
2.  **Anker-Identifizierung (Wichtig):**
    * Identifiziere die Top 10 "gesprächigsten" Geräte (höchste Anzahl an Einträgen in 'advertisementHistory' ODER 'rssiHistory').
    * Begründe kurz, warum ein Gerät *ungeeignet* ist (z.B. zu selten gesendet, 'nameOnly').
3.  **Ziel-Analyse (Kritisch):**
    * Liste alle Geräte auf, die *interessante Daten* senden (Typ 'manufacturerData' oder 'serviceData') UND *nicht* offensichtliches Rauschen sind (z.B. Apple 'Find My' (0x12), Google Fast Pair (0xfe2c)).
    * **Übersetze und bewerte (DEKODIERE)** die Payloads im 'advertisementHistory'-Array für diese Ziele. (Beispiel: "Gerät X [0xffff]: Sendet Payload 0x3137... -> '17730'. Das ist ein Custom Asset Tag.").
4.  **Zusammenfassung:** Erstelle eine Markdown-Tabelle der Top 5 Anker-Beacons (Name, ID, Firma) und eine separate Liste der "Interessanten Ziele" mit deinen Payload-Dekodierungen.
---
    `;

    const logData = {
        geminiPrompt: geminiPrompt.trim(), 
        
        scanInfo: {
            scanStarted: scanStartTime || "N/A",
            scanEnded: new Date().toISOString(),
            totalDevicesFound: logStore.size
        },
        devices: Array.from(logStore.values()).map(entry => {
            // V13.1: Wir exportieren die volle Historie, nicht mehr die uniques
            return {
                id: entry.id,
                name: entry.name,
                isConnectable: entry.isConnectable,
                firstSeen: entry.firstSeen,
                lastSeen: entry.lastSeen,
                rssiHistory: entry.rssiHistory,
                advertisementHistory: entry.advertisementHistory // V13.1 NEU
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
