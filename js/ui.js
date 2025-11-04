/**
 * js/ui.js
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 2.
 * * ABHÄNGIGKEITEN: errorManager.js, utils.js
 * * ZWECK:
 * 1. Kapselt *alle* DOM-Manipulationen und Event-Listener (außer Log-Panel).
 * 2. Rendert die Beacon-Karten, inkl. der Chart.js-Sparklines.
 * 3. Nimmt Callbacks von app.js entgegen (Dependency Inversion), um
 * die UI-Logik von der Business-Logik (z.B. Scan starten) zu entkoppeln.
 * 4. Verwaltet den internen UI-Zustand (z.B. "Stale-Modus").
 */

// Importiere Abhängigkeiten
import { diagLog } from './errorManager.js';
import { calculateDistance } from './utils.js'; // Wird für die Distanzanzeige benötigt

// === MODULE STATE ===

// DOM-Elemente zwischenspeichern für Performance
// WARUM: document.getElementById ist extrem schnell. Wir rufen dies
// nur einmal beim Laden des Moduls auf, anstatt bei jeder
// UI-Aktualisierung erneut im DOM zu suchen.
const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const viewToggle = document.getElementById('viewToggle'); // (Für später)
const sortButton = document.getElementById('sortButton');
const staleToggle = document.getElementById('staleToggle');
const beaconDisplay = document.getElementById('beaconDisplay');

/**
 * Speichert den Status, ob der Stale-Modus (Ausblenden) aktiv ist.
 * @type {boolean}
 */
let isStaleModeActive = false;

/**
 * Speichert die Chart.js-Instanzen pro Geräte-ID.
 * WIE: { 'deviceId-123': chartInstance, ... }
 * @type {Map<string, Chart>}
 */
const chartMap = new Map();

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Erstellt eine neue Chart.js-Sparkline-Instanz für eine Beacon-Karte.
 * @param {HTMLCanvasElement} canvas - Das Canvas-Element in der Karte.
 * @returns {Chart} Die neue Chart.js-Instanz.
 */
function createSparkline(canvas) {
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Zeit-Achse (ausgeblendet)
            datasets: [{
                label: 'RSSI',
                data: [], // Die RSSI-Werte
                borderColor: '#00faff', // Neon-Cyan
                borderWidth: 2,
                pointRadius: 0, // Keine Punkte
                tension: 0.3 // Leicht geglättet
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Keine Legende
                tooltip: { enabled: false } // Keine Tooltips
            },
            scales: {
                x: { display: false }, // X-Achse ausblenden
                y: {
                    display: false, // Y-Achse ausblenden
                    suggestedMin: -100, // RSSI-Bereich (schwach)
                    suggestedMax: -30   // RSSI-Bereich (stark)
                }
            }
        }
    });
}

/**
 * Aktualisiert eine bestehende Sparkline mit einem neuen RSSI-Wert.
 * @param {Chart} chart - Die Chart.js-Instanz.
 * @param {number} rssi - Der neue RSSI-Wert.
 */
function updateSparkline(chart, rssi) {
    const data = chart.data.datasets[0].data;
    const labels = chart.data.labels;

    // Neuen Wert hinzufügen
    data.push(rssi);
    labels.push(''); // Leeres Label hinzufügen

    // WIE: Performance-Optimierung
    // Wir begrenzen den Graphen auf 20 Datenpunkte (ca. 20 Sekunden bei 1s Intervall).
    // 'shift()' entfernt das älteste Element und ist performant für Arrays.
    if (data.length > 20) {
        data.shift();
        labels.shift();
    }

    // Chart aktualisieren, ohne Animation (für Echtzeit-Gefühl)
    chart.update('none');
}

/**
 * Erstellt das HTML-Markup für eine Telemetrie-Zeile (RuuviTag).
 * @param {object} telemetry - Das Telemetrie-Objekt aus utils.js.
 * @returns {string} - HTML-String.
 */
