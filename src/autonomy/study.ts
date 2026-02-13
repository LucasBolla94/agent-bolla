import { AiRouter } from '../ai/router.js';
import { env } from '../config/env.js';
import { StudySessionsRepository } from '../database/repositories/study-sessions.js';
import { MemoryService } from '../memory/service.js';
import { TrainingDataCollector } from '../training/collector.js';
import { TwitterPlatform } from '../platforms/twitter.js';

export interface StudySchedulerDeps {
  router: AiRouter;
  twitter: TwitterPlatform;
  memory: MemoryService;
  collector: TrainingDataCollector;
  studySessionsRepo: StudySessionsRepository;
}

interface StudyConfig {
  enabled: boolean;
  intervalMinutes: number;
}

interface StudySource {
  text: string;
  url?: string;
  source: 'timeline' | 'trend';
}

export class StudyAutonomousScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: StudyConfig,
    private readonly deps: StudySchedulerDeps
  ) {}

  start(): void {
    if (!this.config.enabled) {
      console.log('[StudyScheduler] Disabled by configuration.');
      return;
    }

    console.log(`[StudyScheduler] Enabled with interval ${this.config.intervalMinutes} minutes.`);
    this.scheduleNext(10000);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNext(delayMs?: number): void {
    const ms = delayMs ?? this.config.intervalMinutes * 60 * 1000;
    this.timer = setTimeout(() => {
      void this.runCycle();
    }, ms);
  }

  private async runCycle(): Promise<void> {
    if (this.running) {
      this.scheduleNext();
      return;
    }

    this.running = true;

    try {
      const sources = await this.collectStudySources();
      if (sources.length === 0) {
        console.warn('[StudyScheduler] No study sources found.');
        return;
      }

      const topic = await this.chooseTopic(sources);
      const findings = await this.summarizeTopic(topic, sources);
      const sourceUrls = Array.from(new Set(sources.map((item) => item.url).filter(Boolean) as string[])).slice(0, 20);

      await this.deps.memory.saveRaw(
        `Study session on ${topic}: ${findings}`,
        'study',
        'learned_fact'
      );

      await this.deps.collector.saveStudy(topic, findings, {
        channel: 'internal',
        topic
      });

      await this.deps.studySessionsRepo.create({
        topic,
        findings,
        sourceUrls,
        trainingDataGenerated: 1
      });

      console.log('[StudyScheduler] Study session completed.', { topic, sources: sources.length });
    } catch (error) {
      console.error('[StudyScheduler] Failed run cycle:', error);
    } finally {
      this.running = false;
      this.scheduleNext();
    }
  }

  private async collectStudySources(): Promise<StudySource[]> {
    const timeline = await this.deps.twitter.readTimeline('following', 20);
    const trends = await this.deps.twitter.readTrendingTopics(10);

    const timelineSources: StudySource[] = timeline
      .filter((tweet) => tweet.text.trim().length > 0)
      .map((tweet) => ({
        text: tweet.text,
        url: tweet.url,
        source: 'timeline'
      }));

    const trendSources: StudySource[] = trends
      .filter((trend) => trend.title.trim().length > 0)
      .map((trend) => ({
        text: `${trend.title}${trend.subtitle ? ` - ${trend.subtitle}` : ''}`,
        source: 'trend'
      }));

    return [...timelineSources, ...trendSources].slice(0, 30);
  }

  private async chooseTopic(sources: StudySource[]): Promise<string> {
    const prompt = [
      'Escolha o melhor tópico técnico para uma sessão curta de estudo.',
      'Considere relevância e potencial de aprendizado prático.',
      'Responda com apenas uma linha contendo o tópico.',
      '',
      'Fontes disponíveis:',
      ...sources.slice(0, 20).map((source, idx) => `${idx + 1}. ${source.text}`)
    ].join('\n');

    const chosen = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    const topic = chosen.text.split('\n')[0].trim();
    if (topic.length > 0) {
      return topic.slice(0, 120);
    }

    return 'Tendências atuais de desenvolvimento de software';
  }

  private async summarizeTopic(topic: string, sources: StudySource[]): Promise<string> {
    const prompt = [
      'Faça um resumo de estudo objetivo em português brasileiro.',
      `Tema: ${topic}`,
      'Estrutura: visão geral, pontos práticos, riscos/limitações, próximo passo para estudar.',
      'Máximo 700 caracteres.',
      '',
      'Conteúdo base:',
      ...sources.slice(0, 18).map((source, idx) => `${idx + 1}. ${source.text}`)
    ].join('\n');

    const result = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    return result.text.trim();
  }
}

export const createStudyAutonomousScheduler = (deps: StudySchedulerDeps): StudyAutonomousScheduler => {
  const intervalRaw = Number(env.STUDY_INTERVAL_MIN || '30');
  const intervalMinutes = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 30;

  return new StudyAutonomousScheduler(
    {
      enabled: env.STUDY_AUTONOMOUS_ENABLED === 'true' && env.TWITTER_ENABLED === 'true',
      intervalMinutes
    },
    deps
  );
};
