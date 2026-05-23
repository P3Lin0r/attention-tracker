import {defineConfig} from "vite"
import path from "path"

export default defineConfig({
    root: "./demo",
    publicDir: "public",
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@config": path.resolve(__dirname, "./src/config"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@detectors": path.resolve(__dirname, "./src/detectors"),
            "@analytics": path.resolve(__dirname, "./src/analytics"),
            "@core": path.resolve(__dirname, "./src/core"),
            "@workers": path.resolve(__dirname, "./src/workers"),
            "@api": path.resolve(__dirname, "./src/api")
        }
    },
    server: {
        host: true,
        allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost']
    },
    worker: {
        format: "es"
    },
    define: {
        global: "globalThis"
    },
})