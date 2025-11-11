/**
 * js/utils.js (Version 13.3PP - VW FTF-FIX V2 + Beacon 02a6)
 *
 * - REPARATUR: Ersetzt die fehlerhafte Distanzberechnung.
 * - VW FTF-FIX V2: Implementiert die KORREKTE Tünkers-Analyse
 * (basierend auf der A-A-A-B-B-C-C Redundanz-Logik)
 * und ersetzt die fehlerhafte V1-Implementierung.
 * - Beacon 02a6 FIX: Fügt Erkennungslogik für das proprietäre
 * Beacon-System (ID 0x02a6) hinzu und dekodiert dessen Zähler.
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
 * VW FTF-FIX V2: KORREKTE Tünkers-Logik (0x0118)
 * V13.3PP (NEU): Beacon 02a6 Logik hinzugefügt
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
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
            const txPowerAt1m = appleData.getInt8(22);
            data.txPower = txPowerAt1m; 
        }
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

    // === START VW FTF-LOGIK (V2 - KORRIGIERT) ===
    // 5. Tünkers FTF (VW-Spezifisch)
    if (manufacturerData && manufacturerData.has(0x0118)) { // 0x0118 = Tünkers
        // 0x0118 = 280 (dezimal). ID 0x0118 ist Radius Networks (Tünkers nutzt deren Hardware)
        data.company = companyIDs.get("280") || "Radius Networks (Tünkers)";
        data.type = "manufacturerData";
        const payload = manufacturerData.get(0x0118);
        data.beaconData.payload = dataViewToHex(payload);

        // Deine Analyse (Schritt 4) anwenden: A-A-A-B-B-C-C
        if (payload.byteLength === 7) {
            const a1 = payload.getUint8(0); // A
            const a2 = payload.getUint8(1); // A
            const a3 = payload.getUint8(2); // A
            const b1 = payload.getUint8(3); // B
            const b2 = payload.getUint8(4); // B
            const c1 = payload.getUint8(5); // C
            const c2 = payload.getUint8(6); // C

            // 1. VALIDIERUNG: A-A-A, B-B, C-C (Redundanz-Prüfung)
            const isRedundant = (a1 === a2) && (a2 === a3) &&
                                (b1 === b2) &&
                                (c1 === c2);
            
            // 2. VALIDIERUNG: Logische Regel (A+1=B, B+1=C)
            const isSequential = (b1 === (a1 + 1)) && (c1 === (b1 + 1));

            if (isRedundant && isSequential) {
                // ERFOLG! Dies ist ein FTF.
                const tuenkersID = a1; // Die "logische Zahl" A
                let ftfTyp = "FTF (Tünkers)"; // Standard-Typ

                // Klassifiziere basierend auf dem Gerätenamen
                if (data.name.startsWith("IAA")) {
                    ftfTyp = "Transport FTF";
                } else if (data.name.startsWith("IAC")) {
                    ftfTyp = "Stapler FTF";
                }
                
                // Dies wird in der grünen Zeile auf der Karte angezeigt
                data.decodedData = `${ftfTyp} (Tünkers-ID: ${tuenkersID})`;
                // Setze einen speziellen Typ, damit die Karte in "style.css"
                // die .data-beacon-Klasse (roter Rand) bekommt
                data.type = "FTF (Tünkers)"; 
            } else {
                // Tünkers, aber nicht das FTF-Muster
                data.decodedData = "Tünkers (Ungültiges Muster)";
            }
        } else {
            // Tünkers, aber falsche Payload-Länge
            data.decodedData = "Tünkers (Falsche Payload-Länge)";
        }
        return data; // Wichtig: Verarbeite dieses Gerät und stoppe hier
    }
    // === ENDE VW FTF-LOGIK ===

    // === START LOGIK FÜR PROPRIETÄRES BEACON-SYSTEM (0x02a6) ===
    else if (manufacturerData && manufacturerData.has(0x02A6)) { // 0x02A6 = 678
        data.company = "Proprietäres Beacon (0x02a6)";
        data.type = "manufacturerData";
        const payload = manufacturerData.get(0x02A6);
        data.beaconData.payload = dataViewToHex(payload);
        
        // Validierung (basierend auf unserer Analyse):
        // Muss 10 Bytes lang sein und mit 0x0338 beginnen
        if (payload.byteLength === 10 && payload.getUint8(0) === 0x03 && payload.getUint8(1) === 0x38) {
            
            // ENTSCHLÜSSELUNG:
            // Der Zähler ist das 3. Byte (Index 2) des Payloads.
            const counter = payload.getUint8(2); 
            
            // Setze den Klartext für die Anzeige in der App
            data.decodedData = `Beacon-System (Zähler: ${counter})`; 
            data.type = "Beacon (0x02a6)"; // Eigener Typ für potenzielles Styling
            
        } else {
            data.decodedData = "Beacon 0x02a6 (Unbek. Format)";
        }
        return data; // Wichtig: Verarbeitung hier stoppen
    }
    // === ENDE NEUER BLOCK ===

    // 6. Andere Herstellerdaten (war vorher 5.)
    if (manufacturerData && manufacturerData.size > 0) {
        const companyId = manufacturerData.keys().next().value;
        const mfgData = manufacturerData.get(companyId);
        
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (0x${companyId.toString(16).padStart(4, '0')})`;
        data.type = "manufacturerData";
        data.beaconData.payload = dataViewToHex(mfgData); 
        return data;
    }

    // 7. Andere Servicedaten (war vorher 6.)
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        const srvData = serviceData.get(serviceUuid);
        
        data.company = KNOWN_SERVICES.get(serviceUuid) || `Unbek. Service (${serviceUuid.substring(0, 8)}...)`;
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(srvData); 
        return data;
    }
    
    // 8. Nur-Name (war vorher 7.)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    // 9. V13.3JJ FIX: (Unverändert) Fallback (war vorher 8.)
    diagLog(`[Parser] Gerät ${device.id.substring(0,4)}... hat keine Daten (anonym).`, 'utils');
    data.type = "anonymous";
    return data;
}
 
