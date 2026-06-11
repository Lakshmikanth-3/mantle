'use client';

import React, { useMemo } from 'react';
import type { AgentStats } from '../app/page';

interface AgentStatusProps {
  stats: AgentStats;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function StatCell({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="data-cell">
      <span className="data-cell-label">{label}</span>
      <span className="data-cell-value" style={color ? { color } : undefined}>
        {typeof value === 'number' && value > 1000
          ? value.toLocaleString()
          : value}
      </span>
    </div>
  );
}

export default function AgentStatus({ stats }: AgentStatusProps) {
  const reputationColor = stats.reputationScore >= 900 ? 'var(--safe)' : stats.reputationScore >= 700 ? 'var(--warning)' : 'var(--critical)';

  return (
    <div style={{ padding: '0 0 0 0' }}>
      {/* Identity header */}
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, rgba(0,200,150,0.06) 0%, transparent 60%)',
      }}>
        <div style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '0.12em',
          background: 'linear-gradient(90deg, #00C896, rgba(0,200,150,0.6))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 4,
        }}>
          SENTINEL
        </div>
        <div style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 9,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          marginBottom: 8,
        }}>
          AGENT #021 · ERC-8004 VERIFIED
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" />
          <span style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 9,
            color: 'var(--safe)',
            letterSpacing: '0.1em',
          }}>
            AUTONOMOUS OPERATION
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="data-grid">
        <StatCell label="Uptime" value={formatUptime(stats.uptime)} />
        <StatCell label="Reputation" value={`${(stats.reputationScore / 100).toFixed(2)}`} color={reputationColor} />
        <StatCell label="Checks Run" value={stats.checksRun} color="var(--text-primary)" />
        <StatCell label="Anomalies" value={stats.anomaliesDetected} color={stats.anomaliesDetected > 10 ? 'var(--warning)' : 'var(--text-primary)'} />
        <StatCell label="Alerts Fired" value={stats.alertsFired} color={stats.alertsFired > 0 ? 'var(--critical)' : 'var(--safe)'} />
        <StatCell label="Proposals" value={stats.proposalsDrafted} color="var(--safe)" />
      </div>
    </div>
  );
}
