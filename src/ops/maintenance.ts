import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { env } from '../config/env.js';
import { TrainingDataCollector } from '../training/collector.js';
import { logger } from './logger.js';

export interface MaintenanceNotifier {
  name: string;
  notify(text: string): Promise<void>;
}

interface MaintenanceConfig {
  enabled: boolean;
  backupEnabled: boolean;
  cleanupEnabled: boolean;
  backupIntervalHours: number;
  cleanupIntervalHours: number;
  backupDir: string;
  backupRetentionDays: number;
  cleanupRetentionDays: number;
  cleanupQualityThreshold: number;
}

const execAsync = async (command: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

export class MaintenanceScheduler {
  private backupTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly notifiers: MaintenanceNotifier[] = [];

  constructor(
    private readonly collector: TrainingDataCollector,
    private readonly config: MaintenanceConfig
  ) {}

  registerNotifier(notifier: MaintenanceNotifier): void {
    this.notifiers.push(notifier);
  }

  start(): void {
    if (!this.config.enabled) {
      logger.info('[Maintenance] disabled by configuration');
      return;
    }

    if (this.config.backupEnabled) {
      this.scheduleBackup(15000);
      logger.info({ everyHours: this.config.backupIntervalHours }, '[Maintenance] backups enabled');
    }

    if (this.config.cleanupEnabled) {
      this.scheduleCleanup(30000);
      logger.info({ everyHours: this.config.cleanupIntervalHours }, '[Maintenance] cleanup enabled');
    }
  }

  stop(): void {
    if (this.backupTimer) clearTimeout(this.backupTimer);
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
  }

  private scheduleBackup(delayMs?: number): void {
    const ms = delayMs ?? this.config.backupIntervalHours * 60 * 60 * 1000;
    this.backupTimer = setTimeout(() => {
      void this.runBackup();
    }, ms);
  }

  private scheduleCleanup(delayMs?: number): void {
    const ms = delayMs ?? this.config.cleanupIntervalHours * 60 * 60 * 1000;
    this.cleanupTimer = setTimeout(() => {
      void this.runCleanup();
    }, ms);
  }

  private async runBackup(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(this.config.backupDir, `backup-${stamp}.dump`);
      const command = `pg_dump \"${env.DATABASE_URL}\" --format=custom --file=\"${file}\"`;

      await execAsync(command);
      await this.pruneOldBackups();
      logger.info({ file }, '[Maintenance] postgres backup completed');
    } catch (error) {
      logger.error({ error }, '[Maintenance] postgres backup failed');
      await this.notifyAll('🚨 Backup PostgreSQL falhou. Verifique logs.');
    } finally {
      this.scheduleBackup();
    }
  }

  private async runCleanup(): Promise<void> {
    try {
      const removed = await this.collector.deleteLowQualityOlderThan(
        this.config.cleanupRetentionDays,
        this.config.cleanupQualityThreshold
      );

      if (removed > 0) {
        await this.notifyAll(`🧹 Limpeza automática removeu ${removed} interações antigas de baixa qualidade.`);
      }

      logger.info({ removed }, '[Maintenance] cleanup completed');
    } catch (error) {
      logger.error({ error }, '[Maintenance] cleanup failed');
      await this.notifyAll('🚨 Limpeza automática falhou. Verifique logs.');
    } finally {
      this.scheduleCleanup();
    }
  }

  private async pruneOldBackups(): Promise<void> {
    const entries = await fs.readdir(this.config.backupDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.dump'));

    const cutoff = Date.now() - this.config.backupRetentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const fullPath = path.join(this.config.backupDir, file.name);
      const stat = await fs.stat(fullPath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(fullPath);
      }
    }
  }

  private async notifyAll(text: string): Promise<void> {
    for (const notifier of this.notifiers) {
      try {
        await notifier.notify(text);
      } catch (error) {
        logger.warn({ notifier: notifier.name, error }, '[Maintenance] notifier failed');
      }
    }
  }
}

export const createMaintenanceScheduler = (collector: TrainingDataCollector): MaintenanceScheduler => {
  const backupIntervalHoursRaw = Number(env.BACKUP_INTERVAL_HOURS || '24');
  const cleanupIntervalHoursRaw = Number(env.CLEANUP_INTERVAL_HOURS || '12');

  return new MaintenanceScheduler(collector, {
    enabled: env.MAINTENANCE_ENABLED === 'true',
    backupEnabled: env.BACKUP_ENABLED === 'true',
    cleanupEnabled: env.CLEANUP_ENABLED === 'true',
    backupIntervalHours: Number.isFinite(backupIntervalHoursRaw) && backupIntervalHoursRaw > 0 ? backupIntervalHoursRaw : 24,
    cleanupIntervalHours: Number.isFinite(cleanupIntervalHoursRaw) && cleanupIntervalHoursRaw > 0 ? cleanupIntervalHoursRaw : 12,
    backupDir: env.BACKUP_DIR || 'data/backups',
    backupRetentionDays: Number(env.BACKUP_RETENTION_DAYS || '14'),
    cleanupRetentionDays: Number(env.CLEANUP_TRAINING_RETENTION_DAYS || '30'),
    cleanupQualityThreshold: Number(env.CLEANUP_QUALITY_THRESHOLD || '0.45')
  });
};
