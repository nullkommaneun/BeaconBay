/**
 * js/browser.js (Version 13.3h - "Config Refactor")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3h: Lagert "Magic Numbers" (V12.2-Logik) in config.js aus.
 * - V12.2: (Logik unverändert) Verwendet aggressive Geo-Settings
 * (HighAccuracy: true, MaxAge: 0), um den Scan am Leben zu erhalten.
 */

// V13.3h-IMPORT: Lade die zentrale App-Konfiguration
import { AppConfig } from './config.js';

// V12.2-IMPORT: (Unverändert)
import { diagLog } from './errorManager.js';

// === MODULE STATE ===
let geoWatchId = null;

// === PRIVATE HELPER ===

/**
 * V12: Erfolgs-Callback (Unverändert)
 */
function geoSuccess(position) {
    // V13.3h: Leicht verbesserte Log-Nachricht für Klarheit
    diagLog(`Geolocation Keep-Alive Tick (V13.3h).`, 'utils');
}

/**
 * V12: Fehler-Callback (Unverändert)
 */
function geoError(err) {
    // V13.3h-FIX: Verwende die standardisierte Meldung aus AppConfig
    if (err.code === 1) { // 1 = PERMISSION_DENIED
        diagLog(AppConfig.ErrorManager.MSG_LOCATION_SERVICE_FAIL + ` (Keine Berechtigung)`, 'error');
        stopKeepAlive(); // Nicht erneut versuchen
    } else {
        diagLog(AppConfig.ErrorManager.MSG_LOCATION_SERVICE_FAIL + ` (${err.message})`, 'error');
    }
}

/**
 * V12: Startet den Geolocation-Watchdog.
 * V13.3h: Verwendet Config-Werte.
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

    diagLog("Starte Geolocation Keep-Alive (V13.3h)...", 'info');
    try {
        geoWatchId = navigator.geolocation.watchPosition(
            geoSuccess, 
            geoError, 
            {
                // V13.3h-REFAKTOR: Hole V12.2-Werte aus der AppConfig
                enableHighAccuracy: AppConfig.Browser.GEO_WATCH_HIGH_ACCURACY,
                maximumAge: AppConfig.Browser.GEO_WATCH_MAXIMUM_AGE
                // V12.2-FIX: 'timeout' bleibt (absichtlich) undefiniert.
            }
        );
    } catch (err) {
        diagLog(`Fehler beim Starten von Geolocation: ${err.message}`, 'error');
    }
}

/**
 * V12: Stoppt den Geolocation-Watchdog. (Unverändert)
 */
function stopGeolocationFallback() {
    if (geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
        diagLog("Geolocation Keep-Alive gestoppt.", 'info');
    }
}


// === PUBLIC API === (Unverändert)

export function startKeepAlive() {
    startGeolocationFallback();
}

export function stopKeepAlive() {
    stopGeolocationFallback();
}
