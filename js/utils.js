/**
 * js/utils.js (Version 3 - Mit Eddystone-Parser)
 * * ARCHITEKTUR-HINWEIS:
 * - parseAdvertisementData prüft jetzt auch event.serviceData.
 * - Fügt parseEddystone() hinzu, um Eddystone-UID, -URL und -TLM
 * (Telemetry) Frames zu parsen.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===
const companyIdMap = new Map();
// NEU: TextDecoder für Eddystone-URL
const utf8Decoder = new TextDecoder('utf-8');

// === HILFSFUNKTIONEN (am Anfang für die Parser) ===

/**
 * Wandelt ein DataView-Objekt in einen Hexadezimal-String um.
 * @param {DataView} dataView - Die vom Gerät gelesenen Rohdaten.
 * @returns {string} Ein formatierter Hex-String (z.B. "0xDE 0xAD 0xBE 0xEF").
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

// === PUBLIC API: DATA PARSING ===

/**
 * Der Haupt-Dispatcher für das Parsen von Advertisement-Daten.
 * @param {Event} event - Das 'advertisementreceived' Event-Objekt.
 * @returns {object | null} Ein strukturiertes Objekt mit den geparsten Daten.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower: browserTxPower, serviceData } = event; 
    const name = device.name || '[Unbenannt]';
    let company = 'Unbekannt';
    let type = 'Generisch';
    let telemetry = {};
    let beaconData = {};
    let parsedTxPower = browserTxPower; 

    // --- PARSE-LOGIK 1: Manufacturer Data (iBeacon, Ruuvi, etc.) ---
    const manufacturerData = event.manufacturerData;
    if (manufacturerData && manufacturerData.size > 0) {
        const [companyId, dataView] = manufacturerData.entries().next().value;
        company = companyIdMap.get(companyId) || `Unbek. ID (0x${companyId.toString(16)})`;

        if (companyId === 0x004C) { // Apple
            const iBeacon = parseAppleIBeacon(dataView);
            if (iBeacon) {
                type = 'iBeacon';
                beaconData = iBeacon;
                parsedTxPower = iBeacon.txPower;
            }
        } else if (companyId === 0x0499) { // Ruuvi
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
    
    // --- PARSE-LOGIK 2: Service Data (Eddystone) ---
    // WIE: Eddystone sendet unter der Service UUID 0xFEAA.
    if (serviceData && serviceData.has(0xfeaa)) {
        const eddystoneData = parseEddystone(serviceData.get(0xfeaa), rssi);
        if (eddystoneData) {
            type = eddystoneData.type; // z.B. "Eddystone-URL"
            beaconData = { ...beaconData, ...eddystoneData.data };
            if (eddystoneData.txPower) parsedTxPower = eddystoneData.txPower;
            company = "Google (Eddystone)"; // Überschreibt ggf. "Unbekannt"
        }
    }

    return {
        id: device.id,
        name,
        company,
        type,
        rssi,
        txPower: parsedTxPower,
        telemetry,
        beaconData,
        lastSeen: Date.now(),
        // Das 'isConnectable' Flag wird von bluetooth.js hinzugefügt!
    };
}

/**
 * Parst Eddystone-Daten (Service UUID 0xFEAA).
 * @param {DataView} dataView - Die Rohdaten von 'serviceData'.
 * @param {number} rssi - Der aktuelle RSSI (nur für TLM-Kalkulation nötig).
 * @returns {object | null} Gep_arste Eddystone-Daten oder null.
 */
function parseEddystone(dataView, rssi) {
    try {
        const frameType = dataView.getUint8(0);
        let txPower = dataView.getInt8(1); // UID und URL haben TxPower an Byte 1

        switch (frameType) {
            // === Frame-Typ 0x00: Eddystone-UID ===
            case 0x00:
                // 16 Bytes (10 NS, 6 ID) + 2 RFU-Bytes
                if (dataView.byteLength < 18) return null;
                return {
                    type: 'Eddystone-UID',
                    txPower: txPower,
                    data: {
                        uid: bytesToEddystoneUid(new DataView(dataView.buffer, dataView.byteOffset + 2, 16))
                    }
                };

            // === Frame-Typ 0x10: Eddystone-URL ===
            case 0x10:
                if (dataView.byteLength < 4) return null;
                const urlDataView = new DataView(dataView.buffer, dataView.byteOffset + 2);
                return {
                    type: 'Eddystone-URL',
                    txPower: txPower,
                    data: {
                        url: decodeEddystoneUrl(urlDataView)
                    }
                };
                
            // === Frame-Typ 0x20: Eddystone-TLM (Telemetry) ===
            case 0x20:
                if (dataView.byteLength < 14) return null;
                // TLM (unverschlüsselt)
                return {
                    type: 'Eddystone-TLM',
                    txPower: null, // TLM hat keine TxPower in diesem Frame
                    data: {
                        telemetry: {
                            voltage: dataView.getUint16(2, false), // mV
                            temperature: dataView.getFloat32(4, false), // Grad Celsius
                            advCount: dataView.getUint32(8, false),
                            uptime: dataView.getUint32(12, false) // 0.1s Einheiten
                        }
                    }
                };
                
            default:
                diagLog(`Unbekannter Eddystone Frame-Typ: 0x${frameType.toString(16)}`, 'utils');
                return null;
        }
    } catch (err) {
        diagLog(`Fehler beim Parsen von Eddystone: ${err.message}`, 'error');
        return null;
    }
}

/**
 * Decodiert die komprimierte URL aus einem Eddystone-URL-Frame.
 * @param {DataView} dataView - Das DataView, das *ab Byte 2* des Frames beginnt.
 * @returns {string} Die vollständige URL.
 */
function decodeEddystoneUrl(dataView) {
    const prefixScheme = [
        "http://www.", "https://www.", "http://", "https://"
    ];
    const tldEncoding = [
        ".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
        ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"
    ];

    let url = "";
    const scheme = dataView.getUint8(0); // URL-Schema-Präfix
    if (scheme < prefixScheme.length) {
        url += prefixScheme[scheme];
    }

    for (let i = 1; i < dataView.byteLength; i++) {
        const code = dataView.getUint8(i);
        if (code < tldEncoding.length) {
            url += tldEncoding[code]; // TLD-Erweiterung
        } else {
            url += String.fromCharCode(code); // Normales Zeichen
        }
    }
    return url;
}


// --- Parser für iBeacon und Ruuvi (unverändert) ---

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

// --- Robuste Distanzberechnung (unverändert) ---

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
