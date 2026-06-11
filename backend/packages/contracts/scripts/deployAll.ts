import hre from 'hardhat';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Deploys:
 *  1. SentinelBatchVerifier (with SentinelCore as guardian)
 *  2. Three ERC-8004 registries (Identity, Reputation, Validation)
 *
 * Then updates .env automatically with all new addresses.
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = deployer.address;
  console.log(`\nDeployer: ${deployerAddr}`);

  const balance = await hre.ethers.provider.getBalance(deployerAddr);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} MNT\n`);

  const sentinelCore = process.env.SENTINEL_CORE_ADDRESS;
  if (!sentinelCore) throw new Error('SENTINEL_CORE_ADDRESS not set in .env');

  // ── 1. SentinelBatchVerifier ─────────────────────────────────────────────
  console.log('Deploying SentinelBatchVerifier...');
  const Verifier = await hre.ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log(`✅ SentinelBatchVerifier (Groth16Verifier): ${verifierAddr}`);

  // ── 2. ERC-8004 Registries ───────────────────────────────────────────
  console.log('\nDeploying ERC8004IdentityRegistry...');
  const IdentityReg = await hre.ethers.getContractFactory('ERC8004IdentityRegistry');
  const identityReg = await IdentityReg.deploy(deployerAddr);
  await identityReg.waitForDeployment();
  const identityRegAddr = await identityReg.getAddress();
  console.log(`✅ ERC8004IdentityRegistry: ${identityRegAddr}`);

  console.log('Deploying ERC8004ReputationRegistry...');
  const ReputationReg = await hre.ethers.getContractFactory('ERC8004ReputationRegistry');
  const reputationReg = await ReputationReg.deploy(deployerAddr);
  await reputationReg.waitForDeployment();
  const reputationRegAddr = await reputationReg.getAddress();
  console.log(`✅ ERC8004ReputationRegistry: ${reputationRegAddr}`);

  console.log('Deploying ERC8004ValidationRegistry...');
  const ValidationReg = await hre.ethers.getContractFactory('ERC8004ValidationRegistry');
  const validationReg = await ValidationReg.deploy(deployerAddr);
  await validationReg.waitForDeployment();
  const validationRegAddr = await validationReg.getAddress();
  console.log(`✅ ERC8004ValidationRegistry: ${validationRegAddr}`);

  // ── 3. Update .env ────────────────────────────────────────────────────────
  const envPath = path.resolve(__dirname, '../../../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  const updates: Record<string, string> = {
    SENTINEL_VERIFIER_ADDRESS:     verifierAddr,
    ERC8004_IDENTITY_REGISTRY:     identityRegAddr,
    ERC8004_REPUTATION_REGISTRY:   reputationRegAddr,
    ERC8004_VALIDATION_REGISTRY:   validationRegAddr,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent, 'utf8');

  // ── 4. Save deployed-addresses.json ──────────────────────────────────────
  const addresses = {
    network: 'mantleSepolia',
    chainId: '5003',
    deployer: deployerAddr,
    deployedAt: new Date().toISOString(),
    SentinelBatchVerifier: verifierAddr,
    ERC8004IdentityRegistry: identityRegAddr,
    ERC8004ReputationRegistry: reputationRegAddr,
    ERC8004ValidationRegistry: validationRegAddr,
  };

  const outPath = path.resolve(__dirname, '../deployed-erc8004.json');
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2), 'utf8');

  console.log('\n✅ .env updated with all new addresses');
  console.log('✅ Saved to packages/contracts/deployed-erc8004.json\n');
  console.log('Addresses:');
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
