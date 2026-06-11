/**
 * @file strategies/withdraw.ts
 * @description Defensive withdrawal strategy for the SENTINEL executor.
 *
 * On Mantle Sepolia testnet, real Lendle/Agni Finance contracts are not deployed.
 * Instead, we use the deployed SentinelOFT contract's `executeCrossChainSend(amount, dstEid)`
 * function, which:
 *   1. Emits a real on-chain OFTSent event (reduces tracked bridge exposure)
 *   2. Returns a bytes32 GUID that SENTINEL's watcher treats as a source burn
 *   3. Signals to downstream systems that tokens have been sent back to source chain
 *
 * For rsETH:  SentinelOFT at process.env.RSETH_MANTLE_OFT  (0x16E04309e2bb3892e6e30d454C0264772A269B75)
 * For mETH:   SentinelOFT at process.env.METH_MANTLE_OFT   (0x48Fc622cC6E924FD7fddee6047CC2a3E98eB9f2F)
 * For USDY:   SentinelOFT at process.env.USDY_MANTLE_OFT   (0x8E8Fba115E38af52Cc332C1a15ff8DB204719766)
 *
 * dstEid 30101 = LayerZero Ethereum Mainnet endpoint ID
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
  throw new Error('[withdraw] SENTINEL_PRIVATE_KEY env var is required');
}

const RPC_URL =
  process.env.MANTLE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.mantle.xyz';

/** LayerZero Ethereum Mainnet endpoint ID — destination for simulated withdrawals */
const ETH_MAINNET_EID = 30101 as const;

/** Hard cap: never simulate withdrawing more than 10 000 token units in one call */
const MAX_WITHDRAWAL_UNITS = 10_000n;

// ─── SentinelOFT ABI ──────────────────────────────────────────────────────────────

/**
 * Minimal ABI for SentinelOFT interactions.
 * executeCrossChainSend(uint256 amount, uint32 dstEid) external returns (bytes32 guid)
 *
 * SentinelOFT source: packages/contracts/src/SentinelOFT.sol
 * The function scales `amount` by the token's decimals internally (amount is
 * in human units, not wei).
 */
