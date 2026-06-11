'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ThreatMap from '../../../components/ThreatMap/ThreatMap';
import EventStream from '../../../components/EventStream';
import AlertOverlay from '../../../components/AlertOverlay';
import GovernanceDraftPanel from '../../../components/GovernanceDraftPanel';
import type { ProtocolState, LiveEvent, ActiveAlert } from '../../page';

// ── Replay timeline ───────────────────────────────────────────────────────────

const REPLAY_START_UTC = new Date('2026-04-18T17:20:00Z').getTime();
const SENTINEL_DETECTION_UTC = new Date('2026-04-18T17:35:37Z').getTime();
const KELP_PAUSE_UTC = new Date('2026-04-18T18:21:00Z').getTime();
const SECOND_THEFT_ATTEMPT_UTC = new Date('2026-04-18T18:26:00Z').getTime();
const REPLAY_END_UTC = new Date('2026-04-18T18:40:00Z').getTime();
const TOTAL_REPLAY_DURATION = REPLAY_END_UTC - REPLAY_START_UTC;

interface ReplayEvent {
  realtime: number;       // actual UTC timestamp of the event
  type: LiveEvent['type'];
  message: string;
  triggerAlert?: ActiveAlert;
  triggerGovernanceDraft?: boolean;
  updateRiskScore?: { protocolId: string; score: number; band: ProtocolState['band'] };
}

const REPLAY_TIMELINE: ReplayEvent[] = [
  {
    realtime: new Date('2026-04-18T17:20:00Z').getTime(),
    type: 'PASS', message: 'rsETH — invariant OK (OFTReceived matched OFTSent)',
  },
  {
    realtime: new Date('2026-04-18T17:22:10Z').getTime(),
    type: 'SIGNAL', message: 'Nansen: 1 TC-funded wallet (age: 3h) interacting with rsETH OFT Adapter',
  },
  {
    realtime: new Date('2026-04-18T17:26:00Z').getTime(),
    type: 'STAGING', message: '⚠ PRE-ATTACK STAGING: 2 TC-funded wallets, $4,200 gas staged — rsETH OFT Adapter',
    updateRiskScore: { protocolId: 'rseth', score: 42, band: 'ELEVATED' },
  },
  {
    realtime: new Date('2026-04-18T17:28:00Z').getTime(),
    type: 'ANOMALY', message: 'rsETH — Elfa sentiment anomaly: -18.4% vs 4h baseline',
    updateRiskScore: { protocolId: 'rseth', score: 58, band: 'HIGH' },
  },
  {
    realtime: new Date('2026-04-18T17:30:00Z').getTime(),
    type: 'ANOMALY', message: 'rsETH — OFTReceived on Mantle without matching OFTSent (delta: 0.022 ETH) — within reconciliation window',
  },
  {
    realtime: SENTINEL_DETECTION_UTC,
    type: 'ALERT',
    message: '🚨 CRITICAL: rsETH — RELEASE_WITHOUT_BURN — 116,500 rsETH — $292M — INVARIANT VIOLATED',
    updateRiskScore: { protocolId: 'rseth', score: 97, band: 'CRITICAL' },
    triggerAlert: {
      id: 'kelp-2026-001',
      protocol: 'rsETH (Kelp DAO LayerZero Bridge)',
      protocolAddress: '0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3',
      type: 'RELEASE_WITHOUT_BURN',
      detectedAt: SENTINEL_DETECTION_UTC,
      deltaAmount: '116,500 rsETH',
      estimatedUSD: 292_000_000,
      mantleExposureUSD: 12_400_000,
      actionsTaken: [
        'Telegram alert dispatched',
        'ERC-8004 risk event logged',
        'ZK batch proof submitted',
        'Governance draft initiated',
      ],
      zkProofHash: '0x7a3b9f2e1c8d4a6b0e5f3c2d9a8b7c6e5d4f3a2b',
      governanceDraftInProgress: true,
    },
  },
  {
    realtime: new Date('2026-04-18T17:35:38Z').getTime(),
    type: 'SIGNAL', message: '✓ Telegram alert dispatched to @sentinel_mantle_alerts',
  },
  {
    realtime: new Date('2026-04-18T17:36:00Z').getTime(),
    type: 'SIGNAL', message: '✓ ZK batch proof #847 submitted to ERC-8004 Validation Registry',
  },
  {
    realtime: new Date('2026-04-18T17:43:19Z').getTime(),
    type: 'PROPOSAL', message: '📋 MIP draft posted to Mantle Forum (7m 42s after detection)',
    triggerGovernanceDraft: true,
  },
  {
    realtime: KELP_PAUSE_UTC,
    type: 'SIGNAL', message: '— KELP DAO: Contracts paused manually (45m 23s after SENTINEL detection)',
  },
  {
    realtime: SECOND_THEFT_ATTEMPT_UTC,
    type: 'SIGNAL', message: '✓ Second theft attempt ($95M) blocked — contracts already paused',
  },
];

