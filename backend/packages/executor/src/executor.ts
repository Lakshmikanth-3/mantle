/**
 * @file executor.ts
 * @description Core execution logic for SENTINEL's autonomous defensive response system.
 *
 * Lifecycle for each INVARIANT_VIOLATION event:
 *   1. Filter: only act on CRITICAL severity (estimatedUSD >= CRITICAL_THRESHOLD_USD)
 *   2. Determine: protocol index from PROTOCOL_INDEX map
 *   3. Cap:  position size at MAX_DEFENSIVE_POSITION_USD
 *   4. Register: call SentinelCore.registerPosition() on-chain (audit trail)
 *   5. Execute: call SentinelOFT.executeCrossChainSend() to reduce bridge exposure
 *   6. Log:  call SentinelCore.logDefensiveAction() on-chain (audit trail)
 *
 * All steps are non-fatal: errors are caught, logged, and the agent continues.
 * A unique position ID is derived from the event GUID to ensure idempotency.
 *
 * Contract thresholds (SentinelCore.sol):
 *   CRITICAL_THRESHOLD_USD = $5,000,000 (5_000_000e6 in 6-dec units)
 *   MAX_DEFENSIVE_POSITION  = $10,000   (10_000e6 in 6-dec units)
 */

import 'dotenv/config';
import {
  registerPositionOnChain,
  logDefensiveActionOnChain,
  getProtocolExposure,
  isPositionActive,
} from './sentinelCore.js';
import { executeWithdrawal } from './strategies/withdraw.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Minimum USD value (as a plain number, same units as event.estimatedUSD)
 * for the executor to take action. Aligned with SentinelCore's CRITICAL_THRESHOLD_USD.
 *
 * Note: event.estimatedUSD is computed in reconciler.ts as a plain JS number
 * (not in 6-decimal units), so we compare against a dollar value directly.
 */
const CRITICAL_THRESHOLD_USD = Number(
  process.env.CRITICAL_THRESHOLD_USD ?? '500000',
); // Default: $500k (hackathon demo uses lower threshold in reconciler)

/**
 * Maximum defensive position in 6-decimal USD units (matches SentinelCore.MAX_DEFENSIVE_POSITION).
 * The contract enforces MAX_DEFENSIVE_POSITION = 10_000e6, so we cannot exceed this.
 *
 * This value is used when computing amountUSD for registerPositionOnChain().
 */
const MAX_DEFENSIVE_POSITION_USD = BigInt(
  process.env.MAX_DEFENSIVE_POSITION_USD ?? '10000',
) * 1_000_000n; // Convert to 6-decimal units: 10_000 → 10_000e6

/**
 * Maximum token units to withdraw per defensive action.
 * Kept small for testnet safety.
 */
const MAX_WITHDRAWAL_TOKEN_UNITS = 100n;

/**
 * Maps protocol names (as emitted by the watcher event bus) to their
 * index in SentinelCore's protocols[] array.
 *
 * Order matches the constructor call in the deployment script:
 *   ["rsETH (Kelp DAO)", "mETH (Mantle LSP)", "USDY (Ondo Finance)"]
 */
const PROTOCOL_INDEX: Record<string, bigint> = {
  'rsETH (Kelp DAO)': 0n,
  'mETH (Mantle LSP)': 1n,
  'USDY (Ondo Finance)': 2n,
};

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of the INVARIANT_VIOLATION event emitted by the watcher's reconciler.
 * Source: packages/watcher/src/invariant/reconciler.ts
 */
export interface InvariantViolationEvent {
  /** LayerZero cross-chain GUID (bytes32, hex string) */
  guid: string;
  /** Protocol name (matches keys in PROTOCOL_INDEX) */
  protocol: string;
  /** Mantle OFT contract address that emitted the anomalous event */
  protocolAddress: string;
  /** Raw token amount in smallest denomination (wei / LD units) */
  amount: bigint;
  /** Estimated USD value of the violated amount (plain number, not 6-dec) */
  estimatedUSD: number;
  /** Severity tier: 'CRITICAL' | 'HIGH' | 'MINOR' */
  severity: string;
  /** Human-readable reason for the violation */
  reason: string;
  /** Mantle block number where the anomaly was detected */
  blockNumber: bigint;
  /** Wall-clock timestamp (Date.now()) of the violation detection */
  timestamp: number;
}

