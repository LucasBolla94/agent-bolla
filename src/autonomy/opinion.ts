import { AiRouter } from '../ai/router.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { TrainingDataCollector } from '../training/collector.js';

export interface OpinionSource {
  text: string;
  url?: string;
  source: string;
}

export interface OpinionResult {
  topic: string;
  opinion: string;
  pros: string[];
  cons: string[];
  changedFromPrevious: boolean;
  previousOpinion?: string;
}

export class OpinionEngine {
  constructor(
    private readonly router: AiRouter,
    private readonly memory: MemoryService,
    private readonly collector: TrainingDataCollector,
    private readonly personality: PersonalityService
  ) {}

  async formOrEvolve(topic: string, sources: OpinionSource[]): Promise<OpinionResult> {
    const previousOpinion = await this.findPreviousOpinion(topic);

    const prompt = [
      'Você está formando opinião técnica baseada em múltiplas fontes.',
      `Tema: ${topic}`,
      previousOpinion ? `Opinião anterior: ${previousOpinion}` : 'Opinião anterior: nenhuma',
      'Tarefa: leia as fontes, sintetize prós e contras e forme uma opinião clara.',
      'Formato JSON obrigatório:',
      '{"opinion":"...","pros":["..."],"cons":["..."],"changed_from_previous":true|false}',
      'Se houver argumento melhor que contradiz opinião anterior, mude com justificativa.',
      '',
      'Fontes:',
      ...sources.slice(0, 24).map((source, idx) => `${idx + 1}. (${source.source}) ${source.text}`)
    ].join('\n');

    const generated = await this.router.route({
      prompt,
      complexity: 'complex'
    });

    const parsed = this.parseOpinionJson(generated.text);

    const opinion = parsed?.opinion?.trim() || generated.text.trim();
    const pros = (parsed?.pros || []).map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 5);
    const cons = (parsed?.cons || []).map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 5);

    const changedFromPrevious = parsed?.changed_from_previous
      ?? this.detectOpinionChange(previousOpinion, opinion);

    const packedOpinion = this.buildPackedOpinion(topic, opinion, pros, cons, changedFromPrevious, previousOpinion);

    await this.memory.saveRaw(packedOpinion, 'study', 'opinion');

    await this.collector.save({
      type: 'opinion',
      input: topic,
      output: opinion,
      source: 'internal',
      context: {
        channel: 'internal',
        topic
      },
      metadata: {
        pros,
        cons,
        changedFromPrevious,
        previousOpinion,
        sourceCount: sources.length
      }
    });

    await this.mergeOpinionIntoPersonality(topic, opinion);

    return {
      topic,
      opinion,
      pros,
      cons,
      changedFromPrevious,
      previousOpinion: previousOpinion || undefined
    };
  }

  private async findPreviousOpinion(topic: string): Promise<string> {
    const memories = await this.memory.search(`opinion ${topic}`, 6);
    const opinionMemory = memories.find((memory) => memory.category === 'opinion');
    return opinionMemory?.content ?? '';
  }

  private parseOpinionJson(raw: string): {
    opinion?: string;
    pros?: string[];
    cons?: string[];
    changed_from_previous?: boolean;
  } | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as {
        opinion?: string;
        pros?: string[];
        cons?: string[];
        changed_from_previous?: boolean;
      };
      return parsed;
    } catch {
      return null;
    }
  }

  private detectOpinionChange(previousOpinion: string, newOpinion: string): boolean {
    if (!previousOpinion.trim()) return false;
    const prev = previousOpinion.toLowerCase().replace(/\s+/g, ' ').trim();
    const next = newOpinion.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!prev || !next) return false;
    return prev !== next;
  }

  private buildPackedOpinion(
    topic: string,
    opinion: string,
    pros: string[],
    cons: string[],
    changed: boolean,
    previousOpinion: string
  ): string {
    const prosPart = pros.length > 0 ? `Pros: ${pros.join('; ')}` : 'Pros: none';
    const consPart = cons.length > 0 ? `Cons: ${cons.join('; ')}` : 'Cons: none';
    const evolution = changed ? `Opinion evolved from previous: ${previousOpinion || 'n/a'}` : 'Opinion kept stable';

    return `Opinion on ${topic}: ${opinion}. ${prosPart}. ${consPart}. ${evolution}.`;
  }

  private async mergeOpinionIntoPersonality(topic: string, opinion: string): Promise<void> {
    const current = this.personality.get('opinioes');
    const snippet = `${topic}: ${opinion}`.slice(0, 300);

    const entries = current
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => !item.toLowerCase().startsWith(`${topic.toLowerCase()}:`));

    entries.unshift(snippet);
    const merged = entries.slice(0, 12).join('; ');

    await this.personality.set('opinioes', merged);
  }
}
