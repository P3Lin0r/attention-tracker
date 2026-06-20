import { FaceTracker } from "@core/FaceTracker";
import type { MonitorConfig } from "@/types"

if (typeof (self as any).importScripts !== 'function') {
    (self as any).importScripts = () => {}; 
}

let tracker: FaceTracker

self.onmessage = async (e: MessageEvent) => {
    const {type, payload} = e.data;
    
    try {
        if (type == "INIT") {
            const config: MonitorConfig = payload.config
            tracker = new FaceTracker(config)
            await tracker.init()
            self.postMessage({type: "INIT_DONE"})
        }
    
        if (type == "PROCESS") {
            const imageBitmap = payload.image as ImageBitmap
            await tracker.process(imageBitmap)
    
            const snapshot = tracker.getSnapshot()
            const signals = tracker.getSignals()
            
            self.postMessage({
                type: "RESULT",
                payload: { snapshot, signals }
            })
    
            imageBitmap.close()
        }
    
        if (type == "DESTROY") {
            if (tracker) {
                tracker.destroy()
            }
    
            self.postMessage({type: "DESTROY_DONE"})
            self.close()
        }
    } catch (error) {
        console.error("[TrackerWorker] Pipeline Error:", error)
        self.postMessage({
            type: "ERROR",
            payload: { message: error instanceof Error ? error.message : String(error) }
        })
    }
}

self.addEventListener("unhandledrejection", (event)=>{
    self.postMessage({
        type: "ERROR",
        payload: { message: `Unhandled Worker Rejection: ${event.reason}` }
    })
})