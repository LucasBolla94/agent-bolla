import { logger } from './logger.js';

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const withRetry = async <T>(
  label: string,
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= options.attempts;
      logger.warn({ label, attempt, isLastAttempt, error }, 'Operation failed');

      if (isLastAttempt) break;

      const delayMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }

  throw lastError;
};
