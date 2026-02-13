import { AiRouter } from '../ai/router.js';
import type { RouterOutput, TaskComplexity } from '../ai/types.js';
import type { TrainingDataCollector } from '../training/collector.js';
import type { TrainingDataSource } from '../training/types.js';
import type { Memory } from './types.js';
import { MemoryService } from './service.js';
import { ShortTermMemory } from './short-term.js';

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

    const usedMemories = await this.memoryService.search(searchQuery, this.topMemories);
    await this.memoryService.markAccessed(usedMemories.map((memory) => memory.id));
    const shortTermContext = this.shortTermMemory.formatContext(context.conversationId);
    const personality = await this.resolvePersonality();

    const composedPrompt = this.composePrompt({
      message,
      personality,
      memories: usedMemories,
      shortTermContext
    });

    const routerOutput = await this.router.route({
      prompt: composedPrompt,
      complexity: context.complexity
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
      composedPrompt
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
    personality: string;
    memories: Memory[];
    shortTermContext: string;
  }): string {
    const memoriesBlock = input.memories.length
      ? `Relevant long-term memories:\n${input.memories.map((memory) => `- ${memory.content}`).join('\n')}`
      : 'Relevant long-term memories:\n- None';

    const shortTermBlock = input.shortTermContext || 'Short-term conversation context:\n- None';

    return [
      `[Personality]\n${input.personality}`,
      `[Memories]\n${memoriesBlock}`,
      `[ShortTerm]\n${shortTermBlock}`,
      `[UserMessage]\n${input.message}`,
      'Responda de forma natural e humana. Use as memórias apenas se forem realmente relevantes para esta mensagem específica. ' +
      'Se a mensagem for curta ou casual (saudação, pergunta simples), responda de forma igualmente curta e direta — não elabore desnecessariamente. ' +
      'Nunca inicie com frases genéricas como "Olá!", "Claro!", "Com certeza!" ou entusiasmo exagerado. Vá direto ao ponto.'
    ].join('\n\n');
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
