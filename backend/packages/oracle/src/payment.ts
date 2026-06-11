import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantle } from 'viem/chains';
// Hardcode the Sepolia chain config if it's not exported by this viem version
const mantleSepolia = {
  id: 5003,
  name: 'Mantle Sepolia',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.mantle.xyz'] } },
};

const processedTxHashes = new Set<string>();

const PRIVATE_KEY = process.env.SENTINEL_PRIVATE_KEY as `0x${string}` | undefined;
const MANTLE_RPC = process.env.MANTLE_MAINNET_RPC_URL || 'https://rpc.mantle.xyz';
const SENTINEL_CORE_ADDRESS = process.env.SENTINEL_CORE_ADDRESS as `0x${string}` | undefined;

// SentinelCore.addToGasReservoir(uint256 amount) ABI
const SENTINEL_CORE_ABI = [
  {
    name: 'addToGasReservoir',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'logRiskQuery',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'protocol', type: 'address' },
      { name: 'payer', type: 'address' },
      { name: 'feePaid', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

let revenueAccumulated = 0; // USDC cents accumulated before on-chain flush

/**
 * Verifies a payment transaction hash on-chain.
 */
export async function verifyPaymentTx(txHash: string): Promise<string> {
  if (processedTxHashes.has(txHash)) {
    throw new Error('Transaction hash already processed');
  }

  const rpcUrl = process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
  const sentinelWallet = process.env.SENTINEL_MANTLE_WALLET?.toLowerCase();
  
  if (!sentinelWallet) {
    throw new Error('Sentinel wallet not configured in .env');
  }

  const client = createPublicClient({
    chain: mantleSepolia, // use Sepolia for hackathon
    transport: http(rpcUrl),
  });

  const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
  const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });

  if (receipt.status !== 'success') {
    throw new Error('Payment transaction reverted');
  }

  if (tx.to?.toLowerCase() !== sentinelWallet) {
    throw new Error(`Payment sent to wrong address. Expected ${sentinelWallet}`);
  }

  // Expecting at least 0.05 MNT
  const minRequired = parseUnits('0.05', 18);
  if (tx.value < minRequired) {
    throw new Error('Payment amount insufficient. Requires 0.05 MNT');
  }

  processedTxHashes.add(txHash);
  return tx.from;
}

/**
 * Processes an x402 payment:
 * - Accumulates revenue (97% to treasury, 3% to gas reservoir)
 * - Flushes gas contribution to SentinelCore every $1 accumulated
 */
export async function processPayment(
  payerAddress: string,
  amountUSDC: number
): Promise<void> {
  const gasContribution = amountUSDC * 0.03;
  const treasuryContribution = amountUSDC * 0.97;

  revenueAccumulated += gasContribution;

  console.log(
    `[payment] Received $${amountUSDC.toFixed(4)} USDC from ${payerAddress} | ` +
    `gas: $${gasContribution.toFixed(4)} | treasury: $${treasuryContribution.toFixed(4)}`
  );

  // Flush to on-chain gas reservoir when > $0.10 accumulated
  if (revenueAccumulated > 0.1 && SENTINEL_CORE_ADDRESS && PRIVATE_KEY) {
    try {
      const account = privateKeyToAccount(PRIVATE_KEY);
      const wallet = createWalletClient({
        account,
        chain: mantle,
        transport: http(MANTLE_RPC),
      });

      const amountWei = parseUnits(revenueAccumulated.toFixed(6), 6); // USDC 6 decimals

      await wallet.writeContract({
        address: SENTINEL_CORE_ADDRESS,
        abi: SENTINEL_CORE_ABI,
        functionName: 'addToGasReservoir',
        args: [amountWei],
      });

      console.log(`[payment] Gas reservoir funded: ${revenueAccumulated.toFixed(4)} USDC`);
      revenueAccumulated = 0;
    } catch (err: any) {
      console.error('[payment] Gas reservoir flush failed:', err.message);
    }
  }
}
