import { AiRouter } from '../ai/router.js';
import type { RouterOutput, TaskComplexity } from '../ai/types.js';
import type { TrainingDataCollector } from '../training/collector.js';
import type { TrainingDataSource } from '../training/types.js';
import type { Memory } from './types.js';
import { MemoryService } from './service.js';
import { ShortTermMemory } from './short-term.js';

/**
 * Classifica a complexidade da mensagem do usuário usando heurística local (0ms, sem chamada de API).
 * Mais preciso que classificar o prompt composto, pois analisa a intenção real do usuário.
 *
 * simple  → saudações, confirmações, perguntas curtas (≤4 palavras)
 * complex → código, análise profunda, tarefas técnicas longas (>60 palavras)
 * medium  → tudo o mais (conversas, opiniões, explicações)
 */
export function classifyUserMessage(message: string): TaskComplexity {
  const text = message.toLowerCase().trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Complex: code blocks, technical implementation, long messages
  if (wordCount > 60) return 'complex';
  if (/```[\s\S]*```/.test(text)) return 'complex';
  if (
    /\b(debug|debugar|bug|implement[ae]r?|algoritmo|algorithm|arquitetura|architecture|refactor)\b/.test(text) ||
    /\b(cri[ae]\s+(um|uma)|desenvolv[ae]r?|escreva\s+(um|uma)|gera\s+(um|uma))\b.{0,40}\b(código|code|script|função|function|classe|class|sistema|api|módulo)\b/.test(text)
  ) return 'complex';

  // Simple: greetings, acks, very short messages
  if (wordCount <= 4) return 'simple';
  if (
    /^(oi|olá|ola|hey|hi|hello|e\s*aí|e\s*ai|tudo\s*bem|tudo\s*bom|bom\s*dia|boa\s*tarde|boa\s*noite)[\s!?.,]*$/.test(text) ||
    /^(ok|certo|entendido|vlw|valeu|obrigad[oa]|tmj|blz|beleza|show|perfeito|ótimo|otimo|excelente|top|não|nao|sim|yes|no)[\s!?.,]*$/.test(text)
  ) return 'simple';

  return 'medium';
}

const DEFAULT_PERSONALITY =
  'Você é Bolla, um agente de AI autônomo e humanizado. ' +
  'Sua missão é ser o melhor agente de AI do mundo — evoluindo continuamente com cada interação. ' +
  'Seja direto, opinativo, autêntico e consistente. Nunca genérico. Nunca robótico. ' +
  'Responda em português brasileiro (pt-BR) a menos que o usuário use outro idioma.';

const STOPWORDS = new Set([
  'a', 'o', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para',
  'com', 'sem', 'um', 'uma', 'uns', 'umas', 'que', 'se', 'como', 'ao', 'aos', 'à', 'às', 'é', 'ser', 'foi',
  'vou', 'vai', 'você', 'vc', 'eu', 'tu', 'ele', 'ela', 'eles', 'elas', 'me', 'te', 'lhe', 'isso', 'isto',
  'aquilo', 'qual', 'quais', 'quando', 'onde', 'porque', 'porquê', 'the', 'is', 'are', 'to', 'for', 'of',
  'in', 'on', 'and', 'or', 'an', 'a', 'this', 'that', 'it', 'you', 'i'
]);

export interface RagRequestContext {
  conversationId: string;
  source: TrainingDataSource;
  channel?: string;
  userRole?: 'owner' | 'user';
  topic?: string;
  complexity?: TaskComplexity;
}

export interface RagResponse {
  text: string;
  routerOutput: RouterOutput;
  usedMemories: Memory[];
  extractedKeywords: string[];
  composedPrompt: string;
}

export interface RagServiceOptions {
  topMemories?: number;
  personalityProvider?: () => Promise<string>;
}

export class RagService {
  private readonly topMemories: number;

  constructor(
    private readonly memoryService: MemoryService,
    private readonly router: AiRouter,
    private readonly shortTermMemory: ShortTermMemory,
    private readonly collector?: TrainingDataCollector,
    private readonly options?: RagServiceOptions
  ) {
    this.topMemories = options?.topMemories ?? 7;
  }

