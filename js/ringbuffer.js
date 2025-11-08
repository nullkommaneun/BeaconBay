// ARCHITEKTUR-HINWEIS (V13.1): Eine RingBuffer-Datenstruktur (FIFO).
// V13.3EE HINWEIS: Diese Datei MUSS existieren,
// da sie von logger.js (V13.3X) importiert wird.

export class RingBuffer {
    /**
     * @param {number} capacity Die maximale Anzahl von Elementen im Puffer.
     */
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
        this.size = 0; 
        this.head = 0; 
    }

    /**
     * Fügt ein neues Element hinzu.
     * @param {*} item Das hinzuzufügende Element.
     */
    push(item) {
        this.buffer[this.head] = item;
        if (this.size < this.capacity) {
            this.size++;
        }
        this.head = (this.head + 1) % this.capacity;
    }

    /**
     * Gibt alle Elemente als Array zurück (Alt nach Neu).
     * @returns {Array<*>}
     */
    toArray() {
        const result = [];
        if (this.size === 0) {
            return result;
        }
        if (this.size === this.capacity) {
            for (let i = 0; i < this.capacity; i++) {
                const index = (this.head + i) % this.capacity;
                result.push(this.buffer[index]);
            }
        } else {
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
