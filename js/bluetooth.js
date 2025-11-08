/**
 * js/bluetooth.js (Version 13.3U - "Clear-Logik Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3U FIX: 'startScan()' ruft 'clearUI()' NICHT MEHR auf.
 * - 'app.js' (V13.3U) steuert das Löschen jetzt zentral
 * über 'logger.js -> clearLogs()'.
 * - V13.3R: (Unverändert) 'handleAdvertisement' ruft 'updateBeaconUI'
 * nicht mehr auf (Single Source of Truth).
 * - V13.3Q: (Unverändert) Geteilte try-catch-Blöcke.
 */

// V13.3N-IMPORTS
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
    // V13.3R: updateBeaconUI wird nicht mehr direkt von hier aufgerufen
    // V13.3U: clearUI wird nicht mehr direkt von hier aufgerufen
    updateBeaconUI, 
    clearUI, 
    setCardStale,
    renderGattTree,
    showView,
    updateCharacteristicValue,
    setGattConnectingUI
} from './ui.js';

// === MODULE STATE ===
let deviceMap = new Map(); // V13.3R: Wird für Stale-Check (V12.1) beibehalten
let staleCheckInterval = null;
let activeScan = null;
let gattServer = null;
let gattCharacteristicMap = new Map();
let appCallbacks = {}; 

// === PRIVATE HELPER: SCANNING ===

/**
 * V13.3R FIX: 'updateBeaconUI' wurde entfernt.
 * V13.3Q FIX: Geteilte try-catch-Blöcke (unverändert)
 */
function handleAdvertisement(event) {
    
    // 1. Daten parsen (V13.3Q)
    let parsedData;
    try {
        parsedData = parseAdvertisementData(event);
        if (!parsedData) return;
    } catch (err) {
        diagLog(`Fehler in parseAdvertisementData: ${err.message}`, 'error');
        return;
    }

    // 2. Daten loggen (Best-Effort)
    // V13.3R: Löst UI-Update via Callback aus
    try {
        const { device, rssi } = event; 
        logAdvertisement(device, rssi, parsedData);
    } catch (err) {
        diagLog(`Fehler in logAdvertisement: ${err.message}`, 'error');
    }
    
    // 3. UI (V13.3R: ENTFERNT)

    // 4. (V13.3R): 'deviceMap' für 'stale check' (V12.1) füttern
    try {
         const { device } = event;
         deviceMap.set(device.id, {
             parsedData: parsedData 
         });
    } catch (e) {
        diagLog(`Fehler beim Füllen der deviceMap: ${e.message}`, 'warn');
    }
}

/**
 * V13.3Q: (unverändert)
 */
function checkStaleDevices() {
    const now = Date.now();
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    
    deviceMap.forEach((data, deviceId) => {
        if (now - data.parsedData.lastSeen.getTime() > threshold) {
            setCardStale(deviceId);
        }
    });
}

/**
 * V13.3N: (unverändert)
 */
function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    if (gattServer) gattServer.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
    gattServer = null;
    gattCharacteristicMap.clear();
    setScanStatus(false); 
    setGattConnectingUI(false, null);
    if (appCallbacks.onGattDisconnected) appCallbacks.onGattDisconnected();
}
/**
 * V13.3N: (unverändert)
 */
function handleValueChange(event) {
    const charUuid = event.target.uuid;
    const value = event.target.value; 
    const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
    const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
    diagLog(`[Notify] Neuer Wert für ${charUuid}: ${decodedValue}`, 'bt');
    updateCharacteristicValue(charUuid, value, false, decodedValue);
}

// === PUBLIC API: SCAN & BASE CONNECT ===

/**
 * V13.3N FIX: (unverändert)
 */
