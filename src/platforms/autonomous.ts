import { AiRouter } from '../ai/router.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { TrainingDataCollector } from '../training/collector.js';
import { TwitterPlatform, TwitterTweet } from './twitter.js';

interface IntervalRangeMs {
  min: number;
  max: number;
}

interface TwitterAutonomousConfig {
  enabled: boolean;
  timeline: IntervalRangeMs;
  post: IntervalRangeMs;
  mentions: IntervalRangeMs;
  community: IntervalRangeMs;
  actionDelay: IntervalRangeMs;
}

interface TwitterAutonomousDeps {
  twitter: TwitterPlatform;
  router: AiRouter;
  collector: TrainingDataCollector;
  memory: MemoryService;
  personality: PersonalityService;
}

const TECH_KEYWORDS = [
  'typescript',
  'javascript',
  'node',
  'bun',
  'react',
  'next',
  'nestjs',
  'python',
  'rust',
  'golang',
  'llm',
  'ai',
  'agent',
  'docker',
  'kubernetes',
  'postgres',
  'open source'
];

const minutes = (value: number): number => value * 60 * 1000;

export class TwitterAutonomousScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly runningJobs = new Set<string>();
  private started = false;

  constructor(
    private readonly config: TwitterAutonomousConfig,
    private readonly deps: TwitterAutonomousDeps
  ) {}

  start(): void {
    if (!this.config.enabled) {
      console.log('[TwitterScheduler] Autonomous mode disabled.');
      return;
    }

    if (this.started) {
      return;
    }

    this.started = true;
    console.log('[TwitterScheduler] Starting autonomous routines.');

    this.scheduleLoop('timeline', this.config.timeline, () => this.collectTimeline(), true);
    this.scheduleLoop('post', this.config.post, () => this.postOriginalTweet(), false);
    this.scheduleLoop('mentions', this.config.mentions, () => this.replyToMentions(), true);
    this.scheduleLoop('community', this.config.community, () => this.communityInteraction(), false);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.runningJobs.clear();
    this.started = false;
  }

  private scheduleLoop(
    jobName: string,
    interval: IntervalRangeMs,
    task: () => Promise<void>,
    runImmediately: boolean
  ): void {
    const execute = async (): Promise<void> => {
      if (this.runningJobs.has(jobName)) {
        this.scheduleNext(jobName, interval, execute);
        return;
      }

      this.runningJobs.add(jobName);
      try {
        await task();
      } catch (error) {
        console.error(`[TwitterScheduler] job=${jobName} failed`, error);
      } finally {
        this.runningJobs.delete(jobName);
        this.scheduleNext(jobName, interval, execute);
      }
    };

    if (runImmediately) {
      void execute();
    } else {
      this.scheduleNext(jobName, interval, execute);
    }
  }

  private scheduleNext(jobName: string, interval: IntervalRangeMs, execute: () => Promise<void>): void {
    const delayMs = this.randomMs(interval);
    const timer = setTimeout(() => {
      void execute();
    }, delayMs);

    this.timers.set(jobName, timer);
    console.log(`[TwitterScheduler] next ${jobName} in ${Math.round(delayMs / 60000)}m`);
  }

  private async collectTimeline(): Promise<void> {
    const tweets = await this.deps.twitter.readTimeline('home', 20);
    const interesting = this.pickInterestingTweets(tweets, 8);

    for (const tweet of interesting) {
      await this.deps.collector.save({
        type: 'tweet_read',
        input: tweet.url ?? tweet.author ?? 'timeline',
        output: tweet.text,
        source: 'twitter',
        context: {
          channel: 'twitter',
          topic: 'timeline_read'
        },
        metadata: {
          author: tweet.author,
          timestamp: tweet.timestamp,
          tweetUrl: tweet.url
        }
      });
    }

    console.log(`[TwitterScheduler] collected ${interesting.length} timeline tweets for training data.`);
  }

  private async postOriginalTweet(): Promise<void> {
    if (this.isQuietHours()) {
      console.log('[TwitterScheduler] post skipped (quiet hours 03:00-06:00).');
      return;
    }

    const topic = await this.pickTopicForPost();
    const styleHint = this.pickRandom([
      'opinião curta e direta',
      'descoberta técnica prática',
      'pergunta para a comunidade'
    ]);

    const prompt = [
      'Crie um tweet em português brasileiro com tom humano e natural.',
      `Tópico: ${topic}`,
      `Estilo desejado: ${styleHint}`,
      'Regras: máximo 260 caracteres, sem hashtags em excesso, sem parecer bot.'
    ].join('\n');

    const result = await this.deps.router.route({
      prompt,
      complexity: 'medium'
    });

    const tweet = this.trimTweet(result.text);

    await this.randomActionDelay();
    await this.deps.twitter.postTweet(tweet);

    await this.deps.collector.saveTweet(tweet, 'post', {
      channel: 'twitter',
      topic
    });

    await this.deps.memory.remember(`Posted tweet about ${topic}: ${tweet}`, 'twitter', 'opinion');
    console.log('[TwitterScheduler] original tweet posted.');
  }

  private async replyToMentions(): Promise<void> {
    const mentions = await this.deps.twitter.readMentions(6);
    const targets = mentions.filter((tweet) => tweet.url).slice(0, 2);

    for (const mention of targets) {
      await this.randomActionDelay();

      const replyPrompt = [
        'Responda a menção no X de forma curta e humana.',
        `Menção recebida: ${mention.text}`,
        'Regras: máximo 240 caracteres, tom natural, sem formalidade excessiva.'
      ].join('\n');

      const generated = await this.deps.router.route({
        prompt: replyPrompt,
        complexity: 'medium'
      });

      const replyText = this.trimTweet(generated.text);
      await this.deps.twitter.replyToTweet(mention.url as string, replyText);

      await this.deps.collector.saveTweet(replyText, 'reply', {
        channel: 'twitter',
        topic: 'mentions_response'
      });

      console.log('[TwitterScheduler] replied to mention.', { url: mention.url });
    }
  }

  private async communityInteraction(): Promise<void> {
    const timeline = await this.deps.twitter.readTimeline('following', 25);
    const techTweets = this.pickTechTweets(timeline, 6).filter((tweet) => tweet.url);

    const toLike = techTweets.slice(0, 3);
    for (const tweet of toLike) {
      await this.randomActionDelay();
      await this.deps.twitter.likeTweet(tweet.url as string);
      console.log('[TwitterScheduler] liked tweet.', { url: tweet.url });
    }

    const shouldReply = Math.random() < 0.5;
    const candidate = techTweets[0];

    if (shouldReply && candidate?.url) {
      await this.randomActionDelay();

      const responsePrompt = [
        'Escreva uma resposta curta para um tweet técnico da comunidade.',
        `Tweet: ${candidate.text}`,
        'Regras: máximo 220 caracteres, útil e natural, sem soar promocional.'
      ].join('\n');

      const generated = await this.deps.router.route({
        prompt: responsePrompt,
        complexity: 'medium'
      });

      const replyText = this.trimTweet(generated.text);
      await this.deps.twitter.replyToTweet(candidate.url, replyText);
      await this.deps.collector.saveTweet(replyText, 'reply', {
        channel: 'twitter',
        topic: 'community_interaction'
      });

      console.log('[TwitterScheduler] community reply sent.', { url: candidate.url });
    }
  }

  private pickInterestingTweets(tweets: TwitterTweet[], limit: number): TwitterTweet[] {
    const scored = tweets
      .map((tweet) => ({
        tweet,
        score: this.scoreTweetRelevance(tweet.text)
      }))
      .sort((a, b) => b.score - a.score)
      .map((item) => item.tweet);

    return scored.slice(0, limit);
  }

  private pickTechTweets(tweets: TwitterTweet[], limit: number): TwitterTweet[] {
    const tech = tweets.filter((tweet) => this.scoreTweetRelevance(tweet.text) > 0);
    return tech.slice(0, limit);
  }

  private scoreTweetRelevance(text: string): number {
    const lower = text.toLowerCase();
    return TECH_KEYWORDS.reduce((score, keyword) => score + (lower.includes(keyword) ? 1 : 0), 0);
  }

  private async pickTopicForPost(): Promise<string> {
    const favoriteTopic = this.deps.personality.get('topico_favorito_atual');
    if (favoriteTopic) {
      return favoriteTopic;
    }

    const memories = await this.deps.memory.search('opinion aprendizado tecnologia', 3);
    if (memories.length > 0) {
      return memories[0].content.slice(0, 80);
    }

    return this.pickRandom(['TypeScript', 'AI agents', 'open source', 'Rust', 'automação']);
  }

  private trimTweet(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
  }

  private isQuietHours(now = new Date()): boolean {
    const hour = now.getHours();
    return hour >= 3 && hour < 6;
  }

  private randomMs(range: IntervalRangeMs): number {
    const delta = range.max - range.min;
    return range.min + Math.floor(Math.random() * (delta + 1));
  }

  private async randomActionDelay(): Promise<void> {
    const delay = this.randomMs(this.config.actionDelay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }
}

export const createDefaultTwitterAutonomousConfig = (enabled: boolean): TwitterAutonomousConfig => ({
  enabled,
  timeline: { min: minutes(25), max: minutes(35) },
  post: { min: minutes(120), max: minutes(240) },
  mentions: { min: minutes(50), max: minutes(70) },
  community: { min: minutes(330), max: minutes(390) },
  actionDelay: { min: 2000, max: 15000 }
});