export interface ExecutionResult {
  positionId: bigint;
  registerHash: string;
  withdrawHash: string;
  logHash: string;
  protocolIndex: bigint;
  amountUSD: bigint;
  amountWithdrawn: bigint;
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Tracks GUIDs for which we have already initiated a defensive action
 * in this process lifetime. Prevents double-spending from duplicate events.
 */
const handledGuids = new Set<string>();

// ─── Core handler ─────────────────────────────────────────────────────────────

/**
 * Handles an INVARIANT_VIOLATION event by executing a defensive action sequence.
 *
 * Non-fatal: all errors are caught and logged. The agent continues operating
 * even if individual steps fail (e.g. on-chain tx reverts).
 *
 * @param event  The violation event emitted by the watcher's reconciler
 */
export async function handleViolation(event: InvariantViolationEvent): Promise<void> {
  const tag = `[executor][${event.guid.slice(0, 10)}]`;

  console.info('');
  console.info(`${tag} ══════════════════════════════════════════════`);
  console.info(`${tag} INVARIANT_VIOLATION received`);
  console.info(`${tag}   protocol:     ${event.protocol}`);
  console.info(`${tag}   severity:     ${event.severity}`);
  console.info(`${tag}   estimatedUSD: $${event.estimatedUSD.toFixed(2)}`);
  console.info(`${tag}   reason:       ${event.reason}`);
  console.info(`${tag}   guid:         ${event.guid}`);
  console.info(`${tag}   block:        ${event.blockNumber}`);
  console.info(`${tag} ══════════════════════════════════════════════`);

  // ── Step 1: Severity filter ─────────────────────────────────────────────
  if (event.severity !== 'CRITICAL') {
    console.info(
      `${tag} Severity is "${event.severity}" — executor only responds to CRITICAL. ` +
        `Threshold: $${CRITICAL_THRESHOLD_USD.toLocaleString()}. Skipping.`,
    );
    return;
  }

  // ── Step 2: Deduplication ───────────────────────────────────────────────
  if (handledGuids.has(event.guid)) {
    console.warn(
      `${tag} GUID already handled in this session — skipping duplicate.`,
    );
    return;
  }
  handledGuids.add(event.guid);

  // ── Step 3: Protocol index lookup ───────────────────────────────────────
  const protocolIndex = PROTOCOL_INDEX[event.protocol];
  if (protocolIndex === undefined) {
    console.warn(
      `${tag} Protocol "${event.protocol}" not in PROTOCOL_INDEX map. ` +
        `Known protocols: ${Object.keys(PROTOCOL_INDEX).join(', ')}. ` +
        'Skipping defensive action.',
    );
    return;
  }

  // ── Step 4: Compute position size (cap at MAX_DEFENSIVE_POSITION_USD) ───
  //
  // event.estimatedUSD is a plain dollar number (e.g. 650000 = $650k).
  // We must convert to 6-decimal units for the contract call and cap it.
  const rawAmountUSD6Dec = BigInt(Math.floor(event.estimatedUSD)) * 1_000_000n;
  const amountUSD = rawAmountUSD6Dec > MAX_DEFENSIVE_POSITION_USD
    ? MAX_DEFENSIVE_POSITION_USD
    : rawAmountUSD6Dec;

  console.info(
    `${tag} Position size: $${Number(amountUSD) / 1_000_000} USD ` +
      `(6-dec: ${amountUSD}) [capped at $${Number(MAX_DEFENSIVE_POSITION_USD) / 1_000_000}]`,
  );

  // ── Step 5: Derive unique position ID from GUID + timestamp ─────────────
  //
  // Use the lower 18 hex digits of the GUID XOR'd with the event timestamp
  // to produce a deterministic but unique uint256 position ID.
  const guidHex = event.guid.replace(/^0x/, '');
  const guidLow = BigInt('0x' + guidHex.slice(-16));
  const positionId = guidLow ^ BigInt(event.timestamp);

  console.info(`${tag} Derived positionId: ${positionId}`);

  // Check if already registered (handles edge case of duplicate cross-session)
  let alreadyActive = false;
  try {
    alreadyActive = await isPositionActive(positionId);
  } catch (err) {
    console.warn(`${tag} Could not check position status: ${String(err)}`);
  }

  if (alreadyActive) {
    console.warn(
      `${tag} Position ${positionId} is already active on-chain. ` +
        'This may indicate a replay. Skipping registration but proceeding to log action.',
    );
  }

  // ── Step 6: Register position on-chain ──────────────────────────────────
  let registerHash = 'skipped';
  if (!alreadyActive) {
    try {
      registerHash = await registerPositionOnChain(positionId, protocolIndex, amountUSD);
      console.info(`${tag} ✅ Position registered on-chain: ${registerHash}`);
    } catch (err) {
      console.error(
        `${tag} ❌ registerPositionOnChain failed: ${String(err)}`,
      );
      // Non-fatal: attempt withdrawal and logging anyway
    }
  }

  // ── Step 7: Execute on-chain withdrawal (SentinelOFT.executeCrossChainSend) ──────────
  //
  // Token amount for executeCrossChainSend: use human units (not wei).
  // Derive from estimatedUSD: estimate token units assuming ~$3200/ETH for LSTs.
  // Cap at MAX_WITHDRAWAL_TOKEN_UNITS for testnet safety.
  const roughTokenUnits = BigInt(Math.max(1, Math.floor(event.estimatedUSD / 3200)));
  const withdrawTokenUnits = roughTokenUnits > MAX_WITHDRAWAL_TOKEN_UNITS
    ? MAX_WITHDRAWAL_TOKEN_UNITS
    : roughTokenUnits;

  let withdrawHash = 'skipped';
  let amountWithdrawn = 0n;

  try {
    const withdrawalResult = await executeWithdrawal(event.protocol, withdrawTokenUnits);
    withdrawHash = withdrawalResult.hash;
    amountWithdrawn = withdrawalResult.amountSent;

    console.info(
      `${tag} ✅ Withdrawal executed | tx=${withdrawHash} ` +
        `amountSent=${amountWithdrawn} guid=${withdrawalResult.guid}`,
    );
  } catch (err) {
    console.error(
      `${tag} ❌ executeWithdrawal failed for "${event.protocol}": ${String(err)}`,
    );
    // Non-fatal: continue to log the action even if withdrawal failed
  }

  // ── Step 8: Log defensive action on-chain ───────────────────────────────
  let logHash = 'skipped';
  try {
    logHash = await logDefensiveActionOnChain(positionId, 'EMERGENCY_WITHDRAWAL');
    console.info(`${tag} ✅ Defensive action logged on-chain: ${logHash}`);
  } catch (err) {
    console.error(
      `${tag} ❌ logDefensiveActionOnChain failed: ${String(err)}`,
    );
    // Non-fatal: position log failure does not undo the withdrawal
  }

  // ── Step 9: Summary ──────────────────────────────────────────────────────
  console.info('');
  console.info(`${tag} ── Execution Summary ──`);
  console.info(`${tag}   protocol:       ${event.protocol}`);
  console.info(`${tag}   positionId:     ${positionId}`);
  console.info(`${tag}   amountUSD:      $${Number(amountUSD) / 1_000_000}`);
  console.info(`${tag}   registerTx:     ${registerHash}`);
  console.info(`${tag}   withdrawTx:     ${withdrawHash}`);
  console.info(`${tag}   logTx:          ${logHash}`);
  console.info(`${tag}   amountWithdrawn:${amountWithdrawn} token units`);
  console.info(`${tag} ────────────────────────`);
  console.info('');
}

/**
 * Fetches current on-chain exposure for a protocol from SentinelCore.
 * Useful for pre-execution checks.
 */
export async function checkProtocolExposure(protocolName: string): Promise<bigint | null> {
  const idx = PROTOCOL_INDEX[protocolName];
  if (idx === undefined) return null;

  try {
    return await getProtocolExposure(idx);
  } catch (err) {
    console.warn(`[executor] getProtocolExposure(${idx}) failed: ${String(err)}`);
    return null;
  }
}
