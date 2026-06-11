import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

// Deploy SentinelBatchVerifier with SENTINEL Core address as guardian
export default buildModule('SentinelBatchVerifierModule', (m) => {
  const sentinelAddr = process.env.SENTINEL_CORE_ADDRESS || '0x38E0D4468Afdd12776b7D371166edED8E9522054';
  const verifier = m.contract('SentinelBatchVerifier', [sentinelAddr]);
  return { verifier };
});
