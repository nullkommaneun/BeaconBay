/**
 * js/logger.js (Version 9.13 - "Always Connectable" Patch)
 * * ARCHITEKTUR-HINWEIS:
 * - Behebt den "GATT nicht verfügbar"-Bug für "Name Only"-Geräte (z.B. Flipper).
 * - Die fehlerhafte 'isInteresting'-Logik wurde entfernt (parallel zu bluetooth.js V9.12).
 * - 'isConnectable' wird jetzt für JEDES neue Gerät standardmäßig auf 'true' gesetzt.
 */

import { diagLog } from './errorManager.js';
import { dataViewToHex } from './utils.js';

// === MODULE STATE ===
let logStore = new Map();
let scanStartTime = null;
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
 * NEU: Holt alle geloggten Daten für ein einzelnes Gerät.
 * @param {string} deviceId - Die ID des Geräts.
 * @returns {object | null} Das Log-Objekt oder null.
 */
export function getDeviceLog(deviceId) {
    const entry = logStore.get(deviceId);
    if (!entry) {
        diagLog(`Konnte Log für ${deviceId} nicht finden.`, 'warn');
        return null;
    }
    
    // WICHTIG: Wir geben eine KOPIE der Daten zurück,
    // damit die UI nicht versehentlich unseren Logger-Status ändert.
    return {
        ...entry,
        // Konvertiere das Set in ein Array für die UI
        uniqueAdvertisements: Array.from(entry.uniqueAdvertisements).map(JSON.parse)
    };
}

/**
 * V9.13 PATCH: 'isInteresting'-Logik entfernt.
 */
export function logAdvertisement(event) {
    // V9.13: 'manufacturerData'/'serviceData' werden hier nicht mehr benötigt.
    const { device, rssi } = event; 
    
    // V9.13: Fehlerhafte Logik entfernt.
    // const isInteresting = (manufacturerData && manufacturerData.size > 0) || 
    //                       (serviceData && serviceData.size > 0);

    let entry = logStore.get(device.id);

    if (!entry) {
        entry = {
            id: device.id,
            name: device.name || '[Unbenannt]',
            // V9.13 FIX: Immer 'true' setzen.
            isConnectable: true, 
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            uniqueAdvertisements: new Set(),
            rssiHistory: []
        };
        logStore.set(device.id, entry);
    }

    // V9.13: Diese Logik ist jetzt überflüssig und entfernt.
    // if (isInteresting && !entry.isConnectable) {
    //     entry.isConnectable = true;
    // }
    
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
