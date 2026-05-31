import { FACE_MODEL_PATH, VISION_BASE_URL } from "@config/constants"
import { EyeAspectRatioTracker, MouthAspectRatioTracker } from "@detectors/AspectRatio"
import { BlinkDetector } from "@detectors/BlinkDetector"
import { YawnDetector } from "@detectors/YawnDetector"
import { EmotionsDetector } from "@/detectors/EmotionsDetector"
import type { BaseGazeDetector, GazeStrategies } from "@/detectors/gaze/BaseGaze"
import { MathGazeDetector } from "@/detectors/gaze/MathGaze"

import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult,
    type FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision"

import { OpenVINOGazeDetector } from "@/detectors/gaze/OpenVinoGaze"
import { PerformanceMonitor } from "./performance/PerformanceMonitor"
import { rad2degScalar } from "@/utils/helpers"
import type { GazeStrategy, MonitorConfig, Signals, TrackerSnapshot, Vector3D } from "@/types"

type deviceOptions = "CPU" | "GPU"

export class FaceTracker{
    private landmarker!: FaceLandmarker
    private latestResult: FaceLandmarkerResult | null = null

    private currentGaze: Float32Array = new Float32Array(3)
    private hasGaze = false
    private currentHeadAngles: Vector3D | null = null

    private earTracker = new EyeAspectRatioTracker()
    private marTracker = new MouthAspectRatioTracker()
    private currentEAR: number = 0
    private currentMAR: number = 0

    private blinkDetector: BlinkDetector
    private yawnDetector: YawnDetector
    private emotionsDetector: EmotionsDetector

    private perfMonitor = new PerformanceMonitor()

    private gazeStrategies: GazeStrategies = {
        "MATH": new MathGazeDetector(),
        "OPENVINO": new OpenVINOGazeDetector(),
    }
    
    private lastFaceDetectedTime: number = 0
    private readonly FACE_LOST_THRESHOLD_MS = 2000
    private isFaceLost: boolean = false

    public readonly device: deviceOptions
    public readonly gazeStrategy: GazeStrategy
    
    constructor(private config: MonitorConfig){
        this.device = this.config.backend
        this.gazeStrategy = this.config.gazeStrategy

        this.blinkDetector = new BlinkDetector(config.settings.blink)
        this.yawnDetector = new YawnDetector(config.settings.yawn)
        this.emotionsDetector = new EmotionsDetector(config.settings.emotion)
        
    }

    async init(): Promise<void> {
        const visionFileset = await FilesetResolver.forVisionTasks(VISION_BASE_URL)
        
        try {
            // fix web-worker + mediapipe
            const response = await fetch(visionFileset.wasmLoaderPath)
            eval?.(await response.text())
            delete (visionFileset as any).wasmLoaderPath

            const options: FaceLandmarkerOptions = {
                baseOptions: {
                    modelAssetPath: FACE_MODEL_PATH,
                    delegate: this.device
                },
                runningMode: "VIDEO",
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
            }

            this.landmarker = await FaceLandmarker.createFromOptions(visionFileset, options);

        } catch (error) {
            console.error("Failed to manually load MediaPipe WASM loader:", error);
            throw error
        }

        // initialising emotions model
        await this.emotionsDetector.init()

        // loading gaze models
        const modelsToLoad: Promise<void>[] = []
        
        if (this.gazeStrategy === "auto" || this.gazeStrategy === "openvino") {
            modelsToLoad.push(this.gazeStrategies.OPENVINO.load())
        }

        if (this.gazeStrategy === "auto" || this.gazeStrategy === "math") {
            modelsToLoad.push(this.gazeStrategies.MATH.load())
        }

        await Promise.all(modelsToLoad)
    }

