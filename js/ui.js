/**
 * js/ui.js (Version 10 - GATT-Write Implementiert)
 * * ARCHITEKTUR-HINWEIS:
 * - Basiert auf stabiler V9.2-Logik (permanente Listener).
 * - V10: Aktiviert den "Schreiben"-Button im GATT-Baum.
 * - V10: Fügt 'writeWithoutResponse' zur 'canWrite'-Prüfung hinzu.
 * - V10: Bindet den Click-Listener für 'onWrite' in renderGattTree.
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';

// === MODULE STATE ===
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const viewToggle = document.getElementById('viewToggle');
const sortButton = document.getElementById('sortButton');
const staleToggle = document.getElementById('staleToggle');
const beaconDisplay = document.getElementById('beaconDisplay');
const downloadButton = document.getElementById('downloadButton');

// Geteilte Ansichten
const beaconView = document.getElementById('beacon-view');
const inspectorView = document.getElementById('inspector-view');

// Inspektor-Ansicht Elemente
const inspectorDeviceName = document.getElementById('inspectorDeviceName');
const inspectorRssiCanvas = document.getElementById('inspectorRssiChart');
const inspectorAdList = document.getElementById('inspector-ad-list');
const gattConnectButton = document.getElementById('gattConnectButton');
const gattDisconnectButton = document.getElementById('gattDisconnectButton');
const gattSummaryBox = document.getElementById('gatt-summary');
const gattTreeContainer = document.getElementById('gatt-tree-container');


let isStaleModeActive = false;
const cardChartMap = new Map(); // Für die kleinen Sparklines
let appCallbacks = {};

// V9.2 PATCH: Zustandsspeicherung für den Inspektor
let inspectorRssiChart = null; // Hält die Chart.js-Instanz
let currentlyInspectedId = null; // Hält die ID für den "Verbinden"-Button

/**
 * NEU: Liste der Firmen, die wir als "Industrie-relevant" einstufen.
 */
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

// === PUBLIC API: VIEW-MANAGEMENT ===

export function showView(viewName) {
    if (viewName === 'inspector') {
        if (beaconView) beaconView.style.display = 'none';
        if (inspectorView) inspectorView.style.display = 'block';
        if (viewToggle) viewToggle.disabled = false;
    } else {
        // Standard ist Beacon-Ansicht
        if (inspectorView) inspectorView.style.display = 'none';
        if (beaconView) beaconView.style.display = 'block';
        if (viewToggle) viewToggle.disabled = true;
    }
}

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
        // Fehler oder normale Trennung
        const deviceLog = appCallbacks.onGetDeviceLog(currentlyInspectedId);
        
        gattConnectButton.disabled = deviceLog ? !deviceLog.isConnectable : true;
        gattConnectButton.textContent = deviceLog ? 'Verbinden' : '...'; // (V9.13 Fix: 'isConnectable' ist jetzt immer true)
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


/**
 * V9.2 PATCH: Robuste Inspektor-Ansicht
 */
export function showInspectorView(deviceLog) {
    
    // ----- 1. ZUSTAND SETZEN (KRITISCH) -----
    currentlyInspectedId = deviceLog.id;

    // ----- 2. ALTE DATEN BEREINIGEN (KRITISCH) -----
    if (inspectorRssiChart) {
        inspectorRssiChart.destroy();
        inspectorRssiChart = null;
    }
    inspectorAdList.innerHTML = '';
    gattSummaryBox.style.display = 'none';
    gattTreeContainer.innerHTML = '<p>Noch nicht verbunden. Klicken Sie auf "Verbinden", um den GATT-Baum zu laden.</p>';
    gattTreeContainer.style.display = 'block';

    // ----- 3. NEUE DATEN FÜLLEN -----
    inspectorDeviceName.textContent = deviceLog.name || '[Unbenannt]';
    
    // (V9.13 Fix: 'isConnectable' ist jetzt immer true)
    gattConnectButton.disabled = !deviceLog.isConnectable;
    gattConnectButton.textContent = 'Verbinden';
    gattDisconnectButton.disabled = true;
    
    // ----- 4. NEUEN CHART ZEICHNEN -----
    const ctx = inspectorRssiCanvas.getContext('2d');
    inspectorRssiChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: deviceLog.rssiHistory.map(h => h.t.substring(11, 19)), // Nur HH:MM:SS
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

    // ----- 5. ADVERTISEMENT-LISTE FÜLLEN -----
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

    // ----- 6. ANSICHT WECHSELN -----
    showView('inspector');
}


/**
 * Füllt den GATT-Baum *innerhalb* der Inspektor-Ansicht.
 * V10 PATCH: Aktiviert den "Schreiben"-Button.
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattTreeContainer.innerHTML = ''; // Nur den Baum-Container leeren
    
    // Update: Buttons nach erfolgreicher Verbindung setzen
    gattConnectButton.disabled = true;
    gattConnectButton.textContent = 'Verbunden';
    gattDisconnectButton.disabled = false;
    
    // === 1. ZUSAMMENFASSUNG FÜLLEN ===
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

    // === 2. ROH-BAUM FÜLLEN ===
    gattTreeContainer.innerHTML = '<h3>GATT-Service-Baum</h3>'; // Überschrift hinzufügen
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
                // V10 PATCH: Prüft 'write' ODER 'writeWithoutResponse'
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
                // V10 HINZUGEFÜGT:
                if (canWrite === '') {
                    charEl.querySelector('.gatt-write-btn').addEventListener('click', () => appCallbacks.onWrite(char.uuid));
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
 * V9.2 PATCH: Bindet ALLE Listener einmalig
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // Globale Aktionen
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    downloadButton.addEventListener('click', callbacks.onDownload);
    
    // Ansicht-Steuerung
    viewToggle.addEventListener('click', callbacks.onViewToggle); 
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    // V9.2 PATCH: Permanente Listener für Inspektor-Buttons
    gattConnectButton.addEventListener('click', () => {
        if (currentlyInspectedId && appCallbacks.onGattConnect) {
            diagLog(`[TRACE] gattConnectButton Klick erfasst. ID: ${currentlyInspectedId.substring(0,4)}...`, 'info');
            appCallbacks.onGattConnect(currentlyInspectedId);
        } else {
            diagLog(`[TRACE] gattConnectButton Klick FEHLER: currentlyInspectedId ist null oder Callback fehlt.`, 'error');
        }
    });
    
    gattDisconnectButton.addEventListener('click', () => {
        if (appCallbacks.onGattDisconnect) {
            diagLog(`[TRACE] gattDisconnectButton Klick erfasst.`, 'info');
            appCallbacks.onGattDisconnect();
        }
    });
    
    diagLog('UI-Event-Listener (V9.2) erfolgreich gebunden.', 'info');
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
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        // V9.13 HINWEIS: 'isConnectable' ist jetzt immer 'true'.
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

        // "Industrial Highlighting"
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
