/**
 * js/utils.js
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 1.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Bereitstellung von reinen Hilfsfunktionen (Utility-Funktionen).
 * 2. Laden von externen Daten (company_ids.json).
 * 3. Kapselung der gesamten Logik zum Parsen von BLE Advertisement-Daten.
 * * WICHTIG: Dieses Modul ist "dumm". Es weiß nichts über die UI oder
 * Bluetooth. Es nimmt nur Rohdaten (ArrayBuffer, DataView) entgegen
 * und gibt strukturierte JS-Objekte zurück.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===

/**
 * Ein Cache für die Company-ID-Zuordnung (Code -> Name).
 * Wird von loadCompanyIDs() befüllt.
 * @type {Map<number, string>}
 */
const companyIdMap = new Map();

// === PUBLIC API: DATA LOADING ===

/**
 * Lädt die JSON-Datei mit den Bluetooth-Hersteller-IDs.
 * * WIE: Verwendet die fetch-API. Dies MUSS in app.js mit 'await'
 * aufgerufen werden, bevor das Scannen beginnt, um sicherzustellen,
 * dass die `companyIdMap` befüllt ist.
 */
export async function loadCompanyIDs() {
    try {
        const response = await fetch('./company_ids.json');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        
        // Konvertiere das Objekt in eine Map für effizientere Lookups.
        // Die JSON-Schlüssel sind Strings (z.B. "0x004C"), wir wandeln sie
        // in Zahlen um, die wir vom BLE-Event erhalten.
        for (const key in data) {
            const numericKey = parseInt(key, 16); // "0x004C" -> 76
            companyIdMap.set(numericKey, data[key]);
        }
        
        diagLog(`Erfolgreich ${companyIdMap.size} Company IDs geladen.`, 'utils');

    } catch (err) {
        diagLog(`Fehler beim Laden von company_ids.json: ${err.message}`, 'error');
        // Wir füllen die Map mit den IDs, die wir manuell parsen,
        // als Notfall-Fallback.
        if (!companyIdMap.has(0x004C)) companyIdMap.set(0x004C, 'Apple, Inc. (Fallback)');
        if (!companyIdMap.has(0x0499)) companyIdMap.set(0x0499, 'Ruuvi Innovations Ltd. (Fallback)');
    }
}

// === PUBLIC API: DATA PARSING ===

/**
 * Der Haupt-Dispatcher für das Parsen von Advertisement-Daten.
 * Diese Funktion wird von bluetooth.js (handleAdvertisement) aufgerufen.
 *
 * @param {Event} event - Das 'advertisementreceived' Event-Objekt.
 * @returns {object | null} Ein strukturiertes Objekt mit den geparsten Daten
 * oder null, wenn die Daten nicht relevant sind.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower } = event;
    const name = device.name || '[Unbenannt]';
    let company = 'Unbekannt';
    let type = 'Generisch';
    let telemetry = {}; // Für Ruuvi-Daten
    let beaconData = {}; // Für iBeacon-Daten

    // 'manufacturerData' ist eine Map (Company ID -> DataView)
    const manufacturerData = event.manufacturerData;
    
    if (manufacturerData && manufacturerData.size > 0) {
        // Wir nehmen den ersten Eintrag. Multi-Hersteller-Daten sind selten.
        const [companyId, dataView] = manufacturerData.entries().next().value;
        
        // Schlage den Firmennamen nach
        company = companyIdMap.get(companyId) || `Unbek. ID (0x${companyId.toString(16)})`;

        // === Parsing-Logik-Dispatcher ===
        // WAS: 0x004C ist die offiziell zugewiesene ID für Apple, Inc.
        if (companyId === 0x004C) { 
            const iBeacon = parseAppleIBeacon(dataView);
            if (iBeacon) {
                type = 'iBeacon';
                beaconData = iBeacon;
            }
        // WAS: 0x0499 ist die offiziell zugewiesene ID für Ruuvi Innovations Ltd.
        } else if (companyId === 0x0499) {
            const ruuvi = parseRuuviTag(dataView);
            if (ruuvi) {
                type = 'RuuviTag (DF5)';
                telemetry = ruuvi.telemetry;
                // Ruuvi sendet txPower auch im Paket, was genauer sein kann
                // txPower = ruuvi.txPower; // (optional überschreiben)
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
        txPower, // Vom Gerät gemeldete Sendeleistung (kann fehlen)
        telemetry,
        beaconData,
        lastSeen: Date.now() // Wichtig für Stale-Checking
    };
}

/**
 * Parst iBeacon-Daten (Apple, 0x004C).
 * iBeacon-Spezifikation:
 * Byte 0-1: 0x0215 (iBeacon-Präfix)
 * Byte 2-17: UUID (16 Bytes)
 * Byte 18-19: Major (2 Bytes, Big Endian)
 * Byte 20-21: Minor (2 Bytes, Big Endian)
 * Byte 22: Gemessene Leistung (TxPower bei 1m)
 *
 * @param {DataView} dataView - Die Rohdaten von 'manufacturerData'.
 * @returns {object | null} Gep_arste iBeacon-Daten oder null bei Fehler.
 */
