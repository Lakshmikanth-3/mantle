'use client';
import React, { useEffect, useRef, useState } from 'react';

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Inline components ────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      padding: '0 2rem',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: scrolled ? 'rgba(8,10,12,0.95)' : 'transparent',
      borderBottom: scrolled ? '1px solid #1E2530' : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="live-dot" />
        <span style={{
          fontFamily: 'DM Mono, monospace',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.2em',
          background: 'linear-gradient(90deg, #00C896, rgba(0,200,150,0.7))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>SENTINEL</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#4A5568', letterSpacing: '0.1em', marginLeft: 4 }}>
          AGENT #021 · ERC-8004
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
        {['How It Works', 'Architecture', 'The Demo'].map(item => (
          <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 11,
            color: '#8892A4',
            textDecoration: 'none',
            letterSpacing: '0.05em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#00C896')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8892A4')}>
            {item.toUpperCase()}
          </a>
        ))}
        <a
          href="/monitor"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            border: '1px solid #00C896',
            background: 'rgba(0,200,150,0.08)',
            color: '#00C896',
            fontFamily: 'DM Mono, monospace',
            fontSize: 11,
            letterSpacing: '0.08em',
            textDecoration: 'none',
            borderRadius: 2,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,200,150,0.18)';
            e.currentTarget.style.boxShadow = '0 0 16px rgba(0,200,150,0.3)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,200,150,0.08)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span className="live-dot" style={{ width: 4, height: 4 }} />
          OPEN MONITOR
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const detectionMs = [2000, 1980, 2100, 1950, 2030, 1890][tick % 6];

  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '120px 2rem 80px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(30,37,48,0.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(30,37,48,0.4) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        zIndex: 0,
      }} />
      {/* Radial gradient */}
      <div style={{
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 700,
        height: 700,
        background: 'radial-gradient(circle, rgba(0,200,150,0.06) 0%, transparent 70%)',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 840 }}>
        {/* Live badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: '2rem' }}>
          <div className="sentinel-glow" style={{
            padding: '4px 12px',
            border: '1px solid rgba(0,200,150,0.4)',
            background: 'rgba(0,200,150,0.08)',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span className="live-dot" />
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#00C896', letterSpacing: '0.15em' }}>
              AUTONOMOUS · RUNNING ON MANTLE NETWORK
            </span>
          </div>
        </div>

        {/* Main headline */}
        <h1 style={{
          fontFamily: 'Instrument Serif, serif',
          fontSize: 'clamp(2.5rem, 6vw, 5rem)',
          fontWeight: 400,
          color: '#E8EDF3',
          lineHeight: 1.1,
          marginBottom: '1.5rem',
          letterSpacing: '-0.01em',
        }}>
          <em style={{ color: '#00C896' }}>Kelp DAO's team detected the exploit in 46 minutes.</em>
          <br />
          SENTINEL detects it in{' '}
          <span style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 'clamp(2.5rem, 6vw, 5rem)',
            color: '#00C896',
            display: 'inline-block',
            minWidth: '5ch',
          }}>
            {formatMs(detectionMs)}
          </span>
        </h1>

        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '1.15rem',
          color: '#8892A4',
          lineHeight: 1.7,
          maxWidth: 640,
          margin: '0 auto 2.5rem',
        }}>
          A fully autonomous AI agent that monitors every bridge protocol on Mantle for cross-chain invariant violations — detecting threats in seconds, drafting governance proposals in minutes, and selling validated risk intelligence via x402 micro-payments.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/monitor"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              background: '#00C896',
              color: '#080A0C',
              fontFamily: 'DM Mono, monospace',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              borderRadius: 2,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#00e0aa';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0,200,150,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#00C896';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            OPEN THE MONITOR →
          </a>
          <a
            href="#the-demo"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              border: '1px solid #1E2530',
              background: 'rgba(13,17,23,0.8)',
              color: '#E8EDF3',
              fontFamily: 'DM Mono, monospace',
              fontSize: 13,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              borderRadius: 2,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#00C896';
              e.currentTarget.style.color = '#00C896';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#1E2530';
              e.currentTarget.style.color = '#E8EDF3';
            }}
          >
            REPLAY KELP EXPLOIT
          </a>
        </div>

        {/* Hero stats row */}
        <div style={{
          marginTop: '4rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1px',
          background: '#1E2530',
          border: '1px solid #1E2530',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          {[
            { value: '2s', label: 'Detection Speed', sub: 'vs 46 minutes human' },
            { value: '8m', label: 'Governance Draft', sub: 'vs 6 days manual' },
            { value: '$0.05', label: 'Oracle Query', sub: 'via x402 micro-payment' },
          ].map(({ value, label, sub }) => (
            <div key={label} style={{
              background: '#0D1117',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <div style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: '2.2rem',
                fontWeight: 500,
                color: '#00C896',
                lineHeight: 1,
              }}>{value}</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#E8EDF3', letterSpacing: '0.1em' }}>{label.toUpperCase()}</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#4A5568' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      id: '01',
      title: 'Block-Level Invariant Monitoring',
      description: 'Every new Mantle block triggers a cross-chain check: tokens_released_on_destination must equal tokens_burned_on_source. This is the exact invariant the Kelp exploit violated.',
      color: '#00C896',
      icon: '⬡',
    },
    {
      id: '02',
      title: 'Multi-Signal Enrichment',
      description: 'Simultaneously queries Nansen (smart money flow), Elfa AI (social sentiment), and Pyth (price oracles). Pre-attack staging patterns — Tornado Cash-funded wallets — raise risk scores before exploits happen.',
      color: '#F5A623',
      icon: '◈',
    },
    {
      id: '03',
      title: 'Autonomous Alert & Response',
      description: 'CRITICAL violations trigger: Telegram broadcast, ERC-8004 on-chain logging, ZK proof submission, defensive Byreal CLMM position closure, and Gemini-powered MIP draft to Mantle Forum.',
      color: '#E53E3E',
      icon: '⚡',
    },
    {
      id: '04',
      title: 'x402 Risk Oracle Economy',
      description: 'Other agents pay $0.05/query via x402 HTTP micro-payments for validated risk assessments. 3% routes to gas reservoir — SENTINEL self-funds its own operation indefinitely.',
      color: '#6B7FD7',
      icon: '◎',
    },
  ];

  return (
    <section id="how-it-works" style={{ padding: '6rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#00C896', letterSpacing: '0.25em', marginBottom: '1rem' }}>
          HOW IT WORKS
        </div>
        <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 400, color: '#E8EDF3', margin: 0 }}>
          Four Autonomous Flows. No Human Required.
        </h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: '#1E2530' }}>
        {steps.map(step => (
          <div key={step.id} style={{
            background: '#0D1117',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            transition: 'background 0.2s',
            cursor: 'default',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#111820')}
          onMouseLeave={e => (e.currentTarget.style.background = '#0D1117')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 28, color: step.color, opacity: 0.9 }}>{step.icon}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#4A5568', letterSpacing: '0.05em' }}>{step.id}</span>
            </div>
            <h3 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1rem', fontWeight: 600, color: step.color, margin: 0 }}>
              {step.title}
            </h3>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', color: '#8892A4', lineHeight: 1.65, margin: 0 }}>
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="architecture" style={{ padding: '6rem 2rem', background: '#0D1117', borderTop: '1px solid #1E2530', borderBottom: '1px solid #1E2530' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#00C896', letterSpacing: '0.25em', marginBottom: '1rem' }}>
            ARCHITECTURE
          </div>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 400, color: '#E8EDF3', margin: '0 0 1rem' }}>
            Seven Services. One Autonomous Agent.
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '1rem', color: '#8892A4', maxWidth: 560, margin: '0 auto' }}>
            Each service runs independently. The event bus wires them together. No single point of failure.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1px', background: '#1E2530' }}>
          {[
            { name: 'watcher', desc: 'Block listener + invariant checker', color: '#00C896' },
            { name: 'alertmanager', desc: 'Scoring, routing, Telegram dispatch', color: '#F5A623' },
            { name: 'oracle', desc: 'x402 HTTP risk assessment server', color: '#6B7FD7' },
            { name: 'governance', desc: 'Gemini LLM → MIP draft → Forum post', color: '#E53E3E' },
            { name: 'prover', desc: 'ZK Groth16 batch proof generation', color: '#9B59B6' },
            { name: 'executor', desc: 'Byreal CLMM defensive position close', color: '#F5A623' },
            { name: 'indexer', desc: 'Postgres + REST API + WebSocket push', color: '#00C896' },
          ].map(svc => (
            <div key={svc.name} style={{
              background: '#080A0C',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <div style={{
                fontFamily: 'DM Mono, monospace',
                fontSize: 11,
                fontWeight: 500,
                color: svc.color,
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: svc.color, display: 'inline-block' }} />
                {svc.name}/
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: '#8892A4', lineHeight: 1.5 }}>
                {svc.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Tech stack badges */}
        <div style={{ marginTop: '3rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
          {[
            'ERC-8004 Identity + Reputation + Validation Registry',
            'x402 HTTP micro-payments',
            'Mantle Network L2',
            'LayerZero v2 OFT',
            'Nansen Smart Money API',
            'Elfa AI Sentiment',
            'Gemini 2.0 Flash',
            'snarkjs Groth16 ZK',
            'Byreal CLMM CLI',
            'Pyth Price Oracle',
            'Discourse Forum API',
          ].map(badge => (
            <span key={badge} style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 9,
              color: '#8892A4',
              padding: '4px 8px',
              border: '1px solid #1E2530',
              borderRadius: 2,
              letterSpacing: '0.05em',
              background: '#0D1117',
            }}>
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TheDemo() {
  const timeline = [
    { time: '−6h', label: 'Pre-attack staging', detail: 'Tornado Cash gas funding to new wallets — SENTINEL amber alert', color: '#F5A623', sentinel: true },
    { time: '17:29', label: 'TC staging detected', detail: 'rsETH node turns amber on threat map', color: '#F5A623', sentinel: true },
    { time: '17:35:35', label: 'First forged LayerZero packet', detail: 'DVN-compromised message submits to bridge', color: '#E53E3E', sentinel: false },
    { time: '17:35:37', label: '⚡ SENTINEL ALERT', detail: 'Invariant check: 116,500 rsETH released / 0 burned — CRITICAL', color: '#E53E3E', sentinel: true },
    { time: '17:35:38', label: 'Telegram alert fired', detail: 'Public broadcast to @sentinel_mantle_alerts', color: '#00C896', sentinel: true },
    { time: '17:35:46', label: 'Governance draft begins', detail: 'Gemini drafts MIP structure from real treasury data', color: '#00C896', sentinel: true },
    { time: '17:43:19', label: 'MIP posted to Forum', detail: '7m 42s from detection — forum.mantle.xyz', color: '#00C896', sentinel: true },
    { time: '18:21:00', label: 'Kelp detects + pauses', detail: '46 minutes after drain — too late for second attempt', color: '#4A5568', sentinel: false },
  ];

  return (
    <section id="the-demo" style={{ padding: '6rem 2rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#E53E3E', letterSpacing: '0.25em', marginBottom: '1rem' }}>
            THE DEMO — APRIL 18, 2026
          </div>
          <h2 style={{ fontFamily: 'Instrument Serif, serif', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 400, color: '#E8EDF3', margin: '0 0 1rem' }}>
            Replaying the Kelp DAO Exploit
          </h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '1rem', color: '#8892A4', maxWidth: 560, margin: '0 auto' }}>
            This is not a simulation. It is SENTINEL's detection engine running against real historical on-chain data at 10× speed.
          </p>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 96, top: 0, bottom: 0, width: 1, background: '#1E2530' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {timeline.map((event, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0,
                padding: '1rem 0',
              }}>
                {/* Time */}
                <div style={{
                  width: 88,
                  flexShrink: 0,
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 10,
                  color: event.sentinel ? event.color : '#4A5568',
                  textAlign: 'right',
                  paddingRight: 16,
                  paddingTop: 2,
                  letterSpacing: '0.05em',
                }}>
                  {event.time}
                </div>

                {/* Dot */}
                <div style={{
                  width: 17,
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: event.sentinel ? 10 : 6,
                    height: event.sentinel ? 10 : 6,
                    borderRadius: '50%',
                    background: event.color,
                    border: event.sentinel ? `2px solid ${event.color}` : 'none',
                    boxShadow: event.sentinel ? `0 0 8px ${event.color}80` : 'none',
                    marginTop: 3,
                    flexShrink: 0,
                  }} />
                </div>

                {/* Content */}
                <div style={{ paddingLeft: 16, flex: 1 }}>
                  <div style={{
                    fontFamily: event.sentinel ? 'DM Mono, monospace' : 'Inter, sans-serif',
                    fontSize: event.label.includes('SENTINEL') ? '1.05rem' : '0.9rem',
                    fontWeight: event.label.includes('SENTINEL') ? 500 : 400,
                    color: event.color,
                    marginBottom: 3,
                  }}>
                    {event.label}
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.83rem', color: '#4A5568', lineHeight: 1.5 }}>
                    {event.detail}
                  </div>
                </div>

                {/* SENTINEL badge */}
                {event.sentinel && (
                  <div style={{
                    flexShrink: 0,
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 8,
                    color: event.color,
                    border: `1px solid ${event.color}40`,
                    padding: '2px 6px',
                    borderRadius: 2,
                    marginTop: 2,
                    letterSpacing: '0.1em',
                  }}>
                    SENTINEL
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Impact callout */}
        <div style={{
          marginTop: '3rem',
          padding: '2rem',
          background: 'rgba(229,62,62,0.05)',
          border: '1px solid rgba(229,62,62,0.2)',
          borderRadius: 2,
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: '1.5rem', color: '#E8EDF3', marginBottom: '0.5rem' }}>
            45 minutes, 43 seconds earlier.
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '1rem', color: '#8892A4' }}>
            The second theft attempt — $95M — never had a target.
            Mantle's governance machine would have been in motion before Kelp's team even noticed.
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      padding: '3rem 2rem',
      borderTop: '1px solid #1E2530',
      background: '#0D1117',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="live-dot" />
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#00C896', letterSpacing: '0.15em' }}>SENTINEL</span>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#4A5568', letterSpacing: '0.05em', marginLeft: 4 }}>
          AGENT #021 · ERC-8004 · MANTLE NETWORK
        </span>
      </div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: '#4A5568', letterSpacing: '0.05em' }}>
        Mantle Turing Test Hackathon 2026 · AI Alpha & Data Track
      </div>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        {[
          { label: 'MONITOR', href: '/monitor' },
          { label: 'ORACLE API', href: 'http://localhost:3002/health' },
          { label: 'GITHUB', href: '#' },
        ].map(({ label, href }) => (
          <a key={label} href={href} target="_blank" rel="noreferrer" style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: 9,
            color: '#8892A4',
            textDecoration: 'none',
            letterSpacing: '0.1em',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#00C896')}
          onMouseLeave={e => (e.currentTarget.style.color = '#8892A4')}>
            {label}
          </a>
        ))}
      </div>
    </footer>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main style={{ background: '#080A0C', minHeight: '100vh' }}>
      <Navbar />
      <Hero />
      <HowItWorks />
      <Architecture />
      <TheDemo />
      <Footer />
    </main>
  );
}
