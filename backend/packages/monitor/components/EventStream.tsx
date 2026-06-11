'use client';

import React, { useRef, useEffect } from 'react';
import type { LiveEvent } from '../app/page';

interface EventStreamProps {
  events: LiveEvent[];
  isAlertActive: boolean;
  connected?: boolean;
}

function EventIcon({ type }: { type: LiveEvent['type'] }) {
  if (type === 'ALERT' || type === 'STAGING') {
    return <span className="alert-dot" />;
  }
  if (type === 'ANOMALY' || type === 'SENTIMENT') {
    return (
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--warning)',
        boxShadow: '0 0 4px var(--warning-glow)',
        display: 'inline-block', flexShrink: 0,
      }} />
    );
  }
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: 'var(--safe)',
      boxShadow: '0 0 3px var(--safe-glow)',
      display: 'inline-block', flexShrink: 0, opacity: 0.8,
    }} />
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

function eventColor(type: LiveEvent['type']): string {
  if (type === 'ALERT' || type === 'STAGING') return 'var(--critical)';
  if (type === 'ANOMALY' || type === 'SENTIMENT') return 'var(--warning)';
  if (type === 'QUERY') return '#6B7FD7';
  if (type === 'PROPOSAL') return '#9B59B6';
  return 'var(--text-muted)';
}

export default function EventStream({ events, isAlertActive, connected = false }: EventStreamProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Freeze scroll when alert is active
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.style.overflow = isAlertActive ? 'hidden' : 'auto';
  }, [isAlertActive]);

  return (
    <div className="panel" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      borderRight: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
        background: connected
          ? 'linear-gradient(180deg, rgba(0,200,150,0.05) 0%, transparent 100%)'
          : 'linear-gradient(180deg, rgba(229,62,62,0.04) 0%, transparent 100%)',
      }}>
        <span className={connected ? 'live-dot' : 'alert-dot'} style={!connected ? {
          background: 'var(--warning)',
          boxShadow: '0 0 6px rgba(245,166,35,0.5)',
        } : undefined} />
        <span className="section-label" style={{ color: connected ? 'var(--safe)' : 'var(--warning)', letterSpacing: '0.2em' }}>
          {connected ? 'Live Feed' : 'Reconnecting...'}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'DM Mono, monospace',
          fontSize: 10,
          color: 'var(--text-muted)',
        }}>
          {events.length} events
        </span>
      </div>

      {/* Event list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {events.map((event, i) => (
          <div
            key={event.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '7px 14px',
              borderBottom: '1px solid rgba(30, 37, 48, 0.5)',
              animation: i === 0 ? 'streamSlide 0.35s ease' : undefined,
              background: event.type === 'ALERT' || event.type === 'STAGING'
                ? 'rgba(229, 62, 62, 0.08)'
                : 'transparent',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{ paddingTop: 3, flexShrink: 0 }}>
              <EventIcon type={event.type} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: 9,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                marginBottom: 2,
              }}>
                {formatTime(event.timestamp)} UTC
              </div>
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                color: eventColor(event.type),
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}>
                {event.message}
              </div>
            </div>
          </div>
        ))}

        {events.length === 0 && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            fontFamily: 'Instrument Serif, serif',
            fontSize: 14,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            Awaiting first block...
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          MANTLE L2
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>
          ~2s blocks
        </span>
      </div>
    </div>
  );
}
