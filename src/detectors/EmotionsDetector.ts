import {EMOTIONS_MODEL_PATH} from "@config/constants" 
import * as ort from "onnxruntime-web"

import { type Category } from "@mediapipe/tasks-vision"

export type EmotionStatus = "NEUTRAL" | "HAPPY" | "SAD" | "THINKING" | "FOCUSED"

export class EmotionsDetector {
    private session!: ort.InferenceSession

    current_emotion: EmotionStatus = "NEUTRAL"
    blendshapesMap: Record<string, number> = {}

    private emotionHistory: EmotionStatus[] = []
    private readonly HISTORY_LIMIT = 5

    async init(): Promise<void> {
        try {
            this.session = await ort.InferenceSession.create(EMOTIONS_MODEL_PATH)
            console.log("✅ ONNX Emotions Model loaded:");
        } catch (error) {
            console.error("Failed to load ONNX model:", error);
            throw error;
        }
    }

    async update(blendshapes: Category[]): Promise<void> {
        this.blendshapesMap = blendshapes.reduce<Record<string, number>>(
            (acc, bs)=> {
                acc[bs.categoryName] = bs.score
                return acc
            }, {}
        )

        const scores = blendshapes.map((bs) => bs.score)
        const rawEmotion = await this.predictCurrentEmotion(scores)
        this.applyEmotionSmoothing(rawEmotion)
    }

    private applyEmotionSmoothing(newEmotion: EmotionStatus){
        this.emotionHistory.push(newEmotion)
        if (this.emotionHistory.length > this.HISTORY_LIMIT) {
            this.emotionHistory.shift()
        }

        const frequency: Partial<Record<EmotionStatus, number>> = {}
        for (const emotion of this.emotionHistory){
            frequency[emotion] = (frequency[emotion] || 0) + 1
        }

        let maxCount = 0
        let dominantEmotion = newEmotion

        for (const [emo, count] of Object.entries(frequency)){
            if (count && count > maxCount){
                maxCount = count
                dominantEmotion = emo as EmotionStatus
            }
        }

        if (maxCount >= 3 || this.emotionHistory.length < 3) {
            this.current_emotion = dominantEmotion
        }
    }

    private async predictCurrentEmotion(scores: number[]): Promise<EmotionStatus> {
        try {
            if (scores.length !== 52){
                console.warn(`Expected 52 scores, but got ${scores.length}`);
            }
            
            const inputTensor = new ort.Tensor(
                "float32",
                Float32Array.from(scores),
                [1, 52]
            )

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