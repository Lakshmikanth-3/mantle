/**
 * @file strategies/agni.ts
 * @description Agni Finance integration for SENTINEL's defensive swap strategy.
 *
 * Agni Finance is a Uniswap V3 fork deployed on Mantle Mainnet.
 * SwapRouter: 0x319B69888b0d11cEC22caA5034e25FfFBDc88421
 *
 * ⚠️  MAINNET ONLY: All functions in this module are guarded by a mainnet
 *     environment check (`NETWORK_ENV === 'mainnet'`). On testnet, the
 *     executor uses MockOFT-based withdrawal via strategies/withdraw.ts.
 *
 * Strategy: swap exposed LST/LRT token → USDC to de-risk exposure
 *   Uses ISwapRouter.exactInputSingle for a direct single-hop swap.
 *   Fee tier: 0.3% (3000 bps) — standard for volatile pairs.
 *
 * USDC on Mantle Mainnet: 0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
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
import { mantle } from 'viem/chains';

// ─── Guard: mainnet only ──────────────────────────────────────────────────────

const NETWORK_ENV = process.env.NETWORK_ENV ?? 'testnet';

function assertMainnet(fnName: string): void {
  if (NETWORK_ENV !== 'mainnet') {
    throw new Error(
      `[agni] ${fnName} is only available in mainnet mode. ` +
        `Current NETWORK_ENV="${NETWORK_ENV}". ` +
        'Use strategies/withdraw.ts for testnet operations.',
    );
  }
}

// ─── Addresses ────────────────────────────────────────────────────────────────

/**
 * Agni Finance SwapRouter on Mantle Mainnet.
 * Verified from Agni Finance docs: https://docs.agni.finance/
 */
const AGNI_SWAP_ROUTER = '0x319B69888b0d11cEC22caA5034e25FfFBDc88421' as Address;

/**
 * USDC on Mantle Mainnet — the stable token we swap INTO for safety.
 * Verified: https://explorer.mantle.xyz/token/0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9
 */
const USDC_MANTLE = '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9' as Address;

/** 0.3% fee tier — standard for volatile asset pairs on Uniswap V3 forks */
const FEE_TIER_30BPS = 3000 as const;

/** Swap deadline: 5 minutes from now */
const DEADLINE_OFFSET_SECONDS = 300n;

// ─── Environment ──────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.SENTINEL_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error('[agni] SENTINEL_PRIVATE_KEY env var is required');
}

const MAINNET_RPC_URL =
  process.env.MANTLE_MAINNET_RPC_URL ?? 'https://rpc.mantle.xyz';

// ─── ABI ──────────────────────────────────────────────────────────────────────

/**
 * Uniswap V3 ISwapRouter ABI — exactInputSingle for single-hop token swaps.
 *
 * struct ExactInputSingleParams {
 *   address tokenIn;
 *   address tokenOut;
 *   uint24 fee;
 *   address recipient;
 *   uint256 deadline;
 *   uint256 amountIn;
 *   uint256 amountOutMinimum;
 *   uint160 sqrtPriceLimitX96;
 * }
 */
const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) calldata params) external payable returns (uint256 amountOut)',
]);

/**
 * ERC-20 approve ABI — required before calling exactInputSingle.
 * The SwapRouter must be approved to spend the input token.
 */
const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
]);

// ─── Viem clients ─────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

const walletClient = createWalletClient({
  account,
  chain: mantle,
  transport: http(MAINNET_RPC_URL),
});

const publicClient = createPublicClient({
  chain: mantle,
  transport: http(MAINNET_RPC_URL),
});

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SwapResult {
  /** Transaction hash of the exactInputSingle call */
  hash: Hash;
  /** Estimated amount of USDC received (amountOut from return data) */
  amountOut: bigint;
  /** Token swapped from */
  tokenIn: Address;
  /** USDC received */
  tokenOut: Address;
}

