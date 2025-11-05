/**
 * js/ui.js (Version 2 - Mit GATT-UI-Logik)
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 2.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js
 * * ZWECK:
 * 1. Kapselt *alle* DOM-Manipulationen (außer Log-Panel).
 * 2. Verwaltet den UI-Zustand (View-Switching, Stale-Modus).
 * 3. Rendert Beacon-Karten (inkl. Charts) und den GATT-Baum.
 * 4. Nimmt Callbacks von app.js entgegen (Dependency Inversion).
 */

import { diagLog } from './errorManager.js';
import { calculateDistance } from './utils.js'; // Für Distanzanzeige

// === MODULE STATE ===

// --- DOM-Elemente (gecacht) ---
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


let isStaleModeActive = false;
/**
 * Speichert Chart.js-Instanzen (deviceId -> chartInstance)
 * @type {Map<string, Chart>}
 */
const chartMap = new Map();

/**
 * Speichert die von app.js übergebenen Callbacks.
 * @type {object}
 */
let appCallbacks = {};

// === PRIVATE HELPER: CHARTING ===

/**
 * Erstellt eine neue Chart.js-Sparkline-Instanz.
 * @param {HTMLCanvasElement} canvas - Das Canvas-Element.
 * @returns {Chart} Die Chart.js-Instanz.
 */
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: { 
            labels: [], 
            datasets: [{ 
                data: [], 
                borderColor: '#00faff', 
                borderWidth: 2, 
                pointRadius: 0, 
                tension: 0.3 
            }] 
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { 
                x: { display: false }, 
                y: { display: false, suggestedMin: -100, suggestedMax: -30 } 
            }
        }
    });
}

/**
 * Aktualisiert eine Sparkline mit einem neuen RSSI-Wert.
 * @param {Chart} chart - Die Chart.js-Instanz.
 * @param {number} rssi - Der neue RSSI-Wert.
 */
function updateSparkline(chart, rssi) {
    const data = chart.data.datasets[0].data;
    const labels = chart.data.labels;
    data.push(rssi);
    labels.push('');
    // Begrenze auf 20 Datenpunkte
    if (data.length > 20) {
        data.shift();
        labels.shift();
    }
    chart.update('none'); // Update ohne Animation
}

// === PRIVATE HELPER: RENDERING ===

function renderTelemetry(telemetry) {
    if (Object.keys(telemetry).length === 0) return '';
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
    return `
        <div class="beacon-data">
            <div><strong>UUID:</strong> ${beaconData.uuid}</div>
            <div><strong>Major:</strong> ${beaconData.major} | <strong>Minor:</strong> ${beaconData.minor}</div>
        </div>
    `;
}

// === PRIVATE HELPER: UI-AKTIONEN ===

/**
 * Sortiert die Beacon-Karten im DOM nach 'data-rssi'.
 */
function sortBeaconCards() {
    diagLog('Sortiere Karten nach RSSI...', 'utils');
    const cards = Array.from(beaconDisplay.children);
    // Sortiere absteigend (stärkstes Signal zuerst)
    cards.sort((a, b) => (+b.dataset.rssi || -1000) - (+a.dataset.rssi || -1000));
    // Effizientes Verschieben der DOM-Elemente
    beaconDisplay.append(...cards);
}

/**
 * Behandelt den Klick auf den Stale-Toggle.
 */
function handleStaleToggle() {
    isStaleModeActive = staleToggle.checked;
    // WIE: CSS-Klasse am Container ist performanter als JS-Loop.
    if (isStaleModeActive) {
        beaconDisplay.classList.add('stale-mode');
        diagLog('Stale-Modus aktiviert (verstecke inaktive).', 'utils');
    } else {
        beaconDisplay.classList.remove('stale-mode');
        diagLog('Stale-Modus deaktiviert (zeige alle).', 'utils');
    }
}

// === PUBLIC API: VIEW-MANAGEMENT ===

/**
 * Schaltet zwischen den Hauptansichten "beacon" und "gatt" um.
 * @param {'beacon' | 'gatt'} viewName - Die anzuzeigende Ansicht.
 */
export function showView(viewName) {
    if (viewName === 'gatt') {
        beaconView.style.display = 'none';
        gattView.style.display = 'block';
        viewToggle.textContent = 'Beacon-Ansicht'; 
    } else {
        gattView.style.display = 'none';
        beaconView.style.display = 'block';
        viewToggle.textContent = 'GATT-Ansicht (WIP)';
    }
}

/**
 * Setzt die GATT-Ansicht in einen "Verbinde..."-Zustand.
 * @param {string} name - Der Name des Geräts.
 */
export function showConnectingState(name) {
    showView('gatt');
    gattDeviceName.textContent = `Verbinde mit: ${name}...`;
    gattTreeContainer.innerHTML = '<p>Verbinde und lese Services...</p>';
}

