/**
 * @file sentinelCore.ts
 * @description Real viem integration with the deployed SentinelCore contract on Mantle Sepolia.
 *
 * Provides three primary interactions:
 *   1. registerPosition  — registers a defensive position on-chain (agent or owner)
 *   2. logDefensiveAction — logs a completed defensive action against a registered position
 *   3. getProtocolExposure — reads exposureUSD for a given protocol index
 *
 * Contract: 0x38E0D4468Afdd12776b7D371166edED8E9522054 (Mantle Sepolia, chain 5003)
 * Deployer / owner: 0x306037A2FdE5e44C0bd2f017BfC4fDB3Cd0bAa1D
 */

import 'dotenv/config';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';

// ─── Environment ──────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.SENTINEL_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error('[sentinelCore] SENTINEL_PRIVATE_KEY env var is required');
}

const SENTINEL_CORE_ADDRESS = (
  process.env.SENTINEL_CORE_ADDRESS ?? '0x38E0D4468Afdd12776b7D371166edED8E9522054'
) as Address;

const RPC_URL =
  process.env.MANTLE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.mantle.xyz';

// ─── ABI (relevant functions only) ────────────────────────────────────────────

/**
 * Minimal ABI for SentinelCore interactions needed by the executor.
 *
 * registerPosition(uint256 positionId, uint256 protocolIndex, uint256 amountUSD)
 *   — open/owner-and-agent, registers a defensive position
 *
 * logDefensiveAction(uint256 positionId, string action) returns (uint256 actionId)
 *   — onlyAgent, logs a completed defensive action
 *
 * getProtocol(uint256 index) returns (tuple)
 *   — view, returns protocol metadata including exposureUSD
 *
 * protocols(uint256) — public storage getter (used as fallback)
 */
const SENTINEL_CORE_ABI = parseAbi([
  'function registerPosition(uint256 positionId, uint256 protocolIndex, uint256 amountUSD) external',
  'function logDefensiveAction(uint256 positionId, string calldata action) external returns (uint256 actionId)',
  'function getProtocol(uint256 index) external view returns (tuple(string name, address contractAddr, uint256 exposureUSD, bool active) memory)',
  'function protocols(uint256 index) external view returns (string name, address contractAddr, uint256 exposureUSD, bool active)',
  'function protocolCount() external view returns (uint256)',
  'function sentinelPositions(uint256 positionId) external view returns (uint256 protocol, uint256 amountUSD, bool active, uint256 openedAt)',
]);

// ─── Viem clients ─────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: mantleSepoliaTestnet,
  transport: http(RPC_URL),
});

export const publicClient = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http(RPC_URL),
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers a defensive position on-chain via SentinelCore.registerPosition().
 *
 * @param positionId     Caller-supplied unique position ID (use timestamp-based ID)
 * @param protocolIndex  Index of the protocol in SentinelCore.protocols[]
 * @param amountUSD      Position size in 6-decimal USD units (e.g. 10_000e6 = $10k)
 * @returns              Transaction hash of the submitted transaction
 */
export async function registerPositionOnChain(
  positionId: bigint,
  protocolIndex: bigint,
  amountUSD: bigint,
): Promise<Hash> {
  console.info(
    `[sentinelCore] Registering position | positionId=${positionId} ` +
      `protocolIndex=${protocolIndex} amountUSD=${amountUSD}`,
  );

  const hash = await walletClient.writeContract({
    address: SENTINEL_CORE_ADDRESS,
    abi: SENTINEL_CORE_ABI,
    functionName: 'registerPosition',
    args: [positionId, protocolIndex, amountUSD],
  });

  console.info(`[sentinelCore] registerPosition tx submitted: ${hash}`);

  // Wait for 1-block confirmation
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(
      `[sentinelCore] registerPosition tx ${hash} reverted (block ${receipt.blockNumber})`,
    );
  }

  console.info(
    `[sentinelCore] ✅ Position registered | tx=${hash} block=${receipt.blockNumber}`,
  );

  return hash;
}

/**
 * Logs a completed defensive action on-chain via SentinelCore.logDefensiveAction().
 *
 * @param positionId  Position identifier previously registered with registerPositionOnChain()
 * @param action      Short action descriptor, e.g. 'EMERGENCY_WITHDRAWAL'
 * @returns           Transaction hash of the submitted transaction
 */
export async function logDefensiveActionOnChain(
  positionId: bigint,
  action: string,
): Promise<Hash> {
  console.info(
    `[sentinelCore] Logging defensive action | positionId=${positionId} action="${action}"`,
  );

  const hash = await walletClient.writeContract({
    address: SENTINEL_CORE_ADDRESS,
    abi: SENTINEL_CORE_ABI,
    functionName: 'logDefensiveAction',
    args: [positionId, action],
  });

  console.info(`[sentinelCore] logDefensiveAction tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(
      `[sentinelCore] logDefensiveAction tx ${hash} reverted (block ${receipt.blockNumber})`,
    );
  }

  console.info(
    `[sentinelCore] ✅ Defensive action logged | tx=${hash} block=${receipt.blockNumber}`,
  );

  return hash;
}

/**
 * Reads the current exposureUSD for a protocol from SentinelCore.getProtocol().
 *
 * @param protocolIndex  Index of the protocol in SentinelCore.protocols[]
 * @returns              exposureUSD in 6-decimal USD units (e.g. 500_000e6 = $500k)
 */
export async function getProtocolExposure(protocolIndex: bigint): Promise<bigint> {
  const protocol = await publicClient.readContract({
    address: SENTINEL_CORE_ADDRESS,
    abi: SENTINEL_CORE_ABI,
    functionName: 'getProtocol',
    args: [protocolIndex],
  });

  // protocol is typed as { name: string, contractAddr: Address, exposureUSD: bigint, active: bool }
  return protocol.exposureUSD;
}

/**
 * Checks whether a position with the given ID is already active on-chain.
 * Used to avoid double-registration of positions.
 *
 * @param positionId  Position ID to check
 * @returns           true if the position is already active
 */
export async function isPositionActive(positionId: bigint): Promise<boolean> {
  const position = await publicClient.readContract({
    address: SENTINEL_CORE_ADDRESS,
    abi: SENTINEL_CORE_ABI,
    functionName: 'sentinelPositions',
    args: [positionId],
  });

  // Returns (protocol, amountUSD, active, openedAt)
  return position[2]; // active field
}

/**
 * Returns the total number of protocols registered in SentinelCore.
 */
export async function getProtocolCount(): Promise<bigint> {
  return publicClient.readContract({
    address: SENTINEL_CORE_ADDRESS,
    abi: SENTINEL_CORE_ABI,
    functionName: 'protocolCount',
    args: [],
  });
}
