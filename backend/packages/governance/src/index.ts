import 'dotenv/config';
import { draftGovernanceProposal, publishToDiscourse } from './drafter.js';
import { computeLoanTerms } from './terms.js';
// Removed unused postGovernanceDraft

export interface AlertContext {
  alertId: string;
  protocol: string;
  protocolAddress: string;
  protocolTokenSymbol: string;
  detectionTimestamp: number;
  type: 'RELEASE_WITHOUT_BURN' | 'ANOMALY_SCORE' | 'PRE_ATTACK_STAGING';
  deltaAmount: bigint;
  badDebtUSD: number;
  mantleExposureUSD: number;
  zkProofHash: string;
  erc8004ValidationEntry: string;
  exploitMechanics: string;
}

export interface GovernanceDraftResult {
  forumPostUrl: string;
  proposalHash: string;
  generatedInMs: number;
}

/**
 * Main entry point for the governance draft engine.
 * 1. Fetches treasury + price data
 * 2. Computes loan terms (no LLM for numbers)
 * 3. Calls Gemini to draft the MIP text
 * 4. Posts to Mantle Forum
 * 5. Returns forum URL + proposal hash
 */
export async function generateGovernanceProposal(
  alertContext: AlertContext
): Promise<GovernanceDraftResult> {
  const startTime = Date.now();
  console.log(`[governance] Starting MIP draft for ${alertContext.protocol}...`);

  // Fetch live treasury + price data from Ethereum mainnet
  const { createPublicClient, http, parseAbi } = await import('viem');
  const { mainnet } = await import('viem/chains');
  
  const ethClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com')
  });

  // 1. Fetch real ETH price from Chainlink ETH/USD (Ethereum Mainnet: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419)
  const chainlinkAbi = parseAbi(['function latestAnswer() view returns (int256)']);
  const ethPriceRaw = await ethClient.readContract({
    address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    abi: chainlinkAbi,
    functionName: 'latestAnswer'
  });
  const ethPriceUSD = Number(ethPriceRaw) / 1e8; // Chainlink USD feeds have 8 decimals

  // 2. Fetch real Mantle Treasury ETH balance (Mainnet: 0x9dd5b5c65f9dcbd868bfa17c0a4e7f33d7bdaaf7)
  const treasuryBalanceRaw = await ethClient.getBalance({
    address: '0x9dd5b5c65f9dcbd868bfa17c0a4e7f33d7bdaaf7'
  });
  const treasuryETH = Number(treasuryBalanceRaw / 1000000000000000000n); // Convert from wei

  // Compute loan terms from first principles
  const computedTerms = await computeLoanTerms(
    alertContext.badDebtUSD,
    treasuryETH,
    ethPriceUSD,
    alertContext.protocol,
    alertContext.protocolTokenSymbol
  );

  const treasuryData = {
    ethBalance: `${treasuryETH.toLocaleString()} ETH`,
    mantleExposureUSD: alertContext.mantleExposureUSD,
  };

  // Draft with Gemini (structured JSON output)
  console.log('[governance] Calling Gemini to draft MIP...');
  const draft = await draftGovernanceProposal(alertContext, computedTerms, treasuryData);

  // Post to Mantle Forum
  console.log('[governance] Posting to Mantle Forum...');
  const forumUrl = await publishToDiscourse(draft.markdown);

  // Compute proposal hash (keccak256 of forum URL + alert ID)
  const { keccak256, stringToHex } = await import('viem');
  const proposalHash = keccak256(
    stringToHex(`${forumUrl}:${alertContext.alertId}`)
  );

  const generatedInMs = Date.now() - startTime;
  console.log(`[governance] MIP draft complete in ${generatedInMs}ms. URL: ${forumUrl}`);

  return {
    forumPostUrl: forumUrl,
    proposalHash,
    generatedInMs,
  };
}

// Allow running as standalone (for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  const testAlert: AlertContext = {
    alertId: 'test-alert-001',
    protocol: 'rsETH (Kelp DAO LayerZero Bridge)',
    protocolAddress: '0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3',
    protocolTokenSymbol: 'rsETH',
    detectionTimestamp: Date.now(),
    type: 'RELEASE_WITHOUT_BURN',
    deltaAmount: BigInt('116500000000000000000000'), // 116,500 rsETH
    badDebtUSD: 292_000_000,
    mantleExposureUSD: 12_400_000,
    zkProofHash: '0x7a3b...test',
    erc8004ValidationEntry: '0xdef...test',
    exploitMechanics:
      'DVN compromise (1-of-1 threshold) allowed forged cross-chain messages. ' +
      '116,500 rsETH released on destination chains without corresponding burn event on source chain.',
  };
  generateGovernanceProposal(testAlert)
    .then(result => console.log('Result:', result))
    .catch(console.error);
}
