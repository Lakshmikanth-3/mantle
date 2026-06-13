import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore — snarkjs ships CJS, import works fine at runtime
import snarkjs from 'snarkjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.resolve(__dirname, '../build');
const wasmPath = path.join(buildDir, 'sentinel_invariant_batch_js/sentinel_invariant_batch.wasm');
const zkeyPath = path.join(buildDir, 'sentinel_final.zkey');

export interface ZKProofResult {
  proofCalldata: `0x${string}`;
}

/**
 * Generates a real Groth16 ZK proof using SnarkJS for the invariant violation.
 * All circuit artifacts (WASM + zkey) are pre-compiled in build/.
 */
export async function generateInvariantProof(inputData: any): Promise<ZKProofResult> {
  const timestamp = Date.now();
  const proofPath = path.join(buildDir, `proof_${timestamp}.json`);
  const publicPath = path.join(buildDir, `public_${timestamp}.json`);

  try {
    console.log('[prover] Generating real Groth16 ZK proof...');

    // Generate witness + proof in one call — fully in-process, no exec() needed
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputData,
      wasmPath,
      zkeyPath
    );

    console.log(`[prover] Proof generated. Public signals: ${JSON.stringify(publicSignals)}`);

    // Export Solidity-compatible calldata (ABI-encoded a,b,c + input array)
    const rawCalldata: string = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

    // rawCalldata is already hex-encoded and comma-separated into a,b,c,input
    // Encode as a single bytes32 hash for the on-chain registry submission
    // The SentinelCore contract expects bytes calldata — we pass the full ABI-encoded proof
    const proofCalldata = ('0x' + Buffer.from(rawCalldata).toString('hex')) as `0x${string}`;

    return { proofCalldata };
  } finally {
    // Cleanup temp files if they were written to disk by snarkjs internals
    if (fs.existsSync(proofPath)) fs.unlinkSync(proofPath);
    if (fs.existsSync(publicPath)) fs.unlinkSync(publicPath);
  }
}

