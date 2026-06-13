import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AlertContext } from './index.js';
import type { LoanTerms } from './terms.js';

// ─── Gemini client ─────────────────────────────────────────────────────────────
// We initialise lazily so that missing key produces a clear error only when
// governance is actually triggered (not at module import time).
function getGeminiModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      '[governance] GEMINI_API_KEY not set — add it to .env (get free key at aistudio.google.com/app/apikey)',
    );
  }
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface MIPDraft {
  title: string;
  status: 'Draft / Pre-MIP Discussion';
  author: string;
  sections: {
    executiveSummary: string;
    background: string;
    proposedTerms: LoanTerms;
    riskAnalysis: string;
    strategicRationale: string;
    implementation: string;
    voteOptions: ['YES — Authorize facility', 'NO — Do not authorize', 'ABSTAIN'];
    sentinelMetadata: {
      agentId: string;
      alertId: string;
      detectionTimestamp: number;
      zkProofHash: string;
      erc8004ValidationEntry: string;
    };
  };
  markdown: string;
}

// ─── Governance Draft Engine (Gemini) ─────────────────────────────────────────

/**
 * Calls Gemini 1.5 Pro to draft a Mantle Improvement Proposal (MIP) for an
 * invariant violation.  The prompt enforces MIP-34 structure and outputs
 * strict JSON — no markdown fences, no preamble.
 */
export async function draftGovernanceProposal(
  alertContext: AlertContext,
  computedTerms: LoanTerms,
  treasuryData: { ethBalance: string; mantleExposureUSD: number },
): Promise<MIPDraft> {
  const model = getGeminiModel();

  const prompt = `You are SENTINEL, an autonomous DeFi risk oracle on Mantle Network.
A critical cross-chain bridge invariant violation was detected. Draft an emergency Mantle Improvement Proposal (MIP).

STRICT REQUIREMENTS:
- Output ONLY valid JSON — no markdown fences, no preamble, no explanation
- All financial figures must come from the data provided — never invent numbers
- Tone: formal governance document
- Author field: "SENTINEL Agent #021 (Autonomous — review before formal vote)"
- Status field: "Draft / Pre-MIP Discussion"
- voteOptions: ["YES — Authorize facility", "NO — Do not authorize", "ABSTAIN"]

INCIDENT DATA:
${JSON.stringify(alertContext, null, 2)}

COMPUTED LOAN TERMS (use exactly):
${JSON.stringify(computedTerms, null, 2)}

TREASURY DATA:
${JSON.stringify(treasuryData, null, 2)}

OUTPUT (strict JSON, no fences):
{
  "title": "MIP-EMERGENCY: [Protocol] Bridge Invariant Violation — Emergency Credit Facility",
  "status": "Draft / Pre-MIP Discussion",
  "author": "SENTINEL Agent #021 (Autonomous — review before formal vote)",
  "sections": {
    "executiveSummary": "2-3 sentence summary of incident and proposed action",
    "background": "Technical description of the invariant violation and its impact",
    "proposedTerms": {
      "maxAmount": "string",
      "maturityMonths": 36,
      "interestRate": "string",
      "collateralUSD": "string",
      "governanceRights": "string"
    },
    "riskAnalysis": "Downside scenarios, Mantle treasury exposure, contagion risk",
    "strategicRationale": "Why this protects Mantle ecosystem and TVL",
    "implementation": "T+0 immediate steps, T+7d governance vote, T+30d execution",
    "voteOptions": ["YES — Authorize facility", "NO — Do not authorize", "ABSTAIN"],
    "sentinelMetadata": {
      "agentId": "sentinel-agent-021",
      "alertId": "${alertContext.alertId}",
      "detectionTimestamp": ${alertContext.detectionTimestamp},
      "zkProofHash": "${alertContext.zkProofHash}",
      "erc8004ValidationEntry": "${alertContext.erc8004ValidationEntry}"
    }
  }
}`;

  console.log('[governance] Calling Gemini 1.5 Pro to draft MIP...');
  const result = await model.generateContent(prompt);
  const rawText = result.response.text();

  // Strip accidental markdown fences if Gemini adds them
  const clean = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  let draft: Omit<MIPDraft, 'markdown'>;
  try {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found in Gemini response');
    draft = JSON.parse(clean.slice(start, end + 1)) as Omit<MIPDraft, 'markdown'>;
  } catch (e) {
    console.error('[governance] Gemini response excerpt:', rawText.substring(0, 800));
    throw new Error(`Gemini returned invalid JSON: ${(e as Error).message}`);
  }

  // Enforce invariant fields that the LLM must not alter
  draft.status = 'Draft / Pre-MIP Discussion';
  draft.author = 'SENTINEL Agent #021 (Autonomous — review before formal vote)';
  draft.sections.voteOptions = ['YES — Authorize facility', 'NO — Do not authorize', 'ABSTAIN'];
  draft.sections.sentinelMetadata = {
    agentId: 'sentinel-agent-021',
    alertId: alertContext.alertId,
    detectionTimestamp: alertContext.detectionTimestamp,
    zkProofHash: alertContext.zkProofHash,
    erc8004ValidationEntry: alertContext.erc8004ValidationEntry,
  };

  const fullDraft: MIPDraft = {
    ...draft,
    markdown: formatMIPAsMarkdown(draft as any),
  };

  console.log(`[governance] ✅ Gemini MIP draft complete: "${fullDraft.title}"`);
  return fullDraft;
}

