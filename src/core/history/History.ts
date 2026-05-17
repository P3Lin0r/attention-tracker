interface HistoryEntry {
    value: number;
    timestamp: number;
}

export class HistoryBuffer {
    public history: HistoryEntry[] = []
    private timeWindowMs: number

    constructor(timeWindowSeconds: number) {
        this.timeWindowMs = timeWindowSeconds * 1000
    }

    push(value: number){
        const now = performance.now()
        this.history.push({value, timestamp: now})

        const cutoffTime = now - this.timeWindowMs
        while (this.history.length > 0 && this.history[0].timestamp < cutoffTime){
            this.history.shift()
        }
    }

    get isFull(): boolean {
        if (this.length < 2) return false
        const firstTimestamp = this.history[0].timestamp
        const lastTimestamp = this.history[this.length - 1].timestamp
        return (lastTimestamp - firstTimestamp) >= (this.timeWindowMs * 0.9)
    }

    mean(): number {
        if (this.history.length === 0) return 0

        let sum = 0
        for (let i=0; i<this.history.length; i++){
            sum += this.history[i].value
        }
        return sum / this.history.length
    }

    values() {
        let vals = []
        for (let i = 0; i < this.history.length; i++){
            vals.push(this.history[i].value)
        }
        return vals
    }

    get length(): number {
        return this.history.length
    }
}