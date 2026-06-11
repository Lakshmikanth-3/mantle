import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import type EventEmitter from 'eventemitter3';
import { EVENTS } from '../../watcher/src/index.js';
import { createWalletClient, http as viemHttp, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantleSepoliaTestnet } from 'viem/chains';

/**
 * Attaches a WebSocket server to stream real-time events to the frontend
 * and provides HTTP endpoints for demo actions.
 */
export function startWebSocketServer(bus: EventEmitter, port: number = 3000): void {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/trigger-exploit') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Simulator has been removed for production' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SENTINEL API Server Running\n');
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[server] New client connected to WebSocket');
    
    ws.send(JSON.stringify({ type: 'CONNECTION_ESTABLISHED', timestamp: Date.now() }));

    // When the client disconnects
    ws.on('close', () => {
      console.log('[server] Client disconnected');
    });
  });

  // Wire event bus to broadcast to all connected clients
  bus.on(EVENTS.INVARIANT_VIOLATION, (data: any) => {
    const alertPayload = {
      id: data.guid,
      protocol: data.protocol,
      protocolAddress: data.protocolAddress,
      type: data.reason,
      detectedAt: data.timestamp,
      deltaAmount: data.amount,
      estimatedUSD: data.estimatedUSD,
      mantleExposureUSD: data.estimatedUSD,
      actionsTaken: ['ERC-8004 risk event logged', 'ZK proof submitted', 'SentinelCore alert fired'],
      actions: [
        { label: 'ERC-8004 risk event logged', status: 'pending' },
        { label: 'ZK proof submitted', status: 'pending' },
        { label: 'SentinelCore alert fired', status: 'pending' }
      ],
      zkProofHash: '0x' + Buffer.from(data.guid).toString('hex').slice(0, 64)
    };
    broadcast(wss, { type: 'ALERT', payload: alertPayload });
  });

  bus.on('ACTION_COMPLETE', (data: any) => {
    broadcast(wss, { type: 'ACTION_COMPLETE', payload: data });
  });

  bus.on(EVENTS.INVARIANT_OK, (data: any) => {
    broadcast(wss, {
      type: 'INVARIANT_OK',
      payload: {
        protocol: data.protocol,
        protocolAddress: data.protocolAddress,
        delta: data.delta?.toString() ?? '0',
        blockNumber: data.blockNumber?.toString() ?? '0',
        timestamp: data.timestamp ?? Date.now(),
      }
    });
  });

  bus.on('governance:draft_complete', (data: any) => {
    broadcast(wss, { type: 'GOVERNANCE_DRAFT', payload: data });
  });

  bus.on(EVENTS.STAGING_SIGNAL, (data) => {
    broadcast(wss, { type: 'STAGING_SIGNAL', payload: data });
  });

  bus.on(EVENTS.SENTIMENT_DROP, (data) => {
    broadcast(wss, { type: 'SENTIMENT_DROP', payload: data });
  });

  server.listen(port, () => {
    console.log(`[server] SENTINEL WebSocket API running on ws://localhost:${port}`);
    console.log(`[server] REST endpoints: POST http://localhost:${port}/trigger-exploit`);
  });
}

function broadcast(wss: WebSocketServer, message: any) {
  const data = JSON.stringify(message, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value
  );
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
