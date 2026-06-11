import { describe, it, expect } from 'vitest';
import EventEmitter3 from 'eventemitter3';
import { InvariantChecker, CHECKER_EVENTS } from '../src/invariant/checker.js';

describe('Invariant Checker', () => {
  it('should flag an anomaly if source burn is missing (overdue)', () => {
    const emitter = new EventEmitter3();
    const checker = new InvariantChecker(emitter);
    
    // Check invariant with fake OFTReceived event
    checker.checkInvariant('0x4200000000000000000000000000000000000000', {
      guid: '0x123',
      srcEid: 101,
      toAddress: '0xabc',
      amountReceivedLD: 50000000000000000n // 0.05 ETH
    }, 12345n);

    expect(checker.pendingCount).toBe(1);

    // Should be overdue if we pass a window of -1 ms
    const overdue = checker.getOverdueMints(-1);
    expect(overdue.length).toBe(1);
    expect(overdue[0].guid).toBe('0x123');
  });

  it('should mark reconciled if source burn is found', () => {
    const emitter = new EventEmitter3();
    const checker = new InvariantChecker(emitter);
    
    // Add pending mint
    checker.checkInvariant('0x4200000000000000000000000000000000000000', {
      guid: '0x123',
      srcEid: 101,
      toAddress: '0xabc',
      amountReceivedLD: 50000000000000000n
    }, 12345n);

    // Reconcile
    checker.reconcileSourceBurn({
      guid: '0x123',
      dstEid: 102,
      fromAddress: '0xdef',
      amountSentLD: 50000000000000000n,
      amountReceivedLD: 50000000000000000n
    });

    expect(checker.pendingCount).toBe(0);
  });
});
