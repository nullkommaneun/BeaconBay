/**
 * js/browser.js (Version 12 - Geolocation-Hack)
 * * ARCHITEKTUR-HINWEIS:
 * - V12: Entfernt alle unzuverlässigen Audio- und WakeLock-Hacks.
 * - V12: Implementiert navigator.geolocation.watchPosition().
 * - Dies ist der stärkste Keep-Alive, den eine Web-App hat.
 * Er signalisiert dem OS eine "Navigations-Aufgabe".
 * - ERFORDERT: "Standort"-Berechtigung durch den Benutzer.
 */

import { diagLog } from './errorManager.js';

// === MODULE STATE ===
let geoWatchId = null;

// === PRIVATE HELPER ===

/**
 * V12: Erfolgs-Callback für watchPosition.
 * Wir protokollieren es nur, wir speichern den Standort NICHT.
 */
function geoSuccess(position) {
    diagLog(`Geolocation Keep-Alive aktiv. (Position wird *nicht* gespeichert/verwendet)`, 'utils');
}

/**
 * V12: Fehler-Callback für watchPosition.
 * (z.B. wenn der Benutzer die Berechtigung verweigert)
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

    diagLog("Starte Geolocation Keep-Alive (V12)...", 'info');
    try {
        geoWatchId = navigator.geolocation.watchPosition(
            geoSuccess, 
            geoError, 
            {
                enableHighAccuracy: true, // Zwingt die GPS-Nutzung
                timeout: 5000,
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
 * (Ruft jetzt den V12-Geolocation-Hack auf)
 */
export function startKeepAlive() {
    // Alte V2/V3 Hacks (Audio, WakeLock) sind entfernt.
    startGeolocationFallback();
}

/**
 * Wird von app.js aufgerufen, um die Keep-Alive-Hacks zu beenden.
 */
export function stopKeepAlive() {
    // Alte V2/V3 Hacks (Audio, WakeLock) sind entfernt.
    stopGeolocationFallback();
}
 
