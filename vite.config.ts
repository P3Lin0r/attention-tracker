import {defineConfig} from "vite"
import path from "path"
import pkg from "./package.json"

const cleanVersion = (version: string) => version.replace(/[\^~]/g, '');

export default defineConfig({
    publicDir: path.resolve(__dirname, "./public"),
    resolve: {
        alias: {
            "attention-tracker": path.resolve(__dirname, "./src/index.ts"),
            "@": path.resolve(__dirname, "./src"),
            "@config": path.resolve(__dirname, "./src/config"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@detectors": path.resolve(__dirname, "./src/detectors"),
            "@analytics": path.resolve(__dirname, "./src/analytics"),
            "@core": path.resolve(__dirname, "./src/core"),
            "@workers": path.resolve(__dirname, "./src/workers"),
            "@hooks": path.resolve(__dirname, "./src/hooks"),
            "@api": path.resolve(__dirname, "./src/api")
        }
    },
    define: {
        global: "globalThis",
        __VERSION__: JSON.stringify(pkg.version),
        __MEDIAPIPE_VERSION__: JSON.stringify(cleanVersion(pkg.dependencies["@mediapipe/tasks-vision"])),
        __ONNX_VERSION__: JSON.stringify(cleanVersion(pkg.dependencies["onnxruntime-web"]))
    },
    server: {
        host: true,
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost']
    },
    worker: {
        format: "es"
    }
})