import { CalibrationManager } from "@/analytics/CalibrationManager"
import { AttentionEngine } from "@/analytics/AttentionEngine"
import type { AttentionResult, TrackerSnapshot, Signals } from "@/types";
import type { MonitorConfig } from "@/types";
import { deepMerge, DEFAULT_CONFIG, type DeepPartial } from "@/config/defaults";

import TrackerWorker from "@workers/tracker.worker?worker"
import { EventEmitter } from "@/api/EventEmitter";
import { FaceTracker } from "@/core/FaceTracker";

type MonitorEvents = {
    "attention": [AttentionResult]
    "ready": []
    "error": [Error]
}

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

    private constructor(config: MonitorConfig) {
        super()
        this.config = config
        this.calibration = new CalibrationManager(this.config.settings.calibration)
        this.engine = new AttentionEngine(this.config.settings.engine)
    }

    public static async create(userConfig: DeepPartial<MonitorConfig> = {}): Promise<AttentionMonitor> {
        const finalConfig = deepMerge<MonitorConfig>(DEFAULT_CONFIG, userConfig)
        const monitor = new AttentionMonitor(finalConfig)

        await monitor.init()
        return monitor
    }

    private async init(): Promise<void> {
        if (this.config.worker) {
            await this.initWorker()
        } else {
            await this.initLocal()
        }
    }

    private async initWorker(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new TrackerWorker();
                
                // Listen
                this.worker.onmessage = async (e) => {
                    const {type, payload } = e.data
                    
                    if (type === "INIT_DONE") {
                        this.emit("ready");
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

                // Sending
                this.worker.postMessage({type: "INIT", payload: { config: this.config }})

            } catch (error) {
                reject(error)
            }
        })
    }

    private async initLocal(): Promise<void> {
        try {
            this.localTracker = new FaceTracker(this.config)
            await this.localTracker.init()
            this.emit("ready")
        } catch (error: any) {
            this.emit("error", new Error(error.message || "Failed to init local tracker"));
            throw error;
        }
    }

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

    public async start(videoElement: TexImageSource) {
        if (this.isRunning) return

        this.videoElement = videoElement
        this.isRunning = true
        this.processNextFrame()
    }

    public stop() {
        this.isRunning = false
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId)
            this.animationFrameId = null
        }
    }

    private async processNextFrame(){
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
                this.animationFrameId = requestAnimationFrame(() => this.processNextFrame());
            }
        }
    }
}