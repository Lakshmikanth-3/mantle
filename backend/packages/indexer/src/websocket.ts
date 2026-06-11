import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import type EventEmitter from 'eventemitter3';

const WS_PORT = parseInt(process.env.WEBSOCKET_PORT || '3001', 10);
const HTTP_PORT = 3003;

let _clients = new Set<WebSocket>();

/** Broadcast a message to every connected Monitor client */
export function broadcast(payload: object): void {
  const data = JSON.stringify(payload);
  for (const client of _clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Starts:
 *  1. A WebSocket server on WS_PORT (3001) — the Monitor frontend connects here
 *  2. An HTTP server on HTTP_PORT (3003) with:
 *       POST /emit   — inject arbitrary events (used by old code)
 *       POST /simulate — inject an INVARIANT_VIOLATION (used by triggerExploit.js)
 *
 * Both servers share the same underlying http.Server instance so the WS upgrade
 * is handled on the same port as the HTTP API.
 */
export function startWebSocketServer(eventBus?: EventEmitter): WebSocketServer {
  // ── HTTP server ──────────────────────────────────────────────────────────────
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const isEmit     = req.method === 'POST' && req.url === '/emit';

    if (isEmit) {
      let body = '';
      req.on('data', (chunk) => (body += chunk.toString()));
      req.on('end', () => {
        try {
          const message = JSON.parse(body);

          // Legacy /emit — broadcast as-is
          broadcast(message);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, clients: _clients.size }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  // ── WebSocket server (upgrades on same server) ────────────────────────────
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    _clients.add(ws);
    console.log(`[ws] Monitor client connected (total: ${_clients.size})`);

    // Greet new client with current state
    ws.send(
      JSON.stringify({
        type: 'CONNECTED',
        payload: { agentId: 'sentinel-agent-021', timestamp: Date.now() },
      }),
    );

    ws.on('close', () => {
      _clients.delete(ws);
      console.log(`[ws] Monitor client disconnected (total: ${_clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err.message);
      _clients.delete(ws);
    });
  });

  // Listen on WS_PORT for both HTTP + WS
  server.listen(WS_PORT, () => {
    console.log(`[ws] WebSocket server listening on ws://localhost:${WS_PORT}`);
    console.log(`[ws] HTTP inject API listening on http://localhost:${WS_PORT}/emit`);
  });

  return wss;
}

/** Message types broadcast to the Monitor */
export const WS_EVENTS = {
  INVARIANT_OK:           'INVARIANT_OK',
  ANOMALY_MINOR:          'ANOMALY_MINOR',
  ALERT:                  'ALERT',
  AGENT_STATS:            'AGENT_STATS',
  PROTOCOL_SCORE_UPDATE:  'PROTOCOL_SCORE_UPDATE',
  GOVERNANCE_DRAFT:       'GOVERNANCE_DRAFT',
  DEFENSIVE_ACTION:       'DEFENSIVE_ACTION',
  RISK_QUERY:             'RISK_QUERY',
} as const;
