/**
 * js/ui.js (Version 13.3R - "Single Source of Truth Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3R FIX: 'updateBeaconUI' und 'showInspectorView'
 * lesen jetzt die *vollständigen* Felder aus dem 'deviceData'-Objekt,
 * das vom Logger (V13.3R) bereitgestellt wird.
 * - (Behebt den "undefined"-Bug in der UI).
 * - V13.3P: (Unverändert) Liest 'advertisementHistory' (RingBuffer).
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    // ... (Rest der Imports, V13.3P, unverändert) ...
} from './utils.js';

// === MODULE STATE (V13.3P, unverändert) ===
// ...

// === PRIVATE HELPER (V13.3P, unverändert) ===
function createSparkline(canvas) { /* ... */ }
function updateSparkline(chart, rssi) { /* ... */ }
function renderTelemetry(telemetry) { /* ... */ }
function renderBeaconData(beaconData) { /* ... */ }
function renderDecodedData(decodedData) { /* ... */ }
function sortBeaconCards() { /* ... */ }
function handleStaleToggle() { /* ... */ }
function showWriteModal(charUuid, charName) { /* ... */ }
function hideWriteModal() { /* ... */ }

// === PUBLIC API: VIEW-MANAGEMENT ===
export function showView(viewName) { /* ... (V13.3P, unverändert) ... */ }
export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    // ... (V13.3P, unverändert, funktioniert jetzt dank app.js V13.3P) ...
}

/**
 * V13.3R FIX: Liest die korrekten (vollständigen) V13.3R-Log-Felder
 */
export function showInspectorView(deviceLog) {
    // V13.3R: 'deviceLog' IST das 'deviceData'-Objekt
    
    currentlyInspectedId = deviceLog.id; // V13.3R
    if (inspectorRssiChart) {
        inspectorRssiChart.destroy();
        inspectorRssiChart = null;
    }
    inspectorAdList.innerHTML = '';
    gattSummaryBox.style.display = 'none';
    gattTreeContainer.innerHTML = '<p>Noch nicht verbunden. Klicken Sie auf "Verbinden", um den GATT-Baum zu laden.</p>';
    gattTreeContainer.style.display = 'block';
    
    inspectorDeviceName.textContent = deviceLog.name || '[Unbenannt]'; // V13.3R
    
    gattConnectButton.disabled = !deviceLog.isConnectable;
    gattConnectButton.textContent = 'Verbinden';
    gattDisconnectButton.disabled = true;
    const ctx = inspectorRssiCanvas.getContext('2d');
    
    // V13.3P FIX (unverändert)
    inspectorRssiChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: deviceLog.rssiHistory.map(h => h.t.substring(11, 19)),
            datasets: [{
                label: 'RSSI-Verlauf',
                data: deviceLog.rssiHistory.map(h => h.r),
                // ... (Chart-Stile, V13.3P, unverändert) ...
            }]
        },
        options: { /* ... (V13.3P, unverändert) ... */ }
    });

    // V13.3P FIX (unverändert)
    const ads = deviceLog.advertisementHistory.toArray();

    if (ads.length === 0) {
        inspectorAdList.innerHTML = '<div class="ad-entry">Keine Advertisement-Daten geloggt.</div>';
    } else {
        ads.reverse().forEach(ad => {
            let content = '';
            // V13.3R: 'ad' ist das 'parsedData'-Objekt
            if (ad.type === 'nameOnly') {
                content = `<strong>Typ:</strong> Nur Name`;
            } else if (ad.type === 'manufacturerData') {
                content = `<strong>Typ:</strong> Hersteller-Daten | <strong>Firma:</strong> ${ad.company}<br><span class="payload">${ad.beaconData.payload}</span>`;
            } else if (ad.type === 'serviceData') {
                // V13.3R: Korrektur des Feldnamens
                content = `<strong>Typ:</strong> Service-Daten | <strong>Service:</strong> ${ad.company}<br><span class="payload">${ad.beaconData.payload}</span>`;
            }
            inspectorAdList.innerHTML += `<div class="ad-entry">${content}</div>`;
        });
    }
    showView('inspector');
}

// ... (renderGattTree, updateCharacteristicValue - V13.3P, unverändert) ...
export function renderGattTree(gattTree, deviceName, summary) { /* ... */ }
export function updateCharacteristicValue(charUuid, value, isNotifying, decodedValue) { /* ... */ }

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * V13.3P: (unverändert)
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.2 DOM-Zuweisung (unverändert) ===
    scanButton = document.getElementById('scanButton');
    // ... (alle anderen Zuweisungen) ...
    modalWriteSendBtn = document.getElementById('modal-write-send-btn');
    
    // === Event Listeners (V13.3P, unverändert) ===
    scanButton.addEventListener('click', callbacks.onScan);
    // ... (alle anderen Listener) ...
    
    diagLog('UI-Event-Listener (V13.3P) erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) { /* ... (V13.3P, unverändert) ... */ }

/**
 * V13.3R FIX: Liest die korrekten (vollständigen) V13.3R-Log-Felder
 * Diese Funktion wird jetzt *nur* noch von 'onLogUpdated' aufgerufen.
 */
export function updateBeaconUI(deviceId, device) {
    // V13.3R: 'device' IST das 'deviceData'-Objekt aus dem Logger
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        // V12.3-Struktur (unverändert)
        card.addEventListener('click', () => {
            diagLog(`[TRACE] Klick auf Karte ${deviceId.substring(0, 4)}... in ui.js erkannt.`, 'info');
            if (appCallbacks.onInspect) { 
                appCallbacks.onInspect(deviceId);
            }
        });

        // V11.9 "SMART HIGHLIGHTING" PATCH (ROT)
        // V13.3R: Liest 'device.type'
        if (device.type === 'manufacturerData' || device.type === 'serviceData') {
            card.classList.add('data-beacon');
        }
        
        // V13.3R FIX: Liest die V13.3R-Felder
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
    // V13.3R FIX: Liest die V13.3R-Felder
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi); 
    
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
export function setCardStle(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) card.classList.add('stale');
}
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    beaconDisplay.innerHTML = '';
    cardChartMap.forEach(chart => chart.destroy());
    cardChartMap.clear();
}

/**
 * V13.3P: (unverändert) Der "Dirigent" für die UI.
 * Ruft updateBeaconUI mit dem (jetzt vollständigen) deviceData-Objekt auf.
 */
export function onLogUpdated(deviceData, isNewDevice) {
    updateBeaconUI(deviceData.id, deviceData);
}
export function onLogsCleared() {
    clearUI();
}
 
