import axios from 'axios';

// Elfa API v2 — REST with API key auth
// Key format: elfak_xxxxxxxx
// Get key at: https://dev.elfa.ai
// Docs: https://docs.elfa.ai
// Verified working endpoints:
//   GET /v2/ping                           → health check
//   GET /v2/aggregations/trending-tokens   → trending tokens by mention count
//   GET /v2/aggregations/trending-topics   → trending topics/narratives
//   GET /v2/aggregations/top-kols          → top KOLs by engagement
const ELFA_BASE_URL = process.env.ELFA_BASE_URL || 'https://api.elfa.ai/v2';
const ELFA_API_KEY = process.env.ELFA_API_KEY;

export interface SentimentScore {
  score: number;      // normalized 0–1+ (mention velocity, higher = more active)
  volume: number;     // mention count
  window: string;
}

export type SentimentSeverity = 'NONE' | 'MEDIUM' | 'HIGH';

export interface SentimentSignal {
  type: 'STABLE' | 'SENTIMENT_DROP' | 'SENTIMENT_SPIKE';
  protocol: string;
  delta: number;        // change vs baseline (positive = more mentions)
  severity: SentimentSeverity;
  current: SentimentScore;
  baseline: SentimentScore;
}

export interface TrendingToken {
  token: string;
  currentCount: number;
  previousCount: number;
  changePercent: number;
}

// Elfa v2 uses x-elfa-api-key header
function elfaHeaders() {
  return {
    'x-elfa-api-key': ELFA_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

/**
 * Gets trending tokens from Elfa — real social signal.
 * Used to detect if rsETH / mETH suddenly trends (positive or negative).
 */
export async function getTrendingTokens(
  timeWindow: '1h' | '4h' | '1d' = '1d',
  limit = 50
): Promise<TrendingToken[]> {
  if (!ELFA_API_KEY) throw new Error('ELFA_API_KEY not set — get it at https://dev.elfa.ai');

  const response = await axios.get(`${ELFA_BASE_URL}/aggregations/trending-tokens`, {
    params: { timeWindow, limit },
    headers: elfaHeaders(),
    timeout: 10000,
  });

  const data = response.data as {
    success: boolean;
    data: {
      data: Array<{
        token: string;
        current_count: number;
        previous_count: number;
        change_percent: number;
      }>;
    };
  };

  return (data.data?.data ?? []).map(t => ({
    token: t.token,
    currentCount: t.current_count,
    previousCount: t.previous_count,
    changePercent: t.change_percent,
  }));
}

/**
 * Checks if a protocol token is trending abnormally.
 * A sudden NEGATIVE change (token drops off trending) = pre-exploit signal.
 * A sudden POSITIVE spike after a quiet period = hype/recovery signal.
 *
 * Returns a SentimentSignal suitable for the risk scorer.
 */
export async function detectSentimentAnomaly(
  protocolKeyword: string
): Promise<SentimentSignal> {
  if (!ELFA_API_KEY) throw new Error('ELFA_API_KEY not set — get it at https://dev.elfa.ai');

  // Fetch both 1h (current) and 1d (baseline) trending data
  const [current1h, current1d] = await Promise.all([
    getTrendingTokens('1h', 50),
    getTrendingTokens('1d', 50),
  ]);

  const keyword = protocolKeyword.toLowerCase();

  // Find the protocol in each timeframe
  const current = current1h.find(t =>
    t.token.toLowerCase().includes(keyword) ||
    keyword.includes(t.token.toLowerCase())
  );
  const baseline = current1d.find(t =>
    t.token.toLowerCase().includes(keyword) ||
    keyword.includes(t.token.toLowerCase())
  );

  const currentScore: SentimentScore = {
    score: current?.currentCount ?? 0,
    volume: current?.currentCount ?? 0,
    window: '1h',
  };

  const baselineScore: SentimentScore = {
    score: baseline?.currentCount ?? 0,
    volume: baseline?.currentCount ?? 0,
    window: '1d',
  };

  // Compute normalized change (1h vs 1d average per hour)
  // 1d count / 24 = expected hourly mentions
  const expectedHourly = (baseline?.currentCount ?? 0) / 24;
  const actualHourly = current?.currentCount ?? 0;
  const normalizedDelta =
    expectedHourly > 0
      ? (actualHourly - expectedHourly) / expectedHourly
      : 0;

  // Also check the changePercent from Elfa directly for current 1h
  const elfaDelta = (current?.changePercent ?? 0) / 100;

  // Use whichever signal is stronger
  const effectiveDelta = Math.abs(elfaDelta) > Math.abs(normalizedDelta)
    ? elfaDelta
    : normalizedDelta;

  // Anomaly threshold: ±50% is notable for DeFi protocols
  if (effectiveDelta < -0.5) {
    return {
      type: 'SENTIMENT_DROP',
      protocol: protocolKeyword,
      delta: effectiveDelta,
      severity: effectiveDelta < -0.8 ? 'HIGH' : 'MEDIUM',
      current: currentScore,
      baseline: baselineScore,
    };
  }

  if (effectiveDelta > 1.5) {
    // Sudden spike can also be pre-exploit (coordinated attention)
    return {
      type: 'SENTIMENT_SPIKE',
      protocol: protocolKeyword,
      delta: effectiveDelta,
      severity: effectiveDelta > 3.0 ? 'HIGH' : 'MEDIUM',
      current: currentScore,
      baseline: baselineScore,
    };
  }

  return {
    type: 'STABLE',
    protocol: protocolKeyword,
    delta: effectiveDelta,
    severity: 'NONE',
    current: currentScore,
    baseline: baselineScore,
  };
}

/**
 * Backward-compatible alias used by existing poller
 */
export async function getSentiment(
  keyword: string,
  _window: '4h' | '24h' | '7d'
): Promise<SentimentScore> {
  const tokens = await getTrendingTokens('1d', 50);
  const found = tokens.find(t =>
    t.token.toLowerCase().includes(keyword.toLowerCase()) ||
    keyword.toLowerCase().includes(t.token.toLowerCase())
  );
  return {
    score: found?.changePercent ?? 0,
    volume: found?.currentCount ?? 0,
    window: _window,
  };
}

export async function getSentimentSignal(protocol: string): Promise<number> {
  if (!process.env.ELFA_API_KEY) {
    throw new Error('[elfa] ELFA_API_KEY is missing. Cannot fetch sentiment signals.');
  }
  
  const res = await fetch(`https://api.elfa.ai/v1/sentiment?query=${protocol}+bridge+exploit`, {
    headers: { 'Authorization': `Bearer ${process.env.ELFA_API_KEY}` }
  });

  if (!res.ok) {
    throw new Error(`[elfa] API error: ${res.statusText}`);
  }

  const data = await res.json() as any;
  // Negative sentiment maps to higher risk signal
  if (data.sentimentScore === undefined) return 0;
  return Math.min(100, Math.max(0, Math.round((1 - data.sentimentScore) * 100)));
}
