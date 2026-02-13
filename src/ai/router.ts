import { AiClients } from './index.js';
import { AiProvider, RouterInput, RouterOutput, TaskComplexity } from './types.js';

const CLASSIFY_SYSTEM_PROMPT =
  'You are a task complexity classifier. Respond with exactly one word: simple, medium, or complex.';

const buildClassifyPrompt = (userPrompt: string): string =>
  `Classify the complexity of this task:
- simple: greetings, yes/no questions, basic facts, translation, basic classification
- medium: conversations, opinions, summaries, explanations, casual creative text
- complex: code generation, debugging, deep analysis, planning, research, structured documents

Task: "${userPrompt.slice(0, 500)}"

Respond with only one word (simple, medium, or complex):`;

/**
 * Provider priority chain per complexity level.
 * simple  → Ollama (fast, local)  → Grok → Anthropic
 * medium  → Grok (conversational) → Ollama → Anthropic
 * complex → Anthropic (powerful)  → Grok  → Ollama
 */
const PROVIDER_CHAIN: Record<TaskComplexity, AiProvider[]> = {
  simple:  ['ollama', 'grok', 'anthropic'],
  medium:  ['grok',   'ollama', 'anthropic'],
  complex: ['anthropic', 'grok', 'ollama'],
};

export class AiRouter {
  constructor(private readonly clients: AiClients) {}

  /**
   * Asks Ollama to classify the prompt complexity.
   * Falls back to 'complex' if classification fails or is ambiguous.
   */
  async classify(prompt: string): Promise<TaskComplexity> {
    try {
      const result = await this.clients.ollama.generateText({
        prompt: buildClassifyPrompt(prompt),
        systemPrompt: CLASSIFY_SYSTEM_PROMPT,
        temperature: 0,
      });

      const word = result.text.toLowerCase().trim().split(/\s+/)[0];

      if (word === 'simple' || word === 'medium' || word === 'complex') {
        return word;
      }

      console.warn('[AiRouter] Unexpected classification response:', result.text);
    } catch (error) {
      console.warn(
        '[AiRouter] Classification failed, defaulting to complex:',
        error instanceof Error ? error.message : error
      );
    }

    return 'complex';
  }

  /**
   * Routes the input to the best available AI provider based on task complexity.
   * Automatically falls back to the next provider in the chain if one fails.
   * Logs which provider was used, latency, and whether a fallback occurred.
   */
  async route(input: RouterInput): Promise<RouterOutput> {
    const complexity = input.complexity ?? (await this.classify(input.prompt));
    const chain = PROVIDER_CHAIN[complexity];

    let firstAttempt = true;
    let fallbackUsed = false;
    const errors: string[] = [];

    for (const provider of chain) {
      const client = this.clients[provider];

      if (!client) {
        errors.push(`${provider}: not configured`);
        continue;
      }

      if (!firstAttempt) {
        fallbackUsed = true;
        console.warn(`[AiRouter] Falling back to ${provider} (complexity: ${complexity})`);
      }

      firstAttempt = false;

      try {
        const result = await client.generateText(input);

        console.info(
          `[AiRouter] provider=${result.provider} complexity=${complexity} latency=${result.latencyMs}ms fallback=${fallbackUsed}`
        );

        return { ...result, complexity, fallbackUsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider}: ${message}`);
        console.warn(`[AiRouter] Provider ${provider} failed:`, message);
      }
    }

    throw new Error(
      `[AiRouter] All providers failed for complexity "${complexity}": ${errors.join(' | ')}`
    );
  }
}
