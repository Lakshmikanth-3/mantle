/**
 * @file contracts.test.ts
 * Real on-chain integration tests against Mantle Sepolia (chainId 5003).
 * Reads public state from deployed SENTINEL contracts — no wallet / private key needed.
 *
 * Deployed addresses:
 *   SentinelCore:             0x38E0D4468Afdd12776b7D371166edED8E9522054
 *   ERC8004ValidationRegistry: 0x40B911469639b166907536aDdD930a4BAA5ea4bF
 */
import 'dotenv/config';
import { expect } from 'chai';
import { createPublicClient, http, parseAbi } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';

// ── Contract addresses ──────────────────────────────────────────────────────
const SENTINEL_CORE       = '0x38E0D4468Afdd12776b7D371166edED8E9522054' as const;
const ERC8004_VALIDATION  = '0x40B911469639b166907536aDdD930a4BAA5ea4bF' as const;

// Pull the agent wallet from env so the test stays environment-portable
const SENTINEL_WALLET_ADDRESS = (
  process.env.SENTINEL_MANTLE_WALLET ?? '0x306037A2FdE5e44C0bd2f017BfC4fDB3Cd0bAa1D'
).toLowerCase() as `0x${string}`;

// ── Viem public client (Mantle Sepolia) ─────────────────────────────────────
const client = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http(
    process.env.MANTLE_SEPOLIA_RPC_URL ?? 'https://rpc.sepolia.mantle.xyz',
  ),
});

// ── Minimal ABIs (only the functions we call) ────────────────────────────────
const SENTINEL_CORE_ABI = parseAbi([
  'function protocolCount() external view returns (uint256)',
  'function getProtocol(uint256 index) external view returns (tuple(string name, address contractAddr, uint256 exposureUSD, bool active))',
  'function gasReservoir() external view returns (uint256)',
  'function ALERT_THRESHOLD_USD() external view returns (uint256)',
  'function agentWallet() external view returns (address)',
]);

// ── Test suite ───────────────────────────────────────────────────────────────
describe('SentinelCore Contract (Mantle Sepolia)', function () {
  // Give each test a generous timeout — Mantle Sepolia public RPC can be slow.
  this.timeout(30_000);

  it('should return correct protocol count', async () => {
    const count = await client.readContract({
      address: SENTINEL_CORE,
      abi: SENTINEL_CORE_ABI,
      functionName: 'protocolCount',
    });

    expect(typeof count).to.equal('bigint');
    expect(count > 0n).to.be.true;
  });

  it('should return protocol data for index 0', async () => {
    const protocol = await client.readContract({
      address: SENTINEL_CORE,
      abi: SENTINEL_CORE_ABI,
      functionName: 'getProtocol',
      args: [0n],
    });

    expect(protocol).to.be.an('object');
    expect(protocol.name).to.be.a('string').and.have.length.above(0);
    expect(protocol.contractAddr).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(typeof protocol.exposureUSD).to.equal('bigint');
    expect(protocol.active).to.be.a('boolean');
  });

  it('should return gas reservoir balance', async () => {
    const reservoir = await client.readContract({
      address: SENTINEL_CORE,
      abi: SENTINEL_CORE_ABI,
      functionName: 'gasReservoir',
    });

    // gasReservoir is a uint256; valid response means we got a bigint (including 0n)
    expect(typeof reservoir).to.equal('bigint');
  });

  it('should have correct ALERT_THRESHOLD_USD', async () => {
    const threshold = await client.readContract({
      address: SENTINEL_CORE,
      abi: SENTINEL_CORE_ABI,
      functionName: 'ALERT_THRESHOLD_USD',
    });

    // Contract constant: 500_000e6 (USDC, 6 decimals)
    expect(threshold).to.equal(500_000_000_000n);
  });

  it('should have correct agent wallet set', async () => {
    const agent = await client.readContract({
      address: SENTINEL_CORE,
      abi: SENTINEL_CORE_ABI,
      functionName: 'agentWallet',
    });

    expect(agent.toLowerCase()).to.equal(SENTINEL_WALLET_ADDRESS.toLowerCase());
  });
});
