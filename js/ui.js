/**
 * js/ui.js (Version 9.1 - Inspektor-Modell & Industrial-Highlight)
 * * ARCHITEKTUR-HINWEIS: Layer 2 Modul.
 * - Behebt den "Cannot read properties of null" Crash durch Verwendung der korrekten IDs (inspector-view, beacon-view).
 * - Implementiert das "Inspektor-Modell" (Klick -> Inspizieren, nicht Verbinden).
 * - Enthält die 'INDUSTRIAL_COMPANIES'-Liste, um relevante Geräte hervorzuheben.
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

// NEU: Geteilte Ansichten, behebt den Crash
const beaconView = document.getElementById('beacon-view');
const inspectorView = document.getElementById('inspector-view'); // (war gatt-view)

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
let inspectorRssiChart = null; // Für den großen Chart im Inspektor
let appCallbacks = {};

/**
 * NEU: Liste der Firmen, die wir als "Industrie-relevant" einstufen.
 * (Stellen Sie sicher, dass diese mit Ihrer 'company_ids.json' übereinstimmen)
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
    if (!telemetry.temperature) return ''; // Prüft auf ein Ruuvi-spezifisches Feld
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

/**
 * KORRIGIERT: Schaltet zwischen 'beacon' und 'inspector' Ansicht um.
 * Behebt den "Cannot read properties of null (reading 'style')" Fehler.
 */
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

/**
 * NEU: Wird von bluetooth.js aufgerufen, um die UI in den Ladezustand zu versetzen.
 * @param {boolean} isConnecting - Ob die Verbindung gerade läuft.
 * @param {string | null} [error=null] - Eine Fehlermeldung, falls aufgetreten.
 * @param {boolean} [isConnected=false] - Ob die Verbindung erfolgreich war.
 */
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    const connectBtn = document.getElementById('gattConnectButton');
    const disconnectBtn = document.getElementById('gattDisconnectButton');

    if (isConnecting) {
        if (connectBtn) {
            connectBtn.disabled = true;
            connectBtn.textContent = 'Verbinde...';
        }
        if (disconnectBtn) disconnectBtn.disabled = true;
        if (gattTreeContainer) gattTreeContainer.innerHTML = '<p>Verbinde und lese Services...</p>';
    } else if (isConnected) {
        if (connectBtn) {
            connectBtn.disabled = true;
            connectBtn.textContent = 'Verbunden';
        }
        if (disconnectBtn) disconnectBtn.disabled = false;
    } else {
        // Fehler oder normale Trennung
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Verbinden';
        }
        if (disconnectBtn) disconnectBtn.disabled = true;
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
 * NEU: Füllt und zeigt die Inspektor-Ansicht, wenn auf eine Karte geklickt wird.
 * @param {object} deviceLog - Das vollständige Log-Objekt von logger.js.
 */
export function showInspectorView(deviceLog) {
    showView('inspector');
    
    inspectorDeviceName.textContent = deviceLog.name || '[Unbenannt]';
    
    // Klonen der Buttons, um alte Event-Listener sicher zu entfernen
    const newConnectBtn = gattConnectButton.cloneNode(true);
    gattConnectButton.parentNode.replaceChild(newConnectBtn, gattConnectButton);
    newConnectBtn.id = 'gattConnectButton'; // ID wiederherstellen

    const newDisconnectBtn = gattDisconnectButton.cloneNode(true);
    gattDisconnectButton.parentNode.replaceChild(newDisconnectBtn, gattDisconnectButton);
    newDisconnectBtn.id = 'gattDisconnectButton';
    
    if (deviceLog.isConnectable) {
        newConnectBtn.disabled = false;
        newConnectBtn.textContent = 'Verbinden';
        newConnectBtn.addEventListener('click', () => {
            appCallbacks.onGattConnect(deviceLog.id);
        });
    } else {
        newConnectBtn.disabled = true;
        newConnectBtn.textContent = 'GATT nicht verfügbar';
    }
    
    newDisconnectBtn.disabled = true;
    newDisconnectBtn.addEventListener('click', () => appCallbacks.onGattDisconnect());
    
    // RSSI-Verlauf-Chart rendern
    if (inspectorRssiChart) {
        inspectorRssiChart.destroy();
    }
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

    // Advertisement-Liste rendern
    inspectorAdList.innerHTML = '';
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

    // GATT-Bereiche zurücksetzen
    gattSummaryBox.style.display = 'none';
    gattTreeContainer.innerHTML = '<p>Noch nicht verbunden. Klicken Sie auf "Verbinden", um den GATT-Baum zu laden.</p>';
    gattTreeContainer.style.display = 'block';
}


/**
 * Füllt den GATT-Baum *innerhalb* der Inspektor-Ansicht.
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattTreeContainer.innerHTML = ''; // Nur den Baum-Container leeren
    
    // Update: Buttons nach erfolgreicher Verbindung setzen
    const connectBtn = document.getElementById('gattConnectButton');
    const disconnectBtn = document.getElementById('gattDisconnectButton');
    
    if(connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Verbunden';
    }
    if(disconnectBtn) {
        disconnectBtn.disabled = false;
    }
    
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
                const canWrite = props.write ? '' : 'disabled';
                const canNotify = props.notify || props.indicate ? '' : 'disabled';
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

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    // HINWEIS: gattConnect/Disconnect werden jetzt in showInspectorView gebunden
    downloadButton.addEventListener('click', callbacks.onDownload);
    viewToggle.addEventListener('click', callbacks.onViewToggle); 
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
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        // [TRACE 2]
        diagLog(`[TRACE] updateBeaconUI: Prüfe 'isConnectable' (isInteresting) für ${device.id.substring(0, 4)}... Wert: ${device.isConnectable}`, 'utils');
        
        // NEU: JEDE Karte ist klickbar
        diagLog(`[TRACE] updateBeaconUI: Hänge click listener an ${device.id.substring(0, 4)}... an.`, 'info');
        card.addEventListener('click', () => {
            // [TRACE 4]
            diagLog(`[TRACE] Klick auf Karte ${deviceId.substring(0, 4)}... in ui.js erkannt.`, 'info');
            if (appCallbacks.onInspect) { // NEU: Ruft 'onInspect' auf
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
 
