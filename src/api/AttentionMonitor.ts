import { CalibrationManager } from "@/analytics/CalibrationManager"
import { AttentionEngine } from "@/analytics/AttentionEngine"
import type { AttentionResult, TrackerSnapshot, Signals } from "@/types";
import type { MonitorConfig } from "@/types";
import { deepMerge, DEFAULT_CONFIG, type DeepPartial } from "@/config/defaults";

import TrackerWorker from "@workers/tracker.worker?worker&inline"
import { EventEmitter } from "@/api/EventEmitter";
import { FaceTracker } from "@/core/FaceTracker";

/**
 * Valid event signatures for the {@link AttentionMonitor} 
 * 
 * @example
 * monitor.on('attention', (result) => {
 *    console.log('Current result:', result.score)
 * })
*/
type MonitorEvents = {
    /** Ensures the continuous reporting of analysis results while running. */
    "attention": [AttentionResult]

    /** Triggers when an internal error occurs. */
    "error": [Error]
}

/**
 * The main public entry point for the library. Manages the lifecycle of tracking, 
 * orchestrates Web Workers or local processing, and emits attention events.
 *
 * @export
 * @class AttentionMonitor
 * @extends {EventEmitter<MonitorEvents>}
 */
export class AttentionMonitor extends EventEmitter<MonitorEvents>{
    private config: MonitorConfig 

    private worker: Worker | null = null
    private localTracker: FaceTracker | null = null;

    private calibration: CalibrationManager
    private engine: AttentionEngine
    
    private isRunning = false
    private videoElement: TexImageSource | null = null
    private animationFrameId: number | null = null

    private wasFaceLost: boolean = false

    /**
     * Private constructor. Use `AttentionMonitor.create()` for instantiation.
     *
     * @constructor
     * @private
     * @param {MonitorConfig} config Fully merged configuration object.
     */
    private constructor(config: MonitorConfig) {
        super()
        this.config = config
        this.calibration = new CalibrationManager(this.config.settings.calibration)
        this.engine = new AttentionEngine(this.config.settings.engine)
    }

    /**
     * Factory method to create and initialize an AttentionMonitor instance.
     * Merges user configuration with default settings.
     *
     * @public
     * @static
     * @async
     * @param {DeepPartial<MonitorConfig>} [userConfig={}] Overrides for the default configuration.
     * @returns {Promise<AttentionMonitor>} A fully initialized monitor instance.
     */
    public static async create(userConfig: DeepPartial<MonitorConfig> = {}): Promise<AttentionMonitor> {
        const finalConfig = deepMerge<MonitorConfig>(DEFAULT_CONFIG, userConfig)
        const monitor = new AttentionMonitor(finalConfig)

        await monitor.init()
        return monitor
    }

    /**
     * Bootstraps the monitor environment based on the configuration (Worker or Local Main thread).
     *
     * @private
     * @async
     * @returns {Promise<void>} 
     */
    private async init(): Promise<void> {
        this.normalizeAssetPaths()

        if (this.config.worker) {
            await this.initWorker()
        } else {
            await this.initLocal()
        }
    }

    /**
     * Ensures all provided asset paths are converted to absolute URLs 
     * to prevent cross-origin or resolution errors inside Web Workers.
     * 
     * @private
     */
    private normalizeAssetPaths(): void {
        if (!this.config.assets) return;
        
        for (const category in this.config.assets){
            const categoryAssets = this.config.assets[category as keyof typeof this.config.assets]
            
            for (const key in categoryAssets){
                const path = categoryAssets[key as keyof typeof categoryAssets]
                if(path){
                    try {
                        const url = new URL(path, window.location.origin).href
                        categoryAssets[key as keyof typeof categoryAssets] = url
                    } catch (error) {
                        console.error(`Failed to convert path ${key}:`, error);
                    }
                }
            }
        }
    }

