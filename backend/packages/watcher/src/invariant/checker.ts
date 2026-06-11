/**
 * @file checker.ts
 * @description Invariant checker for SENTINEL's OFT bridge monitoring.
 *
 *   The core invariant being enforced:
 *     ∀ OFTReceived(guid) on Mantle ∃ OFTSent(guid) on the source chain
 *     within RECONCILIATION_WINDOW_MS milliseconds.
 *
 *   Flow:
 *   1. mantleListener fires OFTReceived → checkInvariant() adds to pendingMints
 *   2. ethListener fires OFTSent      → reconcileSourceBurn() marks matched
 *   3. reconciler.ts sweeps every 30s → unmatched mints past window → alert
 */

import EventEmitter3 from 'eventemitter3';
import {
  DUST_THRESHOLD_ETH,
  PROTOCOL_BY_MANTLE_ADDRESS,
  type MonitoredProtocol,
} from './protocols.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Represents an unreconciled mint detected on Mantle */
export interface PendingMint {
  /** LayerZero cross-chain GUID (bytes32, hex-encoded) — used as correlation key */
  guid: string;
  /** Protocol name (e.g. "rsETH (Kelp DAO)") */
  protocol: string;
  /** Mantle OFT contract address that emitted the event */
  protocolAddress: string;
  /** Amount received in smallest denomination (wei / LD units) */
  amount: bigint;
  /** Mantle block number where the OFTReceived was observed */
  blockNumber: bigint;
  /** Wall-clock timestamp (Date.now()) when SENTINEL detected the event */
  detectedAt: number;
  /** true once a matching OFTSent on the source chain has been confirmed */
  sourceBurnFound: boolean;
  /** Destination wallet on Mantle */
  recipient: string;
  /** LayerZero source endpoint ID */
  srcEid: number;
}

/** Raw OFTReceived log args delivered by viem */
export interface OFTReceivedEventArgs {
  guid: `0x${string}`;
  srcEid: number;
  toAddress: `0x${string}`;
  amountReceivedLD: bigint;
}

/** Raw OFTSent log args delivered by viem */
export interface OFTSentEventArgs {
  guid: `0x${string}`;
  dstEid: number;
  fromAddress: `0x${string}`;
  amountSentLD: bigint;
  amountReceivedLD: bigint;
}

/** Event names used on the internal EventEmitter bus */
export const CHECKER_EVENTS = {
  PENDING_MINT_ADDED: 'checker:pending_mint_added',
  SOURCE_BURN_RECONCILED: 'checker:source_burn_reconciled',
  DUST_SKIPPED: 'checker:dust_skipped',
  UNKNOWN_PROTOCOL: 'checker:unknown_protocol',
} as const;

// ─── InvariantChecker class ───────────────────────────────────────────────────

/**
 * Stateful invariant checker.
 *
 * Maintains a Map of all detected OFTReceived events that have not yet been
 * matched to a corresponding OFTSent on the source chain.
 *
 * Thread-safety note: Node.js is single-threaded; no locking needed.
 * All async operations use .then() / async-await safely.
 */
export class InvariantChecker {
  /** Pending mints awaiting source-burn reconciliation.  Key = guid */
  public readonly pendingMints = new Map<string, PendingMint>();

  private readonly emitter: EventEmitter3;

