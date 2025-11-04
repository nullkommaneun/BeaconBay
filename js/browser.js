/**
 * js/browser.js
 * * ARCHITEKTUR-HINWEIS: Dies ist ein Modul auf Layer 1.
 * * ABHÄNGIGKEITEN: errorManager.js
 * * ZWECK:
 * 1. Kapselt Browser-spezifische APIs (außer DOM-Manipulation, das ist ui.js).
 * 2. Implementiert die "Keep-Alive"-Logik, um zu verhindern, dass das Gerät
 * während eines Scans in den Standby-Modus wechselt.
 * 3. Verwendet die Screen Wake Lock API als primäre Methode.
 * 4. Implementiert einen "unhörbaren Audio"-Fallback für Browser (z.B. Firefox),
 * die die Wake Lock API nicht unterstützen.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===

/**
 * Hält die Referenz auf das WakeLock-Objekt, damit wir es später
 * freigeben können.
 * @type {WakeLockSentinel | null}
 */
let wakeLockSentinel = null;

/**
 * Hält die Referenz auf den AudioContext für den Fallback-Mechanismus.
 * @type {AudioContext | null}
 */
let audioContext = null;

/**
 * Hält die Referenz auf die Audio-Quelle (Oszillator), damit wir sie
 * stoppen können.
 * @type {OscillatorNode | null}
 */
let audioSource = null;

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Startet den "Keep-Alive-Audio"-Stream.
 * * WARUM: Viele mobile Betriebssysteme (insbesondere iOS) erlauben
 * Apps im Hintergrund (oder bei gesperrtem Bildschirm) nicht, JavaScript
 * auszuführen. Web Bluetooth-Scans laufen jedoch oft weiter.
 * Das Abspielen von "stillem" Audio signalisiert dem OS, dass die App
 * "aktiv" ist, und verhindert, dass die App/CPU in den Tiefschlaf geht.
 * Dies ist ein gängiger Workaround.
 * * * WIE: Wir erstellen einen 20Hz-Sinuston. 20Hz ist für Menschen
 * typischerweise unhörbar (oder extrem leise) und verbraucht minimal
 * CPU/Akku.
 * @returns {boolean} - True bei Erfolg, False bei Fehler.
 */
function startAudioFallback() {
    // Prüfen, ob der AudioContext bereits läuft
    if (audioContext) {
        return true; 
    }

    try {
        // 'window.AudioContext' oder 'window.webkitAudioContext' für Safari
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        
        if (!AudioContextClass) {
            diagLog("Audio-Fallback nicht unterstützt (kein AudioContext).", 'warn');
            return false;
        }

        audioContext = new AudioContextClass();
        
        // Erstelle einen Oszillator (Tonerzeuger)
        audioSource = audioContext.createOscillator();
        audioSource.type = 'sine'; // Sinuswelle
        audioSource.frequency.setValueAtTime(20, audioContext.currentTime); // 20 Hz
        
        // Verbinde den Oszillator mit dem "Lautsprecher" (destination)
        audioSource.connect(audioContext.destination);
        
        // Starte den Ton
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
            // Wichtig: Den AudioContext schließen, um Ressourcen freizugeben.
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
 * Diese Funktion wird von app.js aufgerufen, wenn der Scan beginnt.
 */
export async function startKeepAlive() {
    // Zuerst versuchen, die moderne Screen Wake Lock API zu verwenden.
    if ('wakeLock' in navigator) {
        try {
            // 'screen' ist der Typ. 'request' gibt ein Promise zurück.
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            
            // Listener hinzufügen, falls der Lock "verloren" geht (z.B. Tab minimiert)
            wakeLockSentinel.addEventListener('release', () => {
                diagLog('Screen WakeLock wurde vom System freigegeben.', 'warn');
                wakeLockSentinel = null;
            });
            
            diagLog('Screen WakeLock erfolgreich aktiviert.', 'info');
            return; // Erfolg, wir brauchen keinen Fallback.

        } catch (err) {
            // Fehler bei der Anforderung (z.B. vom Benutzer abgelehnt, nicht unterstützt)
            diagLog(`Screen WakeLock fehlgeschlagen (${err.name}: ${err.message}). Starte Audio-Fallback.`, 'warn');
            // Fahre mit dem Audio-Fallback fort
        }
    } else {
        diagLog('Screen WakeLock API nicht unterstützt. Starte Audio-Fallback.', 'info');
    }

    // --- Fallback-Zone ---
    // Wenn wir hier ankommen, hat der WakeLock nicht funktioniert.
    startAudioFallback();
}

/**
 * Stoppt alle "Keep-Alive"-Mechanismen.
 * Wird von app.js aufgerufen, wenn der Scan stoppt.
 */
export function stopKeepAlive() {
    // Wenn wir einen aktiven WakeLock haben, geben wir ihn frei.
    if (wakeLockSentinel) {
        try {
            wakeLockSentinel.release();
            wakeLockSentinel = null;
            diagLog('Screen WakeLock freigegeben.', 'info');
        } catch (err) {
            diagLog(`Fehler beim Freigeben des WakeLock: ${err.message}`, 'error');
        }
    }

    // Unabhängig davon stoppen wir den Audio-Fallback (falls er lief).
    if (audioContext) {
        stopAudioFallback();
    }
}
