import hre from 'hardhat';
const { ethers } = hre;
import { writeFileSync } from 'fs';
import { join } from 'path';


async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log('\n══════════════════════════════════════════════');
  console.log('  SENTINEL Contract Deployment');
  console.log(`  Network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
  console.log('══════════════════════════════════════════════\n');

  if (balance === 0n) {
    throw new Error('Deployer wallet has zero balance. Fund it first.');
  }

  // 1. Deploy SentinelCore
  console.log('[1/3] Deploying SentinelCore...');
  const SentinelCore = await ethers.getContractFactory('SentinelCore');
  const core = await SentinelCore.deploy(
    deployer.address,   // owner
    deployer.address,   // agentWallet
    ['rsETH (Kelp DAO)', 'mETH', 'Byreal Super Portal', 'xStocks', 'USDY'],
    [
      '0x4200000000000000000000000000000000000000',
      '0x1111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444'
    ]
  );
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log(`      ✓ SentinelCore: ${coreAddress}`);

  // 2. Deploy SentinelLedger
  console.log('[2/3] Deploying SentinelLedger...');
  const SentinelLedger = await ethers.getContractFactory('SentinelLedger');
  const ledger = await SentinelLedger.deploy(coreAddress);
  await ledger.waitForDeployment();
  const ledgerAddress = await ledger.getAddress();
  console.log(`      ✓ SentinelLedger: ${ledgerAddress}`);



  const addresses = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    SentinelCore: coreAddress,
    SentinelLedger: ledgerAddress,
  };

  // Save addresses
  const outputPath = join(process.cwd(), 'deployed-addresses.json');
  writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\n✓ Addresses saved to: ${outputPath}`);

  console.log('\n══════════════════════════════════════════════');
  console.log('  Deployment complete! Next steps:');
  console.log('');
  console.log(`  1. Add to .env:`);
  console.log(`     SENTINEL_CORE_ADDRESS=${coreAddress}`);
  console.log(`     SENTINEL_LEDGER_ADDRESS=${ledgerAddress}`);

  console.log('');
  console.log(`  2. Verify on Mantlescan:`);
  const explorerBase = network.chainId === 5003n
    ? 'https://explorer.sepolia.mantle.xyz'
    : 'https://explorer.mantle.xyz';
  console.log(`     ${explorerBase}/address/${coreAddress}#code`);
  console.log('══════════════════════════════════════════════\n');

  return addresses;
}

main().catch(err => {
  console.error('\n[deploy] FAILED:', err);
  process.exit(1);
});
