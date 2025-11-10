/**
 * js/utils.js (Version 13.3OO - "Apple Typ Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3OO FIX: Stellt sicher, dass *alle* Apple-Geräte
 * (nicht nur iBeacons) den 'type: "manufacturerData"' erhalten.
 * - (Behebt den "Typ: N/A"-Bug für Apple-Geräte).
 * - V13.3JJ: (Unverändert) "Parser Fallback Fix" (return data).
 * - V13.3Q: (Unverändert) 'lastSeen' ist ein 'new Date()'.
 */

import { diagLog } from './errorManager.js';

// === GLOBALE KONSTANTEN (unverändert) ===
export const KNOWN_SERVICES = new Map([ /* ... (V13.3JJ) ... */ ]);
export const KNOWN_CHARACTERISTICS = new Map([ /* ... (V13.3JJ) ... */ ]);
let companyIDs = new Map();

// === DATENTYPEN-HELFER (unverändert) ===
export function dataViewToHex(dataView) { /* ... (V13.3JJ) ... */ }
export function dataViewToText(dataView) { /* ... (V13.3JJ) ... */ }
export function hexStringToArrayBuffer(hex) { /* ... (V13.3JJ) ... */ }
export function decodeKnownCharacteristic(charUuid, value) { /* ... (V13.3JJ) ... */ }
export function calculateDistance(txPower, rssi) { /* ... (V13.3JJ) ... */ }

// === V12.2: "loadCompanyIDs" (unverändert) ===
export async function loadCompanyIDs() { /* ... (V13.3JJ) ... */ }

// === V12: "SMARTER SCANNER" DECODER (unverändert) ===
function decodeAppleData(dataView) { /* ... (V12.3) ... */ }
function decodeGoogleFastPair(dataView) { /* ... (V12.3) ... */ }

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
    if (manufacturerData && manufacturerData.has(0x004C)) { // Apple
        data.company = companyIDs.get("76") || "Apple, Inc.";
        
        // V13.3OO FIX: Setze den Typ *sofort*
        data.type = "manufacturerData"; 
        
        const appleData = manufacturerData.get(0x004C);
        data.decodedData = decodeAppleData(appleData);
        data.beaconData.payload = dataViewToHex(appleData); 

        if (appleData.byteLength === 25 && appleData.getUint8(0) === 0x02 && appleData.getUint8(1) === 0x15) {
            data.type = "iBeacon"; // Überschreibe mit spezifischerem Typ
            // ... (Rest der iBeacon-Logik, unverändert)
        }
        return data;
    }

    // 2. Eddystone (Google)
    if (serviceData && serviceData.has(0xFE9F)) {
        // ... (V13.3JJ, unverändert) ...
        return data;
    }

    // 3. Google Fast Pair
    if (serviceData && serviceData.has(0xFE2C)) {
        // ... (V13.3JJ, unverändert) ...
        return data;
    }
    
    // 4. Samsung
    if (manufacturerData && manufacturerData.has(0x0075)) {
        // ... (V13.3JJ, unverändert) ...
        return data;
    }

    // 5. Andere Herstellerdaten
    if (manufacturerData && manufacturerData.size > 0) {
        // ... (V13.3JJ, unverändert) ...
        return data;
    }

    // 6. Andere Servicedaten
    if (serviceData && serviceData.size > 0) {
        // ... (V13.3JJ, unverändert) ...
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
