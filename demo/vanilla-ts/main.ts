import { AttentionMonitor, type AttentionResult } from "attention-tracker";

import { Visualizer } from "./visualizers/Visualizer"
import { rad2degScalar, clamp } from "@/utils/helpers"

const video = document.getElementById("webcam") as HTMLVideoElement
const canvas = document.getElementById("overlay") as HTMLCanvasElement
const stats = document.getElementById("stats") as HTMLDivElement
const toggleBtn = document.getElementById("toggle-view") as HTMLButtonElement

const ctx = canvas.getContext("2d")!
const visualizer = new Visualizer()

let isViewVisible = true
toggleBtn.addEventListener("click", ()=>{
    isViewVisible = !isViewVisible
    canvas.style.display = isViewVisible ? "block" : "none"
    video.style.display = isViewVisible ? "none" : "block"

    toggleBtn.innerHTML = isViewVisible ? "Hide Visuals" : "Show Visuals"
})

const cPen = (val: number) => `<span style="color: ${val > 0 ? '#ff3366' : '#555'}">-${val.toFixed(2)}</span>`
const cSig = (val: number, thresh: number) => {
    const isHigh = val >= thresh
    return `<span style="color: ${isHigh ? '#ffaa00' : '#00ffcc'}">${val.toFixed(3)}</span> <span style="color: #666">(th: ${thresh.toFixed(3)})</span>`
}
const cPerc = (val: number) => `<span style="color: ${val > 0.15 ? '#ff3366' : '#00ffcc'}">${(val * 100).toFixed(1)}%</span>`

const statusColors: Record<string, string> = {
    DISTRACTED: '#ffaa00',
    FATIGUED: '#ffaa00',
    MICROSLEEP: '#ff3366',
    DROWSY: '#ff3366',
}

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: 1280,
                height: 720,
                facingMode: "user"
            }
        })
    
        video.srcObject = stream
        
        return new Promise<void>((resolve) => {
            video.onloadedmetadata = async () => {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                await video.play()
                resolve()
            }
        })
    } catch (error: any) {
        throw new Error(error.message || "Camera access denied")
    }
}

async function main() {
    try {
        await setupCamera()
    } catch (error: any) {
        stats.innerHTML = `<div style="padding: 20px; background: rgba(255,0,0,0.2); color: #ff3366; border-radius: 8px;">
            <h3>⚠️ WEBCAM ERROR</h3>
            <p>${error.message}. Please allow camera access and reload.</p>
        </div>`
        return
    }

    const monitor = await AttentionMonitor.create({
        worker: true,
        backend: "GPU",
        gazeStrategy: "auto"
    })
    
    monitor.on("attention", (result: AttentionResult) => {
        if (isViewVisible) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            visualizer.draw(ctx, video, result)
        }

        if (result.snapshot.isFaceLost) {
            stats.innerHTML = `<div style="padding: 20px; background: rgba(255,0,0,0.2); color: #ff3366; border-radius: 8px;"><h3>⚠️ FACE LOST</h3></div>`
            return
        }

        const sig = result.signals
        const pen = result.details.penalties
        const direct = result.details.direction
        const cal = result.calibration

        const gaze = direct.gazeVector || [0, 0, 0]
        const gYaw = rad2degScalar(Math.atan2(gaze[0], Math.abs(gaze[2]) + 1e-6)).toFixed(2)
        const gPitch = rad2degScalar(Math.asin(clamp(-gaze[1], -1, 1))).toFixed(2)
        const headang = direct.headAngles || [0, 0, 0]

        const titleColor = statusColors[result.status] || '#00ffcc'

        stats.innerHTML = `
            <div style="font-family: monospace; background: #1a1a1a; padding: 20px; border-radius: 12px; border: 1px solid #333;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 15px;">
                    <h2 style="margin: 0; color: ${titleColor}">
                        Status: ${result.status}
                    </h2>
                    <h2 style="margin: 0; color: white;">Score: ${result.score.toFixed(3)}</h2>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; color: #ccc; font-size: 15px; line-height: 1.6;">
                    
                    <div>
                        <b style="color: white;">🔴 Active Penalties</b><br>
                        Gaze: ${cPen(pen.gaze)}<br>
                        PERCLOS: ${cPen(pen.perclos)}<br>
                        Yawn: ${cPen(pen.yawn)}<br>
                        Emotion Mod: <span style="color: ${pen.emotionModifier < 1 ? '#00ffcc' : '#ccc'}">x${pen.emotionModifier.toFixed(2)}</span><br>
                        
                        <br><b style="color: white;">📊 Raw Signals</b><br>
                        Emotion: <span style="color: white">${sig.emotion}</span><br>
                        EAR: ${cSig(sig.raw.ear, sig.blink.threshold)}<br>
                        MAR: ${cSig(sig.raw.mar, sig.yawn.threshold)}<br>
                        PERCLOS: ${cPerc(sig.blink.perclos)}<br>
                    </div>

                    <div>
                        <b style="color: white;">📐 Directions & Calibration</b><br>
                        Current Yaw/Pitch: ${gYaw}° / ${gPitch}°<br>
                        Head Angles: ${headang.map(v=> v.toFixed(1)).join('° | ')}°<br>
                        Base Gaze Yaw/Pitch: <span style="color: #888">${cal.gazeYaw.toFixed(1)}° / ${cal.gazePitch.toFixed(1)}°</span><br>                        
                        Base Variance (Gaze/Head): <span style="color: #888">${cal.baseGazeStd.toFixed(1)} / ${cal.baseHeadStd.toFixed(1)}</span><br>
                        
                        <br><b style="color: white;">⚙️ System</b><br>
                        State: ${cal.isCalibrated ? "<span style='color:#00ffcc'>✅ Calibrated</span>" : "<span style='color:#ffaa00'>⏳ Gathering...</span>"}<br>
                        Model: <span style="color: ${sig.performance.isDowngraded ? '#ff3366' : '#00ffcc'}">${sig.performance.activeModel}</span><br>
                        Latency: ${sig.performance.latency.toFixed(1)} ms
                    </div>
                </div>
            </div>
        `
    })

    monitor.on("error", (error)=>{
        console.error(error)
    })

    monitor.start(video)
}

main()