const MOCK_OFT_ABI = parseAbi([
  'function executeCrossChainSend(uint256 amount, uint32 dstEid) external returns (bytes32 guid)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]);

// ─── Protocol → OFT address mapping ─────────────────────────────────────────

/**
 * Maps protocol names (as used in the watcher event bus) to their SentinelOFT
 * contract addresses on Mantle Sepolia.
 *
 * Addresses loaded from environment variables to support hot-rotation.
 */
const PROTOCOL_OFT_ADDRESS: Record<string, Address> = {
  'rsETH (Kelp DAO)': (
    process.env.RSETH_MANTLE_OFT ?? '0x16E04309e2bb3892e6e30d454C0264772A269B75'
  ) as Address,
  'mETH (Mantle LSP)': (
    process.env.METH_MANTLE_OFT ?? '0x48Fc622cC6E924FD7fddee6047CC2a3E98eB9f2F'
  ) as Address,
  'USDY (Ondo Finance)': (
    process.env.USDY_MANTLE_OFT ?? '0x8E8Fba115E38af52Cc332C1a15ff8DB204719766'
  ) as Address,
};

// ─── Viem clients ─────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: mantleSepoliaTestnet,
  transport: http(RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http(RPC_URL),
});

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WithdrawalResult {
  /** Transaction hash of the executeCrossChainSend() call */
  hash: Hash;
  /** bytes32 GUID returned by the SentinelOFT (cross-chain message ID) */
  guid: `0x${string}`;
  /** Number of token units sent (human units, not wei) */
  amountSent: bigint;
  /** SentinelOFT contract that was called */
  oftAddress: Address;
  /** LayerZero destination endpoint ID used */
  dstEid: number;
}

/**
 * Executes a defensive withdrawal for a given protocol on Mantle Sepolia testnet.
 *
 * Calls `SentinelOFT.executeCrossChainSend(amount, dstEid)` which:
 *   - Emits OFTSent(guid, dstEid, from, amountLD, amountLD) on-chain
 *   - Returns a cross-chain GUID for tracking
 *
 * The amount is capped at MAX_WITHDRAWAL_UNITS (10,000 units) per call to
 * respect the SentinelCore MAX_DEFENSIVE_POSITION guard-rail.
 *
 * @param protocolName  Protocol name matching keys in PROTOCOL_OFT_ADDRESS
 * @param amount        Requested withdrawal in token human units (before cap)
 * @returns             WithdrawalResult with tx hash, guid, and actual amount sent
 * @throws              If the protocol is unknown or the transaction reverts
 */
export async function executeWithdrawal(
  protocolName: string,
  amount: bigint,
): Promise<WithdrawalResult> {
  const oftAddress = PROTOCOL_OFT_ADDRESS[protocolName];
  if (!oftAddress) {
    throw new Error(
      `[withdraw] Unknown protocol: "${protocolName}". ` +
        `Known protocols: ${Object.keys(PROTOCOL_OFT_ADDRESS).join(', ')}`,
    );
  }

  // Enforce per-call cap — never withdraw more than MAX_WITHDRAWAL_UNITS
  const cappedAmount = amount > MAX_WITHDRAWAL_UNITS ? MAX_WITHDRAWAL_UNITS : amount;

  console.info(
    `[withdraw] Executing withdrawal | protocol="${protocolName}" ` +
      `requestedAmount=${amount} cappedAmount=${cappedAmount} ` +
      `oftAddress=${oftAddress} dstEid=${ETH_MAINNET_EID}`,
  );

  // Check current balance for informational logging
  try {
    const balance = await publicClient.readContract({
      address: oftAddress,
      abi: MOCK_OFT_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
    const decimals = await publicClient.readContract({
      address: oftAddress,
      abi: MOCK_OFT_ABI,
      functionName: 'decimals',
      args: [],
    });
    const humanBalance = balance / BigInt(10 ** decimals);
    console.info(
      `[withdraw] Agent wallet balance: ${humanBalance} tokens (${balance} units) ` +
        `for ${protocolName}`,
    );
  } catch (balErr) {
    // Non-fatal: continue even if balance check fails
    console.warn(`[withdraw] Could not fetch balance: ${String(balErr)}`);
  }

  // Submit the executeCrossChainSend transaction
  const hash = await walletClient.writeContract({
    address: oftAddress,
    abi: MOCK_OFT_ABI,
    functionName: 'executeCrossChainSend',
    args: [cappedAmount, ETH_MAINNET_EID],
  });

  console.info(`[withdraw] executeCrossChainSend tx submitted: ${hash}`);

  // Wait for confirmation and extract the returned GUID from return data
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(
      `[withdraw] executeCrossChainSend tx ${hash} reverted for protocol "${protocolName}" ` +
        `(block ${receipt.blockNumber})`,
    );
  }

  // Simulate the call to retrieve the return value (GUID)
  let guid: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000';
  try {
    guid = await publicClient.readContract({
      address: oftAddress,
      abi: MOCK_OFT_ABI,
      functionName: 'executeCrossChainSend',
      args: [cappedAmount, ETH_MAINNET_EID],
    });
  } catch {
    // GUID extraction is informational — the tx already confirmed, so we continue
    console.warn(`[withdraw] Could not extract GUID via call; tx hash is the primary reference.`);
  }

  console.info(
    `[withdraw] ✅ Withdrawal executed | tx=${hash} block=${receipt.blockNumber} ` +
      `protocol="${protocolName}" amountSent=${cappedAmount} guid=${guid}`,
  );

  return {
    hash,
    guid,
    amountSent: cappedAmount,
    oftAddress,
    dstEid: ETH_MAINNET_EID,
  };
}

/**
 * Returns the address of the SentinelOFT contract for a given protocol name,
 * or undefined if the protocol is not tracked.
 */
export function getOFTAddress(protocolName: string): Address | undefined {
  return PROTOCOL_OFT_ADDRESS[protocolName];
}
