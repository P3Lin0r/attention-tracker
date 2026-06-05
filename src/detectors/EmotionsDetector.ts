import * as ort from "onnxruntime-web"
import type { EmotionConfig, EmotionStatus } from "@/types"
import { type Category } from "@mediapipe/tasks-vision"

/**
 * Detects and tracks facial emotions using an ONNX runtime model.
 * 
 * @export
 * @class EmotionsDetector
 */
export class EmotionsDetector {
    /** @private The ONNX inference session. */
    private session!: ort.InferenceSession

    /** @readonly The URL or file path to the ONNX emotion model. */
    readonly modelPath: string

    currentEmotion: EmotionStatus = "NEUTRAL"
    /** @private Circular buffer for storing recent emotions to calculate the mode. */
    private emotionHistory: Array<EmotionStatus>

    // Pre-allocated buffers to prevent garbage collection spikes during updates
    private scoresBuffer = new Float32Array(52)
    private frequencyBuffer: Record<string, number> = {}
    private historySize = 0
    private writeIndex = 0

    /**
     * Creates an instance of EmotionsDetector.
     *
     * @constructor
     * @param {EmotionConfig} config Configuration for history limits and thresholds.
     * @param {string} modelPath The path to the `.onnx` emotion model file. 
     */
    constructor(private config: EmotionConfig, modelPath: string) {
        this.emotionHistory = new Array<EmotionStatus>(this.config.historyLimit)
        this.modelPath = modelPath
    }

    /**
     * Initializes the ONNX runtime session and load the model into memory.
     * Must be called before `update()`.
     * 
     * @async
     * @returns {Promise<void>}
     * @throws {Error} If the ONNX model fails to load.
     */
    async init(): Promise<void> {
        try {
            this.session = await ort.InferenceSession.create(this.modelPath)
            console.log("✅ ONNX Emotions Model loaded")
        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            throw error;
        }
    }

    /**
     * Processes the current facial blendshapes, predicts the emotion, and updates 
     * the smoothed `currentEmotion` state.
     *
     * @async
     * @param {Category[]} blendshapes Array of exactly 52 facial blendshapes from MediaPipe.
     * @returns {Promise<void>} 
     */
    async update(blendshapes: Category[]): Promise<void> {
        if (!blendshapes.length) return

        for (let i = 0; i < 52; i++) {
            this.scoresBuffer[i] = blendshapes[i].score
        }
        const rawEmotion = await this.predictCurrentEmotion(this.scoresBuffer)
        this.applyEmotionSmoothing(rawEmotion)
    }

    /**
     * Applies a moving-mode filter to smooth out sudden changes in emotion detection.
     * Updates the `currentEmotion` property.
     *
     * @private
     * @param {EmotionStatus} newEmotion The new raw predicted emotion from current frame.
     */
    private applyEmotionSmoothing(newEmotion: EmotionStatus){

        this.emotionHistory[this.writeIndex] = newEmotion
        this.writeIndex = (this.writeIndex + 1) % this.config.historyLimit

        if (this.historySize < this.config.historyLimit) {
            this.historySize++
        }

        const frequency = this.frequencyBuffer
        for (const key in frequency) {
            frequency[key] = 0 
        }

        let maxCount = 0
        let dominantEmotion = newEmotion

        const len = this.historySize
        for (let i = 0; i < len; i++){
            const emotion = this.emotionHistory[i]

            const currentCount = (frequency[emotion] || 0) + 1
            frequency[emotion] = currentCount
            if (currentCount > maxCount) {
                maxCount = currentCount
                dominantEmotion = emotion as EmotionStatus
            }
        }

        this.currentEmotion = dominantEmotion
    }

    /**
     * Runs inference on the ONNX model using the provided blendshape scores.
     *
     * @private
     * @async
     * @param {Float32Array} scores A flat array of 52 blendshape scores.
     * @returns {Promise<EmotionStatus>} The predicted emotion, defaulting to "NEUTRAL" on failure.
     */
    private async predictCurrentEmotion(scores: Float32Array): Promise<EmotionStatus> {
        try {
            if (scores.length !== 52){
                console.warn(`Expected 52 scores, but got ${scores.length}`);
            }
            
            const inputTensor = new ort.Tensor("float32", scores, [1, 52])

            const result = await this.session.run({
                float_input: inputTensor
            }, ["output_label"])
            const predicted = result.output_label?.data[0] as EmotionStatus;

            inputTensor.dispose();
            (result.output_label as ort.Tensor).dispose();

            return predicted || "NEUTRAL"

        } catch (error) {
            console.error(error);
            return "NEUTRAL"
        }
    }

    /** Release the inference session and the underlying resources of onnx model */
    destroy(): void {
        if (this.session){
            try {
                this.session.release()
            } catch (error) {
                console.error("Failed to release ONNX Emotions model", error)
            }
        }
    }
}