/**
 * @file protocols.ts
 * @description Complete protocol registry for SENTINEL's monitored OFT bridges.
 *   Each entry maps a source-chain address to its Mantle OFT counterpart and
 *   carries the LayerZero event ABI signatures used by the listener/checker layers.
 *
 * Sources:
 *   - Kelp DAO / rsETH: https://kelpdao.xyz / Innora.ai forensic report
 *   - Mantle mETH: https://docs.mantle.xyz/meth
 *   - Byreal Super Portal: https://byreal.fi
 *   - xStocks: https://xstocks.xyz
 *   - USDY (Ondo): https://ondo.finance
 */

// ─── Protocol interface ───────────────────────────────────────────────────────

export interface MonitoredProtocol {
  /** Human-readable protocol name */
  name: string;
  /** OFT contract address on Mantle where tokens are minted */
  mantleAddress: string;
  /** Source bridge / adapter address on the origin chain */
  sourceAddress: string;
  /** Which chain holds the canonical asset */
  sourceChain: 'ethereum' | 'solana' | 'offchain';
  /** Monitoring priority tier */
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  /**
   * ABI event signature emitted on the SOURCE chain when tokens leave.
   * LayerZero OFT standard: OFTSent(bytes32 guid, uint32 dstEid, address from, uint256 amountSentLD, uint256 amountReceivedLD)
   */
  oftSentEvent: string;
  /**
   * ABI event signature emitted on MANTLE when tokens arrive.
   * LayerZero OFT standard: OFTReceived(bytes32 guid, uint32 srcEid, address to, uint256 amountReceivedLD)
   */
  oftReceivedEvent: string;
  /** Mainnet source address used for Nansen API (which only supports mainnet addresses) */
  mainnetSourceAddress?: string;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

/**
 * USD notional value above which an unreconciled mint fires an ELEVATED/HIGH alert.
 * Chosen to catch meaningful bridge discrepancies without noise from dust.
 */
export const ALERT_THRESHOLD_USD = 50_000; // $50 k

/**
 * USD notional value above which an unreconciled mint fires a CRITICAL alert
 * and triggers the defensive executor.
 */
export const CRITICAL_THRESHOLD_USD = 500_000; // $500 k

/**
 * ETH amount below which a transfer is considered dust and skipped.
 * 0.01 ETH ≈ $30 at $3000/ETH — avoids spam from test transactions.
 */
export const DUST_THRESHOLD_ETH = BigInt('10000000000000000'); // 0.01 ETH in wei

/**
 * Time window within which a source-chain OFTSent MUST be matched to a
 * Mantle OFTReceived before SENTINEL raises an alert.
 *
 * Calculation: 50 Mantle blocks × 2 s/block = 100 s buffer
 *   + we use 100,000 ms (100 s) as a practical minimum; real reconciliation
 *   may tolerate slightly more due to L1→L2 finality (~15 min) but the
 *   checker starts flagging after this window.
 */
export const RECONCILIATION_WINDOW_MS = 10_000; // 10s for hackathon demo (normally 100s/50 blocks)

// ─── OFT event ABI signatures ─────────────────────────────────────────────────

/**
 * Standard LayerZero v2 OFT event signatures (Solidity ABI-encoded).
 * These are used by viem's watchContractEvent to filter on-chain logs.
 */
const LZ_OFT_SENT_SIGNATURE =
  'OFTSent(bytes32,uint32,address,uint256,uint256)';

const LZ_OFT_RECEIVED_SIGNATURE =
  'OFTReceived(bytes32,uint32,address,uint256)';

// ─── Protocol registry ────────────────────────────────────────────────────────

/**
 * All five protocols monitored by SENTINEL (PRD §13).
 *
 * Mantle OFT addresses where not yet deployed are left as placeholder strings
 * and MUST be replaced with on-chain addresses before production use.
 * Source addresses are verified from public explorers and Innora.ai reports.
 */
export const PROTOCOLS: MonitoredProtocol[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // rsETH — Kelp DAO's restaked ETH
  // Source: verified by Innora.ai forensic analysis (bridge involved in $27 M
  //   May 2024 LayerZero OFT incident)
  // ──────────────────────────────────────────────────────────────────────────
  {
    name: 'rsETH (Kelp DAO)',
    mantleAddress: process.env.RSETH_MANTLE_OFT ?? '0x4200000000000000000000000000000000000000',
    sourceAddress: process.env.RSETH_ETH_BRIDGE ?? process.env.RSETH_MANTLE_OFT ?? '0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3',
    sourceChain: 'ethereum',
    priority: 'CRITICAL',
    oftSentEvent: LZ_OFT_SENT_SIGNATURE,
    oftReceivedEvent: LZ_OFT_RECEIVED_SIGNATURE,
    mainnetSourceAddress: '0x8c1bEd5b9a0928467c9B1341Da1D7BD5e10b656b', // Real Kelp rsETH Mainnet address
  },
  {
    name: 'mETH (Mantle LSP)',
    mantleAddress: process.env.METH_MANTLE_OFT ?? '0x48Fc622cC6E924FD7fddee6047CC2a3E98eB9f2F',
    sourceAddress: process.env.METH_ETH_BRIDGE ?? '0xe6829d9a7ee3040e1276fa75293bde931859e8fa',
    sourceChain: 'ethereum',
    priority: 'CRITICAL',
    oftSentEvent: LZ_OFT_SENT_SIGNATURE,
    oftReceivedEvent: LZ_OFT_RECEIVED_SIGNATURE,
    mainnetSourceAddress: '0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa', // Real mETH Mainnet address
  },
  {
    name: 'USDY (Ondo Finance)',
    mantleAddress: process.env.USDY_MANTLE_OFT || '0x8E8Fba115E38af52Cc332C1a15ff8DB204719766',
    sourceAddress: process.env.USDY_ETH_OFT || '0x0b96e269FA282096552e87949da6e1c3fAfA7Ca5',
    sourceChain: 'ethereum',
    priority: 'HIGH',
    oftSentEvent: 'event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)',
    oftReceivedEvent: 'event OFTReceived(bytes32 indexed guid, uint32 srcEid, address indexed toAddress, uint256 amountReceivedLD)',
    mainnetSourceAddress: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C', // Real USDY Mainnet address
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Map from lower-cased Mantle OFT address → protocol */
export const PROTOCOL_BY_MANTLE_ADDRESS = new Map<string, MonitoredProtocol>(
  PROTOCOLS.map((p) => [p.mantleAddress.toLowerCase(), p]),
);

/** Map from lower-cased source address → protocol */
export const PROTOCOL_BY_SOURCE_ADDRESS = new Map<string, MonitoredProtocol>(
  PROTOCOLS.map((p) => [p.sourceAddress.toLowerCase(), p]),
);

/** Filter to only Ethereum-source protocols (used by ethListener) */
export const ETHEREUM_PROTOCOLS = PROTOCOLS.filter(
  (p) => p.sourceChain === 'ethereum',
);
