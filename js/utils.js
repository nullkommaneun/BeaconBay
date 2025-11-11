/**
 * js/utils.js (Version 13.3OO - BIBLIOTHEKS-ERWEITERUNG)
 *
 * - VW FTF-FIX V2: Implementiert die KORREKTE Tünkers-Analyse (A-A-A-B-B-C-C).
 * - FLIPPER-FIX: Erkennt Flipper-iBeacons (0x0590).
 * - BIBLIOTHEKS-ERWEITERUNG:
 * - Fügt gängige GATT-Dienste (Eddystone, Sensoren) zu KNOWN_SERVICES hinzu.
 * - Fügt gängige GATT-Merkmale (Sensor-Messungen) zu KNOWN_CHARACTERISTICS hinzu.
 * - Fügt einen Payload-Decoder für RuuviTag (0x0499, Format 5) hinzu.
 * - Fügt einen Payload-Decoder für Eddystone-URLs (Service 0xFEAA) hinzu.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (ERWEITERT) ===
export const KNOWN_SERVICES = new Map([
    // Standard-Dienste
    ['00001800-0000-1000-8000-00805f9b34fb', 'Generic Access'],
    ['00001801-0000-1000-8000-00805f9b34fb', 'Generic Attribute'],
    ['0000180f-0000-1000-8000-00805f9b34fb', 'Battery Service'],
    ['0000180a-0000-1000-8000-00805f9b34fb', 'Device Information'],

    // --- NEU: Gängige Dienste ---
    ['0000180d-0000-1000-8000-00805f9b34fb', 'Heart Rate'],
    ['00001809-0000-1000-8000-00805f9b34fb', 'Health Thermometer'],
    ['00001802-0000-1000-8000-00805f9b34fb', 'Immediate Alert'],
    ['00001803-0000-1000-8000-00805f9b34fb', 'Link Loss'],
    ['00001804-0000-1000-8000-00805f9b34fb', 'Tx Power'],
    
    // --- NEU: Beacon-Dienste ---
    ['0000feaa-0000-1000-8000-00805f9b34fb', 'Eddystone']
]);

export const KNOWN_CHARACTERISTICS = new Map([
    // Generic Access
    ['00002a00-0000-1000-8000-00805f9b34fb', 'Device Name'],
    ['00002a01-0000-1000-8000-00805f9b34fb', 'Appearance'],
    ['00002a04-0000-1000-8000-00805f9b34fb', 'Peripheral Preferred Connection Parameters'],
    // Battery Service
    ['00002a19-0000-1000-8000-00805f9b34fb', 'Battery Level'],
    // Device Information
    ['00002a29-0000-1000-8000-00805f9b34fb', 'Manufacturer Name String'],
    ['00002a24-0000-1000-8000-00805f9b34fb', 'Model Number String'],
    ['00002a25-0000-1000-8000-00805f9b34fb', 'Serial Number String'],
    ['00002a27-0000-1000-8000-00805f9b34fb', 'Hardware Revision String'],
    ['00002a26-0000-1000-8000-00805f9b34fb', 'Firmware Revision String'],
    ['00002a28-0000-1000-8000-00805f9b34fb', 'Software Revision String'],

    // --- NEU: Sensor-Merkmale ---
    ['00002a37-0000-1000-8000-00805f9b34fb', 'Heart Rate Measurement'],
    ['00002a38-0000-1000-8000-00805f9b34fb', 'Body Sensor Location'],
    ['00002a1c-0000-1000-8000-00805f9b34fb', 'Temperature Measurement']
]);

let companyIDs = new Map();

// === DATENTYPEN-HELFER (unverändert) ===

export function dataViewToHex(dataView) {
    if (!dataView) return "";
    let hex = '';
    for (let i = 0; i < dataView.byteLength; i++) {
        let byte = dataView.getUint8(i).toString(16);
        hex += (byte.length < 2 ? '0' : '') + byte;
    }
    return hex.toUpperCase();
}

export function dataViewToText(dataView) {
    if (!dataView) return "";
    try {
        return new TextDecoder().decode(dataView);
    } catch (e) {
        diagLog(`Fehler beim Dekodieren von Text: ${e.message}`, 'error');
        return "[Dekodierfehler]";
    }
}

export function hexStringToArrayBuffer(hex) {
    hex = hex.replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length % 2 !== 0) {
        diagLog(`Ungültiger Hex-String: ${hex}`, 'warn');
        hex = '0' + hex;
    }
    const buffer = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        buffer[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return buffer.buffer;
}

export function decodeKnownCharacteristic(charUuid, value) {
    // ... (Diese Funktion ist unverändert)
    const normalizedUuid = charUuid.toLowerCase();

    // Standard-UUIDs (Strings)
    switch (normalizedUuid) {
        case '00002a00-0000-1000-8000-00805f9b34fb': // Device Name
        case '00002a29-0000-1000-8000-00805f9b34fb': // Manufacturer Name
        case '00002a24-0000-1000-8000-00805f9b34fb': // Model Number
        case '00002a25-0000-1000-8000-00805f9b34fb': // Serial Number
        case '00002a27-0000-1000-8000-00805f9b34fb': // Hardware Revision
        case '00002a26-0000-1000-8000-00805f9b34fb': // Firmware Revision
        case '00002a28-0000-1000-8000-00805f9b34fb': // Software Revision
            return `"${dataViewToText(value)}"`;
    }
    // Standard-UUIDs (Zahlen)
    switch (normalizedUuid) {
        case '00002a19-0000-1000-8000-00805f9b34fb': // Battery Level
            return `${value.getUint8(0)} %`;
        case '00002a01-0000-1000-8000-00805f9b34fb': // Appearance
            return value.getUint16(0, true); // true für Little Endian
    }
    // Fallback: Nur Hex anzeigen
    return `Hex: ${dataViewToHex(value)}`;
}

// === DISTANZ-BERECHNUNG (unverändert) ===

const UMGEBUNGSFAKTOR = 3.5;

export function calculateDistance(txPowerAt1m, rssi) {
    if (txPowerAt1m == null || txPowerAt1m === 0 || rssi == null) {
        return 'N/A';
    }
    try {
        const exponent = (txPowerAt1m - rssi) / (10 * UMGEBUNGSFAKTOR);
        const distance = Math.pow(10, exponent);
        let label = '';
        if (distance < 1.0) {
            label = ' (direkt)';
        } else if (distance < 5.0) {
            label = ' (nah)';
        } else if (distance < 20.0) {
            label = ' (mittel)';
        } else {
            label = ' (fern)';
        }
        return distance.toFixed(2) + ' m' + label;
    } catch (e) {
        diagLog(`Distanz-Fehler: ${e.message}`, 'error');
        return 'Fehler';
    }
}

// === V12.2: "loadCompanyIDs" (unverändert) ===
export async function loadCompanyIDs() {
    try {
        const response = await fetch('companyIDs.json');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        
        companyIDs.clear();
        for (const key in data) {
            if (key.startsWith('0x')) {
                const id = parseInt(key.substring(2), 16);
                companyIDs.set(id.toString(), data[key]);
            }
        }
        diagLog(`Company IDs erfolgreich geladen (${companyIDs.size} Einträge).`, 'utils');
    } catch (err) {
        diagLog(`Fehler beim Laden der companyIDs.json: ${err.message}`, 'error');
    }
}

// === "SMARTER SCANNER" DECODER (ERWEITERT) ===

function decodeAppleData(dataView) {
    // ... (Diese Funktion ist unverändert)
    if (dataView.byteLength < 2) return null;
    if (dataView.getUint8(0) === 0x02 && dataView.getUint8(1) === 0x15) {
        if (dataView.byteLength < 25) {
            return "iBeacon (Unvollständig)";
        }
        const uuidBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + 2, 16);
        const uuid = Array.from(uuidBytes, byte => byte.toString(16).padStart(2, '0')).join('');
        const major = dataView.getUint16(18, false); // Big Endian
        const minor = dataView.getUint16(20, false); // Big Endian
        const txPower = dataView.getInt8(22); // Gemessene Power bei 1m
        return `iBeacon: ${uuid.substring(0, 8)}... (Major: ${major}, Minor: ${minor}, TX: ${txPower})`;
    }
    return "Apple (Kein iBeacon)";
}

function decodeGoogleFastPair(dataView) {
    // ... (Diese Funktion ist unverändert)
    return "Google Fast Pair";
}

// --- NEU: RuuviTag Decoder ---
/**
 * Dekodiert RuuviTag Data Format 5 Payloads.
 * @param {DataView} dataView Die 24-Byte Payload (OHNE die 0x0499 ID).
 * @returns {object} Ein Objekt mit 'decodedData' (String) und 'telemetry' (Objekt).
 */
