import { clamp, rad2degScalar } from "@/utils/helpers";
import type {
    AttentionDetails,
    AttentionStatus,
    Signals,
    TrackerSnapshot,
    CalibrationState,
    EngineConfig
} from "@/types";
import { HistoryBuffer } from "@/core/history/History";

/**
 * Aggregates all tracking and calibration data to an `attention score` and determines 
 * the user's high-level state `(NORMAL, DISTRACTED, DROWSY, MICROSLEEP, ADHD)`.
 * Combines gaze variance, blinks (PERCLOS), yawning, and emotional states to calculate penalties.
 * 
 * @export
 * @class AttentionEngine
 */
export class AttentionEngine {
    private yawHistory: HistoryBuffer
    private pitchHistory: HistoryBuffer

    status: AttentionStatus = "NORMAL"
    score = 1

    private targetStatus: AttentionStatus = "NORMAL"
    private statusHoldStartTime: number | null = null

    /**
     * Creates an instance of AttentionEngine.
     *
     * @constructor
     * @param {EngineConfig} config Configuration mapping penalty weights and time windows.
     */
    constructor(private config: EngineConfig){
        this.yawHistory = new HistoryBuffer(this.config.yawTimeWindow) 
        this.pitchHistory = new HistoryBuffer(this.config.pitchTimeWindow) 
    }

    /**
     * Analyzes incoming frame data and updates the attention score and status.
     *
     * @param {TrackerSnapshot} snapshot Geometric data (gaze, head angles) from the frame.
     * @param {CalibrationState} calibrationState The current calibration baseline and states.
     * @param {Signals} signals High-level semantic signals (emotions, blink status).
     * @returns {{ status: AttentionStatus, score: number, details: AttentionDetails }} The analyzed result.
     */
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

        // ==============================
        // HARD OVERRIDES
        // ==============================
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

        // ==============================
        // SOFT SCORE CALCULATION
        // ==============================
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

            // Detect high variance (jittery gaze without losing focus entirely)
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
            details.penalties.gaze  * this.config.weights.gaze +
            details.penalties.perclos * this.config.weights.perclos + 
            details.penalties.yawn * this.config.weights.yawn
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

    /**
     * Bypasses the debouncer to apply critical statuses immediately.
     *
     * @private
     * @param {AttentionStatus} status The status to force.
     */
    private applyStatusImmediately(status: AttentionStatus){
        this.status = status
        this.targetStatus = status
        this.statusHoldStartTime = null
    }

    /**
     * Converts the score into a categorical status, utilizing a time-based 
     * debounce to prevent status flickering (e.g., dropping to Distracted for a millisecond).
     *
     * @private
     * @param {boolean} isADHD True if high variance/fidgeting was detected.
     */
    private updateStatus(isADHD: boolean){
        let calculatedTarget: AttentionStatus = "NORMAL"
        
        if (this.score >= 0.70){
            calculatedTarget = isADHD ? "ADHD" : "NORMAL"
        } else if (this.score > 0.45) {
            calculatedTarget = "DISTRACTED"
        } else if (this.score > 0.25) {
            calculatedTarget = "DROWSY"
        } else {
            // Note: If FaceLost occurs, score drops to 0, which transitions to MICROSLEEP here.
            // This could create an artifact transition chain (MICROSLEEP -> DROWSY -> NORMAL) upon recovery.
            calculatedTarget = "MICROSLEEP" 
        }

        const now = performance.now()
        if (calculatedTarget === this.targetStatus){
            // If the target has been held for the requisite 'timeToConfirm', lock it in
            if (this.statusHoldStartTime !== null && (now - this.statusHoldStartTime >= this.config.timeToConfirm)){
                this.status = this.targetStatus
            }
        } else {
            // Target changed, start a new confirmation timer
            this.targetStatus = calculatedTarget
            this.statusHoldStartTime = now
        }
    }

    /** Resets the engine's histories and scores to their default state. */
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