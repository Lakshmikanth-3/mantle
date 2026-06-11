import './env.js';
import EventEmitter from 'eventemitter3';
import { startMantleListener } from './listeners/mantleListener.js';
import { startEthListener } from './listeners/ethListener.js';
import { startReconciliationSweep, stopReconciliationSweep } from './invariant/reconciler.js';
import { InvariantChecker } from './invariant/checker.js';
import { startSignalPolling, stopSignalPolling } from './signals/poller.js';

/** Shared event bus — all watcher events flow through here */
export const sentinelBus = new EventEmitter();

/** Event types emitted on the bus */
export const EVENTS = {
  INVARIANT_VIOLATION: 'invariant:violation',
  ANOMALY_MINOR: 'invariant:anomaly',
  INVARIANT_OK: 'invariant:ok',
  STAGING_SIGNAL: 'signal:staging',
  SENTIMENT_DROP: 'signal:sentiment',
  SMART_MONEY_ALERT: 'signal:smartmoney',
  PENDING_MINT_ADDED: 'checker:pending_mint_added',
  SOURCE_BURN_RECONCILED: 'checker:source_burn_reconciled',
} as const;

async function main() {
  console.log('');
  console.log('  ███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗     ');
  console.log('  ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║     ');
  console.log('  ███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║     ');
  console.log('  ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║     ');
  console.log('  ███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███████╗ ');
  console.log('  ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝');
  console.log('');
  console.log('  Autonomous DeFi Risk Oracle · Agent #021 · ERC-8004 Verified');
  console.log('  Mantle Network · Cross-chain Invariant Monitor');
  console.log('');

  // Start chain listeners
  const checker = new InvariantChecker(sentinelBus);
  await startMantleListener(sentinelBus, checker);
  await startEthListener(sentinelBus, checker);

  // Start reconciliation sweep (runs every 30s)
  startReconciliationSweep(sentinelBus, checker);

  // Start Nansen + Elfa signal polling (every 5 minutes)
  startSignalPolling(sentinelBus);

  // Wire events to AlertManager
  // We use dynamic import so it lazily loads AlertManager code
  import('../../alertmanager/src/router.js').then(({ attachAlertRouter }) => {
    attachAlertRouter(sentinelBus);
  }).catch(err => {
    console.error('[watcher] Failed to load alertmanager:', err);
  });

  console.log('[watcher] All systems online. Watching every block.');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[watcher] Shutting down...');
    stopReconciliationSweep();
    stopSignalPolling();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[watcher] Fatal error:', err);
  process.exit(1);
});
