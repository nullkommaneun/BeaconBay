/**
 * js/ui.js (Version 13.3KK - REPARIERT - ARCHITEKTUR-FIX)
 *
 * - REPARATUR: Implementiert alle fehlenden UI-Rendering-Funktionen
 * - ARCHITEKTUR-FIX: `sortBeaconCards` und `handleStaleToggle` werden
 * exportiert und über app.js-Callbacks aufgerufen,
 * um die unidirektionale Architektur wiederherzustellen.
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


// === PRIVATE HELPER: CHARTING ===
/**
 * V13.3KK FIX: 'Chart' -> 'window.Chart'
 */
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

// === PRIVATE HELPER: RENDERING (REPARIERT) ===
function renderTelemetry(telemetry) {
    // Diese Funktion war in deiner Version leer
    if (!telemetry || Object.keys(telemetry).length === 0) return ''; 
    
    let html = '<div class="beacon-telemetry">';
    if (telemetry.temperature != null) {
        html += `<span>🌡️ ${telemetry.temperature.toFixed(2)} °C</span>`;
    }
    if (telemetry.humidity != null) {
        html += `<span>💧 ${telemetry.humidity.toFixed(2)} %</span>`;
    }
    if (telemetry.pressure != null) {
        html += `<span>💨 ${(telemetry.pressure / 100).toFixed(2)} hPa</span>`;
    }
    if (telemetry.battery != null) {
        html += `<span>🔋 ${telemetry.battery} mV</span>`;
    }
    html += '</div>';
    return html;
}
function renderBeaconData(beaconData) {
    // Diese Funktion war in deiner Version leer
    if (!beaconData || !beaconData.payload) return '';
    return `
        <div class="beacon-data">
            <span><strong>Payload:</strong> ${beaconData.payload.substring(0, 32)}...</span>
        </div>
    `;
}
function renderDecodedData(decodedData) {
    if (!decodedData) return '';
    return `
        <div class="beacon-data-decoded">
            <span>📡 ${decodedData}</span>
        </div>
    `;
}

// === PRIVATE HELPER: UI-AKTIONEN (REPARIERT & ANGEPASST) ===

// 1. ÄNDERUNG: 'export' hinzugefügt
export function sortBeaconCards() {
    diagLog("Sortiere Karten nach RSSI...", 'ui');
    const cards = Array.from(beaconDisplay.children);
    cards.sort((a, b) => {
        const rssiA = parseInt(a.dataset.rssi || '-100', 10);
        const rssiB = parseInt(b.dataset.rssi || '-100', 10);
        return rssiB - rssiA; // Höchster RSSI zuerst
    });
    cards.forEach(card => beaconDisplay.appendChild(card));
}

// 2. ÄNDERUNG: 'export' hinzugefügt
export function handleStaleToggle() {
    isStaleModeActive = staleToggle.checked;
    if (isStaleModeActive) {
        beaconDisplay.classList.add('stale-mode');
        diagLog("Stale-Modus: Aktiv (Inaktive werden ausgeblendet)", 'ui');
    } else {
        beaconDisplay.classList.remove('stale-mode');
        diagLog("Stale-Modus: Inaktiv", 'ui');
    }
}
function showWriteModal(charUuid, charName) {
    // Diese Funktion war in deiner Version leer
    currentWriteCharUuid = charUuid;
    writeModalTitle.textContent = `Schreibe auf ${charName}`;
    writeModalInput.value = '';
    writeModalTypeSelect.value = 'hex';
    writeModalOverlay.style.display = 'flex';
    writeModalInput.focus();
}
function hideWriteModal() {
    // Diese Funktion war in deiner Version leer
    writeModalOverlay.style.display = 'none';
    currentWriteCharUuid = null;
}

// === PUBLIC API: VIEW-MANAGEMENT (REPARIERT) ===
export function showView(viewName) {
    // Diese Funktion war in deiner Version leer
    if (viewName === 'inspector') {
        beaconView.style.display = 'none';
        inspectorView.style.display = 'block';
    } else {
        // 'beacon'
        beaconView.style.display = 'block';
        inspectorView.style.display = 'none';
        currentlyInspectedId = null;
        if (inspectorRssiChart) {
            inspectorRssiChart.destroy();
            inspectorRssiChart = null;
        }
    }
}

