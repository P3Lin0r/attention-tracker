import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import type { BlinkStatus } from "./detectors/BlinkDetector"
import type { YawnStatus } from "./detectors/YawnDetector"
import type { EmotionStatus } from "./detectors/EmotionsDetector"

export type GazeStrategy = "auto" | "openvino" | "math"

export type Vector3D = [number, number, number]

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

export type Signals = {
    emotion: EmotionStatus
    blinkStatus: BlinkStatus
    yawnStatus: YawnStatus
    perclos: number
}

export type AttentionStatus = "DISTRACTED" | "NORMAL" | "DROWSY" | "MICROSLEEP" | "ADHD"

export type AttentionDetails = {
    penalties: {
        gaze: number;
        perclos: number;
        yawn: number;
        emotionModifier: number;
    };
    isADHD: boolean;
    calibration: {
        isCalibrated: boolean;
    };
    direction: {
        headAngles?: Vector3D;
        gazeVector?: Vector3D;
    }
    signals: Signals;
}

export type AttentionResult = {
    status: AttentionStatus;
    score: number;
    details: AttentionDetails;
}