function decodeRuuviData(dataView) {
    try {
        if (dataView.byteLength < 24 || dataView.getUint8(0) !== 0x05) {
            return { decodedData: "Ruuvi (Unbek. Format)", telemetry: {} };
        }
        
        // Data Format 5
        const temp = dataView.getInt16(1, false);     // Big Endian
        const humi = dataView.getUint16(3, false);    // Big Endian
        const pres = dataView.getUint16(5, false);    // Big Endian
        const volt = dataView.getUint16(13, false);   // Big Endian
        
        // Skalierung anwenden
        const temperature = temp * 0.005;
        const humidity = humi * 0.0025;
        const pressure = (pres + 50000) / 100; // in hPa
        const battery = (volt >> 5) + 1600;     // in mV

        const telemetry = {
            temperature: temperature,
            humidity: humidity,
            pressure: pressure,
            battery: battery
        };
        
        // Formatierter String für die grüne Anzeige
        const decodedData = `Ruuvi: ${temperature.toFixed(2)}°C, ${humidity.toFixed(2)}%, ${pressure.toFixed(2)}hPa`;
        
        return { decodedData, telemetry };

    } catch (e) {
        diagLog(`Ruuvi-Decoder-Fehler: ${e.message}`, 'error');
        return { decodedData: "Ruuvi (Dekodierfehler)", telemetry: {} };
    }
}

