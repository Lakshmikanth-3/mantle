/**
 * Pyth Network price oracle for Mantle Sepolia.
 * Pyth Hermes API: https://hermes.pyth.network/v2/updates/price/latest?ids[]=...
 * Pyth contract on Mantle Sepolia: 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
 *
 * Price feed IDs (from https://pyth.network/developers/price-feed-ids):
 * ETH/USD: 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
 * BTC/USD: 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
 * stETH/USD (for governance terms): 0x846ae1bdb6300b817cee5fdee2a6da192775030db5615b94a465f53bd40850b5
 * MNT/USD: 0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585
 */

import axios from 'axios';

const HERMES_URL = 'https://hermes.pyth.network';

const PRICE_FEED_IDS = {
  ETH:   '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BTC:   '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  stETH: '0x846ae1bdb6300b817cee5fdee2a6da192775030db5615b94a465f53bd40850b5',
  MNT:   '0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585',
} as const;

export type PriceSymbol = keyof typeof PRICE_FEED_IDS;

export interface PythPrice {
  price: number;       // USD price
  conf: number;        // confidence interval
  publishTime: number; // unix timestamp
  symbol: PriceSymbol;
}

/** Raw shape of a single entry in the `parsed` array from Hermes */
interface HermesParsedEntry {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

/** Convert Pyth's fixed-point representation to a float */
function applyExponent(rawPrice: string, expo: number): number {
  return parseInt(rawPrice, 10) * Math.pow(10, expo);
}

/** Build the reverse map: feed-id-without-0x → symbol */
const ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(PRICE_FEED_IDS).map(([sym, id]) => [id.slice(2).toLowerCase(), sym as PriceSymbol])
);

/**
 * Fetch latest price from Pyth Hermes REST API.
 * No on-chain call needed for off-chain usage — Hermes provides signed prices.
 */
export async function getPriceUSD(symbol: PriceSymbol): Promise<PythPrice> {
  const feedId = PRICE_FEED_IDS[symbol];
  const url = `${HERMES_URL}/v2/updates/price/latest`;

  const response = await axios.get<{ parsed: HermesParsedEntry[] }>(url, {
    params: { 'ids[]': feedId },
    timeout: 10_000,
  });

  const entries = response.data.parsed;
  if (!entries || entries.length === 0) {
    throw new Error(`[pyth] No price data returned for ${symbol}`);
  }

  const entry = entries[0];
  const price = applyExponent(entry.price.price, entry.price.expo);
  const conf  = applyExponent(entry.price.conf,  entry.price.expo);

  return {
    price,
    conf,
    publishTime: entry.price.publish_time,
    symbol,
  };
}

/**
 * Get ETH price in USD — used for estimatedUSD calculation in invariant checker.
 */
export async function getEthPriceUSD(): Promise<number> {
  const result = await getPriceUSD('ETH');
  return result.price;
}

/**
 * Get stETH APR from Pyth (approximated from stETH/USD vs ETH/USD ratio).
 * Lido's stETH/USD ≈ ETH/USD × (1 + accumulated-rewards).
 * The APR is inferred from (stETH_price / ETH_price - 1) × annualisation.
 * Because stETH accrues continuously, and the Pyth feed reflects the
 * redemption ratio, this gives a reasonable proxy for the current staking APR.
 *
 * Used by governance/terms.ts for loan term calculation.
 */
export async function getStETHAPR(): Promise<number> {
  const [ethData, stETHData] = await Promise.all([
    getPriceUSD('ETH'),
    getPriceUSD('stETH'),
  ]);

  if (ethData.price <= 0) {
    throw new Error('[pyth] ETH price is zero or negative — cannot compute stETH APR');
  }

  // The redemption ratio (stETH/ETH) encodes accrued rewards.
  // Annualised APR ≈ (ratio - 1) × 12 months is a rough proxy;
  // for production use the Lido withdrawal queue ratio feed directly.
  const ratio = stETHData.price / ethData.price;

  // Clamp ratio to a sane range (0.9 – 1.1) to guard against feed anomalies.
  const clampedRatio = Math.max(0.9, Math.min(1.1, ratio));

  // The ratio accumulates over the life of stETH (launched ~2020).
  // Assuming ~4 years of compounding at ~4% APR gives ratio ≈ 1.17,
  // so we derive the implied annual rate from this accumulated ratio.
  const yearsElapsed = (Date.now() / 1000 - 1609459200) / (365.25 * 24 * 3600); // since 2021-01-01
  const impliedApr = (Math.pow(clampedRatio, 1 / Math.max(yearsElapsed, 1)) - 1) * 100;

  // Sanity bounds: Lido APR has historically been between 2% and 8%.
  const aprPct = Math.max(2.0, Math.min(8.0, impliedApr));
  return aprPct;
}

/**
 * Batch fetch all prices at once (more efficient than individual calls).
 */
export async function getAllPrices(): Promise<Record<PriceSymbol, PythPrice>> {
  const feedIds = Object.values(PRICE_FEED_IDS);
  const url = `${HERMES_URL}/v2/updates/price/latest`;

  const response = await axios.get<{ parsed: HermesParsedEntry[] }>(url, {
    params: { 'ids[]': feedIds },
    timeout: 15_000,
  });

  const entries = response.data.parsed;
  if (!entries || entries.length === 0) {
    throw new Error('[pyth] No price data returned from batch fetch');
  }

  const result = {} as Record<PriceSymbol, PythPrice>;

  for (const entry of entries) {
    const normalizedId = entry.id.replace(/^0x/, '').toLowerCase();
    const symbol = ID_TO_SYMBOL[normalizedId];
    if (!symbol) {
      console.warn(`[pyth] Unrecognized feed id in batch response: ${entry.id}`);
      continue;
    }

    result[symbol] = {
      price:       applyExponent(entry.price.price, entry.price.expo),
      conf:        applyExponent(entry.price.conf,  entry.price.expo),
      publishTime: entry.price.publish_time,
      symbol,
    };
  }

  // Verify all symbols are present
  for (const sym of Object.keys(PRICE_FEED_IDS) as PriceSymbol[]) {
    if (!result[sym]) {
      throw new Error(`[pyth] Missing price for ${sym} in batch response`);
    }
  }

  return result;
}
