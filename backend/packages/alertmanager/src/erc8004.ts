import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet, mantle } from 'viem/chains';
import 'dotenv/config';

const isMainnet = process.env.NETWORK_ENV === 'mainnet';

// ─── Address validation ────────────────────────────────────────────────────────
function isValidAddress(addr: string | undefined): addr is `0x${string}` {
  if (!addr) return false;
  if (!addr.startsWith('0x')) return false;
  if (addr.length !== 42) return false;
  if (addr.toLowerCase().includes('1234567890abcdef')) return false;
  if (addr === '0x0000000000000000000000000000000000000000') return false;
  return true;
}

const MANTLE_RPC = isMainnet
  ? (process.env.MANTLE_MAINNET_RPC_URL || 'https://rpc.mantle.xyz')
  : (process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz');

// ─── ABIs ──────────────────────────────────────────────────────────────────────

const REPUTATION_ABI = [
  {
    name: 'submitFeedback',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId',    type: 'uint256' },
      { name: 'taskId',     type: 'bytes32' },
      { name: 'scoreFixed', type: 'int128'  },
      { name: 'decimals_',  type: 'uint8'   },
      { name: 'metadataCID',type: 'string'  },
    ],
    outputs: [],
  },
] as const;

const VALIDATION_ABI = [
  {
    name: 'submitValidation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId',         type: 'uint256' },
      { name: 'batchId',         type: 'bytes32' },
      { name: 'proofCalldata',   type: 'bytes'   },
      { name: 'verifierContract',type: 'address' },
    ],
    outputs: [],
  },
] as const;

const IDENTITY_ABI = [
  {
    name: 'registerAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId',      type: 'uint256' },
      { name: 'name',         type: 'string'  },
      { name: 'agentURI',     type: 'string'  },
      { name: 'capabilities', type: 'string'  },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'isRegistered',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

const SENTINEL_CORE_ABI = [
  {
    name: 'fireAlert',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'protocolIndex', type: 'uint256' },
      { name: 'riskScore',     type: 'uint8'   },
    ],
    outputs: [{ name: 'alertId', type: 'uint256' }],
  },
  {
    name: 'updateExposure',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'protocolIndex', type: 'uint256' },
      { name: 'newExposureUSD',type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'logProposalDraft',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId',    type: 'uint256' },
      { name: 'protocolIndex', type: 'uint256' },
      { name: 'description',   type: 'string'  },
    ],
    outputs: [],
  },
] as const;

// ─── Client factory ────────────────────────────────────────────────────────────
function getWalletClient() {
  const pk = process.env.SENTINEL_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) return null;
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: isMainnet ? mantle : mantleSepoliaTestnet,
    transport: http(MANTLE_RPC),
  });
}

function getPublicClient() {
  return createPublicClient({
    chain: isMainnet ? mantle : mantleSepoliaTestnet,
    transport: http(MANTLE_RPC),
  });
}

// ─── Register agent identity at startup ─────────────────────────────────────
let _identityRegistered = false;
export async function ensureAgentRegistered(): Promise<void> {
  if (_identityRegistered) return;
  const registryAddr = process.env.ERC8004_IDENTITY_REGISTRY;
  if (!isValidAddress(registryAddr)) return;

  const wallet = getWalletClient();
  if (!wallet) return;

  try {
    const pub = getPublicClient();
    const alreadyRegistered = await pub.readContract({
      address: registryAddr,
      abi: IDENTITY_ABI,
      functionName: 'isRegistered',
      args: [21n],
    });

    if (!alreadyRegistered) {
      await wallet.writeContract({
        address: registryAddr,
        abi: IDENTITY_ABI,
        functionName: 'registerAgent',
        args: [
          21n,
          'SENTINEL Agent #021',
          'ipfs://sentinel-agent-021-metadata',
          'risk-monitor,invariant-checker,governance,oracle,erc8004',
        ],
      });
      console.log('[erc8004] ✅ Agent #021 registered in Identity Registry');
    } else {
      console.log('[erc8004] Agent #021 already registered in Identity Registry');
    }
    _identityRegistered = true;
  } catch (err: any) {
    console.warn('[erc8004] Identity registration failed (non-fatal):', err.message);
  }
}

