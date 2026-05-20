import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import type { BlinkStatus } from "@detectors/BlinkDetector"
import type { YawnStatus } from "@detectors/YawnDetector"

export type GazeStrategy = "auto" | "openvino" | "math"
export type Vector3D = [number, number, number]
export type AttentionStatus = "DISTRACTED" | "NORMAL" | "DROWSY" | "MICROSLEEP" | "ADHD"
export type EmotionStatus = "NEUTRAL" | "HAPPY" | "SAD" | "THINKING" | "FOCUSED"

export interface MonitorConfig {
    worker?: boolean
    backend?: "GPU" | "CPU"
    gazeStrategy?: GazeStrategy
}

export type TrackerSnapshot = {
    landmarks: NormalizedLandmark[] | null
    gaze?: Vector3D
    headAngles?: Vector3D
}

export type CalibrationState = {
    yaw: number;
    pitch: number;
    cx: number;
    cy: number;
    area: number;
    isCalibrated: boolean;
}

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

export type AttentionResult = {
    status: AttentionStatus;
    score: number;
    details: AttentionDetails;
    signals: Signals;
    snapshot: TrackerSnapshot;
    calibration: CalibrationState;
}