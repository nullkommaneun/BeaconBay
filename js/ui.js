/**
 * js/ui.js (Version 11.1 - "DOM-Ready" Fix)
 * * ARCHITEKTUR-HINWEIS:
 * - V11.1: Behebt den "Cannot read properties of null (reading 'addEventListener')" Crash.
 * - Alle 'getElementById' werden von der globalen Ebene
 * in 'setupUIListeners' verschoben.
 * - Dies stellt sicher, dass der Code erst ausgeführt wird,
 * NACHDEM 'DOMContentLoaded' in app.js ausgelöst wurde.
 */

import { diagLog } from './errorManager.js';
import { 
    calculateDistance, 
    dataViewToHex, 
    dataViewToText, 
    KNOWN_SERVICES,
    KNOWN_CHARACTERISTICS
} from './utils.js';

// === MODULE STATE (V11.1) ===
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
    // ... (Liste unverändert)
];


// === PRIVATE HELPER: CHARTING ===
// ... (createSparkline, updateSparkline bleiben unverändert) ...
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, { /* ... */ });
}
function updateSparkline(chart, rssi) { /* ... */ }


// === PRIVATE HELPER: RENDERING ===
// ... (renderTelemetry, renderBeaconData bleiben unverändert) ...
function renderTelemetry(telemetry) { /* ... */ }
function renderBeaconData(beaconData) { /* ... */ }

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

export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    // ... (unverändert)
}

export function showInspectorView(deviceLog) {
    // ... (unverändert)
}

/**
 * V11.1 PATCH: Aktiviert den "Schreiben"-Button
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattTreeContainer.innerHTML = ''; 
    gattConnectButton.disabled = true;
    gattConnectButton.textContent = 'Verbunden';
    gattDisconnectButton.disabled = false;
    
    // ... (Summary-Box-Code unverändert) ...

    // === 2. ROH-BAUM FÜLLEN ===
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
                
                // Event-Listener binden
                if (canRead === '') {
                    charEl.querySelector('.gatt-read-btn').addEventListener('click', () => appCallbacks.onRead(char.uuid));
                }
                
                // V11 PATCH: Ruft das Modal auf
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
    // ... (unverändert)
}

// === PUBLIC API: SETUP & BEACON UPDATE ===

/**
 * V11.1 PATCH: Alle getElementById-Aufrufe sind HIERHER verschoben.
 * Diese Funktion wird von app.js NACH DOMContentLoaded aufgerufen.
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // === V11.1 DOM-Zuweisung ===
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
    
    diagLog('UI-Event-Listener (V11.1) erfolgreich gebunden.', 'info');
}

export function setScanStatus(isScanning) {
    // ... (unverändert)
}

export function updateBeaconUI(deviceId, device) {
    // ... (unverändert)
}

export function setCardStale(deviceId) {
    // ... (unverändert)
}

export function clearUI() {
    // ... (unverändert)
}
 
