/**
 * js/ui.js (Version 11.7 - Export-Fix)
 * * ARCHITEKTUR-HINWEIS:
 * - V11.7 FIX: Fügt das fehlende 'export'-Schlüsselwort
 * zu 'setGattConnectingUI' hinzu.
 * - Dies behebt den "does not provide an export"-Absturz
 * beim Laden von bluetooth.js.
 * - (Behält den V11.6 "DOM-Ready" Fix bei)
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
// Nur Deklarationen (let), keine Zuweisungen!
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

const INDUSTRIAL_COMPANIES = [
    'Nordic Semiconductor ASA',
    'Texas Instruments',
    'Silicon Labs',
    'Espressif Inc.',
    'Intel Corp.',
    'Qualcomm',
    'Siemens AG',
    'Robert Bosch GmbH',
    'KUKA AG',
    'Phoenix Contact',
    'Murata Manufacturing Co., Ltd.',
    'Volkswagen AG'
];


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
    const data = chart.data.datasets[0].data;
    const labels = chart.data.labels;
    data.push(rssi);
    labels.push('');
    if (data.length > 20) { data.shift(); labels.shift(); }
    chart.update('none');
}

// === PRIVATE HELPER: RENDERING ===
function renderTelemetry(telemetry) {
    if (!telemetry.temperature) return ''; 
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
    if (Object.keys(beaconData).length === 0) return '';
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

// === PRIVATE HELPER: UI-AKTIONEN ===
function sortBeaconCards() {
    diagLog('Sortiere Karten nach RSSI...', 'utils');
    const cards = Array.from(beaconDisplay.children);
    cards.sort((a, b) => (+b.dataset.rssi || -1000) - (+a.dataset.rssi || -1000));
    beaconDisplay.append(...cards);
}
function handleStaleToggle() {
    isStaleModeActive = staleToggle.checked;
    if (isStaleModeActive) {
        beaconDisplay.classList.add('stale-mode');
    } else {
        beaconDisplay.classList.remove('stale-mode');
    }
}

// === V11: MODAL-HELFER ===
function showWriteModal(charUuid, charName) {
    diagLog(`Öffne Write-Modal für ${charName} (${charUuid})`, 'ui');
    currentWriteCharUuid = charUuid;
    writeModalTitle.textContent = `Schreibe auf: ${charName}`;
    writeModalInput.value = '';
    writeModalTypeSelect.value = 'hex';
    writeModalOverlay.style.display = 'flex';
    writeModalInput.focus();
}
function hideWriteModal() {
    writeModalOverlay.style.display = 'none';
    currentWriteCharUuid = null;
}

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) {
    if (viewName === 'inspector') {
        if (beaconView) beaconView.style.display = 'none';
        if (inspectorView) inspectorView.style.display = 'block';
        if (viewToggle) viewToggle.disabled = false;
    } else {
        if (inspectorView) inspectorView.style.display = 'none';
        if (beaconView) beaconView.style.display = 'block';
        if (viewToggle) viewToggle.disabled = true;
    }
}

/**
 * V11.7 FIX: Das 'export'-Schlüsselwort wurde hinzugefügt.
 */
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    if (isConnecting) {
        gattConnectButton.disabled = true;
        gattConnectButton.textContent = 'Verbinde...';
        gattDisconnectButton.disabled = true;
        if (gattTreeContainer) gattTreeContainer.innerHTML = '<p>Verbinde und lese Services...</p>';
    } else if (isConnected) {
        gattConnectButton.disabled = true;
        gattConnectButton.textContent = 'Verbunden';
        gattDisconnectButton.disabled = false;
    } else {
        // V9.15: appCallbacks.onGetDeviceLog ist jetzt verfügbar
        if (appCallbacks.onGetDeviceLog) { 
            const deviceLog = appCallbacks.onGetDeviceLog(currentlyInspectedId);
            gattConnectButton.disabled = deviceLog ? !deviceLog.isConnectable : true;
            gattConnectButton.textContent = 'Verbinden';
        } else {
            // Fallback, falls der Callback noch nicht bereit ist
            gattConnectButton.disabled = false;
            gattConnectButton.textContent = 'Verbinden';
        }
        gattDisconnectButton.disabled = true;
        
        if (gattTreeContainer) {
            if (error) {
                gattTreeContainer.innerHTML = `<p style="color:var(--error-color);">Verbindung fehlgeschlagen: ${error}</p>`;
            } else {
                gattTreeContainer.innerHTML = '<p>Getrennt. Klicken Sie auf "Verbinden", um den GATT-Baum zu laden.</p>';
            }
        }
    }
}
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
    inspectorRssiChart = new Chart(ctx, {
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
    if (deviceLog.uniqueAdvertisements.length === 0) {
        inspectorAdList.innerHTML = '<div class="ad-entry">Keine Advertisement-Daten geloggt.</div>';
    } else {
        deviceLog.uniqueAdvertisements.forEach(ad => {
            let content = '';
            if (ad.type === 'nameOnly') {
                content = `<strong>Typ:</strong> Nur Name`;
            } else if (ad.type === 'manufacturerData') {
                content = `<strong>Typ:</strong> Hersteller-Daten | <strong>ID:</strong> ${ad.companyId}<br><span class="payload">${ad.payload}</span>`;
            } else if (ad.type === 'serviceData') {
                content = `<strong>Typ:</strong> Service-Daten | <strong>UUID:</strong> ${ad.serviceUuid}<br><span class="payload">${ad.payload}</span>`;
            }
            inspectorAdList.innerHTML += `<div class="ad-entry">${content}</div>`;
        });
    }
    showView('inspector');
}
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
}
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
    if (isScanning) {
        scanButton.disabled = true;
        scanButton.textContent = 'Scanning...';
        disconnectButton.disabled = false;
    } else {
        scanButton.disabled = false;
        scanButton.textContent = 'Scan Starten';
        disconnectButton.disabled = true;
    }
}
export function updateBeaconUI(deviceId, device) {
    let card = document.getElementById(deviceId);
    
    if (!card) {
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        diagLog(`[TRACE] updateBeaconUI: Prüfe 'isConnectable' für ${device.id.substring(0, 4)}... Wert: ${device.isConnectable}`, 'utils');
        
        card.addEventListener('click', () => {
            diagLog(`[TRACE] Klick auf Karte ${deviceId.substring(0, 4)}... in ui.js erkannt.`, 'info');
            if (appCallbacks.onInspect) { 
                diagLog(`[TRACE] Rufe appCallbacks.onInspect für ${deviceId.substring(0, 4)}... auf.`, 'info');
                appCallbacks.onInspect(deviceId);
            } else {
                diagLog(`[TRACE] FEHLER: appCallbacks.onInspect ist UNDEFINED.`, 'error');
            }
        });

        if (INDUSTRIAL_COMPANIES.includes(device.company)) {
            diagLog(`[TRACE] updateBeaconUI: Markiere ${device.company} als Industrie-Gerät.`, 'info');
            card.classList.add('industrial');
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
    
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();

    const beaconDataEl = card.querySelector('.beacon-data');
    if (beaconDataEl) beaconDataEl.innerHTML = renderBeaconData(device.beaconData).trim();

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
 
