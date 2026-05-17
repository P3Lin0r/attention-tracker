import { HistoryBuffer } from "@/core/history/History"
import {mean, median} from "@utils/helpers"

export type BlinkStatus = "NORMAL" | "DROWSY" | "MICROSLEEP"

export class BlinkDetector {
    private static readonly MIN_FRAMES_FOR_THRESHOLD = 30
    private static readonly THRESHOLD_SENSITIVITY = 0.72

    private static readonly MICROSLEEP_LIMIT = 3.0
    private static readonly BLINK_DURATION_LIMIT = 0.45
    private static readonly PERCLOS_TIME_WINDOW = 60

    private static readonly PERCLOS_DROWSY_THRESHOLD = 0.15

    private earHistory = new HistoryBuffer(5)
    private closureHistory = new HistoryBuffer(BlinkDetector.PERCLOS_TIME_WINDOW)

    threshold = 0.1
    blinkCount = 0
    perclosScore = 0

    private isClosed = false
    private startCloseTime = 0

    status: BlinkStatus = "NORMAL"

    constructor(){
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
                if (duration > BlinkDetector.MICROSLEEP_LIMIT){
                    this.status = "MICROSLEEP"
                }
            }
        } else {
            if (this.isClosed){
                this.isClosed = false
                const duration = now - this.startCloseTime
                
                if (duration < BlinkDetector.BLINK_DURATION_LIMIT) {
                    this.blinkCount++
                }
                if (this.status === "MICROSLEEP") {
                    this.status = "NORMAL"
                }
            }
        }

        if (this.status !== "MICROSLEEP"){
            this.status = 
                this.perclosScore > BlinkDetector.PERCLOS_DROWSY_THRESHOLD
                ? "DROWSY"
                : "NORMAL"
        }
    }

    private updateThreshold(ear: number): void{
        this.earHistory.push(ear)
        const erahist = this.earHistory.values()
        if (erahist.length < BlinkDetector.MIN_FRAMES_FOR_THRESHOLD) return

        const medEar = median(erahist)
        const validEars = erahist.filter((v)=> v > medEar)
        
        if (!validEars.length) return
        
        this.threshold = mean(validEars) * BlinkDetector.THRESHOLD_SENSITIVITY
    }

    private calculatePerclos(): void {
        const clhist = this.closureHistory.values()
        if (!clhist.length) {
            this.perclosScore = 0
            return
        }

        const closedFrames = clhist.reduce((sum, val) => sum + val, 0)

        this.perclosScore = closedFrames / clhist.length
    }
}