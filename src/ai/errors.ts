export class AiClientError extends Error {
  public readonly provider: string;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(message: string, provider: string, options?: { retryable?: boolean; statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = 'AiClientError';
    this.provider = provider;
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;

    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}
