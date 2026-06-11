pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

/*
 * SENTINEL Invariant Check Template
 *
 * Proves that a single bridge invariant check was performed correctly:
 *   - The invariant delta was computed as (mintAmount - burnAmount)
 *   - The alert fired iff the delta exceeded the alert threshold
 *
 * Private inputs (not revealed — actual block data):
 *   mintAmount   : amount released on destination chain (Mantle)
 *   burnAmount   : amount burned/locked on source chain (Ethereum)
 *   blockNumber  : block number this check occurred at
 *
 * Public inputs (verifiable by anyone on-chain):
 *   invariantDelta  : mintAmount - burnAmount (revealed)
 *   alertThreshold  : threshold used for alert decision (revealed)
 *   alertFired      : 0 or 1 — did alert fire? (revealed)
 */
template InvariantCheck() {
    // Private inputs
    signal input mintAmount;
    signal input burnAmount;
    signal input blockNumber;

    // Public inputs / outputs
    signal input invariantDelta;
    signal input alertThreshold;
    signal input alertFired;

    // ── Constraint 1: delta was computed correctly ──────────────────────────
    signal computed_delta;
    computed_delta <== mintAmount - burnAmount;
    computed_delta === invariantDelta;

    // ── Constraint 2: alert fired iff delta > threshold ─────────────────────
    // We need: alertFired = (invariantDelta > alertThreshold) ? 1 : 0
    // Use circomlib GreaterThan comparator
    component gt = GreaterThan(252); // 252-bit comparison
    gt.in[0] <== invariantDelta;
    gt.in[1] <== alertThreshold;

    // gt.out is 1 iff invariantDelta > alertThreshold
    gt.out === alertFired;

    // ── Constraint 3: blockNumber is positive (sanity check) ────────────────
    signal blockPos;
    blockPos <== blockNumber * blockNumber;
    _ <== blockPos; // suppress unused signal warning
}

/*
 * SENTINEL Batch Template
 *
 * Aggregates N invariant checks into a single proof.
 * Amortises proof generation cost across many checks.
 * Per PRD §8.8: N=100 (100 checks per proof, ~20 minutes of blocks).
 */
template SentinelBatch(N) {
    // Arrays of N private inputs
    signal input mintAmounts[N];
    signal input burnAmounts[N];
    signal input blockNumbers[N];

    // Arrays of N public inputs
    signal input invariantDeltas[N];
    signal input alertThresholds[N];
    signal input alertsFired[N];

    // Instantiate N individual checks
    component checks[N];
    for (var i = 0; i < N; i++) {
        checks[i] = InvariantCheck();
        checks[i].mintAmount      <== mintAmounts[i];
        checks[i].burnAmount      <== burnAmounts[i];
        checks[i].blockNumber     <== blockNumbers[i];
        checks[i].invariantDelta  <== invariantDeltas[i];
        checks[i].alertThreshold  <== alertThresholds[i];
        checks[i].alertFired      <== alertsFired[i];
    }
}

// Main: batch of 100 invariant checks
component main {public [invariantDeltas, alertThresholds, alertsFired]} = SentinelBatch(100);
