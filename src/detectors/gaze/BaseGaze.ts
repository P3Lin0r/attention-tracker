import { type NormalizedLandmark } from "@mediapipe/tasks-vision"
import type { Vector3D } from "@/types"

export type GazeModelType = "MATH" | "OPENVINO"

export abstract class BaseGazeDetector {
    abstract load(): Promise<void>
    abstract predict(
        landmarks: NormalizedLandmark[],
        frame?: TexImageSource | null,
        head_angles?: Vector3D
    ): Promise<Vector3D | null>
}

export type GazeStrategies = Record<GazeModelType, BaseGazeDetector>