import { HistoryBuffer } from "@/core/history/History"
import {clamp, mean, median} from "@utils/helpers"

export type YawnStatus = "NORMAL" | "YAWNING"

export class YawnDetector {
    private static readonly THRESHOLD_SENSITIVITY = 2.2
    private static readonly MIN_FRAMES_FOR_THRESHOLD = 50

    private static readonly MIN_YAWN_DURATION = 1.5
    private static readonly MAX_YAWN_DURATION = 8

    private marHistory = new HistoryBuffer(10)

    threshold = 0.8
    yawnCount = 0

    private isYawning = false
    private startOpenTime = 0

    status: YawnStatus = "NORMAL"

    constructor(){
    }

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
                if (duration > YawnDetector.MIN_YAWN_DURATION){
                    this.status = "YAWNING"
                }
            }
        } else {
            if (this.isYawning){
                const duration = now - this.startOpenTime
                
                if ( duration > YawnDetector.MIN_YAWN_DURATION &&
                     duration < YawnDetector.MAX_YAWN_DURATION
                ) {
                    this.yawnCount++
                }
                this.isYawning = false
                this.status = "NORMAL"
            }
        }
    }

    private updateThreshold(mar: number): void {
        this.marHistory.push(mar)
        const history = this.marHistory.values()
        if (history.length > YawnDetector.MIN_FRAMES_FOR_THRESHOLD){
            const med_mar = median(history)
            const valid_mars = history.filter((v) => v < med_mar)
            
            if (!valid_mars.length) return

            this.threshold = clamp(
                mean(history) * YawnDetector.THRESHOLD_SENSITIVITY,
                0.3,
                1.5
            )
        }
    }
}