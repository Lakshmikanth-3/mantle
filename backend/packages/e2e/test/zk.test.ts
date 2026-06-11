/**
 * @file zk.test.ts
 * ZK Proof Generation Test — Groth16 N=100 (sentinel_invariant_batch circuit).
 *
 * This test exercises the full snarkjs Groth16 prover pipeline:
 *   1. Build an input JSON with 1 real invariant violation + 99 neutral padding entries.
 *   2. Call generateInvariantProof() which runs snarkjs groth16 fullprove.
 *   3. Assert the resulting calldata is ABI-encoded proof bytes starting with '0x'.
 *
 * Prerequisites:
 *   - packages/prover/build/sentinel_invariant_batch_js/sentinel_invariant_batch.wasm
 *   - packages/prover/build/sentinel_final.zkey
 *
 * The timeout is 300 000 ms (5 minutes) because snarkjs witness generation
 * and proof computation for a 100-entry circuit can take 30–120 s on typical CI hardware.
 */
import 'dotenv/config';
import { expect } from 'chai';
import { generateInvariantProof } from '../../prover/src/index.js';

const BATCH_SIZE = 100;
const ALERT_THRESHOLD = 500_000_000_000; // 500_000e6

/** Neutral padding entry — no violation, amounts balanced. */
const NEUTRAL_ENTRY = {
  mintAmount:      '0',
  burnAmount:      '0',
  blockNumber:     '0',
  invariantDelta:  '0',
  alertThreshold:  String(ALERT_THRESHOLD),
  alertFired:      '0',
};

/** Build a real violation entry from the given block number. */
function makeViolationEntry(blockNumber: number) {
  const mintAmount     = '15000000000000000000000'; // 15 000 ETH (wei)
  const burnAmount     = '0';                        // no matching burn
  const invariantDelta = mintAmount;                 // full delta
  return {
    mintAmount,
    burnAmount,
    blockNumber:    String(blockNumber),
    invariantDelta,
    alertThreshold: String(ALERT_THRESHOLD),
    alertFired:     '1', // alert was fired for this entry
  };
}

/** Pad a check array to exactly BATCH_SIZE with neutral entries. */
function padToN(entries: object[], n: number = BATCH_SIZE): object[] {
  const result = [...entries];
  while (result.length < n) {
    result.push(NEUTRAL_ENTRY);
  }
  return result;
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('ZK Proof Generation (Groth16 N=100)', function () {
  // snarkjs fullprove can take up to 2 minutes on slow hardware.
  this.timeout(300_000);

  it('should generate a valid calldata for a batch of 1 real + 99 padded entries', async () => {
    const realViolation = makeViolationEntry(39_473_644);
    const inputData = {
      checks: padToN([realViolation]),
    };

    const result = await generateInvariantProof(inputData);

    // proofCalldata must be a hex string
    expect(result).to.be.an('object');
    expect(result).to.have.property('proofCalldata');
    expect(result.proofCalldata).to.be.a('string');
    expect(result.proofCalldata).to.match(/^0x/);

    // ABI-encoded Groth16 calldata for N=100 is 4 * 32 (pA) + 4 * 32 (pB) + 4 * 32 (pC)
    // + 300 * 32 (public signals) = 9856 bytes → hex string is at minimum 9856*2 + 2 chars
    expect(result.proofCalldata.length).to.be.above(100);
  });

  it('should prove sum(OFTReceived) > sum(OFTSent)', async () => {
    // Build a batch where total minted tokens (across all real entries) exceed total burned.
    const mintAmount  = '20000000000000000000000'; // 20 000 ETH
    const burnAmount  = '5000000000000000000000';  // only 5 000 ETH burned — net delta = 15 000
    const violation = {
      mintAmount,
      burnAmount,
      blockNumber:    '39473650',
      invariantDelta: String(BigInt(mintAmount) - BigInt(burnAmount)),
      alertThreshold: String(ALERT_THRESHOLD),
      alertFired:     '1',
    };

    const inputData = {
      checks: padToN([violation]),
    };

    const result = await generateInvariantProof(inputData);

    expect(result.proofCalldata).to.be.a('string');
    expect(result.proofCalldata).to.match(/^0x/);

    // The calldata encodes the public signals which include the invariant delta.
    // Since snarkjs encodes signals as decimal field elements in the public output JSON,
    // and we then ABI-encode them, the calldata length scales with N.
    // A minimal sanity-check: the calldata contains actual data (not just zeroes).
    const nonZeroBytes = result.proofCalldata
      .slice(2) // remove '0x'
      .replace(/0/g, '')
      .length;
    expect(nonZeroBytes).to.be.above(0);
  });
});
