export class RealtimeGraph {
    private history: number[] = []
    private thresholdHistory: number[] = []
    private capacity: number
    private minVal: number
    private maxVal: number
    private color: string
    private label: string

    constructor(label: string, capacity: number, minVal: number, maxVal: number, color: string) {
        this.label = label
        this.capacity = capacity
        this.minVal = minVal
        this.maxVal = maxVal
        this.color = color
    }

    push(value: number, threshold?: number) {
        this.history.push(value)
        if (this.history.length > this.capacity) {
            this.history.shift()
        }
        if (threshold !== undefined){
            this.thresholdHistory.push(threshold)
            if (this.thresholdHistory.length > this.capacity) {
                this.thresholdHistory.shift()
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
        ctx.fillRect(x, y, width, height)

        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, width, height)

        ctx.fillStyle = this.color
        ctx.font = "11px monospace"
        const currentVal = this.history.length ? this.history[this.history.length - 1].toFixed(3) : "0.000"
        let headerText = `${this.label}: ${currentVal}`

        if (this.thresholdHistory.length > 0) {
            const currentThresh = this.thresholdHistory[this.thresholdHistory.length - 1].toFixed(2)
            headerText += ` (th: ${currentThresh})`
        }
        ctx.fillText(headerText, x + 5, y + 14)

        if (this.history.length < 2) return

        const stepX = width / (this.capacity - 1)
        const range = this.maxVal - this.minVal

        if (this.thresholdHistory.length >= 2) {
            ctx.save()
            ctx.beginPath()
            ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"
            ctx.setLineDash([3, 3])
            ctx.lineWidth = 1

            for (let i = 0; i < this.thresholdHistory.length; i++) {
                const clampedVal = Math.max(this.minVal, Math.min(this.maxVal, this.thresholdHistory[i]))
                const normalizedY = (clampedVal - this.minVal) / (range || 1)
                
                const px = x + i * stepX
                const py = y + height - (normalizedY * height)

                if (i === 0) ctx.moveTo(px, py)
                else ctx.lineTo(px, py)
            }
            ctx.stroke()
            ctx.restore()
        }
        
        ctx.beginPath()
        ctx.strokeStyle = this.color
        ctx.lineWidth = 1.5

        for (let i = 0; i < this.history.length; i++) {
            const clampedVal = Math.max(this.minVal, Math.min(this.maxVal, this.history[i]))
            const normalizedY = (clampedVal - this.minVal) / range
            
            const px = x + i * stepX
            const py = y + height - (normalizedY * height)

            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
        }
        ctx.stroke()
    }
}