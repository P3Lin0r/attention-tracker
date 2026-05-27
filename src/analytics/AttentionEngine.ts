import { clamp, rad2degScalar } from "@/utils/helpers";
import type {
    AttentionDetails,
    AttentionStatus,
    Signals,
    TrackerSnapshot,
    CalibrationState
} from "@/types";
import { HistoryBuffer } from "@/core/history/History";


export class AttentionEngine {
    private bufferSize = 4

    private yawHistory = new HistoryBuffer(this.bufferSize)
    private pitchHistory = new HistoryBuffer(this.bufferSize)

    status: AttentionStatus = "NORMAL"
    score = 1

    private targetStatus: AttentionStatus = "NORMAL"

    private statusHoldStartTime: number | null = null
    private readonly TIME_TO_CONFIRM_MS = 500

    constructor(){
    }

    analyze(
        snapshot: TrackerSnapshot,
        calibrationState: CalibrationState,
        signals: Signals
    ): { status: AttentionStatus, score: number, details: AttentionDetails } {

        const details: AttentionDetails = {
            penalties: { gaze: 0, perclos: 0, yawn: 0, emotionModifier: 1 },
            isADHD: false,
            direction: {
                headAngles: snapshot.headAngles,
                gazeVector: snapshot.gaze,
            }
        }

        // HARD OVERRIDES
        if (signals.blink.status == "MICROSLEEP"){
            this.score = 0
            this.applyStatusImmediately("MICROSLEEP")
            return this.buildResult(details)
        }

        if (signals.blink.status == "DROWSY"){
            if (this.score > 0.4){
                this.score = Math.max(0.4, this.score * 0.7)
            } else {
                this.score = 0.85 * this.score + 0.15 * 0.25
            }
            this.applyStatusImmediately("DROWSY")
            return this.buildResult(details)
        }

        if (!calibrationState.isCalibrated) {
            return this.buildResult(details)
        }

        // SOFT SCORE
        if (snapshot.gaze && calibrationState.isCalibrated){
            const [gx, gy, gz] = snapshot.gaze
            const yaw = rad2degScalar(Math.atan2(gx, Math.abs(gz) + 1e-6))
            const pitch = rad2degScalar(Math.asin(clamp(-gy, -1, 1)))

            const yawDiff = yaw - calibrationState.yaw
            const pitchDiff = pitch - calibrationState.pitch
            
            this.yawHistory.push(yawDiff)
            this.pitchHistory.push(pitchDiff)

            const yawPenalty = Math.max(0, (Math.abs(yawDiff) - 15) / 25)
            const pitchPenalty = Math.max(0, (Math.abs(pitchDiff) - 10) / 20)
            details.penalties.gaze = Math.min(1, yawPenalty + pitchPenalty)

            if (this.yawHistory.isFull && this.yawHistory.length >= 15){
                const yawStd = this.yawHistory.std()
                const pitchStd = this.pitchHistory.std()
                
                if ((yawStd + pitchStd) > 18){
                    details.isADHD = true
                }
            }
        }

        details.penalties.yawn = signals.yawn.status == "YAWNING" ? 0.4 : 0
        details.penalties.perclos = signals.blink.perclos

        const emotion = signals.emotion
        if (emotion == "FOCUSED"){
            details.penalties.emotionModifier = 0.4
        }
        else if (emotion == "THINKING"){
            details.penalties.emotionModifier = 0.6
        }

        const totalPenalty = (
            details.penalties.gaze  * 0.5 +
            details.penalties.perclos * 0.35 + 
            details.penalties.yawn * 0.15
        ) * details.penalties.emotionModifier

        const newRawScore = clamp(1 - totalPenalty, 0, 1)
        if (newRawScore < this.score) {
            this.score = 0.7 * this.score + 0.3 * newRawScore
        } else {
            this.score = 0.98 * this.score + 0.02 * newRawScore
        }

        this.updateStatus(details.isADHD)
        return this.buildResult(details)
    }

    private applyStatusImmediately(status: AttentionStatus){
        this.status = status
        this.targetStatus = status
        this.statusHoldStartTime = null
    }

    private updateStatus(isADHD: boolean){
        let calculatedTarget: AttentionStatus = "NORMAL"
        
        if (this.score >= 0.70){
            calculatedTarget = isADHD ? "ADHD" : "NORMAL"
        } else if (this.score > 0.45) {
            calculatedTarget = "DISTRACTED"
        } else if (this.score > 0.25) {
            calculatedTarget = "DROWSY"
        } else {
            calculatedTarget = "MICROSLEEP"
        }
        
        const now = performance.now()
        if (calculatedTarget === this.targetStatus){
            if (this.statusHoldStartTime !== null && (now - this.statusHoldStartTime >= this.TIME_TO_CONFIRM_MS)){
                this.status = this.targetStatus
            }
        } else {
            this.targetStatus = calculatedTarget
            this.statusHoldStartTime = now
        }
    }

    reset(){
        this.yawHistory.clear()
        this.pitchHistory.clear()

        this.score = 1
        this.status = "NORMAL"
        this.targetStatus = "NORMAL"
        this.statusHoldStartTime = null
    }

    private buildResult(details: AttentionDetails) {
        return {
            status: this.status,
            score: this.score,
            details
        }
    }

    getStatus(){
        return {
            status: this.status,
            score: this.score
        }
    }
}