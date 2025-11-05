/**
 * js/logger.js (Version 3.2 - Neue 'isInteresting'-Logik)
 * * ARCHITEKTUR-HINWEIS:
 * - Ignoriert 'connectable'-Flag, da es unzuverlässig ist.
 * - Speichert stattdessen 'isInteresting', wenn manu/service daten vorhanden sind.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js';

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
 * Die Haupt-Logikfunktion.
 * @param {Event} event - Das rohe 'advertisementreceived'-Event.
 */
export function logAdvertisement(event) {
    // ==== HIER IST DIE NEUE LOGIK ====
    const { device, rssi, manufacturerData, serviceData } = event;
    const isInteresting = (manufacturerData && manufacturerData.size > 0) || 
                          (serviceData && serviceData.size > 0);

    let entry = logStore.get(device.id);

    if (!entry) {
        entry = {
            id: device.id,
            name: device.name || '[Unbenannt]',
            isConnectable: isInteresting, // Speichert unser neues Flag
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            uniqueAdvertisements: new Set(),
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }

    // Aktualisiere 'isConnectable', falls es sich von 'false' auf 'true' ändert.
    if (isInteresting && !entry.isConnectable) {
        entry.isConnectable = true;
    }
    
    entry.lastSeen = new Date().toISOString();
    updateRssiHistory(entry.rssiHistory, rssi);
    updateAdvertisements(entry.uniqueAdvertisements, event);
}


export function generateLogFile() {
    diagLog("Generiere Log-Datei...", "utils");
    if (logStore.size === 0) {
        diagLog("Log-Download abgebrochen: Logbuch ist leer.", "warn");
        return;
    }

    const logData = {
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