// --- NEU: Eddystone Decoder ---
const EDDYSTONE_URL_SCHEMES = [
    'http://www.', 'https://www.', 'http://', 'https://'
];
const EDDYSTONE_URL_ENCODINGS = [
    '.com/', '.org/', '.edu/', '.net/', '.info/', '.biz/', '.gov/',
    '.com', '.org', '.edu', '.net', '.info', '.biz', '.gov'
];

/**
 * Dekodiert Eddystone Payloads (bisher nur URL).
 * @param {DataView} dataView Die Service Data Payload.
 * @returns {string} Ein dekodierter String.
 */
function decodeEddystoneData(dataView) {
    try {
        const frameType = dataView.getUint8(0);
        
        if (frameType === 0x10) { // URL Frame
            const schemeByte = dataView.getUint8(2);
            let url = EDDYSTONE_URL_SCHEMES[schemeByte] || '';
            
            for (let i = 3; i < dataView.byteLength; i++) {
                const byte = dataView.getUint8(i);
                if (byte < 14) {
                    url += EDDYSTONE_URL_ENCODINGS[byte] || '';
                } else {
                    url += String.fromCharCode(byte);
                }
            }
            return `Eddystone-URL: ${url}`;
        }
        
        if (frameType === 0x00) { // UID Frame
            return "Eddystone-UID";
        }

        return "Eddystone (Unbek. Frame)";
        
    } catch (e) {
        diagLog(`Eddystone-Decoder-Fehler: ${e.message}`, 'error');
        return "Eddystone (Dekodierfehler)";
    }
}


