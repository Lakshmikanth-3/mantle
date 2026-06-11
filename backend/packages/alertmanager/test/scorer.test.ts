import { describe, it, expect } from 'vitest';
import { computeRiskScore } from '../src/scorer.js';

describe('Risk Scorer', () => {
  it('should compute a HIGH risk score for $5M unbacked exposure', () => {
    const data: any = {
      invariantFailures7d: 3,
      anomalyMinors7d: 5,
      nansenNetFlowUSD: -100_000,
      elfaNormalizedDelta: -0.5, // -50% drop = 10 points
      dvnThreshold: 1,
      dvnCount: 1, // 15 points
      tcFundedNewWallets: 2, // 6 points
    };
    const score = computeRiskScore('0xabc123', data);
    expect(score.score).toBeGreaterThanOrEqual(50); // 15+5+5+10+15+6 = 56
    expect(score.band).toBe('HIGH');
  });
});
