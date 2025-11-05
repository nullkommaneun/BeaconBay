/**
 * js/utils.js (Version 2 - Robuste Distanzberechnung)
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 1.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Bereitstellung von Hilfsfunktionen.
 * 2. Laden von company_ids.json.
 * 3. Kapselung der gesamten BLE Advertisement-Parsing-Logik.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===
/**
 * Cache für die Company-ID-Zuordnung (Code -> Name).
 * @type {Map<number, string>}
 */
const companyIdMap = new Map();

// === PUBLIC API: DATA LOADING ===

/**
 * Lädt die JSON-Datei mit den Bluetooth-Hersteller-IDs.
 */
export async function loadCompanyIDs() {
    try {
        const response = await fetch('./company_ids.json');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        
        for (const key in data) {
            const numericKey = parseInt(key, 16); // "0x004C" -> 76
            companyIdMap.set(numericKey, data[key]);
        }
        
        diagLog(`Erfolgreich ${companyIdMap.size} Company IDs geladen.`, 'utils');

    } catch (err) {
        diagLog(`Fehler beim Laden von company_ids.json: ${err.message}`, 'error');
        // Fallback
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
    // WIE: Wir benennen txPower vom Browser um, da es unzuverlässig ist.
    const { device, rssi, txPower: browserTxPower } = event; 
    const name = device.name || '[Unbenannt]';
    let company = 'Unbekannt';
    let type = 'Generisch';
    let telemetry = {};
    let beaconData = {};
    // WIR: Wir verwenden den unzuverlässigen Browser-Wert als Fallback.
    let parsedTxPower = browserTxPower; 

    const manufacturerData = event.manufacturerData;
    
    if (manufacturerData && manufacturerData.size > 0) {
        const [companyId, dataView] = manufacturerData.entries().next().value;
        company = companyIdMap.get(companyId) || `Unbek. ID (0x${companyId.toString(16)})`;

        // === Parsing-Logik-Dispatcher ===
        if (companyId === 0x004C) { // Apple
            const iBeacon = parseAppleIBeacon(dataView);
            if (iBeacon) {
                type = 'iBeacon';
                beaconData = iBeacon;
                // WICHTIG: Verwende den zuverlässigen TxPower-Wert aus dem Paket!
                parsedTxPower = iBeacon.txPower;
            }
        } else if (companyId === 0x0499) { // Ruuvi
            const ruuvi = parseRuuviTag(dataView);
            if (ruuvi) {
                type = 'RuuviTag (DF5)';
                telemetry = ruuvi.telemetry;
                if (ruuvi.txPower !== 'N/A') {
                    parsedTxPower = ruuvi.txPower;
                }
            }
        } else {
            type = 'Hersteller-Spezifisch';
        }
    }

    return {
        id: device.id,
        name,
        company,
        type,
        rssi,
        txPower: parsedTxPower, // Der (hoffentlich) bessere Wert
        telemetry,
        beaconData,
        lastSeen: Date.now()
    };
}

/**
 * Parst iBeacon-Daten (Apple, 0x004C).
 * @param {DataView} dataView - Die Rohdaten von 'manufacturerData'.
 * @returns {object | null} Gep_arste iBeacon-Daten oder null bei Fehler.
 */
function parseAppleIBeacon(dataView) {
    try {
        // iBeacon-Spezifikation: 0x0215 (Präfix) + 21 Bytes Daten = 23 Bytes
        const prefix = dataView.getUint16(0, false); // Big Endian
        if (prefix !== 0x0215 || dataView.byteLength < 23) {
            return null; // Kein iBeacon
        }

        // UUID (16 Bytes, Offset 2)
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

        const major = dataView.getUint16(18, false); // Major (Offset 18)
        const minor = dataView.getUint16(20, false); // Minor (Offset 20)
        const txPower = dataView.getInt8(22); // TxPower (Offset 22)

        return { uuid, major, minor, txPower };

    } catch (err) {
        diagLog(`Fehler beim Parsen von iBeacon-Daten: ${err.message}`, 'error');
        return null;
    }
}

/**
 * Parst RuuviTag-Daten (Data Format 5).
 * @param {DataView} dataView - Die Rohdaten von 'manufacturerData'.
 * @returns {object | null} Gep_arste Ruuvi-Daten oder null bei Fehler.
 */
function parseRuuviTag(dataView) {
    try {
        const format = dataView.getUint8(0);
        // Ruuvi DF5 Spezifikation: min 11 Bytes
        if (format !== 0x05 || dataView.byteLength < 11) {
            return null;
        }

        // Byte 1-2: Temperatur (Int16, Big Endian, 0.005 Grad Celsius)
        const tempRaw = dataView.getInt16(1, false);
        const temperature = (tempRaw * 0.005).toFixed(2);

        // Byte 3-4: Feuchtigkeit (Uint16, Big Endian, 0.0025 %)
        const humRaw = dataView.getUint16(3, false);
        const humidity = (humRaw * 0.0025).toFixed(2);

        // Byte 5-6: Druck (Uint16, Big Endian, 1 Pascal, Offset 50000)
        const pressRaw = dataView.getUint16(5, false);
        const pressure = ((pressRaw + 50000) / 100).toFixed(2); // Pa -> hPa

        // Byte 7-8: Batteriespannung & TxPower
        const powerInfo = dataView.getUint16(7, false);

        // Spannung: Bit 5-15 (11 Bits)
        const voltageRaw = (powerInfo & 0xFFE0) >> 5;
        const voltage = ((voltageRaw + 1600) / 1000).toFixed(3); // In Volt

        // TxPower: Bit 0-4 (5 Bits)
        const txPowerRaw = powerInfo & 0x001F;
        let txPower = 'N/A';
        if (txPowerRaw !== 0x1F) { // 0b11111 = ungültig
            txPower = (txPowerRaw * 2) - 40; // in dBm
        }

        return {
            telemetry: { temperature, humidity, pressure, voltage },
            txPower
        };

    } catch (err) {
        diagLog(`Fehler beim Parsen von RuuviTag-Daten: ${err.message}`, 'error');
        return null;
    }
}


/**
 * Berechnet die ungefähre Distanz zu einem Beacon.
 * * KORRIGIERTE VERSION (Robust) *
 * @param {number | null} txPower - Die kalibrierte Sendeleistung (TxPower bei 1 Meter).
 * @param {number} rssi - Die aktuell empfangene Signalstärke (RSSI).
 * @returns {string} - Die formatierte Distanz (z.B. "1.2m" oder "N/A").
 */
export function calculateDistance(txPower, rssi) {
    if (rssi == null || rssi === 0) {
        return 'N/A (Kein RSSI)';
    }

    let validTxPower = txPower;

    // WARUM: Validierung von txPower.
    // Echte dBm-Werte sind (fast) immer negativ.
    // Ein Wert von 0, null, undefined oder ein positiver Wert ist
    // ein klares Zeichen für unzuverlässige Daten (z.B. vom Browser-Event).
    if (validTxPower == null || validTxPower === 0 || validTxPower > 0) {
        // Wir verwenden einen Standard-iBeacon-Wert (-59) als Fallback.
        validTxPower = -59; 
    }

    try {
        // WIE: Standard "Log-Distanz-Pfadverlust"-Formel.
        // d = 10 ^ ((TxPower - RSSI) / (10 * n))
        // n = "Path Loss Exponent" (typischerweise 2.0)
        
        const signalLoss = validTxPower - rssi;
        
        // Wir nehmen n=2 an (Exponent 20 = 10 * 2)
        const distance = Math.pow(10, signalLoss / 20); 

        // Formatiere das Ergebnis
        if (distance < 100) {
            return `${distance.toFixed(1)} m`;
        } else {
            return `${(distance / 1000).toFixed(1)} km`;
        }

    } catch (err) {
        diagLog(`Distanzberechnung fehlgeschlagen: ${err.message}`, 'warn');
        return 'N/A (Berechnungsfehler)';
    }
}
/**
 * Wandelt ein DataView-Objekt in einen Hexadezimal-String um.
 * @param {DataView} dataView - Die vom Gerät gelesenen Rohdaten.
 * @returns {string} Ein formatierter Hex-String (z.B. "0xDE 0xAD 0xBE 0xEF").
 */
export function dataViewToHex(dataView) {
    if (!dataView) {
        return "N/A";
    }
    const hexBytes = [];
    for (let i = 0; i < dataView.byteLength; i++) {
        const byte = dataView.getUint8(i).toString(16).toUpperCase();
        hexBytes.push(byte.length === 1 ? '0' + byte : byte);
    }
    return `0x${hexBytes.join(' ')}`;
}

/**
 * Wandelt ein DataView-Objekt in einen lesbaren Text (UTF-8) um.
 * Fängt Fehler ab, falls es keine gültigen Textdaten sind.
 * @param {DataView} dataView 
 * @returns {string} Der decodierte String oder ein Hex-Fallback.
 */
export function dataViewToText(dataView) {
    if (!dataView) {
        return "N/A";
    }
    try {
        // TextDecoder ist die moderne Art, ArrayBuffer in Strings umzuwandeln
        return new TextDecoder('utf-8').decode(dataView);
    } catch (e) {
        // Fallback auf Hex, wenn es kein gültiger UTF-8-Text ist
        return dataViewToHex(dataView);
    }
}
