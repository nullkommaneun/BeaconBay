/**
 * js/bluetooth.js (Version 13.3HH - "Module State Fix" - REPARIERT)
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3HH FIX: Stellt den gelöschten 'Module State' wieder her
 * (let activeScan, let gattServer, etc.).
 * - (Behebt "activeScan is not defined" ReferenceError beim Scan-Start).
 *
 * - REPARATUR: Implementiert die gesamte fehlende GATT-Logik
 * (connect, discover, read, write, notify).
 */

// V13.3N-IMPORTS (unverändert)
import { AppConfig } from './config.js';
import { diagLog } from './errorManager.js';
import { 
    parseAdvertisementData, 
    KNOWN_SERVICES, 
    KNOWN_CHARACTERISTICS, 
    decodeKnownCharacteristic 
} from './utils.js'; // 'utils.js' ist jetzt repariert
import { logAdvertisement, setScanStart } from './logger.js';
import { 
    setScanStatus, 
    updateBeaconUI, 
    clearUI, // Dieses Modul muss noch repariert werden
    setCardStale,
    renderGattTree, // Dieses Modul muss noch repariert werden
    showView, // Dieses Modul muss noch repariert werden
    updateCharacteristicValue, // Dieses Modul muss noch repariert werden
    setGattConnectingUI // Dieses Modul muss noch repariert werden
} from './ui.js';

// === MODULE STATE (V13.3HH FIX: WIEDERHERGESTELLT) ===
let deviceMap = new Map();
let staleCheckInterval = null;
let activeScan = null; 
let gattServer = null; 
let gattCharacteristicMap = new Map(); 
let appCallbacks = {}; 

// === PRIVATE HELPER (V13.3U, unverändert) ===
function handleAdvertisement(event) {
    let parsedData;
    try {
        // Nutzt jetzt das reparierte 'utils.js'
        parsedData = parseAdvertisementData(event); 
        if (!parsedData) return;
    } catch (err) {
        diagLog(`Fehler in parseAdvertisementData: ${err.message}`, 'error');
        return;
    }
    try {
        const { device, rssi } = event; 
        logAdvertisement(device, rssi, parsedData);
    } catch (err) {
        diagLog(`Fehler in logAdvertisement: ${err.message}`, 'error');
    }
    try {
         const { device } = event;
         // HINWEIS: Speichert nur 'parsedData', nicht das 'device' Objekt.
         // Das 'device'-Objekt für GATT MUSS vom User-Prompt (Handshake) kommen.
         deviceMap.set(device.id, {
             parsedData: parsedData 
         });
    } catch (e) {
        diagLog(`Fehler beim Füllen der deviceMap: ${e.message}`, 'warn');
    }
}
function checkStaleDevices() {
    const now = Date.now();
    const threshold = AppConfig.Bluetooth.STALE_DEVICE_THRESHOLD_MS;
    deviceMap.forEach((data, deviceId) => {
        // V13.3Q FIX (aus logger): Verwendet .getTime()
        if (now - data.parsedData.lastSeen.getTime() > threshold) {
            setCardStale(deviceId);
        }
    });
}
function onGattDisconnect() {
    diagLog('GATT-Verbindung getrennt.', 'bt');
    if (gattServer) gattServer.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
    gattServer = null;
    gattCharacteristicMap.clear();
    setScanStatus(false); 
    setGattConnectingUI(false, null);
    if (appCallbacks.onGattDisconnected) appCallbacks.onGattDisconnected();
}
function handleValueChange(event) {
    const charUuid = event.target.uuid;
    const value = event.target.value; 
    // Nutzt jetzt das reparierte 'utils.js'
    const decodedValue = decodeKnownCharacteristic(charUuid, value);
    diagLog(`[Notify] Neuer Wert für ${charUuid}: ${decodedValue}`, 'bt');
    updateCharacteristicValue(charUuid, value, false, decodedValue);
}

// === PUBLIC API: SCAN & BASE CONNECT ===
export function initBluetooth(callbacks) {
    appCallbacks = callbacks; 
    deviceMap.clear();
    gattCharacteristicMap.clear();
    if (staleCheckInterval) clearInterval(staleCheckInterval);
    staleCheckInterval = null;
    diagLog('Bluetooth-Modul initialisiert (Maps geleert).', 'bt');
}

/**
 * V13.3Z: (unverändert)
 * V13.3HH: (Funktioniert jetzt, da 'activeScan' (V13.3HH) existiert)
 */
export async function startScan() {
    if (activeScan && activeScan.active) {
        diagLog('Scan läuft bereits.', 'warn');
        return true;
    }
    
    showView('beacon');
    setScanStatus(true);
    deviceMap.clear();
    
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
        return true; 

    } catch (err) {
        diagLog(`Scan-Fehler: ${err.message}`, 'error');
        setScanStatus(false);
        activeScan = null; 
        return false; 
    }
}

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

// === PUBLIC API: GATT INTERACTION (REPARIERT) ===

/**
 * REPARIERT: Öffnet den Browser-Sicherheitsprompt, um ein Gerät für GATT auszuwählen.
 * Das 'deviceId' (vom Scan) wird hier NICHT verwendet, da die API das nicht erlaubt.
 * Wir MÜSSEN den Benutzer auswählen lassen.
 */
