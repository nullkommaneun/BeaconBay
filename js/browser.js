/**
 * js/browser.js (Version 2 - Mit Audio-Keep-Alive)
 * * ARCHITEKTUR-HINWEIS: Layer 1 Modul.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Kapselt die "Keep-Alive"-Logik.
 * * KORREKTUR:
 * - Startet jetzt *immer* den Audio-Fallback (für den BT-Chip)
 * - *UND* versucht, den Screen Wake Lock zu bekommen (für den Bildschirm).
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===

/**
 * Hält die Referenz auf das WakeLock-Objekt.
 * @type {WakeLockSentinel | null}
 */
let wakeLockSentinel = null;

/**
 * Hält die Referenz auf den AudioContext für den Fallback.
 * @type {AudioContext | null}
 */
let audioContext = null;

/**
 * Hält die Referenz auf die Audio-Quelle (Oszillator).
 * @type {OscillatorNode | null}
 */
let audioSource = null;

/**
 * Startet den "Keep-Alive-Audio"-Stream (unhörbarer 20Hz-Ton).
 * * WARUM: Verhindert, dass das OS (bes. mobil) die App-Prozesse
 * oder den Bluetooth-Chip in den Tiefschlaf versetzt,
 * selbst wenn der Bildschirm an ist.
 * @returns {boolean} - True bei Erfolg.
 */
function startAudioFallback() {
    if (audioContext) {
        diagLog("Audio-Keep-Alive läuft bereits.", 'utils');
        return true; 
    }

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            diagLog("Audio-Keep-Alive nicht unterstützt (kein AudioContext).", 'warn');
            return false;
        }

        audioContext = new AudioContextClass();
        
        // WICHTIG: Prüfen, ob der AudioContext "hängt" (passiert auf manchen Browsern)
        // Wir müssen ihn durch eine Nutzergeste (den Klick) "aufwecken".
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        audioSource = audioContext.createOscillator();
        audioSource.type = 'sine';
        audioSource.frequency.setValueAtTime(20, audioContext.currentTime); // 20 Hz
        audioSource.connect(audioContext.destination);
        audioSource.start();
        
        diagLog("Audio-Keep-Alive (20Hz) gestartet, um Scan aktiv zu halten.", 'info');
        return true;

    } catch (err) {
        diagLog(`Fehler beim Starten des Audio-Keep-Alive: ${err.message}`, 'error');
        audioContext = null;
        audioSource = null;
        return false;
    }
}

/**
 * Stoppt den "Keep-Alive-Audio"-Stream.
 */
function stopAudioFallback() {
    try {
        if (audioSource) {
            audioSource.stop();
            audioSource.disconnect();
            audioSource = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        diagLog("Audio-Keep-Alive gestoppt.", 'info');
    } catch (err) {
        diagLog(`Fehler beim Stoppen des Audio-Keep-Alive: ${err.message}`, 'warn');
    }
}

// === PUBLIC API ===

/**
 * Startet alle "Keep-Alive"-Mechanismen.
 * 1. Screen Wake Lock (damit der Bildschirm an bleibt).
 * 2. Audio Fallback (damit der Scan nicht einschläft).
 */
export async function startKeepAlive() {
    // 1. Starte IMMER den Audio-Stream, um den Scan am Leben zu erhalten
    startAudioFallback();

    // 2. Versuche ZUSÄTZLICH, den Bildschirm wach zu halten
    if ('wakeLock' in navigator) {
        try {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
                diagLog('Screen WakeLock wurde vom System freigegeben.', 'warn');
                wakeLockSentinel = null;
            });
            diagLog('Screen WakeLock erfolgreich aktiviert.', 'info');

        } catch (err) {
            // Das ist nicht fatal, der Audio-Stream läuft ja trotzdem
            diagLog(`Screen WakeLock fehlgeschlagen (${err.name}). App bleibt dank Audio wach.`, 'warn');
        }
    } else {
        diagLog('Screen WakeLock API nicht unterstützt. App bleibt dank Audio wach.', 'info');
    }
}

/**
 * Stoppt alle "Keep-Alive"-Mechanismen.
 */
export function stopKeepAlive() {
    // 1. Stoppe WakeLock (falls aktiv)
    if (wakeLockSentinel) {
        try {
            wakeLockSentinel.release();
            wakeLockSentinel = null;
            diagLog('Screen WakeLock freigegeben.', 'info');
        } catch (err) {
            diagLog(`Fehler beim Freigeben des WakeLock: ${err.message}`, 'error');
        }
    }

    // 2. Stoppe Audio (falls aktiv)
    if (audioContext) {
        stopAudioFallback();
    }
}
 