function parseAppleIBeacon(dataView) {
    try {
        // Prüfen, ob es ein iBeacon ist (Präfix 0x0215)
        // WIE: getUint16(0) liest 2 Bytes (16 Bits) am Offset 0.
        // 'false' bedeutet Big Endian (Standard für Netzwerke/BLE).
        const prefix = dataView.getUint16(0, false); 
        if (prefix !== 0x0215) {
            // Es sind Apple-Daten, aber kein iBeacon (z.B. AirPods)
            return null;
        }

        // UUID (16 Bytes, Offset 2)
        const uuidBytes = [];
        for (let i = 0; i < 16; i++) {
            // getUint8(i + 2) liest 1 Byte am Offset (i + 2)
            let hex = dataView.getUint8(i + 2).toString(16);
            if (hex.length === 1) hex = '0' + hex; // Padding (z.B. "f" -> "0f")
            uuidBytes.push(hex);
        }
        // Formatierung nach 8-4-4-4-12
        const uuid = [
            uuidBytes.slice(0, 4).join(''),
            uuidBytes.slice(4, 6).join(''),
            uuidBytes.slice(6, 8).join(''),
            uuidBytes.slice(8, 10).join(''),
            uuidBytes.slice(10, 16).join('')
        ].join('-');

        // Major (2 Bytes, Offset 18, Big Endian)
        const major = dataView.getUint16(18, false);

        // Minor (2 Bytes, Offset 20, Big Endian)
        const minor = dataView.getUint16(20, false);
        
        // TxPower (1 Byte, Offset 22)
        // WIE: getInt8 liest ein *vorzeichenbehaftetes* 8-Bit-Integer.
        // TxPower ist oft negativ (z.B. -59 dBm).
        const txPower = dataView.getInt8(22);

        return { uuid, major, minor, txPower };

    } catch (err) {
        diagLog(`Fehler beim Parsen von iBeacon-Daten: ${err.message}`, 'error');
        return null;
    }
}

/**
 * Parst RuuviTag-Daten (Data Format 5).
 * Spezifikation (DF5): https://docs.ruuvi.com/communication/bluetooth-advertisements/data-format-5
 *
 * @param {DataView} dataView - Die Rohdaten von 'manufacturerData'.
 * @returns {object | null} Gep_arste Ruuvi-Daten oder null bei Fehler.
 */
