/**
 * js/ui.js (Version 13.3LL - "Race Condition Fix 3")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3LL FIX: 'updateBeaconUI()' prüft jetzt (genau wie
 * 'clearUI' und 'setScanStatus'), ob 'beaconDisplay'
 * 'null' ist, bevor es darauf zugreift.
 * - (Behebt den 'Cannot read properties of undefined (reading 'prepend')'
 * Absturz (V13.3KK)).
 * - V13.3KK: (Unverändert) Verwendet 'window.Chart'.
 * - V13.3Z: (Unverändert) Sichert 'setScanStatus' ab.
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';

// === MODULE STATE (V13.3T, unverändert) ===
let appCallbacks = {}; 
let scanButton, disconnectButton, viewToggle, sortButton, staleToggle,
    beaconDisplay, downloadButton, beaconView, inspectorView,
    inspectorDeviceName, inspectorRssiCanvas, inspectorAdList,
    gattConnectButton, gattDisconnectButton, gattSummaryBox, gattTreeContainer,
    writeModalOverlay, writeModalTitle, writeModalTypeSelect, writeModalInput,
    modalWriteCancelBtn, modalWriteSendBtn;
let isStaleModeActive = false;
const cardChartMap = new Map();
let inspectorRssiChart = null;
let currentlyInspectedId = null;
let currentWriteCharUuid = null;


// === PRIVATE HELPER: CHARTING (V13.3KK, unverändert) ===
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new window.Chart(ctx, { /* ... (V13.3KK) ... */ });
}
function updateSparkline(chart, rssi) { /* ... (V13.3KK, unverändert) ... */ }

// === PRIVATE HELPER: RENDERING (V12.3 FIX, unverändert) ===
function renderTelemetry(telemetry) { /* ... (V12.3, unverändert) ... */ }
function renderBeaconData(beaconData) { /* ... (V12.3, unverändert) ... */ }
function renderDecodedData(decodedData) { /* ... (V12.3, unverändert) ... */ }

// === PRIVATE HELPER: UI-AKTIONEN (V12.3, unverändert) ===
function sortBeaconCards() { /* ... */ }
function handleStaleToggle() { /* ... */ }
function showWriteModal(charUuid, charName) { /* ... */ }
function hideWriteModal() { /* ... */ }

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) { /* ... (V13.3T, unverändert) ... */ }
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) { /* ... (V13.3T, unverändert) ... */ }
export function showInspectorView(deviceLog) { /* ... (V13.3KK, unverändert) ... */ }
export function renderGattTree(gattTree, deviceName, summary) { /* ... (V13.3T, unverändert) ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) { /* ... (V13.3T, unverändert) ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung (unverändert) ===
    scanButton = document.getElementById('scanButton');
    disconnectButton = document.getElementById('disconnectButton');
    viewToggle = document.getElementById('viewToggle');
    sortButton = document.getElementById('sortButton');
    staleToggle = document.getElementById('staleToggle');
    beaconDisplay = document.getElementById('beaconDisplay');
    downloadButton = document.getElementById('downloadButton');
    beaconView = document.getElementById('beacon-view');
    inspectorView = document.getElementById('inspector-view');
    inspectorDeviceName = document.getElementById('inspectorDeviceName');
    inspectorRssiCanvas = document.getElementById('inspectorRssiChart');
    inspectorAdList = document.getElementById('inspector-ad-list');
    gattConnectButton = document.getElementById('gattConnectButton');
    gattDisconnectButton = document.getElementById('gattDisconnectButton');
    gattSummaryBox = document.getElementById('gatt-summary');
    gattTreeContainer = document.getElementById('gatt-tree-container');
    writeModalOverlay = document.getElementById('write-modal-overlay');
    writeModalTitle = document.getElementById('write-modal-title');
    writeModalTypeSelect = document.getElementById('write-modal-type');
    writeModalInput = document.getElementById('write-modal-input');
    modalWriteCancelBtn = document.getElementById('modal-write-cancel-btn');
    modalWriteSendBtn = document.getElementById('modal-write-send-btn');
    
    // === Event Listeners (V13.3T, unverändert) ===
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    // ... (Rest der Listener, V13.3T, unverändert) ...
    
    diagLog('UI-Event-Listener (V13.3LL) erfolgreich gebunden.', 'info');
}

/**
 * V13.3Z FIX: (unverändert)
 */
export function setScanStatus(isScanning) {
    if (isScanning) {
        if (scanButton) {
            scanButton.disabled = true;
            scanButton.textContent = 'Scanning...';
        }
        if (disconnectButton) {
            disconnectButton.disabled = false;
        }
    } else {
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Starten';
        }
        if (disconnectButton) {
            disconnectButton.disabled = true;
        }
    }
}

