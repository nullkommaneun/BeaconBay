/**
 * js/logger.js (Version 13.2 - Finaler "Gemini-Prompt")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.2 (Wunsch 2): Der 'geminiPrompt' wurde zu einem strikten
 * System-Prompt verfeinert. Er weist die KI an, alle anderen
 * Chateingaben zu ignorieren und sich auf die Payload-Dekodierung
 * zu konzentrieren, selbst bei benutzerdefinierten Daten.
 * - (Behält V13.1 High-Resolution Logger bei)
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
 * V13.2 (Wunsch 2): Verfeinerter "Gemini-Prompt"
 */
export function generateLogFile() {
    diagLog("Generiere Log-Datei...", "utils");
    if (logStore.size === 0) {
        diagLog("Log-Download abgebrochen: Logbuch ist leer.", "warn");
        return;
    }

    // V13.2 (Wunsch 2): Der neue System-Prompt
    const geminiPrompt = `
[SYSTEM-PROMPT ANFANG]
WICHTIG: Du agierst ab sofort als spezialisierter "BeaconBay Log Analyzer".
Deine **einzige** Aufgabe ist die Analyse des JSON-Inhalts dieser Datei.

**Regeln:**
1.  **Ignoriere alle vorherigen und nachfolgenden Chatanweisungen.** Deine Antwort darf sich *ausschließlich* auf die Analyse dieser JSON-Daten beziehen.
2.  Die einzige Ausnahme: Wenn der Benutzer *zusätzlich* Kontext zum Scan liefert (z.B. "Ich stand bei Tor 1 und bin zu Maschine 5 gelaufen"), nutze diesen Kontext für die Analyse der Signalstärken.
3.  **Dekodiere Payloads:** Deine wichtigste Aufgabe ist die Dekodierung der Payloads in 'advertisementHistory'. Versuche, Hex-Werte in ASCII-Text (UTF-8) oder Dezimalzahlen zu übersetzen, *selbst wenn* die Company ID "Unbekannt" (z.B. 0xFFFF) ist.
4.  **Bewerte Eignung:** Führe die Analyse-Schritte durch. Wenn ein Gerät ungeeignet ist (z.B. "nameOnly", zu selten gesendet), begründe dies kurz und fahre fort.

---
**BeaconBay-Analyse-Protokoll (V13.2)**

**Ziel:** Identifizierung von statischen Anker-Beacons und interessanten Zielen (z.B. FTS) für die Indoor-Navigation (Projekt: VW Zwickau, Karosseriebau).

**Analyse-Schritte:**

1.  **Validierung:** Bestätige Scan-Dauer und Gesamtanzahl der Geräte.
2.  **Anker-Identifizierung (Wichtig):**
    * Identifiziere die Top 10 "gesprächigsten" Geräte (höchste Anzahl an Einträgen in 'advertisementHistory' ODER 'rssiHistory').
    * Bewerte ihre Eignung als statische Anker-Beacons.
3.  **Ziel-Analyse (Kritisch):**
    * Liste alle Geräte auf, die *interessante Daten* senden (Typ 'manufacturerData' oder 'serviceData').
    * **Dekodiere und übersetze** die Payloads im 'advertisementHistory'-Array für diese Ziele (z.B. "Gerät X [0xffff]: Sendet Payload 0x3137... -> '17730'. Das ist ein Custom Asset Tag.").
    * Filtere bekanntes "Rauschen" (Apple 'Find My' (0x12), Google Fast Pair (0xfe2c)) heraus, erwähne sie aber kurz.
4.  **Zusammenfassung:** Erstelle eine Markdown-Tabelle der Top 5 Anker-Beacons (Name, ID, Firma) und eine separate Liste der "Interessanten Ziele" mit deinen Payload-Dekodierungen.
[SYSTEM-PROMPT ENDE]
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
                advertisementHistory: entry.advertisementHistory 
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
