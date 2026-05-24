import {quickselect} from "@/utils/helpers"

export class HistoryBuffer {
    private values: Float32Array
    private timestamps: Float64Array

    private scratchpad: Float32Array
    
    private head = 0
    private tail = 0
    private count = 0 

    private timeWindowMs: number
    private capacity: number

    constructor(timeWindowSeconds: number, maxExpectedFps: number = 30) {
        this.timeWindowMs = timeWindowSeconds * 1000
        this.capacity = timeWindowSeconds * maxExpectedFps

        this.values = new Float32Array(this.capacity)
        this.timestamps = new Float64Array(this.capacity)
        
        this.scratchpad = new Float32Array(this.capacity)
    }

    push(value: number){
        const now = performance.now()
        
        this.values[this.head] = value
        this.timestamps[this.head] = now

        this.head = (this.head + 1) % this.capacity

        if (this.count < this.capacity){
            this.count++
        } else {
            this.tail = (this.tail + 1) % this.capacity
        }

        const cutoffTime = now - this.timeWindowMs
        while (this.count > 0 && this.timestamps[this.tail] < cutoffTime){
            this.tail = (this.tail + 1) % this.capacity
            this.count--
        }
    }

    getMutableSnapshot(): Float32Array {
        let curr = this.tail
        for (let i = 0; i<this.count; i++){
            this.scratchpad[i] = this.values[curr]
            curr = (curr + 1) % this.capacity
        }
        return this.scratchpad.subarray(0, this.count)
    }

    // ZERO-ALLOCATION MATH
    mean(): number {
        if (this.count === 0) return 0

        let sum = 0
        let curr = this.tail
        for (let i=0; i < this.count; i++){
            sum += this.values[curr]
            curr = (curr+1) % this.capacity
        }
        return sum / this.count
    }

    std(): number {
        if (this.count <= 1) return 0
        const meanVal = this.mean()
        let sumSq = 0
        let curr = this.tail
        for (let i = 0; i < this.count; i++){
            const diff = this.values[curr] - meanVal
            sumSq += diff * diff
            curr = (curr + 1) % this.capacity
        }
        return Math.sqrt(sumSq / this.count)
    }

    median(): number {
        if (this.count === 0) return 0

        const view = this.getMutableSnapshot()

        const mid = Math.floor(this.count/2)

        if (this.count % 2 !== 0 ){
            return quickselect(view, mid, 0, this.count - 1)
        } else {
            const a = quickselect(view, mid - 1, 0, this.count - 1)
            let b = view[mid]!
            for (let i = mid + 1; i < this.count; i++) {
                if (view[i]! < b) b = view[i]!
            }
            return (a + b) / 2
        }
    }
    
    get timeSpanMs(): number {
        if (this.count < 2) return 0
        
        const lastIndex = (this.head - 1 + this.capacity) % this.capacity

        const firstTimestamp = this.timestamps[this.tail]
        const lastTimestamp = this.timestamps[lastIndex]
        
        return lastTimestamp - firstTimestamp
    }

    get isFull(): boolean {       
        return this.timeSpanMs >= (this.timeWindowMs * 0.9)
    }

    get length(): number {
        return this.count
    }
}