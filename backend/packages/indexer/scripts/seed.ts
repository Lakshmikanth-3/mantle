import 'dotenv/config';
import { upsertProtocolScore } from '../src/db.js';

const initialScores = [
  { protocolAddress: '0x12e1fB80E8b098DF102f81379e2e88B9d447dA60', name: 'rsETH (Kelp DAO)', score: 92, band: 'LOW', exposureUSD: 154000000, updatedAt: new Date() },
  { protocolAddress: '0x15e9b20b9500E3456589c8D8Bf37f71845017d7E', name: 'mETH (Mantle LSP)', score: 95, band: 'LOW', exposureUSD: 80000000, updatedAt: new Date() },
  { protocolAddress: '0x968783345F6E3DB2e2BaDFf3A13aa5f5dC07ddE4', name: 'USDY (Ondo Finance)', score: 88, band: 'ELEVATED', exposureUSD: 30000000, updatedAt: new Date() },
  { protocolAddress: '0xaave', name: 'Aave V3', score: 98, band: 'LOW', exposureUSD: 164000000, updatedAt: new Date() },
  { protocolAddress: '0xsuper', name: 'SuperPortal', score: 75, band: 'HIGH', exposureUSD: 185000000, updatedAt: new Date() },
  { protocolAddress: '0xbyreal', name: 'Byreal', score: 82, band: 'ELEVATED', exposureUSD: 35000000, updatedAt: new Date() },
  { protocolAddress: '0xfluxion', name: 'Fluxion', score: 90, band: 'LOW', exposureUSD: 150000000, updatedAt: new Date() }
];

async function seed() {
  for (const score of initialScores) {
    await upsertProtocolScore(score);
  }
  console.log('Seeded protocol_scores.');
  process.exit(0);
}

seed();
