import { createPublicClient, webSocket } from 'viem';
import { mantle } from 'viem/chains';
import 'dotenv/config';

const url = process.env.MANTLE_WSS_URL;
console.log('Testing WSS connection to:', url);

const client = createPublicClient({ chain: mantle, transport: webSocket(url) });

client.getChainId()
  .then(id => {
    console.log(`✅ SUCCESS! Connected to Mantle. ChainID: ${id}`);
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ FAILED:', e.shortMessage || e.message);
    process.exit(1);
  });
