import { type NormalizedLandmark } from "@mediapipe/tasks-vision"
import type { Vector3D } from "@/types"

/**
 * Defines the underlying technology/algorithm used for gaze detection.
 * @export
 */
export type GazeModelType = "MATH" | "OPENVINO"

/**
 * Abstract class that standardizes the interface for all gaze detectors.
 *
 * @export
 * @abstract
 * @class BaseGazeDetector
 */
export abstract class BaseGazeDetector {
    /**
     * Prepares the model or heuristic logic for execution.
     *
     * @abstract
     * @returns {Promise<void>} 
     */
    abstract load(): Promise<void>

    /**
     * Predicts the 3D gaze vector based on landmarks and optionally the raw frame.
     *
     * @abstract
     * @param {NormalizedLandmark[]} landmarks Array of normalized facial landmarks.
     * @param {?(TexImageSource | null)} [frame] The raw video/image frame (required for OpenVINO, ignored by Math).
     * @param {?Vector3D} [head_angles] Euler angles of the head (required for OpenVINO).
     * @returns {Promise<Vector3D | null>} A normalized 3D directional vector [x, y, z], or null if detection fails.
     */
    abstract predict(
        landmarks: NormalizedLandmark[],
        frame?: TexImageSource | null,
        head_angles?: Vector3D
    ): Promise<Vector3D | null>
}

/**
 * A mapping dictionary of available gaze detector strategies.
 * @export
 */
export type GazeStrategies = Record<GazeModelType, BaseGazeDetector>