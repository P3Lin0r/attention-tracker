import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

export type GazeStrategy = "auto" | "openvino" | "math"
export type Vector3D = [number, number, number]
export type AttentionStatus = "DISTRACTED" | "NORMAL" | "DROWSY" | "MICROSLEEP" | "ADHD" | "NOT_DETECTED"
export type EmotionStatus = "NEUTRAL" | "HAPPY" | "SAD" | "THINKING" | "FOCUSED"
export type BlinkStatus = "NORMAL" | "DROWSY" | "MICROSLEEP"
export type YawnStatus = "NORMAL" | "YAWNING"

export type TrackerSnapshot = {
    isFaceLost: boolean
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


// CONFIG
export interface BlinkConfig {
    thresholdSensitivity: number
    blinkDurationLimit: number
    microsleepLimit: number
    perclosDrowsyThreshold: number
    earTimeWindow: number
    perclosTimeWindow: number
}

export interface YawnConfig {
    thresholdSensitivity: number
    minYawnDuration: number
    maxYawnDuration: number
    marTimeWindow: number
}

export interface EmotionConfig {
    historyLimit: number
}

export interface CalibrationConfig {
    gatheringSize: number
    maxAnomalyMs: number
}

export interface EngineConfig {
    timeToConfirm: number
    yawTimeWindow: number
    pitchTimeWindow: number
    weights: {
        gaze: number
        perclos: number 
        yawn: number
    }
}

export interface MonitorConfig {
    worker: boolean
    backend: "GPU" | "CPU"
    gazeStrategy: GazeStrategy
    settings: {
        blink: BlinkConfig
        yawn: YawnConfig
        emotion: EmotionConfig
        calibration: CalibrationConfig
        engine: EngineConfig
    }
}