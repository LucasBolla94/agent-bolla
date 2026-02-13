export type AiProvider = 'ollama' | 'anthropic' | 'grok';

export interface GenerateTextInput {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface GenerateTextOutput {
  provider: AiProvider;
  model: string;
  text: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  raw?: unknown;
}

export interface AiTextClient {
  provider: AiProvider;
  generateText(input: GenerateTextInput): Promise<GenerateTextOutput>;
}

export interface RetryConfig {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export interface RouterInput extends GenerateTextInput {
  complexity?: TaskComplexity;
}

export interface RouterOutput extends GenerateTextOutput {
  complexity: TaskComplexity;
  fallbackUsed: boolean;
}
