/**
 * js/utils.js (Version 2 - Robuste Distanzberechnung)
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 1.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Bereitstellung von reinen Hilfsfunktionen (Utility-Funktionen).
 * 2. Laden von externen Daten (company_ids.json).
 * 3. Kapselung der gesamten Logik zum Parsen von BLE Advertisement-Daten.
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
        for (const key in data) {
            const numericKey = parseInt(key, 16); // "0x004C" -> 76
            companyIdMap.set(numericKey, data[key]);
        }
        
        diagLog(`Erfolgreich ${companyIdMap.size} Company IDs geladen.`, 'utils');

    } catch (err) {
        diagLog(`Fehler beim Laden von company_ids.json: ${err.message}`, 'error');
        // Fallback: Manuelles Hinzufügen der IDs, die wir parsen können
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
    const { device, rssi, txPower: browserTxPower } = event; // Browser-Wert umbenannt
    const name = device.name || '[Unbenannt]';
    let company = 'Unbekannt';
    let type = 'Generisch';
    let telemetry = {}; // Für Ruuvi-Daten
    let beaconData = {}; // Für iBeacon-Daten
    let parsedTxPower = browserTxPower; // Starten mit dem Browser-Wert

    // 'manufacturerData' ist eine Map (Company ID -> DataView)
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
                // WICHTIG: Verwende den zuverlässigen TxPower-Wert aus dem iBeacon-Paket!
                parsedTxPower = iBeacon.txPower;
            }
        } else if (companyId === 0x0499) { // Ruuvi
            const ruuvi = parseRuuviTag(dataView);
            if (ruuvi) {
                type = 'RuuviTag (DF5)';
                telemetry = ruuvi.telemetry;
                // Ruuvi sendet auch einen TxPower-Wert
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
 * Spezifikation:
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
        const prefix = dataView.getUint16(0, false); // Big Endian
        if (prefix !== 0x0215 || dataView.byteLength < 23) {
            // Es sind Apple-Daten, aber kein iBeacon (z.B. AirPods)
            // oder das Paket ist zu kurz
            return null;
        }

        // UUID (16 Bytes, Offset 2)
        const uuidBytes = [];
        for (let i = 0; i < 16; i++) {
            let hex = dataView.getUint8(i + 2).toString(16);
            if (hex.length === 1) hex = '0' + hex; // Padding
            uuidBytes.push(hex);
        }
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
        if (format !== 0x05 || dataView.byteLength < 11) {
            diagLog(`Unbekanntes Ruuvi-Format (${format}) oder zu kurzes Paket.`, 'warn');
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

        // Byte 7-8: Batteriespannung
        // Byte 9-10: Sendeleistung
        const powerInfo = dataView.getUint16(7, false);

        // Spannung: Bit 5-15 (11 Bits)
        const voltageRaw = (powerInfo & 0xFFE0) >> 5;
        const voltage = ((voltageRaw + 1600) / 1000).toFixed(3); // In Volt

        // TxPower: Bit 0-4 (5 Bits)
        const txPowerRaw = powerInfo & 0x001F;
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
 * * KORRIGIERTE VERSION (Robust) *
 * * @param {number | null} txPower - Die kalibrierte Sendeleistung des Beacons bei 1 Meter.
 * Dies kann der unzuverlässige Wert vom Browser-Event sein.
 * @param {number} rssi - Die aktuell empfangene Signalstärke.
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
    // ein klares Zeichen für unzuverlässige Daten vom Browser-Event.
    if (validTxPower == null || validTxPower === 0 || validTxPower > 0) {
        // Wir verwenden einen Standard-iBeacon-Wert als Fallback.
        validTxPower = -59; 
    }

    try {
        // WIE: Dies ist die Standard "Log-Distanz-Pfadverlust"-Formel.
        // d = 10 ^ ((TxPower - RSSI) / (10 * n))
        // n = "Path Loss Exponent" (typischerweise 2.0 in freiem Raum)
        
        // (validTxPower - rssi) ist der Signalverlust in dB.
        const signalLoss = validTxPower - rssi;
        
        // Wir nehmen n=2 an (Exponent 20 = 10 * 2)
        const distance = Math.pow(10, signalLoss / 20); 

        // Formatiere das Ergebnis
        if (distance < 100) {
            return `${distance.toFixed(1)} m`;
        } else {
            // Zeige große Entfernungen in Kilometern an
            return `${(distance / 1000).toFixed(1)} km`;
        }

    } catch (err) {
        diagLog(`Distanzberechnung fehlgeschlagen: ${err.message}`, 'warn');
        return 'N/A (Berechnungsfehler)';
    }
}
 
