import { FACE_MODEL_PATH, VISION_BASE_URL } from "@config/constants"
import { EyeAspectRatioTracker, MouthAspectRatioTracker } from "@detectors/AspectRatio"
import { BlinkDetector } from "@detectors/BlinkDetector"
import { YawnDetector } from "@detectors/YawnDetector"
import { EmotionsDetector } from "@/detectors/EmotionsDetector"
import type { GazeStrategies } from "@/detectors/gaze/BaseGaze"
import { MathGazeDetector } from "@/detectors/gaze/MathGaze"
import * as tf from "@tensorflow/tfjs"

import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult,
    type FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision"

import { OpenVINOGazeDetector } from "@/detectors/gaze/OpenVinoGaze"
import { PerformanceMonitor } from "./performance/PerformanceMonitor"
import { rad2degScalar } from "@/utils/helpers"
import type { GazeStrategy, TrackerSnapshot, Vector3D } from "@/types"

type deviceOptions = "CPU" | "GPU"

export class FaceTracker{
    private landmarker!: FaceLandmarker
    private latestResult: FaceLandmarkerResult | null = null

    private currentGaze: tf.Tensor1D | null = null

    private earTracker = new EyeAspectRatioTracker()
    private marTracker = new MouthAspectRatioTracker()

    private blinkDetector = new BlinkDetector()
    private yawnDetector = new YawnDetector()

    private emotionsDetector = new EmotionsDetector()

    private gazeStrategies: GazeStrategies = {
        "MATH": new MathGazeDetector(),
        "OPENVINO": new OpenVINOGazeDetector(),
    }
    
    private perfMonitor = new PerformanceMonitor()

    public readonly device: deviceOptions
    public readonly gazeStrategy: GazeStrategy

    constructor(device: deviceOptions = "CPU", gazeStrategy: GazeStrategy = "auto"){
        this.device = device
        this.gazeStrategy = gazeStrategy
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
            return
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

        if (!result.faceLandmarks.length || result.faceLandmarks[0] == null || result.faceBlendshapes[0] == null) return
        const lm = result.faceLandmarks[0]
        const bm = result.faceBlendshapes[0].categories // Category
        const headAngles = this.getHeadAngles()

        // EAR
        const {left: earLeft, right: earRight}= this.earTracker.calculate(lm)
        const currentEAR = (earLeft + earRight)/2
        this.blinkDetector.update(currentEAR)
        
        // MAR
        const currentMAR = this.marTracker.calculate(lm)
        this.yawnDetector.update(currentMAR)

        // Emotions + Gaze
        const emotionsPromise = this.emotionsDetector.update(bm)

        let gazePromise = Promise.resolve(null as number[] | null)
        if (headAngles?.length){
            let activeGaze

            if (this.gazeStrategy === "auto"){
                const useMathGaze = this.perfMonitor.shouldDowngrade()
                activeGaze = useMathGaze ? this.gazeStrategies.MATH : this.gazeStrategies.OPENVINO
            } else if (this.gazeStrategy === "openvino") {
                activeGaze = this.gazeStrategies.OPENVINO
            } else {
                activeGaze = this.gazeStrategies.MATH
            }

            gazePromise = activeGaze.predict(lm, video, headAngles)
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

    private updateGaze(newGaze: number[] | null){
        if (newGaze != null ){
            const oldTensor = this.currentGaze

            this.currentGaze = tf.tidy(()=>{
                const newTensor = tf.tensor1d(newGaze)

                if (!oldTensor)
                    return newTensor

                return tf.add(
                    tf.mul(oldTensor, 0.7),
                    tf.mul(newGaze, 0.3),
                ) as tf.Tensor1D
            })
            oldTensor?.dispose()
        }
    }

    private getHeadAngles(): Vector3D | null {
        if (this.latestResult == null || !this.latestResult.facialTransformationMatrixes.length){
            return null
        }

        const matrix = this.latestResult.facialTransformationMatrixes[0]?.data
        
        const yaw_rad = Math.asin(matrix[0, 2])
        const pitch_rad = Math.atan2(-matrix[1, 2], matrix[2, 2])
        const roll_rad = Math.atan2(-matrix[0, 1], matrix[0, 0])
        
        if (isNaN(yaw_rad) || isNaN(pitch_rad) || isNaN(roll_rad)){
            return null
        }

        const head_rad_list = [yaw_rad, pitch_rad, roll_rad] 

        return head_rad_list.map((v)=> rad2degScalar(v)) as Vector3D
    }
    
    getBlinkStatus() {
        return this.blinkDetector.status
    }
    getBlinkCount() {
        return this.blinkDetector.blinkCount
    }
    getPerclos(): number{
        return this.blinkDetector.perclosScore
    }
    getYawnStatus() {
        return this.yawnDetector.status
    }
    getYawnCount() {
        return this.yawnDetector.yawnCount
    }
    getEmotion() {
        return this.emotionsDetector.current_emotion
    }
    getCurrentGaze() {
        return this.currentGaze
    }

    getPerformanceStats() {
        return {
            latency: this.perfMonitor.getLatency(),
            isDowngraded: this.perfMonitor.shouldDowngrade()
        }
    }

    getSnapshot(): TrackerSnapshot {
        return {
            landmarks: this.latestResult?.faceLandmarks[0],
            gaze: this.currentGaze?.arraySync(),
            headAngles: this.getHeadAngles()
        }
    }
}
