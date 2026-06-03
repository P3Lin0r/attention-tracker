import { HistoryBuffer } from "@/core/history/History"
import type { YawnConfig, YawnStatus } from "@/types"
import {clamp} from "@utils/helpers"

/**
 * Detects yawning and tracks yawn frequency based on the Mouth Aspect Ratio (MAR) 
 * using dynamic thresholding.
 * 
 * @export
 * @class YawnDetector
 */
export class YawnDetector {
    /** @private Minimum time required to establish a baseline threshold. */
    private static readonly MIN_CALIBRATION_TIME_MS = 1500

    private marHistory: HistoryBuffer

    threshold = 0.8
    yawnCount = 0

    private isYawning = false
    private startOpenTime = 0

    status: YawnStatus = "NORMAL"

    /**
     * Creates an instance of YawnDetector.
     *
     * @constructor
     * @param {YawnConfig} config Configuration parameters for timing windows and thresholds.
     */
    constructor(private config: YawnConfig){
        this.marHistory = new HistoryBuffer(this.config.marTimeWindow)
    }

    /**
     * Updates the detector with the newest MAR value, triggering threshold 
     * adjustments and state transitions.
     *
     * @param {number} currentMAR The current Mouth Aspect Ratio.
     */
    update(currentMAR: number): void {
        const now = performance.now() / 1000
        
        this.updateThreshold(currentMAR)

        const mouthOpened = currentMAR > this.threshold
        if (mouthOpened){
            if (!this.isYawning) {
                this.isYawning = true
                this.startOpenTime = now   
            } else {
                const duration = now - this.startOpenTime 
                if (duration > this.config.minYawnDuration){
                    this.status = "YAWNING"
                }
            }
        } else {
            if (this.isYawning){
                const duration = now - this.startOpenTime

                // Validate it was an actual yawn, not just talking or a quick opening
                if ( duration > this.config.minYawnDuration &&
                     duration < this.config.maxYawnDuration
                ) {
                    this.yawnCount++
                }
                this.isYawning = false
                this.status = "NORMAL"
            }
        }
    }

    /**
     * Dynamically adjusts the yawn threshold based on the user's resting MAR.
     * This compensates small picks of MAR values caused by mouth micro-movements,
     * distances from the camera or individual facial features.
     *
     * @private
     * @param {number} mar The current MAR value.
     */
    private updateThreshold(mar: number): void {
        this.marHistory.push(mar)

        if (this.marHistory.timeSpanMs > YawnDetector.MIN_CALIBRATION_TIME_MS){
            const medMar = this.marHistory.median()

            const marhist = this.marHistory.getMutableSnapshot()
            const histlen = marhist.length
            let count = 0
            let sum = 0
            for (let i = 0; i < histlen; i++){
                const mar = marhist[i]
                if (mar < medMar){
                    count++
                    sum += mar
                }
            }
            
            if (count === 0) return
            
            this.threshold = clamp(
                (sum/count) * this.config.thresholdSensitivity,
                0.3,
                1.5
            )
        }
    }

    /** Resets the detector, clearing histories and resetting internal timers. */
    reset(): void {
        this.marHistory.clear()
        this.startOpenTime = 0
        this.isYawning = false
    }
}