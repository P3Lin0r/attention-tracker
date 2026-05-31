import { HistoryBuffer } from "@/core/history/History"
import type { BlinkStatus, BlinkConfig } from "@/types"

export class BlinkDetector {
    private static readonly MIN_CALIBRATION_TIME_MS = 1000

    private earHistory: HistoryBuffer
    private closureHistory: HistoryBuffer

    threshold = 0.1
    blinkCount = 0
    perclosScore = 0

    private isClosed = false
    private startCloseTime = 0

    status: BlinkStatus = "NORMAL"

    constructor(private config: BlinkConfig){
        this.earHistory = new HistoryBuffer(this.config.earTimeWindow)
        this.closureHistory = new HistoryBuffer(this.config.perclosTimeWindow)
    }

    update(currentEAR: number): void {
        const now = performance.now() / 1000

        this.updateThreshold(currentEAR)

        const currentlyClosed  = currentEAR < this.threshold
        
        this.closureHistory.push(currentlyClosed ? 1 : 0),
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

    private calculatePerclos(): void {
        if (!this.closureHistory.length) {
            this.perclosScore = 0
            return
        }

        this.perclosScore = this.closureHistory.mean()
    }

    reset(): void {
        this.earHistory.clear()
        this.closureHistory.clear()
        this.startCloseTime = 0
        this.isClosed = false
    }
}