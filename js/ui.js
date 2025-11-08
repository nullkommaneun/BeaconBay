/**
 * js/ui.js (Version 13.3V - "Race Condition Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3V FIX: 'clearUI()' prüft jetzt, ob 'beaconDisplay'
 * 'null' ist, bevor es darauf zugreift.
 * - (Behebt den 'Cannot set property 'innerHTML' of null'-Absturz
 * beim Starten des Scans (V13.3U)).
 * - V13.3T: (Unverändert) Stellt 'appCallbacks' wieder her.
 * - V13.3S: (Unverändert) Behebt 'setCardStale'-Tippfehler.
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';

// === MODULE STATE (V13.3T) ===
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

// ... (Private Helper: createSparkline, updateSparkline, renderTelemetry, renderBeaconData, renderDecodedData, sortBeaconCards, handleStaleToggle, showWriteModal, hideWriteModal - V13.3T, unverändert) ...

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) { /* ... (V13.3T, unverändert) ... */ }
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) { /* ... (V13.3T, unverändert) ... */ }
export function showInspectorView(deviceLog) { /* ... (V13.3T, unverändert) ... */ }
export function renderGattTree(gattTree, deviceName, summary) { /* ... (V13.3T, unverändert) ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) { /* ... (V13.3T, unverändert) ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung ===
    // V13.3V: HIER werden die Variablen zugewiesen
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
    // ... (Rest der Listener, unverändert) ...
    
    diagLog('UI-Event-Listener (V13.3V) erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) { /* ... (V13.3T, unverändert) ... */ }
export function updateBeaconUI(deviceId, device) { /* ... (V13.3T, unverändert) ... */ }
export function setCardStale(deviceId) { /* ... (V13.3T, unverändert) ... */ }

/**
 * V13.3V FIX: Fügt eine 'Guard Clause' hinzu.
 * (Verhindert Absturz, wenn 'clearLogs' vor 'setupUIListeners' läuft)
 */
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    
    // V13.3V FIX: Prüfe, ob 'beaconDisplay' bereits zugewiesen wurde.
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
    updateBeaconUI(deviceData.id, deviceData);
}
export function onLogsCleared() {
    clearUI();
}
 
