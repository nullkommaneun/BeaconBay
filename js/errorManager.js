/**
 * js/errorManager.js (Version 13.3j "Import Fix")
 * * ARCHITEKTUR-HINWEIS:
 * - V13.3j FIX: Stellt 'export' bei 'initGlobalErrorHandler' wieder her.
 * - app.js (V13.3i) MUSS diese Funktion beim Start importieren (V11.5-Logik).
 * - V13.3e: Nutzt AppConfig (unverändert).
 */

// V13.3e-IMPORT: (Unverändert)
import { AppConfig } from './config.js';

// === MODULE STATE ===
let logPanel = null;
// (Keine MAX_LOG_ENTRIES "Magic Number" mehr, V13.3e)

/**
 * V13.3e-NEU: Initialisiert den ErrorManager.
 * (Unverändert)
 */
export function initErrorManager() {
    logPanel = document.getElementById('diag-log-panel');
    
    if (logPanel) {
        logPanel.innerHTML = '';
        diagLog("ErrorManager (V13.3j) initialisiert.", 'info');
        
        // V13.3j-FIX: Dieser Aufruf wird entfernt.
        // initGlobalErrorHandler() wird jetzt wieder von app.js aufgerufen.
        // initGlobalErrorHandler(); // VERALTET HIER
    } else {
        console.error("[ErrorManager] Panel 'diag-log-panel' nicht im DOM gefunden!");
    }
}

/**
 * Loggt eine Nachricht in das Diagnose-Panel und die Konsole.
 * (V13.3e-Logik, unverändert)
 */
export function diagLog(msg, type = 'info') {
    // ... (Funktion unverändert, V13.3e) ...
    if (!logPanel) {
        console.error(`DIAGLOG FEHLER (Panel nicht bereit): ${msg}`);
        return;
    }
    const timestamp = new Date().toLocaleTimeString('de-DE');
    const entry = document.createElement('span');
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
    while (logPanel.children.length > AppConfig.ErrorManager.MAX_LOG_ENTRIES) {
        logPanel.removeChild(logPanel.lastChild);
    }
}

/**
 * V11.5: (Unverändert)
 * earlyDiagLog
 */
export function earlyDiagLog(msg, isError = false) {
    // ... (Funktion unverändert, V11.5) ...
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
 * V13.3j-FIX: 'export' wieder hinzugefügt.
 */
export function initGlobalErrorHandler() {
    window.onerror = (message, source, lineno, colno, error) => {
        const errorMsg = `Unbehandelter Fehler: ${message} (in ${source.split('/').pop()}@${lineno}:${colno})`;
        diagLog(errorMsg, 'error');
        return true; 
    };
    
    window.onunhandledrejection = (event) => {
        const errorMsg = `Unbehandelte Promise-Ablehnung: ${event.reason.message || event.reason}`;
        diagLog(errorMsg, 'error');
    };
    
    // V13.3j: Diese Log-Meldung kommt jetzt *sofort* beim App-Start (V11.5-Logik),
    // anstatt auf DOMContentLoaded zu warten (V13.3e-Fehler).
    earlyDiagLog("Globale Error-Handler (onerror, onunhandledrejection) installiert.", false);
}
 
