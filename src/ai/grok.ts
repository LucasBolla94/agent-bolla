import { env } from '../config/env.js';
import { AiClientError } from './errors.js';
import { AiTextClient, GenerateTextInput, GenerateTextOutput } from './types.js';
import { fetchWithTimeout, isRetryableStatus, withRetry } from './utils.js';

const PROVIDER = 'grok';

interface GrokConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  retryAttempts: number;
  maxTokens: number;
}

interface GrokResponse {
  id: string;
  model: string;
  choices: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export class GrokClient implements AiTextClient {
  public readonly provider = PROVIDER;

  private readonly config: GrokConfig;

  constructor(config?: Partial<GrokConfig>) {
    this.config = {
      apiUrl: config?.apiUrl ?? env.GROK_API_URL ?? '',
      apiKey: config?.apiKey ?? env.GROK_API_KEY ?? '',
      model: config?.model ?? env.GROK_MODEL,
      timeoutMs: config?.timeoutMs ?? Number(env.AI_TIMEOUT_MS),
      retryAttempts: config?.retryAttempts ?? Number(env.AI_RETRY_ATTEMPTS),
      maxTokens: config?.maxTokens ?? Number(env.GROK_MAX_TOKENS)
    };

    if (!this.config.apiUrl) {
      throw new Error('GROK_API_URL is required to initialize GrokClient');
    }

    if (!this.config.apiKey) {
      throw new Error('GROK_API_KEY is required to initialize GrokClient');
    }
  }

  public async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const startedAt = Date.now();

    const response = await withRetry(
      async () => {
        const httpResponse = await fetchWithTimeout(
          this.config.apiUrl,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
              model: this.config.model,
              stream: false,
              temperature: input.temperature,
              max_tokens: input.maxTokens ?? this.config.maxTokens,
              messages: [
                ...(input.systemPrompt ? [{ role: 'system', content: input.systemPrompt }] : []),
                { role: 'user', content: input.prompt }
              ]
            })
          },
          this.config.timeoutMs,
          PROVIDER
        );

        if (!httpResponse.ok) {
          const errorBody = await httpResponse.text();
          throw new AiClientError(
            `Grok request failed (${httpResponse.status}): ${errorBody}`,
            PROVIDER,
            {
              statusCode: httpResponse.status,
              retryable: isRetryableStatus(httpResponse.status)
            }
          );
        }

        return (await httpResponse.json()) as GrokResponse;
      },
      { attempts: this.config.retryAttempts },
      (error) => error instanceof AiClientError && error.retryable
    );

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new AiClientError('Grok returned an empty text response', PROVIDER, { retryable: false });
    }

    return {
      provider: this.provider,
      model: response.model || this.config.model,
      text,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
      raw: response
    };
  }
}
