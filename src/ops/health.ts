import { db } from '../database/connection.js';
import { env } from '../config/env.js';
import { OllamaClient } from '../ai/ollama.js';
import { logger } from './logger.js';

export interface HealthNotifier {
  name: string;
  notify(text: string): Promise<void>;
}

export interface HealthDependency {
  name: string;
  check: () => Promise<boolean>;
}

export class HealthMonitor {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly notifiers: HealthNotifier[] = [];
  private readonly lastStatus = new Map<string, boolean>();

  constructor(
    private readonly deps: HealthDependency[],
    private readonly enabled: boolean,
    private readonly intervalMinutes: number
  ) {}

  registerNotifier(notifier: HealthNotifier): void {
    this.notifiers.push(notifier);
  }

  start(): void {
    if (!this.enabled) {
      logger.info('[HealthMonitor] disabled by configuration');
      return;
    }

    logger.info({ intervalMinutes: this.intervalMinutes }, '[HealthMonitor] started');
    this.schedule(10000);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(delayMs?: number): void {
    const ms = delayMs ?? this.intervalMinutes * 60 * 1000;
    this.timer = setTimeout(() => {
      void this.runCycle();
    }, ms);
  }

  private async runCycle(): Promise<void> {
    if (this.running) {
      this.schedule();
      return;
    }

    this.running = true;

    try {
      for (const dep of this.deps) {
        const ok = await this.safeCheck(dep);
        const prev = this.lastStatus.get(dep.name);
        this.lastStatus.set(dep.name, ok);

        if (prev === undefined || prev === ok) {
          continue;
        }

        const text = ok
          ? `✅ Health recovered: ${dep.name}`
          : `🚨 Health check failed: ${dep.name}`;

        await this.notifyAll(text);
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async safeCheck(dep: HealthDependency): Promise<boolean> {
    try {
      return await dep.check();
    } catch (error) {
      logger.error({ dep: dep.name, error }, '[HealthMonitor] check failed with exception');
      return false;
    }
  }

  private async notifyAll(text: string): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(text);
      } catch (error) {
        logger.warn({ notifier: notifier.name, error }, '[HealthMonitor] notify failed');
      }
    }
  }
}

export const createHealthDependencies = (input: {
  ollama: OllamaClient;
  whatsappConnected: () => boolean;
  telegramConnected: () => boolean;
  twitterHealthy: () => Promise<boolean>;
}): HealthDependency[] => {
  return [
    {
      name: 'postgres',
      check: async (): Promise<boolean> => {
        await db.query('SELECT 1 as ok');
        return true;
      }
    },
    {
      name: 'ollama',
      check: async (): Promise<boolean> => {
        const result = await input.ollama.generateText({
          prompt: 'Responda com OK.',
          temperature: 0
        });
        return result.text.toLowerCase().includes('ok');
      }
    },
    {
      name: 'whatsapp',
      check: async (): Promise<boolean> => {
        if (env.WHATSAPP_ENABLED !== 'true') return true;
        return input.whatsappConnected();
      }
    },
    {
      name: 'telegram',
      check: async (): Promise<boolean> => {
        if (env.TELEGRAM_ENABLED !== 'true') return true;
        return input.telegramConnected();
      }
    },
    {
      name: 'twitter',
      check: async (): Promise<boolean> => {
        if (env.TWITTER_ENABLED !== 'true') return true;
        return input.twitterHealthy();
      }
    }
  ];
};

export const createHealthMonitor = (deps: HealthDependency[]): HealthMonitor => {
  const intervalRaw = Number(env.HEALTHCHECK_INTERVAL_MIN || '5');
  const intervalMinutes = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 5;
  const enabled = env.HEALTHCHECK_ENABLED === 'true';

  return new HealthMonitor(deps, enabled, intervalMinutes);
};
