import { useEffect, useRef, useState } from 'react'
import { useAttentionMonitor } from 'attention-tracker'

export const MinimalDemo = () => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [camError, setCamError] = useState<string | null>(null)

    // hook usage
    const { result, isReady, error, start, stop } = useAttentionMonitor(videoRef, {
        worker: true,
        backend: "GPU",
        gazeStrategy: "auto"
    }, {
        // onUpdate(result) {
        //     console.log(result)
        // }
    })

    // getUserMedia on mount
    useEffect(() => {
        let stream: MediaStream | null = null
        
        const getMedia = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                }
            }
            catch (err: any) {
                console.error("Camera error:", err)
                setCamError(err.message || "Camera access denied or device not found.")
            }
        }
        getMedia()

        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        }
    }, [])

    if (camError) return <div className="error-msg">⚠️ WebCamera Error: {camError}</div>
    if (error) return <div className="error-msg">⚠️ Tracker Error: {error.message}</div>

    return (
        <div className="demo-wrapper">
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="demo-video"
            />
            
            {/* Logger */}
            <div className="demo-logger">
                {!isReady ? "Loading Models..." : (
                    <>
                        Status: <span style={{color: result?.score && result.score > 0.7 ? 'lime' : 'red'}}>
                            {result?.status || 'NOT_DETECTED'}
                        </span><br/>
                        Score: {result?.score.toFixed(3) || '0.000'}
                    </>
                )}
            </div>
        </div>
    )
}