function renderTelemetry(telemetry) {
    // Falls keine Daten vorhanden sind, leeren String zurückgeben.
    if (Object.keys(telemetry).length === 0) {
        return '';
    }
    
    // WIE: Emojis zur schnellen visuellen Erfassung.
    return `
        <div class="beacon-telemetry">
            <span>🌡️ ${telemetry.temperature} °C</span>
            <span>💧 ${telemetry.humidity} %</span>
            <span>🌬️ ${telemetry.pressure} hPa</span>
            <span>🔋 ${telemetry.voltage} V</span>
        </div>
    `;
}

/**
 * Erstellt das HTML-Markup für eine iBeacon-Zeile.
 * @param {object} beaconData - Das iBeacon-Objekt aus utils.js.
 * @returns {string} - HTML-String.
 */
function renderBeaconData(beaconData) {
    if (Object.keys(beaconData).length === 0) {
        return '';
    }
    
    return `
        <div class="beacon-data">
            <div><strong>UUID:</strong> ${beaconData.uuid}</div>
            <div>
                <strong>Major:</strong> ${beaconData.major} | 
                <strong>Minor:</strong> ${beaconData.minor}
            </div>
        </div>
    `;
}

/**
 * Sortiert die Beacon-Karten im DOM basierend auf dem 'data-rssi'-Attribut.
 * * WIE: Dies ist eine direkte DOM-Operation. Sie liest das Attribut,
 * sortiert die Elemente (im Speicher) und fügt sie dann
 * in der neuen Reihenfolge wieder in das 'beaconDisplay'-Panel ein.
 */
function sortBeaconCards() {
    diagLog('Sortiere Karten nach RSSI...', 'utils');
    
    // 1. Hole alle Karten als Array
    const cards = Array.from(beaconDisplay.children);

    // 2. Sortiere das Array
    cards.sort((a, b) => {
        // Lese den RSSI-Wert aus dem Dataset
        // WARUM: + (Plus-Operator) konvertiert den String zu einer Zahl.
        const rssiA = +a.dataset.rssi || -1000; // Fallback auf sehr kleinen Wert
        const rssiB = +b.dataset.rssi || -1000;
        
        // Absteigend sortieren (stärkstes Signal zuerst)
        return rssiB - rssiA;
    });

    // 3. Füge die sortierten Karten wieder ins DOM ein
    // WIE: 'append' kann mehrere Elemente auf einmal annehmen.
    // Da die Elemente bereits im DOM sind, werden sie *verschoben*,
    // nicht dupliziert. Dies ist die effizienteste Methode.
    beaconDisplay.append(...cards);
}

/**
 * (Interne Funktion) Verarbeitet den Klick auf den Stale-Toggle.
 */
function handleStaleToggle() {
    isStaleModeActive = staleToggle.checked;
    
    // WIE: Wir setzen eine Klasse auf den *Container*.
    // Das CSS (style.css) kümmert sich um das eigentliche Ausblenden
    // mittels: .stale-mode .stale { display: none; }
    // Dies ist performanter, als hunderte Karten einzeln
    // per JavaScript ein- und auszublenden.
    if (isStaleModeActive) {
        beaconDisplay.classList.add('stale-mode');
        diagLog('Stale-Modus aktiviert (verstecke inaktive).', 'utils');
    } else {
        beaconDisplay.classList.remove('stale-mode');
        diagLog('Stale-Modus deaktiviert (zeige alle).', 'utils');
    }
}

// === PUBLIC API ===

/**
 * Bindet die Event-Listener an die UI-Elemente.
 * * WARUM: Dependency Inversion. Dieses Modul weiß nicht, *was*
 * 'onScan' tut. Es ruft nur den Callback auf, den es
 * von app.js (dem Orchestrator) erhalten hat.
 *
 * @param {object} callbacks - Ein Objekt mit Callback-Funktionen.
 * @param {function} callbacks.onScan - Wird bei Klick auf #scanButton aufgerufen.
 * @param {function} callbacks.onDisconnect - Wird bei Klick auf #disconnectButton aufgerufen.
 * @param {function} callbacks.onSort - (Wird intern gehandhabt, könnte aber extern sein)
 * @param {function} callbacks.onStaleToggle - (Wird intern gehandhabt)
 */
