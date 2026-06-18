import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

import type { AttentionMonitor } from "./api/AttentionMonitor" 
import type { BlinkDetector } from "./detectors/BlinkDetector"
import type { YawnDetector } from "./detectors/YawnDetector"
import type { EmotionsDetector } from "./detectors/EmotionsDetector"
import type { CalibrationManager } from "./analytics/CalibrationManager"
import type { AttentionEngine } from "./analytics/AttentionEngine"
import { DEFAULT_CONFIG } from "@config/defaults"

/** Represents a point or direction in 3D space [x, y, z]. */
export type Vector3D = [number, number, number]

/** The high-level semantic status of the user's attention. */
export type AttentionStatus = "DISTRACTED" | "NORMAL" | "DROWSY" | "MICROSLEEP" | "FATIGUED" | "ADHD" | "NOT_DETECTED"

/** Detected facial emotion. */
export type EmotionStatus = "NEUTRAL" | "HAPPY" | "SAD" | "THINKING" | "FOCUSED"

/** Represents the state of the eyes. */
export type BlinkStatus = "NORMAL" | "DROWSY" | "MICROSLEEP"

/** Represents the state of mouth opening. */
export type YawnStatus = "NORMAL" | "YAWNING"

/** Raw geometric snapshot of a single frame. */
export type TrackerSnapshot = {
    isFaceLost: boolean
    landmarks: NormalizedLandmark[] | null
    gaze?: Vector3D
    headAngles?: Vector3D
}

/** The established user calibration baseline. */
export type CalibrationState = {
    /** Calibrated neutral horizontal gaze angle (in degrees). */
    gazeYaw: number
    /** Calibrated neutral vertical gaze angle (in degrees). */
    gazePitch: number
    /** Calibrated neutral horizontal head angle (in degrees). */
    headYaw: number
    /** Calibrated neutral vertical head angle (in degrees). */
    headPitch: number
    /** Calibrated X coordinate of the face bounding box center. */
    cx: number
    /** Calibrated Y coordinate of the face bounding box center. */
    cy: number
    /** Calibrated baseline face area (used for distance estimation). */
    area: number
    /** The standard deviation of gaze angles during the calibration period (natural eye jitter). */
    baseGazeStd: number
    /** The standard deviation of head angles during the calibration period (natural head sway). */
    baseHeadStd: number
    /** Indicates whether the baseline has been successfully established. */
    isCalibrated: boolean
    
}

/** Processed semantic features obtained from tracking. */
export type Signals = {
    emotion: EmotionStatus
    blink: {
        status: BlinkStatus
        count: number
        perclos: number
        threshold: number
    }
    yawn: {
        status: YawnStatus
        count: number
        threshold: number
    }
    raw: {
        ear: number
        mar: number
    }
    performance: {
        latency: number
        isDowngraded: boolean
        activeModel: "OPENVINO" | "MATH"
    }
}

/** Explanatory context detailing why a certain attention score was assigned. */
export type AttentionDetails = {
    penalties: {
        gaze: number;
        perclos: number;
        yawn: number;
        emotionModifier: number;
    };
    isADHD: boolean;
    direction: {
        headAngles?: Vector3D;
        gazeVector?: Vector3D;
    }
}

/** The final output payload. */
export type AttentionResult = {
    status: AttentionStatus;
    score: number;
    details: AttentionDetails;
    signals: Signals;
    snapshot: TrackerSnapshot;
    calibration: CalibrationState;
}


// ===================================
// CONFIGURATION INTERFACES
// ===================================

/**
 * Configuration parameters for the blink detection logic [{@link BlinkDetector}]
 *
 * @export
 * @interface BlinkConfig
 */
export interface BlinkConfig {
    /**
     * Multiplier applied to the median resting EAR to determine the dynamic closure threshold. 
     * @default 0.6
     */
    thresholdSensitivity: number
    /** 
     * Maximum duration (in seconds) for a closure to be counted as a normal blink. 
     * @default 0.4 
     */
    blinkDurationLimit: number
    /** 
     * Minimum duration (in seconds) of continuous eye closure to trigger a MICROSLEEP status. 
     * @default 2
     */
    microsleepLimit: number
    /** 
     * The threshold (0.0 to 1.0) of PERCLOS (Percentage of Eye Closure) required to trigger a DROWSY status. 
     * @default 0.20
     */
    perclosDrowsyThreshold: number
    /** 
     * The duration (in seconds) of the EAR history buffer used to calculate the dynamic resting baseline. 
     * A longer window provides a more stable median but adapts slower to changes in head posture or distance.
     * @default 5 
     */
    earTimeWindow: number
    /**
     * The duration (in seconds) of the sliding window used to compute the PERCLOS (Percentage of Eye Closure) score. 
     * Defines how far back in time the detector looks to evaluate the user's drowsiness level.
     * @default 60
     */
    perclosTimeWindow: number
}

