/**
 * js/utils.js (Version 13.3-Clean)
 *
 * - Bereinigte Version: Entfernt alle spezifischen FTF- und Beacon-Decoder.
 * - Behält generische BLE-Bibliotheken und GATT-Definitionen bei.
 * - Behält generische Parser für Manufacturer- und Service-Data bei.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (ERWEITERT) ===
export const KNOWN_SERVICES = new Map([
    // Standard-Dienste
    ['00001800-0000-1000-8000-00805f9b34fb', 'Generic Access'],
    ['00001801-0000-1000-8000-00805f9b34fb', 'Generic Attribute'],
    ['0000180f-0000-1000-8000-00805f9b34fb', 'Battery Service'],
    ['0000180a-0000-1000-8000-00805f9b34fb', 'Device Information'],

    // --- Gängige Dienste ---
    ['0000180d-0000-1000-8000-00805f9b34fb', 'Heart Rate'],
    ['00001809-0000-1000-8000-00805f9b34fb', 'Health Thermometer'],
    ['00001802-0000-1000-8000-00805f9b34fb', 'Immediate Alert'],
    ['00001803-0000-1000-8000-00805f9b34fb', 'Link Loss'],
    ['00001804-0000-1000-8000-00805f9b34fb', 'Tx Power']
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

    // --- Sensor-Merkmale ---
    ['00002a37-0000-1000-8000-00805f9b34fb', 'Heart Rate Measurement'],
    ['00002a38-0000-1000-8000-00805f9b34fb', 'Body Sensor Location'],
    ['00002a1c-0000-1000-8000-00805f9b34fb', 'Temperature Measurement']
]);

let companyIDs = new Map();

// === DATENTYPEN-HELFER ===

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

// === DISTANZ-BERECHNUNG ===

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

// === "loadCompanyIDs" ===
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

// === "SMARTER SCANNER" DECODER (BEREINIGT) ===

/**
 * Haupt-Parser-Funktion
 * Analysiert die Advertising-Daten eines BLE-Events.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: null, // Wird ggf. später von iBeacon überschrieben (jetzt entfernt)
        lastSeen: new Date(),
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {} // Bleibt für zukünftige generische Decoder
    };

    // 1. Andere Herstellerdaten (Fallback)
    // Dieser Block fängt jetzt ALLE Herstellerdaten ab (Apple, Samsung, Tünkers, Ruuvi etc.)
    // und stellt sie generisch dar, ohne spezifische Dekodierung.
    if (manufacturerData && manufacturerData.size > 0) {
        const companyId = manufacturerData.keys().next().value;
        const mfgData = manufacturerData.get(companyId);
        
        // Hole TX Power, falls im iBeacon-Format (0x004C)
        if (companyId === 0x004C && mfgData.byteLength === 25 && mfgData.getUint8(0) === 0x02 && mfgData.getUint8(1) === 0x15) {
             data.txPower = mfgData.getInt8(22);
        }

        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (0x${companyId.toString(16).padStart(4, '0')})`;
        data.type = "manufacturerData";
        data.beaconData.payload = dataViewToHex(mfgData); 
        return data;
    }

    // 2. Andere Servicedaten (Fallback)
    // Fängt alle Service-Daten ab (z.B. Eddystone 0xFEAA, FastPair 0xFE2C, etc.)
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        const srvData = serviceData.get(serviceUuid);
        data.company = KNOWN_SERVICES.get(serviceUuid) || `Unbek. Service (${serviceUuid.substring(0, 8)}...)`;
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(srvData); 
        return data;
    }
    
    // 3. Nur-Name (Fallback)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    // 4. (Fallback)
    diagLog(`[Parser] Gerät ${device.id.substring(0,4)}... hat keine Daten (anonym).`, 'utils');
    data.type = "anonymous";
    return data;
}
 
