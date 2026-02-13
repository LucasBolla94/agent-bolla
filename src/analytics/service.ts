import { AiRouter } from '../ai/router.js';
import { PersonalitySuggestionsRepository } from '../database/repositories/personality-suggestions.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { TrainingDataCollector } from '../training/collector.js';

export interface AnalyticsOverview {
  totalBySourceAndType: Array<{ source: string; type: string; total: number; avgScore: number }>;
  topMemories: Array<{ id: number; content: string; accessCount: number }>;
  topTopics: Array<{ topic: string; total: number }>;
}

export interface PersonalitySuggestionOutput {
  id: number;
  trait: string;
  suggestedValue: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RawSuggestion {
  trait: string;
  value: string;
  reason: string;
}

export class AnalyticsService {
  constructor(
    private readonly collector: TrainingDataCollector,
    private readonly memory: MemoryService,
    private readonly personality: PersonalityService,
    private readonly router: AiRouter,
    private readonly suggestionsRepo: PersonalitySuggestionsRepository
  ) {}

  async getOverview(): Promise<AnalyticsOverview> {
    const [totalBySourceAndType, topMemories, topTopics] = await Promise.all([
      this.collector.statsBySourceAndType(),
      this.memory.topAccessed(10),
      this.collector.topDiscussedTopics(10)
    ]);

    return {
      totalBySourceAndType,
      topMemories: topMemories.map((memory) => ({
        id: memory.id,
        content: memory.content,
        accessCount: memory.accessCount
      })),
      topTopics
    };
  }

  async runPatternAnalysisCycle(): Promise<{
    insights: string;
    suggestions: PersonalitySuggestionOutput[];
  }> {
    const overview = await this.getOverview();
    const insights = await this.generateInsights(overview);

    await this.collector.save({
      type: 'analytics',
      input: 'periodic analytics cycle',
      output: insights,
      source: 'internal',
      context: {
        channel: 'internal',
        topic: 'analytics_pattern_analysis'
      },
      metadata: {
        topTopics: overview.topTopics,
        topMemories: overview.topMemories.slice(0, 5).map((m) => m.id)
      }
    });

    const suggestionDrafts = await this.generatePersonalitySuggestions(overview, insights);
    const persisted: PersonalitySuggestionOutput[] = [];

    for (const draft of suggestionDrafts) {
      const row = await this.suggestionsRepo.create({
        trait: draft.trait,
        suggestedValue: draft.value,
        reason: draft.reason,
        metadata: {
          source: 'analytics_cycle'
        }
      });

      persisted.push({
        id: row.id,
        trait: row.trait,
        suggestedValue: row.suggestedValue,
        reason: row.reason,
        status: row.status
      });
    }

    return {
      insights,
      suggestions: persisted
    };
  }

  async listPendingSuggestions(limit = 10): Promise<PersonalitySuggestionOutput[]> {
    const rows = await this.suggestionsRepo.listPending(limit);
    return rows.map((row) => ({
      id: row.id,
      trait: row.trait,
      suggestedValue: row.suggestedValue,
      reason: row.reason,
      status: row.status
    }));
  }

  async reviewSuggestion(id: number, approve: boolean): Promise<string> {
    const suggestion = await this.suggestionsRepo.findById(id);
    if (!suggestion) {
      return `Sugestão #${id} não encontrada.`;
    }

    if (suggestion.status !== 'pending') {
      return `Sugestão #${id} já foi revisada (${suggestion.status}).`;
    }

    if (!approve) {
      await this.suggestionsRepo.setStatus(id, 'rejected');
      return `Sugestão #${id} rejeitada.`;
    }

    await this.personality.set(suggestion.trait, suggestion.suggestedValue);
    await this.suggestionsRepo.setStatus(id, 'approved');

    return `Sugestão #${id} aprovada. Trait ${suggestion.trait} atualizada.`;
  }

  async formatDashboardText(): Promise<string> {
    const overview = await this.getOverview();

    const sourceLines = overview.totalBySourceAndType
      .slice(0, 20)
      .map((entry) => `${entry.source}/${entry.type}: ${entry.total} (score ${entry.avgScore})`);

    const memoryLines = overview.topMemories
      .slice(0, 5)
      .map((memory) => `#${memory.id} (${memory.accessCount}x): ${memory.content.slice(0, 80)}`);

    const topicLines = overview.topTopics
      .slice(0, 5)
      .map((topic) => `${topic.topic} (${topic.total})`);

    return [
      'Analytics Dashboard',
      '',
      'Interações por fonte/tipo:',
      ...(sourceLines.length > 0 ? sourceLines : ['- sem dados']),
      '',
      'Memórias mais acessadas:',
      ...(memoryLines.length > 0 ? memoryLines : ['- sem dados']),
      '',
      'Tópicos mais discutidos:',
      ...(topicLines.length > 0 ? topicLines : ['- sem dados'])
    ].join('\n');
  }

  private async generateInsights(overview: AnalyticsOverview): Promise<string> {
    const prompt = [
      'Analise os dados operacionais do agent e gere insights objetivos de melhoria.',
      'Responda em português brasileiro, em no máximo 12 linhas.',
      '',
      `Distribuição fonte/tipo: ${JSON.stringify(overview.totalBySourceAndType)}`,
      `Memórias mais acessadas: ${JSON.stringify(overview.topMemories.slice(0, 10))}`,
      `Tópicos mais discutidos: ${JSON.stringify(overview.topTopics)}`
    ].join('\n');

    const result = await this.router.route({
      prompt,
      complexity: 'complex'
    });

    return result.text.trim();
  }

  private async generatePersonalitySuggestions(
    overview: AnalyticsOverview,
    insights: string
  ): Promise<RawSuggestion[]> {
    const personality = this.personality.getAll();

    const prompt = [
      'Com base nos dados e insights, proponha até 3 ajustes de personalidade úteis.',
      'Traits permitidas: estilo_fala, humor_atual, nivel_formalidade, topico_favorito_atual, interesses, opinioes.',
      'Retorne SOMENTE JSON array: [{"trait":"...","value":"...","reason":"..."}]',
      '',
      `Personalidade atual: ${JSON.stringify(personality)}`,
      `Insights: ${insights}`,
      `Top tópicos: ${JSON.stringify(overview.topTopics)}`
    ].join('\n');

    const result = await this.router.route({
      prompt,
      complexity: 'complex'
    });

    try {
      const match = result.text.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const parsed = JSON.parse(match[0]) as RawSuggestion[];
      const allowedTraits = new Set([
        'estilo_fala',
        'humor_atual',
        'nivel_formalidade',
        'topico_favorito_atual',
        'interesses',
        'opinioes'
      ]);

      return parsed
        .filter((item) => item && typeof item.trait === 'string' && typeof item.value === 'string' && typeof item.reason === 'string')
        .filter((item) => allowedTraits.has(item.trait))
        .slice(0, 3);
    } catch {
      return [];
    }
  }
}
