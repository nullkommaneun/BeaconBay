/**
 * js/utils.js (Version 13.3OO - "Apple Typ Fix" - REPARIERT)
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3OO FIX: Stellt sicher, dass *alle* Apple-Geräte
 * (nicht nur iBeacons) den 'type: "manufacturerData"' erhalten.
 * - (Behebt den "Typ: N/A"-Bug für Apple-Geräte).
 * - V13.3JJ: (Unverändert) "Parser Fallback Fix" (return data).
 * - V13.3Q: (Unverändert) 'lastSeen' ist ein 'new Date()'.
 *
 * - REPARATUR: Implementiert alle fehlenden Hilfsfunktionen
 * (dataViewToHex, dataViewToText, loadCompanyIDs, etc.)
 * und füllt KNOWN_SERVICES / KNOWN_CHARACTERISTICS.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (REPARIERT) ===
// (Gefüllt mit gängigen Services/Characteristics für den GATT-Baum)
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

// === DATENTYPEN-HELFER (REPARIERT) ===

/**
 * Wandelt ein DataView-Objekt in einen Hexadezimal-String um.
 */
export function dataViewToHex(dataView) {
    if (!dataView) return "";
    let hex = '';
    for (let i = 0; i < dataView.byteLength; i++) {
        let byte = dataView.getUint8(i).toString(16);
        hex += (byte.length < 2 ? '0' : '') + byte;
    }
    return hex.toUpperCase();
}

/**
 * Wandelt ein DataView-Objekt in einen lesbaren Text (UTF-8) um.
 */
export function dataViewToText(dataView) {
    if (!dataView) return "";
    try {
        return new TextDecoder().decode(dataView);
    } catch (e) {
        diagLog(`Fehler beim Dekodieren von Text: ${e.message}`, 'error');
        return "[Dekodierfehler]";
    }
}

/**
 * Wandelt einen Hex-String (z.B. "01FF") in ein ArrayBuffer um (für das Schreiben).
 */
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

/**
 * Versucht, bekannte Characteristic-Werte zu dekodieren.
 */
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

/**
 * Schätzt die Distanz basierend auf RSSI und TX Power.
 */
export function calculateDistance(txPower, rssi) {
    if (txPower == null || rssi == null) {
        return 'N/A';
    }
    
    // Einfache Formel (kann ungenau sein)
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
        return Math.pow(ratio, 10).toFixed(2) + ' m (nah)';
    } else {
        const distance = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
        return distance.toFixed(2) + ' m (fern)';
    }
}

// === V12.2: "loadCompanyIDs" (REPARIERT) ===
export async function loadCompanyIDs() {
    try {
        const response = await fetch('companyIDs.json');
        if (!response.ok) {
            throw new Error(`HTTP-Fehler! Status: ${response.status}`);
        }
        const data = await response.json();
        
        // Konvertiere das Objekt in eine Map für schnelleren Zugriff
        // (Ignoriere Kommentare)
        companyIDs.clear();
        for (const key in data) {
            if (key.startsWith('0x')) {
                // Konvertiere "0x004C" zu 76
                const id = parseInt(key.substring(2), 16);
                companyIDs.set(id.toString(), data[key]);
            }
        }
        diagLog(`Company IDs erfolgreich geladen (${companyIDs.size} Einträge).`, 'utils');

    } catch (err) {
        diagLog(`Fehler beim Laden der companyIDs.json: ${err.message}`, 'error');
    }
}

// === V12: "SMARTER SCANNER" DECODER (REPARIERT) ===

/**
 * Dekodiert Apple-spezifische Daten (Basis-iBeacon).
 */
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

/**
 * Dekodiert Google Fast Pair Daten (Platzhalter).
 */
function decodeGoogleFastPair(dataView) {
    // Hier könnte eine komplexe Dekodierung für Fast Pair stehen
    return "Google Fast Pair";
}

/**
 * V13.3OO FIX: Setzt 'type' für Apple
 * V13.3JJ FIX: (Unverändert) Gibt 'null' nicht mehr zurück
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
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
        
        // V13.3OO FIX: Setze den Typ *sofort*
        data.type = "manufacturerData"; 
        
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData); // REPARIERT: Funktion existiert jetzt
        data.beaconData.payload = dataViewToHex(appleData); // REPARIERT: Funktion existiert jetzt

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon"; // Überschreibe mit spezifischerem Typ
            data.txPower = dataView.getInt8(22); // Korrigiere TX-Power vom iBeacon-Paket
        }
        return data;
    }

    // 2. Eddystone (Google)
    if (serviceData && serviceData.has(0xFE9F)) { // Eddystone Service UUID
        data.company = "Google (Eddystone)";
        data.type = "serviceData";
        const eddystoneData = serviceData.get(0xFE9F);
        data.beaconData.payload = dataViewToHex(eddystoneData); // REPARIERT
        data.decodedData = "Eddystone (Dekodierung nicht implementiert)";
        return data;
    }

    // 3. Google Fast Pair
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google (Fast Pair)";
        data.type = "serviceData";
        const fastPairData = serviceData.get(0xFE2C);
        data.beaconData.payload = dataViewToHex(fastPairData); // REPARIERT
        data.decodedData = decodeGoogleFastPair(fastPairData); // REPARIERT
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        data.company = companyIDs.get("117") || "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        const samsungData = manufacturerData.get(0x0075);
        data.beaconData.payload = dataViewToHex(samsungData); // REPARIERT
        data.decodedData = "Samsung (Dekodierung nicht implementiert)";
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        // Nimm den ersten Eintrag
        const companyId = manufacturerData.keys().next().value;
        const mfgData = manufacturerData.get(companyId);
        
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (0x${companyId.toString(16).padStart(4, '0')})`;
        data.type = "manufacturerData";
        data.beaconData.payload = dataViewToHex(mfgData); // REPARIERT
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        const srvData = serviceData.get(serviceUuid);
        
        data.company = KNOWN_SERVICES.get(serviceUuid) || `Unbek. Service (${serviceUuid.substring(0, 8)}...)`;
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(srvData); // REPARIERT
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
 
