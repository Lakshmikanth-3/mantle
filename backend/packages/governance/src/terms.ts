import { getStETHAPR } from '../../watcher/src/signals/pyth.js';

/**
 * Loan terms computation as specified in SENTINEL PRD §11.
 * All arithmetic is deterministic — LLM is never trusted for numbers.
 */
export interface LoanTerms {
  maxAmount: string;           // e.g. "42,500 ETH"
  maturityMonths: 36;
  interestRate: string;        // e.g. "Lido stETH APR (4.2%) + 1% = 5.2%"
  collateralUSD: string;       // e.g. "$14,600,000"
  governanceRights: string;    // e.g. "KelpDAO KETH token delegation (5% of supply)"
}

/**
 * Computes loan terms from first principles.
 * Formula from PRD §11:
 *   loanAmount = min(badDebt × 1.1, treasury × 0.15)
 *   interestRate = stETH APR + 1%
 *   collateral = badDebt × 0.05
 */
export async function computeLoanTerms(
  badDebtUSD: number,
  treasuryETH: number,
  ethPriceUSD: number,
  protocolName: string,
  protocolTokenSymbol: string
): Promise<LoanTerms> {
  const treasuryUSD = treasuryETH * ethPriceUSD;

  const loanAmount1 = badDebtUSD * 1.1;
  const loanAmount2 = treasuryUSD * 0.15;
  const maxLoanUSD = Math.min(loanAmount1, loanAmount2);
  const maxLoanETH = maxLoanUSD / ethPriceUSD;

  const stETHAPR = await getStETHAPR();
  const totalInterestRate = stETHAPR + 1.0;

  const collateralUSD = badDebtUSD * 0.05;

  return {
    maxAmount: `${maxLoanETH.toFixed(0)} ETH (~$${(maxLoanUSD / 1_000_000).toFixed(1)}M)`,
    maturityMonths: 36,
    interestRate: `Lido stETH APR (${stETHAPR.toFixed(1)}%) + 1% = ${totalInterestRate.toFixed(1)}% annually`,
    collateralUSD: `$${(collateralUSD / 1_000_000).toFixed(2)}M`,
    governanceRights: `${protocolName} ${protocolTokenSymbol} token delegation — minimum 5% of circulating supply`,
  };
}
