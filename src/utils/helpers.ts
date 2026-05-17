
export function mean(arr: readonly number[]): number {
    if (!arr.length || arr.length <= 1) return 0

    let sum = 0
    for (let i = 0; i < arr.length; i++){
        sum += arr[i]!
    }
    return sum / arr.length
}

export function median(arr: readonly number[]): number {
    if (!arr.length) return 0
    const sorted = [... arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)

    return sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]! / 2)
        : sorted[mid]!
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

export function rad2degScalar(rad: number) {
    return rad * (180 / Math.PI)
}

export function deg2radScalar(deg: number) {
    return deg * (Math.PI / 180)
}

export function std(arr: number[]) {
    if (!arr.length || arr.length <= 1) return 0
    
    const mean_val = mean(arr)
    
    let squaredDiff = 0
    for (let i = 0; i < arr.length; i++){
        const diff = arr[i]! - mean_val
        squaredDiff += (diff ** 2)         
    }

    return Math.sqrt(squaredDiff/arr.length)
}

export function weighted_average(values: number[], weights: number[]): number{
    if (!values.length || !weights.length || values.length !== weights.length) {
        return 0
    }

    let sum = 0
    let weightSum = 0

    for (let i=0; i< values.length; i++){
        sum += values[i]! * weights[i]!
        weightSum += weights[i]!
    }

    return weightSum === 0 ? 0 : sum / weightSum
}