// === UX-VERBESSERUNG (Siehe Schritt 2) ===
function setGattConnectingUIText() {
     if (!gattConnectButton || !gattDisconnectButton) return;
    
    // Setze den Text basierend auf dem 'currentlyInspectedId'.
    // Wenn wir ein Gerät inspizieren, weiß der Nutzer, was er verbinden will.
    if (currentlyInspectedId) {
        gattConnectButton.textContent = 'Verbinden (Gerät auswählen)...';
    } else {
        gattConnectButton.textContent = 'Verbinden';
    }
}

export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    // Diese Funktion war in deiner Version leer
    if (!gattConnectButton || !gattDisconnectButton) return;
    
    if (isConnecting) {
        gattConnectButton.disabled = true;
        gattConnectButton.textContent = 'Verbinde...';
        gattDisconnectButton.disabled = true;
    } else if (isConnected) {
        gattConnectButton.disabled = true;
        gattConnectButton.textContent = 'Verbunden';
        gattDisconnectButton.disabled = false;
    } else {
        // Nicht verbunden (oder Fehler)
        gattConnectButton.disabled = false;
        setGattConnectingUIText(); // Verwende den verbesserten Text
        gattDisconnectButton.disabled = true;
        if (error) {
            gattTreeContainer.innerHTML = `<p style="color:var(--error-color);">Verbindung fehlgeschlagen: ${error}</p>`;
        }
    }
}

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
    
    // === UX-VERBESSERUNG (Siehe Schritt 2) ===
    // Wir teilen dem Nutzer mit, dass er das Gerät im Pop-up auswählen muss.
    setGattConnectingUIText(); 
    
    gattDisconnectButton.disabled = true;
    const ctx = inspectorRssiCanvas.getContext('2d');
    
    // V13.3KK FIX
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