/**
 * Swaps a volatile/exposed token into USDC via Agni Finance to de-risk exposure.
 *
 * Flow:
 *   1. Checks current allowance; approves SwapRouter if insufficient.
 *   2. Calls SwapRouter.exactInputSingle() with a 5-minute deadline.
 *   3. Waits for confirmation and returns the result.
 *
 * @param tokenIn        Address of the token to swap (e.g. rsETH, mETH)
 * @param amount         Amount to swap in tokenIn's smallest unit (wei)
 * @param minAmountOut   Minimum USDC output (slippage protection). Pass 0n to
 *                       disable slippage check (NOT recommended for production).
 * @returns              SwapResult with tx hash and output amounts
 *
 * @throws               In testnet mode, if approval fails, or if swap reverts
 */
export async function swapToStable(
  tokenIn: string,
  amount: bigint,
  minAmountOut: bigint,
): Promise<SwapResult> {
  assertMainnet('swapToStable');

  const tokenInAddress = tokenIn as Address;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_OFFSET_SECONDS;

  console.info(
    `[agni] Swapping to stable | tokenIn=${tokenIn} ` +
      `amount=${amount} minAmountOut=${minAmountOut} ` +
      `deadline=${deadline} router=${AGNI_SWAP_ROUTER}`,
  );

  // ── Step 1: Check & set approval ─────────────────────────────────────────

  const currentAllowance = await publicClient.readContract({
    address: tokenInAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, AGNI_SWAP_ROUTER],
  });

  if (currentAllowance < amount) {
    console.info(
      `[agni] Current allowance=${currentAllowance} < amount=${amount}. ` +
        'Approving SwapRouter...',
    );

    const approveHash = await walletClient.writeContract({
      address: tokenInAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [AGNI_SWAP_ROUTER, amount],
    });

    const approveReceipt = await publicClient.waitForTransactionReceipt({
      hash: approveHash,
      confirmations: 1,
    });

    if (approveReceipt.status === 'reverted') {
      throw new Error(
        `[agni] approve tx ${approveHash} reverted (block ${approveReceipt.blockNumber})`,
      );
    }

    console.info(`[agni] Approval confirmed: ${approveHash}`);
  } else {
    console.info(`[agni] Sufficient allowance already set (${currentAllowance})`);
  }

  // ── Step 2: Execute swap ──────────────────────────────────────────────────

  const swapParams = {
    tokenIn: tokenInAddress,
    tokenOut: USDC_MANTLE,
    fee: FEE_TIER_30BPS,
    recipient: account.address,
    deadline,
    amountIn: amount,
    amountOutMinimum: minAmountOut,
    sqrtPriceLimitX96: 0n, // No price limit — let the pool find the best price
  } as const;

  const hash = await walletClient.writeContract({
    address: AGNI_SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: 'exactInputSingle',
    args: [swapParams],
  });

  console.info(`[agni] exactInputSingle tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(
      `[agni] exactInputSingle tx ${hash} reverted (block ${receipt.blockNumber})`,
    );
  }

  // Read amountOut by checking USDC balance increase (simpler than log parsing)
  let amountOut = 0n;
  try {
    // Simulate the call to get the return value from the just-confirmed block
    amountOut = await publicClient.readContract({
      address: AGNI_SWAP_ROUTER,
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{ ...swapParams, deadline: deadline + 60n }],
    });
  } catch {
    // Return value estimation failed — tx already confirmed, this is informational
    console.warn('[agni] Could not estimate amountOut via simulation; check logs for actual amount.');
  }

  console.info(
    `[agni] ✅ Swap confirmed | tx=${hash} block=${receipt.blockNumber} ` +
      `tokenIn=${tokenIn} tokenOut=${USDC_MANTLE} estimatedAmountOut=${amountOut}`,
  );

  return {
    hash,
    amountOut,
    tokenIn: tokenInAddress,
    tokenOut: USDC_MANTLE,
  };
}

/**
 * Returns the USDC token address on Mantle Mainnet.
 * Useful for constructing downstream transactions that receive USDC.
 */
export function getUSDCAddress(): Address {
  return USDC_MANTLE;
}

/**
 * Returns the Agni SwapRouter address.
 * Useful for approving allowances before calling swapToStable.
 */
export function getAgniRouterAddress(): Address {
  return AGNI_SWAP_ROUTER;
}
