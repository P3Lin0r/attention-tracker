import { AttentionMonitor, type AttentionResult } from "../src/index";
import { Visualizer } from "./visualizers/Visualizer"

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const stats = document.getElementById("stats") as HTMLDivElement;

const ctx = canvas.getContext("2d")!
const visualizer = new Visualizer()

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
            width: 1280,
            height: 720,
            facingMode: "user"
        }
    })

    video.srcObject = stream;
    
    return new Promise<void>((resolve) => {
        video.onloadedmetadata = async () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            await video.play();
            resolve();
        };
    });
}

async function main() {
    await setupCamera();

    const monitor = await AttentionMonitor.create({
        worker: false,
        backend: "CPU",
        gazeStrategy: "openvino"
    });

    monitor.on("attention", (
        result: AttentionResult,
    ) => {
        visualizer.draw(ctx, video, result)

        stats.innerHTML = `
            Status: <b>${result.status}</b> <br>
            Score: ${result.score.toFixed(2)}
        `;
    });

    monitor.start(video);
}

main();