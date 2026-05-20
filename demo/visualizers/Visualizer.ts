import type { TrackerSnapshot, AttentionResult } from "../../src/index"
import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import { RealtimeGraph } from "./RealtimeGraph"

export class Visualizer {
    private earGraph = new RealtimeGraph("EAR", 100, 0.0, 0.8, "#00ffcc")
    private marGraph = new RealtimeGraph("MAR", 100, 0.0, 3, "#ff3366")
    private perfGraph = new RealtimeGraph("Latency (ms)", 100, 0, 150, "#ffcc00")

    draw(
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        result: AttentionResult,
    ) {
        const width = ctx.canvas.width
        const height = ctx.canvas.height

        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(video, 0, 0, width, height)

        if (result.signals) {
            this.earGraph.push(result.signals.raw.ear, result.signals.blink.threshold)
            this.marGraph.push(result.signals.raw.mar, result.signals.yawn.threshold)
            this.perfGraph.push(result.signals.performance.latency)
        }

        if (result.snapshot.landmarks) {
            this.drawLandmarks(ctx, result.snapshot.landmarks, width, height)
            this.drawDualGaze(ctx, result.snapshot, width, height)
        }

        this.drawOverlayStats(ctx, result)
        this.drawGraphs(ctx, width, height)
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

    private drawGraphs(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const graphWidth = 200
        const graphHeight = 60
        const padding = 10
        
        const startX = w - graphWidth - padding
        let startY = h - (graphHeight * 3) - (padding * 3)

        this.earGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
        startY += graphHeight + padding
        
        this.marGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
        startY += graphHeight + padding
        
        this.perfGraph.draw(ctx, startX, startY, graphWidth, graphHeight)
    }

    private drawOverlayStats(
        ctx: CanvasRenderingContext2D,
        result: AttentionResult
    ) {
        const signals = result.signals
        const activeModel = signals.performance.activeModel

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"
        ctx.fillRect(10, 10, 260, 160)

        ctx.fillStyle = "white"
        ctx.font = "14px monospace"
        
        let yPos = 30
        const step = 20

        ctx.fillText(`Status: ${result.status}`, 20, yPos); yPos += step
        ctx.fillText(`Score: ${(result.score * 100).toFixed(1)}%`, 20, yPos); yPos += step
        
        // Signals
        ctx.fillText(`Emotion: ${signals.emotion || "N/A"}`, 20, yPos); yPos += step
        ctx.fillText(`Blinks: ${signals.blink.status || "N/A"}`, 20, yPos); yPos += step
        ctx.fillText(`PERCLOS: ${(signals.blink.perclos * 100 || 0).toFixed(1)}%`, 20, yPos); yPos += step

        // Gaze Model
        ctx.fillStyle = result.signals.performance.isDowngraded ? "#ff3366" : "#00ffcc"
        ctx.fillText(`Gaze Model: ${activeModel} ${result.signals.performance.isDowngraded ? "(Downgraded)" : ""}`, 20, yPos); yPos += step

        // Calibrate
        if (result.calibration.isCalibrated) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
            const base = result.calibration
            ctx.fillText(`Base Y/P: ${base.yaw.toFixed(1)} / ${base.pitch.toFixed(1)}`, 20, yPos)
        } else {
            ctx.fillStyle = "yellow"
            ctx.fillText(`Calibrating...`, 20, yPos)
        }
    }
}