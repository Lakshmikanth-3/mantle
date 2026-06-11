import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface GovernanceDraft {
  title: string;
  body: string;
  forumUrl: string;
  generatedInMs: number;
  zkProofHash: string;
}

interface GovernanceDraftPanelProps {
  draft: GovernanceDraft;
  onClose: () => void;
}

function shareOnX(title: string, forumUrl: string) {
  const text = encodeURIComponent(
    `🚨 SENTINEL AI Agent just autonomously drafted a Mantle governance proposal in response to an on-chain invariant violation.\n\n"${title}"\n\nRead the draft: ${forumUrl}\n\n#Mantle #DeFi #AIAgent #SENTINEL`
  );
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
}

export default function GovernanceDraftPanel({ draft, onClose }: GovernanceDraftPanelProps) {
  const generatedMin = Math.floor(draft.generatedInMs / 60000);
  const generatedSec = Math.floor((draft.generatedInMs % 60000) / 1000);
  const generatedTimeStr = generatedMin > 0
    ? `${generatedMin}m ${generatedSec}s`
    : `${generatedSec}s`;

  const hasForum = draft.forumUrl && draft.forumUrl !== '';
  const hasProof = draft.zkProofHash && draft.zkProofHash !== '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 130 }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '36vw',
          minWidth: '420px',
          background: 'linear-gradient(180deg, #0D1117 0%, #080A0C 100%)',
          borderLeft: '1px solid var(--safe)',
          boxShadow: '-12px 0 50px rgba(0, 200, 150, 0.12)',
          zIndex: 900,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--text-ui)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(0,200,150,0.08) 0%, transparent 60%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                <span className="live-dot" />
                <span className="section-label" style={{ color: 'var(--safe)', letterSpacing: '0.2em' }}>
                  AUTO-DRAFTED GOVERNANCE PROPOSAL
                </span>
              </div>
              <div className="font-data" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Generated in <span style={{ color: 'var(--safe)' }}>{generatedTimeStr}</span> from alert detection
              </div>
            </div>
            <button className="btn" onClick={onClose} style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
              padding: '4px 10px',
              fontSize: '10px',
            }}>
              ✕ CLOSE
            </button>
          </div>
        </div>

        {/* Status ribbon */}
        <div style={{
          padding: '0.75rem 1.5rem',
          background: 'rgba(0, 200, 150, 0.06)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          flexShrink: 0,
        }}>
          <div className="font-data" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: 'var(--neutral)' }}>Status:</span>
            <span style={{ color: hasForum ? 'var(--safe)' : 'var(--warning)' }}>
              {hasForum ? '✓ Posted to Mantle Forum' : '⏳ Pending forum post...'}
            </span>
          </div>
          {hasForum && (
            <div className="font-data" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ color: 'var(--neutral)' }}>Forum:</span>
              <a href={draft.forumUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--safe)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                {draft.forumUrl}
              </a>
            </div>
          )}
          {hasProof && (
            <div className="font-data" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
              <span style={{ color: 'var(--neutral)' }}>ZK Proof:</span>
              <span>{draft.zkProofHash.slice(0, 18)}...</span>
            </div>
          )}
        </div>

        {/* Title */}
        <div style={{ padding: '1.25rem 1.5rem 0.75rem', flexShrink: 0 }}>
          <h2 style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: '1.45rem',
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.3,
            fontWeight: 400,
          }}>
            {draft.title || '[SENTINEL AUTO-DRAFT] MIP: Emergency Response'}
          </h2>
        </div>

        {/* Divider */}
        <div style={{ margin: '0 1.5rem', height: 1, background: 'var(--border)' }} />

        {/* Body text */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          <pre style={{
            fontFamily: 'Instrument Serif, serif',
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
          }}>
            {draft.body || 'Proposal text being generated...'}
          </pre>
        </div>

        {/* Action buttons */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '0.75rem',
          flexShrink: 0,
          background: 'rgba(0,0,0,0.3)',
        }}>
          {hasForum && (
            <a
              href={draft.forumUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary"
              style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
            >
              VIEW ON FORUM →
            </a>
          )}
          {hasProof && (
            <a
              href={`https://mantlescan.xyz/tx/${draft.zkProofHash}`}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
            >
              ZK PROOF →
            </a>
          )}
          <button
            className="btn"
            onClick={() => shareOnX(draft.title, draft.forumUrl)}
            style={{ flexShrink: 0 }}
          >
            SHARE ON X
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
