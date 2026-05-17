import { AttentionMonitor, type AttentionResult } from "../src/index"; // В реальності буде import { AttentionMonitor } from 'твоя-назва-npm'

const video = document.getElementById("webcam") as HTMLVideoElement;
const stats = document.getElementById("stats") as HTMLDivElement;

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
            width: 1280,
            height: 720,
            facingMode: "user"
        }
    })

    video.srcObject = stream
    await video.play()
}

async function main() {
    await setupCamera();

    // 1. Ініціалізація з конфігом!
    const monitor = await AttentionMonitor.create({
        worker: false,
        backend: "CPU",
        gazeStrategy: "openvino"
    });

    // 2. Підписка на результати
    monitor.on("attention", (result: AttentionResult) => {
        stats.innerHTML = `
            Status: <b>${result.status}</b> <br>
            Score: ${result.score.toFixed(2)}
        `;
    });

    // 3. Запуск
    monitor.start(video);
    
    // Коли треба зупинити:
    // monitor.stop();
}

main();