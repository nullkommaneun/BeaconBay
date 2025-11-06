/**
 * js/utils.js (Version 12 - "Live Advertisement Decoder")
 * * ARCHITEKTUR-HINWEIS:
 * - V12: Die Funktion 'parseAdvertisementData' wurde massiv erweitert.
 * - Sie dekodiert jetzt gängige Manufacturer- und Service-Daten (Apple, Google)
 * live während des Scans.
 * - Sie fügt ein neues Feld 'decodedData' zum Ergebnis hinzu.
 * - (Behält alle alten Helfer wie hexStringToArrayBuffer bei).
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN: BEACON-PARSING ===

// (Unverändert)
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

// (Unverändert)
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


// === DATENTYPEN-HELFER ===

/**
 * Konvertiert ein ArrayBuffer/DataView-Objekt in einen lesbaren Hex-String.
 * z.B. (0x01, 0x0A) -> "0x01 0A"
 * (Unverändert)
 */
export function dataViewToHex(dataView) {
    if (!dataView) return '';
    let hex = '0x';
    for (let i = 0; i < dataView.byteLength; i++) {
        hex += dataView.getUint8(i).toString(16).padStart(2, '0').toUpperCase() + ' ';
    }
    return hex.trim();
}

/**
 * Konvertiert ein DataView-Objekt in einen UTF-8 Text-String.
 * (Unverändert)
 */
export function dataViewToText(dataView) {
    if (!dataView) return '';
    try {
        return new TextDecoder('utf-8').decode(dataView);
    } catch (e) {
        return '[Hex] ' + dataViewToHex(dataView);
    }
}

/**
 * V11: Konvertiert einen Hex-String in einen ArrayBuffer für GATT-Write.
 * (Unverändert)
 */
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

/**
 * Dekodiert bekannte Characteristic-Werte für den "Smart Driver".
 * (Unverändert)
 */
export function decodeKnownCharacteristic(charUuid, value) {
    if (!value) return "N/A";
    
    switch (charUuid) {
        case '0x2a19': // Battery Level
            return `${value.getUint8(0)} %`;
        case '0x2a1c': // Temperature Measurement
            // (Komplexere Logik für Flags etc. hier vereinfacht)
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


/**
 * Berechnet die ungefähre Distanz (unzuverlässig, nur als Schätzung).
 * (Unverändert)
 */
export function calculateDistance(txPower, rssi) {
    if (!txPower || !rssi) {
        return '? m';
    }
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
        return Math.pow(ratio, 10).toFixed(2) + ' m';
    } else {
        return (0.89976 * Math.pow(ratio, 7.7095) + 0.111).toFixed(2) + ' m';
    }
}


// === V12: "SMARTER SCANNER" DECODER ===

// V12 NEU: Dekodiert Apple-Daten
function decodeAppleData(dataView) {
    if (dataView.byteLength < 2) return null;
    const type = dataView.getUint8(0);
    switch (type) {
        case 0x02: return 'Apple iBeacon'; // (Wird von iBeacon-Logik unten überschrieben)
        case 0x10: return 'Apple AirDrop / Handoff';
        case 0x09: return 'Apple AirPods / Proximity';
        case 0x12: return 'Apple "Find My" (Offline Find)';
        case 0x0C: return 'Apple Continuity (z.B. Watch Unlock)';
        default: return `Apple (Typ 0x${type.toString(16)})`;
    }
}

// V12 NEU: Dekodiert Google Fast Pair
function decodeGoogleFastPair(dataView) {
    // (Vereinfachte Prüfung, nur um es zu identifizieren)
    return 'Google Fast Pair';
}

/**
 * V12 PATCH: Diese Funktion ist jetzt das "Gehirn" des Scanners.
 * Sie parst die Rohdaten des 'advertisementreceived'-Events.
 *
 * @param {Event} event - Das 'advertisementreceived'-Event.
 * @returns {object} Ein sauberes Objekt für UI und Logger.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, timeStamp, manufacturerData, serviceData } = event;

    // Basis-Objekt
    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        lastSeen: timeStamp,
        company: "N/A",
        type: "N/A", // (z.B. iBeacon, Eddystone, manufacturerData)
        decodedData: null, // V12 NEU: (z.B. "Apple Find My")
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple)
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple
        data.company = "Apple, Inc.";
        const appleData = manufacturerData.get(0x004C);
        
        // V12: Dekodiere den Apple-Typ
        data.decodedData = decodeAppleData(appleData);

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            const uuidView = new DataView(appleData.buffer, 4, 16);
            data.beaconData.uuid = Array.from(new Uint8Array(uuidView.buffer, 4, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
            data.beaconData.major = appleData.getUint16(20, false);
            data.beaconData.minor = appleData.getUint16(22, false);
            if (!data.txPower) data.txPower = appleData.getInt8(24); // Kalibrierte Leistung
            return data;
        }
    }

    // 2. Eddystone-Prüfung (Google)
    if (serviceData && serviceData.has(0xFE9F)) { // Eddystone
        data.company = "Google";
        data.type = "Eddystone";
        const eddystoneData = serviceData.get(0xFE9F);
        const frameType = eddystoneData.getUint8(0) >> 4;

        switch (frameType) {
            case 0x0: // UID
                data.type = "Eddystone-UID";
                data.beaconData.uid = dataViewToHex(new DataView(eddystoneData.buffer, 2, 16));
                if (!data.txPower) data.txPower = eddystoneData.getInt8(1);
                break;
            case 0x1: // URL
                data.type = "Eddystone-URL";
                // (URL-Dekodierung hier vereinfacht)
                data.beaconData.url = "http://... (URL)"; 
                if (!data.txPower) data.txPower = eddystoneData.getInt8(1);
                break;
            case 0x2: // TLM (Telemetrie)
                data.type = "Eddystone-TLM";
                data.telemetry.voltage = eddystoneData.getUint16(2, false);
                data.telemetry.temperature = eddystoneData.getInt16(4, false) / 256.0;
                data.telemetry.advCount = eddystoneData.getUint32(6, false);
                data.telemetry.uptime = eddystoneData.getUint32(10, false);
                break;
        }
        return data;
    }

    // 3. V12: Google Fast Pair (Service)
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google";
        data.type = "serviceData";
        data.decodedData = decodeGoogleFastPair(serviceData.get(0xFE2C));
        return data;
    }
    
    // 4. V12: Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        data.company = "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        data.decodedData = "Samsung (z.B. SmartThings Find)";
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        data.type = "manufacturerData";
        // (Holt den ersten Eintrag, den wir finden)
        const [companyId, dataView] = manufacturerData.entries().next().value;
        data.company = `ID: 0x${companyId.toString(16).padStart(4, '0')}`;
        // V12: Standard-Daten-Payload
        data.decodedData = `Hersteller-Daten (${dataView.byteLength} bytes)`;
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        data.type = "serviceData";
        const [uuid, dataView] = serviceData.entries().next().value;
        data.company = "N/A (Service)";
        // V12: Standard-Daten-Payload
        data.decodedData = `Service-Daten (${dataView.byteLength} bytes)`;
        return data;
    }
    
    // 7. Nur-Name (z.B. Flipper)
    if (device.name) {
        data.type = "nameOnly";
        // (Keine decodedData)
        return data;
    }
    
    // Konnte nichts parsen
    diagLog(`Konnte Advertisement nicht parsen für ${device.id}`, 'warn');
    return null; 
}
