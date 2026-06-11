import 'dotenv/config';
import { startWebSocketServer, broadcast } from './websocket.js';
import { initSchema, getStats } from './db.js';
import { startApi } from './api.js';

console.log('[indexer] Starting SENTINEL Indexer + WebSocket hub...');

// Initialize DB schema then start all servers
(async () => {
  try {
    await initSchema();
  } catch (err) {
    console.error('[indexer] DB schema init failed (continuing anyway):', err);
  }

  // WebSocket server disabled — alertmanager now owns WS port 3001
  // startWebSocketServer();

  // Start Express REST API (port 3003)
  startApi();

  // Broadcast real stats from DB every 10 seconds (disabled, monitor uses REST)
  /*
  setInterval(async () => {
    try {
      const stats = await getStats();
      broadcast({
        type: 'AGENT_STATS',
        payload: {
          ...stats,
          timestamp: Date.now(),
        },
      });
    } catch (err) {
      console.error('[indexer] Failed to fetch stats for broadcast:', err);
    }
  }, 10_000);
  */
})();
