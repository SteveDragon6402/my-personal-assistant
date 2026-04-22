import { createLogger } from './logger.js';

const logger = createLogger({ component: 'retry' });

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: () => true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableByDefault(error: unknown): boolean {
  const record = error as Record<string, unknown> | undefined;
  const status = record?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return false;
  }
  return true;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isRetryable = opts.retryableErrors(error) && isRetryableByDefault(error);
      const hasMoreAttempts = attempt < opts.maxAttempts;

      if (!isRetryable || !hasMoreAttempts) {
        throw error;
      }

      logger.warn(
        { attempt, maxAttempts: opts.maxAttempts, delayMs: delay, error },
        'Operation failed, retrying'
      );

      await sleep(delay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}
