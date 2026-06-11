# SENTINEL
## Autonomous DeFi Risk Oracle — Mantle Turing Test Hackathon 2026

> *"Kelp DAO detected the exploit in 46 minutes. SENTINEL detects it in 2 seconds."*

**Track:** AI Alpha & Data (primary) · AI DevTools (secondary)  
**Agent:** SENTINEL #021 · ERC-8004 Verified  
**Network:** Mantle L2  

---

## What is SENTINEL?

SENTINEL is a fully autonomous AI agent that monitors cross-chain bridge invariants on Mantle Network. It has no users, no onboarding, and no wallet to connect. It runs from the moment it is deployed — watching every block, every bridge, every minute.

When a Kelp DAO-style exploit attempts to drain $292 million:

| Action | Kelp DAO (Human) | SENTINEL (AI Agent) |
|--------|-------------------|---------------------|
| Detection | 46 minutes | **2 seconds** |
| Telegram alert | Manual | **1 second after detection** |
| Governance draft | **6 days** | **8 minutes** |
| ZK proof | None | **Submitted on-chain** |

## Architecture

```
sentinel/
├── packages/
│   ├── contracts/       Solidity (SentinelCore + SentinelLedger)
│   ├── watcher/         Block listener + invariant checker (viem)
│   ├── alertmanager/    Risk scorer + Telegram + ERC-8004
│   ├── governance/      Gemini-powered MIP drafter + Forum poster
│   ├── executor/        Byreal defensive position manager
│   ├── oracle/          x402 risk intelligence server
│   ├── prover/          Groth16 ZK batch prover (Circom + snarkjs)
│   ├── indexer/         Postgres + WebSocket broadcaster
│   └── monitor/         Next.js 15 + D3.js threat map
```

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables and fill in your keys
cp .env.example .env

# 3. Start Postgres
docker-compose up -d postgres

# 4. Deploy contracts to Mantle Sepolia
pnpm contracts:deploy:sepolia

# 5. Start all services
pnpm dev

# 6. Open Monitor
open http://localhost:3000

# 7. View Exploit Replay
open http://localhost:3000/replay/kelp-2026
```

## Setting Up API Keys

### Alchemy (Mantle RPC) — DONE ✓
Your Alchemy key is already configured for Mantle Sepolia.

### Google Gemini (Free — for governance draft engine)
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google → Generate API Key
3. Add to `.env`: `GOOGLE_GEMINI_API_KEY=your_key`

### Nansen (smart money signals)
1. Visit [DoraHacks resource page](https://dorahacks.io/mantle-turing-test) → claim Nansen credits
2. After approval: [docs.nansen.ai](https://docs.nansen.ai) → Dashboard → API Keys
3. Add to `.env`: `NANSEN_API_KEY=your_key`

### Elfa AI (social sentiment)
1. Visit DoraHacks resource page → claim Elfa credits ($36,000 available — Elfa CEO is a judge)
2. After approval: [api.elfa.ai](https://api.elfa.ai) → Settings → API Keys
3. Add to `.env`: `ELFA_API_KEY=your_key`

### Telegram Bot
1. Open Telegram → search `@BotFather`
2. Send: `/newbot`
3. Name: `SENTINEL Mantle Monitor`
4. Username: `sentinel_mantle_bot`
5. BotFather gives you a token → add to `.env`: `TELEGRAM_BOT_TOKEN=your_token`
6. Create public channel `@sentinel_mantle_alerts`
7. Add your bot as admin of that channel

### Mantle Forum (Discourse API)
1. Create account at [forum.mantle.xyz](https://forum.mantle.xyz) (username: `sentinel-agent-021`)
2. Go to: `forum.mantle.xyz/u/sentinel-agent-021/preferences/api`
3. Click **Generate New API Key**
4. Description: `SENTINEL Agent` · User: `sentinel-agent-021` · Scope: All
5. Add to `.env`: `DISCOURSE_API_KEY=your_key`

### ZK Circuit (Real Groth16)
```bash
# Install circom (requires Rust or npm)
npm install -g circom

# Compile circuit
pnpm -F prover compile-circuit

# Generate proving key (takes 15-30 minutes)
pnpm -F prover trusted-setup

# Export Solidity verifier
pnpm -F prover export-verifier
```

## Links

- **Monitor**: http://localhost:3000
- **Exploit Replay**: http://localhost:3000/replay/kelp-2026
- **Risk Oracle**: http://localhost:3002/api/risk/:address/free
- **Telegram Alerts**: https://t.me/sentinel_mantle_alerts
- **ERC-8004 Identity**: (registered on deployment)
- **DoraHacks Submission**: (link after submission)

---

*Built for Mantle Turing Test Hackathon 2026 — AI Alpha & Data Track*
