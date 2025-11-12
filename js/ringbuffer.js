/**
 * js/ringbuffer.js
 * Einfacher, effizienter Ringspeicher.
 */
export class RingBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
        this.size = 0;
        this.head = 0;
    }

    push(item) {
        this.buffer[this.head] = item;
        this.head = (this.head + 1) % this.capacity;
        if (this.size < this.capacity) {
            this.size++;
        }
    }

    toArray() {
        if (this.size === 0) return [];
        
        // Optimierte Array-Erstellung
        const res = new Array(this.size);
        
        // Fall 1: Puffer ist noch nicht übergelaufen (head ist einfach das Ende)
        if (this.size < this.capacity) {
            for (let i = 0; i < this.size; i++) {
                res[i] = this.buffer[i];
            }
        } 
        // Fall 2: Puffer ist voll, wir müssen "unwrappen" (Start ist head)
        else {
            for (let i = 0; i < this.capacity; i++) {
                res[i] = this.buffer[(this.head + i) % this.capacity];
            }
        }
        return res;
    }

    clear() {
        this.buffer = new Array(this.capacity);
        this.size = 0;
        this.head = 0;
    }
}
