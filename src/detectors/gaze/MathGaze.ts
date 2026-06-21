import { weighted_average, clamp, deg2radScalar, rad2degScalar } from "@/utils/helpers"
import { BaseGazeDetector } from "@detectors/gaze/BaseGaze"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import type { Vector3D } from "@/types"

/**
 * Mathematical lightweight, neural-network-free gaze detector strategy.
 * 
 * Calculates gaze direction using pure geometry by evaluating the position 
 * of the iris relative to the eye corners.
 * 
 * @export
 * @class MathGazeDetector
 * @extends {BaseGazeDetector}
 */
export class MathGazeDetector extends BaseGazeDetector {
    private sx: number
    private sy: number
    
    /**
     * Creates an instance of MathGazeDetector.
     *
     * @constructor
     * @param {number} [sensitivityX=1.3] Horizontal gaze multiplier to amplify eye movements. 
     * @param {number} [sensitivityY=2] Vertical gaze multiplier to amplify eye movements.
     */
    constructor(sensitivityX=1.3, sensitivityY=2){
        super()
        this.sx = sensitivityX
        this.sy = sensitivityY
    }

    async load(): Promise<void> { }

    async predict(landmarks: NormalizedLandmark[]): Promise<Vector3D | null> {
        if (!landmarks || landmarks.length < 478) return null
        
        const [yawRad, pitchRad] = this.computeYawPitchFromLandmarks(landmarks)
        
        const gx = Math.sin(yawRad)
        const gy = -Math.sin(pitchRad)
        const gz = Math.cos(yawRad) * Math.cos(pitchRad)

        const len = Math.hypot(gx, gy, gz)
        if (len === 0) return [0, 0, 0]

        return [gx/len, gy/len, gz/len] 
    }

    /**
     * Uses the geometric center of the eye and the iris position to determine yaw and pitch.
     *
     * @private
     * @param {NormalizedLandmark[]} landmarks The full array of facial landmarks.
     * @returns {[number, number]} A tuple containing the calculated [yaw, pitch] in radians.
     */
    private computeYawPitchFromLandmarks(landmarks: NormalizedLandmark[]): [number, number] {
        const eyesData = [
            {'iris': landmarks[468]!, 'o': landmarks[33]!, 'i': landmarks[133]!},
            {'iris': landmarks[473]!, 'o': landmarks[263]!, 'i': landmarks[362]!}
        ]
        
        const yawAngles: number[] = []
        const pitchAngles: number[] = []
        const weights: number[] = []
        
        for (const eye of eyesData) {
            const dxEye = eye.o.x - eye.i.x
            const dyEye = eye.o.y - eye.i.y
            const dzEye = eye.o.z - eye.i.z
            
            const eyeWidth3d = Math.sqrt(dxEye*dxEye + dyEye*dyEye + dzEye*dzEye)

            if (eyeWidth3d === 0) continue

            const cx = (eye.i.x + eye.o.x) / 2
            const cy = (eye.i.y + eye.o.y) / 2
            
            const xVec = eye["iris"].x - cx
            const yVec = eye["iris"].y - cy
            
            const ratioX = (xVec / (eyeWidth3d / 2)) * this.sx
            const ratioY = (yVec / (eyeWidth3d / 2)) * this.sy

            const yaw = rad2degScalar(Math.asin(clamp(ratioX, -1, 1)))
            const pitch = rad2degScalar(Math.asin(clamp(ratioY, -1, 1)))
            
            yawAngles.push(yaw)
            pitchAngles.push(pitch)
            weights.push(Math.abs(dxEye))
        };

        const yawDeg = weighted_average(yawAngles, weights)
        const pitchDeg = weighted_average(pitchAngles, weights)
        
        return [deg2radScalar(yawDeg), deg2radScalar(pitchDeg)]
    }

    destroy(): void { }
}