/**
 * js/ui.js (Version 13.3Z - "Race Condition Fix 2")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3Z FIX: 'setScanStatus()' prüft jetzt, ob 'scanButton'
 * 'null' ist, bevor es darauf zugreift.
 * - (Behebt den 'Cannot set property 'disabled' of null'-Absturz
 * beim Starten des Scans (V13.3Y)).
 * - V13.3V: (Unverändert) 'clearUI()' ist bereits abgesichert.
 * - V13.3T: (Unverändert) Stellt 'appCallbacks' wieder her.
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
    
    // === V11.2 DOM-Zuweisung (unverändert) ===
    scanButton = document.getElementById('scanButton');
    disconnectButton = document.getElementById('disconnectButton');
    // ... (Rest der Zuweisungen, V13.3T, unverändert) ...
    modalWriteSendBtn = document.getElementById('modal-write-send-btn');
    
    // === Event Listeners (V13.3T, unverändert) ===
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    // ... (Rest der Listener, V13.3T, unverändert) ...
    
    diagLog('UI-Event-Listener (V13.3Z) erfolgreich gebunden.', 'info');
}

/**
 * V13.3Z FIX: Fügt 'Guard Clauses' (Null-Prüfungen) hinzu,
 * da diese Funktion VOR 'setupUIListeners' aufgerufen wird.
 */
export function setScanStatus(isScanning) {
    if (isScanning) {
        if (scanButton) { // V13.3Z FIX
            scanButton.disabled = true;
            scanButton.textContent = 'Scanning...';
        }
        if (disconnectButton) { // V13.3Z FIX
            disconnectButton.disabled = false;
        }
    } else {
        if (scanButton) { // V13.3Z FIX
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Starten';
        }
        if (disconnectButton) { // V13.3Z FIX
            disconnectButton.disabled = true;
        }
    }
}

export function updateBeaconUI(deviceId, device) { /* ... (V13.3T, unverändert) ... */ }
export function setCardStale(deviceId) { /* ... (V13.3T, unverändert) ... */ }

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
    updateBeaconUI(deviceData.id, deviceData);
}
export function onLogsCleared() {
    clearUI();
}
