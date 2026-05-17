import { HistoryBuffer } from "@/core/history/History"
import type { TrackerSnapshot } from "@/types"
import { median, clamp, rad2degScalar } from "@/utils/helpers"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

export class CalibrationManager {
    private gatheringSize: number = 2

    private recentAreas = new HistoryBuffer(this.gatheringSize)
    private recentYaws = new HistoryBuffer(this.gatheringSize)
    private recentPitches = new HistoryBuffer(this.gatheringSize)
    private recentCx = new HistoryBuffer(this.gatheringSize)
    private recentCy = new HistoryBuffer(this.gatheringSize)
    
    private baseArea = 0
    private baseYaw = 0
    private basePitch = 0
    private baseCx = 0
    private baseCy = 0

    isCalibrated = false
    private anomalyAccumulatorMs = 0
    private lastUpdateTime = 0
    private readonly MAX_ANOMALY_MS = 5000

    constructor(){
    }

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
        this.recentYaws.push(yaw)
        this.recentPitches.push(pitch)
        this.recentCx.push(cx)
        this.recentCy.push(cy)

        if (!this.isCalibrated){
            if (this.recentAreas.isFull && this.recentAreas.length >= 10){ 
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
            this.anomalyAccumulatorMs += dt
        } else {
            this.anomalyAccumulatorMs = Math.max(0, this.anomalyAccumulatorMs - dt)
        }

        if (this.anomalyAccumulatorMs >= this.MAX_ANOMALY_MS){
            console.log("Recalibration triggered")
            this.applyBaseline()
            this.anomalyAccumulatorMs = 0
        }
    }

    private applyBaseline(){
        this.baseArea = median(this.recentAreas.values())
        this.baseYaw = median(this.recentYaws.values())
        this.basePitch = median(this.recentPitches.values())
        this.baseCx = median(this.recentCx.values())
        this.baseCy = median(this.recentCy.values())

        this.isCalibrated = true
        
        console.log("New baseline:",{
            area: this.baseArea,
            yaw: this.baseYaw,
            pitch: this.basePitch,
            center: { x: this.baseCx, y: this.baseCy}
        })
    }
    
    getState(){
        return {
            yaw: this.baseYaw,
            pitch: this.basePitch,
            cx: this.baseCx,
            cy: this.baseCy,
            area: this.baseArea,
            isCalibrated: this.isCalibrated 
        }
    }
}