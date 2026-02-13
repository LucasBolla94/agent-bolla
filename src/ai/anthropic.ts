import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AiClientError } from './errors.js';
import { AiTextClient, GenerateTextInput, GenerateTextOutput } from './types.js';
import { isRetryableStatus, withRetry } from './utils.js';
import { RateLimiter } from '../ops/rate-limiter.js';

const PROVIDER = 'anthropic';
const limiter = new RateLimiter(PROVIDER, Number(env.ANTHROPIC_MIN_INTERVAL_MS || '500'));

interface AnthropicConfig {
  model: string;
  timeoutMs: number;
  maxTokens: number;
  retryAttempts: number;
}

export class AnthropicClient implements AiTextClient {
  public readonly provider = PROVIDER;

  private readonly client: Anthropic;
  private readonly config: AnthropicConfig;

  constructor(config?: Partial<AnthropicConfig>) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required to initialize AnthropicClient');
    }

    this.client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: config?.timeoutMs ?? Number(env.AI_TIMEOUT_MS)
    });

    this.config = {
      model: config?.model ?? env.ANTHROPIC_MODEL,
      timeoutMs: config?.timeoutMs ?? Number(env.AI_TIMEOUT_MS),
      maxTokens: config?.maxTokens ?? Number(env.ANTHROPIC_MAX_TOKENS),
      retryAttempts: config?.retryAttempts ?? Number(env.AI_RETRY_ATTEMPTS)
    };
  }

  public async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const startedAt = Date.now();

    const response = await limiter.run(async () => withRetry(
      async () => {
        try {
          return await this.client.messages.create({
            model: this.config.model,
            max_tokens: input.maxTokens ?? this.config.maxTokens,
            temperature: input.temperature,
            system: input.systemPrompt,
            messages: [{ role: 'user', content: input.prompt }]
          });
        } catch (error) {
          throw this.normalizeError(error);
        }
      },
      { attempts: this.config.retryAttempts },
      (error) => error instanceof AiClientError && error.retryable
    ));

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new AiClientError('Anthropic returned an empty text response', PROVIDER, { retryable: false });
    }

    return {
      provider: this.provider,
      model: response.model,
      text,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      raw: response
    };
  }

  private normalizeError(error: unknown): AiClientError {
    if (error instanceof AiClientError) {
      return error;
    }

    if (error instanceof Anthropic.APIError) {
      return new AiClientError(error.message, PROVIDER, {
        statusCode: error.status,
        retryable: error.status ? isRetryableStatus(error.status) : true,
        cause: error
      });
    }

    return new AiClientError('Unexpected Anthropic error', PROVIDER, { retryable: true, cause: error });
  }
}
