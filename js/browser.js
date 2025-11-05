/**
 * js/browser.js
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 1.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Kapselt die "Keep-Alive"-Logik.
 * 2. Verwendet die Screen Wake Lock API (primär).
 * 3. Implementiert einen "unhörbaren Audio"-Fallback (sekundär).
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
 * Startet den "Keep-Alive-Audio"-Stream (Fallback).
 * WARUM: Verhindert, dass das OS (bes. mobil) die App
 * in den Tiefschlaf versetzt, wenn der WakeLock nicht funktioniert.
 * @returns {boolean} - True bei Erfolg.
 */
function startAudioFallback() {
    if (audioContext) return true; 

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            diagLog("Audio-Fallback nicht unterstützt (kein AudioContext).", 'warn');
            return false;
        }

        audioContext = new AudioContextClass();
        audioSource = audioContext.createOscillator();
        audioSource.type = 'sine';
        audioSource.frequency.setValueAtTime(20, audioContext.currentTime); // 20 Hz
        audioSource.connect(audioContext.destination);
        audioSource.start();
        
        diagLog("Audio-Fallback (20Hz Sinuston) gestartet.", 'info');
        return true;

    } catch (err) {
        diagLog(`Fehler beim Starten des Audio-Fallbacks: ${err.message}`, 'error');
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
        diagLog("Audio-Fallback gestoppt.", 'info');
    } catch (err) {
        diagLog(`Fehler beim Stoppen des Audio-Fallbacks: ${err.message}`, 'warn');
    }
}

// === PUBLIC API ===

/**
 * Versucht, den Bildschirm-WakeLock zu aktivieren.
 * Wenn dies fehlschlägt, wird der Audio-Fallback gestartet.
 */
export async function startKeepAlive() {
    // 1. Primärer Versuch: Screen Wake Lock API
    if ('wakeLock' in navigator) {
        try {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
                diagLog('Screen WakeLock wurde vom System freigegeben.', 'warn');
                wakeLockSentinel = null;
            });
            diagLog('Screen WakeLock erfolgreich aktiviert.', 'info');
            return; // Erfolg!

        } catch (err) {
            diagLog(`Screen WakeLock fehlgeschlagen (${err.name}). Starte Audio-Fallback.`, 'warn');
        }
    } else {
        diagLog('Screen WakeLock API nicht unterstützt. Starte Audio-Fallback.', 'info');
    }

    // 2. Sekundärer Versuch: Audio-Fallback
    startAudioFallback();
}

/**
 * Stoppt alle "Keep-Alive"-Mechanismen.
 */
export function stopKeepAlive() {
    // Stoppe WakeLock (falls aktiv)
    if (wakeLockSentinel) {
        try {
            wakeLockSentinel.release();
            wakeLockSentinel = null;
            diagLog('Screen WakeLock freigegeben.', 'info');
        } catch (err) {
            diagLog(`Fehler beim Freigeben des WakeLock: ${err.message}`, 'error');
        }
    }

    // Stoppe Audio (falls aktiv)
    if (audioContext) {
        stopAudioFallback();
    }
}
 