/**
 * V13.3LL FIX: Fügt eine 'Guard Clause' hinzu (behebt V13.3KK-Absturz)
 * V13.3R: (unverändert) Liest V13.3R-Log-Felder
 */
export function updateBeaconUI(deviceId, device) {
    // V13.3LL FIX: Verhindere Absturz, wenn 'onLogUpdated'
    // vor 'setupUIListeners' (DOM-Zuweisung) aufgerufen wird.
    if (!beaconDisplay) {
        diagLog(`[TRACE] updateBeaconUI für ${deviceId.substring(0,4)}... übersprungen (DOM nicht bereit).`, 'warn');
        return;
    }
    
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        card.addEventListener('click', () => {
            diagLog(`[TRACE] Klick auf Karte ${deviceId.substring(0, 4)}... in ui.js erkannt.`, 'info');
            if (appCallbacks.onInspect) { 
                appCallbacks.onInspect(deviceId);
            }
        });

        if (device.type === 'manufacturerData' || device.type === 'serviceData') {
            card.classList.add('data-beacon');
        }
        
        card.innerHTML = `
            <h3>${device.name}</h3>
            <div class="beacon-meta">
                <small>${device.id}</small>
                <span><strong>Firma:</strong> ${device.company}</span>
                <span><strong>Typ:</strong> ${device.type}</span>
            </div>
            <div class="beacon-signal">
                <strong>RSSI:</strong> <span class="rssi-value">${device.rssi} dBm</span> | 
                <strong>Distanz:</strong> <span class="distance-value">...</span>
            </div>
            ${renderTelemetry(device.telemetry)}
            ${renderBeaconData(device.beaconData)}
            ${renderDecodedData(device.decodedData)}
            <div class="sparkline-container"><canvas></canvas></div>
        `;
        
        // V13.3LL: 'prepend' ist jetzt sicher
        beaconDisplay.prepend(card);

        const canvas = card.querySelector('canvas');
        if (canvas) cardChartMap.set(deviceId, createSparkline(canvas));
    }

    // === Karte AKTUALISIEREN ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    // ... (Rest der Aktualisierung, V13.3T, unverändert) ...

    const chart = cardChartMap.get(deviceId);
    if (chart) updateSparkline(chart, device.rssi);
    
    card.classList.remove('stale');
}

/**
 * V13.3S FIX: (unverändert)
 */
export function setCardStale(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) card.classList.add('stale');
}

/**
 * V13.3V FIX: (unverändert)
 */
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    if (!beaconDisplay) {
        diagLog('UI-Bereinigung übersprungen (DOM noch nicht bereit).', 'warn');
        return;
    }
    beaconDisplay.innerHTML = '';
    cardChartMap.forEach(chart => chart.destroy());
    cardChartMap.clear();
}

/**
 * V13.3P: (unverändert)
 */
export function onLogUpdated(deviceData, isNewDevice) {
    // V13.3LL: Ruft das jetzt abgesicherte 'updateBeaconUI' auf
    updateBeaconUI(deviceData.id, deviceData);
}
export function onLogsCleared() {
    clearUI();
}
