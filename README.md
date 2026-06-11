# SENTINEL

**Mantle Turing Test Hackathon 2026 Submission**

SENTINEL is a fully autonomous AI agent that continuously monitors cross-chain bridges on the Mantle network. By mathematically validating cross-chain invariants (e.g. `minted == burned`) in real-time, it detects exploits within seconds of them occurring—long before human teams can react. When a systemic threat is detected, SENTINEL instantly drafts a Mantle Governance Proposal (MIP) to defensively reposition the Mantle Treasury and automatically executes pre-authorized smart contract actions to minimize collateral damage.

Beyond emergency response, SENTINEL operates as a self-sustaining public good. It acts as an ERC-8004 Risk Oracle, selling its ZK-proven risk assessments to other AI agents and protocols via x402 micro-payments, using the revenue to fund its own gas costs.

## Architecture Diagram

```mermaid
graph TD
    classDef default fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    classDef highlight fill:#f9f9f9,stroke:#000000,stroke-width:2px,color:#000000;

    A[Mantle Network RPC] -->|Block Streams| B(Watcher / Invariant Checker)
    B -->|Logs & Alerts| C(Alert Manager)
    
    C -->|High Risk Detected| D[Governance LLM Engine]
    C -->|Critical Violation| E[Executor Engine]
    
    D -->|Auto-Drafts| F[Mantle Forum MIP Proposal]
    E -->|Defensive Action| G[Byreal CLMM / Super Portal]
    
    B -->|ZK Proofs| H[ERC-8004 Validation Registry]
    I[Third-Party Agents] -->|x402 Micro-payments| J(Risk Oracle HTTP API)
    J -->|Serves Score| H
    
    class A,B,C,D,E,F,G,H,I,J default;
```

## Exploit Response Workflow

```mermaid
sequenceDiagram
    participant A as Attacker
    participant B as Bridge Contract
    participant S as SENTINEL
    participant G as Governance / Treasury
    
    A->>B: 1. Exploit: Forge Mint on Destination
    B-->>S: 2. Block Emitted on Mantle
    S->>S: 3. Verify Invariant (Burn == Mint)
    S-->>S: 4. Mismatch Detected! (Zero Burn)
    S->>G: 5. Auto-Draft MIP Governance Proposal
    S->>B: 6. Execute Defensive Treasury Rebalance
```

## Getting Started

1. **Start the Backend Infrastructure:**
   ```bash
   cd backend
   pnpm dev
   ```
2. **Start the Frontend Threat Map:**
   ```bash
   cd frontend
   pnpm dev
   ```
3. **View the Dashboard:** Open `http://localhost:3000`
