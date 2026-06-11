import { createPublicClient, webSocket, http, parseAbiItem, type Log } from 'viem';
import { mantleSepoliaTestnet, mantle } from 'viem/chains';
import type EventEmitter from 'eventemitter3';
import { PROTOCOLS, PROTOCOL_BY_MANTLE_ADDRESS } from '../invariant/protocols.js';
import { InvariantChecker } from '../invariant/checker.js';
import { EVENTS } from '../index.js';

const isMainnet = process.env.NETWORK_ENV === 'mainnet';

const RPC_URL = isMainnet 
  ? (process.env.MANTLE_MAINNET_RPC_URL || 'https://rpc.mantle.xyz')
  : (process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz');

const WSS_URL = isMainnet
  ? process.env.MANTLE_MAINNET_WSS_URL || null
  : process.env.MANTLE_SEPOLIA_WSS_URL || null;

// OFT Received event ABI — standard LayerZero OFT
const OFT_RECEIVED_ABI = parseAbiItem(
  'event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)'
);

/** Creates a Mantle public client and watches for OFTReceived events on all monitored bridges */
export async function startMantleListener(bus: EventEmitter, checker: InvariantChecker): Promise<void> {
  // Use WSS if available (QuickNode testnet), else fallback to HTTP polling
  const transport = WSS_URL ? webSocket(WSS_URL) : http(RPC_URL);
  const client = createPublicClient({
    chain: isMainnet ? mantle : mantleSepoliaTestnet,
    transport,
  });

  const mode = WSS_URL ? `WSS ${WSS_URL}` : `HTTP ${RPC_URL}`;
  const chainId = await client.getChainId();
  console.log(`[mantleListener] Connected to Mantle SEPOLIA TESTNET (chainId=${chainId}) via ${mode}`);

  // Also push raw block events to event bus
  client.watchBlocks({
    onBlock: (block) => {
      bus.emit('BLOCK', { chain: 'mantle', number: block.number, timestamp: block.timestamp });
    }
  });

  // Watch each monitored protocol's Mantle address
  for (const protocol of PROTOCOLS.filter(p => p.sourceChain === 'ethereum')) {
    if (!protocol.mantleAddress || protocol.mantleAddress === '0x') {
      console.warn(`[mantleListener] Skipping ${protocol.name} — mantleAddress not set`);
      continue;
    }

    const address = protocol.mantleAddress as `0x${string}`;

    let lastBlock = await client.getBlockNumber();

    setInterval(async () => {
      try {
        const currentBlock = await client.getBlockNumber();
        if (currentBlock <= lastBlock) return;

        const logs = await client.getContractEvents({
          address,
          abi: [OFT_RECEIVED_ABI],
          eventName: 'OFTReceived',
          fromBlock: lastBlock + 1n,
          toBlock: currentBlock,
        });

        lastBlock = currentBlock;

        for (const log of logs) {
          const args = (log as any).args as {
            guid: `0x${string}`;
            srcEid: number;
            toAddress: `0x${string}`;
            amountReceivedLD: bigint;
          };

          console.log(
            `[mantleListener] OFTReceived on ${protocol.name}: guid=${args.guid} amount=${args.amountReceivedLD}`
          );

          checker.checkInvariant(
            address,
            {
              guid: args.guid,
              srcEid: args.srcEid,
              toAddress: args.toAddress,
              amountReceivedLD: args.amountReceivedLD,
            },
            (log as any).blockNumber ?? 0n
          );

          bus.emit(EVENTS.INVARIANT_OK, {
            protocol: protocol.name,
            guid: args.guid,
            amount: args.amountReceivedLD,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        console.error(`[mantleListener] Poll error on ${protocol.name}:`, err.message);
      }
    }, 15000);

    console.log(`[mantleListener] Polling ${protocol.name} at ${address}`);
  }
}
