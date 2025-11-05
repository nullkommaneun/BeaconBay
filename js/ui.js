/**
 * js/ui.js (Version 7 - Mit Download-Button)
 * * ARCHITEKTUR-HINWEIS:
 * - Fügt 'downloadButton' zum DOM-Caching hinzu.
 * - Bindet 'onDownload'-Callback in setupUIListeners.
 */

import { diagLog } from './errorManager.js';
import { calculateDistance, dataViewToHex, dataViewToText } from './utils.js';

// === MODULE STATE ===
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const viewToggle = document.getElementById('viewToggle');
const sortButton = document.getElementById('sortButton');
const staleToggle = document.getElementById('staleToggle');
const beaconDisplay = document.getElementById('beaconDisplay');
const beaconView = document.getElementById('beacon-view');
const gattView = document.getElementById('gatt-view');
const gattDeviceName = document.getElementById('gatt-device-name');
const gattTreeContainer = document.getElementById('gatt-tree-container');
const gattDisconnectButton = document.getElementById('gattDisconnectButton');

// NEU: Download-Button
const downloadButton = document.getElementById('downloadButton');


let isStaleModeActive = false;
const chartMap = new Map();
let appCallbacks = {};

// ... (Alle privaten Helper und Public APIs bleiben unverändert) ...
function createSparkline(canvas) { /* ... */ }
function updateSparkline(chart, rssi) { /* ... */ }
function renderTelemetry(telemetry) { /* ... */ }
function renderBeaconData(beaconData) { /* ... */ }
function sortBeaconCards() { /* ... */ }
function handleStaleToggle() { /* ... */ }
export function showView(viewName) { /* ... */ }
export function showConnectingState(name) { /* ... */ }
export function renderGattTree(gattTree, deviceName) { /* ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying = false) { /* ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * Bindet die Event-Listener an die UI-Elemente.
 * @param {object} callbacks - Ein Objekt mit Callback-Funktionen von app.js.
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    gattDisconnectButton.addEventListener('click', callbacks.onGattDisconnect);
    
    // NEU: Download-Button-Listener
    downloadButton.addEventListener('click', callbacks.onDownload);
    
    viewToggle.addEventListener('click', () => {
        if (beaconView.style.display === 'none') showView('beacon');
        else showView('gatt');
    });
    
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    diagLog('UI-Event-Listener erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) { /* ... (Keine Änderung) ... */ }
export function updateBeaconUI(deviceId, device) { /* ... (Keine Änderung) ... */ }
export function setCardStale(deviceId) { /* ... (Keine Änderung) ... */ }
export function clearUI() { /* ... (Keine Änderung) ... */ }
 
