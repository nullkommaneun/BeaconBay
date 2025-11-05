/**
 * js/errorManager.js
 * * ARCHITEKTUR-HINWEIS: Dies ist das Fundament (Layer 0).
 * * ABHÄNGIGKEITEN: KEINE.
 * * ZWECK:
 * 1. Bereitstellung einer globalen Logging-Funktion (`diagLog`).
 * 2. Installation von globalen Error-Handlern (`window.onerror`, `window.onunhandledrejection`),
 * um *alle* nicht abgefangenen Laufzeit-Fehler zu erfassen.
 * * WARUM KEINE ABHÄNGIGKEITEN?
 * Dieses Modul muss autark und garantiert geladen werden,
 * damit es Fehler in *anderen* Modulen loggen kann.
 */

// Zwischenspeichern des DOM-Elements beim Laden des Moduls
let logPanel = null;

/**
 * Ruft das Log-Panel-Element ab und speichert es zwischen.
 * @returns {HTMLElement | null} Das Diagnose-Log-Panel-Element.
 */
function getLogPanel() {
    if (!logPanel) {
        logPanel = document.getElementById('diag-log-panel');
    }
    return logPanel;
}

/**
 * Schreibt eine formatierte Log-Nachricht in das Diagnose-Panel im Footer.
 *
 * @param {string} message - Die anzuzeigende Nachricht.
 * @param {'info' | 'warn' | 'error' | 'utils' | 'bt' | 'ui' | 'bootstrap'} [level='info'] - Der Log-Level (steuert die CSS-Klasse).
 */
export function diagLog(message, level = 'info') {
    try {
        const panel = getLogPanel();
        if (!panel) {
            console.error(`[${level.toUpperCase()}] (Panel not found): ${message}`);
            return;
        }

        const entry = document.createElement('span');
        entry.className = `log-entry log-${level}`;
        
        const timestamp = new Date().toLocaleTimeString('de-DE', { hour12: false });
        entry.textContent = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;

        // WIE: .prepend() statt .appendChild()
        // Neue Logs erscheinen oben. In Kombination mit `flex-direction: column-reverse`
        // im CSS ist das "neueste" Element immer sichtbar.
        panel.prepend(entry);

    } catch (domError) {
        console.error('FATAL: diagLog failed.', domError);
        console.error('Original message:', message);
    }
}

/**
 * Initialisiert die globalen Fanganetze für JavaScript-Laufzeitfehler.
 */
export function initGlobalErrorHandler() {
    
    /**
     * Fängt synchrone Laufzeit-Fehler.
     * @returns {boolean} - true, um den Fehler zu unterdrücken.
     */
    window.onerror = (msg, url, lineNo, colNo, error) => {
        const simpleUrl = url.substring(url.lastIndexOf('/') + 1);
        const errorMsg = `${msg} (in ${simpleUrl} @ ${lineNo}:${colNo})`;
        
        diagLog(errorMsg, 'error');
        return true; 
    };

    /**
     * Fängt abgelehnte Promises, die nicht mit .catch() behandelt wurden.
     * WICHTIG: Async/Await-Fehler (ohne try...catch) landen hier!
     */
    window.onunhandledrejection = (event) => {
        let reason = event.reason;
        if (reason instanceof Error) {
            reason = reason.stack || reason.message;
        }
        
        const errorMsg = `Unhandled Promise Rejection: ${reason}`;
        diagLog(errorMsg, 'error');
        event.preventDefault();
    };

    diagLog('Globale Error-Handler (onerror, onunhandledrejection) installiert.', 'info');
}