    /**
     * Initialize tracker off-thread via a Web Worker. 
     *
     * @private
     * @async
     * @returns {Promise<void>} 
     */
    private async initWorker(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new TrackerWorker();
                
                this.worker.onmessage = async (e) => {
                    const {type, payload } = e.data
                    
                    if (type === "INIT_DONE") {
                        resolve()
                    }
    
                    if (type === "RESULT") {
                        this.handleResult(payload.snapshot, payload.signals);
                    }
                }
                
                this.worker.onerror = (error) => {
                    reject(error)
                    this.emit("error", new Error(error.message));
                }

                this.worker.postMessage({type: "INIT", payload: { config: this.config }})

            } catch (error) {
                reject(error)
            }
        })
    }

    /**
     * Initializes the tracker on the main thread.
     *
     * @private
     * @async
     * @returns {Promise<void>} 
     */
    private async initLocal(): Promise<void> {
        try {
            this.localTracker = new FaceTracker(this.config)
            await this.localTracker.init()
        } catch (error: any) {
            this.emit("error", new Error(error.message || "Failed to init local tracker"));
            throw error;
        }
    }

    /**
     * Passes tracking results through the calibration manager and attention engine, 
     * then emits the assembled data to the consumer.
     *
     * @private
     * @param {TrackerSnapshot} snapshot The geometric tracking output.
     * @param {Signals} signals Raw emotional and behavioral signals.
     */
    private handleResult(snapshot: TrackerSnapshot, signals: Signals) {
        if (snapshot.isFaceLost){
            if (!this.wasFaceLost){
                this.calibration.reset()
                this.engine.reset()
                this.wasFaceLost = true
            }
            
            const emptyResult: AttentionResult = {
                status: "NOT_DETECTED",
                score: 0,
                details: {
                    penalties: { gaze: 0, perclos: 0, yawn: 0, emotionModifier: 1 },
                    isADHD: false,
                    direction: {}
                },
                signals: signals,
                snapshot: snapshot,
                calibration: this.calibration.getState()
            }
            
            this.emit("attention", emptyResult)
            if (this.isRunning){
                this.animationFrameId = requestAnimationFrame(()=>this.processNextFrame())
            }
            return
        }

        if (this.wasFaceLost) {
            this.wasFaceLost = false
        }
        
        this.calibration.update(snapshot)
        const calibState = this.calibration.getState()
        const engineData = this.engine.analyze(snapshot, calibState, signals)

        const finalResult: AttentionResult = {
            status: engineData.status,
            score: engineData.score,
            details: engineData.details,
            signals: signals,
            snapshot: snapshot,
            calibration: calibState
        }

        this.emit("attention", finalResult)

        if (this.isRunning){
            this.animationFrameId = requestAnimationFrame(()=> this.processNextFrame())
        }
    }

    /**
     * Starts the processing loop, grabbing frames from the provided video source.
     *
     * @public
     * @async
     * @param {TexImageSource} videoElement The HTML video, canvas, or image element to track.
     * @returns {Promise<void>} 
     */
    public async start(videoElement: TexImageSource): Promise<void> {
        if (this.isRunning) return

        this.videoElement = videoElement
        this.isRunning = true
        this.processNextFrame()
    }
    
    /**
     * Stops the processing loop. 
     * The resources remain in memory; you can call start() again.
     * @public 
     */
    public stop(): void {
        this.isRunning = false
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
        if(this.localTracker) {
            this.localTracker.clear()
        }
        this.calibration.reset()
        this.engine.reset()
    }
    
    /**
     * Completely destroys the monitor, unloads models from memory, 
     * terminates workers and unsubscribes all events.
     * Once this method has been called, the instance can no longer be used.
     * @public
     */
    public destroy(): void {
        this.stop()

        if (this.config.worker && this.worker){
            this.worker.postMessage({type: "DESTROY"})

            setTimeout(()=>{
                this.worker?.terminate()
                this.worker = null
            }, 50)
        } else if (this.localTracker){
            this.localTracker.destroy()
            this.localTracker = null
        }

        this.videoElement = null
        this.removeAllListeners()
    }

    /**
     * The core recursive frame-grab loop. Converts the current frame to an ImageBitmap
     * for high-performance, transport to the Web Worker (if enabled) or processes it locally.
     *
     * @private
     * @async
     * @returns {Promise<void>} 
     */
    private async processNextFrame(): Promise<void> {
        if (!this.isRunning || !this.videoElement) return

        try {
            const imageBitmap = await createImageBitmap(this.videoElement)

            if (this.config.worker && this.worker){
                this.worker.postMessage(
                    { type: "PROCESS", payload: { image: imageBitmap }},
                    [imageBitmap]
                )
            } else if (this.localTracker) {
                await this.localTracker.process(imageBitmap)

                const snapshot = this.localTracker.getSnapshot()
                const signals = this.localTracker.getSignals()

                this.handleResult(snapshot, signals)
            }

            imageBitmap.close()

        } catch (error) {
            console.error("Failed to grab/process frame:", error);
            if (this.isRunning){
                setTimeout(()=>{
                    this.animationFrameId = requestAnimationFrame(() => this.processNextFrame());
                }, 500)
            }
        }
    }
    
    /**
     * Subscribes to monitor events.
     *
     * @public
     * @param {"attention"} event Event `attention`. Ensures the continuous reporting of analysis results while running.
     * @param {(result: AttentionResult) => void} fn Callback with results ({@link AttentionResult}).
     * @returns {this} 
     */
    public override on(event: "attention", fn: (result: AttentionResult) => void): this;
    
    /**
     * Subscribes to monitor events.
     *
     * @public
     * @param {"error"} event Event `error`. Triggers when an internal error occurs.
     * @param {(error: Error) => void} fn Callback with the error object.
     * @returns {this} 
     */
    public override on(event: "error", fn: (error: Error) => void): this;
    public override on<K extends keyof MonitorEvents>(event: K, fn: (...args: MonitorEvents[K]) => void): this {
        return super.on(event, fn as any);
    }
}