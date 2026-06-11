'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ThreatMap from '../components/ThreatMap/ThreatMap';
import EventStream from '../components/EventStream';
import StatusPanel from '../components/StatusPanel';
import AlertOverlay from '../components/AlertOverlay';
import GovernanceDraftPanel from '../components/GovernanceDraftPanel';
import { fetchStats, fetchProtocols, fetchAlerts, WS_URL } from '../lib/api';

export interface ProtocolState {
  id: string;
  name: string;
  address: string;
  riskScore: number;
  band: 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  exposure: number; // USD
  invariantStatus: 'PASSING' | 'ANOMALY' | 'VIOLATED';
  trend: 'up' | 'down' | 'stable';
}

export interface LiveEvent {
  id: string;
  timestamp: number;
  protocol: string;
  type: 'PASS' | 'ANOMALY' | 'ALERT' | 'SIGNAL' | 'STAGING' | 'SENTIMENT' | 'QUERY' | 'PROPOSAL';
  message: string;
  data?: Record<string, unknown>;
}

export interface ActiveAlert {
  id: string;
  protocol: string;
  protocolAddress: string;
  type: string;
  detectedAt: number;
  deltaAmount: string;
  estimatedUSD: number;
  mantleExposureUSD: number;
  actionsTaken: string[]; // Legacy
  actions: { label: string; status: 'pending' | 'success'; txHash?: string }[];
  governanceDraftInProgress?: boolean;
  forumUrl?: string;
}

export interface AgentStats {
  uptime: number;        // ms
  reputationScore: number;
  checksRun: number;
  anomaliesDetected: number;
  alertsFired: number;
  proposalsDrafted: number;
  riskQueriesServed: number;
  revenueEarned: number; // USDC
  gasReservoir: number;  // MNT
}

// Protocol ID derived from name for the D3 graph
function protocolId(name: string): string {
  return name.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
}

// Map API protocol to ProtocolState for threat map
function apiProtocolToState(p: any): ProtocolState {
  return {
    id: protocolId(p.name),
    name: p.name,
    address: p.address || p.protocolAddress,
    riskScore: p.riskScore || p.score || 0,
    band: p.band,
    // Use real exposure data from DB
    exposure: p.exposureUSD || p.exposure || 0, 
    invariantStatus: p.invariantStatus || 'PASSING',
    trend: 'stable',
  };
}

const INITIAL_STATS: AgentStats = {
  uptime: 0,
  reputationScore: 924 * 100, // displayed as 9.24 → shown as "924/1000"
  checksRun: 0,
  anomaliesDetected: 0,
  alertsFired: 0,
  proposalsDrafted: 0,
  riskQueriesServed: 0,
  revenueEarned: 0,
  gasReservoir: 0,
};

