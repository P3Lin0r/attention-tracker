import { AttentionMonitor, type AttentionResult } from "attention-tracker";
import { Visualizer } from "./visualizers/Visualizer";
import { GroupAnalytics } from "./GroupAnalytics";

const VIDEO_SOURCES: string[] = [
    // "./videos/your-video.mp4"
]

const latestResults = new Map<string, AttentionResult>()
const gridElement = document.getElementById("video-grid")!
const globalScoreElement = document.getElementById("global-score")!
const globalStatusElement = document.getElementById("global-status")!
const toggleBtn = document.getElementById("toggle-visuals")!

let isVisualsEnabled = true

toggleBtn.addEventListener("click", ()=>{
    isVisualsEnabled = !isVisualsEnabled
    toggleBtn.innerHTML = isVisualsEnabled ? "Hide Visuals" : "Show Visuals"
    gridElement.classList.toggle("hide-visuals", !isVisualsEnabled)
})

function getSeverityClass(type: "score" | "perclos" | "status" | "yawn", value: string | number): string {
    switch (type) {
        case "score":
            const score = value as number
            if (score >= 0.7) return "text-good"
            if (score >= 0.4) return "text-warning"
            return "text-danger"
            
        case "perclos":
            const perclos = value as number
            if (perclos < 0.1) return "text-good"
            if (perclos < 0.15) return "text-warning"
            return "text-danger"

        case "status":
            const status = value as string
            if (["NORMAL", "FOCUSED", "THINKING"].includes(status)) return "text-good"
            if (["DISTRACTED", "FATIGUED", "ADHD"].includes(status)) return "text-warning"
            if (["DROWSY", "MICROSLEEP"].includes(status)) return "text-danger"
            return ""

        case "yawn":
            const yawnStatus = value as string
            return yawnStatus === "YAWNING" ? "text-warning" : "text-good"
            
        default:
            return ""
    }
}

