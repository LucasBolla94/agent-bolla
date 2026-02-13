import { env } from '../config/env.js';
import { AnthropicClient } from './anthropic.js';
import { GrokClient } from './grok.js';
import { OllamaClient } from './ollama.js';
import { AiTextClient } from './types.js';

export interface AiClients {
  ollama: OllamaClient;
  anthropic?: AnthropicClient;
  grok?: GrokClient;
}

export const createAiClients = (): AiClients => {
  const anthropic: AnthropicClient | undefined = env.ANTHROPIC_API_KEY ? new AnthropicClient() : undefined;
  const ollama = new OllamaClient({ fallbackClient: anthropic as AiTextClient | undefined });
  const grok: GrokClient | undefined = env.GROK_API_KEY && env.GROK_API_URL ? new GrokClient() : undefined;

  return {
    ollama,
    anthropic,
    grok
  };
};
