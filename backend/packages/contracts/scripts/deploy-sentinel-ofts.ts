/**
 * deploy-mock-ofts.ts
 * 
 * Deploys SentinelOFT contracts on BOTH Ethereum Sepolia AND Mantle Sepolia.
 * Run with:
 *   pnpm hardhat run scripts/deploy-sentinel-ofts.ts --network mantleSepolia
 *   pnpm hardhat run scripts/deploy-sentinel-ofts.ts --network ethSepolia
 * 
 * Or use the combined npm script:
 *   pnpm contracts:deploy:mocks
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeployedMocks {
  network: string;
  chainId: number;
  deployer: string;
  deployedAt: string;
  rsETH?: string;
  mETH?: string;
  USDY?: string;
  xStocks?: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const networkName = network.name;

  console.log(`\n🚀 Deploying SentinelOFT contracts on ${networkName} (chainId=${chainId})`);
  console.log(`   Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH/MNT`);

  if (balance === 0n) {
    throw new Error(`❌ Deployer wallet has 0 balance! Fund ${deployer.address} first.`);
  }

  const SentinelOFT = await ethers.getContractFactory("SentinelOFT");
  const deployed: DeployedMocks = {
    network: networkName,
    chainId: Number(chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  // ── Deploy rsETH ─────────────────────────────────────────────────────────────
  console.log("\n[1/4] Deploying rsETH (Kelp DAO Restaked ETH)...");
  const rsETH = await SentinelOFT.deploy("Sentinel rsETH", "rsETH", 18);
  await rsETH.waitForDeployment();
  deployed.rsETH = await rsETH.getAddress();
  console.log(`   ✅ rsETH deployed at: ${deployed.rsETH}`);

  // ── Deploy mETH ──────────────────────────────────────────────────────────────
  console.log("[2/4] Deploying mETH (Mantle Staked ETH)...");
  const mETH = await SentinelOFT.deploy("Sentinel mETH", "mETH", 18);
  await mETH.waitForDeployment();
  deployed.mETH = await mETH.getAddress();
  console.log(`   ✅ mETH deployed at: ${deployed.mETH}`);

  // ── Deploy USDY ──────────────────────────────────────────────────────────────
  console.log("[3/4] Deploying USDY (Ondo Finance USD Yield)...");
  const USDY = await SentinelOFT.deploy("Sentinel USDY", "USDY", 6);
  await USDY.waitForDeployment();
  deployed.USDY = await USDY.getAddress();
  console.log(`   ✅ USDY deployed at: ${deployed.USDY}`);

  // ── Deploy xStocks ───────────────────────────────────────────────────────────
  console.log("[4/4] Deploying xStocks (Tokenised Equity)...");
  const xStocks = await SentinelOFT.deploy("Sentinel xStocks", "xSTK", 18);
  await xStocks.waitForDeployment();
  deployed.xStocks = await xStocks.getAddress();
  console.log(`   ✅ xStocks deployed at: ${deployed.xStocks}`);

  // ── Save to JSON ─────────────────────────────────────────────────────────────
  const outputPath = path.join(__dirname, `../deployed-mocks-${networkName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deployed, null, 2));
  console.log(`\n📄 Addresses saved to: ${outputPath}`);

  // ── Print env vars to copy ────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`📋 Add these to your .env (${networkName}):`);
  console.log("=".repeat(60));

  if (networkName === "mantleSepolia") {
    console.log(`RSETH_MANTLE_OFT=${deployed.rsETH}`);
    console.log(`METH_MANTLE_OFT=${deployed.mETH}`);
    console.log(`USDY_MANTLE_OFT=${deployed.USDY}`);
    console.log(`XSTOCKS_MANTLE_OFT=${deployed.xStocks}`);
  } else if (networkName === "ethSepolia") {
    console.log(`RSETH_ETH_BRIDGE=${deployed.rsETH}`);
    console.log(`METH_ETH_BRIDGE=${deployed.mETH}`);
    console.log(`USDY_SOURCE_ADDRESS=${deployed.USDY}`);
    console.log(`XSTOCKS_SOURCE_ADDRESS=${deployed.xStocks}`);
  }

  console.log("=".repeat(60));
  console.log("\n✅ Deployment complete!\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err.message);
  process.exit(1);
});
