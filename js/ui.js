/**
 * js/ui.js (Version 13.3MM/NN - "DOM Assignment Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3NN FIX: Stellt die V11.2 DOM-Zuweisungen
 * (beaconDisplay = document.getElementById(...))
 * in 'setupUIListeners' wieder her.
 * - (Behebt den 'DOM nicht bereit'-Spam V13.3LL).
 * - V13.3MM: (Unverändert) Stellt V12.3-Render-Funktionen wieder her.
 * - V13.3KK: (Unverändert) Verwendet 'window.Chart'.
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


// === PRIVATE HELPER: CHARTING (V13.3KK) ===
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new window.Chart(ctx, {
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
    const data = chart.data.datasets[0].data;
    const labels = chart.data.labels;
    data.push(rssi);
    labels.push('');
    if (data.length > 20) { data.shift(); labels.shift(); }
    chart.update('none');
}

// === PRIVATE HELPER: RENDERING (V13.3MM FIX: V12.3 Wiederhergestellt) ===
function renderTelemetry(telemetry) {
    if (!telemetry || !telemetry.temperature) return ''; 
    return `
        <div class="beacon-telemetry">
            <span>🌡️ ${telemetry.temperature} °C</span>
            <span>💧 ${telemetry.humidity} %</span>
            <span>🌬️ ${telemetry.pressure} hPa</span>
            <span>🔋 ${telemetry.voltage} V</span>
        </div>
    `;
}
function renderBeaconData(beaconData) {
    if (!beaconData || Object.keys(beaconData).length === 0) return '';
    let html = '<div class="beacon-data">';
    
    if (beaconData.uuid) { // iBeacon
        html += `
            <div><strong>UUID:</strong> ${beaconData.uuid}</div>
            <div><strong>Major:</strong> ${beaconData.major} | <strong>Minor:</strong> ${beaconData.minor}</div>
        `;
    }
    if (beaconData.url) { // Eddystone-URL
        html += `
            <div><strong>URL:</strong> <a href="${beaconData.url}" target="_blank">${beaconData.url}</a></div>
        `;
    }
    if (beaconData.uid) { // Eddystone-UID
        html += `<div><strong>UID:</strong> ${beaconData.uid}</div>`;
    }
    if (beaconData.telemetry) { // Eddystone-TLM
        const tlm = beaconData.telemetry;
        html += `
            <div class="beacon-telemetry">
                <span>🔋 ${tlm.voltage} mV</span>
                <span>🌡️ ${tlm.temperature} °C</span>
                <span>📡 AdvCount: ${tlm.advCount}</span>
                <span>⏱️ Uptime: ${tlm.uptime / 10} s</span>
            </div>
        `;
    }
    html += '</div>';
    return html;
}
function renderDecodedData(decodedData) {
    if (!decodedData) return '';
    return `
        <div class="beacon-data-decoded">
            <span>📡 ${decodedData}</span>
        </div>
    `;
}


// === PRIVATE HELPER: UI-AKTIONEN (V12.3, unverändert) ===
function sortBeaconCards() { /* ... */ }
function handleStaleToggle() { /* ... */ }
function showWriteModal(charUuid, charName) { /* ... */ }
function hideWriteModal() { /* ... */ }

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) { /* ... (V13.3T, unverändert) ... */ }
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) { /* ... (V13.3T, unverändert) ... */ }

/**
 * V13.3KK FIX: (unverändert) 'window.Chart'
 */
export function showInspectorView(deviceLog) {
    currentlyInspectedId = deviceLog.id;
    if (inspectorRssiChart) {
        inspectorRssiChart.destroy();
        inspectorRssiChart = null;
    }
    // ... (Rest der Funktion, V13.3MM, unverändert) ...
    const ctx = inspectorRssiCanvas.getContext('2d');
    
    inspectorRssiChart = new window.Chart(ctx, { /* ... (V13.3KK) ... */ });
    
    const ads = deviceLog.advertisementHistory.toArray();
    // ... (Rest der Funktion, V13.3MM, unverändert) ...
    
    showView('inspector');
}

export function renderGattTree(gattTree, deviceName, summary) { /* ... (V13.3T, unverändert) ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) { /* ... (V13.3T, unverändert) ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * V13.3NN FIX: Stellt die V11.2 DOM-Zuweisungen wieder her
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V13.3NN FIX: V11.2 DOM-Zuweisung WIEDERHERGESTELLT ===
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

    
    // === Event Listeners (V13.3NN: Funktioniert jetzt) ===
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    downloadButton.addEventListener('click', callbacks.onDownload);
    viewToggle.addEventListener('click', callbacks.onViewToggle); 
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
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
    modalWriteCancelBtn.addEventListener('click', hideWriteModal);
    modalWriteSendBtn.addEventListener('click', () => {
        const value = writeModalInput.value;
        const type = writeModalTypeSelect.value;
        if (currentWriteCharUuid && appCallbacks.onModalWriteSubmit) {
            appCallbacks.onModalWriteSubmit(currentWriteCharUuid, value, type);
        }
        hideWriteModal();
    });
    
    diagLog('UI-Event-Listener (V13.3NN) erfolgreich gebunden.', 'info');
}

/**
 * V13.3Z FIX: (unverändert)
 */
export function setScanStatus(isScanning) { /* ... (V13.3Z, unverändert) ... */ }

/**
 * V13.3LL FIX: (unverändert) Guard Clause
 * V13.3MM FIX: (unverändert) Render-Funktionen
 */
export function updateBeaconUI(deviceId, device) {
    // V13.3LL FIX: (unverändert)
    if (!beaconDisplay) {
        // V13.3NN HINWEIS: Dieser Log sollte jetzt
        // nur noch *einmal* (von clearUI) kommen.
        diagLog(`[TRACE] updateBeaconUI für ${deviceId.substring(0,4)}... übersprungen (DOM nicht bereit).`, 'warn');
        return;
    }
    
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN (V13.3MM: Funktioniert jetzt) ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        card.addEventListener('click', () => { /* ... (V13.3LL, unverändert) ... */ });
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
        
        beaconDisplay.prepend(card);

        const canvas = card.querySelector('canvas');
        if (canvas) cardChartMap.set(deviceId, createSparkline(canvas));
    }

    // === Karte AKTUALISIEREN (V13.3MM: Funktioniert jetzt) ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    // ... (Rest der Aktualisierung, V13.3MM, unverändert) ...
    
    card.classList.remove('stale');
}

/**
 * V13.3S FIX: (unverändert)
 */
export function setCardStale(deviceId) { /* ... (V13.3S, unverändert) ... */ }

/**
 * V13.3V FIX: (unverändert)
 */
export function clearUI() { /* ... (V13.3V, unverändert) ... */ }

/**
 * V13.3P: (unverändert)
 */
export function onLogUpdated(deviceData, isNewDevice) {
    updateBeaconUI(deviceData.id, deviceData);
}
export function onLogsCleared() {
    clearUI();
}
 
