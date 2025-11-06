/**
 * js/ui.js (Version 11.6 - Rollback des Chart.js-Imports)
 * * ARCHITEKTUR-HINWEIS:
 * - V11.6 FIX: Entfernt den fehlerhaften 'import { Chart... }'
 * (Dieser hat den "Failed to fetch"-Absturz verursacht).
 * - Die App verlässt sich jetzt wieder darauf, dass 'index.html'
 * Chart.js global lädt.
 * - (Behält den V11.2 "DOM-Ready" Fix bei)
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';
// V11.6 FIX: Fehlerhaften Import entfernt
// import { Chart, registerables } from "...";
// Chart.register(...registerables); // Entfernt


// === MODULE STATE (V11.2) ===
// ... (alle 'let'-Deklarationen bleiben unverändert) ...
let scanButton, disconnectButton, viewToggle, sortButton, /*...*/ modalWriteSendBtn;

let isStaleModeActive = false;
const cardChartMap = new Map();
let appCallbacks = {};
let inspectorRssiChart = null;
let currentlyInspectedId = null;
let currentWriteCharUuid = null;

const INDUSTRIAL_COMPANIES = [ /*...*/ ];


// === PRIVATE HELPER: CHARTING ===
// (Diese Funktion ist jetzt sicher, da Chart.js von index.html geladen wird)
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#00faff', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, suggestedMin: -100, suggestedMax: -30 } }
        }
    });
}
function updateSparkline(chart, rssi) {
    // ... (unverändert)
}

// === PRIVATE HELPER: RENDERING ===
// ... (renderTelemetry, renderBeaconData unverändert) ...

// === PRIVATE HELPER: UI-AKTIONEN ===
// ... (sortBeaconCards, handleStaleToggle unverändert) ...

// === V11: MODAL-HELFER ===
// ... (showWriteModal, hideWriteModal unverändert) ...

// === PUBLIC API: VIEW-MANAGEMENT ===
// ... (showView, setGattConnectingUI, showInspectorView unverändert) ...

/**
 * V11: 'Schreiben'-Button ruft 'showWriteModal' auf.
 */
export function renderGattTree(gattTree, deviceName, summary) {
    // ... (Diese Funktion ist unverändert) ...
    
    gattTreeContainer.innerHTML = ''; 
    gattConnectButton.disabled = true;
    gattConnectButton.textContent = 'Verbunden';
    gattDisconnectButton.disabled = false;
    
    if (summary && Object.keys(summary).length > 0) {
        // ... (Summary-Box füllen) ...
    } else {
        gattSummaryBox.style.display = 'none';
    }

    gattTreeContainer.innerHTML = '<h3>GATT-Service-Baum</h3>'; 
    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML += '<p>Keine Services auf diesem Gerät gefunden.</p>';
        return;
    }
    
    gattTree.forEach(service => {
        // ... (Service-Header) ...
        
        const charListEl = document.createElement('div');
        charListEl.className = 'gatt-char-list';
        
        if (service.characteristics.length === 0) {
            charListEl.innerHTML = '<p>Keine Characteristics gefunden.</p>';
        } else {
            service.characteristics.forEach(char => {
                // ... (charEl erstellen) ...
                
                // V11: Listener binden
                if (canRead === '') {
                    charEl.querySelector('.gatt-read-btn').addEventListener('click', () => appCallbacks.onRead(char.uuid));
                }
                if (canWrite === '') {
                    charEl.querySelector('.gatt-write-btn').addEventListener('click', () => {
                        showWriteModal(char.uuid, char.name);
                    });
                }
                if (canNotify === '') {
                    // ... (notify listener) ...
                }
                charListEl.appendChild(charEl);
            });
        }
        serviceEl.appendChild(charListEl);
        gattTreeContainer.appendChild(serviceEl);
    });
}
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) {
    // ... (unverändert)
}

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * V11.2 PATCH: Alle getElementById-Aufrufe sind HIERHER verschoben.
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung ===
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
    // === Ende Zuweisung ===

    
    // Globale Aktionen
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    downloadButton.addEventListener('click', callbacks.onDownload);
    
    // Ansicht-Steuerung
    viewToggle.addEventListener('click', callbacks.onViewToggle); 
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    // Inspektor-Buttons
    gattConnectButton.addEventListener('click', () => {
        if (currentlyInspectedId && appCallbacks.onGattConnect) {
            appCallbacks.onGattConnect(currentlyInspectedId);
        }
    });
    gattDisconnectButton.addEventListener('click', () => {
        if (appCallbacks.onGattDisconnect) {
            appCallbacks.onGattDisconnect();
        }
    });

    // V11 Listener für das "Write Modal"
    modalWriteCancelBtn.addEventListener('click', hideWriteModal);
    
    modalWriteSendBtn.addEventListener('click', () => {
        const value = writeModalInput.value;
        const type = writeModalTypeSelect.value;
        
        if (currentWriteCharUuid && appCallbacks.onModalWriteSubmit) {
            appCallbacks.onModalWriteSubmit(currentWriteCharUuid, value, type);
        }
        hideWriteModal();
    });
    
    diagLog('UI-Event-Listener (V11.6) erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) {
    // ... (unverändert)
}
export function updateBeaconUI(deviceId, device) {
    // ... (unverändert)
}
export function setCardStale(deviceId) {
    // ... (unverändert)
}
export function clearUI() {
    // ... (unverändert)
}
