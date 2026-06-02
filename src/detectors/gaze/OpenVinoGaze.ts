import type { Vector3D } from "@/types";
import { BaseGazeDetector } from "@detectors/gaze/BaseGaze";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web"

export class OpenVINOGazeDetector extends BaseGazeDetector {
    private session!: ort.InferenceSession
    
    readonly modelPath: string
    
    private cropCanvas: OffscreenCanvas
    private cropCtx: OffscreenCanvasRenderingContext2D

    private chwBuffer = new Float32Array(1 * 3 * 60 * 60)
    private headPoseBuffer = new Float32Array(3)

    private eyesPointsBuffer = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
    ]
    
    constructor(modelPath: string) {
        super()
        this.modelPath = modelPath
        
        this.cropCanvas = new OffscreenCanvas(60, 60)
        this.cropCtx = this.cropCanvas.getContext("2d", {willReadFrequently: true}) as OffscreenCanvasRenderingContext2D
    }

    async load(): Promise<void> {
        try {
            this.session = await ort.InferenceSession.create(this.modelPath, {graphOptimizationLevel: "disabled"})
            console.log("✅ ONNX openVINO Gaze Model loaded:");
            console.log("Inputs:", this.session.inputNames);
            console.log("Outputs:", this.session.outputNames);
        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            throw error;
        }
    }

    async predict(landmarks: NormalizedLandmark[], frame?: TexImageSource | null, head_angles?: Vector3D): Promise<Vector3D | null> {
        if (!frame || !landmarks || landmarks.length === 0 || !this.session) {
            return null;
        }

        const { width: frameW, height: frameH } = this.getFrameDimensions(frame)
        if (frameW === 0 || frameH === 0) return null;

        const leftEyeTensor = this.getSquareEyeCropAndPreprocess(frame, frameW, frameH, landmarks, "left");
        const rightEyeTensor = this.getSquareEyeCropAndPreprocess(frame, frameW, frameH, landmarks, "right");

        if (!leftEyeTensor || !rightEyeTensor) return null;
        
        this.headPoseBuffer[0] = head_angles[0] // Yaw 
        this.headPoseBuffer[1] = head_angles[1] // Pitch
        this.headPoseBuffer[2] = head_angles[2] // Roll

        const headPoseTensor = new ort.Tensor(
            "float32",
            this.headPoseBuffer,
            [1, 3]
        )

        const feeds: Record<string, ort.Tensor> = {
            "left_eye_image": leftEyeTensor,
            "right_eye_image": rightEyeTensor,
            "head_pose_angles": headPoseTensor
        }

        try {
            const result = await this.session.run(feeds)
            
            const outputName = this.session.outputNames[0]!
            const outputTensor = result[outputName]!
            const v = outputTensor.data as Float32Array

            outputTensor.dispose()
            leftEyeTensor.dispose()
            rightEyeTensor.dispose()
            headPoseTensor.dispose()

            let sumSq = 0
            for (let i = 0; i < v.length; i++){
                sumSq += v[i] * v[i]
            }

            const norm = Math.sqrt(sumSq)
            if (norm > 0){
                return [
                    v[0] / norm, 
                    v[1] / norm, 
                    v[2] / norm
                ] as Vector3D;
            }
            return null
            
        } catch (error) {
            console.error("Gaze prediction error:", error);
            return null;
        }
    }

    private getSquareEyeCropAndPreprocess(
        frame: TexImageSource, 
        frameW: number, 
        frameH: number, 
        landmarks: NormalizedLandmark[], 
        eyeType: "left" | "right"
    ): ort.Tensor | null {
        
        const idxs = eyeType === "left" ? [362, 263, 386, 374] : [133, 33, 159, 145];
        
        for (let i = 0; i < 4; i++) {
            const pt = this.eyesPointsBuffer[i] 
            const landmark = landmarks[idxs[i]]
            pt.x = landmark.x * frameW
            pt.y = landmark.y * frameH
        }
        const points = this.eyesPointsBuffer

        let sumX = 0
        let sumY = 0
        const lenPoints = points.length;
        for (let i = 0; i < lenPoints; i++) {
            const p = points[i] 
            sumX += p.x
            sumY += p.y
        }
        const centerX = sumX / lenPoints
        const centerY = sumY / lenPoints

        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        const eyeWidth = Math.sqrt(dx * dx + dy * dy);
        const side = Math.floor(eyeWidth * 1.5);

        let xMin = Math.floor(centerX - side / 2);
        let yMin = Math.floor(centerY - side / 2);

        xMin = Math.max(0, xMin);
        yMin = Math.max(0, yMin);
        
        const sWidth = Math.min(side, frameW - xMin);
        const sHeight = Math.min(side, frameH - yMin);

        if (sWidth <= 0 || sHeight <= 0) return null;

        this.cropCtx.clearRect(0, 0, 60, 60)
        this.cropCtx.drawImage(
            frame as CanvasImageSource, 
            xMin, yMin, sWidth, sHeight,
            0, 0, 60, 60
        )

        const imageData = this.cropCtx.getImageData(0, 0, 60, 60)

        return this.imageDataToTensorCHW(imageData)
    }

    private imageDataToTensorCHW(imageData: ImageData): ort.Tensor {
        const { data } = imageData
        const channelPixels = 3600

        for (let i = 0; i < channelPixels; i++) {
            const rgbaIdx = i * 4
            const r = data[rgbaIdx + 0]
            const g = data[rgbaIdx + 1]
            const b = data[rgbaIdx + 2]

            this.chwBuffer[i] = r
            this.chwBuffer[i + channelPixels] = g
            this.chwBuffer[i + 2 * channelPixels] = b
        }
        return new ort.Tensor("float32", this.chwBuffer, [1, 3, 60, 60])
    }

    private getFrameDimensions(frame: TexImageSource): { width: number, height: number } {
        if (frame instanceof ImageBitmap) {
            return { width: frame.width, height: frame.height}
        }
        
        if (typeof OffscreenCanvas !== 'undefined' && frame instanceof OffscreenCanvas) {
            return { width: frame.width, height: frame.height };
        }

        if (typeof VideoFrame !== 'undefined' && frame instanceof VideoFrame) {
            return { width: frame.displayWidth, height: frame.displayHeight };
        }

        if (typeof window !== 'undefined') {
            if (frame instanceof HTMLVideoElement) {
                return { width: frame.videoWidth, height: frame.videoHeight };
            }
            if (frame instanceof HTMLImageElement) {
                return { width: frame.naturalWidth, height: frame.naturalHeight };
            }
            if (frame instanceof HTMLCanvasElement) {
                return { width: frame.width, height: frame.height };
            }
        }
        return { width: 0, height: 0 };
    }
}