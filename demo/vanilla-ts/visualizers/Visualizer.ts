import type { TrackerSnapshot, AttentionResult } from "attention-tracker"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import { RealtimeGraph } from "./RealtimeGraph"

export class Visualizer {
    private earGraph = new RealtimeGraph("EAR", 100, 0.0, 0.8, "#00ffcc")
    private marGraph = new RealtimeGraph("MAR", 100, 0.0, 3, "#ff3366")
    private perfGraph = new RealtimeGraph("Latency", 100, 0, 150, "#ffcc00")

    draw(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, result: AttentionResult) {
        const w = ctx.canvas.width
        const h = ctx.canvas.height
        
        const scale = Math.max(0.8, w / 800) 

        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(video, 0, 0, w, h)

        if (result.signals) {
            this.earGraph.push(result.signals.raw.ear, result.signals.blink.threshold)
            this.marGraph.push(result.signals.raw.mar, result.signals.yawn.threshold)
            this.perfGraph.push(result.signals.performance.latency)
        }

        if (result.snapshot.landmarks) {
            this.drawLandmarks(ctx, result.snapshot.landmarks, w, h, scale)
            this.drawDualGaze(ctx, result.snapshot, w, h, scale)
        }

        this.drawGraphs(ctx, w, h)
    }

    private drawLandmarks(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], w: number, h: number, scale: number) {
        ctx.fillStyle = "rgba(0, 255, 0, 0.4)"
        const dotSize = 2 * scale
        
        for (let i = 0; i < lm.length; i++) {
            if (i % 3 === 0) { 
                ctx.beginPath()
                ctx.arc(lm[i].x * w, lm[i].y * h, dotSize, 0, Math.PI * 2)
                ctx.fill()
            }
        }
    }

    private drawDualGaze(ctx: CanvasRenderingContext2D, snapshot: TrackerSnapshot, w: number, h: number, scale: number) {
        if (!snapshot.gaze || !snapshot.landmarks) return

        const [gx, gy, gz] = snapshot.gaze
        const leftEye = snapshot.landmarks[468]
        const rightEye = snapshot.landmarks[473]

        const length = 200 * scale 
        ctx.strokeStyle = "rgba(255, 50, 50, 0.8)"
        ctx.lineWidth = Math.max(1, (3 - gz * 5) * scale)

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
            ctx.arc(startX, startY, 3 * scale, 0, Math.PI * 2)
            ctx.fill()
        }

        if (leftEye) drawRay(leftEye)
        if (rightEye) drawRay(rightEye)
    }

    private drawGraphs(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const graphWidth = Math.min(300, w * 0.25) 
        const graphHeight = Math.min(100, h * 0.12)
        const padding = w * 0.015
        
        const startX = w - graphWidth - padding
        let startY = h - (graphHeight * 3) - (padding * 3)

        this.earGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
        startY += graphHeight + padding
        
        this.marGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
        startY += graphHeight + padding
        
        this.perfGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
    }
}