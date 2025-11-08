/**
 * js/utils.js (Version 13.3Q - "Timestamp Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3Q FIX: 'parseAdvertisementData' erzeugt jetzt 'new Date()'
 * für 'lastSeen'. Das 'timeStamp' vom Event (DOMHighResTimeStamp)
 * ist ein relativer Zeitstempel (seit Seiten-Laden) und
 * KEIN Unix-Zeitstempel.
 * - V13.2: (Unverändert) Speichert 'beaconData.payload'.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (unverändert) ===
export const KNOWN_SERVICES = new Map([
    ['0x1800', 'Generic Access'],
    ['0x1801', 'Generic Attribute'],
    // ... (Rest der Map)
]);
export const KNOWN_CHARACTERISTICS = new Map([
    ['0x2a29', 'Manufacturer Name String'],
    ['0x2a24', 'Model Number String'],
    // ... (Rest der Map)
]);
let companyIDs = new Map();


// === DATENTYPEN-HELFER (unverändert) ===
export function dataViewToHex(dataView) {
    if (!dataView) return '';
    let hex = '0x';
    for (let i = 0; i < dataView.byteLength; i++) {
        hex += dataView.getUint8(i).toString(16).padStart(2, '0').toUpperCase() + ' ';
    }
    return hex.trim();
}
export function dataViewToText(dataView) {
    // ... (unverändert)
}
export function hexStringToArrayBuffer(hex) {
    // ... (unverändert)
}
export function decodeKnownCharacteristic(charUuid, value) {
    // ... (unverändert)
}
export function calculateDistance(txPower, rssi) {
    // ... (unverändert)
}


// === V12.2: "loadCompanyIDs" (unverändert) ===
export async function loadCompanyIDs() {
    try {
        const response = await fetch('company_ids.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const ids = await response.json();
        companyIDs = new Map(Object.entries(ids));
        diagLog(`Erfolgreich ${companyIDs.size} Company IDs geladen.`, 'utils');
    } catch (e) {
        diagLog(`Fehler beim Laden der company_ids.json: ${e.message}`, 'error');
    }
}


// === V12: "SMARTER SCANNER" DECODER (unverändert) ===
function decodeAppleData(dataView) {
    // ... (unverändert)
}
function decodeGoogleFastPair(dataView) {
    // ... (unverändert)
}

/**
 * V13.3Q FIX: 'lastSeen' ist jetzt ein 'new Date()'
 * V13.2 PATCH: (Unverändert) Speichert 'beaconData.payload'
 */
export function parseAdvertisementData(event) {
    // V13.3Q: Wir ignorieren 'timeStamp' (relativ)
    const { device, rssi, txPower, /* timeStamp, */ manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        
        // V13.3Q FIX: Erzeuge ein echtes Datumsobjekt.
        // 'timeStamp' vom Event ist nutzlos (relativ zur Ladezeit).
        lastSeen: new Date(), 
        
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple)
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple
        data.company = companyIDs.get("76") || "Apple, Inc.";
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData);
        data.beaconData.payload = dataViewToHex(appleData); 

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            // ... (Rest der iBeacon-Logik, unverändert)
            return data;
        }
        return data;
    }

    // 2. Eddystone-Prüfung (Google)
    if (serviceData && serviceData.has(0xFE9F)) { // Eddystone
        // ... (unverändert)
        return data;
    }

    // 3. Google Fast Pair (Service)
    if (serviceData && serviceData.has(0xFE2C)) {
        // ... (unverändert)
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        // ... (unverändert)
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        // ... (unverändert)
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        // ... (unverändert)
        return data;
    }
    
    // 7. Nur-Name (z.B. Flipper)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    diagLog(`Konnte Advertisement nicht parsen für ${device.id}`, 'warn');
    return null; 
}
 