/** Convert MIPDraft to Markdown for forum posting */
export function formatMIPAsMarkdown(draft: MIPDraft): string {
  const { sections } = draft;
  return `> ⚠️ **This proposal was auto-generated by SENTINEL Agent #021 (ERC-8004 Verified Autonomous Agent)**
> It requires human review and governance vote before any treasury action. This is a \`[DISCUSSION]\` post only.
> ZK Proof: \`${sections.sentinelMetadata.zkProofHash}\`
> Detection: \`${new Date(sections.sentinelMetadata.detectionTimestamp).toISOString()}\`

---

**Status:** ${draft.status}
**Author:** ${draft.author}
**Generated:** ${new Date().toISOString()}

---

## 1. Executive Summary

${sections.executiveSummary}

## 2. Background

${sections.background}

## 3. Proposed Terms

| Parameter | Value |
|-----------|-------|
| Maximum Facility Amount | ${sections.proposedTerms.maxAmount} |
| Maturity | ${sections.proposedTerms.maturityMonths} months |
| Interest Rate | ${sections.proposedTerms.interestRate} |
| Minimum Collateral | ${sections.proposedTerms.collateralUSD} |
| Governance Rights | ${sections.proposedTerms.governanceRights} |

## 4. Risk Analysis

${sections.riskAnalysis}

## 5. Strategic Rationale

${sections.strategicRationale}

## 6. Implementation

${sections.implementation}

## 7. Vote Options

- **YES** — ${sections.voteOptions[0]}
- **NO** — ${sections.voteOptions[1]}
- **ABSTAIN**

---

## SENTINEL Agent Metadata

| Field | Value |
|-------|-------|
| Agent ID | \`${sections.sentinelMetadata.agentId}\` |
| Alert ID | \`${sections.sentinelMetadata.alertId}\` |
| Detection Time | \`${new Date(sections.sentinelMetadata.detectionTimestamp).toISOString()}\` |
| ZK Proof Hash | \`${sections.sentinelMetadata.zkProofHash}\` |
| ERC-8004 Validation | \`${sections.sentinelMetadata.erc8004ValidationEntry}\` |

*This proposal was drafted autonomously by SENTINEL, an ERC-8004 verified AI agent running on Mantle Network.
All figures are computed from live on-chain data. No human authored this document.*`;
}

// ─── Discourse publisher ───────────────────────────────────────────────────────

export async function publishToDiscourse(markdownContent: string): Promise<string> {
  const apiKey = process.env.DISCOURSE_API_KEY;
  const apiUser = process.env.DISCOURSE_API_USERNAME || 'sentinel-agent-021';
  const baseUrl = process.env.DISCOURSE_BASE_URL || process.env.DISCOURSE_URL || 'https://forum.mantle.xyz';

  // Bypass real implementation if mock
  if (!apiKey || apiKey === 'mock') {
    console.warn('[governance] DISCOURSE_API_KEY is mock. Bypassing forum post and returning dummy URL.');
    return 'https://forum.mantle.xyz/t/mock-draft/123';
  }

  try {
    const response = await fetch(`${baseUrl}/posts.json`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Api-Username': apiUser,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '[SENTINEL AUTO-DRAFT] [DISCUSSION] Emergency MIP — Bridge Invariant Violation',
        raw: markdownContent,
        category: parseInt(process.env.DISCOURSE_CATEGORY_ID || '9', 10),
        tags: ['sentinel', 'auto-draft', 'emergency-response', 'bridge-security'],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[governance] Discourse API error ${response.status}:`, errText);
      throw new Error(`Forum post failed: ${response.status} ${errText}`);
    }

    const data = await response.json() as { topic_slug: string; topic_id: number };
    const url = `${baseUrl}/t/${data.topic_slug}/${data.topic_id}`;
    console.log(`[governance] ✅ Forum post created: ${url}`);
    return url;
  } catch (err: any) {
    console.error('[governance] Forum publish failed:', err.message);
    throw err;
  }
}
