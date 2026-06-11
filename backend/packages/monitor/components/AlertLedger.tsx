'use client';

import React from 'react';
import type { ActiveAlert } from '../app/page';

interface AlertLedgerProps {
  activeAlert: ActiveAlert | null;
  onDismiss: () => void;
}

export default function AlertLedger({ activeAlert, onDismiss }: AlertLedgerProps) {
  if (!activeAlert) {
    return (
      <div style={{ padding: '16px 16px' }}>
        <span className="section-label" style={{ display: 'block', marginBottom: 10 }}>Alert Status</span>
        <div style={{
          background: 'var(--safe-dim)',
          border: '1px solid rgba(0, 200, 150, 0.2)',
          borderRadius: 2,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span className="live-dot" style={{ background: 'var(--safe)' }} />
          <span style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: 13,
            color: 'var(--safe)',
            fontStyle: 'italic',
          }}>
            All systems nominal
          </span>
        </div>
      </div>
    );
  }

  const elapsed = Math.floor((Date.now() - activeAlert.detectedAt) / 1000);

  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span className="section-label" style={{ color: 'var(--critical)' }}>⚠ Active Alert</span>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 12, padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>
      <div style={{
        background: 'var(--critical-dim)',
        border: '1px solid rgba(229, 62, 62, 0.3)',
        borderRadius: 2,
        padding: '12px 14px',
        animation: 'alertGlowPulse 2s ease-in-out infinite',
      }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--critical)', marginBottom: 4 }}>
          {activeAlert.type}
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>
          {activeAlert.protocol}
        </div>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
          ${activeAlert.estimatedUSD.toLocaleString()} USD · {elapsed}s ago
        </div>
        <div style={{ borderTop: '1px solid rgba(229, 62, 62, 0.2)', paddingTop: 8 }}>
          {activeAlert.actionsTaken.map((action, i) => (
            <div key={i} style={{
              fontFamily: 'Inter, sans-serif', fontSize: 10,
              color: 'var(--safe)', marginBottom: 2,
            }}>
              ✓ {action}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
