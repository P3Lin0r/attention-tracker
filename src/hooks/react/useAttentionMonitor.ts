import { AttentionMonitor } from "@/api/AttentionMonitor"
import type { DeepPartial } from "@/config/defaults"
import type { AttentionResult, MonitorConfig } from "@/types"

import { useCallback, useEffect, useRef, useState } from "react"

interface UseAttentionMonitorReturn {
    /**
     * The latest result of attention tracking.
     *
     * @type {(AttentionResult | null)}
     */
    result: AttentionResult | null
    
    /**
     * An error has occurred if initialization or tracking has failed.
     *
     * @type {(Error | null)}
     */
    error: Error | null
    
    /**
     * Ready flag: true when the WASMs and models have been loaded and the tracker is ready to run.
     *
     * @type {boolean}
     */
    isReady: boolean
    
    /**
     * A function for manually starting the tracker.
     *
     * @type {() => void}
     */
    start: () => void
    
    /**
     * A function for manually stopping the tracker (without unloading models from memory).
     *
     * @type {() => void}
     */
    stop: () => void
}

/**
 * Options for configuring the behavior of the React hook.
 *
 * @export
 * @interface UseAttentionMonitorOptions
 */
export interface UseAttentionMonitorOptions {    
    /** 
     * Determines whether the tracker should start automatically as soon as 
     * the video element is ready and models are loaded.
     * 
     * Set this to `false` if you need to wait for a specific user action or state
     * (e.g., clicking a "Start tracking" button, or accepting privacy terms).
     * 
     * @default true
     * @example
     * // Wait for explicit user permission before starting
     * const { start } = useAttentionMonitor(videoRef, {}, { autoStart: false });
     * return <button onClick={start}>Start Tracking</button>;
     */
    autoStart?: boolean

    /**
     * A high-frequency callback executed on every processed frame (up to 30-60 times per second).
     * 
     * **⚡Performance Note:** Unlike the `result` state returned by the hook, this callback 
     * does **NOT** trigger a React re-render. It is highly recommended to use this for 
     * heavy visual operations like drawing gaze vectors on an HTML `<canvas>` or updating 3D scenes.
     * 
     * @example
     * const canvasCtx = canvasRef.current.getContext('2d');
     * useAttentionMonitor(videoRef, {}, {
     *     onUpdate: (result) => {
     *         // Render graphics smoothly every frame without killing React performance
     *         drawLandmarks(canvasCtx, result.snapshot.landmarks);
     *     }
     * });
     */
    onUpdate?: (result: AttentionResult) => void

    /** 
     * Throttles the frequency of React state updates (the `result` object returned by the hook).
     * 
     * **⚠️Warning:** Updating React state 60 times a second can severely degrade your app's performance. 
     * Use this parameter to limit how often your component re-renders.
     * * `0` : Update every frame (Not recommended unless your UI is extremely simple).
     * * `100 - 500` : Ideal range for updating UI dashboards, text, or progress bars.
     * 
     * @default 0
     * @example
     * // The component will re-render a maximum of 4 times per second (every 250ms).
     * // This keeps the UI responsive while still feeling "real-time".
     * const { result } = useAttentionMonitor(videoRef, {}, { throttleStateMs: 250 });
     */
    throttleStateMs?: number
}

/**
 * A React hook for integrating AttentionMonitor into components.
 * Handles the lifecycle management (loading models, subscribing to events, clearing memory).
 *
 * @export
 * @param {React.RefObject<TexImageSource | null>} videoRef A reference (Ref) to the HTMLVideoElement that will serve as the frame source.
 * @param {DeepPartial<MonitorConfig>} [config={}] Root configurations for the tracking system (backend, paths, weights, ...).
 * @param {UseAttentionMonitorOptions} options Hook options (autostart, callbacks, throttling).
 * @returns {UseAttentionMonitorReturn} State object and methods for controlling the tracker.
 */
export function useAttentionMonitor(
    videoRef: React.RefObject<TexImageSource | null>,
    config: DeepPartial<MonitorConfig> = {},
    options: UseAttentionMonitorOptions = {},
): UseAttentionMonitorReturn {

    const { autoStart = true, onUpdate, throttleStateMs = 0 } = options

    const [result, setResult] = useState<AttentionResult | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const [isReady, setIsReady] = useState<boolean>(false)
    
    const monitorRef = useRef<AttentionMonitor | null>(null)
    const lastStateUpdateRef = useRef<number>(0)

    const onUpdateRef = useRef(onUpdate)
    useEffect(()=>{
        onUpdateRef.current = onUpdate
    }, [onUpdate])

    const configStr = JSON.stringify(config)

    useEffect(()=>{
        let isTargetMounted = true

        const initMonitor = async () => {
            try {
                const parsedConfig = JSON.parse(configStr) 
                const monitor = await AttentionMonitor.create(parsedConfig)

                // Protection against race conditions if a component crashes during initialization
                if (!isTargetMounted){
                    monitor.destroy()
                    return
                }
                monitorRef.current = monitor

                monitor.on("attention", (res) => {
                    if (onUpdateRef.current) onUpdateRef.current(res)
                    
                    const now = performance.now()
                    const isCriticalStatus = res.status == "MICROSLEEP" || res.status == "DROWSY" || res.status == "NOT_DETECTED"
                    if (isCriticalStatus || now - lastStateUpdateRef.current >= throttleStateMs) {
                        setResult(res)
                        lastStateUpdateRef.current = now
                    }
                })

                monitor.on("error", setError)
                setIsReady(true)
                
            } catch (err) {
                if (isTargetMounted) {
                    setError(err instanceof Error ? err : new Error(String(err)))
                }
            }
        }

        initMonitor()

        return () => {
            isTargetMounted = false
            monitorRef.current?.destroy()
            monitorRef.current = null

            setIsReady(false)
        }
    }, [configStr, throttleStateMs])

    useEffect(()=>{
        if(!isReady || !autoStart || !videoRef.current || !monitorRef.current) return
        
        const video = videoRef.current as HTMLVideoElement

        const attemptStart = () => {
            if (video.readyState >= 2 && monitorRef.current) {
                monitorRef.current.start(video)
            }
        }

        if (video.readyState >= 2){
            attemptStart()
        } else {
            video.addEventListener("loadeddata", attemptStart, { once: true })
            video.addEventListener("playing", attemptStart, { once: true })
        }
    }, [isReady, autoStart])

    const start = useCallback(() => {
        if (monitorRef.current && videoRef.current) {
            monitorRef.current.start(videoRef.current)
        }
    }, [videoRef])

    const stop = useCallback( () => {
        if (monitorRef.current) {
            monitorRef.current.stop()
        }
    }, [])

    return { result, error, isReady, start, stop }
}