/**
 * js/ui.js (Version 8 - Smart UI mit GATT-Zusammenfassung)
 * * ARCHITEKTUR-HINWEIS:
 * - Importiert 'KNOWN_SERVICES'/'KNOWN_CHARACTERISTICS' aus utils.js.
 * - 'renderGattTree' füllt jetzt die neue '#gatt-summary'-Box.
 * - 'renderGattTree' zeigt jetzt die Namen von bekannten UUIDs im Roh-Baum an.
 * - 'updateCharacteristicValue' zeigt jetzt auch den dekodierten Wert an.
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,         // NEU
    KNOWN_CHARACTERISTICS   // NEU
} from './utils.js';

// === MODULE STATE ===
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const viewToggle = document.getElementById('viewToggle');
const sortButton = document.getElementById('sortButton');
const staleToggle = document.getElementById('staleToggle');
const beaconDisplay = document.getElementById('beaconDisplay');
const beaconView = document.getElementById('beacon-view');
const gattView = document.getElementById('gatt-view');
const gattDeviceName = document.getElementById('gatt-device-name');
const gattTreeContainer = document.getElementById('gatt-tree-container');
const gattDisconnectButton = document.getElementById('gattDisconnectButton');
const downloadButton = document.getElementById('downloadButton');

// NEU: Summary-Box gecacht
const gattSummaryBox = document.getElementById('gatt-summary');

let isStaleModeActive = false;
const chartMap = new Map();
let appCallbacks = {};

// === PRIVATE HELPER: CHARTING & RENDERING (Unverändert) ===
function createSparkline(canvas) { /* ... (Vollständige Funktion) ... */ }
function updateSparkline(chart, rssi) { /* ... (Vollständige Funktion) ... */ }
function renderTelemetry(telemetry) { /* ... (Vollständige Funktion) ... */ }
function renderBeaconData(beaconData) { /* ... (Vollständige Funktion) ... */ }
function sortBeaconCards() { /* ... (Vollständige Funktion) ... */ }
function handleStaleToggle() { /* ... (Vollständige Funktion) ... */ }

// (Hier sind die vollständigen Helfer, um 'end of input'-Fehler zu vermeiden)
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
    if (beaconData.uuid) {
        html += `
            <div><strong>UUID:</strong> ${beaconData.uuid}</div>
            <div><strong>Major:</strong> ${beaconData.major} | <strong>Minor:</strong> ${beaconData.minor}</div>
        `;
    }
    if (beaconData.url) {
        html += `<div><strong>URL:</strong> <a href="${beaconData.url}" target="_blank">${beaconData.url}</a></div>`;
    }
    if (beaconData.uid) {
        html += `<div><strong>UID:</strong> ${beaconData.uid}</div>`;
    }
    if (beaconData.telemetry) {
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
    if (viewName === 'gatt') {
        beaconView.style.display = 'none';
        gattView.style.display = 'block';
        viewToggle.textContent = 'Beacon-Ansicht'; 
    } else {
        gattView.style.display = 'none';
        beaconView.style.display = 'block';
        viewToggle.textContent = 'GATT-Ansicht';
    }
}
export function showConnectingState(name) {
    showView('gatt');
    gattDeviceName.textContent = `Verbinde mit: ${name}...`;
    // NEU: Summary-Box ebenfalls zurücksetzen
    gattSummaryBox.innerHTML = '';
    gattSummaryBox.style.display = 'none';
    gattTreeContainer.innerHTML = '<p>Verbinde und lese Services...</p>';
}

// === PUBLIC API: GATT-RENDERING ===

