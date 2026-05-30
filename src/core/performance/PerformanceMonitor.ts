export class PerformanceMonitor {
    private emaProcessTime = 0
    private downgradeTimestamp: number | null = null

    private frameCount = 0
    private readonly WARMUP_FRAMES = 120

    private readonly EMA_ALPHA = 0.05
    private readonly LATENCY_THRESHOLD_MS: number
    private readonly DOWNGRADE_DURATION_MS: number

    constructor(thresholdMs = 100, penaltyDurationMs = 5 * 60 * 1000) {
        this.LATENCY_THRESHOLD_MS = thresholdMs
        this.DOWNGRADE_DURATION_MS = penaltyDurationMs
    }

    update(durationMs: number): void {
        this.frameCount++

        if (this.frameCount < 5 && durationMs > 500) {
            return;
        }

        this.emaProcessTime = this.emaProcessTime === 0
            ? durationMs
            : (this.EMA_ALPHA * durationMs) + ((1-this.EMA_ALPHA) * this.emaProcessTime)
    }

    shouldDowngrade(): boolean {
        if (this.frameCount < this.WARMUP_FRAMES) {
            return false
        }

        const now = performance.now()
        
        if (this.downgradeTimestamp !== null){
            if (now - this.downgradeTimestamp > this.DOWNGRADE_DURATION_MS) {
                this.downgradeTimestamp = null
                console.log("[PerformanceMonitor] Returning a heavy model")
                return false
            }
            return true
        }
        
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