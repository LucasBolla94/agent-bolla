import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer, { Browser, CookieParam, ElementHandle, Page } from 'puppeteer';
import { env } from '../config/env.js';
import { RateLimiter } from '../ops/rate-limiter.js';

export interface TwitterConfig {
  enabled: boolean;
  username?: string;
  authToken?: string;
  ct0?: string;
  headless: boolean;
  cookiesPath: string;
}

export interface TwitterTrend {
  title: string;
  subtitle?: string;
}

export interface TwitterTweet {
  url?: string;
  author?: string;
  text: string;
  timestamp?: string;
}

export interface TwitterDM {
  user?: string;
  preview: string;
  timestamp?: string;
}

export type TimelineKind = 'home' | 'following' | 'forYou';

export class TwitterPlatform {
  private browser?: Browser;
  private page?: Page;
  private connected = false;
  private readonly apiLimiter = new RateLimiter('twitter', Number(env.TWITTER_API_MIN_INTERVAL_MS || '1200'));

  constructor(private readonly config: TwitterConfig) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[Twitter] Platform disabled by configuration.');
      return;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1440, height: 900 });

      await this.restoreSession();
      await this.goto('https://x.com/home');

      if (!(await this.isAuthenticated())) {
        throw new Error('Twitter session is not authenticated. Configure cookies or auth token in .env.');
      }

      await this.persistCookies();
      this.connected = true;
      console.log('[Twitter] Session initialized successfully.');
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.persistCookies();
      await this.browser.close();
      this.browser = undefined;
      this.page = undefined;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.page) && Boolean(this.browser);
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      await this.goto('https://x.com/home');
      return await this.isAuthenticated();
    } catch {
      this.connected = false;
      return false;
    }
  }

  async reconnect(): Promise<void> {
    await this.close();
    await this.start();
  }

  async readTimeline(kind: TimelineKind = 'home', limit = 20): Promise<TwitterTweet[]> {
    const page = this.getPage();
    const url = kind === 'home'
      ? 'https://x.com/home'
      : kind === 'following'
        ? 'https://x.com/home?filter=following'
        : 'https://x.com/home';

    await this.goto(url);
    await this.waitForSelector('article[data-testid="tweet"]');
    await this.autoScroll(2);

    const tweets = await page.$$eval(
      'article[data-testid="tweet"]',
      (nodes, max) => nodes.slice(0, max).map((node) => {
        const text = node.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
        const author = node.querySelector('[data-testid="User-Name"]')?.textContent?.trim();
        const timestamp = node.querySelector('time')?.getAttribute('datetime') ?? undefined;
        const anchor = node.querySelector('a[href*="/status/"]') as { getAttribute(name: string): string | null } | null;
        return {
          text,
          author,
          timestamp,
          url: anchor ? `https://x.com${anchor.getAttribute('href')}` : undefined
        };
      }).filter((tweet) => tweet.text.length > 0),
      limit
    );

    return tweets;
  }

  async readProfile(username: string): Promise<{ name?: string; bio?: string; tweets: TwitterTweet[] }> {
    const page = this.getPage();
    await this.goto(`https://x.com/${username}`);
    await this.waitForSelector('main');

    const profile = await page.evaluate(() => {
      const doc = (globalThis as unknown as { document?: { querySelector(selector: string): { textContent?: string } | null } }).document;
      const name = doc?.querySelector('[data-testid="UserName"] span')?.textContent?.trim();
      const bio = doc?.querySelector('[data-testid="UserDescription"]')?.textContent?.trim();
      return { name, bio };
    });

    const tweets = await this.readTimelineFromCurrentPage(10);
    return { ...profile, tweets };
  }

  async readTrendingTopics(limit = 10): Promise<TwitterTrend[]> {
    const page = this.getPage();
    await this.goto('https://x.com/explore/tabs/trending');
    await this.waitForSelector('div[data-testid="trend"]');

    const trends = await page.$$eval('div[data-testid="trend"]', (nodes, max) => {
      return nodes.slice(0, max).map((node) => {
        const spans = Array.from(node.querySelectorAll('span') as unknown as Array<{ textContent?: string }>)
          .map((span) => span.textContent?.trim())
          .filter(Boolean) as string[];

        return {
          title: spans[spans.length - 1] ?? '',
          subtitle: spans[0]
        };
      }).filter((trend) => trend.title.length > 0);
    }, limit);

    return trends;
  }

  async postTweet(content: string): Promise<void> {
    await this.goto('https://x.com/compose/post');
    await this.typeInComposer(content);
    await this.clickFirst([
      'button[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]'
    ]);
    await this.sleep(1200);
    await this.persistCookies();
  }

  async postThread(parts: string[]): Promise<void> {
    if (parts.length === 0) return;

    const sanitized = parts.map((part) => part.trim()).filter((part) => part.length > 0);
    if (sanitized.length === 0) return;

    await this.postTweet(this.trimToTweetLimit(sanitized[0]));

    if (sanitized.length === 1) return;

    let currentParentUrl = await this.getLatestOwnTweetUrl();

    for (let i = 1; i < sanitized.length; i += 1) {
      const content = this.trimToTweetLimit(sanitized[i]);

      if (currentParentUrl) {
        await this.replyToTweet(currentParentUrl, content);
        currentParentUrl = await this.getLatestOwnTweetUrl();
      } else {
        await this.postTweet(content);
      }
    }
  }

  async replyToTweet(tweetUrl: string, content: string): Promise<void> {
    await this.goto(tweetUrl);
    await this.clickFirst(['button[data-testid="reply"]']);
    await this.typeInComposer(content);
    await this.clickFirst([
      'button[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]'
    ]);
    await this.sleep(1200);
  }

  async likeTweet(tweetUrl: string): Promise<void> {
    await this.goto(tweetUrl);
    await this.clickFirst(['button[data-testid="like"]']);
    await this.sleep(700);
  }

  async retweet(tweetUrl: string): Promise<void> {
    await this.goto(tweetUrl);
    await this.clickFirst(['button[data-testid="retweet"]']);
    await this.clickFirst(['div[data-testid="retweetConfirm"]']);
    await this.sleep(700);
  }

  async quoteTweet(tweetUrl: string, content: string): Promise<void> {
    await this.goto(tweetUrl);
    await this.clickFirst(['button[data-testid="retweet"]']);
    await this.clickFirst(['a[href*="compose/post"]', 'div[role="menuitem"]']);
    await this.typeInComposer(content);
    await this.clickFirst([
      'button[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]'
    ]);
    await this.sleep(1000);
  }

  async readDMs(limit = 20): Promise<TwitterDM[]> {
    const page = this.getPage();
    await this.goto('https://x.com/messages');
    await this.waitForSelector('[data-testid="cellInnerDiv"]');

    const dms = await page.$$eval('[data-testid="cellInnerDiv"]', (nodes, max) => {
      return nodes.slice(0, max).map((node) => {
        const spans = Array.from(node.querySelectorAll('span') as unknown as Array<{ textContent?: string }>)
          .map((span) => span.textContent?.trim())
          .filter(Boolean) as string[];

        return {
          user: spans[0],
          preview: spans[spans.length - 1] ?? '',
          timestamp: spans.find((item) => /\d{1,2}:\d{2}|AM|PM|h|m/.test(item))
        };
      }).filter((dm) => dm.preview.length > 0);
    }, limit);

    return dms;
  }

  async readMentions(limit = 20): Promise<TwitterTweet[]> {
    const page = this.getPage();
    await this.goto('https://x.com/notifications/mentions');
    await this.waitForSelector('article[data-testid="tweet"]');
    await this.autoScroll(1);

    const tweets = await page.$$eval(
      'article[data-testid="tweet"]',
      (nodes, max) => nodes.slice(0, max).map((node) => {
        const text = node.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
        const author = node.querySelector('[data-testid="User-Name"]')?.textContent?.trim();
        const timestamp = node.querySelector('time')?.getAttribute('datetime') ?? undefined;
        const anchor = node.querySelector('a[href*="/status/"]') as { getAttribute(name: string): string | null } | null;
        return {
          text,
          author,
          timestamp,
          url: anchor ? `https://x.com${anchor.getAttribute('href')}` : undefined
        };
      }).filter((tweet) => tweet.text.length > 0),
      limit
    );

    return tweets;
  }

  async follow(username: string): Promise<void> {
    await this.goto(`https://x.com/${username}`);
    await this.clickFirst(['button[data-testid$="follow"]']);
    await this.sleep(600);
  }

  async unfollow(username: string): Promise<void> {
    await this.goto(`https://x.com/${username}`);
    await this.clickFirst(['button[data-testid$="unfollow"]']);
    await this.clickFirst(['button[data-testid="confirmationSheetConfirm"]']);
    await this.sleep(600);
  }

  async getLatestOwnTweetUrl(): Promise<string | undefined> {
    if (!this.config.username) return undefined;

    try {
      const profile = await this.readProfile(this.config.username);
      const latest = profile.tweets.find((tweet) => Boolean(tweet.url));
      return latest?.url;
    } catch {
      return undefined;
    }
  }

  private async readTimelineFromCurrentPage(limit = 10): Promise<TwitterTweet[]> {
    const page = this.getPage();
    await this.waitForSelector('article[data-testid="tweet"]');

    return page.$$eval(
      'article[data-testid="tweet"]',
      (nodes, max) => nodes.slice(0, max).map((node) => {
        const text = node.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
        const author = node.querySelector('[data-testid="User-Name"]')?.textContent?.trim();
        const timestamp = node.querySelector('time')?.getAttribute('datetime') ?? undefined;
        const anchor = node.querySelector('a[href*="/status/"]') as { getAttribute(name: string): string | null } | null;
        return {
          text,
          author,
          timestamp,
          url: anchor ? `https://x.com${anchor.getAttribute('href')}` : undefined
        };
      }).filter((tweet) => tweet.text.length > 0),
      limit
    );
  }

  private async typeInComposer(content: string): Promise<void> {
    const page = this.getPage();

    const editor = await this.findFirst([
      'div[data-testid="tweetTextarea_0"]',
      'div[role="textbox"][data-testid="tweetTextarea_0"]',
      'div[role="textbox"]'
    ]);

    if (!editor) {
      throw new Error('Unable to find tweet composer textbox.');
    }

    await editor.click();
    await page.keyboard.type(content, { delay: 5 });
  }

  private async clickFirst(selectors: string[]): Promise<void> {
    const element = await this.findFirst(selectors);
    if (!element) {
      throw new Error(`Unable to locate clickable element: ${selectors.join(' | ')}`);
    }

    await element.click();
  }

  private async findFirst(selectors: string[]): Promise<ElementHandle | null> {
    const page = this.getPage();

    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  private async waitForSelector(selector: string): Promise<void> {
    const page = this.getPage();
    await page.waitForSelector(selector, { timeout: 30000 });
  }

  private async goto(url: string): Promise<void> {
    const page = this.getPage();
    await this.apiLimiter.run(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    });
  }

  private async autoScroll(turns: number): Promise<void> {
    const page = this.getPage();
    for (let i = 0; i < turns; i += 1) {
      await page.evaluate(() => {
        const root = globalThis as unknown as { scrollBy(x: number, y: number): void; innerHeight: number };
        root.scrollBy(0, root.innerHeight);
      });
      await this.sleep(600);
    }
  }

  private async restoreSession(): Promise<void> {
    const page = this.getPage();

    const cookiesFromFile = await this.readCookiesFromFile();
    if (cookiesFromFile.length > 0) {
      await page.setCookie(...cookiesFromFile);
    }

    const envCookies = this.buildCookiesFromEnv();
    if (envCookies.length > 0) {
      await page.setCookie(...envCookies);
    }
  }

  private buildCookiesFromEnv(): CookieParam[] {
    const cookies: CookieParam[] = [];

    if (this.config.authToken) {
      cookies.push({
        name: 'auth_token',
        value: this.config.authToken,
        domain: '.x.com',
        path: '/',
        httpOnly: true,
        secure: true
      });
    }

    if (this.config.ct0) {
      cookies.push({
        name: 'ct0',
        value: this.config.ct0,
        domain: '.x.com',
        path: '/',
        secure: true
      });
    }

    if (this.config.username) {
      cookies.push({
        name: 'twid',
        value: `u=${this.config.username}`,
        domain: '.x.com',
        path: '/',
        secure: true
      });
    }

    return cookies;
  }

  private async readCookiesFromFile(): Promise<CookieParam[]> {
    try {
      const raw = await fs.readFile(this.config.cookiesPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CookieParam[]) : [];
    } catch {
      return [];
    }
  }

  private async persistCookies(): Promise<void> {
    const page = this.page;
    if (!page) return;

    const cookies = await page.cookies();
    await fs.mkdir(path.dirname(this.config.cookiesPath), { recursive: true });
    await fs.writeFile(this.config.cookiesPath, JSON.stringify(cookies, null, 2), 'utf-8');
  }

  private async isAuthenticated(): Promise<boolean> {
    const page = this.getPage();
    await this.goto('https://x.com/home');

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      return false;
    }

    const hasComposer = await page.$('a[href="/compose/post"]');
    return Boolean(hasComposer);
  }

  private getPage(): Page {
    if (!this.page) {
      throw new Error('Twitter platform not initialized. Call start() first.');
    }

    return this.page;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private trimToTweetLimit(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
  }
}