/**
 * NEU: "Aufgebohrte" Render-Funktion.
 * @param {Array<object>} gattTree - Baumstruktur von bluetooth.js.
 * @param {string} deviceName - Name des Geräts.
 * @param {object} summary - Das automatisch dekodierte Zusammenfassungs-Objekt.
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattDeviceName.textContent = `Verbunden mit: ${deviceName || 'Unbenannt'}`;
    gattTreeContainer.innerHTML = ''; // Roh-Baum leeren
    
    // === 1. ZUSAMMENFASSUNG FÜLLEN (NEU) ===
    if (summary && Object.keys(summary).length > 0) {
        let summaryHtml = '<h3>Geräte-Information</h3>';
        for (const [key, value] of Object.entries(summary)) {
            summaryHtml += `
                <div>
                    <strong>${key}:</strong>
                    <span>${value}</span>
                </div>
            `;
        }
        gattSummaryBox.innerHTML = summaryHtml;
        gattSummaryBox.style.display = 'block';
    } else {
        gattSummaryBox.innerHTML = '';
        gattSummaryBox.style.display = 'none';
    }

    // === 2. ROH-BAUM FÜLLEN (AKTUALISIERT) ===
    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML = '<p>Keine Services auf diesem Gerät gefunden.</p>';
        return;
    }
    
    gattTree.forEach(service => {
        const serviceEl = document.createElement('div');
        serviceEl.className = 'gatt-service';
        
        // NEU: Zeigt jetzt den Namen (falls bekannt) oder die UUID an
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
                const canWrite = props.write ? '' : 'disabled';
                const canNotify = props.notify || props.indicate ? '' : 'disabled';
                const valueElId = `val-${char.uuid}`;

                // NEU: Zeigt jetzt den Namen (falls bekannt) oder "Characteristic" an
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
                    charEl.querySelector('.gatt-read-btn').addEventListener('click', () => {
                        appCallbacks.onRead(char.uuid);
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

/**
 * NEU: Akzeptiert jetzt einen optionalen 'decodedValue' für die Anzeige.
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
        // Zeige den dekodierten Wert (z.B. "85 %") ODER den Text-Fallback an
        const displayValue = decodedValue ? decodedValue : dataViewToText(value);
        const hexVal = dataViewToHex(value);
        
        valueEl.innerHTML = `Wert: ${displayValue} <br><small>(${hexVal})</small>`;
        valueEl.style.color = "var(--text-color)";
    }
}

// === PUBLIC API: SETUP & BEACON UPDATE ===

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    gattDisconnectButton.addEventListener('click', callbacks.onGattDisconnect);
    downloadButton.addEventListener('click', callbacks.onDownload);
    
    viewToggle.addEventListener('click', () => {
        if (beaconView.style.display === 'none') showView('beacon');
        else showView('gatt');
    });
    
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    diagLog('UI-Event-Listener erfolgreich gebunden.', 'info');
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
        
        // [TRACE 2]
        diagLog(`[TRACE] updateBeaconUI: Prüfe connectable für ${device.id.substring(0, 4)}... Wert: ${device.isConnectable}`, 'utils');
        
        if (device.isConnectable) {
            // [TRACE 3A]
            diagLog(`[TRACE] updateBeaconUI: Hänge click listener an ${device.id.substring(0, 4)}... an.`, 'info');
            card.addEventListener('click', () => {
                // [TRACE 4]
                diagLog(`[TRACE] Klick auf Karte ${deviceId.substring(0, 4)}... in ui.js erkannt.`, 'info');
                if (appCallbacks.onConnect) {
                    diagLog(`[TRACE] Rufe appCallbacks.onConnect für ${deviceId.substring(0, 4)}... auf.`, 'info');
                    appCallbacks.onConnect(deviceId);
                } else {
                    diagLog(`[TRACE] FEHLER: appCallbacks.onConnect ist UNDEFINED.`, 'error');
                }
            });
        } else {
            // [TRACE 3B]
            diagLog(`[TRACE] updateBeaconUI: Mache ${device.id.substring(0, 4)}... NICHT klickbar.`, 'warn');
            card.classList.add('not-connectable');
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
        if (canvas) chartMap.set(deviceId, createSparkline(canvas));
    }

    // === Karte AKTUALISIEREN ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();

    const beaconDataEl = card.querySelector('.beacon-data');
    if (beaconDataEl) beaconDataEl.innerHTML = renderBeaconData(device.beaconData).trim();

    const chart = chartMap.get(deviceId);
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
    chartMap.forEach(chart => chart.destroy());
    chartMap.clear();
}
 