export async function requestDeviceForHandshake(deviceId) {
    diagLog(`Öffne Geräte-Auswahl (Handshake) für ${deviceId.substring(0, 4)}...`, 'bt');
    
    try {
        const device = await navigator.bluetooth.requestDevice({
            optionalServices: AppConfig.Bluetooth.HANDSHAKE_OPTIONAL_SERVICES,
            acceptAllDevices: AppConfig.Bluetooth.HANDSHAKE_FALLBACK_ACCEPT_ALL
        });
        return device;
    } catch (err) {
        if (err.name === 'NotFoundError') {
            diagLog('Geräte-Auswahl vom Benutzer abgebrochen.', 'warn');
        } else {
            diagLog(`Handshake-Fehler (requestDevice): ${err.message}`, 'error');
        }
        return null;
    }
}

/**
 * REPARIERT: Stellt eine Verbindung zum ausgewählten Gerät her und
 * durchsucht den GATT-Baum.
 */
export async function connectWithAuthorizedDevice(device) {
    setGattConnectingUI(true);
    
    try {
        if (gattServer && gattServer.connected) {
            diagLog('Trenne alte GATT-Verbindung vor Neuverbindung...', 'bt');
            gattServer.disconnect();
        }
        
        gattCharacteristicMap.clear();
        device.addEventListener('gattserverdisconnected', onGattDisconnect);
        
        diagLog(`Verbinde mit GATT-Server von ${device.name}...`, 'bt');
        gattServer = await device.gatt.connect();
        diagLog('GATT verbunden. Ermittle Services...', 'bt');
        
        const services = await gattServer.getPrimaryServices();
        diagLog(`[GATT] ${services.length} Services gefunden.`, 'bt');
        
        const gattTree = [];
        let summary = { services: 0, characteristics: 0 };
        
        for (const service of services) {
            summary.services++;
            const serviceUuid = service.uuid;
            const serviceName = KNOWN_SERVICES.get(serviceUuid) || 'Unbekannter Service';
            
            const characteristics = await service.getCharacteristics();
            const charList = [];
            
            for (const char of characteristics) {
                summary.characteristics++;
                const charUuid = char.uuid;
                
                // WICHTIG: Speichere die Referenz auf das Characteristic-Objekt
                gattCharacteristicMap.set(charUuid, char);
                
                charList.push({
                    uuid: charUuid,
                    name: KNOWN_CHARACTERISTICS.get(charUuid) || 'Unbekannte Characteristic',
                    properties: char.properties
                });
            }
            
            gattTree.push({
                uuid: serviceUuid,
                name: serviceName,
                characteristics: charList
            });
        }
        
        renderGattTree(gattTree, device.name || device.id, summary);
        setGattConnectingUI(false, null, true); // (isConnecting: false, error: null, isConnected: true)
        return true;

    } catch (err) {
        diagLog(`GATT-Verbindungsfehler: ${err.message}`, 'error');
        setGattConnectingUI(false, err.message);
        if (gattServer) gattServer.disconnect();
        gattServer = null;
        return false;
    }
}

/**
 * REPARIERT: Liest einen Wert von einer Characteristic.
 */
export async function readCharacteristic(charUuid) {
    try {
        const char = gattCharacteristicMap.get(charUuid);
        if (!char) throw new Error(`Characteristic ${charUuid} nicht in Map gefunden.`);
        if (!char.properties.read) throw new Error("Lesen nicht unterstützt.");
        
        diagLog(`[GATT] Lese von ${char.uuid}...`, 'bt');
        const value = await char.readValue();
        
        const decodedValue = decodeKnownCharacteristic(charUuid, value);
        diagLog(`[GATT] Wert gelesen: ${decodedValue}`, 'bt');
        
        updateCharacteristicValue(charUuid, value, false, decodedValue);
        
    } catch (err) {
        diagLog(`Fehler beim Lesen der Characteristic: ${err.message}`, 'error');
    }
}

/**
 * REPARIERT: Schreibt einen Wert (als ArrayBuffer) auf eine Characteristic.
 */
export async function writeCharacteristic(charUuid, dataBuffer) {
    try {
        const char = gattCharacteristicMap.get(charUuid);
        if (!char) throw new Error(`Characteristic ${charUuid} nicht in Map gefunden.`);
        if (!char.properties.write && !char.properties.writeWithoutResponse) {
            throw new Error("Schreiben nicht unterstützt.");
        }
        
        diagLog(`[GATT] Schreibe ${dataBuffer.byteLength} Bytes auf ${char.uuid}...`, 'bt');
        await char.writeValue(dataBuffer);
        diagLog('[GATT] Schreibvorgang erfolgreich.', 'bt');
        
    } catch (err) {
        diagLog(`Fehler beim Schreiben der Characteristic: ${err.message}`, 'error');
    }
}

/**
 * REPARIERT: Startet Notifications für eine Characteristic.
 */
export async function startNotifications(charUuid) {
    try {
        const char = gattCharacteristicMap.get(charUuid);
        if (!char) throw new Error(`Characteristic ${charUuid} nicht in Map gefunden.`);
        if (!char.properties.notify) throw new Error("Notify nicht unterstützt.");

        diagLog(`[GATT] Starte Notifications für ${char.uuid}...`, 'bt');
        
        char.addEventListener('characteristicvaluechanged', handleValueChange);
        await char.startNotifications();
        
        diagLog('[GATT] Notifications gestartet.', 'bt');
        updateCharacteristicValue(charUuid, null, true, "Notifications aktiv...");

    } catch (err) {
        diagLog(`Fehler beim Starten der Notifications: ${err.message}`, 'error');
    }
}