// ─────────────────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const [protocols, setProtocols] = useState<ProtocolState[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [agentStats, setAgentStats] = useState<AgentStats>(INITIAL_STATS);
  const [governanceDraft, setGovernanceDraft] = useState<{
    title: string;
    body: string;
    forumUrl: string;
    generatedInMs: number;
    zkProofHash: string;
  } | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<string | null>(null);
  const [bootTime] = useState(Date.now());
  const [connected, setConnected] = useState(false);

  // Update uptime every second
  useEffect(() => {
    const t = setInterval(() => {
      setAgentStats(s => ({ ...s, uptime: Date.now() - bootTime }));
    }, 1000);
    return () => clearInterval(t);
  }, [bootTime]);

  // ── Load initial data from Indexer REST API ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        const [stats, apiProtocols, apiAlerts] = await Promise.allSettled([
          fetchStats(),
          fetchProtocols(),
          fetchAlerts(50),
        ]);

        if (cancelled) return;

        if (stats.status === 'fulfilled') {
          setAgentStats(s => ({
            ...s,
            checksRun: stats.value.checksRun ?? 0,
            anomaliesDetected: stats.value.anomaliesDetected ?? 0,
            alertsFired: stats.value.alertsFired ?? 0,
            proposalsDrafted: stats.value.proposalsDrafted ?? 0,
            riskQueriesServed: stats.value.riskQueriesServed ?? 0,
            revenueEarned: stats.value.revenueEarned ?? 0,
            gasReservoir: stats.value.gasReservoir ?? 0,
          }));
        }

        if (apiProtocols.status === 'fulfilled' && apiProtocols.value.length > 0) {
          setProtocols(apiProtocols.value.map(apiProtocolToState));
        }

        if (apiAlerts.status === 'fulfilled') {
          const histEvents: LiveEvent[] = apiAlerts.value.map(a => ({
            id: a.id,
            timestamp: a.timestamp,
            protocol: a.protocol,
            type: a.severity === 'MINOR' ? 'ANOMALY' : 'ALERT',
            message: `${a.reason || 'Invariant violation'} — ${a.protocol} ($${(a.estimatedUSD / 1000).toFixed(1)}k)`,
            data: { zkProofHash: a.zkProofHash },
          }));
          setEvents(histEvents);
        }
      } catch (err) {
        console.warn('[monitor] Initial data load failed (indexer may not be running):', err);
      }
    };

    loadInitial();
    // Refresh stats every 30s
    const refreshInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const stats = await fetchStats();
        setAgentStats(s => ({
          ...s,
          checksRun: stats.checksRun ?? s.checksRun,
          anomaliesDetected: stats.anomaliesDetected ?? s.anomaliesDetected,
          alertsFired: stats.alertsFired ?? s.alertsFired,
          proposalsDrafted: stats.proposalsDrafted ?? s.proposalsDrafted,
          riskQueriesServed: stats.riskQueriesServed ?? s.riskQueriesServed,
          revenueEarned: stats.revenueEarned ?? s.revenueEarned,
          gasReservoir: stats.gasReservoir ?? s.gasReservoir,
        }));
      } catch { /* non-fatal */ }
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
    };
  }, []);

  // ── WebSocket connection — real-time event stream ─────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          setConnected(true);
          console.log('[monitor] WebSocket connected to SENTINEL backend');
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            handleWsMessage(data);
          } catch (e) {
            console.error('[monitor] Failed to parse WS message', e);
          }
        };

        ws.onerror = () => {
          setConnected(false);
          console.warn('[monitor] WebSocket error — backend may not be running');
        };

        ws.onclose = () => {
          setConnected(false);
          // Auto-reconnect after 5s
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch (err) {
        console.error('[monitor] WebSocket connection failed:', err);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      ws?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWsMessage = useCallback((data: { type: string; payload: any }) => {
    switch (data.type) {

      case 'CONNECTION_ESTABLISHED':
        setConnected(true);
        break;

      case 'ALERT': {
        const payload = data.payload;
        // Transform legacy payload if necessary
        const alert: ActiveAlert = {
          ...payload,
          actions: payload.actions || payload.actionsTaken?.map((a: string) => ({ label: a, status: 'success' })) || []
        };
        setActiveAlert(alert);
        setAgentStats(s => ({
          ...s,
          alertsFired: s.alertsFired + 1,
          anomaliesDetected: s.anomaliesDetected + 1,
        }));
        // Update the affected protocol node to CRITICAL band
        setProtocols(prev =>
          prev.map(p =>
            p.name === alert.protocol || p.address === alert.protocolAddress
              ? { ...p, riskScore: 95, band: 'CRITICAL', invariantStatus: 'VIOLATED' }
              : p
          )
        );
        addEvent({
          protocol: alert.protocol,
          type: 'ALERT',
          message: `⚠ INVARIANT VIOLATION — ${alert.protocol} | $${(alert.estimatedUSD / 1_000_000).toFixed(2)}M unreconciled`,
          data: { zkProofHash: alert.zkProofHash },
        });
        break;
      }

      case 'ACTION_COMPLETE': {
        const { label, txHash } = data.payload;
        setActiveAlert(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            actions: prev.actions.map(a => 
              a.label === label || a.label.includes(label) 
                ? { ...a, status: 'success', txHash } 
                : a
            )
          };
        });
        break;
      }

      case 'INVARIANT_OK': {
        const ok = data.payload;
        setAgentStats(s => ({ ...s, checksRun: s.checksRun + 1 }));
        addEvent({
          protocol: ok.protocol || 'System',
          type: 'PASS',
          message: `● ${ok.protocol || 'Bridge'} — invariant OK (delta: ${ok.delta ?? '0'})`,
        });
        break;
      }

      case 'GOVERNANCE_DRAFT': {
        setGovernanceDraft(data.payload);
        setAgentStats(s => ({ ...s, proposalsDrafted: s.proposalsDrafted + 1 }));
        addEvent({
          protocol: data.payload.protocol || 'Governance',
          type: 'PROPOSAL',
          message: `📋 Governance draft posted to Mantle Forum`,
          data: { forumUrl: data.payload.forumUrl },
        });
        // Update alert with forum URL
        setActiveAlert(prev =>
          prev ? { ...prev, governanceDraftInProgress: false, forumUrl: data.payload.forumUrl } : prev
        );
        break;
      }

      case 'PROTOCOL_SCORE_UPDATE': {
        const upd = data.payload;
        setProtocols(prev =>
          prev.map(p =>
            p.address === upd.address
              ? { ...p, riskScore: upd.score, band: upd.band, invariantStatus: upd.invariantStatus ?? p.invariantStatus }
              : p
          )
        );
        break;
      }

      case 'STAGING_SIGNAL': {
        const sig = data.payload;
        addEvent({
          protocol: sig.protocol || 'Unknown',
          type: 'STAGING',
          message: `◐ Pre-attack staging — ${sig.signals?.length || '?'} Tornado Cash-funded wallets near ${sig.protocol}`,
        });
        // Escalate to ELEVATED band
        setProtocols(prev =>
          prev.map(p =>
            p.name === sig.protocol
              ? { ...p, band: p.band === 'LOW' ? 'ELEVATED' : p.band, trend: 'up' }
              : p
          )
        );
        break;
      }

      case 'SENTIMENT_DROP': {
        const sent = data.payload;
        addEvent({
          protocol: sent.protocol || 'Market',
          type: 'SENTIMENT',
          message: `◐ ${sent.protocol} social sentiment ${(sent.signal?.delta * 100 || 0).toFixed(1)}% vs 24h avg — monitoring`,
        });
        break;
      }

      default:
        break;
    }
  }, []);

  const addEvent = useCallback((partial: Omit<LiveEvent, 'id' | 'timestamp'>) => {
    setEvents(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        ...partial,
      },
      ...prev.slice(0, 499), // Keep last 500 events
    ]);
  }, []);

  // Keyboard shortcut: ESC to dismiss alert
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveAlert(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main style={{
      display: 'grid',
      gridTemplateColumns: '25% 50% 25%',
      gridTemplateRows: '100vh',
      width: '100vw',
      height: '100vh',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Connection status indicator */}
      <div style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: 'rgba(13, 17, 23, 0.9)',
        border: `1px solid ${connected ? 'var(--border)' : 'var(--critical)'}`,
        borderRadius: 2,
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        opacity: connected ? 0 : 1,
        transition: 'opacity 0.5s ease',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--warning)',
          display: 'inline-block',
        }} />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'var(--warning)', letterSpacing: '0.1em' }}>
          CONNECTING TO SENTINEL BACKEND...
        </span>
      </div>

      {/* Left Panel — Live Event Stream */}
      <EventStream
        events={events}
        isAlertActive={!!activeAlert}
        connected={connected}
      />

      {/* Center — Threat Map */}
      <ThreatMap
        protocols={protocols}
        onNodeClick={setSelectedProtocol}
        alertProtocol={activeAlert?.protocol ?? null}
      />

      {/* Right Panel — Status + Stats */}
      <StatusPanel
        stats={agentStats}
        activeAlert={activeAlert}
        onDismissAlert={() => setActiveAlert(null)}
      />

      {/* Alert overlay — appears over everything on CRITICAL alert */}
      {activeAlert && (
        <AlertOverlay
          alert={activeAlert}
          onDismiss={() => setActiveAlert(null)}
          onGovernanceDraft={() => {
            setActiveAlert(prev => prev ? { ...prev, governanceDraftInProgress: true } : prev);
          }}
        />
      )}

      {/* Governance draft panel — slides in from right */}
      {governanceDraft && (
        <GovernanceDraftPanel
          draft={governanceDraft}
          onClose={() => setGovernanceDraft(null)}
        />
      )}
    </main>
  );
}
