/**
 * js/ui.js (Version 12 - "Live Advertisement Decoder")
 * * ARCHITEKTUR-HINWEIS:
 * - V12: updateBeaconUI zeigt jetzt das neue Feld 'device.decodedData'
 * (aus utils.js V12) auf der Beacon-Karte an.
 * - (Basiert auf V11.9, alle DOM/Export/Highlighting-Fixes sind enthalten)
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';
// V11.6: Chart.js wird von index.html geladen, kein Import hier.


// === MODULE STATE (V11.2) ===
// ... (alle 'let'-Deklarationen bleiben unverändert) ...
let scanButton, disconnectButton, viewToggle, sortButton, staleToggle,
    beaconDisplay, downloadButton, beaconView, inspectorView,
    inspectorDeviceName, inspectorRssiCanvas, inspectorAdList,
    gattConnectButton, gattDisconnectButton, gattSummaryBox, gattTreeContainer,
    writeModalOverlay, writeModalTitle, writeModalTypeSelect, writeModalInput,
    modalWriteCancelBtn, modalWriteSendBtn;

let isStaleModeActive = false;
const cardChartMap = new Map();
let appCallbacks = {};
let inspectorRssiChart = null;
let currentlyInspectedId = null;
let currentWriteCharUuid = null;

// V11.9: INDUSTRIAL_COMPANIES-Liste entfernt.


// === PRIVATE HELPER: CHARTING ===
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    // 'Chart' ist global verfügbar (von index.html)
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
function renderTelemetry(telemetry) {
    // ... (unverändert)
}
function renderBeaconData(beaconData) {
    // ... (unverändert)
}
// V12 NEU: Helfer-Funktion für die dekodierten Daten
function renderDecodedData(decodedData) {
    if (!decodedData) return '';
    return `
        <div class="beacon-data-decoded">
            <span>📡 ${decodedData}</span>
        </div>
    `;
}


// === PRIVATE HELPER: UI-AKTIONEN ===
function sortBeaconCards() {
    // ... (unverändert)
}
function handleStaleToggle() {
    // ... (unverändert)
}

// === V11: MODAL-HELFER ===
function showWriteModal(charUuid, charName) {
    // ... (unverändert)
}
function hideWriteModal() {
    // ... (unverändert)
}

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) {
    // ... (unverändert)
}

/**
 * V11.7 FIX: Das 'export'-Schlüsselwort wurde hinzugefügt.
 */
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    // ... (unverändert)
}
export function showInspectorView(deviceLog) {
    // ... (unverändert)
}
export function renderGattTree(gattTree, deviceName, summary) {
    // ... (unverändert, V11-Schreib-Buttons sind aktiv)
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
    
    diagLog('UI-Event-Listener (V11.7) erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) {
    // ... (unverändert)
}

/**
 * V12 PATCH: Zeigt 'decodedData' an.
 */
export function updateBeaconUI(deviceId, device) {
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

        // V11.9 "SMART HIGHLIGHTING" PATCH (ROT)
        if (device.type === 'manufacturerData' || device.type === 'serviceData') {
            diagLog(`[TRACE] updateBeaconUI: Markiere ${device.id.substring(0,4)} als Daten-Beacon.`, 'info');
            card.classList.add('data-beacon'); // Roter Rand
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
            ${renderDecodedData(device.decodedData)} <div class="sparkline-container"><canvas></canvas></div>
        `;
        beaconDisplay.prepend(card);

        const canvas = card.querySelector('canvas');
        if (canvas) cardChartMap.set(deviceId, createSparkline(canvas));
    }

    // === Karte AKTUALISIEREN ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();

    const beaconDataEl = card.querySelector('.beacon-data');
    if (beaconDataEl) beaconDataEl.innerHTML = renderBeaconData(device.beaconData).trim();
    
    // V12 NEU: Dekodierte Daten auch aktualisieren (falls sie sich ändern)
    const decodedDataEl = card.querySelector('.beacon-data-decoded');
    if (decodedDataEl) decodedDataEl.innerHTML = renderDecodedData(device.decodedData).trim();

    const chart = cardChartMap.get(deviceId);
    if (chart) updateSparkline(chart, device.rssi);
    
    card.classList.remove('stale');
}
export function setCardStale(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) card.classList.add('stale');
}
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    beaconDisplay.innerHTML = '';
    cardChartMap.forEach(chart => chart.destroy());
    cardChartMap.clear();
}
 
