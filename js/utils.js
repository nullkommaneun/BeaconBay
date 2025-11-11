/**
 * js/utils.js (Version 13.3OO - DISTANZ-FIX)
 *
 * - REPARATUR: Ersetzt die fehlerhafte Distanzberechnung durch
 * das "Log-Distance Path Loss"-Modell.
 * - Führt einen anpassbaren UMGEBUNGSFAKTOR (N) ein.
 * - Zeigt "N/A" an, wenn keine kalibrierte TX-Power (bei 1m) verfügbar ist.
 * - Passt parseAdvertisementData an, um die kalibrierte TX-Power
 * (Byte 22) von iBeacons korrekt zu lesen.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (unverändert) ===
export const KNOWN_SERVICES = new Map([
    ['00001800-0000-1000-8000-00805f9b34fb', 'Generic Access'],
    ['00001801-0000-1000-8000-00805f9b34fb', 'Generic Attribute'],
    ['0000180f-0000-1000-8000-00805f9b34fb', 'Battery Service'],
    ['0000180a-0000-1000-8000-00805f9b34fb', 'Device Information'],
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
    const shortUuid = `0x${charUuid.substring(4, 8).toUpperCase()}`;
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

// === DISTANZ-BERECHNUNG (REPARIERT) ===

/**
 * Der Umgebungsfaktor (N). Passe diesen Wert an,
 * basierend auf deinen Flipper-Zero-Kalibrierungstests.
 * 2.0 = Freifeld | 3.0 = Büro | 3.5-4.5 = Metallhalle/Hindernisse
 */
const UMGEBUNGSFAKTOR = 3.5;

/**
 * Schätzt die Distanz basierend auf RSSI und kalibrierter TX Power.
 * (Log-Distance Path Loss Model)
 *
 * @param {number | null} txPowerAt1m Kalibrierter RSSI-Wert bei 1 Meter (MUSS negativ sein, z.B. -59).
 * @param {number} rssi Gemessener RSSI-Wert (z.B. -70).
 * @returns {string} Die formatierte Distanz oder "N/A".
 */
export function calculateDistance(txPowerAt1m, rssi) {
    // txPowerAt1m ist der *kalibrierte* RSSI-Wert bei 1 Meter.
    // Wenn dieser Wert fehlt (null) oder ungültig ist (z.B. positiv),
    // können wir die Distanz nicht berechnen.
    if (txPowerAt1m == null || txPowerAt1m === 0 || rssi == null) {
        return 'N/A';
    }

    try {
        // Log-Distance Path Loss Model:
        // distance = 10 ^ ((txPowerAt1m - rssi) / (10 * N))
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

// === V12: "SMARTER SCANNER" DECODER (unverändert) ===

function decodeAppleData(dataView) {
    if (dataView.byteLength < 2) return null;

    // Prüfe auf iBeacon (0x0215)
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
    
    // Andere Apple-Daten
    return "Apple (Kein iBeacon)";
}

function decodeGoogleFastPair(dataView) {
    // Hier könnte eine komplexe Dekodierung für Fast Pair stehen
    return "Google Fast Pair";
}

/**
 * V13.3OO FIX: Setzt 'type' für Apple
 * V13.3JJ FIX: (Unverändert) Gibt 'null' nicht mehr zurück
 * DISTANZ-FIX: Passt 'txPower' für iBeacons an
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        // WICHTIG: Setze dies standardmäßig auf null.
        // Dies ist die *kalibrierte TX-Power bei 1m*, NICHT event.txPower.
        txPower: null, 
        lastSeen: new Date(), // V13.3Q
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple)
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple (ID 76)
        data.company = companyIDs.get("76") || "Apple, Inc.";
        data.type = "manufacturerData"; 
        
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData); 
        data.beaconData.payload = dataViewToHex(appleData); 

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            
            // *** HIER IST DER WICHTIGE FIX ***
            // iBeacons senden ihre kalibrierte TX-Power bei 1m an Byte 22.
            const txPowerAt1m = appleData.getInt8(22);
            data.txPower = txPowerAt1m; // Setze den korrekten Wert für die Distanzberechnung
        }
        // Wenn es kein iBeacon ist (nur "Apple"), bleibt data.txPower null.
        // Die Distanz wird als "N/A" angezeigt. Das ist korrekt.
        return data;
    }

    // 2. Eddystone (Google)
    if (serviceData && serviceData.has(0xFE9F)) { 
        data.company = "Google (Eddystone)";
        data.type = "serviceData";
        const eddystoneData = serviceData.get(0xFE9F);
        data.beaconData.payload = dataViewToHex(eddystoneData); 
        data.decodedData = "Eddystone (Dekodierung nicht implementiert)";
        return data;
    }

    // 3. Google Fast Pair
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google (Fast Pair)";
        data.type = "serviceData";
        const fastPairData = serviceData.get(0xFE2C);
        data.beaconData.payload = dataViewToHex(fastPairData); 
        data.decodedData = decodeGoogleFastPair(fastPairData); 
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        data.company = companyIDs.get("117") || "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        const samsungData = manufacturerData.get(0x0075);
        data.beaconData.payload = dataViewToHex(samsungData); 
        data.decodedData = "Samsung (Dekodierung nicht implementiert)";
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        const companyId = manufacturerData.keys().next().value;
        const mfgData = manufacturerData.get(companyId);
        
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (0x${companyId.toString(16).padStart(4, '0')})`;
        data.type = "manufacturerData";
        data.beaconData.payload = dataViewToHex(mfgData); 
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        const srvData = serviceData.get(serviceUuid);
        
        data.company = KNOWN_SERVICES.get(serviceUuid) || `Unbek. Service (${serviceUuid.substring(0, 8)}...)`;
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(srvData); 
        return data;
    }
    
    // 7. Nur-Name
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    // 8. V13.3JJ FIX: (Unverändert) Fallback
    diagLog(`[Parser] Gerät ${device.id.substring(0,4)}... hat keine Daten (anonym).`, 'utils');
    data.type = "anonymous";
    return data;
}
