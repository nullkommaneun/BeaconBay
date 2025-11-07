/**
 * js/browser.js (Version 12.2 - "Timeout expired" Fix)
 * * ARCHITEKTUR-HINWEIS:
 * - V12.2 FIX: Entfernt die 'timeout: 5000'-Option aus 'watchPosition'.
 * - Der vorherige Timeout (5 Sek.) war kürzer als die Zeit,
 * die der Benutzer benötigte, um BEIDE Berechtigungen (BLE + Standort)
 * beim ersten Start zu erteilen.
 * - Ohne Timeout wartet der Geolocation-Hack jetzt unbegrenzt
 * auf die Erlaubnis, was den "Race Condition" behebt.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===
let geoWatchId = null;

// === PRIVATE HELPER ===

/**
 * V12: Erfolgs-Callback für watchPosition.
 */
function geoSuccess(position) {
    diagLog(`Geolocation Keep-Alive aktiv. (Position wird *nicht* gespeichert/verwendet)`, 'utils');
}

/**
 * V12: Fehler-Callback für watchPosition.
 */
function geoError(err) {
    diagLog(`Geolocation Keep-Alive FEHLER: ${err.message}`, 'error');
    
    // Wenn die Berechtigung verweigert wurde, versuchen wir es nicht erneut.
    if (err.code === 1) { // 1 = PERMISSION_DENIED
        stopKeepAlive();
    }
}

/**
 * V12: Startet den Geolocation-Watchdog.
 */
function startGeolocationFallback() {
    if (!navigator.geolocation) {
        diagLog("Geolocation-Hack nicht unterstützt.", 'error');
        return;
    }

    if (geoWatchId) {
        diagLog("Geolocation Keep-Alive läuft bereits.", 'warn');
        return;
    }

    diagLog("Starte Geolocation Keep-Alive (V12.2)...", 'info');
    try {
        geoWatchId = navigator.geolocation.watchPosition(
            geoSuccess, 
            geoError, 
            {
                enableHighAccuracy: true, // Zwingt die GPS-Nutzung
                // V12.2 FIX: 'timeout: 5000,' entfernt.
                maximumAge: 0 
            }
        );
    } catch (err) {
        diagLog(`Fehler beim Starten von Geolocation: ${err.message}`, 'error');
    }
}

/**
 * V12: Stoppt den Geolocation-Watchdog.
 */
function stopGeolocationFallback() {
    if (geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
        diagLog("Geolocation Keep-Alive gestoppt.", 'info');
    }
}


// === PUBLIC API ===

/**
 * Wird von app.js aufgerufen, um den Scan am Leben zu erhalten.
 */
export function startKeepAlive() {
    startGeolocationFallback();
}

/**
 * Wird von app.js aufgerufen, um die Keep-Alive-Hacks zu beenden.
 */
export function stopKeepAlive() {
    stopGeolocationFallback();
}
 