export function renderGattTree(gattTree, deviceName, summary) {
    // Diese Funktion war in deiner Version leer
    diagLog(`[UI] Rendere GATT-Baum für ${deviceName}: ${summary.services} Services, ${summary.characteristics} Characteristics.`, 'ui');
    
    gattSummaryBox.style.display = 'block';
    gattSummaryBox.innerHTML = `
        <h3>${deviceName}</h3>
        <div><strong>Status:</strong> <span>Verbunden</span></div>
        <div><strong>Services:</strong> <span>${summary.services}</span></div>
        <div><strong>Characteristics:</strong> <span>${summary.characteristics}</span></div>
    `;

    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML = '<p>GATT-Verbindung erfolgreich, aber keine Services gefunden.</p>';
        return;
    }
    
    let html = '';
    gattTree.forEach(service => {
        html += `
            <div class="gatt-service">
                <div class="gatt-service-header">
                    <strong>${service.name}</strong><br>
                    <small>${service.uuid}</small>
                </div>
                <div class="gatt-char-list">
        `;
        
        if (service.characteristics.length === 0) {
            html += '<div class="gatt-char"><small>Keine Characteristics für diesen Service gefunden.</small></div>';
        }

        service.characteristics.forEach(char => {
            const props = char.properties;
            const canRead = props.read;
            const canWrite = props.write || props.writeWithoutResponse;
            const canNotify = props.notify;
            
            html += `
                <div class="gatt-char" id="char-${char.uuid}">
                    <div class="gatt-char-details">
                        <span class="gatt-char-name">${char.name}</span>
                        <span class="gatt-char-uuid">${char.uuid}</span>
                        <div class="gatt-char-value" data-uuid="${char.uuid}">
                            <small>Wert: (Noch nicht gelesen)</small>
                        </div>
                    </div>
                    <div class="gatt-char-actions">
                        <button class="btn-read" data-uuid="${char.uuid}" ${canRead ? '' : 'disabled'}>Read</button>
                        <button class="btn-write" data-uuid="${char.uuid}" data-name="${char.name}" ${canWrite ? '' : 'disabled'}>Write</button>
                        <button class="btn-notify" data-uuid="${char.uuid}" ${canNotify ? '' : 'disabled'}>Notify</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div></div>'; // .gatt-char-list, .gatt-service
    });
    
    gattTreeContainer.innerHTML = html;
}
export function updateCharacteristicValue(charUuid, value, isNotifying = false, decodedValue = null) {
    // Diese Funktion war in deiner Version leer
    const valueElement = document.querySelector(`.gatt-char-value[data-uuid="${charUuid}"]`);
    if (!valueElement) return;

    if (isNotifying) {
        valueElement.innerHTML = `<small>${decodedValue || 'Notifications aktiv...'}</small>`;
        valueElement.style.color = 'var(--accent-color-secondary)';
    } else {
        const displayValue = decodedValue || dataViewToHex(value);
        valueElement.innerHTML = `<strong>${displayValue}</strong>`;
        valueElement.style.color = 'var(--text-color)';
    }
}

// === PUBLIC API: SETUP & BEACON UPDATE ===

export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung (unverändert) ===
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
    
    // === Event Listeners (REPARIERT & ANGEPASST) ===
    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    downloadButton.addEventListener('click', callbacks.onDownload);
    viewToggle.addEventListener('click', callbacks.onViewToggle);
    
    // 3. ÄNDERUNG: Rufe die Callbacks auf
    sortButton.addEventListener('click', callbacks.onSort);
    staleToggle.addEventListener('change', callbacks.onStaleToggle);

    // GATT-Inspektor-Buttons
    gattConnectButton.addEventListener('click', () => {
        if (currentlyInspectedId && callbacks.onGattConnect) {
            callbacks.onGattConnect(currentlyInspectedId);
        }
    });
    gattDisconnectButton.addEventListener('click', callbacks.onGattDisconnect);
    
    // GATT-Baum (Event Delegation)
    gattTreeContainer.addEventListener('click', (e) => {
        const uuid = e.target.dataset.uuid;
        if (!uuid) return;
        
        if (e.target.classList.contains('btn-read') && callbacks.onRead) {
            callbacks.onRead(uuid);
        }
        if (e.target.classList.contains('btn-write') && callbacks.onRead) {
            const name = e.target.dataset.name || uuid;
            showWriteModal(uuid, name); // REPARIERT
        }
        if (e.target.classList.contains('btn-notify') && callbacks.onNotify) {
            callbacks.onNotify(uuid);
        }
    });
    
    // Modal-Buttons
    modalWriteCancelBtn.addEventListener('click', hideWriteModal);
    modalWriteSendBtn.addEventListener('click', () => {
        if (currentWriteCharUuid && callbacks.onModalWriteSubmit) {
            const value = writeModalInput.value;
            const type = writeModalTypeSelect.value;
            callbacks.onModalWriteSubmit(currentWriteCharUuid, value, type);
        }
        hideWriteModal();
    });
    
    diagLog('UI-Event-Listener (V13.3KK - ARCHITEKTUR-FIX) erfolgreich gebunden.', 'info');
}

/**
 * V13.3Z FIX: (unverändert)
 */
export function setScanStatus(isScanning) {
    if (isScanning) {
        if (scanButton) {
            scanButton.disabled = true;
            scanButton.textContent = 'Scanning...';
        }
        if (disconnectButton) {
            disconnectButton.disabled = false;
        }
    } else {
        if (scanButton) {
            scanButton.disabled = false;
            scanButton.textContent = 'Scan Starten';
        }
        if (disconnectButton) {
            disconnectButton.disabled = true;
        }
    }
}

/**
 * V13.3R FIX: (unverändert)
 */
export function updateBeaconUI(deviceId, device) {
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        card.addEventListener('click', () => {
            // V13.3KK: Log entfernt, da es in app.js geloggt wird
            if (appCallbacks.onInspect) { 
                appCallbacks.onInspect(deviceId);
            }
        });

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
        if (canvas) cardChartMap.set(deviceId, createSparkline(canvas)); // V13.3KK: Ruft 'window.Chart' auf
    }

    // === Karte AKTUALISIEREN ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    // REPARIERT: Nutzt die reparierte utils.js-Funktion
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
    // REPARIERT: Aktualisiere Telemetrie, falls sie sich ändert
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.remove();
    card.querySelector('.beacon-signal').insertAdjacentHTML('afterend', renderTelemetry(device.telemetry));

    // REPARIERT: Aktualisiere Namen, falls er sich ändert
    if (device.name !== '[Unbenannt]') {
        card.querySelector('h3').textContent = device.name;
    }

    const chart = cardChartMap.get(deviceId);
    if (chart) updateSparkline(chart, device.rssi);
    
    card.classList.remove('stale');
}

/**
 * V13.3S FIX: (unverändert)
 */
export function setCardStale(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) card.classList.add('stale');
}

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
 
