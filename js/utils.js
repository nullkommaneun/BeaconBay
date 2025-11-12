/**
 * js/utils.js (Version 14.0 - High Performance VW Mod)
 * Optimiert für binäre Erkennung von FTF und reduzierten CPU-Overhead.
 */

import { diagLog } from './errorManager.js';

// === FTS SIGNATUREN (Neu: Binäre Fingerabdrücke aus Ihrer Log-Analyse) ===
const FTF_SIGNATURES = [
    {
        // Cypress Semiconductor (Häufig in Ihrem Log gesehen)
        companyId: 0x04A4,
        pattern: [0x06, 0xC5, 0x5D], // Start-Bytes der Payload
        name: "VW FTF (Cypress)",
        type: "VW-FTS-PROPRIETARY"
    },
    {
        // Unbekannter Hersteller 0x5704 (Kandidat für Transport-FTF)
        companyId: 0x5704,
        pattern: [0x91], // Start-Byte
        name: "VW FTF (Transport/Prop.)",
        type: "VW-FTS-TRANSPORT"
    },
    {
        // Einzelgänger aus dem Log
        companyId: 0xB6F4,
        pattern: [0x2D, 0xC1],
        name: "VW FTF (Spezial)",
        type: "VW-FTS-SPECIAL"
    }
];

export const KNOWN_SERVICES = new Map([
    ['00001800-0000-1000-8000-00805f9b34fb', 'Generic Access'],
    ['00001801-0000-1000-8000-00805f9b34fb', 'Generic Attribute'],
    ['0000180f-0000-1000-8000-00805f9b34fb', 'Battery Service'],
    ['0000feaa-0000-1000-8000-00805f9b34fb', 'Eddystone'], // Wichtig für Beacons
    ['0000180a-0000-1000-8000-00805f9b34fb', 'Device Information']
]);

let companyIDs = new Map();

// === HELFER (Optimiert) ===

const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase());

export function dataViewToHex(dataView) {
    if (!dataView) return "";
    const len = dataView.byteLength;
    let hex = '';
    // Performance-Optimierung: Lookup-Table statt toString(16)
    for (let i = 0; i < len; i++) {
        hex += HEX_TABLE[dataView.getUint8(i)];
    }
    return hex;
}

/**
 * Extrahiert ASCII nur, wenn es sinnvoll erscheint.
 * Bricht früh ab, um CPU zu sparen.
 */
function extractPrintableAscii(dataView) {
    let result = "";
    const len = dataView.byteLength;
    // Limitieren auf 32 Bytes, da Namen selten länger sind (Performance)
    const max = len > 32 ? 32 : len; 
    
    for (let i = 0; i < max; i++) {
        let code = dataView.getUint8(i);
        if (code >= 32 && code <= 126) {
            result += String.fromCharCode(code);
        }
    }
    return result;
}

export async function loadCompanyIDs() {
    try {
        const response = await fetch('companyIDs.json');
        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const data = await response.json();
        companyIDs.clear();
        for (const key in data) {
            if (key.startsWith('0x')) {
                // Speichere als Integer-Key für schnelleren Zugriff
                companyIDs.set(parseInt(key.substring(2), 16), data[key]);
            }
        }
        diagLog(`Company IDs geladen (${companyIDs.size}).`, 'utils');
    } catch (err) {
        // Silent fail ist ok, wir nutzen Fallbacks
        console.warn("companyIDs.json konnte nicht geladen werden.");
    }
}

// === PARSER ===

export function parseAdvertisementData(event) {
    const { device, rssi, txPower, manufacturerData, serviceData } = event;

    const data = {
        id: device.id,
        name: device.name || '[Unbenannt]',
        rssi: rssi,
        txPower: txPower || null,
        lastSeen: Date.now(), // Integer Timestamp spart Speicher vs Date-Objekt
        company: "N/A",
        type: "N/A",
        decodedData: null,
        beaconData: {},
        isFtf: false // Flag für schnelle Filterung im Logger
    };

    // 1. Manufacturer Data (Priorität 1)
    if (manufacturerData && manufacturerData.size > 0) {
        const iterator = manufacturerData.entries().next();
        const companyId = iterator.value[0]; // Ist Integer
        const mfgData = iterator.value[1];   // Ist DataView

        // Hex Payload einmal generieren
        const hexPayload = dataViewToHex(mfgData);
        data.beaconData.payload = hexPayload;

        // A) BINÄRE FTF ERKENNUNG (Schnell & Präzise)
        // Wir prüfen, ob die ID und das Datenmuster passen
        for (const sig of FTF_SIGNATURES) {
            if (companyId === sig.companyId) {
                // Prüfe, ob Payload mit Pattern beginnt
                let match = true;
                for (let i = 0; i < sig.pattern.length; i++) {
                    if (mfgData.byteLength <= i || mfgData.getUint8(i) !== sig.pattern[i]) {
                        match = false;
                        break;
                    }
                }
                
                if (match) {
                    data.name = `${sig.name} [${hexPayload.substring(0,6)}...]`;
                    data.type = sig.type;
                    data.company = "VW Logistik (Proprietär)";
                    data.decodedData = `ID-Match: ${sig.name}`;
                    data.isFtf = true;
                    return data; // Treffer! Früher Return.
                }
            }
        }

        // B) TEXT-BASIERTE FTF ERKENNUNG (Fallback für IAA/IAC)
        const asciiContent = extractPrintableAscii(mfgData);
        // Sucht nach IAA oder IAC gefolgt von 3 Ziffern
        const ftsMatch = asciiContent.match(/(IAA|IAC)\d{3}/);
        
        if (ftsMatch) {
            const ftsId = ftsMatch[0];
            data.name = `VW FTF ${ftsId}`;
            data.type = "VW-FTS-TEXT";
            data.company = "VW Logistik";
            data.decodedData = `Kennung: ${ftsId}`;
            data.isFtf = true;
            
            // TxPower extrahieren (oft am Ende)
            if (mfgData.byteLength >= 2) {
                data.txPower = mfgData.getInt8(mfgData.byteLength - 1);
            }
            return data;
        }

        // C) Standard Behandlung
        data.company = companyIDs.get(companyId) || `Unbekannt (0x${companyId.toString(16).toUpperCase().padStart(4, '0')})`;
        data.type = "manufacturerData";
        
        // Apple iBeacon Fix
        if (companyId === 0x004C && mfgData.byteLength === 25 && mfgData.getUint8(0) === 0x02) {
             data.txPower = mfgData.getInt8(22);
        }

        return data;
    }

    // 2. Service Data
    if (serviceData && serviceData.size > 0) {
        const serviceUuid = serviceData.keys().next().value;
        data.company = KNOWN_SERVICES.get(serviceUuid) || "Unbek. Service";
        data.type = "serviceData";
        data.beaconData.payload = dataViewToHex(serviceData.get(serviceUuid));
        return data;
    }

    if (device.name) {
        data.type = "nameOnly";
        return data;
    }

    data.type = "anonymous";
    return data;
}
