import { TrainingEntry } from './types.js';

/**
 * Computes an automatic quality score (0.1 – 1.0) for a training entry.
 *
 * Rules:
 *  - Output too short (< 20 chars)              → 0.1  (penalise hard)
 *  - Output short (20-49 chars)                 → -0.2
 *  - Output substantive (200+ chars)            → +0.1
 *  - Output very long (500+ chars)              → +0.1 extra
 *  - Conversation with 3+ turns                 → +0.1
 *  - Conversation with 6+ turns                 → +0.1 extra
 *  - Tweet with any engagement                  → +0 to +0.3 (logarithmic)
 *  - Study / code_analysis / opinion entries    → +0.1 bonus (high-value types)
 */
export const computeQualityScore = (entry: TrainingEntry): number => {
  const outputLen = entry.output.trim().length;

  if (outputLen < 20) return 0.1;

  let score = 0.5;

  if (outputLen < 50) {
    score -= 0.2;
  } else if (outputLen >= 500) {
    score += 0.2;
  } else if (outputLen >= 200) {
    score += 0.1;
  }

  const convLen = entry.context?.conversationLength ?? 0;
  if (convLen >= 6) {
    score += 0.2;
  } else if (convLen >= 3) {
    score += 0.1;
  }

  if (entry.type === 'tweet_write') {
    const eng = entry.metadata?.tweetEngagement;
    if (eng) {
      const total = (eng.likes ?? 0) + (eng.retweets ?? 0) * 2 + (eng.replies ?? 0) * 1.5;
      if (total > 0) {
        score += Math.min(0.3, Math.log10(total + 1) * 0.15);
      }
    }
  }

  if (entry.type === 'study' || entry.type === 'code_analysis' || entry.type === 'opinion') {
    score += 0.1;
  }

  return Math.max(0.1, Math.min(1.0, parseFloat(score.toFixed(2))));
};