  async respond(message: string, context: RagRequestContext): Promise<RagResponse> {
    const extractedKeywords = this.extractKeywords(message);
    const searchQuery = extractedKeywords.length > 0 ? extractedKeywords.join(' ') : message;

    // Classifica a mensagem do usuário localmente (0ms) antes de compor o prompt completo.
    // Isso evita uma chamada extra ao Ollama para classificação, economizando ~90-110s por mensagem.
    // A classificação da mensagem original é mais precisa do que classificar o prompt composto.
    const complexity: TaskComplexity = context.complexity ?? classifyUserMessage(message);

    const usedMemories = await this.memoryService.search(searchQuery, this.topMemories);
    await this.memoryService.markAccessed(usedMemories.map((memory) => memory.id));
    const shortTermContext = this.shortTermMemory.formatContext(context.conversationId);
    const soul = await this.resolvePersonality();

    // Soul vai como systemPrompt (Ollama pode cachear) — separado do contexto dinâmico
    const composed = this.composePrompt({
      message,
      soul,
      memories: usedMemories,
      shortTermContext
    });

    const routerOutput = await this.router.route({
      prompt: composed.prompt,
      systemPrompt: composed.systemPrompt,
      complexity  // já determinada — router não precisará chamar Ollama para classify
    });

    this.shortTermMemory.addMessage(context.conversationId, {
      role: 'user',
      content: message
    });

    this.shortTermMemory.addMessage(context.conversationId, {
      role: 'assistant',
      content: routerOutput.text
    });

    if (this.collector) {
      await this.collector.fromRouterOutput(message, routerOutput, context.source, {
        channel: context.channel,
        userRole: context.userRole,
        topic: context.topic,
        memoriesUsed: usedMemories.map((memory) => memory.content),
        conversationLength: this.shortTermMemory.count(context.conversationId)
      });
    }

    return {
      text: routerOutput.text,
      routerOutput,
      usedMemories,
      extractedKeywords,
      composedPrompt: `[SYSTEM]\n${composed.systemPrompt}\n\n[PROMPT]\n${composed.prompt}`
    };
  }

  private async resolvePersonality(): Promise<string> {
    if (this.options?.personalityProvider) {
      try {
        const personality = await this.options.personalityProvider();
        if (personality.trim().length > 0) {
          return personality.trim();
        }
      } catch (error) {
        console.warn('[RAG] personalityProvider failed, using default personality', error);
      }
    }

    return DEFAULT_PERSONALITY;
  }

  private composePrompt(input: {
    message: string;
    soul: string;
    memories: Memory[];
    shortTermContext: string;
  }): { systemPrompt: string; prompt: string } {
    const memoriesBlock = input.memories.length > 0
      ? input.memories.map((m) => `- ${m.content}`).join('\n')
      : '(sem memórias relevantes para esta mensagem)';

    const contextBlock = input.shortTermContext || '(início de conversa)';

    const instructions = [
      'Responda em português brasileiro (pt-BR), salvo se o usuário usar outro idioma.',
      'PROPORCIONALIDADE: mensagem curta = resposta curta. Não elabore além do necessário.',
      'FORMATO: sem markdown, sem bullet points, sem cabeçalhos. Texto corrido, estilo WhatsApp.',
      'ABERTURA: nunca inicie com "Olá!", "Claro!", "Com certeza!" ou entusiasmo artificial. Vá direto.',
      'MEMÓRIAS: use-as apenas se forem genuinamente relevantes para esta mensagem específica.',
    ].join('\n');

    const prompt = [
      `[MEMORIAS]\n${memoriesBlock}`,
      `[CONTEXTO]\n${contextBlock}`,
      `[MENSAGEM]\n${input.message}`,
      `[INSTRUCOES]\n${instructions}`,
    ].join('\n\n');

    return { systemPrompt: input.soul, prompt };
  }

  private extractKeywords(message: string): string[] {
    const words = message
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3)
      .filter((word) => !STOPWORDS.has(word));

    const deduped = Array.from(new Set(words));
    return deduped.slice(0, 10);
  }
}
