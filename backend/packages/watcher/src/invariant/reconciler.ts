import type EventEmitter from 'eventemitter3';
import { InvariantChecker } from './checker.js';
import { ALERT_THRESHOLD_USD, CRITICAL_THRESHOLD_USD, RECONCILIATION_WINDOW_MS } from './protocols.js';
import { EVENTS } from '../index.js';
import { getEthPriceUSD } from '../signals/pyth.js';

let sweepInterval: ReturnType<typeof setInterval> | null = null;

// Track anomaly counts per protocol (sliding window, 10 blocks ~20s)
const anomalyCounters = new Map<string, { count: number; windowStart: number }>();
const ANOMALY_WINDOW_MS = 20_000; // 10 blocks × 2s
const ANOMALY_ESCALATION_COUNT = 3;

/**
 * Runs every 30 seconds.
 * Checks the pendingMints map for entries that have exceeded the reconciliation window
 * without a matching source burn. These are invariant violations.
 */
export async function reconciliationSweep(bus: EventEmitter, checker: InvariantChecker): Promise<void> {
  const now = Date.now();
  let sweepCount = 0;
  let violationCount = 0;

  for (const [guid, mint] of checker.pendingMints) {
    const ageMs = now - mint.detectedAt;

    // Still within reconciliation window — wait
    if (ageMs < RECONCILIATION_WINDOW_MS) continue;

    // Source burn was found — all good
    if (mint.sourceBurnFound) {
      checker.removePendingMint(guid);
      sweepCount++;
      continue;
    }

    // INVARIANT VIOLATION: mint without matching burn past window
    violationCount++;
    checker.removePendingMint(guid);

    // Estimate USD value: treat amount as ETH units, price via Pyth Network oracle.
    let ethPriceUSD = 3_200; // fallback if Pyth is unavailable
    try {
      ethPriceUSD = await getEthPriceUSD();
    } catch (priceErr: any) {
      console.warn(`[reconciler] Pyth price fetch failed (${priceErr.message}), using fallback $${ethPriceUSD}`);
    }
    const estimatedUSD =
      (Number(mint.amount) / 1e18) * ethPriceUSD;

    const severity =
      estimatedUSD >= Number(CRITICAL_THRESHOLD_USD) / 1e6
        ? 'CRITICAL'
        : estimatedUSD >= Number(ALERT_THRESHOLD_USD) / 1e6
        ? 'HIGH'
        : 'MINOR';

    if (severity === 'MINOR') {
      // Track anomaly counter for escalation
      const counter = anomalyCounters.get(mint.protocol) ?? {
        count: 0,
        windowStart: now,
      };

      if (now - counter.windowStart > ANOMALY_WINDOW_MS) {
        // Reset window
        counter.count = 1;
        counter.windowStart = now;
      } else {
        counter.count++;
      }
      anomalyCounters.set(mint.protocol, counter);

      if (counter.count > ANOMALY_ESCALATION_COUNT) {
        console.warn(
          `[reconciler] ${mint.protocol}: ${counter.count} anomalies in ${ANOMALY_WINDOW_MS / 1000}s — escalating to ALERT`
        );
        bus.emit(EVENTS.INVARIANT_VIOLATION, {
          guid,
          protocol: mint.protocol,
          protocolAddress: mint.protocolAddress,
          amount: mint.amount,
          estimatedUSD,
          severity: 'HIGH',
          reason: `Repeated anomalies: ${counter.count} in ${ANOMALY_WINDOW_MS / 1000}s`,
          blockNumber: mint.blockNumber,
          timestamp: now,
        });
        counter.count = 0; // Reset after escalating
      } else {
        bus.emit(EVENTS.ANOMALY_MINOR, {
          guid,
          protocol: mint.protocol,
          amount: mint.amount,
          estimatedUSD,
          timestamp: now,
        });
      }
    } else {
      console.error(
        `[reconciler] INVARIANT VIOLATION: ${mint.protocol} | guid=${guid} | ${estimatedUSD.toFixed(0)} USD | severity=${severity}`
      );
      bus.emit(EVENTS.INVARIANT_VIOLATION, {
        guid,
        protocol: mint.protocol,
        protocolAddress: mint.protocolAddress,
        amount: mint.amount,
        estimatedUSD,
        severity,
        reason: 'RELEASE_WITHOUT_BURN',
        blockNumber: mint.blockNumber,
        timestamp: now,
      });
    }
  }

  if (sweepCount > 0 || violationCount > 0) {
    console.log(
      `[reconciler] Sweep complete: ${sweepCount} resolved, ${violationCount} violations`
    );
  }
}

export function startReconciliationSweep(bus: EventEmitter, checker: InvariantChecker): void {
  console.log('[reconciler] Starting reconciliation sweep every 30s');
  sweepInterval = setInterval(() => reconciliationSweep(bus, checker).catch(console.error), 30_000);
  // Run immediately on start
  setTimeout(() => reconciliationSweep(bus, checker).catch(console.error), 1_000);
}

export function stopReconciliationSweep(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    console.log('[reconciler] Sweep stopped');
  }
}
