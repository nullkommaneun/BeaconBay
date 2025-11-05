/**
 * js/utils.js (Version 4 - Mit "Known Services"-Wissen)
 * * ARCHITEKTUR-HINWEIS:
 * - Fügt Dictionaries (Maps) für bekannte Services/Characteristics hinzu.
 * - Fügt einen intelligenten 'decodeKnownCharacteristic'-Dispatcher hinzu.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===
const companyIdMap = new Map();
const utf8Decoder = new TextDecoder('utf-8');

// === NEU: WISSENSDATENBANK (GATT) ===

/**
 * Ein "Wörterbuch" für offiziell zugewiesene Service-UUIDs.
 * @type {Map<string, string>}
 */
export const KNOWN_SERVICES = new Map([
    ['0x1800', 'Generic Access'],
    ['0x1801', 'Generic Attribute'],
    ['0x180a', 'Device Information'],
    ['0x180f', 'Battery Service']
]);

/**
 * Ein "Wörterbuch" für offiziell zugewiesene Characteristic-UUIDs.
 * @type {Map<string, string>}
 */
export const KNOWN_CHARACTERISTICS = new Map([
    // Generic Access
    ['0x2a00', 'Device Name'],
    ['0x2a01', 'Appearance'],
    // Device Information
    ['0x2a29', 'Manufacturer Name String'],
    ['0x2a24', 'Model Number String'],
    ['0x2a25', 'Serial Number String'],
    ['0x2a27', 'Hardware Revision String'],
    ['0x2a26', 'Firmware Revision String'],
    ['0x2a28', 'Software Revision String'],
    // Battery Service
    ['0x2a19', 'Battery Level']
]);


// === HILFSFUNKTIONEN (Parsing & Decoding) ===

/**
 * Wandelt ein DataView-Objekt in einen Hexadezimal-String um.
 * @param {DataView} dataView - Die vom Gerät gelesenen Rohdaten.
 * @returns {string} Ein formatierter Hex-String (z.B. "0xDE 0xAD").
 */
export function dataViewToHex(dataView) {
    if (!dataView) return "N/A";
    const hexBytes = [];
    for (let i = 0; i < dataView.byteLength; i++) {
        const byte = dataView.getUint8(i).toString(16).toUpperCase();
        hexBytes.push(byte.length === 1 ? '0' + byte : byte);
    }
    return `0x${hexBytes.join(' ')}`;
}

/**
 * Wandelt ein DataView-Objekt in einen lesbaren Text (UTF-8) um.
 * @param {DataView} dataView 
 * @returns {string} Der decodierte String oder ein Hex-Fallback.
 */
export function dataViewToText(dataView) {
    if (!dataView) return "N/A";
    try {
        return utf8Decoder.decode(dataView);
    } catch (e) {
        return dataViewToHex(dataView); // Fallback
    }
}

/**
 * NEU: Intelligenter Dekodierer für GATT-Werte.
 * Weiß, wie man Standard-Characteristics (z.B. Batterie vs. Text) behandelt.
 * @param {string} charUuid - Die UUID der Characteristic (z.B. '0x2a19').
 * @param {DataView} dataView - Der Rohwert.
 * @returns {string} Der dekodierte, formatierte Wert.
 */
export function decodeKnownCharacteristic(charUuid, dataView) {
    switch (charUuid) {
        // === Text-basierte Werte ===
        case '0x2a00': // Device Name
        case '0x2a29': // Manufacturer Name String
        case '0x2a24': // Model Number String
        case '0x2a25': // Serial Number String
        case '0x2a27': // Hardware Revision String
        case '0x2a26': // Firmware Revision String
        case '0x2a28': // Software Revision String
            return dataViewToText(dataView);

        // === Numerische Werte ===
        case '0x2a19': // Battery Level
            // WIE: Liest 1 Byte (Uint8) und hängt "%" an.
            return dataView.getUint8(0) + ' %';
        
        // === Fallback ===
        default:
            return dataViewToHex(dataView);
    }
}

/**
 * Wandelt einen 10-Byte-Namespace + 6-Byte-Instance in einen Eddystone-UID-String um.
 * @param {DataView} dataView - Das DataView, das *nur* die 16 Bytes der UID enthält.
 * @returns {string} Die formatierte UID.
 */