async function createParticipantCard(videoSrc: string, index: number) {
    const card = document.createElement("div")
    card.className = "participant-card status-NOT_DETECTED"

    card.innerHTML = `
        <div class="video-wrapper">
            <video autoplay loop muted playsinline src="${videoSrc}"></video>
            <canvas class="overlay-canvas"></canvas>
        </div>
        <div class="stats-panel">
            <div class="stats-text">
                <div class="column-left">Participant: <strong>#${index + 1}</strong></div>
                <div class="column-right">Status: <strong class="local-status">LOADING...</strong></div>
                
                <div class="column-left">Score: <strong class="local-score">0.00%</strong></div>
                <div class="column-right">Emotion: <strong class="local-emotion">N/A</strong></div>
                
                <div class="column-left">PERCLOS: <strong class="local-perclos">0%</strong></div>
                <div class="column-right">Blinks: <strong class="local-blinks">N/A</strong></div>
                
                <div class="column-left">Yawn: <strong class="local-yawn">NORMAL</strong></div>
                <div class="column-right">Penalties: <strong class="local-penalties">0;0;0</strong></div>
                
                <div class="column-left" style="grid-column: span 2;">Model: <strong class="local-model">N/A</strong></div>
                <div class="column-left" style="grid-column: span 2; color: #888;">Base: <span class="local-calib">Calibrating...</span></div>
            </div>
            <canvas class="graphs-canvas"></canvas>
        </div>
    `
    gridElement.appendChild(card)

    const video = card.querySelector("video") as HTMLVideoElement
    const overlayCanvas = card.querySelector(".overlay-canvas") as HTMLCanvasElement
    const graphsCanvas = card.querySelector(".graphs-canvas") as HTMLCanvasElement
    
    const els = {
        status: card.querySelector(".local-status") as HTMLElement,
        score: card.querySelector(".local-score") as HTMLElement,
        emotion: card.querySelector(".local-emotion") as HTMLElement,
        blinks: card.querySelector(".local-blinks") as HTMLElement,
        perclos: card.querySelector(".local-perclos") as HTMLElement,
        yawn: card.querySelector(".local-yawn") as HTMLElement,
        model: card.querySelector(".local-model") as HTMLElement,
        calib: card.querySelector(".local-calib") as HTMLElement,
        penal: card.querySelector(".local-penalties") as HTMLElement,
    }

    await new Promise((resolve) => {
        video.onloadeddata = resolve
    })

    const overlayCtx = overlayCanvas.getContext("2d")!
    const graphsCtx = graphsCanvas.getContext("2d")!
    const visualizer = new Visualizer()

    try {
        const monitor = await AttentionMonitor.create({
            worker: true, 
            backend: "GPU",
            gazeStrategy: "auto"
        })

        monitor.on("attention", (result: AttentionResult) => {
            latestResults.set(videoSrc, result)
            
            card.className = `participant-card status-${result.status}`
            
            els.status.innerText = result.status
            els.status.className = `local-status ${getSeverityClass("status", result.status)}`
            
            els.score.innerText = `${(result.score * 100).toFixed(1)}%`
            els.score.className = `local-score ${getSeverityClass("score", result.score)}`
            
            if (result.signals) {
                els.emotion.innerText = result.signals.emotion
                
                els.blinks.innerText = result.signals.blink.status
                els.blinks.className = `local-blinks ${getSeverityClass("status", result.signals.blink.status)}`
                
                els.perclos.innerText = `${(result.signals.blink.perclos * 100).toFixed(1)}%`
                els.perclos.className = `local-perclos ${getSeverityClass("perclos", result.signals.blink.perclos)}`
                
                els.yawn.innerText = result.signals.yawn.status
                els.yawn.className = `local-yawn ${getSeverityClass("yawn", result.signals.yawn.status)}`

                const perf = result.signals.performance
                els.model.innerText = `${perf.activeModel} ${perf.isDowngraded ? '(Downgraded)' : ''}`
                els.model.style.color = perf.isDowngraded ? "#ffaa00" : "#00ffcc"
            }

            if (result.details.penalties) {
                els.penal.innerHTML = `G: ${(result.details.penalties.gaze).toFixed(2)} P: ${(result.details.penalties.perclos).toFixed(2)} Y: ${(result.details.penalties.yawn).toFixed(2)}`
            }

            if (result.calibration.isCalibrated) {
                const b = result.calibration
                els.calib.innerText = `Y: ${b.gazeYaw.toFixed(1)}° | P: ${b.gazePitch.toFixed(1)}°`
                els.calib.style.color = "#aaa"
            } else {
                els.calib.innerText = "Gathering baseline..."
                els.calib.style.color = "#ffaa00"
            }

            if (isVisualsEnabled) {
                if (overlayCanvas.width !== video.videoWidth) {
                    overlayCanvas.width = video.videoWidth
                    overlayCanvas.height = video.videoHeight
                }
                visualizer.drawOverlay(overlayCtx, result)
    
                graphsCanvas.width = graphsCanvas.clientWidth
                graphsCanvas.height = 100
                visualizer.updateGraphsData(result)
                visualizer.drawGraphs(graphsCtx)
            } else {
                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
                graphsCtx.clearRect(0, 0, graphsCanvas.width, graphsCanvas.height)
            }

            GroupAnalytics.updateGlobalStats(latestResults, globalScoreElement, globalStatusElement)
        })

        monitor.start(video)

    } catch (error) {
        console.error(`Failed to init tracker for participant ${index + 1}:`, error)
        els.status.innerText = "ERROR"
        els.status.style.color = "red"
    }
}

async function main() {
    if (VIDEO_SOURCES.length === 0){
        console.error("Add videos relative paths to the VIDEO_SOURCES")
    }

    for (let i = 0; i < VIDEO_SOURCES.length; i++) {
        await createParticipantCard(VIDEO_SOURCES[i], i)
    }
}

main()