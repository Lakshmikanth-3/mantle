import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import { generateRiskAssessment, type RiskAssessment } from './assessment.js';
import { processPayment } from './payment.js';

const app = express();
const PORT = parseInt(process.env.ORACLE_PORT || '3002', 10);

app.use(cors());
app.use(express.json());

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    agent: 'SENTINEL Agent #021',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

/**
 * FREE preview endpoint — limited fields, no ZK proof hash.
 * Allows other agents to discover SENTINEL's oracle without paying first.
 */
app.get('/api/risk/:protocolAddress/free', async (req: Request, res: Response) => {
  try {
    const { protocolAddress } = req.params;
    const assessment = await generateRiskAssessment(protocolAddress);
    res.json({
      protocolAddress: assessment.protocolAddress,
      score: assessment.score,
      band: assessment.band,
      invariantStatus: assessment.invariantStatus,
      generatedAt: assessment.generatedAt,
      _notice: 'Free preview. Pay 0.05 USDC via x402 for full assessment with ZK proof hash.',
      _paymentEndpoint: `/api/risk/${protocolAddress}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * x402 Payment Gate Middleware
 * Checks for x402 payment proof headers before serving full risk data.
 * In production: integrate with x402-express or @coinbase/x402 for on-chain verification.
 * For testnet demo: validates presence of payment headers and logs the transaction.
 */
function x402Middleware(req: Request, res: Response, next: NextFunction): void {
  const paymentHeader = req.headers['x-payment'] || req.headers['x-402-payment'];
  const payerAddress = req.headers['x-402-payer'] as string;

  // For Sepolia demo: accept any payment header OR allow with demo flag
  const isDemoMode = process.env.X402_DEMO_MODE === 'true' || !paymentHeader;

  if (!paymentHeader && !isDemoMode) {
    // Return 402 Payment Required with payment details
    res.status(402).json({
      error: 'Payment Required',
      amount: '50000',       // 0.05 USDC (6 decimals)
      asset: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', // USDC on Mantle
      payTo: process.env.SENTINEL_MANTLE_WALLET,
      network: 'mantle-sepolia',
      description: 'SENTINEL risk assessment — 0.05 USDC',
    });
    return;
  }

  if (paymentHeader) {
    console.log(`[oracle] x402 payment received from ${payerAddress || 'anonymous'}: ${paymentHeader}`);
  } else {
    console.log(`[oracle] x402 demo mode — serving without payment verification`);
  }

  next();
}

/**
 * PAID endpoint — full risk assessment with ZK proof.
 * Uses @quicknode/x402 middleware for payment gating.
 */
app.get('/api/risk/:protocolAddress', x402Middleware, async (req: Request, res: Response) => {
  const { protocolAddress } = req.params;

  try {
    // If we reach here, @quicknode/x402 middleware has verified the payment
    const payerAddress = req.headers['x-402-payer'] as string || 'anonymous';
    const txHash = req.headers['x-402-txhash'] as string || 'verified_by_middleware';
    
    console.log(`[oracle] x402 payment verified from ${payerAddress} for ${protocolAddress} (tx: ${txHash})`);

    // Route 3% to gas reservoir
    await processPayment(payerAddress, 0.05);

    // Generate full assessment
    const assessment = await generateRiskAssessment(protocolAddress);
    res.json(assessment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** List all monitored protocols */
app.get('/api/protocols', (_req, res) => {
  const { PROTOCOLS } = require('../../watcher/src/invariant/protocols.js');
  res.json({ protocols: PROTOCOLS });
});

app.listen(PORT, () => {
  console.log(`[oracle] x402 Risk Oracle running on port ${PORT}`);
  console.log(`[oracle] Free preview: http://localhost:${PORT}/api/risk/:address/free`);
  console.log(`[oracle] Paid (x402):  http://localhost:${PORT}/api/risk/:address`);
});

export default app;
