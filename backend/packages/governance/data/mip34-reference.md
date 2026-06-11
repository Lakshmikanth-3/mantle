# MIP-34 Reference — Strategic Credit Facility for Aave DAO (rsETH Exploit)

**Status:** Approved  
**Author:** Mantle Core Contributors  
**Forum Thread:** https://forum.mantle.xyz/t/discussion-mip-34-strategic-credit-facility-for-aave-dao-rseth-exploit/9417  
**Snapshot Vote:** https://snapshot.org/#/mantle.eth  
**Date:** April 24, 2026  

---

## 1. Executive Summary

On April 18, 2026, the Kelp DAO rsETH LayerZero bridge was exploited for approximately $292 million due to a DVN compromise. This proposal authorizes the Mantle Treasury to extend a strategic credit facility of up to 42,000 ETH (~$134M) to Aave DAO to address bad debt exposure from unbacked rsETH collateral positions, in exchange for governance rights delegation and protocol-level collateral.

## 2. Background

The rsETH LayerZero bridge (OFT standard) was exploited when attackers compromised a 1-of-1 Decentralised Verifier Node (DVN) configuration. This allowed forged cross-chain messages to pass verification, releasing 116,500 rsETH on destination chains without a corresponding burn on the source chain.

Downstream impact:
- Aave V3 held rsETH as collateral for approximately $134M in loans
- When rsETH was frozen, these positions became undercollateralised
- Mantle Treasury had indirect exposure through its ETH positions and Aave counterparty risk
- The second theft attempt at 18:26 UTC for $95M was prevented only because contracts were paused at 18:21 UTC

The Mantle Core Contributors team manually assessed the situation over 6 days (April 18–24), computed exposure, drafted loan terms, and submitted this proposal to the governance forum on April 24.

## 3. Proposed Terms

| Parameter | Value |
|-----------|-------|
| Maximum Facility Amount | 42,000 ETH (~$134M at $3,200/ETH) |
| Maturity | 36 months |
| Interest Rate | Lido stETH APR + 1% (approximately 5.2% annually) |
| Minimum Collateral | $6.7M in Aave governance tokens (AAVE) |
| Governance Rights | Aave DAO delegation — minimum 2.5% of AAVE voting power |
| Disbursement Schedule | Tranches tied to Aave's bad debt recovery milestones |

## 4. Risk Analysis

**Collateral adequacy:** The proposed $6.7M minimum collateral (5% of the facility) is conservative given Aave's $15B+ TVL and market capitalization. AAVE token liquidity provides adequate collateral coverage.

**Treasury capacity:** At time of writing, the Mantle Treasury holds approximately 47,000 ETH. The proposed facility represents 89% of treasury — the proposal recommends a maximum draw of 42,000 ETH (15% of treasury value at peak), with actual disbursement gated by milestone achievement.

**Protocol viability:** Aave has successfully navigated prior stress events (CRV bad debt 2022, 3AC exposure 2022). Core team and DAO have demonstrated capacity to manage systemic risk.

**Counterparty risk:** If Aave fails to repay, Mantle holds governance token collateral and delegation rights. The protocol delegation provides additional strategic value beyond pure financial return.

## 5. Strategic Rationale

1. **Mantle-Aave alignment:** Aave V3 is deployed on Mantle. A healthy Aave DAO is critical to Mantle ecosystem TVL.
2. **Precedent:** This establishes Mantle as a reliable ecosystem partner willing to act decisively in crisis — differentiating Mantle from competing L2s.
3. **Return:** At 5.2% annual interest on 42,000 ETH, the maximum return is approximately $6.9M annually — material for the treasury.
4. **Governance influence:** Aave delegation rights give Mantle a voice in future Aave risk parameter decisions directly relevant to Mantle's ecosystem.

## 6. Implementation

1. **T+0 (approval):** Mantle multisig executes initial tranche transfer of 10,500 ETH to Aave DAO treasury
2. **T+30 days:** Aave provides AAVE token collateral and governance delegation confirmation
3. **T+60 days:** Second tranche of 10,500 ETH upon first milestone verification
4. **T+90 days:** Third tranche of 10,500 ETH upon second milestone
5. **T+120 days:** Fourth and final tranche of 10,500 ETH upon full bad debt resolution plan confirmation
6. **Ongoing:** Quarterly interest payments in ETH or USDC equivalent

## 7. Vote Options

- **YES** — Authorize the strategic credit facility under the terms described above
- **NO** — Do not authorize. Mantle treasury takes no action.
- **ABSTAIN**

---

*Submitted by Mantle Core Contributors on April 24, 2026 — 6 days after the exploit.*  
*This document took 6 human-days to produce. SENTINEL produces an equivalent document in under 8 minutes.*
