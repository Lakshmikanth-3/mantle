/**
 * @file strategies/lendle.ts
 * @description Lendle Finance integration for SENTINEL's defensive withdrawal strategy.
 *
 * Lendle is an Aave V3 fork deployed on Mantle Mainnet.
 * Pool address: 0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF
 *
 * ⚠️  MAINNET ONLY: All functions in this module are guarded by a mainnet
 *     environment check (`NETWORK_ENV === 'mainnet'`). On testnet, the
 *     executor uses MockOFT-based withdrawal via strategies/withdraw.ts.
 *
 * Functions:
 *   withdrawFromLendle — calls Pool.withdraw(asset, amount, recipient)
 *   getLendlePosition  — calls Pool.getUserAccountData(user) for collateral info
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
      `[lendle] ${fnName} is only available in mainnet mode. ` +
        `Current NETWORK_ENV="${NETWORK_ENV}". ` +
        'Use strategies/withdraw.ts for testnet operations.',
    );
  }
}

// ─── Addresses ────────────────────────────────────────────────────────────────

/**
 * Lendle Pool (Aave V3 fork) on Mantle Mainnet.
 * Verified: https://lendle.xyz / Mantle explorer
 */
const LENDLE_POOL_ADDRESS = '0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF' as Address;

// ─── Environment ──────────────────────────────────────────────────────────────

const PRIVATE_KEY = process.env.SENTINEL_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error('[lendle] SENTINEL_PRIVATE_KEY env var is required');
}

const MAINNET_RPC_URL =
  process.env.MANTLE_MAINNET_RPC_URL ?? 'https://rpc.mantle.xyz';

// ─── ABI ──────────────────────────────────────────────────────────────────────

/**
 * Aave V3 Pool ABI — functions used by SENTINEL's defensive executor.
 *
 * withdraw(address asset, uint256 amount, address to) returns (uint256)
 *   — Withdraws `amount` of `asset` from the pool to `to`.
 *     Pass type(uint256).max to withdraw the full balance.
 *
 * getUserAccountData(address user)
 *   — Returns aggregated position data for `user`.
 *     totalCollateralBase is in 8-decimal base currency (USD).
 */
const AAVE_V3_POOL_ABI = parseAbi([
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address asset) external view returns (uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)',
]);

// ─── Viem clients ─────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

// Lendle is only used on Mantle mainnet
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

/**
 * Withdraws a position from Lendle Finance (Aave V3 fork on Mantle Mainnet).
 *
 * Calls Pool.withdraw(asset, amount, onBehalfOf).
 * Use `amount = type(uint256).max` (i.e. 2n**256n - 1n) to withdraw entire balance.
 *
 * @param assetAddress  ERC-20 token address of the supplied asset (e.g. rsETH)
 * @param amount        Amount to withdraw in token's smallest unit (wei).
 *                      Pass 2n**256n - 1n to withdraw 100% of balance.
 * @param onBehalfOf    Recipient address for the withdrawn tokens
 * @returns             Transaction hash of the withdraw call
 *
 * @throws              In testnet mode or if the transaction reverts
 */
export async function withdrawFromLendle(
  assetAddress: string,
  amount: bigint,
  onBehalfOf: string,
): Promise<Hash> {
  assertMainnet('withdrawFromLendle');

  console.info(
    `[lendle] Withdrawing from Lendle | asset=${assetAddress} ` +
      `amount=${amount} recipient=${onBehalfOf}`,
  );

  const hash = await walletClient.writeContract({
    address: LENDLE_POOL_ADDRESS,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'withdraw',
    args: [assetAddress as Address, amount, onBehalfOf as Address],
  });

  console.info(`[lendle] withdraw tx submitted: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });

  if (receipt.status === 'reverted') {
    throw new Error(
      `[lendle] withdraw tx ${hash} reverted (block ${receipt.blockNumber})`,
    );
  }

  console.info(
    `[lendle] ✅ Lendle withdrawal confirmed | tx=${hash} block=${receipt.blockNumber}`,
  );

  return hash;
}

/**
 * Fetches the current position summary for a user on Lendle Finance.
 *
 * Calls Pool.getUserAccountData(user) and returns totalCollateralBase,
 * which represents total collateral value in 8-decimal base currency (USD equivalent).
 *
 * @param assetAddress  Unused (kept for API consistency — getUserAccountData is global)
 * @param userAddress   The user whose position to query
 * @returns             totalCollateralBase in 8-decimal USD units
 *
 * @throws              In testnet mode
 */
export async function getLendlePosition(
  assetAddress: string,
  userAddress: string,
): Promise<bigint> {
  assertMainnet('getLendlePosition');

  console.info(
    `[lendle] Reading Lendle position | user=${userAddress} asset=${assetAddress}`,
  );

  const data = await publicClient.readContract({
    address: LENDLE_POOL_ADDRESS,
    abi: AAVE_V3_POOL_ABI,
    functionName: 'getUserAccountData',
    args: [userAddress as Address],
  });

  // Returns: (totalCollateralBase, totalDebtBase, availableBorrowsBase,
  //           currentLiquidationThreshold, ltv, healthFactor)
  const totalCollateralBase = data[0];

  console.info(
    `[lendle] Position data | user=${userAddress} ` +
      `totalCollateral=${totalCollateralBase} totalDebt=${data[1]} ` +
      `healthFactor=${data[5]}`,
  );

  return totalCollateralBase;
}

/**
 * Returns the Lendle Pool address (useful for constructing approval transactions
 * before calling withdraw on the underlying asset).
 */
export function getLendlePoolAddress(): Address {
  return LENDLE_POOL_ADDRESS;
}
