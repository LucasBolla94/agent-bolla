import { env } from '../config/env.js';
import { AnalyticsService } from './service.js';

export interface AnalyticsNotifier {
  name: string;
  notify(text: string): Promise<void>;
}

export class AnalyticsScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;
  private notifiers: AnalyticsNotifier[] = [];

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly enabled: boolean,
    private readonly intervalMinutes: number
  ) {}

  registerNotifier(notifier: AnalyticsNotifier): void {
    this.notifiers.push(notifier);
  }

  start(): void {
    if (!this.enabled) {
      console.log('[AnalyticsScheduler] Disabled by configuration.');
      return;
    }

    console.log(`[AnalyticsScheduler] Enabled with interval ${this.intervalMinutes} minutes.`);
    this.schedule(15000);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private schedule(delayMs?: number): void {
    const delay = delayMs ?? this.intervalMinutes * 60 * 1000;
    this.timer = setTimeout(() => {
      void this.runCycle();
    }, delay);
  }

  private async runCycle(): Promise<void> {
    if (this.running) {
      this.schedule();
      return;
    }

    this.running = true;

    try {
      const result = await this.analytics.runPatternAnalysisCycle();
      const suggestionsText = result.suggestions.length === 0
        ? 'Nenhuma sugestão nova de personalidade.'
        : result.suggestions
            .map((s) => `#${s.id} ${s.trait}: ${s.suggestedValue.slice(0, 80)}`)
            .join('\n');

      await this.notifyOwners(
        '📊 Ciclo de analytics concluído\n\n' +
        `${result.insights.slice(0, 1000)}\n\n` +
        `Sugestões:\n${suggestionsText}`
      );
    } catch (error) {
      console.error('[AnalyticsScheduler] Cycle failed:', error);
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async notifyOwners(message: string): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(message);
      } catch (error) {
        console.warn(`[AnalyticsScheduler] notifier ${notifier.name} failed:`, error);
      }
    }
  }
}

export const createAnalyticsScheduler = (analytics: AnalyticsService): AnalyticsScheduler => {
  const intervalRaw = Number(env.ANALYTICS_INTERVAL_MIN || '180');
  const intervalMinutes = Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 180;
  const enabled = env.ANALYTICS_AUTONOMOUS_ENABLED === 'true';

  return new AnalyticsScheduler(analytics, enabled, intervalMinutes);
};
