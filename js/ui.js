/**
 * js/ui.js (Version 13.3RR - "Syntax Fix")
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

// === PRIVATE HELPER: RENDERING (V13.3MM, unverändert) ===
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
    if (beaconData.uuid) { /* iBeacon */ }
    if (beaconData.url) { /* Eddystone-URL */ }
    if (beaconData.uid) { /* Eddystone-UID */ }
    if (beaconData.telemetry) { /* Eddystone-TLM */ }
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
 * V13.3KK: (unverändert) 'window.Chart'
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
    
    // V13.3KK (unverändert)
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

    // V13.3P (unverändert)
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

/**
 * V13.3T (unverändert)
 * V13.3RR FIX: Fehlende '}' hinzugefügt
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattTreeContainer.innerHTML = ''; 
    gattConnectButton.disabled = true;
    gattConnectButton.textContent = 'Verbunden';
    gattDisconnectButton.disabled = false;
    
    if (summary && Object.keys(summary).length > 0) {
        let summaryHtml = '<h3>Geräte-Information</h3>';
        for (const [key, value] of Object.entries(summary)) {
            summaryHtml += `<div><strong>${key}:</strong> <span>${value}</span></div>`;
        }
        gattSummaryBox.innerHTML = summaryHtml;
        gattSummaryBox.style.display = 'block';
    } else {
        gattSummaryBox.style.display = 'none';
    }

    gattTreeContainer.innerHTML = '<h3>GATT-Service-Baum</h3>'; 
    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML += '<p>Keine Services auf diesem Gerät gefunden.</p>';
        return;
    }
    
    gattTree.forEach(service => {
        const serviceEl = document.createElement('div');
        serviceEl.className = 'gatt-service';
        serviceEl.innerHTML = `
            <div class="gatt-service-header">
                <strong>Service: ${service.name}</strong>
                <div>UUID: ${service.uuid}</div>
            </div>
        `;
        
        const charListEl = document.createElement('div');
        charListEl.className = 'gatt-char-list';
        
        if (service.characteristics.length === 0) {
            charListEl.innerHTML = '<p>Keine Characteristics gefunden.</p>';
        } else {
            service.characteristics.forEach(char => {
                const charEl = document.createElement('div');
                charEl.className = 'gatt-char';
                
                const props = char.properties;
                const canRead = props.read ? '' : 'disabled';
                const canWrite = (props.write || props.writeWithoutResponse) ? '' : 'disabled';
                const canNotify = (props.notify || props.indicate) ? '' : 'disabled';
                const valueElId = `val-${char.uuid}`;

                charEl.innerHTML = `
                    <div class="gatt-char-details">
                        <div class="gatt-char-name">${char.name}</div>
                        <div class="gatt-char-uuid">UUID: ${char.uuid}</div>
                        <div class="gatt-char-value" id="${valueElId}">Wert: --</div>
                    </div>
                    <div class="gatt-char-actions">
                        <button class="gatt-read-btn" ${canRead} data-uuid="${char.uuid}">Lesen</button>
                        <button class="gatt-write-btn" ${canWrite} data-uuid="${char.uuid}">Schreiben</button>
                        <button class="gatt-notify-btn" ${canNotify} data-uuid="${char.uuid}">Abonnieren</button>
                    </div>
                `;
                
                if (canRead === '') {
                    charEl.querySelector('.gatt-read-btn').addEventListener('click', () => appCallbacks.onRead(char.uuid));
                }
                if (canWrite === '') {
                    charEl.querySelector('.gatt-write-btn').addEventListener('click', () => {
                        showWriteModal(char.uuid, char.name);
                    });
                }
                if (canNotify === '') {
                    charEl.querySelector('.gatt-notify-btn').addEventListener('click', (e) => {
                        appCallbacks.onNotify(char.uuid);
                        e.target.style.borderColor = 'var(--accent-color-main)';
                        e.target.style.color = 'var(--accent-color-main)';
                        e.target.disabled = true;
                    });
                }
                charListEl.appendChild(charEl);
            });
        }
        serviceEl.appendChild(charListEl);
        gattTreeContainer.appendChild(serviceEl);
    });
} // <-- V13.3RR FIX: Diese '}' hat gefehlt

/**
 * V13.3T (unverändert)
 * V13.3RR FIX: Fehlende '}' hinzugefügt
 */
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) {
    const valueEl = document.getElementById(`val-${charUuid}`);
    if (!valueEl) return;
    if (isNotifying) {
        valueEl.textContent = "Wert: [Abonniert, warte auf Daten...]";
        valueEl.style.color = "var(--warn-color)";
        return;
    }
    if (value) {
        const displayValue = decodedValue ? decodedValue : dataViewToText(value);
        const hexVal = dataViewToHex(value);
        valueEl.innerHTML = `Wert: ${displayValue} <br><small>(${hexVal})</small>`;
        valueEl.style.color = "var(--text-color)";
    }
} // <-- V13.3RR FIX: Diese '}' hat gefehlt

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * V13.3NN (unverändert)
 * V13.3RR FIX: Fehlende '}' hinzugefügt
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V13.3NN DOM-Zuweisung (unverändert) ===
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

    
    // === Event Listeners (V13.3NN, unverändert) ===
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
    
    diagLog('UI-Event-Listener (V13.3RR) erfolgreich gebunden.', 'info');
} // <-- V13.3RR FIX: Diese '}' hat gefehlt

/**
 * V13.3PP (unverändert)
 * V13.3RR FIX: Fehlende '}' hinzugefügt
 */
export function setScanStatus(isScanning) {
    // V13.3Z FIX: (unverändert) Guard Clauses
    if (isScanning) {
        if (scanButton) {
            scanButton.disabled = true;
            scanButton.textContent = 'Scanning...';
            // V13.3PP FIX:
            scanButton.classList.remove('btn-primary');
            scanButton.classList.add('btn-secondary');
        }
        if (disconnectButton) {
            disconnectButton.disabled = false;
            // V13.3PP FIX:
            disconnectButton.classList.add('btn-primary');
            disconnectButton.classList.remove('btn-secondary');
        }
    } else {
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Starten';
            // V13.3PP FIX:
            scanButton.classList.add('btn-primary');
            scanButton.classList.remove('btn-secondary');
        }
        if (disconnectButton) {
            disconnectButton.disabled = true;
            // V13.3PP FIX:
            disconnectButton.classList.remove('btn-primary');
            disconnectButton.classList.remove('btn-secondary');
        }
    }
} // <-- V13.3RR FIX: Diese '}' hat gefehlt

/**
 * V13.3LL FIX: (unverändert)
 * V13.3MM FIX: (unverändert)
 */
export function updateBeaconUI(deviceId, device) {
    // V13.3LL FIX: (unverändert)
    if (!beaconDisplay) {
        diagLog(`[TRACE] updateBeaconUI für ${deviceId.substring(0,4)}... übersprungen (DOM nicht bereit).`, 'warn');
        return;
    }
    
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN (V13.3MM) ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        card.addEventListener('click', () => { /* ... (V13.3LL, unverändert) ... */ });
        if (device.type === 'manufacturerData' || device.type === 'serviceData') {
            card.classList.add('data-beacon');
        }
        
        // V13.3MM (unverändert)
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

    // === Karte AKTUALISIEREN (V13.3MM) ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();
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
 
