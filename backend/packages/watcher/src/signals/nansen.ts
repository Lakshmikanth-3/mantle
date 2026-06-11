import axios from 'axios';

// Nansen API v1
// Key format: nsn_xxxxxxxx
// Auth header: apiKey
// All data endpoints are POST with JSON body
// 422 = auth ok but body validation failed
// 401/403 = auth invalid
const NANSEN_BASE_URL = process.env.NANSEN_BASE_URL || 'https://api.nansen.ai';
const NANSEN_API_KEY = process.env.NANSEN_API_KEY;

export interface SmartMoneyFlow {
  netFlowUSD: number;
  trend: 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL';
  flaggedWallets: number;
  timeWindow: string;
}

export interface WalletLabel {
  address: string;
  labels: string[];
  isSmart: boolean;
  isExchange: boolean;
}

export interface StagingSignal {
  walletAddress: string;
  firstSeenAt: number;
  tcFundingAmount: number; // USD
  severity: 'ELEVATED';
}

function nansenHeaders() {
  return {
    'apiKey': NANSEN_API_KEY!,
    'Content-Type': 'application/json',
  };
}

/**
 * Gets wallet labels from Nansen for an address.
 * Used to check if wallets interacting with bridge are "Smart Money" or known exploiters.
 * 
 * Nansen API v1: POST /api/v1/profiler/address/labels
 * Body: { address: string }
 */
export async function getWalletLabels(address: string): Promise<WalletLabel> {
  if (!NANSEN_API_KEY) throw new Error('NANSEN_API_KEY not set');

  try {
    const response = await axios.post(
      `${NANSEN_BASE_URL}/api/v1/profiler/address/labels`,
      { address },
      {
        headers: nansenHeaders(),
        timeout: 10000,
      }
    );

    const data = response.data as {
      labels?: string[];
      entity?: { label?: string };
    };

    const labels = data.labels ?? [];
    const entityLabel = data.entity?.label ?? '';
    const allLabels = entityLabel ? [...labels, entityLabel] : labels;

    return {
      address,
      labels: allLabels,
      isSmart: allLabels.some(l =>
        l.toLowerCase().includes('smart') ||
        l.toLowerCase().includes('fund') ||
        l.toLowerCase().includes('trader')
      ),
      isExchange: allLabels.some(l =>
        l.toLowerCase().includes('exchange') ||
        l.toLowerCase().includes('cex')
      ),
    };
  } catch (err: any) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      throw new Error('Nansen API key invalid or expired');
    }
    // Return empty labels on other errors (graceful degradation)
    console.warn(`[nansen] getWalletLabels failed for ${address}: ${err.message}`);
    return { address, labels: [], isSmart: false, isExchange: false };
  }
}

/**
 * Fetches smart money net flow for a contract address.
 * Nansen labels wallets as "smart money" based on historical profitability.
 * A negative net flow (smart money exiting) is a pre-exploit risk signal.
 *
 * Nansen API v1: POST /api/v1/smart-money/netflow
 */
export async function getSmartMoneyFlow(
  contractAddress: string,
  chain: 'ethereum' | 'mantle' = 'ethereum'
): Promise<SmartMoneyFlow> {
  if (!NANSEN_API_KEY) throw new Error('NANSEN_API_KEY not set');

  try {
    const response = await axios.post(
      `${NANSEN_BASE_URL}/api/v1/smart-money/netflow`,
      {
        address: contractAddress,
        chain,
        time_range: '24h',
      },
      {
        headers: nansenHeaders(),
        timeout: 10000,
      }
    );

    const data = response.data as {
      netflow_usd?: number;
      net_flow_usd?: number;
      flagged_wallets?: number;
      flaggedWallets?: number;
    };

    const netFlow = data.netflow_usd ?? data.net_flow_usd ?? 0;
    const flagged = data.flagged_wallets ?? data.flaggedWallets ?? 0;

    return {
      netFlowUSD: netFlow,
      trend:
        netFlow > 50_000 ? 'ACCUMULATING' :
        netFlow < -50_000 ? 'DISTRIBUTING' :
        'NEUTRAL',
      flaggedWallets: flagged,
      timeWindow: '24h',
    };
  } catch (err: any) {
    console.warn(`[nansen] getSmartMoneyFlow failed for ${contractAddress}: ${err.message}`);
    // Return neutral on error (graceful degradation)
    return { netFlowUSD: 0, trend: 'NEUTRAL', flaggedWallets: 0, timeWindow: '24h' };
  }
}

/**
 * Checks for Tornado Cash-funded new wallets interacting with a bridge.
 * This is the pre-attack staging signal: attackers fund gas wallets from TC
 * 3-6h before executing the exploit.
 *
 * Based on Innora.ai forensic of the Kelp DAO exploit.
 * Nansen API v1: POST /api/v1/smart-money/dex-trades filtered by TC-funded wallets
 */
export async function detectPreAttackStaging(
  bridgeAddress: string
): Promise<StagingSignal[]> {
  if (!NANSEN_API_KEY) throw new Error('NANSEN_API_KEY not set');

  try {
    // Use smart-money dex trades to find new wallets interacting with bridge
    const response = await axios.post(
      `${NANSEN_BASE_URL}/api/v1/smart-money/dex-trades`,
      {
        contract_address: bridgeAddress,
        chain: 'ethereum',
        time_range: '24h',
        wallet_age_hours: 48,  // Only new wallets
      },
      {
        headers: nansenHeaders(),
        timeout: 10000,
      }
    );

    const data = response.data as {
      trades?: Array<{
        wallet?: string;
        wallet_address?: string;
        timestamp?: number;
        funding_source?: string;
        amount_usd?: number;
      }>;
    };

    const trades = data.trades ?? [];

    // Filter for potentially TC-funded wallets (new wallets, large amounts)
    return trades
      .filter(t => t.funding_source?.toLowerCase().includes('tornado') || t.amount_usd && t.amount_usd > 1000)
      .map(t => ({
        walletAddress: t.wallet ?? t.wallet_address ?? 'unknown',
        firstSeenAt: t.timestamp ?? Date.now(),
        tcFundingAmount: t.amount_usd ?? 0,
        severity: 'ELEVATED' as const,
      }));
  } catch (err: any) {
    console.warn(`[nansen] detectPreAttackStaging failed for ${bridgeAddress}: ${err.message}`);
    return [];
  }
}

export async function getSmartMoneySignal(protocolAddress: string): Promise<number> {
  if (!process.env.NANSEN_API_KEY) {
    throw new Error('[nansen] NANSEN_API_KEY is missing. Cannot fetch smart money signals.');
  }
  
  const res = await fetch(`https://api.nansen.ai/v1/smart-money/flows?address=${protocolAddress}`, {
    headers: { 'X-API-KEY': process.env.NANSEN_API_KEY }
  });

  if (!res.ok) {
    throw new Error(`[nansen] API error: ${res.statusText}`);
  }

  const data = await res.json() as any;
  // Map Nansen net flow to 0-100 signal score
  if (!data.netOutflow || !data.tvl) return 0;
  return Math.min(100, Math.max(0, Math.round((data.netOutflow / data.tvl) * 100)));
}

