/**
 * Risk Score Computation — SENTINEL PRD §10
 *
 * Composite risk score (0–100, lower = safer) from 5 signal components:
 *   1. invariantHealth    0–30: recent invariant check pass rate
 *   2. smartMoneyFlow     0–25: Nansen smart money direction
 *   3. socialSentiment    0–20: Elfa sentiment vs 7d baseline
 *   4. configurationRisk  0–15: DVN setup, multisig threshold
 *   5. stagingSignals     0–10: TC-funded wallets interacting with bridge
 */

export type RiskBand = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export interface RiskComponents {
  invariantHealth: number;    // 0–30
  smartMoneyFlow: number;     // 0–25
  socialSentiment: number;    // 0–20
  configurationRisk: number;  // 0–15
  stagingSignals: number;     // 0–10
}

export interface ProtocolData {
  // Invariant health inputs
  invariantFailures7d: number;  // count of ALERT-level failures in 7 days
  anomalyMinors7d: number;      // count of ANOMALY_MINOR in 7 days

  // Nansen inputs
  nansenNetFlowUSD: number;     // positive = accumulating, negative = distributing

  // Elfa inputs
  elfaNormalizedDelta: number;  // (4h - 7d) / |7d|, negative = drop

  // Configuration inputs
  dvnThreshold: number;         // e.g. 1 = 1-of-1 (very risky)
  dvnCount: number;             // total DVNs

  // Pre-attack staging inputs
  tcFundedNewWallets: number;   // count of TC-funded wallets interacting with bridge
}

export interface ProtocolRiskScore {
  protocolAddress: string;
  score: number;
  band: RiskBand;
  components: RiskComponents;
  lastUpdated: number;
  zkProofHash?: string;
}

/**
 * Maps a numeric score (0-100) to a RiskBand severity level.
 */
export function scoreToSeverity(score: number): RiskBand {
  if (score < 20) return 'LOW';
  if (score < 45) return 'ELEVATED';
  if (score < 70) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Computes composite risk score from protocol data.
 * All weights are exactly as specified in PRD §10.
 */
export function computeRiskScore(
  protocolAddress: string,
  data: ProtocolData
): ProtocolRiskScore {
  // 1. Invariant health (0–30): failures * 5 + minors * 1
  const invariantHealth = Math.min(
    30,
    data.invariantFailures7d * 5 + data.anomalyMinors7d * 1
  );

  // 2. Smart money flow (0–25): positive flow = lower risk, negative = higher
  const smartMoneyFlow =
    data.nansenNetFlowUSD > 0
      ? 0
      : Math.min(25, (Math.abs(data.nansenNetFlowUSD) / 100_000) * 5);

  // 3. Social sentiment (0–20): drop below baseline adds risk
  const socialSentiment =
    data.elfaNormalizedDelta < 0
      ? Math.min(20, Math.abs(data.elfaNormalizedDelta) * 20)
      : 0;

  // 4. Configuration risk (0–15): 1-of-1 DVN = 15 points, standard = 0
  const configurationRisk =
    data.dvnThreshold === 1
      ? data.dvnCount === 1
        ? 15 // 1-of-1 — maximum risk
        : 10 // threshold 1 but multiple DVNs — still risky
      : 0;

  // 5. Staging signals (0–10): TC-funded wallets × 3, capped at 10
  const stagingSignals = Math.min(10, data.tcFundedNewWallets * 3);

  const total = invariantHealth + smartMoneyFlow + socialSentiment + configurationRisk + stagingSignals;
  const score = Math.min(100, Math.max(0, total));

  const band = scoreToSeverity(score);

  return {
    protocolAddress,
    score,
    band,
    components: {
      invariantHealth,
      smartMoneyFlow,
      socialSentiment,
      configurationRisk,
      stagingSignals,
    },
    lastUpdated: Date.now(),
  };
}
