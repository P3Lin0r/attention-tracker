import type {NormalizedLandmark} from "@mediapipe/tasks-vision"

/**
 * Abstract base class for calculating aspect ratios from facial landmarks.
 * Extracted to share Euclidean math and indexing logic across specific feature trackers.
 * 
 * @abstract
 * @class AspectRatioTracker
 */
abstract class AspectRatioTracker{
    /**
     * Calculates the aspect ratio based on a specific set of landmark indices.
     * Calculates the ratio of the sum of vertical distances to the horizontal distance.
     * 
     * @protected
     * @param {readonly NormalizedLandmark[]} lm The full array of facial landmarks.
     * @param {readonly number[]} idx The specific indices representing the future polygon (e.g., eye contour).
     * @returns {number} The calculated aspect ratio.
     * @throws If the provided index array contains fewer than 2 elements.
     */
    protected calculateAR(lm: readonly NormalizedLandmark[], idx: readonly number[]): number {
        const n = idx.length
        if (n < 2) {
            throw new Error("idx must contain at least 2 elements");
        }

        const halfN = Math.trunc(n / 2)

        const horizontalP1 = lm[idx[0]];
        const horizontalP2 = lm[idx[halfN]];
        
        const horizontalDist = AspectRatioTracker.euclideanDistance(horizontalP1, horizontalP2);

        let verticalSum = 0;
        for (let i = 1; i < Math.floor(n / 2); i++){
            const top = lm[idx[i]]
            const bot = lm[idx[n-i]]
            verticalSum += AspectRatioTracker.euclideanDistance(top, bot)
        }

        return verticalSum / (2.0 * horizontalDist)
    }

    /**
     * Computes the 3D Euclidean distance between two landmarks.
     *
     * @protected
     * @static
     * @param {NormalizedLandmark} f The first landmark.
     * @param {NormalizedLandmark} s The second landmark.
     * @returns {number} The Euclidean distance. 
     */
    protected static euclideanDistance(f: NormalizedLandmark, s: NormalizedLandmark): number{
        const dx = f.x - s.x;
        const dy = f.y - s.y;
        const dz = f.z - s.z;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
}

/**
 * Tracks the Eye Aspect Ratio (EAR) for both eyes to detect blinks and closure.
 *
 * @export
 * @class EyeAspectRatioTracker
 * @extends {AspectRatioTracker}
 */
export class EyeAspectRatioTracker extends AspectRatioTracker{
    private static readonly LEFT_EYE = [362, 385, 387, 263, 373, 380]
    private static readonly RIGHT_EYE = [33, 160, 158, 133, 153, 144]

    /**
     * Calculates the EAR for both the left and right eyes.
     *
     * @param {NormalizedLandmark[]} face_landmarks The normalized landmarks of a detected face.
     * @returns {{ left: number, right: number }} An object containing the EAR values for both eyes.
     */
    calculate(face_landmarks: NormalizedLandmark[]): { left: number, right: number } {
        const left = this.calculateAR(face_landmarks, EyeAspectRatioTracker.LEFT_EYE)
        const right = this.calculateAR(face_landmarks, EyeAspectRatioTracker.RIGHT_EYE)

        return {left, right}
    }
}

/**
 * Tracks the Mouth Aspect Ratio (MAR) to detect yawning or speaking.
 *
 * @export
 * @class MouthAspectRatioTracker
 * @extends {AspectRatioTracker}
 */
export class MouthAspectRatioTracker extends AspectRatioTracker{
    private static readonly MOUTH = [61, 39, 0, 269, 291, 405, 17, 191]

    /**
     * Calculates the MAR.
     *
     * @param {NormalizedLandmark[]} face_landmarks The normalized landmarks of a detected face.
     * @returns {number} The Mouth Aspect Ratio.
     */
    calculate(face_landmarks: NormalizedLandmark[]): number {
        return this.calculateAR(face_landmarks, MouthAspectRatioTracker.MOUTH)
    }
}