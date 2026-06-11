'use client';

import React from 'react';
import type { AgentStats } from '../app/page';

interface OracleEconomyProps {
  stats: AgentStats;
}

function EconomyRow({ label, value, unit, color }: { label: string; value: string | number; unit: string; color: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '9px 16px',
      borderBottom: '1px solid rgba(30, 37, 48, 0.7)',
    }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 500, color }}>{value}</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>{unit}</span>
      </div>
    </div>
  );
}

export default function OracleEconomy({ stats }: OracleEconomyProps) {
  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span className="section-label">Risk Oracle Economy</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'DM Mono, monospace',
          fontSize: 8,
          color: 'var(--safe)',
          letterSpacing: '0.1em',
          background: 'var(--safe-dim)',
          padding: '2px 6px',
          borderRadius: 2,
        }}>
          x402
        </span>
      </div>

      <EconomyRow
        label="Risk queries served"
        value={stats.riskQueriesServed.toLocaleString()}
        unit="queries"
        color="var(--text-primary)"
      />
      <EconomyRow
        label="Revenue earned"
        value={`$${stats.revenueEarned.toFixed(2)}`}
        unit="USDC"
        color="var(--safe)"
      />
      <EconomyRow
        label="Gas reservoir"
        value={stats.gasReservoir.toFixed(2)}
        unit="MNT"
        color={stats.gasReservoir < 1 ? 'var(--critical)' : 'var(--safe)'}
      />

      {/* Self-funded tagline */}
      <div style={{
        padding: '10px 16px',
        fontFamily: 'Instrument Serif, serif',
        fontSize: 12,
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        borderBottom: '1px solid rgba(30, 37, 48, 0.7)',
      }}>
        Self-funded since deployment
      </div>
    </div>
  );
}
