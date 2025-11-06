/**
 * js/errorManager.js (Version 11.5)
 * * ARCHITEKTUR-HINWEIS:
 * - V11.5: Exportiert 'earlyDiagLog' für den robusten Start von app.js.
 */

// === MODULE STATE ===
let logPanel = null;
const MAX_LOG_ENTRIES = 100;

/**
 * Loggt eine Nachricht in das Diagnose-Panel und die Konsole.
 * @param {string} msg - Die Nachricht.
 * @param {string} [type='info'] - Typ (info, error, warn, bt, utils, ui).
 */
export function diagLog(msg, type = 'info') {
    if (!logPanel) {
        logPanel = document.getElementById('diag-log-panel');
        if (!logPanel) {
            console.error("DIAGLOG FEHLER: Panel 'diag-log-panel' nicht gefunden.");
            return;
        }
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
    
    // Log-Rotation
    while (logPanel.children.length > MAX_LOG_ENTRIES) {
        logPanel.removeChild(logPanel.lastChild);
    }
}

/**
 * V11.5: Exportiert, damit app.js sie global nutzen kann.
 * Loggt in die Konsole UND das Diagnose-Panel,
 * BEVOR das Haupt-diagLog-Modul bereit ist.
 */
export function earlyDiagLog(msg, isError = false) {
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
 * Installiert globale Error-Handler, um Abstürze abzufangen.
 */
export function initGlobalErrorHandler() {
    window.onerror = (message, source, lineno, colno, error) => {
        const errorMsg = `Unbehandelter Fehler: ${message} (in ${source.split('/').pop()}@${lineno}:${colno})`;
        diagLog(errorMsg, 'error');
        return true; // Verhindert, dass der Fehler in der Konsole angezeigt wird (optional)
    };
    
    window.onunhandledrejection = (event) => {
        const errorMsg = `Unbehandelte Promise-Ablehnung: ${event.reason.message || event.reason}`;
        diagLog(errorMsg, 'error');
    };
    diagLog("Globale Error-Handler (onerror, onunhandledrejection) installiert.", "info");
}
 
