/**
 * js/ui.js (Version 13.3MM - "Render & Chart Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3MM FIX: Stellt die V12.3-Funktionskörper für
 * 'renderTelemetry', 'renderBeaconData', 'renderDecodedData'
 * wieder her. (Behebt "undefined undefined undefined"-Bug).
 * - V13.3MM FIX: Stellt den V13.3KK-Fix 'new window.Chart()'
 * wieder her. (Behebt "Klick funktioniert nicht"-Bug).
 * - V13.3LL: (Unverändert) 'updateBeaconUI' (Guard Clause).
 * - V13.3Z: (Unverändert) 'setScanStatus' (Guard Clause).
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


// === PRIVATE HELPER: CHARTING (V13.3KK) ===
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    // V13.3KK FIX
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
    // V13.3MM FIX (V12.3-Logik wiederhergestellt)
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
    // V13.3MM FIX (V12.3-Logik wiederhergestellt)
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
    // V13.3MM FIX (V12.3-Logik wiederhergestellt)
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
 * V13.3KK FIX: 'Chart' -> 'window.Chart'
 * V13.3P: (unverändert) Liest V13.3-Datenstrukturen
 */
export function showInspectorView(deviceLog) {
    currentlyInspectedId = deviceLog.id;
    if (inspectorRssiChart) {
        inspectorRssiChart.destroy();
        inspectorRssiChart = null;
    }
    inspectorAdList.innerHTML = '';
    gattSummaryBox.style.display = 'none';
    gattTreeContainer.innerHTML = '<p>Noch nicht verbunden. Klicken Sie auf "Verbinden", um den GATT-Baum zu laden.</p>';
    gattTreeContainer.style.display = 'block';
    inspectorDeviceName.textContent = deviceLog.name || '[Unbenannt]';
    gattConnectButton.disabled = !deviceLog.isConnectable;
    gattConnectButton.textContent = 'Verbinden';
    gattDisconnectButton.disabled = true;
    const ctx = inspectorRssiCanvas.getContext('2d');
    
    // V13.3MM FIX (V13.3KK wiederhergestellt)
    inspectorRssiChart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: deviceLog.rssiHistory.map(h => h.t.substring(11, 19)),
            datasets: [{
                label: 'RSSI-Verlauf',
                data: deviceLog.rssiHistory.map(h => h.r),
                borderColor: '#00faff',
                backgroundColor: 'rgba(0, 250, 255, 0.1)',
                fill: true,
                pointRadius: 1,
                tension: 0.1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#aaa' } },
                y: { ticks: { color: '#aaa' }, suggestedMin: -100, suggestedMax: -30 }
            }
        }
    });

    // V13.3P FIX (unverändert)
    const ads = deviceLog.advertisementHistory.toArray();

    if (ads.length === 0) {
        inspectorAdList.innerHTML = '<div class="ad-entry">Keine Advertisement-Daten geloggt.</div>';
    } else {
        ads.reverse().forEach(ad => {
            let content = '';
            if (ad.type === 'nameOnly') {
                content = `<strong>Typ:</strong> Nur Name`;
            } else if (ad.type === 'manufacturerData') {
                content = `<strong>Typ:</strong> Hersteller-Daten | <strong>Firma:</strong> ${ad.company}<br><span class="payload">${ad.beaconData.payload}</span>`;
            } else if (ad.type === 'serviceData') {
                content = `<strong>Typ:</strong> Service-Daten | <strong>Service:</strong> ${ad.company}<br><span class="payload">${ad.beaconData.payload}</span>`;
            }
            inspectorAdList.innerHTML += `<div class="ad-entry">${content}</div>`;
        });
    }
    showView('inspector');
}

export function renderGattTree(gattTree, deviceName, summary) { /* ... (V13.3T, unverändert) ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) { /* ... (V13.3T, unverändert) ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung (unverändert) ===
    scanButton = document.getElementById('scanButton');
    // ... (Rest der Zuweisungen, V13.3LL, unverändert) ...
    modalWriteSendBtn = document.getElementById('modal-write-send-btn');
    
    // === Event Listeners (V13.3T, unverändert) ===
    scanButton.addEventListener('click', callbacks.onScan);
    // ... (Rest der Listener, V13.3LL, unverändert) ...
    
    diagLog('UI-Event-Listener (V13.3MM) erfolgreich gebunden.', 'info');
}

/**
 * V13.3Z FIX: (unverändert)
 */
export function setScanStatus(isScanning) { /* ... (V13.3Z, unverändert) ... */ }

/**
 * V13.3LL FIX: (unverändert)
 * V13.3MM: (unverändert) Ruft jetzt die *korrekten* Render-Funktionen auf
 */
export function updateBeaconUI(deviceId, device) {
    // V13.3LL FIX: (unverändert) Guard Clause
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
        
        card.addEventListener('click', () => { /* ... (V13.3LL, unverändert) ... */ });
        if (device.type === 'manufacturerData' || device.type === 'serviceData') {
            card.classList.add('data-beacon');
        }
        
        // V13.3MM FIX: Diese Aufrufe funktionieren jetzt
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

    // === Karte AKTUALISIEREN ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    // V13.3MM FIX: Diese Aufrufe funktionieren jetzt
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();

    const beaconDataEl = card.querySelector('.beacon-data');
    if (beaconDataEl) beaconDataEl.innerHTML = renderBeaconData(device.beaconData).trim();
    
    const decodedDataEl = card.querySelector('.beacon-data-decoded');
    if (decodedDataEl) decodedDataEl.innerHTML = renderDecodedData(device.decodedData).trim();

    const chart = cardChartMap.get(deviceId);
    if (chart) updateSparkline(chart, device.rssi);
    
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
 