function bytesToEddystoneUid(dataView) {
    const hex = [];
    for (let i = 0; i < 16; i++) {
        const byte = dataView.getUint8(i).toString(16).toUpperCase();
        hex.push(byte.length === 1 ? '0' + byte : byte);
    }
    return `${hex.slice(0, 10).join('')} (NS) | ${hex.slice(10, 16).join('')} (ID)`;
}


// === PUBLIC API: DATA LOADING ===

export async function loadCompanyIDs() {
    try {
        const response = await fetch('./company_ids.json');
        if (!response.ok) throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        const data = await response.json();
        
        for (const key in data) {
            companyIdMap.set(parseInt(key, 16), data[key]);
        }
        diagLog(`Erfolgreich ${companyIdMap.size} Company IDs geladen.`, 'utils');
    } catch (err) {
        diagLog(`Fehler beim Laden von company_ids.json: ${err.message}`, 'error');
        if (!companyIdMap.has(0x004C)) companyIdMap.set(0x004C, 'Apple, Inc. (Fallback)');
        if (!companyIdMap.has(0x0499)) companyIdMap.set(0x0499, 'Ruuvi Innovations Ltd. (Fallback)');
    }
}

// === PUBLIC API: DATA PARSING (unverändert) ===

export function parseAdvertisementData(event) {
    const { device, rssi, txPower: browserTxPower, serviceData } = event; 
    const name = device.name || '[Unbenannt]';
    let company = 'Unbekannt';
    let type = 'Generisch';
    let telemetry = {};
    let beaconData = {};
    let parsedTxPower = browserTxPower; 

    const manufacturerData = event.manufacturerData;
    if (manufacturerData && manufacturerData.size > 0) {
        const [companyId, dataView] = manufacturerData.entries().next().value;
        company = companyIdMap.get(companyId) || `Unbek. ID (0x${companyId.toString(16)})`;

        if (companyId === 0x004C) {
            const iBeacon = parseAppleIBeacon(dataView);
            if (iBeacon) {
                type = 'iBeacon';
                beaconData = iBeacon;
                parsedTxPower = iBeacon.txPower;
            }
        } else if (companyId === 0x0499) {
            const ruuvi = parseRuuviTag(dataView);
            if (ruuvi) {
                type = 'RuuviTag (DF5)';
                telemetry = ruuvi.telemetry;
                if (ruuvi.txPower !== 'N/A') parsedTxPower = ruuvi.txPower;
            }
        } else {
            type = 'Hersteller-Spezifisch';
        }
    }
    
    if (serviceData && serviceData.has(0xfeaa)) {
        const eddystoneData = parseEddystone(serviceData.get(0xfeaa), rssi);
        if (eddystoneData) {
            type = eddystoneData.type;
            beaconData = { ...beaconData, ...eddystoneData.data };
            if (eddystoneData.txPower) parsedTxPower = eddystoneData.txPower;
            company = "Google (Eddystone)";
        }
    }

    return {
        id: device.id, name, company, type, rssi,
        txPower: parsedTxPower, telemetry, beaconData,
        lastSeen: Date.now(),
    };
}

function parseAppleIBeacon(dataView) {
    try {
        const prefix = dataView.getUint16(0, false);
        if (prefix !== 0x0215 || dataView.byteLength < 23) return null;

        const uuidBytes = [];
        for (let i = 0; i < 16; i++) {
            let hex = dataView.getUint8(i + 2).toString(16);
            if (hex.length === 1) hex = '0' + hex;
            uuidBytes.push(hex);
        }
        const uuid = [
            uuidBytes.slice(0, 4).join(''),
            uuidBytes.slice(4, 6).join(''),
            uuidBytes.slice(6, 8).join(''),
            uuidBytes.slice(8, 10).join(''),
            uuidBytes.slice(10, 16).join('')
        ].join('-');

        const major = dataView.getUint16(18, false);
        const minor = dataView.getUint16(20, false);
        const txPower = dataView.getInt8(22);

        return { uuid, major, minor, txPower };
    } catch (err) {
        diagLog(`Fehler beim Parsen von iBeacon-Daten: ${err.message}`, 'error');
        return null;
    }
}

