import type { TrackerSnapshot, AttentionResult } from "attention-tracker"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import { RealtimeGraph } from "./RealtimeGraph"

export class Visualizer {
    private earGraph = new RealtimeGraph("EAR", 100, 0.0, 0.8, "#00ffcc")
    private marGraph = new RealtimeGraph("MAR", 100, 0.0, 3, "#ff3366")

    drawOverlay(ctx: CanvasRenderingContext2D, result: AttentionResult) {
        const width = ctx.canvas.width
        const height = ctx.canvas.height

        ctx.clearRect(0, 0, width, height)

        if (result.snapshot.landmarks) {
            this.drawLandmarks(ctx, result.snapshot.landmarks, width, height)
            this.drawDualGaze(ctx, result.snapshot, width, height)
        }
    }

    updateGraphsData(result: AttentionResult) {
        if (result.signals) {
            this.earGraph.push(result.signals.raw.ear, result.signals.blink.threshold)
            this.marGraph.push(result.signals.raw.mar, result.signals.yawn.threshold)
        }
    }
    
    drawGraphs(ctx: CanvasRenderingContext2D) {
        const w = ctx.canvas.width
        const h = ctx.canvas.height
        ctx.clearRect(0, 0, w, h)

        const activeGraphs = [this.earGraph, this.marGraph]
        
        const count = activeGraphs.length
        if (count === 0) return

        const padding = 10
        
        const graphW = (w - padding * (count + 1)) / count
        const graphH = h - padding * 2

        for (let i = 0; i < count; i++) {
            const startX = padding + i * (graphW + padding)
            activeGraphs[i].draw(ctx, startX, padding, graphW, graphH)
        }
    }
    
    private drawLandmarks(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], w: number, h: number) {
        ctx.fillStyle = "rgba(0, 255, 0, 0.4)"
        for (let i = 0; i < lm.length; i++) {
            if (i % 3 === 0) { 
                ctx.beginPath()
                ctx.arc(lm[i].x * w, lm[i].y * h, 2, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    private drawDualGaze(ctx: CanvasRenderingContext2D, snapshot: TrackerSnapshot, w: number, h: number) {
        if (!snapshot.gaze || !snapshot.landmarks) return

        const [gx, gy, gz] = snapshot.gaze
        const leftEye = snapshot.landmarks[468]
        const rightEye = snapshot.landmarks[473]

        const length = 200 

        ctx.strokeStyle = "rgba(255, 50, 50, 0.8)"
        ctx.lineWidth = Math.max(1, 3 - gz * 5)

        const drawRay = (eye: NormalizedLandmark) => {
            const startX = eye.x * w
            const startY = eye.y * h
            const endX = startX + gx * length
            const endY = startY - gy * length

            ctx.beginPath()
            ctx.moveTo(startX, startY)
            ctx.lineTo(endX, endY)
            ctx.stroke()

            ctx.beginPath()
            ctx.fillStyle = "red"
            ctx.arc(startX, startY, 2, 0, Math.PI * 2)
            ctx.fill()
        }

        if (leftEye) drawRay(leftEye)
        if (rightEye) drawRay(rightEye)
    }
}