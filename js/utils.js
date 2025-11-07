/**
 * js/utils.js (Version 13.2 - "Payload-Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.2 FIX: Behebt den V12.2-Bug, bei dem der rohe 'payload'
 * für generische Manufacturer- und Service-Daten nicht gespeichert wurde.
 * - 'parseAdvertisementData' fügt jetzt 'data.beaconData.payload'
 * für ALLE Datentypen hinzu (nicht nur iBeacon/Eddystone).
 * - Dies behebt den "Payload fehlt"-Fehler in der JSON-Analyse.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN: BEACON-PARSING ===

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
    // Device Information
    ['0x2a29', 'Manufacturer Name String'],
    ['0x2a24', 'Model Number String'],
    ['0x2a25', 'Serial Number String'],
    ['0x2a27', 'Hardware Revision String'],
    ['0x2a26', 'Firmware Revision String'],
    ['0x2a28', 'Software Revision String'],
    // Battery Service
    ['0x2a19', 'Battery Level'],
    // Health Thermometer
    ['0x2a1c', 'Temperature Measurement'],
]);

// V12.2 FIX: Fehlende Map wieder hinzugefügt
let companyIDs = new Map();


// === DATENTYPEN-HELFER ===

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
    hex = hex.replace(/^0x/, ''); // '0x' am Anfang entfernen
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
    if (!value) return "N/A";
    
    switch (charUuid) {
        case '0x2a19': // Battery Level
            return `${value.getUint8(0)} %`;
        case '0x2a1c': // Temperature Measurement
            return `${value.getFloat32(1, true).toFixed(2)} °C`;
        case '0x2a29': // Manufacturer Name
        case '0x2a24': // Model Number
        case '0x2a25': // Serial Number
        case '0x2a27': // Hardware Revision
        case '0x2a26': // Firmware Revision
        case '0x2a28': // Software Revision
            return dataViewToText(value);
        default:
            return dataViewToHex(value);
    }
}

export function calculateDistance(txPower, rssi) {
    if (typeof txPower !== 'number' || typeof rssi !== 'number') {
        return '? m';
    }
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
        return Math.pow(ratio, 10).toFixed(2) + ' m';
    } else {
        return (0.89976 * Math.pow(ratio, 7.7095) + 0.111).toFixed(2) + ' m';
    }
}


// === V12.2: "loadCompanyIDs" WIEDERHERGESTELLT ===

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


// === V12: "SMARTER SCANNER" DECODER ===

function decodeAppleData(dataView) {
    if (dataView.byteLength < 2) return null;
    const type = dataView.getUint8(0);
    switch (type) {
        case 0x02: return 'Apple iBeacon'; 
        case 0x10: return 'Apple AirDrop / Handoff';
        case 0x09: return 'Apple AirPods / Proximity';
        case 0x12: return 'Apple "Find My" (Offline Find)';
        case 0x0C: return 'Apple Continuity (z.B. Watch Unlock)';
        default: return `Apple (Typ 0x${type.toString(16)})`;
    }
}

function decodeGoogleFastPair(dataView) {
    return 'Google Fast Pair';
}

/**
 * V13.2 PATCH: Stellt sicher, dass 'beaconData.payload'
 * IMMER gespeichert wird.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, timeStamp, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        lastSeen: timeStamp,
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple)
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple
        data.company = "Apple, Inc.";
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData);
        data.beaconData.payload = dataViewToHex(appleData); // V13.2 FIX

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            const uuidView = new DataView(appleData.buffer, 4, 16);
            data.beaconData.uuid = Array.from(new Uint8Array(uuidView.buffer, 4, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
            data.beaconData.major = appleData.getUint16(20, false);
            data.beaconData.minor = appleData.getUint16(22, false);
            if (!data.txPower) data.txPower = appleData.getInt8(24); 
            return data;
        }
    }

    // 2. Eddystone-Prüfung (Google)
    if (serviceData && serviceData.has(0xFE9F)) { // Eddystone
        data.company = "Google";
        data.type = "Eddystone";
        const eddystoneData = serviceData.get(0xFE9F);
        data.beaconData.payload = dataViewToHex(eddystoneData); // V13.2 FIX
        
        const frameType = eddystoneData.getUint8(0) >> 4;
        // ... (Restliche Eddystone-Logik)
        return data;
    }

    // 3. Google Fast Pair (Service)
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google";
        data.type = "serviceData";
        const fastPairData = serviceData.get(0xFE2C);
        data.decodedData = decodeGoogleFastPair(fastPairData);
        data.beaconData.payload = dataViewToHex(fastPairData); // V13.2 FIX
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        data.company = "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        const samsungData = manufacturerData.get(0x0075);
        data.decodedData = "Samsung (z.B. SmartThings Find)";
        data.beaconData.payload = dataViewToHex(samsungData); // V13.2 FIX
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        data.type = "manufacturerData";
        const [companyId, dataView] = manufacturerData.entries().next().value;
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (ID: 0x${companyId.toString(16).padStart(4, '0')})`;
        data.decodedData = `Hersteller-Daten (${dataView.byteLength} bytes)`;
        
        // V13.2 FIX: Fehlenden Payload wiederhergestellt
        data.beaconData.payload = dataViewToHex(dataView); 
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        data.type = "serviceData";
        const [uuid, dataView] = serviceData.entries().next().value;
        const shortUuid = uuid.startsWith("0000") ? `0x${uuid.substring(4, 8)}` : uuid;
        data.company = KNOWN_SERVICES.get(shortUuid) || "N/A (Service)";
        data.decodedData = `Service-Daten (${dataView.byteLength} bytes)`;

        // V13.2 FIX: Fehlenden Payload wiederhergestellt
        data.beaconData.payload = dataViewToHex(dataView);
        return data;
    }
    
    // 7. Nur-Name (z.B. Flipper)
    if (device.name) {
        data.type = "nameOnly";
        // (Hier gibt es keinen Payload)
        return data;
    }
    
    diagLog(`Konnte Advertisement nicht parsen für ${device.id}`, 'warn');
    return null; 
}
 