    async process(video: TexImageSource){       
        const now = performance.now()

        const result = this.landmarker.detectForVideo(video, now)
        this.latestResult = result

        if (!result.faceLandmarks.length || result.faceLandmarks[0] == null || result.faceBlendshapes[0] == null) {
            if (!this.isFaceLost && (now - this.lastFaceDetectedTime > this.FACE_LOST_THRESHOLD_MS)) {
                this.handleFaceLost()
            }
            return
        }

        if (this.isFaceLost) {
            this.handleFaceFound()
        }
        this.lastFaceDetectedTime = now

        const lm = result.faceLandmarks[0]
        const bm = result.faceBlendshapes[0].categories // Category
        this.currentHeadAngles = this.getHeadAngles()

        // EAR
        const {left: earLeft, right: earRight}= this.earTracker.calculate(lm)
        this.currentEAR = (earLeft + earRight)/2
        this.blinkDetector.update(this.currentEAR)
        
        // MAR
        this.currentMAR = this.marTracker.calculate(lm)
        this.yawnDetector.update(this.currentMAR)

        // Emotions + Gaze
        const emotionsPromise = this.emotionsDetector.update(bm)

        let gazePromise = Promise.resolve(null as Vector3D | null)
        if (this.currentHeadAngles?.length){
            let strategy: BaseGazeDetector
            if (this.gazeStrategy === "auto"){
                strategy = this.perfMonitor.shouldDowngrade() ? this.gazeStrategies.MATH : this.gazeStrategies.OPENVINO
            } else if (this.gazeStrategy === "openvino") {
                strategy = this.gazeStrategies.OPENVINO
            } else {
                strategy = this.gazeStrategies.MATH
            }
            gazePromise = strategy.predict(lm, video, this.currentHeadAngles)
        }

        const [_, newGaze] = await Promise.all([
            emotionsPromise,
            gazePromise
        ])

        this.updateGaze(newGaze)

        if (this.gazeStrategy === "auto"){
            this.perfMonitor.update(performance.now() - now)
        } 
    }

    private updateGaze(newGaze: Vector3D | Float32Array | null){
        if (!newGaze) return;

        if (!this.hasGaze) {
            this.currentGaze[0] = newGaze[0];
            this.currentGaze[1] = newGaze[1];
            this.currentGaze[2] = newGaze[2];
            this.hasGaze = true;
        } else {
            this.currentGaze[0] = this.currentGaze[0] * 0.7 + newGaze[0] * 0.3;
            this.currentGaze[1] = this.currentGaze[1] * 0.7 + newGaze[1] * 0.3;
            this.currentGaze[2] = this.currentGaze[2] * 0.7 + newGaze[2] * 0.3;
        }
    }

    private getHeadAngles(): Vector3D | null {
        const matrixes = this.latestResult?.facialTransformationMatrixes;
        if (!matrixes || matrixes.length === 0) return null;

        const matrix = matrixes[0]?.data
        if (!matrix || matrix.length < 16) return null;

        const yaw_rad = Math.asin(matrix[8])
        const pitch_rad = Math.atan2(-matrix[9], matrix[10])
        const roll_rad = Math.atan2(-matrix[4], matrix[0])
        
        if (yaw_rad !== yaw_rad || pitch_rad !== pitch_rad || roll_rad !== roll_rad) {
            return null;
        }
        
        return [
            rad2degScalar(yaw_rad),
            rad2degScalar(pitch_rad),
            rad2degScalar(roll_rad)
        ] as Vector3D
    }

    private handleFaceLost(): void {
        this.isFaceLost = true
        this.currentEAR = 0
        this.currentMAR = 0
        this.blinkDetector.reset()
        this.yawnDetector.reset()
        this.perfMonitor.reset()
    }

    private handleFaceFound(): void {
        this.isFaceLost = false
    }


    getSnapshot(): TrackerSnapshot {
        return {
            isFaceLost: this.isFaceLost,
            landmarks: this.latestResult?.faceLandmarks[0] || null,
            gaze: this.currentGaze,
            headAngles: this.currentHeadAngles
        }
    }

    getSignals(): Signals {
        const isDowngraded = this.perfMonitor.shouldDowngrade()
        const activeModel = (this.gazeStrategy === "auto")
            ? (isDowngraded ? "MATH" : "OPENVINO")
            : (this.gazeStrategy === "math" ? "MATH" : "OPENVINO")
        
        return {
            emotion: this.emotionsDetector.current_emotion,
            blink: {
                status: this.blinkDetector.status,
                count: this.blinkDetector.blinkCount,
                perclos: this.blinkDetector.perclosScore,
                threshold: this.blinkDetector.threshold
            },
            yawn: {
                status: this.yawnDetector.status,
                count: this.yawnDetector.yawnCount,
                threshold: this.yawnDetector.threshold
            },
            raw: {
                ear: this.currentEAR,
                mar: this.currentMAR,
            },
            performance: {
                latency: this.perfMonitor.getLatency(),
                isDowngraded,
                activeModel
            }
        }
    }
}
