import pino from 'pino';

let correlationId: string | undefined;

export function setCorrelationId(id: string): void {
  correlationId = id;
}

export function getCorrelationId(): string | undefined {
  return correlationId;
}

export function clearCorrelationId(): void {
  correlationId = undefined;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createLogger(context?: Record<string, unknown>): pino.Logger {
  const loggerOptions: pino.LoggerOptions =
    process.env.NODE_ENV === 'development'
      ? {
          level: process.env.LOG_LEVEL || 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : {
          level: process.env.LOG_LEVEL || 'info',
        };

  const baseLogger = pino(loggerOptions);

  const correlationIdValue = correlationId || generateCorrelationId();
  if (!correlationId) {
    setCorrelationId(correlationIdValue);
  }

  return baseLogger.child({
    correlationId: correlationIdValue,
    ...context,
  });
}

export const logger = createLogger();