function parseRuuviTag(dataView) {
    try {
        const format = dataView.getUint8(0);
        if (format !== 0x05 || dataView.byteLength < 11) return null;

        const tempRaw = dataView.getInt16(1, false);
        const temperature = (tempRaw * 0.005).toFixed(2);
        const humRaw = dataView.getUint16(3, false);
        const humidity = (humRaw * 0.0025).toFixed(2);
        const pressRaw = dataView.getUint16(5, false);
        const pressure = ((pressRaw + 50000) / 100).toFixed(2);
        const powerInfo = dataView.getUint16(7, false);
        const voltageRaw = (powerInfo & 0xFFE0) >> 5;
        const voltage = ((voltageRaw + 1600) / 1000).toFixed(3);
        const txPowerRaw = powerInfo & 0x001F;
        let txPower = 'N/A';
        if (txPowerRaw !== 0x1F) txPower = (txPowerRaw * 2) - 40;

        return {
            telemetry: { temperature, humidity, pressure, voltage },
            txPower
        };
    } catch (err) {
        diagLog(`Fehler beim Parsen von RuuviTag-Daten: ${err.message}`, 'error');
        return null;
    }
}

function parseEddystone(dataView, rssi) {
    try {
        const frameType = dataView.getUint8(0);
        let txPower = dataView.getInt8(1); 

        switch (frameType) {
            case 0x00: // Eddystone-UID
                if (dataView.byteLength < 18) return null;
                return {
                    type: 'Eddystone-UID', txPower: txPower,
                    data: { uid: bytesToEddystoneUid(new DataView(dataView.buffer, dataView.byteOffset + 2, 16)) }
                };
            case 0x10: // Eddystone-URL
                if (dataView.byteLength < 4) return null;
                const urlDataView = new DataView(dataView.buffer, dataView.byteOffset + 2);
                return {
                    type: 'Eddystone-URL', txPower: txPower,
                    data: { url: decodeEddystoneUrl(urlDataView) }
                };
            case 0x20: // Eddystone-TLM
                if (dataView.byteLength < 14) return null;
                return {
                    type: 'Eddystone-TLM', txPower: null,
                    data: {
                        telemetry: {
                            voltage: dataView.getUint16(2, false),
                            temperature: dataView.getFloat32(4, false),
                            advCount: dataView.getUint32(8, false),
                            uptime: dataView.getUint32(12, false)
                        }
                    }
                };
            default:
                return null;
        }
    } catch (err) {
        diagLog(`Fehler beim Parsen von Eddystone: ${err.message}`, 'error');
        return null;
    }
}

function decodeEddystoneUrl(dataView) {
    const prefixScheme = ["http://www.", "https://www.", "http://", "https://"];
    const tldEncoding = [
        ".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
        ".com", ".org", ".edu", ".net", ".info/", ".biz", ".gov"
    ];

    let url = "";
    const scheme = dataView.getUint8(0);
    if (scheme < prefixScheme.length) {
        url += prefixScheme[scheme];
    }

    for (let i = 1; i < dataView.byteLength; i++) {
        const code = dataView.getUint8(i);
        if (code < tldEncoding.length) {
            url += tldEncoding[code];
        } else {
            url += String.fromCharCode(code);
        }
    }
    return url;
}

export function calculateDistance(txPower, rssi) {
    if (rssi == null || rssi === 0) return 'N/A (Kein RSSI)';
    let validTxPower = txPower;

    if (validTxPower == null || validTxPower === 0 || validTxPower > 0) {
        validTxPower = -59; // Standard-Fallback
    }

    try {
        const signalLoss = validTxPower - rssi;
        const distance = Math.pow(10, signalLoss / 20); // n=2
        if (distance < 100) return `${distance.toFixed(1)} m`;
        return `${(distance / 1000).toFixed(1)} km`;
    } catch (err) {
        diagLog(`Distanzberechnung fehlgeschlagen: ${err.message}`, 'warn');
        return 'N/A (Berechnungsfehler)';
    }
}
 
