/**
 * update-env.ts
 * Reads deployed-mocks-*.json files and patches the root .env automatically.
 * Run: node scripts/update-env.js
 */
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../../../.env');
const mantleFile = path.join(__dirname, '../deployed-mocks-mantleSepolia.json');
const ethFile = path.join(__dirname, '../deployed-mocks-ethSepolia.json');

let env = fs.readFileSync(envPath, 'utf8');

function upsertEnv(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  } else {
    return content + `\n${key}=${value}`;
  }
}

let changed = 0;

if (fs.existsSync(mantleFile)) {
  const mantle = JSON.parse(fs.readFileSync(mantleFile, 'utf8'));
  console.log('📋 Applying Mantle Sepolia addresses...');
  if (mantle.rsETH) { env = upsertEnv(env, 'RSETH_MANTLE_OFT', mantle.rsETH); changed++; console.log(`  RSETH_MANTLE_OFT=${mantle.rsETH}`); }
  if (mantle.mETH)  { env = upsertEnv(env, 'METH_MANTLE_OFT', mantle.mETH);  changed++; console.log(`  METH_MANTLE_OFT=${mantle.mETH}`); }
  if (mantle.USDY)  { env = upsertEnv(env, 'USDY_MANTLE_OFT', mantle.USDY);  changed++; console.log(`  USDY_MANTLE_OFT=${mantle.USDY}`); }
  if (mantle.xStocks) { env = upsertEnv(env, 'XSTOCKS_MANTLE_OFT', mantle.xStocks); changed++; console.log(`  XSTOCKS_MANTLE_OFT=${mantle.xStocks}`); }
} else {
  console.log('⚠️  No Mantle Sepolia deployment found. Run: npx hardhat run scripts/deploy-mock-ofts.ts --network mantleSepolia');
}

if (fs.existsSync(ethFile)) {
  const eth = JSON.parse(fs.readFileSync(ethFile, 'utf8'));
  console.log('📋 Applying Ethereum Sepolia addresses...');
  if (eth.rsETH) { env = upsertEnv(env, 'RSETH_ETH_BRIDGE', eth.rsETH); changed++; console.log(`  RSETH_ETH_BRIDGE=${eth.rsETH}`); }
  if (eth.mETH)  { env = upsertEnv(env, 'METH_ETH_BRIDGE', eth.mETH);  changed++; console.log(`  METH_ETH_BRIDGE=${eth.mETH}`); }
  if (eth.USDY)  { env = upsertEnv(env, 'USDY_SOURCE_ADDRESS', eth.USDY); changed++; console.log(`  USDY_SOURCE_ADDRESS=${eth.USDY}`); }
  if (eth.xStocks) { env = upsertEnv(env, 'XSTOCKS_SOURCE_ADDRESS', eth.xStocks); changed++; console.log(`  XSTOCKS_SOURCE_ADDRESS=${eth.xStocks}`); }
} else {
  console.log('⚠️  No Ethereum Sepolia deployment found. Run: npx hardhat run scripts/deploy-mock-ofts.ts --network ethSepolia');
}

if (changed > 0) {
  fs.writeFileSync(envPath, env);
  console.log(`\n✅ .env updated with ${changed} new addresses!`);
} else {
  console.log('\n⚠️  No changes made.');
}
