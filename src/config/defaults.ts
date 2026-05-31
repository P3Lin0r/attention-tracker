import type { 
    MonitorConfig
} from "@/types"

export const DEFAULT_CONFIG: MonitorConfig = {
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

export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>
}: T

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