/**
 * Haupt-Parser-Funktion (ERWEITERT)
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: null, 
        lastSeen: new Date(),
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple, 0x004C)
    if (manufacturerData && manufacturerData.has(0x004C)) { 
        data.company = companyIDs.get("76") || "Apple, Inc.";
        data.type = "manufacturerData"; 
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData); 
        data.beaconData.payload = dataViewToHex(appleData); 
        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            data.txPower = appleData.getInt8(22); 
        }
        return data;
    }
    
    // --- NEU: Eddystone (Google, 0xFEAA) ---
    // (Hinweis: Wurde von 0xFE9F auf 0xFEAA (offiziell) geändert)
    if (serviceData && serviceData.has(0xFEAA)) { 
        data.company = "Google (Eddystone)";
        data.type = "serviceData";
        const eddystoneData = serviceData.get(0xFEAA);
        data.beaconData.payload = dataViewToHex(eddystoneData); 
        data.decodedData = decodeEddystoneData(eddystoneData); // Nutzt neuen Decoder
        return data;
    }

    // 3. Google Fast Pair (0xFE2C)
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google (Fast Pair)";
        data.type = "serviceData";
        const fastPairData = serviceData.get(0xFE2C);
        data.beaconData.payload = dataViewToHex(fastPairData); 
        data.decodedData = decodeGoogleFastPair(fastPairData); 
        return data;
    }
    
    // 4. Samsung (0x0075)
    if (manufacturerData && manufacturerData.has(0x0075)) { 
        data.company = companyIDs.get("117") || "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        const samsungData = manufacturerData.get(0x0075);
        data.beaconData.payload = dataViewToHex(samsungData); 
        data.decodedData = "Samsung (Dekodierung nicht implementiert)";
        return data;
    }

    // 5. Flipper (als iBeacon-Referenz, 0x0590)
    if (manufacturerData && manufacturerData.has(0x0590)) { 
        data.company = companyIDs.get("1424") || "Flipper Devices Inc."; 
        data.type = "manufacturerData";
        const flipperData = manufacturerData.get(0x0590);
        data.beaconData.payload = dataViewToHex(flipperData);
        if (flipperData.byteLength === 25 && flipperData.getUint8(0) === 0x02 && flipperData.getUint8(1) === 0x15) {
            data.type = "iBeacon (Flipper)";
            data.txPower = flipperData.getInt8(22);
            data.decodedData = decodeAppleData(flipperData); 
        } else {
            data.decodedData = "Flipper (Kein iBeacon)";
        }
        return data;
    }

    // 6. Tünkers FTF (VW-Spezifisch, 0x0118)
    if (manufacturerData && manufacturerData.has(0x0118)) { 
        data.company = companyIDs.get("280") || "Radius Networks (Tünkers)";
        data.type = "manufacturerData";
        const payload = manufacturerData.get(0x0118);
        data.beaconData.payload = dataViewToHex(payload);
        if (payload.byteLength === 7) {
            const a1 = payload.getUint8(0); // A
            const a2 = payload.getUint8(1); // A
            const a3 = payload.getUint8(2); // A
            const b1 = payload.getUint8(3); // B
            const b2 = payload.getUint8(4); // B
            const c1 = payload.getUint8(5); // C
            const c2 = payload.getUint8(6); // C
            const isRedundant = (a1 === a2) && (a2 === a3) && (b1 === b2) && (c1 === c2);
            const isSequential = (b1 === (a1 + 1)) && (c1 === (b1 + 1));
            if (isRedundant && isSequential) {
                const tuenkersID = a1; 
                let ftfTyp = "FTF (Tünkers)"; 
                if (data.name.startsWith("IAA")) {
                    ftfTyp = "Transport FTF";
                } else if (data.name.startsWith("IAC")) {
                    ftfTyp = "Stapler FTF";
                }
                data.decodedData = `${ftfTyp} (Tünkers-ID: ${tuenkersID})`;
                data.type = "FTF (Tünkers)"; 
            } else {
                data.decodedData = "Tünkers (Ungültiges Muster)";
            }
        } else {
            data.decodedData = "Tünkers (Falsche Payload-Länge)";
        }
        return data; 
    }

    // --- NEU: RuuviTag (0x0499) ---
    if (manufacturerData && manufacturerData.has(0x0499)) { // Ruuvi
        data.company = companyIDs.get("1177") || "Ruuvi Innovations Ltd."; // 1177 = 0x0499
        data.type = "manufacturerData";
        const ruuviData = manufacturerData.get(0x0499);
        data.beaconData.payload = dataViewToHex(ruuviData);
        
        // Rufe den neuen Ruuvi-Decoder auf
        const { decodedData, telemetry } = decodeRuuviData(ruuviData);
        data.decodedData = decodedData;
        data.telemetry = telemetry; // Füllt die Telemetrie-Daten!
        
        return data;
    }

    // 7. Andere Herstellerdaten (Fallback)
    if (manufacturerData && manufacturerData.size > 0) {
        const companyId = manufacturerData.keys().next().value;
        const mfgData = manufacturerData.get(companyId);
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (0x${companyId.toString(16).padStart(4, '0')})`;
        data.type = "manufacturerData";
        data.beaconData.payload = dataViewToHex(mfgData); 
        return data;
    }

    // 8. Andere Servicedaten (Fallback)
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        const srvData = serviceData.get(serviceUuid);
        data.company = KNOWN_SERVICES.get(serviceUuid) || `Unbek. Service (${serviceUuid.substring(0, 8)}...)`;
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(srvData); 
        return data;
    }
    
    // 9. Nur-Name (Fallback)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    // 10. (Fallback)
    diagLog(`[Parser] Gerät ${device.id.substring(0,4)}... hat keine Daten (anonym).`, 'utils');
    data.type = "anonymous";
    return data;
}
 
