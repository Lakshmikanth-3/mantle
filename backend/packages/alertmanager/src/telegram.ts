const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALERT_CHANNEL = process.env.TELEGRAM_ALERT_CHANNEL || '@sentinel_mantle_alerts';

async function sendTelegramMessage(text: string, parse_mode: string = 'HTML', disable_web_page_preview: boolean = false) {
  if (!BOT_TOKEN) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set, skipping message');
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ALERT_CHANNEL,
        text,
        parse_mode,
        disable_web_page_preview
      })
    });
    if (!res.ok) {
      console.error(`[telegram] API error: ${res.status} ${res.statusText}`);
      const body = await res.text();
      console.error(`[telegram] API response: ${body}`);
    }
  } catch (err: any) {
    console.error(`[telegram] Fetch error: ${err.message}`);
  }
}

export interface CriticalAlert {
  protocol: string;
  protocolAddress: string;
  type: string;
  detectedAt: number;
  amount: bigint;
  estimatedUSD: number;
  mantleExposureUSD: number;
  actionsTaken: string[];
  zkProofHash: string;
  txHash?: string;
}

/** Dispatches a CRITICAL invariant violation alert to Telegram */
export async function dispatchCriticalAlert(alert: CriticalAlert): Promise<void> {
  const mantlescanBase = 'https://explorer.mantle.xyz';
  const txLink = alert.txHash
    ? `<a href="${mantlescanBase}/tx/${alert.txHash}">🔍 View on Mantlescan</a>`
    : '<i>Transaction hash not provided</i>';

  const protocolAddressLink = alert.protocolAddress
    ? `<a href="${mantlescanBase}/address/${alert.protocolAddress}">${alert.protocol}</a>`
    : `<code>${alert.protocol}</code>`;

  const actionsBulletPoints = alert.actionsTaken.length > 0 
    ? alert.actionsTaken.map(a => `• ${a}`).join('\n')
    : '• Incident Logged';

  const message = `🚨 <b>SENTINEL CRITICAL INVARIANT VIOLATION</b> 🚨

<b>Affected Protocol:</b> ${protocolAddressLink}
<b>Violation Type:</b> <code>${alert.type}</code>
<b>Time Detected:</b> <code>${new Date(alert.detectedAt).toLocaleString()}</code>

⚠️ <b>Threat Details:</b>
${
  alert.type === 'RELEASE_WITHOUT_BURN'
    ? `An unauthorized bridge release of <b>${Number(alert.amount) / 1e18 > 1000 ? (Number(alert.amount) / 1e18).toLocaleString() : alert.amount.toString()}</b> tokens was detected without a matching burn event on L1. This indicates a critical bridge exploit.`
    : `A severe invariant violation resulted in a financial discrepancy of <b>$${alert.estimatedUSD.toLocaleString()}</b>.`
}

📉 <b>Ecosystem Risk:</b>
Total Mantle TVL Exposure: <b>$${alert.mantleExposureUSD.toLocaleString()}</b>

🛡️ <b>Automated Agent Response:</b>
${actionsBulletPoints}

🔗 <b>On-Chain Verification:</b>
ZK Proof: <code>${alert.zkProofHash.substring(0, 24)}...</code>
${txLink}

<i>Automated by SENTINEL Agent #021 · ERC-8004 Verified</i> | <a href="https://sentinel.app">Dashboard</a>`;

  await sendTelegramMessage(message, 'HTML', false);
  console.log(`[telegram] Critical alert dispatched to ${ALERT_CHANNEL}`);
}

/** Dispatches an AMBER alert for pre-attack staging signals */
export async function dispatchAmberAlert(signal: {
  protocol: string;
  description: string;
  walletCount: number;
  timestamp: number;
}): Promise<void> {
  const message = `⚠️ <b>SENTINEL AMBER ALERT</b>

Protocol: <code>${signal.protocol}</code>
Signal: ${signal.description}
TC-funded wallets: <b>${signal.walletCount}</b>
Detected: <code>${new Date(signal.timestamp).toISOString()}</code>

This is a pre-attack staging signal. Monitor this protocol closely.
Risk score has been escalated to ELEVATED.

<i>SENTINEL Agent #021 · ERC-8004 · sentinel.app</i>`;

  await sendTelegramMessage(message, 'HTML');
  console.log(`[telegram] Amber alert dispatched for ${signal.protocol}`);
}

/** Dispatches governance draft notification */
export async function dispatchGovernanceDraftAlert(
  protocol: string,
  forumUrl: string,
  generatedInMs: number
): Promise<void> {
  const message = `📋 <b>SENTINEL GOVERNANCE DRAFT POSTED</b>

Protocol: <code>${protocol}</code>
Generated in: <b>${(generatedInMs / 1000).toFixed(0)}s</b> from alert detection

Draft proposal posted to Mantle Forum:
<a href="${forumUrl}">View on Mantle Forum</a>

This is an auto-drafted MIP proposal. Human review required before formal vote.

<i>SENTINEL Agent #021 · ERC-8004 · sentinel.app</i>`;

  await sendTelegramMessage(message, 'HTML', false);
  console.log(`[telegram] Governance draft alert dispatched: ${forumUrl}`);
}

/** Dispatches gas low alert */
export async function dispatchGasLowAlert(reservoirMNT: number): Promise<void> {
  const message = `⛽ <b>SENTINEL GAS LOW</b>

Gas reservoir: <b>${reservoirMNT.toFixed(4)} MNT</b>
Status: Read-only mode activated

SENTINEL has suspended write operations until the gas reservoir refills.
Monitoring continues — alerts will be dispatched via Telegram only.

<i>SENTINEL Agent #021 · ERC-8004 · sentinel.app</i>`;

  await sendTelegramMessage(message, 'HTML');
  console.log('[telegram] Gas low alert dispatched');
}
