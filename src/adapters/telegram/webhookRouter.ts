import type { Router } from 'express';
import express from 'express';
import type { TelegramAdapter } from './TelegramAdapter.js';
import { createLogger } from '../../utils/logger.js';

export function createWebhookRouter(adapter: TelegramAdapter): Router {
  const logger = createLogger({ component: 'webhookRouter' });
  const router = express.Router();

  router.post('/telegram', express.json(), async (req, res) => {
    const correlationId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const requestLogger = logger.child({ correlationId });

    try {
      requestLogger.info({ body: req.body }, 'Received webhook request');
      await adapter.handleWebhook(req.body);

      // Telegram expects 200 OK
      res.status(200).json({ ok: true });
    } catch (error) {
      requestLogger.error({ error }, 'Error processing webhook');
      res.status(500).json({ ok: false, error: 'Internal server error' });
    }
  });

  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return router;
}
