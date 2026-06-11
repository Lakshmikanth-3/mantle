'use client';

import React from 'react';
import AgentStatus from './AgentStatus';
import OracleEconomy from './OracleEconomy';
import AlertLedger from './AlertLedger';
import type { AgentStats, ActiveAlert } from '../app/page';

interface StatusPanelProps {
  stats: AgentStats;
  activeAlert: ActiveAlert | null;
  onDismissAlert: () => void;
}

export default function StatusPanel({ stats, activeAlert, onDismissAlert }: StatusPanelProps) {
  return (
    <div className="panel" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflowY: 'auto',
      borderLeft: '1px solid var(--border)',
    }}>
      <AgentStatus stats={stats} />
      <div className="separator" />
      <AlertLedger activeAlert={activeAlert} onDismiss={onDismissAlert} />
      <div className="separator" />
      <OracleEconomy stats={stats} />

      {/* ERC-8004 Footer */}
      <div style={{
        marginTop: 'auto',
        padding: '14px 16px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 8,
          color: 'var(--text-muted)',
          letterSpacing: '0.1em',
          lineHeight: 1.7,
        }}>
          SENTINEL AGENT #021<br />
          ERC-8004 · MANTLE NETWORK<br />
          <span style={{ color: 'var(--safe)', opacity: 0.7 }}>AUTONOMOUS ∞</span>
        </div>
      </div>
    </div>
  );
}
