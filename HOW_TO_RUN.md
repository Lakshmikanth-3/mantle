# SENTINEL — How to Run & Test

## 🗂 Project Structure

```
c:\hack\mantle\
  ├── backend/          ← Multi-service Node.js monorepo (7 services)
  │   ├── packages/
  │   │   ├── watcher/       ← Block listener + invariant checker (port: none — runs in process)
  │   │   ├── alertmanager/  ← WS server + Telegram (port: 3001)
  │   │   ├── oracle/        ← x402 REST risk oracle (port: 3002)
  │   │   ├── indexer/       ← REST API + Postgres (port: 3003)
  │   │   ├── governance/    ← Gemini LLM → MIP draft → Forum
  │   │   ├── prover/        ← ZK proof generation
  │   │   └── monitor/       ← Real-time threat map UI (port: 3005)
  │   └── .env               ← ⚠️ ALL SECRETS GO HERE
  └── frontend/         ← Marketing landing page (port: 3000)
```

---

## ⚠️ Before You Run — Required Credentials

Open `backend/.env` and fill in these values:

| Variable | Value needed | How to get |
|---|---|---|
| `SENTINEL_PRIVATE_KEY` | `0x[64 hex chars]` | Create wallet on Mantle Sepolia, fund with test MNT from faucet.mantle.xyz |
| `SENTINEL_MANTLE_WALLET` | `0x[address]` | The public address of the key above |
| `GOOGLE_GEMINI_API_KEY` | `AIza...` | https://aistudio.google.com/app/apikey (free) |
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABC...` | @BotFather → /newbot |
| `TELEGRAM_ALERT_CHANNEL` | `@sentinel_mantle_alerts` | Create public Telegram channel, add bot as admin |
| `NANSEN_API_KEY` | `nansen_...` | DoraHacks hackathon resources (apply for $7k credits) |
| `ELFA_API_KEY` | `elfa_...` | DoraHacks hackathon resources (apply for $36k credits) |
| `DISCOURSE_API_KEY` | `[key]` | forum.mantle.xyz → preferences/api → Generate Key |
| `RSETH_MANTLE_OFT` | `0x[address]` | Official Kelp DAO docs for Mantle OFT address |

**Note:** If credentials are not set, services fail gracefully — the system still runs but with reduced functionality. The watcher and alertmanager will run without external APIs.

---

## 🚀 Running the Project

### Terminal 1 — All Backend Services

```powershell
cd c:\hack\mantle\backend
pnpm dev
```

This starts **7 services concurrently** with color-coded output:
- `watcher` (cyan) — block listener
- `alertmanager` (yellow) — WebSocket + Telegram
- `governance` (magenta) — MIP drafter
- `oracle` (blue) — x402 REST server
- `prover` (green) — ZK proof batches
- `indexer` (white) — REST API + DB
- `monitor` (red) — threat map UI

### Terminal 2 — Frontend Landing Page

```powershell
cd c:\hack\mantle\frontend
pnpm dev
# Opens at: http://localhost:3000
```

---

## 🌐 URLs

| Service | URL | Description |
|---|---|---|
| **Landing page** | http://localhost:3000 | Marketing + narrative |
| **Oracle health** | http://localhost:3002/health | x402 server status |
| **Risk preview (free)** | http://localhost:3002/api/risk/0x.../free | No payment needed |
| **Indexer REST** | http://localhost:3003/api/stats | Aggregate statistics |
| **Indexer alerts** | http://localhost:3003/api/alerts | Alert history |
| **Indexer protocols** | http://localhost:3003/api/protocols | Protocol risk scores |
| **🔴 The Monitor** | http://localhost:3005 | **Real-time SOC threat map** |
| **WebSocket** | ws://localhost:3001 | Live event stream |

---

## 🧪 Testing the System

### Test 1 — Trigger a Fake Invariant Violation (Demo Mode)

```powershell
# This sends a test tx to MockOFT contract that fires an unmatched mint
Invoke-WebRequest -Method POST http://localhost:3001/trigger-exploit
```

**Expected result:**
1. `watcher` logs an OFTReceived event
2. After 10 seconds, `reconciler` sees no matching burn → fires INVARIANT_VIOLATION
3. `alertmanager` routes it: Telegram message sent, WS broadcast sent
4. **Monitor** at http://localhost:3005 shows red alert overlay
5. If `estimatedUSD > $5M`: governance draft begins (watch logs)

### Test 2 — Query Oracle API

```powershell
# Free preview (no payment)
Invoke-WebRequest -Uri http://localhost:3002/api/risk/0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3/free
```

### Test 3 — Check Indexer Stats

```powershell
Invoke-WebRequest -Uri http://localhost:3003/api/stats
```

### Test 4 — Insert Manual Alert

```powershell
$body = @{
  protocol = "rsETH (Kelp DAO)"
  protocolAddress = "0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3"
  severity = "CRITICAL"
  estimatedUSD = 5000000
  reason = "RELEASE_WITHOUT_BURN"
  blockNumber = "1234567"
} | ConvertTo-Json

