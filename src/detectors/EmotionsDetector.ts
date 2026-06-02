import * as ort from "onnxruntime-web"
import type { EmotionConfig, EmotionStatus } from "@/types"
import { type Category } from "@mediapipe/tasks-vision"

export class EmotionsDetector {
    private session!: ort.InferenceSession

    readonly modelPath: string

    current_emotion: EmotionStatus = "NEUTRAL"
    private emotionHistory: Array<EmotionStatus>

    private scoresBuffer = new Float32Array(52)
    private frequencyBuffer: Record<string, number> = {}
    private historySize = 0
    private writeIndex = 0

    constructor(private config: EmotionConfig, modelPath: string) {
        this.emotionHistory = new Array<EmotionStatus>(this.config.historyLimit)
        this.modelPath = modelPath
    }

    async init(): Promise<void> {
        try {
            this.session = await ort.InferenceSession.create(this.modelPath)
            console.log("✅ ONNX Emotions Model loaded:");
        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            throw error;
        }
    }

    async update(blendshapes: Category[]): Promise<void> {
        if (!blendshapes.length) return

        for (let i = 0; i < 52; i++) {
            this.scoresBuffer[i] = blendshapes[i].score
        }
        const rawEmotion = await this.predictCurrentEmotion(this.scoresBuffer)
        this.applyEmotionSmoothing(rawEmotion)
    }

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

        this.current_emotion = dominantEmotion
    }

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
}