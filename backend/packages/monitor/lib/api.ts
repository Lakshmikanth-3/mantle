/**
 * @file api.ts
 * @description REST API client for SENTINEL Monitor — calls the Indexer service on port 3003.
 * All functions are real HTTP calls with no mocks.
 */

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3003';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
const ORACLE_URL = process.env.NEXT_PUBLIC_ORACLE_URL || 'http://localhost:3002';

export { WS_URL, ORACLE_URL };

export interface ApiStats {
  checksRun: number;
  anomaliesDetected: number;
  alertsFired: number;
  proposalsDrafted: number;
  riskQueriesServed: number;
  revenueEarned: number;
  gasReservoir: number;
}

export interface ApiProtocol {
  address: string;
  name: string;
  riskScore: number;
  band: 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  invariantStatus: 'PASSING' | 'ANOMALY' | 'VIOLATED';
  exposureUSD: number;
  anomalyCount7d: number;
  alertCount30d: number;
}

export interface ApiAlert {
  id: string;
  timestamp: number;
  protocol: string;
  protocolAddress: string;
  severity: 'MINOR' | 'HIGH' | 'CRITICAL';
  estimatedUSD: number;
  reason: string;
  blockNumber: string;
  txHash?: string;
  zkProofHash?: string;
}

/** Fetch aggregate stats from indexer */
export async function fetchStats(): Promise<ApiStats> {
  const res = await fetch(`${INDEXER_URL}/api/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Stats fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? body;
}

/** Fetch all monitored protocols with their current risk scores */
export async function fetchProtocols(): Promise<ApiProtocol[]> {
  const res = await fetch(`${INDEXER_URL}/api/protocols`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Protocols fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? [];
}

/** Fetch recent alerts from indexer */
export async function fetchAlerts(limit = 20): Promise<ApiAlert[]> {
  const res = await fetch(`${INDEXER_URL}/api/alerts?limit=${limit}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Alerts fetch failed: ${res.status}`);
  const body = await res.json();
  return body.data ?? [];
}

/** Trigger the Kelp exploit demo replay via the alertmanager server */
export async function triggerExploitReplay(): Promise<{ success: boolean; hash?: string; error?: string }> {
  const res = await fetch('http://localhost:3001/trigger-exploit', { method: 'POST' });
  return res.json();
}

/** Fetch a free risk assessment preview from the oracle */
export async function fetchRiskPreview(address: string): Promise<unknown> {
  const res = await fetch(`${ORACLE_URL}/api/risk/${address}/free`);
  if (!res.ok) throw new Error(`Risk fetch failed: ${res.status}`);
  return res.json();
}