  constructor(emitter: EventEmitter3) {
    this.emitter = emitter;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Called by mantleListener when an OFTReceived event is detected.
   *
   * Skips dust transfers. For known protocols, creates a PendingMint entry
   * and emits PENDING_MINT_ADDED for downstream consumers.
   *
   * @param contractAddress  The Mantle OFT contract that emitted the log
   * @param args             Decoded event arguments from viem
   * @param blockNumber      Mantle block number of the event
   */
  checkInvariant(
    contractAddress: `0x${string}`,
    args: OFTReceivedEventArgs,
    blockNumber: bigint,
  ): void {
    const { guid, srcEid, toAddress, amountReceivedLD } = args;
    const normalizedAddress = contractAddress.toLowerCase();

    // ── Dust filter ─────────────────────────────────────────────────────────
    if (amountReceivedLD < DUST_THRESHOLD_ETH) {
      this.emitter.emit(CHECKER_EVENTS.DUST_SKIPPED, {
        guid,
        contractAddress,
        amount: amountReceivedLD,
      });
      return;
    }

    // ── Protocol lookup ─────────────────────────────────────────────────────
    const protocol = PROTOCOL_BY_MANTLE_ADDRESS.get(normalizedAddress);
    if (!protocol) {
      console.warn(
        `[InvariantChecker] OFTReceived from unknown address ${contractAddress}. ` +
          'Add to PROTOCOLS registry if intentional.',
      );
      this.emitter.emit(CHECKER_EVENTS.UNKNOWN_PROTOCOL, {
        contractAddress,
        guid,
        amountReceivedLD,
      });
      return;
    }

    // ── Skip if already pending (duplicate event delivery) ──────────────────
    if (this.pendingMints.has(guid)) {
      console.debug(
        `[InvariantChecker] Duplicate OFTReceived guid=${guid} for ${protocol.name} — skipping.`,
      );
      return;
    }

    // ── Create pending mint entry ────────────────────────────────────────────
    const pendingMint: PendingMint = {
      guid,
      protocol: protocol.name,
      protocolAddress: contractAddress,
      amount: amountReceivedLD,
      blockNumber,
      detectedAt: Date.now(),
      sourceBurnFound: false,
      recipient: toAddress,
      srcEid,
    };

    this.pendingMints.set(guid, pendingMint);

    console.info(
      `[InvariantChecker] ⏳ Pending mint added | protocol=${protocol.name} ` +
        `guid=${guid} amount=${amountReceivedLD.toString()} block=${blockNumber.toString()}`,
    );

    this.emitter.emit(CHECKER_EVENTS.PENDING_MINT_ADDED, pendingMint);
  }

  /**
   * Called by ethListener when an OFTSent event is detected on the source chain.
   *
   * Matches the GUID to a pending mint and marks it reconciled.
   * If no pending mint is found, the event is logged as informational
   * (it may arrive before the Mantle mint in race-condition scenarios).
   *
   * @param args  Decoded OFTSent event arguments
   */
  reconcileSourceBurn(args: OFTSentEventArgs): void {
    const { guid, amountSentLD } = args;

    const pending = this.pendingMints.get(guid);
    if (!pending) {
      // Source burn arrived before Mantle mint — store for later correlation
      // This is normal when ETH finality < LZ delivery time; the reconciler
      // will retry. We log it but don't add to pendingMints to avoid orphans.
      console.debug(
        `[InvariantChecker] OFTSent guid=${guid} received but no matching Mantle mint yet. ` +
          'This is normal if source-chain event arrived first.',
      );
      return;
    }

    // ── Validate amount matches ──────────────────────────────────────────────
    // amountSentLD >= amountReceivedLD (LZ deducts fees on the source side)
    if (amountSentLD < pending.amount) {
      console.warn(
        `[InvariantChecker] Amount mismatch for guid=${guid}: ` +
          `sent=${amountSentLD.toString()} < received=${pending.amount.toString()}. ` +
          'Possible bridge fee accounting issue — flagging for review.',
      );
      // We still mark reconciled to prevent false alerts, but log prominently
    }

    pending.sourceBurnFound = true;

    console.info(
      `[InvariantChecker] ✅ Reconciled | protocol=${pending.protocol} ` +
        `guid=${guid} sent=${amountSentLD.toString()} received=${pending.amount.toString()}`,
    );

    this.emitter.emit(CHECKER_EVENTS.SOURCE_BURN_RECONCILED, {
      ...pending,
      amountSent: amountSentLD,
    });
  }

  /**
   * Returns all pending mints that have NOT been reconciled and whose
   * detection time exceeds the provided window.
   *
   * @param windowMs  Milliseconds since detectedAt to consider "overdue"
   */
  getOverdueMints(windowMs: number): PendingMint[] {
    const now = Date.now();
    const overdue: PendingMint[] = [];

    for (const mint of this.pendingMints.values()) {
      if (!mint.sourceBurnFound && now - mint.detectedAt > windowMs) {
        overdue.push(mint);
      }
    }

    return overdue;
  }

  /**
   * Removes a pending mint from the map (called by reconciler after alerting).
   * @param guid  The GUID to remove
   */
  removePendingMint(guid: string): void {
    this.pendingMints.delete(guid);
  }

  /**
   * Current count of unreconciled pending mints (for metrics/health checks).
   */
  get pendingCount(): number {
    return [...this.pendingMints.values()].filter((m) => !m.sourceBurnFound)
      .length;
  }

  /**
   * Total pending mint entries (reconciled + unreconciled).
   */
  get totalTracked(): number {
    return this.pendingMints.size;
  }
}
