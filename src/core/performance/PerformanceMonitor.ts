/**
 * Internal performance monitor.
 * 
 * Tracks frame execution time. Used to decide whether to temporarily downgrade of
 * model needed when the `ms` drops below `LATENCY_THRESHOLD_MS`.
 * 
 * @export
 * @class PerformanceMonitor
 */
export class PerformanceMonitor {
    /** @private The current exponentially moving average (EMA) of the frame time, in milliseconds. */
    private emaProcessTime = 0

    /** @private Time when downgrade mode was enabled. Null if downgrade disabled. */
    private downgradeTimestamp: number | null = null

    private frameCount = 0

    /** @private Number of frames before the monitor begins to make decisions about downgrading */
    private readonly WARMUP_FRAMES = 120

    /** @private EMA smoothing Constant */
    private readonly EMA_ALPHA = 0.05

    private readonly LATENCY_THRESHOLD_MS: number
    private readonly DOWNGRADE_DURATION_MS: number

    /**
     * Creates an instance of PerformanceMonitor.
     *
     * @constructor
     * @param {number} [thresholdMs=100] The frame time threshold in ms which triggers downgrade.
     * @param {number} [penaltyDurationMs=5 * 60 * 1000] The duration of downgrading penalty in ms before an attempt to restore the model.
     */
    constructor(thresholdMs = 100, penaltyDurationMs = 5 * 60 * 1000) {
        this.LATENCY_THRESHOLD_MS = thresholdMs
        this.DOWNGRADE_DURATION_MS = penaltyDurationMs
    }

    /**
     * Update performance metrics.
     * @param {number} durationMs execution time of the current frame
     */
    update(durationMs: number): void {
        this.frameCount++

        // Protection against first frame due to the initialization of WebGL/DOMthe.
        // Don't let it ruin the EMA statistics.
        if (this.frameCount < 5 && durationMs > 500) {
            return
        }

        this.emaProcessTime = this.emaProcessTime === 0
            ? durationMs
            : (this.EMA_ALPHA * durationMs) + ((1-this.EMA_ALPHA) * this.emaProcessTime)
    }
    
    /**
     * Checks whether the system should switch to reduced quality mode or exit it.
     * @returns {boolean} true - if need to use the lightweight model, false – the heavyweight.
     */
    shouldDowngrade(): boolean {
        if (this.frameCount < this.WARMUP_FRAMES) {
            return false
        }

        const now = performance.now()
        
        // State: already in the downgrade mode. Checks whether the penalty period has expired.
        if (this.downgradeTimestamp !== null){
            if (now - this.downgradeTimestamp > this.DOWNGRADE_DURATION_MS) {
                this.downgradeTimestamp = null
                console.log("[PerformanceMonitor] Returning a heavy model")
                return false
            }
            return true
        }

        // State: in the normal mode. Checks whether the execution time threshold has been exceeded.
        if (this.emaProcessTime > this.LATENCY_THRESHOLD_MS) {
            this.downgradeTimestamp = now
            console.warn(`[PerformanceMonitor] Performance degradation! Latency: ${this.emaProcessTime.toFixed(1)}ms.`)
            return true
        }

        return false
    }

    getLatency(): number {
        return this.emaProcessTime
    }

    reset(): void {
        this.emaProcessTime = 0
        this.downgradeTimestamp = null
        this.frameCount = 0
    }
}