export function initBluetooth(callbacks) {
    appCallbacks = callbacks; 
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3U FIX: 'clearUI()' wurde entfernt.
 * V13.3N: (unverändert) Verwendet AppConfig
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return true;
    }
    showView('beacon');
    setScanStatus(true);
    
    // V13.3U FIX: ENTFERNT
    // 'app.js' ruft 'clearLogs()' auf, was 'clearUI()' (via Callback) auslöst.
    // clearUI(); 
    
    deviceMap.clear(); // V13.3R: Stale-Map (muss bleiben)
    try {
        diagLog('Fordere Bluetooth LE Scan an...', 'bt');
        activeScan = await navigator.bluetooth.requestLEScan({
            acceptAllAdvertisements: AppConfig.Bluetooth.SCAN_ACCEPT_ALL, 
        });
        
        diagLog('Scan aktiv. Warte auf Advertisements...', 'bt');
        setScanStart();
        navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
        
        staleCheckInterval = setInterval(
            checkStaleDevices, 
            AppConfig.Bluetooth.STALE_CHECK_INTERVAL_MS
        );
        return true; // V12.1

    } catch (err) {
        diagLog(err.name === 'NotAllowedError' ? 'Scan vom Benutzer abgelehnt.' : `Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null;
        return false; // V12.1
    }
}

/**
 * V13.3N: (unverändert)
 */
export function stopScan() {
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);
    if (activeScan && activeScan.active) {
        try {
            activeScan.stop();
            diagLog('Bluetooth-Scan wurde gestoppt.', 'bt');
        } catch (err) {
            diagLog(`Fehler beim Stoppen des Scans: ${err.message}`, 'error');
        }
        activeScan = null;
    }
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }
    setScanStatus(false);
    diagLog('Scan-Ressourcen bereinigt.', 'bt');
}

/**
 * V13.3N: (unverändert)
 */
export function disconnect() {
    if (!gattServer) {
        diagLog('[BT] disconnect: Ignoriert, da gattServer null ist.', 'bt');
        return;
    }
    if (gattServer.connected) {
        diagLog('[BT] Trenne aktive GATT-Verbindung (via disconnect)...', 'bt');
        gattServer.disconnect(); 
    } else {
        diagLog('[BT] disconnect: Ignoriert, da gattServer nicht .connected ist.', 'bt');
    }
}

// === PUBLIC API: GATT INTERACTION (V13.3N, unverändert) ===

/**
 * V13.3N: (unverändert)
 */
export async function requestDeviceForHandshake(deviceId) {
    diagLog(`[Handshake V13.3N] Starte "Smart Filter" für ${deviceId.substring(0, 4)}...`, 'bt');
    
    setGattConnectingUI(true); 

    if (!appCallbacks.onGetDeviceLog) {
         diagLog(`[Handshake V13.3N] FATALER FEHLER: appCallbacks.onGetDeviceLog fehlt.`, 'error');
         return null;
    }
    
    const deviceLog = appCallbacks.onGetDeviceLog(deviceId);
    if (!deviceLog) {
         diagLog(`[Handshake V13.3N] FEHLER: Konnte Log für ${deviceId} nicht finden.`, 'error');
         return null;
    }

    const requestOptions = {
        optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES
    };
    
    const allAds = deviceLog.advertisementHistory.toArray();
    
    // (V13.3U HINWEIS: 'serviceUuid' ist im V13.3Q-Datenmodell
    // nicht auf der obersten Ebene von 'ad' verfügbar. Dieser Filter
    // wird fehlschlagen und den Fallback verwenden, was OK ist.)
    const serviceUuids = [...new Set(
        allAds
            .filter(ad => ad.type === 'serviceData' && ad.serviceUuid)
            .map(ad => ad.serviceUuid)
    )];

    if (serviceUuids.length > 0) {
        diagLog(`[Handshake V13.3N] Filtert nach Services: ${serviceUuids.join(', ')}`, 'bt');
        requestOptions.filters = [{
            services: serviceUuids
        }];
    } else {
        diagLog(`[Handshake V13.3N] KEINE Services gefunden. Fallback...`, 'warn');
        requestOptions.acceptAllDevices = AppConfig.Bluetooth.HANDSHKE_FALLBACK_ACCEPT_ALL;
    }

    try {
        diagLog(`[Handshake V13.3N] Fordere Gerät an mit Optionen: ${JSON.stringify(requestOptions)}`, 'bt');
        
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        
        diagLog(`[Handshake V13.3N] Erlaubnis erteilt für: ${device.name}`, 'bt');
        return device; 

    } catch (err) {
        diagLog(`[Handshake V13.3N] FEHLER: ${err.message}`, 'error');
        if (err.name === 'NotFoundError' || err.name === 'NotAllowedError') {
             diagLog('Handshake vom Benutzer abgelehnt oder kein Gerät ausgewählt/gefunden.', 'warn');
        }
        return null; 
    }
}

/**
 * V13.3N: (unverändert)
 */
export async function connectWithAuthorizedDevice(device) {
    diagLog(`[TRACE] connectWithAuthorizedDevice(${device.name}) gestartet.`, 'bt');
    
    gattCharacteristicMap.clear();

    try {
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        gattServer = await device.gatt.connect();
        diagLog('GATT-Server verbunden. Lese Services...', 'bt');
        
        const services = await gattServer.getPrimaryServices();
        diagLog(`Services gefunden: ${services.length}`, 'bt');
        
        const gattTree = [];
        const gattSummary = {}; 

        for (const service of services) {
            const serviceUuid = service.uuid.toLowerCase();
            const shortUuid = serviceUuid.startsWith("0000") ? `0x${serviceUuid.substring(4, 8)}` : serviceUuid;
            const serviceName = KNOWN_SERVICES.get(shortUuid) || 'Unknown Service';
            
            const serviceData = {
                uuid: serviceUuid,
                name: serviceName,
                characteristics: []
            };

            let characteristics = [];
            try {
                 characteristics = await service.getCharacteristics();
            } catch (err) {
                diagLog(`Fehler beim Lesen der Characteristics für ${serviceName}: ${err.message}`, 'warn');
            }

            for (const char of characteristics) {
                const charUuid = char.uuid.toLowerCase();
                const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
                const charName = KNOWN_CHARACTERISTICS.get(shortCharUuid) || 'Unknown Characteristic';
                
                gattCharacteristicMap.set(charUuid, char);
                serviceData.characteristics.push({
                    uuid: charUuid,
                    name: charName,
                    properties: char.properties
                });

                if (char.properties.read && 
                   (serviceName === 'Device Information' || serviceName === 'Battery Service')) 
                {
                    try {
                        const value = await char.readValue();
                        const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
                        gattSummary[charName] = decodedValue;
                        diagLog(`[SmartDriver] ${charName}: ${decodedValue}`, 'bt');
                    } catch (readErr) {
                        diagLog(`Fehler beim automatischen Lesen von ${charName}: ${readErr.message}`, 'warn');
                    }
                }
            }
            gattTree.push(serviceData);
        }
        
        setGattConnectingUI(false, null, true); 
        renderGattTree(gattTree, device.name, gattSummary);
        
        return true; // Erfolg melden

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        onGattDisconnect(); 
        setGattConnectingUI(false, err.message); 
        
        return false; // Misserfolg melden
    }
}

/**
 * V13.3N: (unverändert)
 */
export async function readCharacteristic(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char || !char.properties.read) {
        return diagLog(`Lesefehler: Char ${charUuid} nicht gefunden oder nicht lesbar.`, 'error');
    }
    try {
        diagLog(`Lese Wert von ${charUuid}...`, 'bt');
        const value = await char.readValue();
        const shortCharUuid = charUuid.startsWith("0000") ? `0x${charUuid.substring(4, 8)}` : charUuid;
        const decodedValue = decodeKnownCharacteristic(shortCharUuid, value);
        updateCharacteristicValue(charUuid, value, false, decodedValue);
    } catch (err) {
        diagLog(`Fehler beim Lesen von ${charUuid}: ${err.message}`, 'error');
    }
}

/**
 * V13.3N: (unverändert)
 */
export async function writeCharacteristic(charUuid, dataBuffer) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char) {
        return diagLog(`Schreibfehler: Char ${charUuid} nicht gefunden.`, 'error');
    }
    if (!char.properties.write && !char.properties.writeWithoutResponse) {
        return diagLog(`Schreibfehler: Char ${charUuid} ist nicht beschreibbar.`, 'error');
    }

    try {
        diagLog(`Schreibe ${dataBuffer.byteLength} bytes auf ${charUuid}...`, 'bt');
        await char.writeValue(dataBuffer);
        diagLog("Schreiben erfolgreich.", 'bt');
    } catch (err) {
        diagLog(`GATT-Schreibfehler: ${err.message}`, 'error');
    }
}

/**
 * V13.3N: (unverändert)
 */
export async function startNotifications(charUuid) {
    const char = gattCharacteristicMap.get(charUuid);
    if (!char || !(char.properties.notify || char.properties.indicate)) {
        return diagLog(`Notify-Fehler: Char ${charUuid} nicht gefunden oder nicht abonnierbar.`, 'error');
    }
    try {
        diagLog(`Starte Notifications für ${charUuid}...`, 'bt');
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', handleValueChange);
        diagLog(`Notifications für ${charUuid} gestartet.`, 'bt');
        updateCharacteristicValue(charUuid, null, true);
    } catch (err) {
        diagLog(`Fehler beim Starten von Notifications: ${err.message}`, 'error');
    }
}
 
