// export const FACE_MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
import type { 
    MonitorConfig
} from "@/types"

import {dependencies} from "../../package.json"
const MEDIAPIPE_VERSION = dependencies["@mediapipe/tasks-vision"].replace("^", "")
const ONNX_VERSION = dependencies["onnxruntime-web"].replace("^", "")

/**
 * The default configuration fallback for the AttentionMonitor.
 * Values can be partially overridden when initializing the library.
 */
export const DEFAULT_CONFIG: MonitorConfig = {
    assets: {
        wasm: {
            mediapipe: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
            onnx: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ONNX_VERSION}/dist/`
        },
        models: {
            face: "/models/face_landmarker.task",
            emotion: "/models/emotion_model.onnx",
            gazeOV: "/models/gaze-estimation-adas-0002.onnx"
        }
    },
    worker: true,
    backend: "CPU",
    gazeStrategy: "auto",
    settings: {
        blink: {
            thresholdSensitivity: 0.72,
            blinkDurationLimit: 0.4,
            microsleepLimit: 2,
            perclosDrowsyThreshold: 0.15, 
            earTimeWindow: 5,
            perclosTimeWindow: 60
        },
        yawn: {
            thresholdSensitivity: 2.2,
            minYawnDuration: 1.5, 
            maxYawnDuration: 8,
            marTimeWindow: 10
        },
        emotion: {
            historyLimit: 5
        }, 
        calibration: {
            gatheringSize: 2,
            maxAnomalyMs: 5000
        }, 
        engine: {
            timeToConfirm: 500,
            yawTimeWindow: 4,
            pitchTimeWindow: 4,
            weights: {
                gaze: 0.5,
                perclos: 0.35, 
                yawn: 0.15,
            }
        }
    }
}

/**
 * Utility type to allow deeply nested partial objects.
 * Used to accept incomplete user configurations before merging with defaults.
 *
 * @export
 * @template T 
 */
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>
}: T

/**
 * Recursively merges a partial source object into a target object.
 * Arrays and primitives are overwritten; nested objects are merged deeply.
 *
 * @export
 * @template {Record<string, any>} T 
 * @param {T} target The base object
 * @param {DeepPartial<T>} source The user-provided override object.
 * @returns {T} A new object containing the merged result.
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: DeepPartial<T>): T {
    const output = { ... target }
    if (isObject(target) && isObject(source)){
        Object.keys(source).forEach(key => {
            const sourceValue = source[key as keyof typeof source]
            const targetValue = target[key as keyof typeof target]

            if (isObject(sourceValue) && isObject(targetValue)) {
                (output as any)[key] = deepMerge(targetValue, sourceValue as any)
            } else if (sourceValue !== undefined) {
                (output as any)[key] = sourceValue
            }
        })
    }
    return output
}

const isObject = (item: any): boolean => {
    return (item && typeof item === "object" && !Array.isArray(item))
}