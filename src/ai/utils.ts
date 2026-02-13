import { AiClientError } from './errors.js';
import { RetryConfig } from './types.js';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 3000
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
  shouldRetry?: (error: unknown) => boolean
): Promise<T> => {
  const finalConfig: RetryConfig = {
    attempts: config?.attempts ?? DEFAULT_RETRY_CONFIG.attempts,
    baseDelayMs: config?.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: config?.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryAllowed = shouldRetry ? shouldRetry(error) : defaultShouldRetry(error);
      const hasNextAttempt = attempt < finalConfig.attempts;

      if (!retryAllowed || !hasNextAttempt) {
        throw error;
      }

      const backoffMs = Math.min(finalConfig.maxDelayMs, finalConfig.baseDelayMs * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }

  throw lastError;
};

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiClientError(`Request timed out after ${timeoutMs}ms`, provider, { retryable: true, cause: error });
    }

    throw new AiClientError('Network request failed', provider, { retryable: true, cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const defaultShouldRetry = (error: unknown): boolean => {
  if (error instanceof AiClientError) {
    return error.retryable;
  }

  return true;
};

export const isRetryableStatus = (statusCode: number): boolean => {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
};