// ─── Fire on-chain alert via SentinelCore ──────────────────────────────────
export async function fireSentinelCoreAlert(
  protocolIndex: bigint,
  riskScore: number,
  exposureUSD: number,
): Promise<`0x${string}` | null> {
  const coreAddr = process.env.SENTINEL_CORE_ADDRESS;
  if (!isValidAddress(coreAddr)) {
    console.warn('[erc8004] SENTINEL_CORE_ADDRESS not set — skipping on-chain alert');
    return null;
  }

  const wallet = getWalletClient();
  const pub = getPublicClient();
  if (!wallet || !pub) return null;

  try {
    // First update exposure on-chain (in 6-decimal USD units)
    const exposureUSD6Dec = BigInt(Math.round(exposureUSD * 1e6));
    const tx1 = await wallet.writeContract({
      address: coreAddr,
      abi: SENTINEL_CORE_ABI,
      functionName: 'updateExposure',
      args: [protocolIndex, exposureUSD6Dec],
    });
    await pub.waitForTransactionReceipt({ hash: tx1 });

    // Then fire the alert
    const txHash = await wallet.writeContract({
      address: coreAddr,
      abi: SENTINEL_CORE_ABI,
      functionName: 'fireAlert',
      args: [protocolIndex, Math.min(100, Math.round(riskScore)) as any],
    });
    await pub.waitForTransactionReceipt({ hash: txHash });

    console.log(`[erc8004] ✅ SentinelCore.fireAlert TX: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.error('[erc8004] SentinelCore.fireAlert failed (non-fatal):', err.message);
    return null;
  }
}

// ─── Log governance proposal on-chain via SentinelCore ──────────────────────
export async function logProposalOnChain(
  proposalId: bigint,
  protocolIndex: bigint,
  description: string,
): Promise<`0x${string}` | null> {
  const coreAddr = process.env.SENTINEL_CORE_ADDRESS;
  if (!isValidAddress(coreAddr)) return null;

  const wallet = getWalletClient();
  const pub = getPublicClient();
  if (!wallet || !pub) return null;

  try {
    const txHash = await wallet.writeContract({
      address: coreAddr,
      abi: SENTINEL_CORE_ABI,
      functionName: 'logProposalDraft',
      args: [proposalId, protocolIndex, description],
    });
    await pub.waitForTransactionReceipt({ hash: txHash });
    console.log(`[erc8004] ✅ SentinelCore.logProposalDraft TX: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.error('[erc8004] logProposalDraft failed (non-fatal):', err.message);
    return null;
  }
}

// ─── Submit reputation feedback ────────────────────────────────────────────
export async function submitReputationFeedback(
  agentId:    bigint,
  taskId:     `0x${string}`,
  scoreFixed: bigint,
  metadataCID: string,
): Promise<`0x${string}` | null> {
  const registryAddr = process.env.ERC8004_REPUTATION_REGISTRY;
  if (!isValidAddress(registryAddr)) {
    console.warn('[erc8004] ERC8004_REPUTATION_REGISTRY not configured — skipping (non-fatal)');
    return null;
  }

  const wallet = getWalletClient();
  const pub = getPublicClient();
  if (!wallet || !pub) {
    console.warn('[erc8004] SENTINEL_PRIVATE_KEY not set — skipping reputation log');
    return null;
  }

  try {
    const txHash = await wallet.writeContract({
      address: registryAddr,
      abi: REPUTATION_ABI,
      functionName: 'submitFeedback',
      args: [agentId, taskId, scoreFixed, 2, metadataCID],
    });
    await pub.waitForTransactionReceipt({ hash: txHash });
    console.log(`[erc8004] ✅ Reputation feedback TX: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.error('[erc8004] Reputation feedback failed (non-fatal):', err.message);
    return null;
  }
}

// ─── Submit validation proof ───────────────────────────────────────────────
export async function submitValidationProof(
  agentId:         bigint,
  batchId:         `0x${string}`,
  proofCalldata:   `0x${string}`,
  verifierContract:`0x${string}`,
): Promise<`0x${string}` | null> {
  const registryAddr = process.env.ERC8004_VALIDATION_REGISTRY;
  if (!isValidAddress(registryAddr)) {
    console.warn('[erc8004] ERC8004_VALIDATION_REGISTRY not configured — skipping (non-fatal)');
    return null;
  }

  const wallet = getWalletClient();
  const pub = getPublicClient();
  if (!wallet || !pub) return null;

  try {
    const txHash = await wallet.writeContract({
      address: registryAddr,
      abi: VALIDATION_ABI,
      functionName: 'submitValidation',
      args: [agentId, batchId, proofCalldata, verifierContract],
    });
    await pub.waitForTransactionReceipt({ hash: txHash });
    console.log(`[erc8004] ✅ Validation proof TX: ${txHash}`);
    return txHash;
  } catch (err: any) {
    console.error('[erc8004] Validation proof failed (non-fatal):', err.message);
    return null;
  }
}
