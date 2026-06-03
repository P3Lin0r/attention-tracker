import { HistoryBuffer } from "@/core/history/History"
import type { BlinkStatus, BlinkConfig } from "@/types"

/**
 * Detects blinks, drowsy states (PERCLOS), and microsleep events based on the
 * Eye Aspect Ratio (EAR) using dynamic thresholding.
 *
 * @export
 * @class BlinkDetector
 */
export class BlinkDetector {
    /** @private Minimum time required to establish a baseline threshold. */
    private static readonly MIN_CALIBRATION_TIME_MS = 1000

    private earHistory: HistoryBuffer
    private closureHistory: HistoryBuffer

    threshold = 0.1
    blinkCount = 0
    perclosScore = 0

    private isClosed = false
    private startCloseTime = 0

    status: BlinkStatus = "NORMAL"
    
    /**
     * Creates an instance of BlinkDetector.
     *
     * @constructor
     * @param {BlinkConfig} config Configuration parameters for limits, thresholds, windows, etc.
     */
    constructor(private config: BlinkConfig){
        this.earHistory = new HistoryBuffer(this.config.earTimeWindow)
        this.closureHistory = new HistoryBuffer(this.config.perclosTimeWindow)
    }

    /**
     * Updates the detector with the newest EAR value. Recalculates thresholds,
     * updates PERCLOS, and transitions status states.
     * 
     * @param {number} currentEAR The current combined Eye Aspect Ratio.
     */
    update(currentEAR: number): void {
        const now = performance.now() / 1000

        this.updateThreshold(currentEAR)

        const currentlyClosed  = currentEAR < this.threshold
        
        this.closureHistory.push(currentlyClosed ? 1 : 0)
        this.calculatePerclos()

        if (currentlyClosed) {
            if (!this.isClosed){
                this.isClosed = true
                this.startCloseTime = now
            } else {
                const duration = now - this.startCloseTime
                if (duration > this.config.microsleepLimit){
                    this.status = "MICROSLEEP"
                }
            }
        } else {
            if (this.isClosed){
                this.isClosed = false
                const duration = now - this.startCloseTime
                
                if (duration < this.config.blinkDurationLimit) {
                    this.blinkCount++
                }
                if (this.status === "MICROSLEEP") {
                    this.status = "NORMAL"
                }
            }
        }

        if (this.status !== "MICROSLEEP"){
            this.status = 
                this.perclosScore > this.config.perclosDrowsyThreshold
                ? "DROWSY"
                : "NORMAL"
        }
    }
    
    /**
     * Dynamically adjusts the closure threshold based on the user's resting EAR.
     * Uses the median of recent EAR readings.
     *
     * @private
     * @param {number} ear The current EAR value.
     */
    private updateThreshold(ear: number): void{
        this.earHistory.push(ear)
        
        if (this.earHistory.timeSpanMs < BlinkDetector.MIN_CALIBRATION_TIME_MS) return
        
        const medEar = this.earHistory.median()
        
        const earhist = this.earHistory.getMutableSnapshot()
        const histlen = earhist.length

        let count = 0
        let sum = 0
        for (let i = 0; i < histlen; i++){
            const ear = earhist[i]
            if (ear > medEar) {
                count++
                sum += ear
            }
        }
        
        if (count === 0) return
        
        this.threshold = (sum/count) * this.config.thresholdSensitivity
    }

    /**
     * Calculates the percentage of frames where eyes were closed over the configured window.
     * Updates the `perclosScore` property.
     * @private
     */
    private calculatePerclos(): void {
        if (!this.closureHistory.length) {
            this.perclosScore = 0
            return
        }

        this.perclosScore = this.closureHistory.mean()
    }

    /** Resets the detector, clearing all histories and resetting state variables. */
    reset(): void {
        this.earHistory.clear()
        this.closureHistory.clear()
        this.startCloseTime = 0
        this.isClosed = false
    }
}