/**
 * @file pipeline.test.ts
 * E2E Pipeline Test — tests the complete SENTINEL data-flow:
 *
 *   1. POST /simulate  → Indexer HTTP endpoint (port 3001)
 *      ↓  Indexer broadcasts WS message of type 'ALERT'
 *   2. WS client connected to Indexer receives the broadcast within 5 s
 *   3. Oracle /health endpoint (port 3002) is reachable and healthy
 *   4. Indexer REST API GET /api/stats (port 3003) returns counters
 *   5. AlertManager WebSocket (port 3000) accepts connections and sends
 *      a CONNECTION_ESTABLISHED handshake
 *
 * All services must be running locally before executing this suite.
 * Use `pnpm dev` in the repo root or start each package individually.
 */
import 'dotenv/config';
import { expect } from 'chai';
import { WebSocket } from 'ws';
import axios from 'axios';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

const INDEXER_WS_PORT   = parseInt(process.env.WEBSOCKET_PORT    ?? '3001', 10);
const ORACLE_PORT        = parseInt(process.env.ORACLE_PORT       ?? '3002', 10);
const INDEXER_HTTP_PORT  = 3003; // HTTP REST API (separate from WS port)
const ALERTMANAGER_PORT  = parseInt(process.env.ALERTMANAGER_PORT ?? '3000', 10);

/** Promise that resolves when a WS message matching `predicate` arrives, or rejects after `timeoutMs`. */
function waitForWsMessage(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs: number,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WebSocket message matching predicate not received within ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (predicate(parsed)) {
          clearTimeout(timer);
          resolve(parsed);
        }
      } catch {
        // ignore non-JSON frames
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Promise that resolves once the WebSocket reaches OPEN state, or rejects after `timeoutMs`. */
function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error(`WebSocket did not open within ${timeoutMs}ms`)),
      timeoutMs,
    );
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Test suite ───────────────────────────────────────────────────────────────
describe('SENTINEL Pipeline E2E', function () {
  this.timeout(120_000);

  it('real on-chain exploit should trigger WS broadcast on alertmanager', async () => {
    // Connect WS client to the AlertManager on port 3000
    const ws = new WebSocket(`ws://127.0.0.1:${ALERTMANAGER_PORT}`);
    await waitForOpen(ws, 5_000);

    // Start listening for the ALERT broadcast BEFORE posting
    const messagePromise = waitForWsMessage(
      ws,
      (msg) => msg.type === 'ALERT',
      120_000,
    );

    // POST the real on-chain exploit
    console.log('[E2E] Triggering real on-chain exploit (this will take ~1 minute to confirm and reconcile)...');
    try {
      await execPromise('node ../../triggerExploit.js');
    } catch (err: any) {
      console.error('[E2E] Failed to trigger exploit:', err.message);
      throw err;
    }

    // Await the broadcast message
    const message = await messagePromise;

    expect(message).to.have.property('type', 'ALERT');
    expect(message).to.have.property('payload');
    expect(message.payload).to.have.property('type', 'RELEASE_WITHOUT_BURN');
    expect(message.payload).to.have.property('protocol', 'rsETH (Kelp DAO)');
    expect(message.payload).to.have.property('zkProofHash');
    expect(message.payload).to.have.property('actionsTaken');

    ws.close();
  });

  it('oracle /health endpoint should return online status', async () => {
    const res = await axios.get(`http://localhost:${ORACLE_PORT}/health`, {
      timeout: 5_000,
    });

    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('status', 'online');
    // The oracle server returns `agent` not `agentId`; assert it is truthy
    expect(res.data).to.have.property('agent').that.is.a('string').and.have.length.above(0);
    expect(res.data).to.have.property('uptime').that.is.a('number').and.is.above(0);
  });

  it('indexer REST API GET /api/stats should return stats', async () => {
    const res = await axios.get(`http://localhost:${INDEXER_HTTP_PORT}/api/stats`, {
      timeout: 5_000,
    });

    expect(res.status).to.equal(200);
    expect(res.data).to.be.an('object');
    // totalAlerts is a non-negative integer
    expect(res.data.data).to.have.property('totalAlerts');
    expect(Number(res.data.data.totalAlerts)).to.be.at.least(0);
  });

  it('alertmanager WS should accept connections', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${ALERTMANAGER_PORT}`);
    await waitForOpen(ws, 5_000);

    const message = await waitForWsMessage(
      ws,
      (msg) => msg.type === 'CONNECTION_ESTABLISHED',
      5_000,
    );

    expect(message).to.have.property('type', 'CONNECTION_ESTABLISHED');
    expect(message).to.have.property('timestamp').that.is.a('number');

    ws.close();
  });
});
