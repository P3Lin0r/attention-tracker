import type { AttentionResult } from "attention-tracker"

export class GroupAnalytics {
    static updateGlobalStats(
        latestResults: Map<string, AttentionResult>, 
        globalScoreEl: HTMLElement, 
        globalStatusEl: HTMLElement
    ) {
        if (latestResults.size === 0) return
        
        let totalScore = 0
        let activeParticipants = 0
        
        const statusCounts = {
            MICROSLEEP: 0, DROWSY: 0, FATIGUED: 0,
            DISTRACTED: 0, ADHD: 0, NORMAL: 0
        }
    
        latestResults.forEach((result) => {
            if (result.status !== "NOT_DETECTED") {
                totalScore += result.score
                activeParticipants++
                if (statusCounts[result.status as keyof typeof statusCounts] !== undefined) {
                    statusCounts[result.status as keyof typeof statusCounts]++
                }
            }
        })
    
        if (activeParticipants === 0) {
            globalScoreEl.innerText = "0.00";
            globalStatusEl.innerText = "NO FACES DETECTED";
            globalStatusEl.style.color = "gray";
            return;
        }
    
        const averageScore = totalScore / activeParticipants;
        globalScoreEl.innerText = averageScore.toFixed(3);
    
        const fatigueRatio = (statusCounts.MICROSLEEP + statusCounts.DROWSY + statusCounts.FATIGUED) / activeParticipants;
        const distractedRatio = statusCounts.DISTRACTED / activeParticipants;
        const adhdRatio = statusCounts.ADHD / activeParticipants;
    
        if (statusCounts.MICROSLEEP > 0 || fatigueRatio > 0.25) {
            globalStatusEl.innerText = "AUDIENCE FALLING ASLEEP ⚠️";
            globalStatusEl.style.color = "#ff0000";
        } else if (distractedRatio > 0.4 || averageScore < 0.5) {
            globalStatusEl.innerText = "HIGHLY DISTRACTED 📉";
            globalStatusEl.style.color = "#ffaa00";
        } else if (adhdRatio > 0.3 && averageScore >= 0.7) {
            globalStatusEl.innerText = "AUDIENCE RESTLESS 🌪️";
            globalStatusEl.style.color = "#ffcc00";
        } else if (averageScore >= 0.75 && fatigueRatio < 0.1) {
            globalStatusEl.innerText = "HIGHLY ENGAGED ✅";
            globalStatusEl.style.color = "#00ffcc";
        } else {
            globalStatusEl.innerText = "LOSING FOCUS 📉";
            globalStatusEl.style.color = "#ff8800";
        }
    }
}