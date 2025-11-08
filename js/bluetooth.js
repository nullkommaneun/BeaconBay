/**
 * js/bluetooth.js (Version 13.3V - "Typo Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3V FIX: Korrigiert Tippfehler 'HANDSHKE_FALLBACK_ACCEPT_ALL'
 * zu 'HANDSHAKE_FALLBACK_ACCEPT_ALL' in 'requestDeviceForHandshake'.
 * - V13.3U: (Unverändert) 'clearUI()' entfernt.
 * - V13.3R: (Unverändert) 'updateBeaconUI' entfernt.
 */

// V13.3N-IMPORTS (unverändert)
import { AppConfig } from './config.js';
import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js';
import { logAdvertisement, setScanStart } from './logger.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,
    showView,
    updateCharacteristicValue,
    setGattConnectingUI
} from './ui.js';

// === MODULE STATE (V13.3U, unverändert) ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;
let gattCharacteristicMap = new Map();
let appCallbacks = {}; 

// === PRIVATE HELPER (V13.3U, unverändert) ===
function handleAdvertisement(event) { /* ... */ }
function checkStaleDevices() { /* ... */ }
function onGattDisconnect() { /* ... */ }
function handleValueChange(event) { /* ... */ }

// === PUBLIC API: SCAN & BASE CONNECT ===
export function initBluetooth(callbacks) { /* ... (V13.3U, unverändert) ... */ }
export async function startScan() { /* ... (V13.3U, unverändert) ... */ }
export function stopScan() { /* ... (V13.3U, unverändert) ... */ }
export function disconnect() { /* ... (V13.3U, unverändert) ... */ }

// === PUBLIC API: GATT INTERACTION ===

/**
 * V13.3V FIX: Tippfehler in AppConfig-Schlüssel korrigiert
 */
export async function requestDeviceForHandshake(deviceId) {
    diagLog(`[Handshake V13.3V] Starte "Smart Filter" für ${deviceId.substring(0, 4)}...`, 'bt');
    
    setGattConnectingUI(true); 

    if (!appCallbacks.onGetDeviceLog) {
         diagLog(`[Handshake V13.3V] FATALER FEHLER: appCallbacks.onGetDeviceLog fehlt.`, 'error');
         return null;
    }
    
    const deviceLog = appCallbacks.onGetDeviceLog(deviceId);
    if (!deviceLog) {
         diagLog(`[Handshake V13.3V] FEHLER: Konnte Log für ${deviceId} nicht finden.`, 'error');
         return null;
    }

    const requestOptions = {
        optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES
    };
    
    const allAds = deviceLog.advertisementHistory.toArray();
    
    const serviceUuids = [...new Set(
        allAds
            .filter(ad => ad.type === 'serviceData' && ad.serviceUuid)
            .map(ad => ad.serviceUuid)
    )];

    if (serviceUuids.length > 0) {
        diagLog(`[Handshake V13.3V] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        diagLog(`[Handshake V13.3V] KEINE Services gefunden. Fallback...`, 'warn');
        // V13.3V FIX: 'HANDSHKE_' zu 'HANDSHAKE_'
        requestOptions.acceptAllDevices = AppConfig.Bluetooth.HANDSHAKE_FALLBACK_ACCEPT_ALL;
    }

    try {
        diagLog(`[Handshake V13.3V] Fordere Gerät an mit Optionen: ${JSON.stringify(requestOptions)}`, 'bt');
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        diagLog(`[Handshake V13.3V] Erlaubnis erteilt für: ${device.name}`, 'bt');
        return device; 

    } catch (err) {
        diagLog(`[Handshake V13.3V] FEHLER: ${err.message}`, 'error');
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
             diagLog('Handshake vom Benutzer abgelehnt oder kein Gerät ausgewählt/gefunden.', 'warn');
        }
        return null; 
    }
}

export async function connectWithAuthorizedDevice(device) { /* ... (V13.3U, unverändert) ... */ }
export async function readCharacteristic(charUuid) { /* ... (V13.3U, unverändert) ... */ }
export async function writeCharacteristic(charUuid, dataBuffer) { /* ... (V1B.3U, unverändert) ... */ }
export async function startNotifications(charUuid) { /* ... (V13.3U, unverändert) ... */ }
 
