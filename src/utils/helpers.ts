const RAD_TO_DEG = 180 / Math.PI
const DEG_TO_RAD = Math.PI / 180

export function mean(arr: readonly number[] | Float32Array): number {
    const len= arr.length 
    if (len <= 1) return 0

    let sum = 0
    for (let i = 0; i < len; i++){
        sum += arr[i]!
    }
    return sum / len
}

function quickselect(arr: number[] | Float32Array, k: number, left: number, right: number): number {
    while (left < right) {
        let pivotIndex = left + Math.floor(Math.random() * (right - left + 1))
        const pivotValue = arr[pivotIndex]!
        
        arr[pivotIndex] = arr[right]!
        arr[right] = pivotValue
        
        let storeIndex = left
        for (let i = left; i < right; i++) {
            if (arr[i]! < pivotValue) {
                const tmp = arr[i]!
                arr[i] = arr[storeIndex]!
                arr[storeIndex] = tmp
                storeIndex++
            }
        }
        
        arr[right] = arr[storeIndex]!
        arr[storeIndex] = pivotValue

        if (storeIndex === k) {
            return arr[k]!
        } else if (storeIndex < k) {
            left = storeIndex + 1
        } else {
            right = storeIndex - 1
        }
    }
    return arr[left]!
}

export function median(arr: number[] | Float32Array): number {
    const len = arr.length
    if (!len) return 0
    
    const mid = Math.floor(len / 2)
    const workArr = arr instanceof Float32Array ? arr.slice() : [...arr] 

    if (len % 2 !== 0) {
        return quickselect(workArr, mid, 0, len - 1)
    } else {
        const a = quickselect(workArr, mid - 1, 0, len - 1)
        let b = workArr[mid]!
        for (let i = mid + 1; i < len; i++) {
            if (workArr[i]! < b) b = workArr[i]!
        }
        return (a + b) / 2
    }
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

export function rad2degScalar(rad: number) {
    return rad * RAD_TO_DEG
}

export function deg2radScalar(deg: number) {
    return deg * DEG_TO_RAD
}

export function std(arr: number[] | Float32Array) {
    const len= arr.length 
    if (len <= 1) return 0
    
    let sum = 0
    let sumSq = 0

    for (let i = 0; i < len; i++){
        const val = arr[i]
        sum += val
        sumSq += val * val
    }
    const meanVal = sum / len
    const variance = (sumSq/len) - (meanVal * meanVal)

    return variance <= 0 ? 0 : Math.sqrt(variance)
}

export function weighted_average(values: number[], weights: number[]): number{
    const len = values.length
    if (!len || len !== weights.length) return 0

    let sum = 0
    let weightSum = 0

    for (let i=0; i< len; i++){
        const w = weights[i]!;
        sum += values[i]! * w
        weightSum += w
    }

    return weightSum === 0 ? 0 : sum / weightSum
}