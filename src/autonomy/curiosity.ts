import { TrainingDataCollector } from '../training/collector.js';
import { PersonalityService } from '../personality/service.js';

export interface TopicScore {
  topic: string;
  score: number;
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'por', 'com', 'sem',
  'que', 'como', 'uma', 'um', 'em', 'na', 'no', 'nas', 'nos', 'sobre', 'mais', 'menos',
  'the', 'is', 'are', 'for', 'to', 'and', 'or', 'in', 'on'
]);

export class CuriosityEngine {
  private interestScores = new Map<string, number>();
  private loaded = false;

  constructor(
    private readonly personality: PersonalityService,
    private readonly collector: TrainingDataCollector
  ) {}

  async load(): Promise<void> {
    this.interestScores.clear();

    const current = this.personality.get('interesses');
    const seeds = current
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    for (const seed of seeds) {
      this.addInterest(seed, 1.0);
    }

    const engagedTopics = await this.collector.getTopTwitterTopics(40);
    for (const topic of engagedTopics) {
      this.addInterest(topic.topic, Math.max(0.5, topic.score));
    }

    this.loaded = true;
  }

  async absorbSignals(signals: string[]): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }

    for (const signal of signals) {
      for (const candidate of this.extractCandidateTopics(signal)) {
        this.addInterest(candidate, 0.2);
      }
    }

    await this.refreshFromEngagement();
    await this.persistInterests();
  }

  async pickTopicForStudy(fallbackTopic: string): Promise<string> {
    if (!this.loaded) {
      await this.load();
    }

    const sorted = this.getSortedInterests();
    if (sorted.length === 0) {
      return fallbackTopic;
    }

    const top = sorted.slice(0, 8);
    const weightedPool: string[] = [];

    for (const item of top) {
      const weight = Math.max(1, Math.round(item.score));
      for (let i = 0; i < weight; i += 1) {
        weightedPool.push(item.topic);
      }
    }

    if (weightedPool.length === 0) {
      return top[0].topic;
    }

    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
  }

  async syncFavoriteTopic(): Promise<void> {
    const top = this.getSortedInterests()[0];
    if (!top) return;

    await this.personality.set('topico_favorito_atual', top.topic);
  }

  getTopInterests(limit = 10): TopicScore[] {
    return this.getSortedInterests().slice(0, limit);
  }

  private extractCandidateTopics(text: string): string[] {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3)
      .filter((word) => !STOPWORDS.has(word));

    const unique = Array.from(new Set(cleaned));
    return unique.slice(0, 8);
  }

  private addInterest(topic: string, delta: number): void {
    const normalized = topic.trim().toLowerCase();
    if (!normalized) return;

    const current = this.interestScores.get(normalized) ?? 0;
    this.interestScores.set(normalized, current + delta);
  }

  private async refreshFromEngagement(): Promise<void> {
    const engagedTopics = await this.collector.getTopTwitterTopics(20);
    for (const topic of engagedTopics) {
      this.addInterest(topic.topic, topic.score * 0.3);
    }
  }

  private async persistInterests(): Promise<void> {
    const topInterests = this.getSortedInterests().slice(0, 20).map((item) => item.topic);
    await this.personality.set('interesses', topInterests.join(', '));
    await this.syncFavoriteTopic();
  }

  private getSortedInterests(): TopicScore[] {
    return Array.from(this.interestScores.entries())
      .map(([topic, score]) => ({ topic, score }))
      .sort((a, b) => b.score - a.score);
  }
}
