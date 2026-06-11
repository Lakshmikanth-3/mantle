import { createPublicClient, webSocket, http } from 'viem';
import { mantleSepoliaTestnet, sepolia } from 'viem/chains';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('../../.env') });

console.log('=== SENTINEL Testnet Connection Test ===\n');

// Mantle Sepolia — HTTP (public WSS not supported)
const mantleRpc = process.env.MANTLE_SEPOLIA_RPC_URL || 'https://rpc.sepolia.mantle.xyz';
const ethWss = process.env.ETHEREUM_SEPOLIA_WSS_URL || 'wss://ethereum-sepolia-rpc.publicnode.com';

console.log('Mantle Sepolia RPC:', mantleRpc);
console.log('Ethereum Sepolia WSS:', ethWss, '\n');

const mantleClient = createPublicClient({ chain: mantleSepoliaTestnet, transport: http(mantleRpc) });
const ethClient = createPublicClient({ chain: sepolia, transport: webSocket(ethWss) });

const [mantleId, ethId] = await Promise.all([
  mantleClient.getChainId().catch(e => `FAILED: ${e.shortMessage || e.message}`),
  ethClient.getChainId().catch(e => `FAILED: ${e.shortMessage || e.message}`),
]);

console.log(`Mantle Sepolia (expected 5003):        ${mantleId === 5003 ? '✅' : '❌'} ChainID ${mantleId}`);
console.log(`Ethereum Sepolia (expected 11155111):  ${ethId === 11155111 ? '✅' : '❌'} ChainID ${ethId}`);

if (mantleId === 5003 && ethId === 11155111) {
  console.log('\n🎉 Both testnets connected! SENTINEL is ready for hackathon demo.\n');
} else {
  console.log('\n⚠️  One or more connections need attention.\n');
}
process.exit(0);
