/**
 * js/ui.js (Version 11 - "Write Modal")
 * * ARCHITEKTUR-HINWEIS:
 * - V11: Integriert das Write-Modal (HTML/CSS).
 * - V11: 'renderGattTree' ruft 'showWriteModal' auf (statt 'onWrite').
 * - V11: 'setupUIListeners' bindet die Modal-Buttons an 'onModalWriteSubmit'.
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
// ... (alle alten Buttons bleiben gleich)
const gattSummaryBox = document.getElementById('gatt-summary');
const gattTreeContainer = document.getElementById('gatt-tree-container');

// V11: Neue Modal-Elemente
const writeModalOverlay = document.getElementById('write-modal-overlay');
const writeModalTitle = document.getElementById('write-modal-title');
const writeModalTypeSelect = document.getElementById('write-modal-type');
const writeModalInput = document.getElementById('write-modal-input');
const modalWriteCancelBtn = document.getElementById('modal-write-cancel-btn');
const modalWriteSendBtn = document.getElementById('modal-write-send-btn');

let isStaleModeActive = false;
const cardChartMap = new Map();
let appCallbacks = {};
let inspectorRssiChart = null;
let currentlyInspectedId = null;
let currentWriteCharUuid = null; // V11: Speichert, für welche Char wir das Modal geöffnet haben

// ... (INDUSTRIAL_COMPANIES, createSparkline, updateSparkline, renderTelemetry, renderBeaconData, sortBeaconCards, handleStaleToggle bleiben unverändert) ...

// === V11: NEUE MODAL-HELFER ===

/**
 * V11 NEU: Öffnet das "Schreiben"-Modal.
 * @param {string} charUuid - Die UUID, auf die geschrieben wird.
 * @param {string} charName - Der Name (zur Anzeige).
 */
function showWriteModal(charUuid, charName) {
    diagLog(`Öffne Write-Modal für ${charName} (${charUuid})`, 'ui');
    currentWriteCharUuid = charUuid; // Speichere die UUID
    writeModalTitle.textContent = `Schreibe auf: ${charName}`;
    writeModalInput.value = '';
    writeModalTypeSelect.value = 'hex';
    writeModalOverlay.style.display = 'flex';
    writeModalInput.focus();
}

/**
 * V11 NEU: Schließt das "Schreiben"-Modal.
 */
function hideWriteModal() {
    writeModalOverlay.style.display = 'none';
    currentWriteCharUuid = null;
}

// === PUBLIC API: VIEW-MANAGEMENT ===

export function showView(viewName) {
    // ... (unverändert)
}

export function setGattConnectingUI(isConnecting, error = null, isConnected = false) {
    // ... (unverändert)
}

export function showInspectorView(deviceLog) {
    // ... (unverändert, setzt 'isConnectable: true' korrekt)
    
    // ... (Code zum Setzen von Titel, Chart, Ad-Liste bleibt gleich) ...
    
    // V9.13 Fix: 'isConnectable' ist jetzt immer true
    gattConnectButton.disabled = !deviceLog.isConnectable;
    gattConnectButton.textContent = 'Verbinden';
    gattDisconnectButton.disabled = true;

    // ... (Rest der Funktion unverändert)
}


/**
 * V11 PATCH: 'Schreiben'-Button ruft 'showWriteModal' auf.
 */
export function renderGattTree(gattTree, deviceName, summary) {
    gattTreeContainer.innerHTML = ''; 
    gattConnectButton.disabled = true;
    gattConnectButton.textContent = 'Verbunden';
    gattDisconnectButton.disabled = false;
    
    // === 1. ZUSAMMENFASSUNG FÜLLEN ===
    // ... (unverändert)
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
    gattTreeContainer.innerHTML = '<h3>GATT-Service-Baum</h3>'; 
    if (gattTree.length === 0) {
        gattTreeContainer.innerHTML += '<p>Keine Services auf diesem Gerät gefunden.</p>';
        return;
    }
    
    gattTree.forEach(service => {
        // ... (Service-Erstellung unverändert)
        const serviceEl = document.createElement('div');
        serviceEl.className = 'gatt-service';
        serviceEl.innerHTML = `...`; // (Dein Code)
        
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
                
                // V11 PATCH: Ruft das Modal auf statt 'onWrite'
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
 * V11 PATCH: Bindet die neuen Modal-Button-Listener.
 */
export function setupUIListeners(callbacks) {
    appCallbacks = callbacks;
    
    // ... (Alte Listener: scanButton, disconnectButton, etc. bleiben unverändert)
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

    // V11 NEU: Listener für das "Write Modal"
    modalWriteCancelBtn.addEventListener('click', hideWriteModal);
    
    modalWriteSendBtn.addEventListener('click', () => {
        const value = writeModalInput.value;
        const type = writeModalTypeSelect.value;
        
        if (currentWriteCharUuid && appCallbacks.onModalWriteSubmit) {
            appCallbacks.onModalWriteSubmit(currentWriteCharUuid, value, type);
        }
        hideWriteModal();
    });
    
    diagLog('UI-Event-Listener (V11) erfolgreich gebunden.', 'info');
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
 
