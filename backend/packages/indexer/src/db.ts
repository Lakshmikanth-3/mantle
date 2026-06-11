import { Pool } from 'pg';
import 'dotenv/config';

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || 'postgresql://sentinel:sentinel@localhost:5432/sentinel',
});

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Alert {
  id: string;
  protocol: string;
  protocolAddress: string;
  severity: 'MINOR' | 'HIGH' | 'CRITICAL';
  estimatedUSD: number;
  reason: string;
  txHash?: string;
  blockNumber: string;
  createdAt: Date;
  zkProofHash?: string;
}

export interface ProtocolScore {
  protocolAddress: string;
  name: string;
  score: number;
  band: string;
  exposureUSD: number;
  updatedAt: Date;
}

// ── Schema initialization ─────────────────────────────────────────────────────

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id              TEXT PRIMARY KEY,
      timestamp       BIGINT NOT NULL,
      protocol        TEXT NOT NULL,
      protocol_address TEXT NOT NULL,
      type            TEXT NOT NULL,
      severity        TEXT NOT NULL,
      delta_amount    TEXT,
      estimated_usd   NUMERIC,
      mantle_exposure_usd NUMERIC,
      signal_sources  TEXT[],
      actions_taken   TEXT[],
      zk_proof_hash   TEXT,
      forum_url       TEXT,
      tx_hash         TEXT,
      block_number    TEXT,
      reason          TEXT,
      outcome         TEXT DEFAULT 'PENDING',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invariant_checks (
      id              SERIAL PRIMARY KEY,
      protocol        TEXT NOT NULL,
      protocol_address TEXT NOT NULL,
      block_number    BIGINT,
      delta           TEXT,
      status          TEXT NOT NULL,
      zk_proof_hash   TEXT,
      timestamp       BIGINT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS risk_queries (
      id              SERIAL PRIMARY KEY,
      protocol_address TEXT NOT NULL,
      payer           TEXT,
      fee_usdc        NUMERIC,
      timestamp       BIGINT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS protocol_scores (
      protocol_address TEXT PRIMARY KEY,
      name            TEXT NOT NULL DEFAULT '',
      score           NUMERIC NOT NULL,
      band            TEXT NOT NULL,
      exposure_usd    NUMERIC DEFAULT 0,
      components      JSONB,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS protocol_risk_scores (
      protocol_address TEXT PRIMARY KEY,
      score           NUMERIC NOT NULL,
      band            TEXT NOT NULL,
      components      JSONB,
      updated_at      BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS alerts_protocol_idx ON alerts(protocol);
    CREATE INDEX IF NOT EXISTS alerts_timestamp_idx ON alerts(timestamp DESC);
    CREATE INDEX IF NOT EXISTS invariant_checks_protocol_idx ON invariant_checks(protocol);
  `);

  console.log('[db] Schema initialized');
}

// ── Legacy alias kept for backwards compatibility ─────────────────────────────
export const initDb = initSchema;

// ── Alert queries ─────────────────────────────────────────────────────────────

/**
 * Get paginated alerts, newest first.
 */
export async function getAlerts(limit = 50, offset = 0): Promise<Alert[]> {
  try {
    const result = await pool.query<{
      id: string;
      protocol: string;
      protocol_address: string;
      severity: string;
      estimated_usd: string | null;
      reason: string | null;
      tx_hash: string | null;
      block_number: string | null;
      created_at: Date;
      zk_proof_hash: string | null;
    }>(
      `SELECT id, protocol, protocol_address, severity, estimated_usd, reason,
              tx_hash, block_number, created_at, zk_proof_hash
       FROM alerts
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map((row) => ({
      id: row.id,
      protocol: row.protocol,
      protocolAddress: row.protocol_address,
      severity: row.severity as Alert['severity'],
      estimatedUSD: row.estimated_usd ? parseFloat(row.estimated_usd) : 0,
      reason: row.reason ?? '',
      txHash: row.tx_hash ?? undefined,
      blockNumber: row.block_number ?? '0',
      createdAt: row.created_at,
      zkProofHash: row.zk_proof_hash ?? undefined,
    }));
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') return [];
    throw err;
  }
}

/**
 * Get a single alert by its ID.
 */
export async function getAlertById(id: string): Promise<Alert | null> {
  const result = await pool.query<{
    id: string;
    protocol: string;
    protocol_address: string;
    severity: string;
    estimated_usd: string | null;
    reason: string | null;
    tx_hash: string | null;
    block_number: string | null;
    created_at: Date;
    zk_proof_hash: string | null;
  }>(
    `SELECT id, protocol, protocol_address, severity, estimated_usd, reason,
            tx_hash, block_number, created_at, zk_proof_hash
     FROM alerts
     WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    protocol: row.protocol,
    protocolAddress: row.protocol_address,
    severity: row.severity as Alert['severity'],
    estimatedUSD: row.estimated_usd ? parseFloat(row.estimated_usd) : 0,
    reason: row.reason ?? '',
    txHash: row.tx_hash ?? undefined,
    blockNumber: row.block_number ?? '0',
    createdAt: row.created_at,
    zkProofHash: row.zk_proof_hash ?? undefined,
  };
}

/**
 * Aggregate statistics for the dashboard.
 */
export async function getStats(): Promise<{
  totalAlerts: number;
  criticalAlerts: number;
  last24h: number;
}> {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();

  try {
    const [totalRes, criticalRes, last24hRes] = await Promise.all([
      pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM alerts'),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM alerts WHERE severity = 'CRITICAL'`
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM alerts WHERE created_at > $1`,
        [cutoff]
      ),
    ]);

    return {
      totalAlerts: parseInt(totalRes.rows[0].count, 10),
      criticalAlerts: parseInt(criticalRes.rows[0].count, 10),
      last24h: parseInt(last24hRes.rows[0].count, 10),
    };
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') {
      console.warn('[db] Postgres not available, returning mock stats');
      return { totalAlerts: 42, criticalAlerts: 3, last24h: 12 };
    }
    throw err;
  }
}

/**
 * Get all protocol risk scores.
 */
export async function getProtocolScores(): Promise<ProtocolScore[]> {
  try {
    const result = await pool.query<{
      protocol_address: string;
      name: string;
      score: string;
      band: string;
      exposure_usd: string;
      updated_at: Date;
    }>(
      `SELECT protocol_address, name, score, band, exposure_usd, updated_at
       FROM protocol_scores
       ORDER BY score DESC`
    );

    return result.rows.map((row) => ({
      protocolAddress: row.protocol_address,
      name: row.name,
      score: parseFloat(row.score),
      band: row.band,
      exposureUSD: parseFloat(row.exposure_usd || '0'),
      updatedAt: row.updated_at,
    }));
  } catch (err: any) {
    if (err.code === 'ECONNREFUSED') return [];
    throw err;
  }
}

/**
 * Upsert a protocol risk score.
 */
export async function upsertProtocolScore(score: ProtocolScore): Promise<void> {
  await pool.query(
    `INSERT INTO protocol_scores (protocol_address, name, score, band, exposure_usd, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (protocol_address) DO UPDATE SET
       name         = EXCLUDED.name,
       score        = EXCLUDED.score,
       band         = EXCLUDED.band,
       exposure_usd = EXCLUDED.exposure_usd,
       updated_at   = EXCLUDED.updated_at`,
    [score.protocolAddress, score.name, score.score, score.band, score.exposureUSD, score.updatedAt]
  );
}

/**
 * Insert a new alert and return its generated ID.
 */
export async function insertAlert(
  alert: Omit<Alert, 'id' | 'createdAt'> & {
    // Legacy fields kept for backwards compatibility with the existing agent code
    id?: string;
    timestamp?: number;
    type?: string;
    deltaAmount?: string;
    mantleExposureUSD?: number;
    signalSources?: string[];
    actionsTaken?: string[];
    forumUrl?: string;
  }
): Promise<string> {
  const id = alert.id ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = alert.timestamp ?? Date.now();

  await pool.query(
    `INSERT INTO alerts (
       id, timestamp, protocol, protocol_address, type, severity,
       estimated_usd, reason, tx_hash, block_number, zk_proof_hash,
       delta_amount, mantle_exposure_usd, signal_sources, actions_taken, forum_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      timestamp,
      alert.protocol,
      alert.protocolAddress,
      alert.type ?? 'UNKNOWN',
      alert.severity,
      alert.estimatedUSD ?? null,
      alert.reason ?? null,
      alert.txHash ?? null,
      alert.blockNumber ?? null,
      alert.zkProofHash ?? null,
      alert.deltaAmount ?? null,
      alert.mantleExposureUSD ?? null,
      alert.signalSources ?? [],
      alert.actionsTaken ?? [],
      alert.forumUrl ?? null,
    ]
  );

  return id;
}

// ── Legacy helpers kept for backwards compatibility ───────────────────────────

/**
 * @deprecated Use upsertProtocolScore(ProtocolScore) instead.
 */
export async function upsertProtocolScoreLegacy(
  protocolAddress: string,
  score: number,
  band: string,
  components: Record<string, number>
): Promise<void> {
  await pool.query(
    `INSERT INTO protocol_risk_scores (protocol_address, score, band, components, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (protocol_address) DO UPDATE SET
       score      = EXCLUDED.score,
       band       = EXCLUDED.band,
       components = EXCLUDED.components,
       updated_at = EXCLUDED.updated_at`,
    [protocolAddress, score, band, JSON.stringify(components), Date.now()]
  );
}

export async function getAlertStats(): Promise<{
  total: number;
  last24h: number;
  checksRun: number;
}> {
  const [totalRes, last24hRes, checksRes] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM alerts'),
    pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM alerts WHERE timestamp > $1',
      [Date.now() - 86_400_000]
    ),
    pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM invariant_checks'),
  ]);
  return {
    total: parseInt(totalRes.rows[0].count, 10),
    last24h: parseInt(last24hRes.rows[0].count, 10),
    checksRun: parseInt(checksRes.rows[0].count, 10),
  };
}