// ── Protocol initial state ────────────────────────────────────────────────────

const INITIAL_PROTOCOLS: ProtocolState[] = [
  { id: 'rseth', name: 'rsETH (Kelp DAO)', address: '0x85d456b2dff1fd8245387c0bfb64dfb700e98ef3', riskScore: 18, band: 'LOW', exposure: 292_000_000, invariantStatus: 'PASSING', trend: 'stable' },
  { id: 'meth', name: 'mETH Bridge', address: '0x0000000000000000000000000000000000000002', riskScore: 12, band: 'LOW', exposure: 180_000_000, invariantStatus: 'PASSING', trend: 'stable' },
  { id: 'superportal', name: 'Super Portal', address: '0x0000000000000000000000000000000000000003', riskScore: 14, band: 'LOW', exposure: 200_000_000, invariantStatus: 'PASSING', trend: 'stable' },
  { id: 'aave', name: 'Aave V3 Mantle', address: '0x0000000000000000000000000000000000000006', riskScore: 16, band: 'LOW', exposure: 85_000_000, invariantStatus: 'PASSING', trend: 'stable' },
  { id: 'usdy', name: 'USDY (Ondo)', address: '0x0000000000000000000000000000000000000005', riskScore: 10, band: 'LOW', exposure: 45_000_000, invariantStatus: 'PASSING', trend: 'stable' },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function ReplayPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(100); // replay speed multiplier
  const [replayTime, setReplayTime] = useState(REPLAY_START_UTC);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [protocols, setProtocols] = useState<ProtocolState[]>(INITIAL_PROTOCOLS);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [governanceDraft, setGovernanceDraft] = useState<any | null>(null);
  const [nextEventIdx, setNextEventIdx] = useState(0);

  const lastRealTime = useRef<number | null>(null);
  const animationRef = useRef<number>();

  const progress = (replayTime - REPLAY_START_UTC) / TOTAL_REPLAY_DURATION;
  const sentinelProgress = (SENTINEL_DETECTION_UTC - REPLAY_START_UTC) / TOTAL_REPLAY_DURATION;
  const kelpProgress = (KELP_PAUSE_UTC - REPLAY_START_UTC) / TOTAL_REPLAY_DURATION;

  const tick = useCallback((timestamp: number) => {
    if (!lastRealTime.current) lastRealTime.current = timestamp;
    const realDelta = timestamp - lastRealTime.current;
    lastRealTime.current = timestamp;
    const replayDelta = realDelta * speed;

    setReplayTime(prev => {
      const next = prev + replayDelta;
      if (next >= REPLAY_END_UTC) {
        setIsPlaying(false);
        return REPLAY_END_UTC;
      }
      return next;
    });

    animationRef.current = requestAnimationFrame(tick);
  }, [speed]);

  // Advance replay
  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(tick);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastRealTime.current = null;
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, tick]);

  // Fire events as replay time advances
  useEffect(() => {
    const toFire = REPLAY_TIMELINE.filter((e, i) => i >= nextEventIdx && e.realtime <= replayTime);
    if (toFire.length === 0) return;

    setNextEventIdx(prev => prev + toFire.length);

    for (const e of toFire) {
      setEvents(prev => [{
        id: `replay-${e.realtime}`,
        timestamp: e.realtime,
        protocol: 'rsETH',
        type: e.type,
        message: e.message,
      }, ...prev]);

      if (e.updateRiskScore) {
        setProtocols(prev => prev.map(p =>
          p.id === e.updateRiskScore!.protocolId
            ? { ...p, riskScore: e.updateRiskScore!.score, band: e.updateRiskScore!.band }
            : p
        ));
      }
      if (e.triggerAlert) setActiveAlert(e.triggerAlert);
      if (e.triggerGovernanceDraft) {
        setGovernanceDraft({
          title: '[SENTINEL AUTO-DRAFT] MIP-35: Strategic Credit Facility for Kelp DAO (rsETH DVN Exploit)',
          body: 'Auto-generated by SENTINEL Agent #021 (ERC-8004 Verified)',
          forumUrl: 'https://forum.mantle.xyz/t/discussion-mip-35-kelp-dao-rseth/9501',
          generatedInMs: 7 * 60 * 1000 + 42 * 1000,
          zkProofHash: '0x7a3b9f2e1c8d4a6b0e5f3c2d9a8b7c6e5d4f3a2b',
        });
      }
    }
  }, [replayTime, nextEventIdx]);

  const reset = () => {
    setIsPlaying(false);
    setReplayTime(REPLAY_START_UTC);
    setEvents([]);
    setProtocols(INITIAL_PROTOCOLS);
    setActiveAlert(null);
    setGovernanceDraft(null);
    setNextEventIdx(0);
    lastRealTime.current = null;
  };

  const formatReplayTime = (ts: number) =>
    new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Replay header */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 42,
        background: 'rgba(8, 10, 12, 0.95)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(8px)',
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
      }}>
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: 9, fontWeight: 500,
          color: 'var(--warning)', letterSpacing: '0.2em', textTransform: 'uppercase',
        }}>
          ▶ Kelp DAO Exploit Replay — April 18, 2026
        </span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>
          {formatReplayTime(replayTime)}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {[10, 100, 1000].map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`btn ${speed === s ? 'btn-primary' : ''}`} style={{ fontSize: 9, padding: '4px 10px' }}>
              {s}×
            </button>
          ))}
          <button onClick={() => { if (isPlaying) setIsPlaying(false); else { if (replayTime >= REPLAY_END_UTC) reset(); setIsPlaying(true); }}} className="btn btn-primary" style={{ fontSize: 9, padding: '4px 12px' }}>
            {isPlaying ? '⏸ Pause' : replayTime >= REPLAY_END_UTC ? '↺ Replay' : '▶ Play'}
          </button>
          <button onClick={reset} className="btn" style={{ fontSize: 9, padding: '4px 10px' }}>Reset</button>
        </div>
      </div>

      {/* Main three-zone (offset top for header) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '25% 50% 25%',
        height: 'calc(100vh - 42px - 80px)',
        marginTop: 42,
      }}>
        <EventStream events={events} isAlertActive={!!activeAlert} />
        <ThreatMap protocols={protocols} onNodeClick={() => {}} alertProtocol={activeAlert?.protocol ?? null} />
        <div style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)', padding: 20 }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 12 }}>
            REPLAY STATUS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'SENTINEL detects', time: 'T+15m 37s', color: 'var(--critical)' },
              { label: 'Telegram alert', time: 'T+15m 38s', color: 'var(--safe)' },
              { label: 'ZK proof submitted', time: 'T+16m 00s', color: 'var(--safe)' },
              { label: 'MIP draft posted', time: 'T+23m 19s', color: 'var(--safe)' },
              { label: 'Kelp DAO pauses', time: 'T+61m 00s', color: 'var(--text-muted)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: item.color }}>{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        height: 80,
        background: 'rgba(8, 10, 12, 0.97)',
        borderTop: '1px solid var(--border)',
        padding: '14px 24px',
        zIndex: 800,
      }}>
        <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, marginBottom: 8 }}>
          {/* Progress */}
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${Math.min(100, progress * 100)}%`,
            background: 'linear-gradient(90deg, var(--safe), var(--warning), var(--critical))',
            borderRadius: 3, transition: 'width 0.1s linear',
          }} />
          {/* SENTINEL detection marker */}
          <div style={{
            position: 'absolute', left: `${sentinelProgress * 100}%`,
            top: -4, transform: 'translateX(-50%)',
            width: 2, height: 14, background: 'var(--critical)',
            borderRadius: 1,
          }}>
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--critical)',
              whiteSpace: 'nowrap', letterSpacing: '0.05em',
            }}>
              SENTINEL
            </div>
          </div>
          {/* Kelp pause marker */}
          <div style={{
            position: 'absolute', left: `${kelpProgress * 100}%`,
            top: -4, transform: 'translateX(-50%)',
            width: 2, height: 14, background: 'var(--text-muted)',
            borderRadius: 1,
          }}>
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}>
              KELP
            </div>
          </div>
        </div>

        {/* Gap label */}
        <div style={{
          position: 'absolute',
          left: `${(sentinelProgress + (kelpProgress - sentinelProgress) / 2) * 100}%`,
          bottom: 24,
          transform: 'translateX(-50%)',
          fontFamily: 'Instrument Serif, serif',
          fontSize: 11,
          fontStyle: 'italic',
          color: 'var(--warning)',
          whiteSpace: 'nowrap',
        }}>
          45 minutes, 23 seconds · $95M saved from second theft attempt
        </div>

        {/* Time labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 30 }}>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--text-muted)' }}>17:20 UTC</span>
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, color: 'var(--text-muted)' }}>18:40 UTC</span>
        </div>
      </div>

      {/* Alert overlay */}
      {activeAlert && (
        <AlertOverlay alert={activeAlert} onDismiss={() => setActiveAlert(null)} onGovernanceDraft={() => {}} />
      )}

      {/* Governance panel */}
      {governanceDraft && (
        <GovernanceDraftPanel draft={governanceDraft} onClose={() => setGovernanceDraft(null)} />
      )}
    </div>
  );
}
