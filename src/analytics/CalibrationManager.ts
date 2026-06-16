import { HistoryBuffer } from "@/core/history/History"
import type { CalibrationConfig, CalibrationState, TrackerSnapshot } from "@/types"
import { clamp, rad2degScalar } from "@/utils/helpers"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

/**
 * Manages the dynamic baseline calibration of the user's face and gaze position.
 * It tracks physical distance (via face area), head center, and gaze angles.
 * Triggers recalibration if an anomaly (like the user leaning back significantly) persists.
 *
 * @export
 * @class CalibrationManager
 */
export class CalibrationManager {
    private recentAreas: HistoryBuffer
    private recentGazeYaws: HistoryBuffer
    private recentGazePitches: HistoryBuffer
    private recentHeadYaws: HistoryBuffer
    private recentHeadPitches: HistoryBuffer
    
    private recentCx: HistoryBuffer
    private recentCy: HistoryBuffer
    
    private baseArea = 0
    private baseGazeYaw = 0
    private baseGazePitch = 0
    private baseHeadYaw = 0
    private baseHeadPitch = 0
    private baseCx = 0
    private baseCy = 0
    
    private baseGazeStd = 0
    private baseHeadStd = 0
    
    isCalibrated = false
    private anomalyAccumulatorMs = 0
    private lastUpdateTime = 0
    
    /**
     * Creates an instance of CalibrationManager.
     *
     * @constructor
     * @param {CalibrationConfig} config Configuration thresholds and gathering sizes.
     */
    constructor(private config: CalibrationConfig) {
        this.recentAreas = new HistoryBuffer(this.config.gatheringSize)
        this.recentGazeYaws = new HistoryBuffer(this.config.gatheringSize)
        this.recentGazePitches = new HistoryBuffer(this.config.gatheringSize)
        this.recentHeadYaws = new HistoryBuffer(this.config.gatheringSize)
        this.recentHeadPitches = new HistoryBuffer(this.config.gatheringSize)
        this.recentCx = new HistoryBuffer(this.config.gatheringSize)
        this.recentCy = new HistoryBuffer(this.config.gatheringSize)
    }

    /**
     * Description placeholder Process a new tracker data to either build the initial calibration baseline or 
     * track anomalies that require a recalibration event.
     * 
     * @remarks Implements a "leaky bucket" algorithm for anomaly detection. If the face shifts significantly,
     * time is added to `anomalyAccumulatorMs`. If the face returns to normal, the accumulator cools down.
     * @param {TrackerSnapshot} data The current frame's tracking data.
     */
    update(data: TrackerSnapshot){
        if (!data.landmarks || !data.gaze) return

        const lm = data.landmarks

        const r = lm[234]
        const l = lm[454]
        const t = lm[10]
        const b = lm[152]
        
        if (!r || !l || !t || !b) return

        const dist = (a: NormalizedLandmark, b: NormalizedLandmark) => 
            Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

        const width = dist(r, l)
        const height = dist(t, b)
        const area = width * height

        const [gx, gy, gz] = data.gaze
        const yaw = rad2degScalar(Math.atan2(gx, Math.abs(gz) + 1e-6))
        const pitch = rad2degScalar(Math.asin(clamp(-gy, -1, 1)))

        const nose = lm[1]
        if (!nose) return
        const cx = nose.x
        const cy = nose.y

        this.recentAreas.push(area)
        this.recentGazeYaws.push(yaw)
        this.recentGazePitches.push(pitch)
        this.recentCx.push(cx)
        this.recentCy.push(cy)

        if (data.headAngles){
            this.recentHeadYaws.push(data.headAngles[0])
            this.recentHeadPitches.push(data.headAngles[1])
        }

        if (!this.isCalibrated){
            if (this.recentAreas.isFull) {
                this.applyBaseline()
            }
            return
        }
        
        const areaDiff = Math.abs(area - this.baseArea) / this.baseArea
        const centerShift = Math.hypot(cx - this.baseCx, cy - this.baseCy)
        
        const isAnomaly = areaDiff > 0.15 || centerShift > 0.1

        const now = performance.now()
        const dt = this.lastUpdateTime === 0 ? 0 : now - this.lastUpdateTime
        this.lastUpdateTime = now

        if (isAnomaly){
            // Accumulate milliseconds spent in an anomalous state
            this.anomalyAccumulatorMs += dt
        } else {
            // Gradually "cool down" the timer if the user returns to baseline
            this.anomalyAccumulatorMs = Math.max(0, this.anomalyAccumulatorMs - dt)
        }

        if (this.anomalyAccumulatorMs >= this.config.maxAnomalyMs){
            this.applyBaseline()
            this.anomalyAccumulatorMs = 0
        }
    }
    
    /**
     * Calculates and sets the new baseline using the median of the history buffers.
     * Using the median prevents outliers (like a sudden head jerk) from skewing the baseline.
     * @private
     */
    private applyBaseline(){
        this.baseArea = this.recentAreas.median()
        this.baseGazeYaw = this.recentGazeYaws.median()
        this.baseGazePitch = this.recentGazePitches.median()
        this.baseHeadYaw = this.recentGazeYaws.median() 
        this.baseHeadPitch = this.recentGazePitches.median() 
        this.baseCx = this.recentCx.median()
        this.baseCy = this.recentCy.median()

        this.baseGazeStd = this.recentGazeYaws.std() + this.recentGazePitches.std()
        this.baseHeadStd = this.recentHeadYaws.std() + this.recentHeadPitches.std()

        this.isCalibrated = true
    }

    /** Clears all history buffers and calibration states. */
    reset(): void {
        this.recentAreas.clear()
        this.recentGazeYaws.clear()
        this.recentGazePitches.clear()
        this.recentHeadYaws.clear()
        this.recentHeadPitches.clear()
        this.recentCx.clear()
        this.recentCy.clear()
        
        this.isCalibrated = false
        this.anomalyAccumulatorMs = 0
        this.lastUpdateTime = 0

        this.baseGazeStd = 0
        this.baseHeadStd = 0
    }
    
    getState(): CalibrationState{
        return {
            gazeYaw: this.baseGazeYaw,
            gazePitch: this.baseGazePitch,
            headYaw: this.baseHeadYaw,
            headPitch: this.baseHeadPitch,
            cx: this.baseCx,
            cy: this.baseCy,
            area: this.baseArea,
            isCalibrated: this.isCalibrated,
            baseGazeStd: this.baseGazeStd,
            baseHeadStd: this.baseHeadStd
        }
    }
}