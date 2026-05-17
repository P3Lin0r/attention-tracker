import type {NormalizedLandmark} from "@mediapipe/tasks-vision"

abstract class AspectRatioTracker{
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

    protected static euclideanDistance(f: NormalizedLandmark, s: NormalizedLandmark): number{
        const dx = f.x - s.x;
        const dy = f.y - s.y;
        const dz = f.z - s.z;
        
        return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
}

export class EyeAspectRatioTracker extends AspectRatioTracker{
    private static readonly LEFT_EYE = [362, 385, 387, 263, 373, 380]
    private static readonly RIGHT_EYE = [33, 160, 158, 133, 153, 144]
    calculate(face_landmarks: NormalizedLandmark[]): { left: number, right: number } {
        const left = this.calculateAR(face_landmarks, EyeAspectRatioTracker.LEFT_EYE)
        const right = this.calculateAR(face_landmarks, EyeAspectRatioTracker.RIGHT_EYE)

        return {left, right}
    }
}

export class MouthAspectRatioTracker extends AspectRatioTracker{
    private static readonly MOUTH = [61, 39, 0, 269, 291, 405, 17, 191]
    calculate(face_landmarks: NormalizedLandmark[]): number {
        return this.calculateAR(face_landmarks, MouthAspectRatioTracker.MOUTH)
    }
}