/**
 * Configuration parameters for the yawn detection logic [{@link YawnDetector}]
 *
 * @export
 * @interface YawnConfig
 */
export interface YawnConfig {
    /** 
     * Multiplier applied to the median resting MAR to determine the dynamic open-mouth threshold. 
     * @default 2.2
     */
    thresholdSensitivity: number
    /** 
     * Minimum duration (in seconds) of continuous mouth opening to be classified as a yawn. 
     * @default 1.4
     */
    minYawnDuration: number
    /** 
     * Maximum duration (in seconds) to consider a movement a yawn (filters out continuous talking/shouting).
     * @default 6
     */
    maxYawnDuration: number
    /**
     * The duration (in seconds) of the MAR history buffer to compute the median resting mouth state. 
     * This baseline is crucial for adapting the yawn threshold dynamically, compensating for distance and micro-movements.
     * @default 10 
     */
    marTimeWindow: number
}

/**
 * Configuration parameters for the emotions detection logic [{@link EmotionsDetector}]
 *
 * @export
 * @interface EmotionConfig
 */
export interface EmotionConfig {
    /** 
     * Number of {@link EmotionStatus} values collected from recent frames to buffer for emotion smoothing. 
     * @default 5
     */
    historyLimit: number
}

/**
 * Configuration parameters for the calibration logic [{@link CalibrationManager}]
 *
 * @export
 * @interface CalibrationConfig
 */
export interface CalibrationConfig {
    /** 
     * Time window (in seconds) to gather data before calculating a median baseline. 
     * @default 2
     */
    gatheringSize: number
    /** 
     * Maximum allowed time (in milliseconds) the user can stay in an anomalous state before a forced recalibration triggers. 
     * @default 5000
     */
    maxAnomalyMs: number
}

/**
 * Configuration parameters for the attention engine logic [{@link AttentionEngine}]
 *
 * @export
 * @interface EngineConfig
 */
export interface EngineConfig {
    /** 
     * Time (in milliseconds) a new status must be maintained before it is officially applied (debouncing). 
     * @default 500
     */
    timeToConfirm: number
    /**
     * Time window (in seconds) to calculate the standard deviation for horizontal movements (yaw) 
     * for both gaze and head posture.
     * @default 4
     */
    yawDiffTimeWindow: number
    /**
     * Time window (in seconds) to calculate the standard deviation for vertical movements (pitch) 
     * for both gaze and head posture.
     * @default 4
     */
    pitchDiffTimeWindow: number

    /** Configuration for dynamic gaze penalization based on deviation from the calibrated baseline. */
    gazeDynamics: {
        /** 
         * Degrees of horizontal deviation allowed before applying a penalty. 
         * @default 15 
         */
        yawDeadzone: number
        /** 
         * Degrees of vertical deviation allowed before applying a penalty. 
         * @default 10
         */
        pitchDeadzone: number
        /** 
         * Scaling divider to determine the severity of the horizontal penalty once the deadzone is crossed. 
         * @remarks
         * **Note:** Because this value acts as a divisor, there is an inverse relationship. 
         * A **lower** value results in a **harsher** penalty, while a **higher** value results in a **smaller** penalty.
         * @default 25 
         */
        yawScale: number
        /** 
         * Scaling divider to determine the severity of the vertical penalty once the deadzone is crossed. 
         * @remarks
         * **Note:** Because this value acts as a divisor, there is an inverse relationship. 
         * A **lower** value results in a **harsher** penalty, while a **higher** value results in a **smaller** penalty.
         * @default 20
         */
        pitchScale: number
    }

