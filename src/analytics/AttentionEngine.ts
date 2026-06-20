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
 * Aggregates all tracking and calibration data to an `attention score (0 to 1)` and determines 
 * the user's high-level state **{@link AttentionStatus}**.
 * Combines gaze variance, blinks (PERCLOS), yawning, and emotional states to calculate penalties.
 * 
 * @export
 * @class AttentionEngine
 */
export class AttentionEngine {
    private gazeYawDiffHistory: HistoryBuffer
    private gazePitchDiffHistory: HistoryBuffer
    private headYawDiffHistory: HistoryBuffer
    private headPitchDiffHistory: HistoryBuffer

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
        this.gazeYawDiffHistory = new HistoryBuffer(this.config.yawDiffTimeWindow)
        this.gazePitchDiffHistory = new HistoryBuffer(this.config.pitchDiffTimeWindow) 
        this.headYawDiffHistory = new HistoryBuffer(this.config.yawDiffTimeWindow)
        this.headPitchDiffHistory = new HistoryBuffer(this.config.pitchDiffTimeWindow) 
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
            const gazeYaw = rad2degScalar(Math.atan2(gx, Math.abs(gz) + 1e-6))
            const gazePitch = rad2degScalar(Math.asin(clamp(-gy, -1, 1)))
            const [headYaw, headPitch, _roll] = snapshot.headAngles || [0, 0, 0]

            const gazeYawDiff = gazeYaw - calibrationState.gazeYaw
            const gazePitchDiff = gazePitch - calibrationState.gazePitch
            this.gazeYawDiffHistory.push(gazeYawDiff)
            this.gazePitchDiffHistory.push(gazePitchDiff)
            
            const headYawDiff = headYaw - calibrationState.headYaw
            const headPitchDiff = headPitch - calibrationState.headPitch
            this.headYawDiffHistory.push(headYawDiff)
            this.headPitchDiffHistory.push(headPitchDiff)

            const {
                yawDeadzone,
                pitchDeadzone,
                yawScale,
                pitchScale,
            } = this.config.gazeDynamics

            const yawPenalty = Math.max(0, (Math.abs(gazeYawDiff) - yawDeadzone) / yawScale)
            const pitchPenalty = Math.max(0, (Math.abs(gazePitchDiff) - pitchDeadzone) / pitchScale)
            details.penalties.gaze = Math.min(1, yawPenalty + pitchPenalty)

            // Detect high variance (jittery gaze and head without losing focus entirely)
            if (this.gazeYawDiffHistory.isFull && this.headYawDiffHistory.isFull){
                const gazeStd = this.gazeYawDiffHistory.std() + this.gazePitchDiffHistory.std()
                const headStd = this.headYawDiffHistory.std() + this.headPitchDiffHistory.std()

                const {
                    adhdWeights,
                    adhdStdMultiplier,
                    minStdThreshold
                } = this.config.adhdDynamics

                // Current weighted combined fidgeting level
                const combinedStd = (headStd * adhdWeights.head) + (gazeStd * adhdWeights.gaze)
                const baseCombinedStd = (calibrationState.baseHeadStd * adhdWeights.head) +
                    (calibrationState.baseGazeStd * adhdWeights.gaze)
                
                const personalStdThreshold = Math.max(
                    minStdThreshold,
                    baseCombinedStd * adhdStdMultiplier
                )

                if (combinedStd > personalStdThreshold){
                    details.isADHD = true
                }
            }
        }

        details.penalties.yawn = signals.yawn.status == "YAWNING" ? this.config.modifiers.yawnPenalty : 0
        details.penalties.perclos = signals.blink.perclos

        const emotion = signals.emotion
        if (emotion == "FOCUSED"){
            details.penalties.emotionModifier = this.config.modifiers.emotionFocused
        }
        else if (emotion == "THINKING"){
            details.penalties.emotionModifier = this.config.modifiers.emotionThinking
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

        this.updateStatus(details)
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
     * @param {AttentionDetails} details Details Context details to determine why the score is low.
     */
    private updateStatus(details: AttentionDetails){
        let calculatedTarget: AttentionStatus = "NORMAL"
        const gazeImpact = details.penalties.gaze * this.config.weights.gaze
        const fatigueImpact = (details.penalties.perclos * this.config.weights.perclos) + 
            (details.penalties.yawn * this.config.weights.yawn)
        
        if (this.score >= this.config.thresholds.normalScoreCutoff){
            calculatedTarget = details.isADHD ? "ADHD" : "NORMAL"
        } else {
            if (fatigueImpact > gazeImpact) { 
                calculatedTarget = "FATIGUED"
            } else {
                calculatedTarget = "DISTRACTED"
            }
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
        this.gazeYawDiffHistory.clear()
        this.gazePitchDiffHistory.clear()
        this.headYawDiffHistory.clear()
        this.headPitchDiffHistory.clear()
        
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