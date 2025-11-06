/**
 * js/utils.js (Version 12.2 - "loadCompanyIDs" Fix)
 * * ARCHITEKTUR-HINWEIS:
 * - V12.2 FIX: Behebt "loadCompanyIDs is not a function"-Absturz.
 * - Die 'companyIDs'-Map und die 'loadCompanyIDs'-Funktion
 * wurden wiederhergestellt.
 * - 'parseAdvertisementData' wurde korrigiert, um die Map zu verwenden
 * und Firmennamen korrekt aufzulösen.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN: BEACON-PARSING ===

export const KNOWN_SERVICES = new Map([
    // ... (unverändert)
]);

export const KNOWN_CHARACTERISTICS = new Map([
    // ... (unverändert)
]);

// V12.2 FIX: Fehlende Map wieder hinzugefügt
let companyIDs = new Map();


// === DATENTYPEN-HELFER ===

export function dataViewToHex(dataView) {
    // ... (unverändert)
}
export function dataViewToText(dataView) {
    // ... (unverändert)
}
export function hexStringToArrayBuffer(hex) {
    // ... (unverändert)
}
export function decodeKnownCharacteristic(charUuid, value) {
    // ... (unverändert)
}
export function calculateDistance(txPower, rssi) {
    // ... (unverändert)
}


// === V12.2: "loadCompanyIDs" WIEDERHERGESTELLT ===

/**
 * V12.2: Lädt die 'company_ids.json'-Datei, um IDs in Namen aufzulösen.
 */
export async function loadCompanyIDs() {
    try {
        const response = await fetch('company_ids.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const ids = await response.json();
        companyIDs = new Map(Object.entries(ids));
        diagLog(`Erfolgreich ${companyIDs.size} Company IDs geladen.`, 'utils');
    } catch (e) {
        diagLog(`Fehler beim Laden der company_ids.json: ${e.message}`, 'error');
    }
}


// === V12: "SMARTER SCANNER" DECODER ===

// V12 NEU: Dekodiert Apple-Daten
function decodeAppleData(dataView) {
    if (dataView.byteLength < 2) return null;
    const type = dataView.getUint8(0);
    switch (type) {
        case 0x02: return 'Apple iBeacon'; // (Wird von iBeacon-Logik unten überschrieben)
        case 0x10: return 'Apple AirDrop / Handoff';
        case 0x09: return 'Apple AirPods / Proximity';
        case 0x12: return 'Apple "Find My" (Offline Find)';
        case 0x0C: return 'Apple Continuity (z.B. Watch Unlock)';
        default: return `Apple (Typ 0x${type.toString(16)})`;
    }
}

// V12 NEU: Dekodiert Google Fast Pair
function decodeGoogleFastPair(dataView) {
    // (Vereinfachte Prüfung, nur um es zu identifizieren)
    return 'Google Fast Pair';
}

/**
 * V12.2 PATCH: 'parseAdvertisementData' nutzt jetzt wieder 'companyIDs'.
 *
 * @param {Event} event - Das 'advertisementreceived'-Event.
 * @returns {object} Ein sauberes Objekt für UI und Logger.
 */
export function parseAdvertisementData(event) {
    const { device, rssi, txPower, timeStamp, manufacturerData, serviceData } = event;

    // Basis-Objekt
    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        lastSeen: timeStamp,
        company: "N/A",
        type: "N/A", 
        decodedData: null, 
        beaconData: {},
        telemetry: {}
    };

    // 1. iBeacon-Prüfung (Apple)
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple
        data.company = "Apple, Inc.";
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData);

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon";
            const uuidView = new DataView(appleData.buffer, 4, 16);
            data.beaconData.uuid = Array.from(new Uint8Array(uuidView.buffer, 4, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
            data.beaconData.major = appleData.getUint16(20, false);
            data.beaconData.minor = appleData.getUint16(22, false);
            if (!data.txPower) data.txPower = appleData.getInt8(24); 
            return data;
        }
    }

    // 2. Eddystone-Prüfung (Google)
    if (serviceData && serviceData.has(0xFE9F)) { // Eddystone
        data.company = "Google";
        data.type = "Eddystone";
        // ... (Restliche Eddystone-Logik bleibt unverändert) ...
        return data;
    }

    // 3. V12: Google Fast Pair (Service)
    if (serviceData && serviceData.has(0xFE2C)) {
        data.company = "Google";
        data.type = "serviceData";
        data.decodedData = decodeGoogleFastPair(serviceData.get(0xFE2C));
        return data;
    }
    
    // 4. V12: Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) { // Samsung
        data.company = "Samsung Electronics Co., Ltd.";
        data.type = "manufacturerData";
        data.decodedData = "Samsung (z.B. SmartThings Find)";
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        data.type = "manufacturerData";
        const [companyId, dataView] = manufacturerData.entries().next().value;
        
        // V12.2 FIX: Firmennamen mithilfe der geladenen Map auflösen
        data.company = companyIDs.get(companyId.toString()) || `Unbekannt (ID: 0x${companyId.toString(16).padStart(4, '0')})`;
        
        data.decodedData = `Hersteller-Daten (${dataView.byteLength} bytes)`;
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        data.type = "serviceData";
        const [uuid, dataView] = serviceData.entries().next().value;
        
        // V12.2 FIX: Versuche, den Servicenamen aufzulösen
        const shortUuid = uuid.startsWith("0000") ? `0x${uuid.substring(4, 8)}` : uuid;
        data.company = KNOWN_SERVICES.get(shortUuid) || "N/A (Service)";

        data.decodedData = `Service-Daten (${dataView.byteLength} bytes)`;
        return data;
    }
    
    // 7. Nur-Name (z.B. Flipper)
    if (device.name) {
        data.type = "nameOnly";
        return data;
    }
    
    diagLog(`Konnte Advertisement nicht parsen für ${device.id}`, 'warn');
    return null; 
}
 
