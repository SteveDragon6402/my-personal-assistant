import express from 'express';
import { createLogger } from './utils/logger.js';
import type { TelegramAdapter } from './adapters/telegram/TelegramAdapter.js';
import { createWebhookRouter } from './adapters/telegram/webhookRouter.js';
const logger = createLogger({ component: 'server' });

export async function startServer(
  adapter: TelegramAdapter,
  port: number,
  host: string = '0.0.0.0'
): Promise<void> {
  const app = express();

  // Middleware
  app.use(express.json());
  // Some providers send form-encoded data; keep urlencoded parser enabled
  app.use(express.urlencoded({ extended: false }));

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Routes
  const webhookRouter = createWebhookRouter(adapter);
  app.use('/webhook', webhookRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error: err }, 'Unhandled error in Express');
    res.status(500).json({ error: 'Internal server error' });
  });

  return new Promise((resolve) => {
    app.listen(port, host, () => {
      logger.info({ host, port }, 'HTTP server started');
      resolve();
    });
  });
}
