/**
 * js/logger.js (Version 3 - Korrigiert & Robust)
 * * ARCHITEKTUR-HINWEIS: Layer 1 Modul.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js
 * * ZWECK:
 * 1. Intelligenter Aggregator ("Logbuch") für die Scan-Sitzung.
 * 2. Speichert *nur* einzigartige Advertisements und einen *begrenzten*
 * RSSI-Verlauf, um die Speicher- (und Datei-)Größe zu kontrollieren.
 * 3. Stellt die Download-Funktion via Blob-Erstellung bereit.
 *
 * * KORREKTUREN (V3):
 * - Speichert 'isConnectable' jetzt KORREKT im Log-Eintrag (Blinder Fleck #1).
 * - Aktualisiert 'isConnectable', falls es sich von 'false' auf 'true' ändert.
 * - Verwendet konsistente ISO-8601-Zeitstempel.
 * - Erfasst "Name-Only"-Advertisements.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js'; // Für die Deduplizierung

// === MODULE STATE ===

let logStore = new Map();
let scanStartTime = null;

// === KONSTANTEN ===
const RSSI_HISTORY_LIMIT = 200;

// === PRIVATE HELPER ===

function getTimestamp() {
    return new Date().toISOString();
}

function updateRssiHistory(historyArray, rssi) {
    historyArray.push({
        t: getTimestamp(),
        r: rssi
    });
    
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
 * Die Haupt-Logikfunktion. Wird von bluetooth.js für JEDES Paket aufgerufen.
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
            // ==== HIER IST DIE KORREKTUR (Blinder Fleck #1) ====
            isConnectable: connectable, 
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            uniqueAdvertisements: new Set(),
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }

    // === KORREKTUR (Robustheit) ===
    // Aktualisiere 'isConnectable', falls es sich von 'false' auf 'true' ändert.
    // (Ein Gerät könnte 'non-connectable' senden und 1 Sek. später 'connectable')
    if (connectable && !entry.isConnectable) {
        entry.isConnectable = true;
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
        devices: Array.from(logStore.values()).map(entry => {
            // Konvertiere das Set<string> in ein Array<object>
            return {
                ...entry,
                uniqueAdvertisements: Array.from(entry.uniqueAdvertisements).map(JSON.parse)
            };
        })
    };

    try {
        // 2. JSON-String und Blob erstellen
        const jsonString = JSON.stringify(logData, null, 2); // Pretty Print
        const blob = new Blob([jsonString], { type: "application/json" });

        // 3. Temporären Download-Link erstellen und klicken
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
