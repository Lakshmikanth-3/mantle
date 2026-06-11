import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActiveAlert } from '../app/page';

interface AlertOverlayProps {
  alert: ActiveAlert;
  onDismiss: () => void;
  onGovernanceDraft: () => void;
}

export default function AlertOverlay({ alert, onDismiss, onGovernanceDraft }: AlertOverlayProps) {
  // Format dates
  const detectedTime = new Date(alert.detectedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40vh',
          background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.8) 0%, rgba(229, 62, 62, 0.15) 100%)',
          backdropFilter: 'blur(24px) saturate(150%)',
          borderTop: '1px solid rgba(229, 62, 62, 0.3)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          boxShadow: '0 -15px 50px rgba(229, 62, 62, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          zIndex: 1000,
          padding: '2.5rem 4rem',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--text-ui)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <div className="alert-dot" />
              <h2 style={{ fontFamily: 'var(--text-prose)', fontSize: '2rem', color: 'var(--critical)', margin: 0, letterSpacing: '0.02em' }}>
                INVARIANT VIOLATION DETECTED
              </h2>
            </div>
            <div className="font-data" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
              ID: {alert.id} | ZK Proof: {alert.zkProofHash.substring(0, 10)}...{alert.zkProofHash.substring(alert.zkProofHash.length - 8)}
            </div>
          </div>
          <button className="btn" onClick={onDismiss} style={{ borderColor: 'var(--text-muted)', color: 'var(--text-muted)', background: 'transparent' }}>
            DISMISS [ESC]
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="data-grid" style={{ background: 'transparent', gap: '0.5rem' }}>
              <div>
                <div className="section-label" style={{ color: 'var(--critical)' }}>Protocol</div>
                <div className="font-data" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{alert.protocol}</div>
                <div className="font-data" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{alert.protocolAddress}</div>
              </div>
              <div>
                <div className="section-label" style={{ color: 'var(--critical)' }}>Detected At</div>
                <div className="font-data" style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{detectedTime}</div>
                <div className="font-data" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>2 seconds after block confirmation</div>
              </div>
            </div>

            <div>
              <div className="section-label" style={{ color: 'var(--critical)', marginBottom: '0.25rem' }}>Type & Delta</div>
              <div className="font-data" style={{ fontSize: '1.25rem', color: 'var(--critical)', marginTop: '0.5rem' }}>{alert.type}</div>
              <div className="font-data" style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {(Number(alert.deltaAmount) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <div className="section-label" style={{ color: 'var(--critical)', marginBottom: '0.25rem' }}>Exposure on Mantle</div>
              <div className="font-data" style={{ fontSize: '1.25rem', color: 'var(--warning)' }}>
                ${(alert.mantleExposureUSD / 1_000_000).toFixed(1)}M in correlated positions
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '1px solid var(--border)', paddingLeft: '2rem' }}>
            <div>
              <div className="section-label" style={{ color: 'var(--critical)', marginBottom: '0.75rem' }}>Actions Taken Automatically</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {alert.actions?.map((action, i) => (
                  <motion.li 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="font-data" 
                    style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    {action.status === 'success' ? (
                      <span style={{ color: 'var(--safe)' }}>✓</span>
                    ) : (
                      <div className="spinner" style={{ width: 12, height: 12, border: '2px solid var(--text-muted)', borderTopColor: 'var(--text-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    )}
                    <span style={{ color: action.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)' }}>{action.label}</span>
                    {action.txHash && (
                      <a href={`https://sepolia.mantlescan.xyz/tx/${action.txHash}`} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--safe)', textDecoration: 'underline' }}>
                        View TX ↗
                      </a>
                    )}
                  </motion.li>
                ))}
              </ul>
              <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { 100% { transform: rotate(360deg); } }` }} />
            </div>

            <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.3)', padding: '1rem', border: '1px solid var(--border)' }}>
              <div className="section-label" style={{ marginBottom: '0.5rem' }}>Governance Response</div>
              {alert.governanceDraftInProgress ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="font-data" style={{ fontSize: '0.9rem', color: 'var(--safe)' }}>Governance draft in progress...</div>
                  <motion.div 
                    style={{ height: '2px', background: 'var(--safe)', flex: 1, originX: 0 }}
                    animate={{ scaleX: [0, 1] }}
                    transition={{ duration: 45, ease: "linear" }}
                  />
                </div>
              ) : alert.forumUrl ? (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className="font-data" style={{ fontSize: '0.9rem', color: 'var(--safe)' }}>Draft completed & posted</div>
                  <a href={alert.forumUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '10px' }}>VIEW PROPOSAL</a>
                </div>
              ) : (
                <button className="btn btn-critical" onClick={onGovernanceDraft}>FORCE GOVERNANCE DRAFT</button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
