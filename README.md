# SENTINEL

An autonomous AI agent that detects cross-chain bridge exploits on Mantle in seconds, automatically drafts governance proposals to mitigate treasury risk, and sells validated risk data via x402 micro-payments.

## Architecture

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'tertiaryColor': '#ffffff', 'secondaryColor': '#ffffff', 'mainBkg': '#ffffff'}}}%%
graph TD
    A[Mantle Network] -->|New Block Events| B(Watcher / Invariant Checker)
    B -->|Anomaly| C(Alert Manager)
    C -->|Critical Violation| D[Governance LLM Engine]
    C -->|Alert| E[Telegram / Frontend]
    D -->|MIP Draft| F[Mantle Forum]
    
    B -->|ZK Proofs| G[ERC-8004 Registry]
    H[Agent/Client] -->|x402 Payment| I(Risk Oracle API)
    I -->|Query| G
```

## Exploit Response Workflow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryBorderColor': '#000000', 'primaryTextColor': '#000000', 'lineColor': '#000000', 'tertiaryColor': '#ffffff', 'secondaryColor': '#ffffff', 'mainBkg': '#ffffff'}}}%%
sequenceDiagram
    participant Attacker
    participant Bridge
    participant SENTINEL
    participant MantleForum
    
    Attacker->>Bridge: 1. Forged Mint (No Source Burn)
    Bridge-->>SENTINEL: 2. Block Emitted
    SENTINEL->>SENTINEL: 3. Verify Invariant (Burn == Mint)
    SENTINEL-->>SENTINEL: 4. Mismatch Detected!
    SENTINEL->>MantleForum: 5. Auto-Draft MIP Governance Proposal
    SENTINEL->>SENTINEL: 6. Execute Defensive Treasury Rebalance
```

## Getting Started
1. Run backend: `cd backend && pnpm dev`
2. Run frontend: `cd frontend && pnpm dev`
3. View Monitor: `http://localhost:3000`
