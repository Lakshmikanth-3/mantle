import { createPublicClient, http, parseAbiItem, type Log } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import type EventEmitter from 'eventemitter3';
import { PROTOCOLS } from '../invariant/protocols.js';
import { InvariantChecker } from '../invariant/checker.js';

const isMainnet = process.env.NETWORK_ENV === 'mainnet';

// Use HTTP RPC only — WSS causes "block range extends beyond head" errors on public nodes
const ETH_RPC_URL = isMainnet
  ? (process.env.ETHEREUM_MAINNET_RPC_URL || 'https://cloudflare-eth.com')
  : (process.env.ETHEREUM_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com');

const OFT_SENT_ABI = parseAbiItem(
  'event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed from, uint256 amountSentLD, uint256 amountReceivedLD)',
);

// Maximum block range per getLogs call (public RPCs cap at 500–2000)
const MAX_BLOCK_RANGE = 300n;
// Poll every 20s — Ethereum Sepolia is ~12s blocks, one batch per 1-2 blocks
const POLL_INTERVAL_MS = 20_000;

/**
 * Safely fetch OFTSent logs for one address, capping block range and
 * never requesting blocks beyond the chain head.
 */
async function safeFetchLogs(
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log[]> {
  // Never exceed chain head
  const latestBlock = await client.getBlockNumber();
  const safeToBlock = toBlock > latestBlock ? latestBlock : toBlock;
  if (fromBlock > safeToBlock) return [];

  // Cap range to avoid RPC "block range too large" errors
  const cappedFrom = safeToBlock - fromBlock > MAX_BLOCK_RANGE
    ? safeToBlock - MAX_BLOCK_RANGE
    : fromBlock;

  try {
    return await client.getLogs({
      address,
      event: OFT_SENT_ABI,
      fromBlock: cappedFrom,
      toBlock: safeToBlock,
    });
  } catch (err: any) {
    // Log but never crash — Ethereum Sepolia public RPCs are unreliable
    console.warn(`[ethListener] getLogs error (non-fatal): ${err.message}`);
    return [];
  }
}

/** Creates an Ethereum public client and polls for OFTSent events */
export async function startEthListener(
  bus: EventEmitter,
  checker: InvariantChecker,
): Promise<void> {
  const client = createPublicClient({
    chain: isMainnet ? mainnet : sepolia,
    transport: http(ETH_RPC_URL),
  });

  const chainId = await client.getChainId();
  console.log(`[ethListener] Connected to Ethereum SEPOLIA TESTNET (chainId=${chainId})`);

  // Start 10 blocks back so we don't miss events emitted just before startup
  const startBlock = (await client.getBlockNumber()) - 10n;

  // Build list of protocols to watch
  const ethProtocols = PROTOCOLS.filter(
    (p) => p.sourceChain === 'ethereum' && p.sourceAddress && p.sourceAddress !== '0x',
  );

  // Per-protocol cursor (independent so one failure doesn't block others)
  const lastBlocks = new Map<string, bigint>();
  for (const p of ethProtocols) {
    lastBlocks.set(p.sourceAddress, startBlock);
    console.log(`[ethListener] Polling ${p.name} source at ${p.sourceAddress}`);
  }

  setInterval(async () => {
    for (const protocol of ethProtocols) {
      const addr = protocol.sourceAddress as `0x${string}`;
      const fromBlock = (lastBlocks.get(addr) ?? startBlock) + 1n;

      // Get actual chain head fresh for each poll
      let latestBlock: bigint;
      try {
        latestBlock = await client.getBlockNumber();
      } catch {
        continue; // RPC down — try next tick
      }

      if (fromBlock > latestBlock) continue;

      const logs = await safeFetchLogs(client, addr, fromBlock, latestBlock);
      lastBlocks.set(addr, latestBlock);

      for (const log of logs) {
        const args = (log as any).args as {
          guid: `0x${string}`;
          dstEid: number;
          from: `0x${string}`;
          amountSentLD: bigint;
          amountReceivedLD: bigint;
        };
        if (!args?.guid) continue;

        console.log(
          `[ethListener] OFTSent on ${protocol.name}: guid=${args.guid} amount=${args.amountSentLD}`,
        );

        checker.reconcileSourceBurn({
          guid: args.guid,
          dstEid: args.dstEid,
          fromAddress: args.from,
          amountSentLD: args.amountSentLD,
          amountReceivedLD: args.amountReceivedLD,
        });
      }
    }
  }, POLL_INTERVAL_MS);
}
