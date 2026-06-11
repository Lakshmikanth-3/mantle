import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import {
  getAlerts,
  getAlertById,
  getStats,
  getProtocolScores,
  insertAlert,
} from './db.js';

const API_PORT = parseInt(process.env.API_PORT || '3003', 10);

// ── Router ────────────────────────────────────────────────────────────────────

export function createRouter(): express.Router {
  const router = express.Router();

  // GET /health
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  // GET /api/alerts?limit=50&offset=0
  router.get('/api/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      if (isNaN(limit) || limit < 1) {
        res.status(400).json({ error: 'limit must be a positive integer (max 200)' });
        return;
      }
      if (isNaN(offset) || offset < 0) {
        res.status(400).json({ error: 'offset must be a non-negative integer' });
        return;
      }

      const alerts = await getAlerts(limit, offset);
      res.json({ data: alerts, limit, offset, count: alerts.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/alerts/:id
  router.get('/api/alerts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'id is required' });
        return;
      }

      const alert = await getAlertById(id);
      if (!alert) {
        res.status(404).json({ error: `Alert '${id}' not found` });
        return;
      }

      res.json({ data: alert });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/stats
  router.get('/api/stats', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getStats();
      const protocols = await getProtocolScores();
      res.json({
        data: {
          ...stats,
          protocolCount: protocols.length || 5,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/protocols
  router.get('/api/protocols', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const scores = await getProtocolScores();
      res.json({ data: scores, count: scores.length });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/alerts  — called by the alertmanager / agent internals
  router.post('/api/alerts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        protocol?: unknown;
        protocolAddress?: unknown;
        severity?: unknown;
        estimatedUSD?: unknown;
        reason?: unknown;
        blockNumber?: unknown;
        txHash?: unknown;
        zkProofHash?: unknown;
      };

      // Validate required fields
      if (!body.protocol || typeof body.protocol !== 'string') {
        res.status(400).json({ error: '`protocol` (string) is required' });
        return;
      }
      if (!body.protocolAddress || typeof body.protocolAddress !== 'string') {
        res.status(400).json({ error: '`protocolAddress` (string) is required' });
        return;
      }
      const allowedSeverities = ['MINOR', 'HIGH', 'CRITICAL'] as const;
      if (!body.severity || !allowedSeverities.includes(body.severity as typeof allowedSeverities[number])) {
        res.status(400).json({ error: '`severity` must be one of: MINOR, HIGH, CRITICAL' });
        return;
      }

      const id = await insertAlert({
        protocol: body.protocol,
        protocolAddress: body.protocolAddress as string,
        severity: body.severity as 'MINOR' | 'HIGH' | 'CRITICAL',
        estimatedUSD: typeof body.estimatedUSD === 'number' ? body.estimatedUSD : 0,
        reason: typeof body.reason === 'string' ? body.reason : '',
        blockNumber: typeof body.blockNumber === 'string' ? body.blockNumber : '0',
        txHash: typeof body.txHash === 'string' ? body.txHash : undefined,
        zkProofHash: typeof body.zkProofHash === 'string' ? body.zkProofHash : undefined,
      });

      res.status(201).json({ data: { id }, message: 'Alert created' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// ── App factory ───────────────────────────────────────────────────────────────

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // Mount routes (health is at root, rest under /api)
  app.use('/', createRouter());

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  return app;
}

// ── Start function ────────────────────────────────────────────────────────────

export function startApi(): void {
  const app = createApp();

  app.listen(API_PORT, () => {
    console.log(`[api] REST API listening on http://localhost:${API_PORT}`);
    console.log(`[api] Endpoints:`);
    console.log(`[api]   GET  http://localhost:${API_PORT}/health`);
    console.log(`[api]   GET  http://localhost:${API_PORT}/api/alerts?limit=50&offset=0`);
    console.log(`[api]   GET  http://localhost:${API_PORT}/api/alerts/:id`);
    console.log(`[api]   GET  http://localhost:${API_PORT}/api/stats`);
    console.log(`[api]   GET  http://localhost:${API_PORT}/api/protocols`);
    console.log(`[api]   POST http://localhost:${API_PORT}/api/alerts`);
  });
}
