/**
 * js/logger.js (NEUES MODUL)
 * * ARCHITEKTUR-HINWEIS: Layer 1 Modul.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js
 * * ZWECK:
 * 1. Dient als intelligenter Aggregator ("Logbuch") für die Scan-Sitzung.
 * 2. Speichert *nur* einzigartige Advertisements und einen *begrenzten*
 * RSSI-Verlauf, um die Speicher- (und Datei-)Größe zu kontrollieren.
 * 3. Stellt die Download-Funktion via Blob-Erstellung bereit.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js'; // Für die Deduplizierung

// === MODULE STATE ===

/**
 * Das In-Memory-Logbuch.
 * Struktur: Map { 'deviceId' => LogEntryObject }
 * @type {Map<string, object>}
 */
let logStore = new Map();

/**
 * Zeitstempel des Scan-Starts.
 * @type {string | null}
 */
let scanStartTime = null;

// === KONSTANTEN ===

/**
 * Begrenzt die Anzahl der RSSI-Messwerte pro Gerät.
 * 200 Einträge * ~15 Bytes/Eintrag = ~3 KB pro Gerät.
 */
const RSSI_HISTORY_LIMIT = 200;

// === PRIVATE HELPER ===

/**
 * Erstellt einen Zeitstempel-String für den RSSI-Verlauf.
 * @returns {string} Formatierte Zeit (HH:MM:SS).
 */
function getTimestamp() {
    return new Date().toLocaleTimeString('de-DE', { hour12: false });
}

/**
 * Fügt einen neuen RSSI-Wert zu einem "Circular Buffer" (Rolling Array) hinzu.
 * @param {Array<object>} historyArray - Das Array, zu dem hinzugefügt wird.
 * @param {number} rssi - Der neue RSSI-Wert.
 */
function updateRssiHistory(historyArray, rssi) {
    // 1. Neuen Eintrag hinzufügen
    historyArray.push({
        t: getTimestamp(),
        r: rssi
    });
    
    // 2. Ältesten Eintrag entfernen, wenn das Limit überschritten ist
    if (historyArray.length > RSSI_HISTORY_LIMIT) {
        historyArray.shift(); // Entfernt das erste (älteste) Element
    }
}

/**
 * Extrahiert, dedupliziert und speichert Advertisement-Daten.
 * @param {Set<string>} uniqueAdsSet - Das Set für einzigartige Payloads.
 * @param {Event} event - Das rohe Advertisement-Event.
 */
function updateAdvertisements(uniqueAdsSet, event) {
    const { manufacturerData, serviceData } = event;
    let payloadHex = "";
    let adData = {};

    // 1. Prüfe Manufacturer Data
    if (manufacturerData && manufacturerData.size > 0) {
        const [companyId, dataView] = manufacturerData.entries().next().value;
        payloadHex = `MFR|${companyId}|${dataViewToHex(dataView)}`;
        adData = {
            type: "manufacturerData",
            companyId: `0x${companyId.toString(16)}`,
            payload: dataViewToHex(dataView)
        };
    }
    // 2. Prüfe Service Data (z.B. Eddystone)
    else if (serviceData && serviceData.size > 0) {
        const [serviceUuid, dataView] = serviceData.entries().next().value;
        payloadHex = `SVC|${serviceUuid}|${dataViewToHex(dataView)}`;
        adData = {
            type: "serviceData",
            serviceUuid: `0x${serviceUuid.toString(16)}`,
            payload: dataViewToHex(dataView)
        };
    } else {
        return; // Kein relevantes Advertisement
    }

    // 3. Deduplizierung: Füge den Payload nur hinzu, wenn er neu ist.
    // Das Set kümmert sich automatisch um die Einzigartigkeit.
    uniqueAdsSet.add(JSON.stringify(adData)); // (Sets speichern Objekte nicht nach Wert)
}


// === PUBLIC API ===

/**
 * Initialisiert das Logbuch. Wird von app.js aufgerufen.
 */
export function init() {
    logStore.clear();
    scanStartTime = null;
    diagLog("Logger-Modul initialisiert (Logbuch geleert).", "utils");
}

/**
 * Setzt den Startzeitstempel des Scans.
 * Wird von bluetooth.js aufgerufen, wenn der Scan *erfolgreich* startet.
 */
export function setScanStart() {
    scanStartTime = new Date().toISOString();
}

/**
 * Die Haupt-Logikfunktion. Wird von bluetooth.js für JEDES Paket aufgerufen.
 * Aggregiert die Daten intelligent.
 * @param {Event} event - Das rohe 'advertisementreceived'-Event.
 */
export function logAdvertisement(event) {
    const { device, rssi, connectable } = event;

    // 1. Prüfen, ob wir dieses Gerät schon kennen
    let entry = logStore.get(device.id);

    if (!entry) {
        // === NEUES GERÄT ENTDECKT ===
        entry = {
            id: device.id,
            name: device.name || '[Unbenannt]',
            isConnectable: connectable,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            // WICHTIG: Set für einzigartige Payloads
            uniqueAdvertisements: new Set(),
            // WICHTIG: Begrenztes Array für RSSI
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }

    // 2. Daten für JEDES Paket aktualisieren
    entry.lastSeen = new Date().toISOString();
    
    // 3. RSSI-Verlauf aktualisieren (mit Limit)
    updateRssiHistory(entry.rssiHistory, rssi);
    
    // 4. Advertisement-Daten aktualisieren (mit Deduplizierung)
    updateAdvertisements(entry.uniqueAdvertisements, event);
}


/**
 * Erstellt die JSON-Datei und löst den Download-Dialog aus.
 * Wird von app.js (via UI-Callback) aufgerufen.
 */
export function generateLogFile() {
    diagLog("Generiere Log-Datei...", "utils");
    if (logStore.size === 0) {
        diagLog("Log-Download abgebrochen: Logbuch ist leer.", "warn");
        return;
    }

    // 1. Daten für JSON vorbereiten
    const logData = {
        scanInfo: {
            scanStarted: scanStartTime || "N/A",
            scanEnded: new Date().toISOString(),
            totalDevicesFound: logStore.size
        },
        // WICHTIG: Konvertiere die Map in ein Array
        devices: Array.from(logStore.values()).map(entry => {
            // WICHTIG: Konvertiere das Set in ein Array für JSON
            entry.uniqueAdvertisements = Array.from(entry.uniqueAdvertisements).map(JSON.parse);
            return entry;
        })
    };

    try {
        // 2. JSON-String und Blob erstellen
        const jsonString = JSON.stringify(logData, null, 2); // 'null, 2' = Pretty Print
        const blob = new Blob([jsonString], { type: "application/json" });

        // 3. Temporären Download-Link erstellen und klicken
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beaconbay_log_${new Date().toISOString()}.json`;
        
        // WICHTIG: Unsichtbar zum DOM hinzufügen, klicken, entfernen
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Blob-URL freigeben, um Speicherlecks zu vermeiden
        URL.revokeObjectURL(url);
        
        diagLog("Log-Datei erfolgreich generiert.", "info");

    } catch (err) {
        diagLog(`Fehler beim Erstellen der Log-Datei: ${err.message}`, 'error');
    }
}
 
