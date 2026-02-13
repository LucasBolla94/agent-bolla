import { env } from '../config/env.js';
import { AiClientError } from './errors.js';
import { AiTextClient, GenerateTextInput, GenerateTextOutput } from './types.js';
import { fetchWithTimeout, isRetryableStatus, withRetry } from './utils.js';
import { RateLimiter } from '../ops/rate-limiter.js';

const PROVIDER = 'ollama';
const limiter = new RateLimiter(PROVIDER, Number(env.OLLAMA_MIN_INTERVAL_MS || '200'));

interface OllamaConfig {
  apiUrl: string;
  contentType: string;
  model: string;
  stream: boolean;
  timeoutMs: number;
  retryAttempts: number;
}

interface OllamaResponse {
  model?: string;
  response?: string;
}

interface OllamaClientOptions {
  config?: Partial<OllamaConfig>;
  fallbackClient?: AiTextClient;
}

export class OllamaClient implements AiTextClient {
  public readonly provider = PROVIDER;

  private readonly config: OllamaConfig;
  private readonly fallbackClient?: AiTextClient;

  constructor(options?: OllamaClientOptions) {
    this.config = {
      apiUrl: options?.config?.apiUrl ?? env.AI_API_URL,
      contentType: options?.config?.contentType ?? env.AI_API_CONTENT_TYPE,
      model: options?.config?.model ?? env.AI_API_MODEL,
      stream: options?.config?.stream ?? env.AI_API_STREAM === 'true',
      timeoutMs: options?.config?.timeoutMs ?? Number(env.AI_TIMEOUT_MS),
      retryAttempts: options?.config?.retryAttempts ?? Number(env.AI_RETRY_ATTEMPTS)
    };

    if (!this.config.apiUrl) {
      throw new Error('AI_API_URL is required to initialize OllamaClient');
    }

    this.fallbackClient = options?.fallbackClient;
  }

  public async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const startedAt = Date.now();

    try {
      const response = await limiter.run(async () => withRetry(
        async () => {
          const httpResponse = await fetchWithTimeout(
            this.config.apiUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': this.config.contentType
              },
              body: JSON.stringify({
                model: this.config.model,
                prompt: input.prompt,
                stream: input.stream ?? this.config.stream,
                system: input.systemPrompt,
                options: {
                  temperature: input.temperature
                }
              })
            },
            this.config.timeoutMs,
            PROVIDER
          );

          if (!httpResponse.ok) {
            const errorBody = await httpResponse.text();
            throw new AiClientError(
              `Ollama request failed (${httpResponse.status}): ${errorBody}`,
              PROVIDER,
              {
                statusCode: httpResponse.status,
                retryable: isRetryableStatus(httpResponse.status)
              }
            );
          }

          return (await httpResponse.json()) as OllamaResponse;
        },
        { attempts: this.config.retryAttempts },
        (error) => error instanceof AiClientError && error.retryable
      ));

      const text = response.response?.trim();
      if (!text) {
        throw new AiClientError('Ollama returned an empty text response', PROVIDER, { retryable: false });
      }

      return {
        provider: this.provider,
        model: response.model || this.config.model,
        text,
        latencyMs: Date.now() - startedAt,
        raw: response
      };
    } catch (error) {
      if (!this.fallbackClient) {
        throw error;
      }

      console.warn('Ollama unavailable, falling back to secondary provider', {
        fallbackProvider: this.fallbackClient.provider,
        error: error instanceof Error ? error.message : error
      });

      return this.fallbackClient.generateText(input);
    }
  }
}
