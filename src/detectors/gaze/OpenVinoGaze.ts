import type { Vector3D } from "@/types";
import { BaseGazeDetector } from "@detectors/gaze/BaseGaze";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web"

/**
 * Neural network highly accurate gaze detector using an OpenVINO gaze-estimation-adas-0002 ONNX model.
 * 
 * Extracts visual crops of the user's eyes from the raw frame and processes 
 * them with head pose angles to determine a robust 3D gaze vector.
 *
 * @export
 * @class OpenVINOGazeDetector
 * @extends {BaseGazeDetector}
 */
export class OpenVINOGazeDetector extends BaseGazeDetector {
    private session!: ort.InferenceSession

    /** @readonly The URL or file path to the OpenVINO ONNX gaze model.*/
    readonly modelPath: string
    
    // Dedicated offscreen canvas for rendering eye crops without affecting the DOM
    private cropCanvas: OffscreenCanvas
    private cropCtx: OffscreenCanvasRenderingContext2D

    // Pre-allocated buffers to prevent memory allocation during frame-by-frame processing
    private chwBuffer = new Float32Array(1 * 3 * 60 * 60)
    private headPoseBuffer = new Float32Array(3)

    private eyesPointsBuffer = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
    ]
    
    /**
     * Creates an instance of OpenVINOGazeDetector.
     *
     * @constructor
     * @param {string} modelPath The path to the `.onnx` gaze model.
     */
    constructor(modelPath: string) {
        super()
        this.modelPath = modelPath
        
        this.cropCanvas = new OffscreenCanvas(60, 60)
        this.cropCtx = this.cropCanvas.getContext("2d", {willReadFrequently: true}) as OffscreenCanvasRenderingContext2D
    }

    async load(): Promise<void> {
        try {
            this.session = await ort.InferenceSession.create(this.modelPath, {graphOptimizationLevel: "disabled"})
            console.log("✅ ONNX openVINO Gaze Model loaded")
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

    /**
     * Calculates the bounding box for an eye, crops it from the frame, draws it to the
     * offscreen canvas, and converts it into a tensor.
     *
     * @private
     * @param {TexImageSource} frame The source image/video frame.
     * @param {number} frameW Original fame width.
     * @param {number} frameH Original fame height.
     * @param {NormalizedLandmark[]} landmarks Full Array of facial landmarks.
     * @param {("left" | "right")} eyeType Witch eye to process. 
     * @returns {(ort.Tensor | null)} The preprocessed image tensor, or null if the crop falls outside bounds.
     */
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

    /**
     * Converts a flat RGBA ImageData array into a CHW (Channel, Height, Width) tensor 
     * required by model. Modifies the pre-allocated `chwBuffer`.
     *
     * @private
     * @param {ImageData} imageData The raw image data from the canvas context.
     * @returns {ort.Tensor} A 4D tensor with shape [1, 3, 60, 60].
     */
    private imageDataToTensorCHW(imageData: ImageData): ort.Tensor {
        const { data } = imageData
        const channelPixels = 3600 // 60x60

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

    /**
     * Safely determines the true size of various frame source types.
     *
     * @private
     * @param {TexImageSource} frame The input media frame.
     * @returns {{ width: number, height: number }} The integer size of the source.
     */
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