Invoke-WebRequest -Method POST -Uri http://localhost:3003/api/alerts -ContentType "application/json" -Body $body
```

---

## 🗄️ Database Setup (Postgres)

The indexer requires Postgres. Options:

**Option A — Docker (recommended)**
```powershell
docker-compose -f backend/docker-compose.yml up -d
```

**Option B — Local Postgres**
Create DB: `sentinel` with user `sentinel` / password `sentinel`
```sql
CREATE DATABASE sentinel;
CREATE USER sentinel WITH PASSWORD 'sentinel';
GRANT ALL PRIVILEGES ON DATABASE sentinel TO sentinel;
```

Then run Prisma migrations:
```powershell
cd backend/packages/indexer
npx prisma migrate dev
```

---

## 🔑 Mantle Sepolia Testnet

1. **Get test MNT:** https://faucet.mantle.xyz
2. **Explorer:** https://sepolia.mantlescan.xyz
3. **Chain ID:** 5003
4. **RPC:** https://rpc.sepolia.mantle.xyz

---

## 📡 WebSocket Event Types

The Monitor at port 3005 connects to `ws://localhost:3001` and receives:

| Event type | Trigger | Monitor effect |
|---|---|---|
| `CONNECTION_ESTABLISHED` | On connect | Connection indicator goes green |
| `ALERT` | Invariant violation detected | Red overlay, node pulses critical |
| `INVARIANT_OK` | Each reconciled mint | Green dot in event stream |
| `GOVERNANCE_DRAFT` | MIP draft complete | Slide-in governance panel |
| `STAGING_SIGNAL` | TC-funded wallet detected | Amber alert in event stream |
| `SENTIMENT_DROP` | Elfa sentiment drop | Informational event |
| `PROTOCOL_SCORE_UPDATE` | Risk score recalculated | Node color changes |

---

## 🔁 Production Run Order

For a clean boot sequence:

```
1. Start Postgres (docker-compose)
2. cd backend && pnpm install (if not done)
3. cd backend && pnpm dev         ← all 7 services
4. cd frontend && pnpm dev        ← landing page
5. Open http://localhost:3005     ← The Monitor
6. Open http://localhost:3000     ← Landing page
```

---

## 🐛 Common Issues

| Symptom | Fix |
|---|---|
| Monitor shows "Reconnecting..." | Backend services not running — start `pnpm dev` in `backend/` |
| "DB Error" in logs | Postgres not running — start Docker or local Postgres |
| Governance draft fails | `GOOGLE_GEMINI_API_KEY` not set in `backend/.env` |
| Telegram not sending | `TELEGRAM_BOT_TOKEN` not set, or bot not admin of channel |
| rsETH watcher idle | `RSETH_MANTLE_OFT` address is `0x` — add real address from Kelp DAO docs |
| ZK proof fails | Circuits not compiled — run `cd backend/packages/prover && pnpm build:circuit` |
