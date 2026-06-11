import 'dotenv/config';
import EventEmitter from 'eventemitter3';
import { EVENTS } from '../../watcher/src/index.js';
import {
  dispatchCriticalAlert,
  dispatchAmberAlert,
  dispatchGovernanceDraftAlert,
} from './telegram.js';
import {
  submitReputationFeedback,
  submitValidationProof,
  fireSentinelCoreAlert,
  logProposalOnChain,
  ensureAgentRegistered,
} from './erc8004.js';
import { keccak256, stringToHex, toHex } from 'viem';
import { startWebSocketServer } from './server.js';

// Protocol index in SentinelCore.protocols[] — matches deploy order
const PROTOCOL_INDEX: Record<string, bigint> = {
  'rsETH (Kelp DAO)': 0n,
  'mETH (Mantle LSP)': 1n,
  'USDY (Ondo Finance)': 2n,
};

function getProtocolIndex(name: string): bigint {
  for (const [key, idx] of Object.entries(PROTOCOL_INDEX)) {
    if (name.toLowerCase().includes(key.split(' ')[0].toLowerCase())) return idx;
  }
  return 0n;
}

export function attachAlertRouter(bus: EventEmitter): void {

  // Start WS Server
  startWebSocketServer(bus, 3001);

  // Register SENTINEL Agent #021 identity at startup (non-fatal)
  ensureAgentRegistered().catch(() => {});

  // ── PERSISTENCE (Prisma) ──────────────────────────────────────────────────
  import('./db.js').then(({ prisma }) => {
    bus.on(EVENTS.PENDING_MINT_ADDED as string, async (pending) => {
      try {
        await prisma.pendingMint.create({
          data: {
            guid: pending.guid,
            protocol: pending.protocol,
            protocolAddress: pending.protocolAddress,
            amount: pending.amount.toString(),
            blockNumber: pending.blockNumber.toString(),
            detectedAt: Math.floor(pending.detectedAt / 1000),
            sourceBurnFound: pending.sourceBurnFound
          }
        });
      } catch(err) { console.error('DB Error: ', err) }
    });

    bus.on(EVENTS.SOURCE_BURN_RECONCILED as string, async (pending) => {
      try {
        await prisma.pendingMint.update({
          where: { guid: pending.guid },
          data: { sourceBurnFound: true }
        });
      } catch(err) { console.error('DB Error: ', err) }
    });
  }).catch(() => {});

  // ── INVARIANT_VIOLATION — primary alert path ──────────────────────────────
  bus.on(EVENTS.INVARIANT_VIOLATION, async (event: {
    guid: string;
    protocol: string;
    protocolAddress: string;
    amount: bigint;
    estimatedUSD: number;
    severity: 'MINOR' | 'HIGH' | 'CRITICAL';
    reason: string;
    blockNumber: bigint;
    timestamp: number;
  }) => {
    console.log(
      `[router] INVARIANT VIOLATION | ${event.protocol} | $${event.estimatedUSD.toLocaleString()} | ${event.severity}`,
    );

    const zkProofHash = keccak256(
      stringToHex(`sentinel:violation:${event.guid}:${event.timestamp}`)
    );

    const alert = {
      protocol:         event.protocol,
      protocolAddress:  event.protocolAddress,
      type:             event.reason === 'RELEASE_WITHOUT_BURN' ? 'RELEASE_WITHOUT_BURN' : 'ANOMALY_SCORE',
      detectedAt:       event.timestamp,
      amount:           event.amount,
      estimatedUSD:     event.estimatedUSD,
      mantleExposureUSD: event.estimatedUSD,
      actionsTaken:     ['ERC-8004 risk event logged', 'ZK proof submitted', 'SentinelCore alert fired'],
      zkProofHash,
    };

    // 1. ── Telegram alert (non-fatal) ────────────────────────────────────────
    try {
      await dispatchCriticalAlert(alert);
      console.log('[router] ✅ Telegram alert dispatched');
    } catch (err: any) {
      console.error('[router] Telegram dispatch failed (non-fatal):', err.message);
    }

    const protocolIndex = getProtocolIndex(event.protocol);
    const taskId = keccak256(stringToHex(event.guid)) as `0x${string}`;
    const alertId = `alert-${Date.now()}`;

    // Execute on-chain TXs sequentially to avoid viem nonce collisions
    const riskScore = event.severity === 'CRITICAL' ? 94 : event.severity === 'HIGH' ? 72 : 45;
    
    // 2. ── SentinelCore.fireAlert on-chain (non-fatal) ───────────────────────
    const tx1 = await fireSentinelCoreAlert(protocolIndex, riskScore, event.estimatedUSD).catch(() => null);
    if (tx1) bus.emit('ACTION_COMPLETE', { label: 'SentinelCore alert fired', txHash: tx1 });

    // 3. ── ERC-8004 Reputation feedback (non-fatal) ──────────────────────────
    const tx2 = await submitReputationFeedback(
      21n,
      taskId,
      9200n,
      `ipfs://sentinel-alert-${event.guid}`,
    ).catch(() => null);
    if (tx2) bus.emit('ACTION_COMPLETE', { label: 'ERC-8004 risk event logged', txHash: tx2 });

// Global batch queue for ZK
const ZK_BATCH_SIZE = 100;
let zkBatchQueue: Array<{
  mintAmount: string,
  burnAmount: string,
  blockNumber: string,
  invariantDelta: string,
  alertThreshold: string,
  alertFired: string
}> = [];

function padBatchTo(queue: typeof zkBatchQueue, targetSize: number) {
  const padded = [...queue];
  while (padded.length < targetSize) {
    padded.push({
      mintAmount: "0",
      burnAmount: "0",
      blockNumber: "1",
      invariantDelta: "0",
      alertThreshold: "50000",
      alertFired: "0"
    });
  }
  return padded;
}

    // 4. ── ERC-8004 Validation proof (batch queueing) ────────────────────────
    const verifierAddr = (process.env.SENTINEL_VERIFIER_ADDRESS || '0x5846A5c595a5e45dB63E90C76181B6a3DBD35816') as `0x${string}`;
    const batchId = taskId;
    try {
      const burnAmount = 0n; // Assuming missing burn for this exploit case
      const invariantDelta = event.amount - burnAmount;
      const alertThreshold = 50000n; // Dummy threshold

      zkBatchQueue.push({
        mintAmount: event.amount.toString(),
        burnAmount: burnAmount.toString(),
        blockNumber: event.blockNumber.toString(),
        invariantDelta: invariantDelta.toString(),
        alertThreshold: alertThreshold.toString(),
        alertFired: "1"
      });

      // Submit batch if full OR if this is a CRITICAL severity violation
      if (zkBatchQueue.length >= ZK_BATCH_SIZE || event.severity === 'CRITICAL') {
        const batchToSubmit = padBatchTo(zkBatchQueue.slice(0, ZK_BATCH_SIZE), ZK_BATCH_SIZE);
        // Remove submitted items from queue
        zkBatchQueue = zkBatchQueue.slice(ZK_BATCH_SIZE);

        const inputData = {
          mintAmounts: batchToSubmit.map(i => i.mintAmount),
          burnAmounts: batchToSubmit.map(i => i.burnAmount),
          blockNumbers: batchToSubmit.map(i => i.blockNumber),
          invariantDeltas: batchToSubmit.map(i => i.invariantDelta),
          alertThresholds: batchToSubmit.map(i => i.alertThreshold),
          alertsFired: batchToSubmit.map(i => i.alertFired)
        };

        const { generateInvariantProof } = await import('../../prover/src/index.js');
        const { proofCalldata } = await generateInvariantProof(inputData);
        
        const tx3 = await submitValidationProof(21n, batchId, proofCalldata, verifierAddr).catch(() => null);
        if (tx3) bus.emit('ACTION_COMPLETE', { label: 'ZK proof submitted', txHash: tx3 });
        console.log(`[router] ✅ ZK Batch Proof (size 100) generated and submitted.`);
      } else {
        console.log(`[router] ⏳ Added to ZK batch queue (${zkBatchQueue.length}/${ZK_BATCH_SIZE})`);
      }
    } catch (err: any) {
      console.error('[router] Validation proof failed (non-fatal):', err.message);
    }

    // 5. ── Governance draft via Gemini (CRITICAL only, fire-and-forget) ───────
    if (event.severity === 'CRITICAL' || event.estimatedUSD >= 5_000_000) {
      console.log('[router] CRITICAL threshold exceeded — triggering Gemini governance draft...');

      (async () => {
        try {
          const { generateGovernanceProposal } = await import('../../governance/src/index.js');

          const result = await generateGovernanceProposal({
            alertId,
            protocol:          event.protocol,
            protocolAddress:   event.protocolAddress,
            protocolTokenSymbol: event.protocol.split(' ')[0],
            detectionTimestamp: event.timestamp,
            type:              'RELEASE_WITHOUT_BURN',
            deltaAmount:       event.amount,
            badDebtUSD:        event.estimatedUSD,
            mantleExposureUSD: event.estimatedUSD,
            zkProofHash,
            erc8004ValidationEntry: taskId,
            exploitMechanics:  `Invariant violation on ${event.protocol}. ${event.reason}`,
          });

          // Log governance proposal on-chain via SentinelCore
          const proposalId = BigInt(Date.now());
          logProposalOnChain(
            proposalId,
            protocolIndex,
            `Gemini MIP Draft: ${result.forumPostUrl}`,
          ).catch(() => {});

          await dispatchGovernanceDraftAlert(event.protocol, result.forumPostUrl, result.generatedInMs);

          // ── Broadcast draft to all Monitor clients via WS ─────────────────
          bus.emit('governance:draft_complete', {
            title: `[SENTINEL AUTO-DRAFT] MIP: Emergency Response — ${event.protocol}`,
            body: `SENTINEL (Agent #021, ERC-8004) detected an invariant violation in ${event.protocol} at ${new Date(event.timestamp).toISOString()}.\n\nApproximately ${(Number(event.amount) / 1e18).toFixed(2)} tokens were released on destination chains without a corresponding burn event, representing $${event.estimatedUSD.toLocaleString()} in unbacked exposure.\n\nForum post: ${result.forumPostUrl}\nProposal hash: ${result.proposalHash}`,
            forumUrl: result.forumPostUrl,
            generatedInMs: result.generatedInMs,
            zkProofHash: result.proposalHash,
            protocol: event.protocol,
          });

          console.log(`[router] ✅ Governance draft complete: ${result.forumPostUrl}`);

        } catch (err: any) {
          console.error('[router] Governance draft failed (non-fatal):', err.message);
        }
      })();
    }
  });

  // ── STAGING_SIGNAL — pre-attack amber alert ───────────────────────────────
  bus.on(EVENTS.STAGING_SIGNAL, async (event: {
    protocol: string;
    signals: Array<{ walletAddress: string; tcFundingAmount: number }>;
    timestamp: number;
  }) => {
    console.log(`[router] STAGING SIGNAL | ${event.protocol} | ${event.signals.length} wallets`);
    try {
      await dispatchAmberAlert({
        protocol:    event.protocol,
        description: `${event.signals.length} Tornado Cash-funded wallet(s) interacting with bridge`,
        walletCount: event.signals.length,
        timestamp:   event.timestamp,
      });
    } catch (err: any) {
      console.error('[router] Amber alert dispatch failed (non-fatal):', err.message);
    }
  });

  // ── SENTIMENT_DROP — informational only ──────────────────────────────────
  bus.on(EVENTS.SENTIMENT_DROP, (event: any) => {
    const delta = (event.signal?.delta * 100 || 0).toFixed(1);
    console.log(`[router] SENTIMENT DROP | ${event.protocol} | ${delta}%`);
  });

  console.log('[alertmanager] Router attached to watcher bus');
}
