import { CalibrationManager } from "@/analitics/CalibrationManager"
import { AttentionEngine } from "@/analitics/AttentionEngine"
import type { AttentionResult, MonitorConfig, TrackerSnapshot, Signals } from "@/types";

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
    
    private constructor(config: MonitorConfig) {
        super()
        this.config = config
        this.calibration = new CalibrationManager()
        this.engine = new AttentionEngine()
    }

    public static async create(config: Partial<MonitorConfig> = {}): Promise<AttentionMonitor> {
        const defaultConfig: MonitorConfig = {
            worker: true,
            backend: "CPU",
            gazeStrategy: "auto",
        }
        const monitor = new AttentionMonitor({...defaultConfig, ...config})

        await monitor.init()
        return monitor
    }

    private async init(): Promise<void> {
        if (this.config.worker) {
            this.initWorker()
        } else {
            this.initLocal()
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
            this.localTracker = new FaceTracker(this.config.backend, this.config.gazeStrategy)
            await this.localTracker.init()
            this.emit("ready")
        } catch (error: any) {
            this.emit("error", new Error(error.message || "Failed to init local tracker"));
            throw error;
        }
    }

    private handleResult(snapshot: TrackerSnapshot, signals: Signals) {
        this.calibration.update(snapshot)
        const result = this.engine.analyze(snapshot, this.calibration, signals)

        this.emit("attention", result)

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
                const signals = {
                    blinkStatus: this.localTracker.getBlinkStatus(),
                    perclos: this.localTracker.getPerclos(),
                    yawnStatus: this.localTracker.getYawnStatus(),
                    emotion: this.localTracker.getEmotion()
                }

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