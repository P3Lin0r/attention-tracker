import { defineConfig } from "vite"
import path from "path"
import dts from "vite-plugin-dts"
import pkg from "./package.json"

const cleanVersion = (version: string) => version.replace(/[\^~]/g, '');

export default defineConfig({
    resolve: {
        alias: {
            "onnxruntime-web": path.resolve(__dirname, "./node_modules/onnxruntime-web/dist/ort.min.js"),

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
        __VERSION__: JSON.stringify(pkg.version),
        __MEDIAPIPE_VERSION__: JSON.stringify(cleanVersion(pkg.dependencies["@mediapipe/tasks-vision"])),
        __ONNX_VERSION__: JSON.stringify(cleanVersion(pkg.dependencies["onnxruntime-web"]))
    },

    build: {
        copyPublicDir: false,
        outDir: "dist",
        emptyOutDir: true,
        
        lib: {
            entry: path.resolve(__dirname, "src/index.ts"),
            name: "AttentionTracker",
            formats: ["es", "cjs"],
            fileName: (format) => `attention-tracker.${format === "es" ? "js" : "umd.cjs"}`
        },
        rolldownOptions: {
            external: [
                "@mediapipe/tasks-vision",
                "onnxruntime-web",
                'react', 'react-dom', 'react/jsx-runtime'
            ],
            output: {
                globals: {
                    "@mediapipe/tasks-vision": "MediaPipeTasksVision",
                    "onnxruntime-web": "ort",
                    "react": "React",
                    "react-dom": "ReactDOM"
                }
            }
        },

        sourcemap: true,
        target: "es2022",
    },

    plugins: [
        dts({
            include: ["src"],
            bundleTypes: false,
            tsconfigPath: "./tsconfig.json",
        })
    ]
})