    /** Configuration for detecting hyperactive/fidgeting behavior (ADHD state). */
    adhdDynamics: {
        /** Weights determining how much head vs. gaze variance contributes to the ADHD score. */
        adhdWeights: {
            /** @default 0.4 */
            head: number
            /** @default 0.6 */
            gaze: number
        }
        /** 
         * Multiplier applied to the baseline standard deviation to trigger an ADHD status. 
         * @default 3.5
         */
        adhdStdMultiplier: number
        /** 
         * The absolute minimum standard deviation required to trigger an ADHD status, preventing false positives for extremely still users. 
         * @default 5 
         */
        minStdThreshold: number
    }
    /** Configurable score boundaries that trigger status changes. */
    thresholds: {
        /** 
         * The minimum attention score (0.0 - 1.0) required to maintain a `NORMAL` (or `ADHD`) status.
         * Dropping below this cutoff transitions the user to `DISTRACTED` or `FATIGUED`.
         * @default 0.70
         */
        normalScoreCutoff: number
    }
    /** Dynamic multipliers and fixed penalty values based on specific detected behaviors or emotions. */
    modifiers: {
        /** 
         * The absolute penalty value added to the total penalty calculation while an active yawn is detected.
         * @default 0.4
         */
        yawnPenalty: number
        /** 
         * Penalty multiplier (0.0 to 1.0) applied when the user's emotion is `THINKING`.
         * Usually < 1.0 to forgive slight gaze deviations during cognitive load.
         * If the value is 0.3, this means that all penalties will be reduced by 70%.
         * @default 0.6
         */
        emotionThinking: number
        /**
         * Penalty multiplier (0.0 to 1.0) applied when the user's emotion is `FOCUSED`. 
         * Usually < 1.0 to significantly reduce penalties when the user is deep in work.
         * If the value is 0.3, this means that all penalties will be reduced by 70%.
         * @default 0.4
         */
        emotionFocused: number
    }

    /** 
     * Penalty weights applied to the "soft" attention score calculation.
     * Modifies how perclos(percentage of eye closure), yawns, and gaze variance affect the final score.
     * @remarks
     * These weights only dictate gradual score drops. Critical status changes 
     * (e.g., `MICROSLEEP` or high `DROWSY` levels) act as **hard overrides**, 
     * bypassing these weights to immediately plummet the score to ensure safety.
     */
    weights: {
        /** @default 0.5 */
        gaze: number
        /** @default 0.35 */
        perclos: number
        /** @default 0.15 */
        yawn: number
    }
}

/**
 * File paths or URLs to required WebAssembly files and Neural Network models.
 *
 * @export
 * @interface AssetPaths
 */
export interface AssetPaths {
    wasm: {
        /** Path to MediaPipe vision tasks WASM directory. */
        mediapipe: string
        /** Path to ONNX Runtime Web WASM directory. */
        onnx: string
    }
    models: {
        /** Path to the MediaPipe face landmarker `.task` file. */
        face: string
        /** Path to the ONNX emotion classification model. */
        emotion: string
        /** Path to the OpenVINO ONNX `gaze-estimation-adas-0002.onnx` gaze estimation model. */
        gazeOV: string
    }
}

/** The hardware backend used for inference */
export type deviceOptions = "CPU" | "GPU"
/** Defines the strategy used to compute the gaze vector. */
export type GazeStrategy = "auto" | "openvino" | "math"

/**
 * Global configuration for the {@link AttentionMonitor}.
 * Defines data processing settings, resources used, and monitoring strategies.
 * 
 * The default values of config is in {@link DEFAULT_CONFIG}
 * @export
 * @interface MonitorConfig
 * @example
 * const config: MonitorConfig = {
 *    worker: true,
 *    backend: 'GPU',
 *    gazeStrategy: 'auto',
 *    // ... other fields
 * }
 */
export interface MonitorConfig {
    /**
     * Paths to required WASM binaries and models. 
     * See {@link AssetPaths} for details.
     */
    assets: AssetPaths

    /**
     * If true, runs the tracking pipeline off the main thread in a Web Worker. 
     * Highly recommended to prevent UI blocking.
     * @default true
     */
    worker: boolean

    /**
     * The hardware backend for ONNX/MediaPipe inference.
     * See {@link deviceOptions}.
     * @default "GPU" 
     */
    backend: deviceOptions

    /** 
     * The strategy used to compute the gaze vector. 
     * See {@link GazeStrategy}.
     * @default "auto"
     */
    gazeStrategy: GazeStrategy

    /** Module-specific tuning parameters and thresholds. */
    settings: {
        /**
         * Configuration for blink and microsleep detection.
         * See {@link BlinkConfig} for available thresholds and time windows.
         */
        blink: BlinkConfig

        /**
         * Configuration for yawn detection and MAR (Mouth Aspect Ratio) processing.
         * See {@link YawnConfig}.
         */
        yawn: YawnConfig

        /**
         * Configuration for emotion classification smoothing.
         * See {@link EmotionConfig}.
         */
        emotion: EmotionConfig

        /**
         * Configuration for establishing the user's neutral baseline.
         * See {@link CalibrationConfig}.
         */
        calibration: CalibrationConfig

        /**
         * Configuration for the core attention scoring engine and penalty weights.
         * See {@link EngineConfig}.
         */
        engine: EngineConfig
    }
}