// ARCHITEKTUR-HINWEIS (V13.1): Eine RingBuffer-Datenstruktur (FIFO).
// Diese Klasse wird von logger.js (V13.1) verwendet, um den 
// Advertisement-Verlauf (z.B. die letzten 500 Pakete) pro Gerät
// speichereffizient zu verwalten.

export class RingBuffer {
    /**
     * @param {number} capacity Die maximale Anzahl von Elementen im Puffer.
     */
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
        this.size = 0; // Aktuelle Anzahl der Elemente
        this.head = 0; // Zeiger auf das *älteste* Element (nächster Schreib-Slot)
    }

    /**
     * Fügt ein neues Element hinzu und überschreibt 
     * ggf. das älteste Element.
     * @param {*} item Das hinzuzufügende Element.
     */
    push(item) {
        this.buffer[this.head] = item;
        
        // V13.1-LOGIK: Wenn der Puffer noch nicht voll ist, 
        // erhöhen wir die Größe.
        if (this.size < this.capacity) {
            this.size++;
        }
        
        // V13.1-LOGIK: Verschiebe den Kopf-Zeiger.
        // Wenn er das Ende erreicht, springt er zurück auf 0 (Ring).
        this.head = (this.head + 1) % this.capacity;
    }

    /**
     * Gibt alle Elemente im Puffer als Array zurück,
     * geordnet von alt (Index 0) nach neu (letzter Index).
     * Wichtig für den V13.2-Export.
     * @returns {Array<*>}
     */
    toArray() {
        const result = [];
        
        if (this.size === 0) {
            return result;
        }

        // V13.1-LOGIK: Wenn der Puffer voll ist (oder wir 
        // übergelaufen sind), ist 'head' der älteste Eintrag.
        if (this.size === this.capacity) {
            for (let i = 0; i < this.capacity; i++) {
                // Starte am 'head' und wickle um
                const index = (this.head + i) % this.capacity;
                result.push(this.buffer[index]);
            }
        } 
        // V13.1-LOGIK: Wenn der Puffer noch nicht voll ist,
        // ist Index 0 der älteste Eintrag.
        else {
            for (let i = 0; i < this.size; i++) {
                result.push(this.buffer[i]);
            }
        }
        return result;
    }

    /**
     * Leert den Puffer.
     */
    clear() {
        this.buffer = new Array(this.capacity);
        this.size = 0;
        this.head = 0;
    }
}
