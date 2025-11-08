/**
 * js/errorManager.js (Version 13.3e "Config Refactor")
 * * ARCHITEKTUR-HINWEIS:
 * - V11.5: Exportiert 'earlyDiagLog' für robusten Start.
 * - V13.3e: Entfernt "Magic Number" (MAX_LOG_ENTRIES) und
 * lagert sie in config.js aus.
 * - V13.3e: Führt initErrorManager() ein (V11.11 DOM-Ready-Logik),
 * um das Panel einmalig zu initialisieren.
 */

// V13.3e-IMPORT: Lade die zentrale App-Konfiguration
import { AppConfig } from './config.js';

// === MODULE STATE ===
let logPanel = null;

// V13.3e-REFAKTOR: "Magic Number" wurde entfernt und
// wird jetzt aus AppConfig.ErrorManager.MAX_LOG_ENTRIES bezogen.
// const MAX_LOG_ENTRIES = 100; // VERALTET

/**
 * V13.3e-NEU: Initialisiert den ErrorManager.
 * Muss von app.js nach 'DOMContentLoaded' aufgerufen werden.
 * Diese Funktion implementiert den V11.11 "DOM-Ready"-Fix.
 */
export function initErrorManager() {
    logPanel = document.getElementById('diag-log-panel');
    
    if (logPanel) {
        // Bereinige den "Bootstrap"-Text
        logPanel.innerHTML = '';
        diagLog("ErrorManager (V13.3e) initialisiert.", 'info');
        
        // Initialisiere die globalen Handler, sobald das Log-Panel bereit ist
        initGlobalErrorHandler();
    } else {
        console.error("[ErrorManager] Panel 'diag-log-panel' nicht im DOM gefunden!");
    }
}

/**
 * Loggt eine Nachricht in das Diagnose-Panel und die Konsole.
 * (V11.5-Logik, angepasst für V13.3e)
 * @param {string} msg - Die Nachricht.
 * @param {string} [type='info'] - Typ (info, error, warn, bt, utils, ui).
 */
export function diagLog(msg, type = 'info') {
    // V13.3e-FIX: Panel wird jetzt von initErrorManager() gesetzt.
    // Wir prüfen nur noch, ob es existiert.
    if (!logPanel) {
        console.error(`DIAGLOG FEHLER (Panel nicht bereit): ${msg}`);
        return;
    }

    const timestamp = new Date().toLocaleTimeString('de-DE');
    const entry = document.createElement('span');
    
    // ... (Dein switch-case-Block bleibt 1:1 identisch) ...
    let logTypeClass = 'log-info';
    switch(type) {
        case 'error': logTypeClass = 'log-error'; console.error(`[${timestamp}] ${msg}`); break;
        case 'warn': logTypeClass = 'log-warn'; console.warn(`[${timestamp}] ${msg}`); break;
        case 'bt': logTypeClass = 'log-bt'; console.log(`[${timestamp}] [BT]: ${msg}`); break;
        case 'utils': logTypeClass = 'log-utils'; console.log(`[${timestamp}] [UTILS]: ${msg}`); break;
        case 'ui': logTypeClass = 'log-ui'; console.log(`[${timestamp}] [UI]: ${msg}`); break;
        default: console.log(`[${timestamp}] [INFO]: ${msg}`);
    }

    entry.className = `log-entry ${logTypeClass}`;
    entry.textContent = `[${timestamp}] [${type.toUpperCase()}]: ${msg}`;
    
    logPanel.prepend(entry);
    
    // V13.3e-FIX: Log-Rotation verwendet jetzt den Wert aus AppConfig
    while (logPanel.children.length > AppConfig.ErrorManager.MAX_LOG_ENTRIES) {
        logPanel.removeChild(logPanel.lastChild);
    }
}

/**
 * V11.5: (Unverändert)
 * Loggt in die Konsole UND das Diagnose-Panel,
 * BEVOR das Haupt-diagLog-Modul bereit ist.
 */
export function earlyDiagLog(msg, isError = false) {
    // ... (Diese Funktion bleibt 1:1 identisch) ...
    try {
        const panel = document.getElementById('diag-log-panel');
        if (panel) {
            const entry = document.createElement('span');
            entry.className = `log-entry ${isError ? 'log-error' : 'log-bootstrap'}`;
            entry.textContent = `[${new Date().toLocaleTimeString('de-DE')}] [BOOTSTRAP]: ${msg}`;
            panel.prepend(entry);
        } else {
            console.log(`[BOOTSTRAP]: ${msg}`);
        }
    } catch (e) {
        console.error("EarlyDiagLog FAILED:", e);
    }
}


/**
 * (V11.5) Installiert globale Error-Handler.
 * V13.3e: Diese Funktion wird jetzt von initErrorManager() aufgerufen.
 */
function initGlobalErrorHandler() {
    window.onerror = (message, source, lineno, colno, error) => {
        const errorMsg = `Unbehandelter Fehler: ${message} (in ${source.split('/').pop()}@${lineno}:${colno})`;
        diagLog(errorMsg, 'error');
        return true; 
    };
    
    window.onunhandledrejection = (event) => {
        const errorMsg = `Unbehandelte Promise-Ablehnung: ${event.reason.message || event.reason}`;
        diagLog(errorMsg, 'error');
    };
    // V13.3e: Diese Meldung wird jetzt von initErrorManager() geloggt,
    // *nachdem* der Handler aufgerufen wurde.
    diagLog("Globale Error-Handler (onerror, onunhandledrejection) installiert.", "info");
}

// V13.3e-HINWEIS: Wir exportieren 'initGlobalErrorHandler' nicht mehr,
// da es von 'initErrorManager' (dem neuen Einstiegspunkt) gekapselt wird.
// export { initGlobalErrorHandler }; // Veraltet
 
