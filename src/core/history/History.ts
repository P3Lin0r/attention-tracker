import {quickselect} from "@/utils/helpers"

/**
 * A time-windowed circular buffer optimized for zero-allocation math operations.
 * Designed for hold time-series data and perform statistical calculations without triggering garbage collector
 *
 * @export
 * @class HistoryBuffer
 */
export class HistoryBuffer {
    private values: Float32Array
    private timestamps: Float64Array

    /** @private Reusable memory block for snapshots to prevent allocations. */
    private scratchpad: Float32Array
    
    private head = 0
    private tail = 0
    private count = 0 

    private timeWindowMs: number
    private capacity: number
    
    /**
     * Creates an instance of HistoryBuffer.
     *
     * @constructor
     * @param {number} timeWindowSeconds The time window to retain data, in seconds.
     * @param {number} [maxExpectedFps=30] Expected maximum FPS value, used to pre-allocate array capacity.
     */
    constructor(timeWindowSeconds: number, maxExpectedFps: number = 30) {
        this.timeWindowMs = timeWindowSeconds * 1000
        this.capacity = timeWindowSeconds * maxExpectedFps

        this.values = new Float32Array(this.capacity)
        this.timestamps = new Float64Array(this.capacity)
        this.scratchpad = new Float32Array(this.capacity)
    }

    /**
     * Pushes a new value into the buffer removes data older than the time window.
     * @param {number} value The new value to store.
     */
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

    /**
     * Retrieves a flat view of the current valid elements in chronological order.
     * 
     * @remarks **WARNING:** This returns a view of the internal scratchpad. It mutates the 
     * internal state to avoid allocations. Do not hold onto this reference across ticks.
     * @returns {Float32Array} A subarray of the current valid sequence. 
     */
    getMutableSnapshot(): Float32Array {
        let curr = this.tail
        for (let i = 0; i<this.count; i++){
            this.scratchpad[i] = this.values[curr]
            curr = (curr + 1) % this.capacity
        }
        return this.scratchpad.subarray(0, this.count)
    }

    // ========================================
    // ZERO-ALLOCATION MATH METHODS 
    // ========================================

    /**
     * Calculates the mean value of the current buffer.
     * @returns {number} The mean value, or 0 if the buffer is empty.
     */
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

    /**
     * Calculates the standard deviation of the current buffer.
     * @returns {number} The standard deviation, or 0 if count of buffer values is <= 1.
     */
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

    /**
     * Calculates the median value of the current buffer using the Quickselect algorithm.
     * 
     * @remarks Modifies the internal scratchpad array during calculation.
     * @returns {number} The median value, or 0 if the buffer is empty.
     */
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
    
    /** Clears all data from the buffer and resets pointers.*/
    clear(): void {
        this.tail = 0
        this.head = 0
        this.count = 0
    }
    
    /**
     * Gets the timespan between oldest and newest values in the buffer 
     * @readonly
     * @returns {number} The timespan in milliseconds.
     */
    get timeSpanMs(): number {
        if (this.count < 2) return 0
        
        const lastIndex = (this.head - 1 + this.capacity) % this.capacity

        const firstTimestamp = this.timestamps[this.tail]
        const lastTimestamp = this.timestamps[lastIndex]
        
        return lastTimestamp - firstTimestamp
    }

    /**
     * Checks if the buffer has been collecting data long enough to cover the 90% of its target time window. 
     * @readonly
     * @returns {boolean} True if the buffer is considered full.
     */
    get isFull(): boolean {       
        return this.timeSpanMs >= (this.timeWindowMs * 0.9)
    }
    
    /**
     * Gets the current number of active, unexpired elements within the time window.
     * @readonly
     * @returns {number} Element count.
     */
    get length(): number {
        return this.count
    }
}