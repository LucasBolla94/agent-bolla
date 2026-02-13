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

type ContentKind = 'opinion' | 'discovery' | 'question' | 'thread' | 'contextual_reply';

interface ContentDraft {
  kind: ContentKind;
  topic: string;
  prompt: string;
  text: string;
  threadParts?: string[];
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
    this.scheduleLoop('post', this.config.post, () => this.publishContent(), false);
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
        try {
          await this.deps.twitter.reconnect();
          console.warn('[TwitterScheduler] attempted twitter reconnect after job failure.');
        } catch (reconnectError) {
          console.error('[TwitterScheduler] twitter reconnect failed', reconnectError);
        }
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
          tweetUrl: tweet.url,
          kind: 'timeline_context'
        }
      });
    }

    console.log(`[TwitterScheduler] collected ${interesting.length} timeline tweets for training data.`);
  }

  private async publishContent(): Promise<void> {
    if (this.isQuietHours()) {
      console.log('[TwitterScheduler] post skipped (quiet hours 03:00-06:00).');
      return;
    }

    const topic = await this.pickTopicForPost();
    const kind = this.pickRandom<ContentKind>(['opinion', 'discovery', 'question', 'thread']);

    const draft = await this.generateDraft(kind, topic);
    const reviewed = await this.reviewAndRefineDraft(draft);

    await this.randomActionDelay();

    if (reviewed.kind === 'thread' && reviewed.threadParts && reviewed.threadParts.length > 1) {
      await this.deps.twitter.postThread(reviewed.threadParts);
      for (const part of reviewed.threadParts) {
        await this.deps.collector.saveTweet(part, 'post', {
          contentKind: 'thread',
          topic,
          reviewApproved: true,
          generatedPrompt: reviewed.prompt
        });
      }
      await this.deps.memory.remember(`Posted thread about ${topic}: ${reviewed.threadParts.join(' | ')}`, 'twitter', 'opinion');
      console.log('[TwitterScheduler] thread posted.', { parts: reviewed.threadParts.length });
      return;
    }

    const tweet = this.trimTweet(reviewed.text);
    await this.deps.twitter.postTweet(tweet);

    await this.deps.collector.saveTweet(tweet, 'post', {
      contentKind: reviewed.kind,
      topic,
      reviewApproved: true,
      generatedPrompt: reviewed.prompt
    });

    await this.deps.memory.remember(`Posted ${reviewed.kind} tweet about ${topic}: ${tweet}`, 'twitter', 'opinion');
    console.log('[TwitterScheduler] original tweet posted.', { kind: reviewed.kind });
  }

  private async replyToMentions(): Promise<void> {
    const mentions = await this.deps.twitter.readMentions(6);
    const targets = mentions.filter((tweet) => tweet.url).slice(0, 2);

    for (const mention of targets) {
      await this.randomActionDelay();

      const draft = await this.generateContextualReply(mention, 'mention_reply');
      const reviewed = await this.reviewAndRefineDraft(draft);

      const replyText = this.trimTweet(reviewed.text);
      await this.deps.twitter.replyToTweet(mention.url as string, replyText);

      await this.deps.collector.saveTweet(replyText, 'reply', {
        contentKind: 'contextual_reply',
        topic: 'mentions_response',
        reviewApproved: true,
        sourceTweetUrl: mention.url,
        sourceTweetAuthor: mention.author,
        sourceTweetText: mention.text
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

      const draft = await this.generateContextualReply(candidate, 'community_reply');
      const reviewed = await this.reviewAndRefineDraft(draft);

      const replyText = this.trimTweet(reviewed.text);
      await this.deps.twitter.replyToTweet(candidate.url, replyText);
      await this.deps.collector.saveTweet(replyText, 'reply', {
        contentKind: 'contextual_reply',
        topic: 'community_interaction',
        reviewApproved: true,
        sourceTweetUrl: candidate.url,
        sourceTweetAuthor: candidate.author,
        sourceTweetText: candidate.text
      });

      console.log('[TwitterScheduler] community reply sent.', { url: candidate.url });
    }
  }

  private async generateDraft(kind: ContentKind, topic: string): Promise<ContentDraft> {
    const prompt = this.buildTweetPrompt(kind, topic);

    const result = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    if (kind === 'thread') {
      const threadParts = this.parseThread(result.text);
      const text = threadParts.length > 0 ? threadParts.join('\n') : result.text;
      return { kind, topic, prompt, text, threadParts };
    }

    return {
      kind,
      topic,
      prompt,
      text: this.trimTweet(result.text)
    };
  }

  private async generateContextualReply(tweet: TwitterTweet, topic: string): Promise<ContentDraft> {
    const prompt = [
      'Responda a este tweet no X de forma humana, curta e contextual.',
      `Tweet original: ${tweet.text}`,
      `Autor: ${tweet.author ?? 'desconhecido'}`,
      'Regras: máximo 240 caracteres, sem soar robótico, útil e natural.'
    ].join('\n');

    const result = await this.deps.router.route({
      prompt,
      complexity: 'complex'
    });

    return {
      kind: 'contextual_reply',
      topic,
      prompt,
      text: this.trimTweet(result.text)
    };
  }

  private buildTweetPrompt(kind: ContentKind, topic: string): string {
    const personality = this.deps.personality.buildSystemPrompt();

    if (kind === 'opinion') {
      return [
        personality,
        'Escreva um tweet de opinião técnica forte e autêntica.',
        `Tema: ${topic}`,
        'Regras: max 260 caracteres, parecer humano, sem ser genérico.'
      ].join('\n\n');
    }

    if (kind === 'discovery') {
      return [
        personality,
        'Escreva um tweet de descoberta prática que você aprendeu recentemente.',
        `Tema: ${topic}`,
        'Regras: max 260 caracteres, específico, tom natural.'
      ].join('\n\n');
    }

    if (kind === 'question') {
      return [
        personality,
        'Escreva um tweet em formato de pergunta para engajar comunidade técnica.',
        `Tema: ${topic}`,
        'Regras: max 260 caracteres, pergunta clara, linguagem humana.'
      ].join('\n\n');
    }

    return [
      personality,
      'Crie uma mini thread sobre o tema em um JSON array de 2 a 4 tweets.',
      `Tema: ${topic}`,
      'Regras: cada item max 260 caracteres, progressão lógica, tom humano.',
      'Retorne SOMENTE JSON array de strings.'
    ].join('\n\n');
  }

  private async reviewAndRefineDraft(draft: ContentDraft): Promise<ContentDraft> {
    const candidateText = draft.kind === 'thread' && draft.threadParts
      ? draft.threadParts.join(' || ')
      : draft.text;

    const reviewPrompt = [
      'Avalie se este conteúdo parece humano para X/Twitter.',
      `Conteúdo: ${candidateText}`,
      'Responda em JSON: {"score":0-10,"is_human":true/false,"reason":"...","rewrite":"..."}',
      'Se score < 7 ou is_human=false, forneça rewrite melhorado. Se estiver bom, rewrite pode ser vazio.'
    ].join('\n');

    const review = await this.deps.router.route({
      prompt: reviewPrompt,
      complexity: 'complex'
    });

    const parsed = this.parseReview(review.text);

    if (!parsed || (parsed.score >= 7 && parsed.isHuman)) {
      return draft;
    }

    if (draft.kind === 'thread') {
      const rewrittenParts = this.parseThread(parsed.rewrite || '');
      if (rewrittenParts.length >= 2) {
        return {
          ...draft,
          text: rewrittenParts.join('\n'),
          threadParts: rewrittenParts
        };
      }
      return draft;
    }

    const rewritten = (parsed.rewrite || '').trim();
    if (rewritten.length === 0) {
      return draft;
    }

    return {
      ...draft,
      text: this.trimTweet(rewritten)
    };
  }

  private parseReview(raw: string): { score: number; isHuman: boolean; rewrite: string } | null {
    try {
      const json = this.extractJson(raw);
      if (!json) return null;

      const parsed = JSON.parse(json) as {
        score?: number;
        is_human?: boolean;
        rewrite?: string;
      };

      return {
        score: Number(parsed.score ?? 0),
        isHuman: Boolean(parsed.is_human),
        rewrite: String(parsed.rewrite ?? '')
      };
    } catch {
      return null;
    }
  }

  private parseThread(raw: string): string[] {
    try {
      const json = this.extractJsonArray(raw);
      if (!json) return [];
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => this.trimTweet(item))
        .filter((item) => item.length > 0)
        .slice(0, 4);
    } catch {
      return [];
    }
  }

  private extractJson(raw: string): string | null {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }

  private extractJsonArray(raw: string): string | null {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? match[0] : null;
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