function parseRuuviTag(dataView) {
    try {
        // Byte 0: Datenformat (muss 0x05 für DF5 sein)
        const format = dataView.getUint8(0);
        if (format !== 0x05) {
            diagLog(`Unbekanntes Ruuvi-Format empfangen: ${format}`, 'warn');
            return null;
        }

        // Byte 1-2: Temperatur (Int16, Big Endian, 0.005 Grad Celsius)
        // WIE: getInt16(1, false) liest 2 Bytes (vorzeichenbehaftet)
        // ab Offset 1 in Big-Endian-Reihenfolge.
        const tempRaw = dataView.getInt16(1, false);
        // WARUM: Ruuvi-Spezifikation 0.005 Grad pro Bit.
        const temperature = (tempRaw * 0.005).toFixed(2); // 2 Nachkommastellen

        // Byte 3-4: Feuchtigkeit (Uint16, Big Endian, 0.0025 %)
        const humRaw = dataView.getUint16(3, false);
        // WARUM: Ruuvi-Spezifikation 0.0025 % rH pro Bit.
        const humidity = (humRaw * 0.0025).toFixed(2);

        // Byte 5-6: Druck (Uint16, Big Endian, 1 Pascal, Offset 50000)
        const pressRaw = dataView.getUint16(5, false);
        // WARUM: Ruuvi-Spezifikation: Wert = Raw + 50000 (in Pa)
        // Wir rechnen in hPa (Hektopascal / Millibar) um.
        const pressure = ((pressRaw + 50000) / 100).toFixed(2); // Pa -> hPa

        // Byte 7-8: Batteriespannung (Uint16, Big Endian)
        // Byte 9-10: Sendeleistung (Int16, Big Endian)
        // WIE: Die Spannung ist in Bit 5-15 (11 Bits) kodiert.
        // Die Sendeleistung ist in Bit 0-4 (5 Bits) kodiert.
        // Wir müssen Bit-Operationen anwenden.
        
        // Lese die 2 Bytes für Spannung (Offset 7)
        const powerInfo = dataView.getUint16(7, false);

        // WIE (Spannung):
        // 1. Bitmaske 0b1111 1111 1110 0000 (oder 0xFFE0) -> Isoliert die oberen 11 Bits
        // 2. Rechtsshift (>>) um 5 Bits, um die Sendeleistungs-Bits zu entfernen.
        // 3. Offset (1600mV) addieren.
        // 4. In Volt umrechnen (/ 1000).
        const voltageRaw = (powerInfo & 0xFFE0) >> 5;
        const voltage = ((voltageRaw + 1600) / 1000).toFixed(3); // In Volt

        // WIE (TxPower):
        // 1. Bitmaske 0b0000 0000 0001 1111 (oder 0x001F) -> Isoliert die unteren 5 Bits
        // 2. Offset (-40) addieren.
        // 3. Multiplikator (2) anwenden.
        const txPowerRaw = powerInfo & 0x001F;
        // WICHTIG: Prüfen, ob der Wert "ungültig" ist (0b11111)
        let txPower = 'N/A';
        if (txPowerRaw !== 0x1F) {
            txPower = (txPowerRaw * 2) - 40; // in dBm
        }

        return {
            telemetry: {
                temperature, // °C
                humidity,    // %rH
                pressure,    // hPa
                voltage      // V
            },
            txPower
        };

    } catch (err) {
        diagLog(`Fehler beim Parsen von RuuviTag-Daten: ${err.message}`, 'error');
        return null;
    }
}


/**
 * Berechnet die ungefähre Distanz zu einem Beacon.
 * * WARUM: Dies ist eine *sehr* ungenaue Schätzung!
 * RSSI wird stark von Wänden, Wasser (Menschen) und Antennenorientierung
 * beeinflusst. Es dient nur als grober Indikator.
 *
 * @param {number} txPower - Die kalibrierte Sendeleistung des Beacons bei 1 Meter.
 * @param {number} rssi - Die aktuell empfangene Signalstärke.
 * @returns {string} - Die formatierte Distanz (z.B. "1.2m" oder "N/A").
 */
export function calculateDistance(txPower, rssi) {
    if (txPower == null || rssi == null) {
        return 'N/A';
    }
    
    // txPower ist oft 0 bei Geräten, die es nicht explizit senden.
    // Ein txPower von 0 dBm ist extrem stark und unwahrscheinlich.
    // Wir nehmen einen Standard-iBeacon-Wert (-59) als Fallback an.
    if (txPower === 0) {
        txPower = -59; 
    }

    try {
        // Formel zur Distanzberechnung (Log-Distanz-Pfadverlustmodell)
        const ratio = rssi * 1.0 / txPower;
        if (ratio < 1.0) {
            const distance = Math.pow(ratio, 10);
            return `${distance.toFixed(1)} m`;
        } else {
            // (N / 10.0) -> N ist der "Path Loss Exponent" (typ. 2-4, wir nehmen 3)
            const distance = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
            return `${distance.toFixed(1)} m`;
        }
    } catch (err) {
        diagLog(`Distanzberechnung fehlgeschlagen: ${err.message}`, 'warn');
        return 'N/A';
    }
}
