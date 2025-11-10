/**
 * js/utils.js (Version 13.3JJ - "Parser Fallback Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3JJ FIX: 'parseAdvertisementData' gibt jetzt *immer*
 * ein Datenobjekt zurück (niemals 'null').
 * - Anonyme Beacons (ohne Name/Daten) erhalten den Typ 'anonymous'.
 * - (Behebt den "Silent Failure"-Bug V13.3II).
 * - V13.3Q: (Unverändert) 'lastSeen' ist ein 'new Date()'.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (unverändert) ===
export const KNOWN_SERVICES = new Map([
    ['0x1800', 'Generic Access'],
    ['0x1801', 'Generic Attribute'],
    ['0x1805', 'Current Time Service'],
    ['0x180a', 'Device Information'],
    ['0x180d', 'Heart Rate'],
    ['0x1809', 'Health Thermometer'],
    ['0x180f', 'Battery Service'],
    ['0x1816', 'Cycling Speed and Cadence'],
    ['0xfe9f', 'Google (Eddystone)'],
    ['0xfe2c', 'Google (Fast Pair)'],
]);
export const KNOWN_CHARACTERISTICS = new Map([
    ['0x2a29', 'Manufacturer Name String'],
    ['0x2a24', 'Model Number String'],
    ['0x2a25', 'Serial Number String'],
    ['0x2a27', 'Hardware Revision String'],
    ['0x2a26', 'Firmware Revision String'],
    ['0x2a28', 'Software Revision String'],
    ['0x2a19', 'Battery Level'],
    ['0x2a1c', 'Temperature Measurement'],
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
    if (!dataView) return '';
    try {
        return new TextDecoder('utf-8').decode(dataView);
    } catch (e) {
        return '[Hex] ' + dataViewToHex(dataView);
    }
}
export function hexStringToArrayBuffer(hex) {
    hex = hex.replace(/^0x/, '');
    if (hex.length % 2 !== 0) {
        throw new Error('Ungültige Hex-String-Länge.');
    }
    const buffer = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        buffer[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return buffer.buffer;
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
 * V13.3JJ FIX: Gibt 'null' nicht mehr zurück
 * V13.3Q FIX: (Unverändert) 'lastSeen' ist 'new Date()'
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        lastSeen: new Date(), // V13.3Q
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
        }
        return data;
    }

    // 2. Eddystone-Prüfung (Google)
    if (serviceData && serviceData.has(0xFE9F)) {
        data.company = "Google";
        data.type = "Eddystone";
        // ... (Rest der Eddystone-Logik, unverändert)
        return data;
    }

    // 3. Google Fast Pair (Service)
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google";
        data.type = "serviceData";
        // ... (Rest der Fast Pair-Logik, unverändert)
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) {
        data.company = companyIDs.get("117") || "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        // ... (Rest der Samsung-Logik, unverändert)
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        data.type = "manufacturerData";
        const [companyId, dataView] = manufacturerData.entries().next().value;
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (ID: 0x${companyId.toString(16).padStart(4, '0')})`;
        data.decodedData = `Hersteller-Daten (${dataView.byteLength} bytes)`;
        data.beaconData.payload = dataViewToHex(dataView);
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        data.type = "serviceData";
        const [uuid, dataView] = serviceData.entries().next().value;
        const shortUuid = uuid.startsWith("0000") ? `0x${uuid.substring(4, 8)}` : uuid;
        data.company = KNOWN_SERVICES.get(shortUuid) || `Unbekannter Service (${shortUuid})`;
        data.decodedData = `Service-Daten (${dataView.byteLength} bytes)`;
        data.beaconData.payload = dataViewToHex(dataView);
        return data;
    }
    
    // 7. Nur-Name (z.B. Flipper)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    // V13.3JJ FIX: "Accept All" Fallback
    diagLog(`[Parser] Gerät ${device.id.substring(0,4)}... hat keine Daten (anonym).`, 'utils');
    data.type = "anonymous";
    return data; // <-- DER FIX
}