// === PUBLIC API: GATT-RENDERING ===

/**
 * Rendert den gesamten GATT-Baum (Services & Characteristics).
 * @param {Array<object>} gattTree - Der von bluetooth.js erstellte Baum.
 * @param {string} deviceName - Der Name des verbundenen Geräts.
 */
export function renderGattTree(gattTree, deviceName) {
    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML = '<p>Keine Services auf diesem Gerät gefunden.</p>';
        return;
    }

    gattDeviceName.textContent = `Verbunden mit: ${deviceName || 'Unbenannt'}`;
    gattTreeContainer.innerHTML = ''; // Baum leeren
    
    gattTree.forEach(service => {
        const serviceEl = document.createElement('div');
        serviceEl.className = 'gatt-service';
        
        serviceEl.innerHTML = `
            <div class="gatt-service-header">
                <strong>Service</strong>
                <div>UUID: ${service.uuid}</div>
            </div>
        `;
        
        const charListEl = document.createElement('div');
        charListEl.className = 'gatt-char-list';
        
        if (service.characteristics.length === 0) {
            charListEl.innerHTML = '<p>Keine Characteristics für diesen Service gefunden.</p>';
        } else {
            service.characteristics.forEach(char => {
                const charEl = document.createElement('div');
                charEl.className = 'gatt-char';
                
                // TODO: 'properties' parsen (read, write) und Buttons aktivieren
                
                charEl.innerHTML = `
                    <div>
                        <div class="gatt-char-name">Characteristic</div>
                        <div class="gatt-char-uuid">UUID: ${char.uuid}</div>
                    </div>
                    <div class="gatt-char-actions">
                        <button disabled>Lesen</button>
                        <button disabled>Schreiben</button>
                        <button disabled>Abonnieren</button>
                    </div>
                `;
                charListEl.appendChild(charEl);
            });
        }
        
        serviceEl.appendChild(charListEl);
        gattTreeContainer.appendChild(serviceEl);
    });
}

// === PUBLIC API: SETUP & UPDATE ===

/**
 * Bindet die Event-Listener an die UI-Elemente.
 * @param {object} callbacks - Ein Objekt mit Callback-Funktionen von app.js.
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks; // Callbacks für interne Nutzung speichern

    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onStopScan);
    gattDisconnectButton.addEventListener('click', callbacks.onGattDisconnect);
    
    viewToggle.addEventListener('click', () => {
        if (beaconView.style.display === 'none') {
            showView('beacon');
        } else {
            showView('gatt'); // (Wird meist leer sein, wenn nicht verbunden)
        }
    });
    
    // UI-interne Aktionen
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    diagLog('UI-Event-Listener erfolgreich gebunden.', 'info');
}

/**
 * Setzt den visuellen Status der Scan-Buttons.
 * @param {boolean} isScanning - True, wenn der Scan läuft.
 */
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

/**
 * Die Haupt-Rendering-Funktion. Erstellt oder aktualisiert eine Beacon-Karte.
 * @param {string} deviceId - Die eindeutige ID des Geräts.
 * @param {object} device - Das von utils.js geparste Geräte-Objekt.
 */
export function updateBeaconUI(deviceId, device) {
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        // WIE: Dependency Inversion. Wir rufen den Callback
        // 'onConnect' auf, den app.js uns gegeben hat.
        card.addEventListener('click', () => {
            if (appCallbacks.onConnect) {
                appCallbacks.onConnect(deviceId);
            }
        });
        
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

        // Sparkline initialisieren
        const canvas = card.querySelector('canvas');
        if (canvas) {
            chartMap.set(deviceId, createSparkline(canvas));
        }
    }

    // === Karte AKTUALISIEREN (immer) ===
    card.querySelector('.rssi-value').textContent = `${device.rssi} dBm`;
    // WICHTIG: Speichere RSSI im Dataset für schnelle Sortierung
    card.dataset.rssi = device.rssi;
    card.querySelector('.distance-value').textContent = calculateDistance(device.txPower, device.rssi);
    
    const telemetryEl = card.querySelector('.beacon-telemetry');
    if (telemetryEl) telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();

    const chart = chartMap.get(deviceId);
    if (chart) {
        updateSparkline(chart, device.rssi);
    }
    
    // Gerät ist aktiv, "stale"-Markierung entfernen
    card.classList.remove('stale');
}

/**
 * Markiert eine Beacon-Karte visuell als "stale" (veraltet).
 * @param {string} deviceId - Die ID der Karte.
 */
export function setCardStale(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) card.classList.add('stale');
}

/**
 * Bereinigt die UI (Beacon-Karten und Charts), wenn der Scan stoppt.
 */
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    beaconDisplay.innerHTML = '';
    
    // WICHTIG: Chart-Instanzen zerstören, um Memory-Leaks zu vermeiden
    chartMap.forEach(chart => chart.destroy());
    chartMap.clear();
}
 
