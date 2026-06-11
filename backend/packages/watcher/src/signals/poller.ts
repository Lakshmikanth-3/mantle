import type EventEmitter from 'eventemitter3';
import { PROTOCOLS } from '../invariant/protocols.js';
import { getSmartMoneyFlow, detectPreAttackStaging } from './nansen.js';
import { detectSentimentAnomaly } from './elfa.js';
import { EVENTS } from '../index.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Polls Nansen and Elfa every 5 minutes for pre-attack signals.
 * These signals are secondary (the invariant check is primary) but can detect
 * threats hours before the on-chain event — as seen in the Kelp exploit.
 */
async function pollSignals(bus: EventEmitter): Promise<void> {
  for (const protocol of PROTOCOLS) {
    const apiAddress = protocol.mainnetSourceAddress || protocol.sourceAddress;
    // --- Nansen: pre-attack staging detection ---
    if (apiAddress && apiAddress !== '0x') {
      try {
        const stagingSignals = await detectPreAttackStaging(apiAddress);
        if (stagingSignals.length > 0) {
          console.warn(
            `[signals] PRE-ATTACK STAGING detected on ${protocol.name}: ${stagingSignals.length} TC-funded wallets`
          );
          bus.emit(EVENTS.STAGING_SIGNAL, {
            protocol: protocol.name,
            protocolAddress: protocol.sourceAddress,
            signals: stagingSignals,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        if (err.message !== 'NANSEN_API_KEY not set') {
          console.error(`[signals] Nansen error for ${protocol.name}:`, err.message);
        }
      }
    }

    // --- Elfa: sentiment anomaly detection ---
    const keyword = protocol.name.split(' ')[0]; // e.g. "rsETH", "mETH"
    try {
      const sentiment = await detectSentimentAnomaly(keyword);
      if (sentiment.type === 'SENTIMENT_DROP') {
        console.warn(
          `[signals] SENTIMENT DROP on ${protocol.name}: ${(sentiment.delta * 100).toFixed(1)}% vs 7d baseline`
        );
        bus.emit(EVENTS.SENTIMENT_DROP, {
          protocol: protocol.name,
          signal: sentiment,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      if (err.message !== 'ELFA_API_KEY not set') {
        console.error(`[signals] Elfa error for ${protocol.name}:`, err.message);
      }
    }
  }
}

export function startSignalPolling(bus: EventEmitter): void {
  if (!process.env.NANSEN_API_KEY && !process.env.ELFA_API_KEY) {
    console.warn('[signals] No Nansen or Elfa API keys set — signal polling disabled');
    return;
  }

  console.log('[signals] Starting Nansen + Elfa polling every 5 minutes');
  // Run immediately, then every 5 min
  pollSignals(bus).catch(console.error);
  pollInterval = setInterval(() => pollSignals(bus).catch(console.error), POLL_INTERVAL_MS);
}

export function stopSignalPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[signals] Polling stopped');
  }
}
