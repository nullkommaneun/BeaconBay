/**
 * js/errorManager.js
 * * ARCHITEKTUR-HINWEIS: Dies ist das Fundament (Layer 0).
 * * ABHÄNGIGKEITEN: KEINE.
 * * ZWECK:
 * 1. Bereitstellung einer globalen Logging-Funktion (`diagLog`), die direkt in das
 * DOM (#diag-log-panel) schreibt.
 * 2. Installation von globalen Error-Handlern (`window.onerror`, `window.onunhandledrejection`),
 * um *alle* nicht abgefangenen Fehler in der Anwendung zu erfassen und
 * sicher an `diagLog` zu leiten.
 * * WARUM KEINE ABHÄNGIGKEITEN?
 * Wenn dieses Modul von anderen abhinge, könnte ein Fehler in einer dieser
 * Abhängigkeiten (z.B. utils.js) verhindern, dass der ErrorManager selbst
 * geladen wird. Das würde bedeuten, dass unser Fanganetz für Fehler
 * nicht funktioniert, *bevor* der erste Fehler überhaupt auftritt.
 * Dieses Modul muss als erstes, autark und garantiert geladen werden.
 */

// Zwischenspeichern des DOM-Elements beim Laden des Moduls
let logPanel = null;

/**
 * Ruft das Log-Panel-Element ab und speichert es zwischen.
 * Wird träge (lazy) aufgerufen, um sicherzustellen, dass das DOM beim
 * ersten Log-Versuch wahrscheinlich bereit ist.
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
 * * WIE: Diese Funktion schreibt direkt in das DOM, anstatt ein Event
 * zu feuern. Dies ist eine bewusste Design-Entscheidung, um
 * Zirkularität zu vermeiden (wenn das UI-Modul das Logging handhaben würde,
 * bräuchte das UI-Modul den ErrorManager und der ErrorManager bräuchte
 * das UI-Modul).
 *
 * @param {string} message - Die anzuzeigende Nachricht.
 * @param {'info' | 'warn' | 'error' | 'utils' | 'bt'} [level='info'] - Der Log-Level (steuert die CSS-Klasse).
 */
export function diagLog(message, level = 'info') {
    try {
        const panel = getLogPanel();
        if (!panel) {
            // Fallback, falls das Panel (noch) nicht existiert
            console.error(`[${level.toUpperCase()}] (Panel not found): ${message}`);
            return;
        }

        // Erstelle den neuen Log-Eintrag
        const entry = document.createElement('span');
        entry.className = `log-entry log-${level}`;
        
        // Formatierung mit Zeitstempel
        const timestamp = new Date().toLocaleTimeString('de-DE', { hour12: false });
        entry.textContent = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;

        // WIE: .prepend() statt .appendChild()
        // Neue Logs erscheinen oben. In Kombination mit `flex-direction: column-reverse`
        // im CSS bleibt der Viewport am "Boden" (wo die neusten Einträge sind),
        // aber die DOM-Reihenfolge ist korrekt (neustes zuerst).
        panel.prepend(entry);

        // Optional: Verhindern, dass das Log-Panel unendlich wächst
        // (Für eine Produktions-App würden wir hier die ältesten Einträge entfernen)

    } catch (domError) {
        // Meta-Fehler: Das Logging selbst ist fehlgeschlagen.
        console.error('FATAL: diagLog failed.', domError);
        console.error('Original message:', message);
    }
}

/**
 * Initialisiert die globalen Fanganetze für JavaScript-Fehler.
 * * WARUM: Dies ist unser "Sicherheitsnetz". Wenn irgendwo in der App
 * ein Fehler auftritt, den wir nicht explizit mit try...catch behandeln,
 * fangen diese Handler ihn ab und leiten ihn an unser Diagnose-Panel.
 * Dies ist entscheidend für die Fehlersuche in der Produktion.
 */
export function initGlobalErrorHandler() {
    
    /**
     * Fängt Laufzeit-Syntaxfehler, Referenzfehler etc. (synchrone Fehler).
     * @param {string} msg - Fehlermeldung
     * @param {string} url - URL der Datei
     * @param {number} lineNo - Zeilennummer
     * @param {number} colNo - Spaltennummer
     * @param {Error} error - Das Error-Objekt
     * @returns {boolean} - true, um den Fehler zu unterdrücken (nicht in Konsole anzeigen)
     */
    window.onerror = (msg, url, lineNo, colNo, error) => {
        const simpleUrl = url.substring(url.lastIndexOf('/') + 1); // Nur Dateiname
        const errorMsg = `${msg} (in ${simpleUrl} @ ${lineNo}:${colNo})`;
        
        diagLog(errorMsg, 'error');
        
        // Wir geben 'true' zurück, um den Standard-Konsolen-Log des Browsers
        // zu unterdrücken, da wir ihn bereits selbst behandeln.
        return true; 
    };

    /**
     * Fängt abgelehnte Promises, die nicht mit .catch() behandelt wurden.
     * WICHTIG: Async/Await-Fehler (ohne try...catch) landen hier!
     * @param {PromiseRejectionEvent} event - Das Event-Objekt
     */
    window.onunhandledrejection = (event) => {
        let reason = event.reason;
        
        if (reason instanceof Error) {
            // Wenn es ein echtes Error-Objekt ist, nutzen wir den Stack
            reason = reason.stack || reason.message;
        }
        
        const errorMsg = `Unhandled Promise Rejection: ${reason}`;
        diagLog(errorMsg, 'error');
        
        // Verhindert das Standard-Konsolen-Logging
        event.preventDefault();
    };

    // Wir loggen, dass das Sicherheitsnetz aktiv ist.
    diagLog('Globale Error-Handler (onerror, onunhandledrejection) installiert.', 'info');
}
