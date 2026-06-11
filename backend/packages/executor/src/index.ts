import EventEmitter from 'eventemitter3';
import 'dotenv/config';
import { handleViolation } from './executor.js';

/**
 * Executor Entry Point
 * Listens for INVARIANT_VIOLATION events from the shared event bus and executes
 * the defensive on-chain actions.
 */
export function startExecutor(bus: EventEmitter): void {
  const isEnabled = process.env.EXECUTOR_ENABLED === 'true';
  
  if (!isEnabled) {
    console.log('[executor] Executor module is disabled (EXECUTOR_ENABLED !== true)');
    return;
  }

  console.log('[executor] Starting autonomous executor (listening for INVARIANT_VIOLATION)');
  
  // Listen for the critical violation event
  bus.on('INVARIANT_VIOLATION', async (event: any) => {
    try {
      await handleViolation(event);
    } catch (err) {
      console.error('[executor] Fatal error in execution pipeline:', err);
    }
  });
}
