# SENTINEL Backend

This directory contains the core infrastructure and smart contracts for SENTINEL, the autonomous DeFi risk oracle built for the Mantle Turing Test Hackathon 2026.

## Architecture

```text
sentinel/backend/
├── packages/
│   ├── contracts/       Solidity (SentinelCore + SentinelLedger)
│   ├── watcher/         Block listener + invariant checker (viem)
│   ├── alertmanager/    Risk scorer + Telegram + ERC-8004
│   ├── governance/      Gemini-powered MIP drafter 
│   ├── executor/        Byreal defensive position manager
│   ├── oracle/          x402 risk intelligence server
│   ├── prover/          Groth16 ZK batch prover (Circom + snarkjs)
│   └── indexer/         WebSocket broadcaster
```

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables and fill in your keys
cp .env.example .env

# 3. Start all services
pnpm dev
```

## Setting Up API Keys

### Google Gemini (Governance Draft Engine)
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google → Generate API Key
3. Add to `.env`: `GOOGLE_GEMINI_API_KEY=your_key`

### Telegram Bot (Real-time Community Alerts)
1. Open Telegram → search `@BotFather`
2. Send: `/newbot`
3. Name: `SENTINEL Mantle Monitor`
4. Username: `sentinel_mantle_bot`
5. BotFather gives you a token → add to `.env`: `TELEGRAM_BOT_TOKEN=your_token`
6. Create public channel `@sentinel_mantle_alerts`
7. Add your bot as admin of that channel

### ZK Circuit Compilation (Groth16)
```bash
# Install circom (requires Rust or npm)
npm install -g circom

# Compile circuit
pnpm -F prover compile-circuit

# Generate proving key
pnpm -F prover trusted-setup

# Export Solidity verifier
pnpm -F prover export-verifier
```

Please see the root `README.md` for full project details, architectural sequences, and sponsor integration details.