export function setupUIListeners(callbacks) {
    if (!scanButton || !disconnectButton || !sortButton || !staleToggle) {
        diagLog('UI-Listener konnten nicht gebunden werden: DOM-Elemente fehlen.', 'error');
        return;
    }

    scanButton.addEventListener('click', callbacks.onScan);
    disconnectButton.addEventListener('click', callbacks.onDisconnect);
    
    // UI-interne Aktionen können direkt hier gebunden werden.
    sortButton.addEventListener('click', sortBeaconCards);
    staleToggle.addEventListener('change', handleStaleToggle);
    
    diagLog('UI-Event-Listener erfolgreich gebunden.', 'info');
}

/**
 * Setzt den visuellen Status der Scan-Buttons (aktiv/inaktiv).
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
    // 1. Prüfen, ob die Karte bereits existiert
    let card = document.getElementById(deviceId);
    
    if (!card) {
        // === Karte ERSTELLEN ===
        card = document.createElement('div');
        card.id = deviceId;
        card.className = 'beacon-card';
        
        // WIE: Wir erstellen das gesamte interne DOM der Karte
        // und fügen es am Ende *einmal* hinzu (besser für Performance).
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

            <div class="sparkline-container">
                <canvas></canvas>
            </div>
        `;
        
        // Karte dem DOM hinzufügen
        beaconDisplay.prepend(card); // Neue Geräte oben anzeigen

        // Sparkline initialisieren
        const canvas = card.querySelector('canvas');
        if (canvas) {
            const chart = createSparkline(canvas);
            chartMap.set(deviceId, chart); // Chart-Instanz speichern
        }

    } else {
        // === Karte AKTUALISIEREN ===
        
        // Aktualisiere nur die Teile, die sich ändern
        // (Vermeidet 'innerHTML' bei Updates, was performanter ist)
        
        const rssiEl = card.querySelector('.rssi-value');
        if (rssiEl) rssiEl.textContent = `${device.rssi} dBm`;
        
        // WARUM: Wir speichern den RSSI im Dataset, damit die
        // Sortierfunktion (sortBeaconCards) schnell darauf zugreifen kann,
        // ohne den Text-Inhalt parsen zu müssen.
        card.dataset.rssi = device.rssi;

        // Aktualisiere Distanz
        const distanceEl = card.querySelector('.distance-value');
        if (distanceEl) {
            // Rufe die Hilfsfunktion aus utils.js auf
            distanceEl.textContent = calculateDistance(device.txPower, device.rssi);
        }

        // Aktualisiere Telemetrie (falls sie sich ändern kann)
        // (Für diese App überschreiben wir es einfach, da Ruuvi-Updates selten sind)
        const telemetryEl = card.querySelector('.beacon-telemetry');
        if (telemetryEl) {
            telemetryEl.innerHTML = renderTelemetry(device.telemetry).trim();
        }
    }

    // 2. Sparkline (immer) aktualisieren
    const chart = chartMap.get(deviceId);
    if (chart) {
        updateSparkline(chart, device.rssi);
    }
    
    // 3. Stale-Status zurücksetzen (wird von bluetooth.js gehandhabt)
    // Wenn wir ein Update erhalten, ist das Gerät offensichtlich nicht "stale".
    card.classList.remove('stale');
}

/**
 * Markiert eine Beacon-Karte visuell als "stale" (veraltet).
 * Wird von bluetooth.js aufgerufen.
 * @param {string} deviceId - Die ID der Karte, die markiert werden soll.
 */
export function setCardStale(deviceId) {
    const card = document.getElementById(deviceId);
    if (card) {
        card.classList.add('stale');
    }
}

/**
 * (Wird von bluetooth.js aufgerufen) Bereinigt die UI, wenn der Scan stoppt.
 */
export function clearUI() {
    diagLog('Bereinige UI und lösche Beacon-Karten...', 'ui');
    beaconDisplay.innerHTML = '';
    
    // Lösche alle gespeicherten Chart-Instanzen
    // WICHTIG: Chart.js-Instanzen müssen 'destroyed' werden,
    // um Memory-Leaks durch hängende Canvas-Referenzen zu vermeiden.
    chartMap.forEach(chart => {
        chart.destroy();
    });
    chartMap.clear();
}
