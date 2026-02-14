import { env } from './config/env.js';
import { createAiClients, createRouter } from './ai/index.js';
import { createTelegramChannel, createWhatsAppChannel } from './channels/index.js';
import { db } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { createMemoryService, createRagService } from './memory/index.js';
import { createPersonalityService } from './personality/index.js';
import { CuriosityEngine, OpinionEngine, createStudyAutonomousScheduler } from './autonomy/index.js';
import { StudySessionsRepository } from './database/repositories/study-sessions.js';
import { createTwitterAutonomousScheduler, createTwitterPlatform } from './platforms/index.js';
import { createSelfImprovementService } from './self-improvement/index.js';
import { AnalyticsService, createAnalyticsScheduler } from './analytics/index.js';
import { PersonalitySuggestionsRepository } from './database/repositories/personality-suggestions.js';
import { collector } from './training/index.js';
import { createHiveNetwork } from './hive/index.js';
import {
  createHealthDependencies,
  createHealthMonitor,
  createMaintenanceScheduler,
  logger,
  setupStructuredLogging,
  withRetry
} from './ops/index.js';

async function main(): Promise<void> {
  setupStructuredLogging();
  console.log('Agent Bolla - Starting...');
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Log Level: ${env.LOG_LEVEL}`);

  try {
    // Database
    console.log('Testing database connection...');
    const result = await db.query('SELECT NOW() as now;');
    console.log('Database connected at:', result.rows[0].now);

    console.log('Running database migrations...');
    await runMigrations();

    // AI clients + router (phase 1.1 / 1.2)
    const aiClients = createAiClients();
    const router = createRouter(aiClients);
    const availableProviders = [
      aiClients.ollama.provider,
      aiClients.anthropic?.provider,
      aiClients.grok?.provider
    ].filter(Boolean);
    console.log('AI clients initialized:', availableProviders.join(', '));
    console.log('AI router ready.');

    // Training data collector (phase 1.3)
    const stats = await collector.stats();
    console.log(`Training data collector ready. Entries so far: ${stats.total}`);

    // Long-term memory service (phase 2.1)
    const memory = createMemoryService(aiClients.ollama);
    const memoryCount = await memory.count();
    console.log(`Memory service ready. Memories stored: ${memoryCount}`);

    // Personality service (phase 2.3)
    const personality = await createPersonalityService();
    console.log(`Personality loaded. Agent name: ${personality.get('nome')}`);

    // RAG runtime pipeline + short-term memory (phase 2.2) — connected to personality
    const rag = createRagService({
      memoryService: memory,
      router,
      collector,
      shortTermLimit: 10,
      options: {
        personalityProvider: async () => personality.buildSoulContext()
      }
    });
    console.log('RAG service ready (keywords + memory retrieval + short-term context).');

    const selfImprovement = createSelfImprovementService(router, collector);
    console.log(`Self-improvement service initialized (enabled=${env.SELF_IMPROVEMENT_ENABLED}).`);

    const analyticsService = new AnalyticsService(
      collector,
      memory,
      personality,
      router,
      new PersonalitySuggestionsRepository()
    );
    const analyticsScheduler = createAnalyticsScheduler(analyticsService);
    console.log(`Analytics service initialized (enabled=${env.ANALYTICS_AUTONOMOUS_ENABLED}).`);

    const hive = createHiveNetwork({
      run: async (task, context) => {
        const requester = context?.requester || 'unknown';
        const role = env.HIVE_AGENT_ROLE || 'generalist';
        const framedTask = [
          `Você está operando em hive mode como agente com especialidade: ${role}.`,
          `Requester: ${requester}`,
          `Tarefa: ${task}`
        ].join('\n');

        const result = await rag.respond(framedTask, {
          conversationId: `hive:${Date.now()}`,
          source: 'internal',
          channel: 'internal',
          userRole: 'owner',
          topic: 'hive_delegation',
          complexity: context?.complexity
        });

        return result.text;
      }
    });
    await withRetry('hive.start', async () => hive.start(), {
      attempts: 3,
      baseDelayMs: 1200,
      maxDelayMs: 10000
    });
    console.log(`Hive network initialized (enabled=${env.HIVE_ENABLED}).`);

    // WhatsApp channel (phase 3.1)
    const whatsapp = createWhatsAppChannel(rag, memory, personality, selfImprovement, analyticsService, hive);
    await withRetry('whatsapp.start', async () => whatsapp.start(), {
      attempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000
    });
    console.log(`WhatsApp channel initialized (enabled=${env.WHATSAPP_ENABLED}).`);

    // Telegram channel (phase 3.2)
    const telegram = createTelegramChannel(rag, memory, personality, selfImprovement, analyticsService, hive);
    await withRetry('telegram.start', async () => telegram.start(), {
      attempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30000
    });
    console.log(`Telegram channel initialized (enabled=${env.TELEGRAM_ENABLED}).`);

    selfImprovement.registerNotifier({
      name: 'whatsapp',
      notify: async (text) => whatsapp.notifyOwner(text)
    });
    selfImprovement.registerNotifier({
      name: 'telegram',
      notify: async (text) => telegram.notifyOwner(text)
    });
    analyticsScheduler.registerNotifier({
      name: 'whatsapp',
      notify: async (text) => whatsapp.notifyOwner(text)
    });
    analyticsScheduler.registerNotifier({
      name: 'telegram',
      notify: async (text) => telegram.notifyOwner(text)
    });
    analyticsScheduler.start();

    // Twitter platform (phase 4.1)
    const twitter = createTwitterPlatform();
    await withRetry('twitter.start', async () => twitter.start(), {
      attempts: 5,
      baseDelayMs: 2000,
      maxDelayMs: 60000
    });
    console.log(`Twitter platform initialized (enabled=${env.TWITTER_ENABLED}).`);

    const twitterScheduler = createTwitterAutonomousScheduler({
      twitter,
      router,
      collector,
      memory,
      personality
    });
    twitterScheduler.start();
    console.log(`Twitter autonomous scheduler initialized (enabled=${env.TWITTER_AUTONOMOUS_ENABLED}).`);

    const curiosity = new CuriosityEngine(personality, collector);
    await curiosity.load();
    console.log('Curiosity engine initialized.');

    const opinionEngine = new OpinionEngine(router, memory, collector, personality);
    console.log('Opinion engine initialized.');

    const studyScheduler = createStudyAutonomousScheduler({
      router,
      twitter,
      memory,
      collector,
      studySessionsRepo: new StudySessionsRepository(),
      curiosity,
      opinionEngine
    });
    studyScheduler.start();
    console.log(`Study autonomous scheduler initialized (enabled=${env.STUDY_AUTONOMOUS_ENABLED}).`);

    const healthMonitor = createHealthMonitor(createHealthDependencies({
      ollama: aiClients.ollama,
      whatsappConnected: () => whatsapp.isConnected(),
      telegramConnected: () => telegram.isConnected(),
      twitterHealthy: async () => twitter.healthCheck()
    }));
    healthMonitor.registerNotifier({
      name: 'whatsapp',
      notify: async (text) => whatsapp.notifyOwner(text)
    });
    healthMonitor.registerNotifier({
      name: 'telegram',
      notify: async (text) => telegram.notifyOwner(text)
    });
    healthMonitor.start();

    const maintenance = createMaintenanceScheduler(collector);
    maintenance.registerNotifier({
      name: 'whatsapp',
      notify: async (text) => whatsapp.notifyOwner(text)
    });
    maintenance.registerNotifier({
      name: 'telegram',
      notify: async (text) => telegram.notifyOwner(text)
    });
    maintenance.start();

    console.log('Agent Bolla initialized successfully!');
    console.log('Phases 1.1 / 1.2 / 1.3 / 2.1 / 2.2 / 2.3 / 3.1 / 3.2 / 3.3 / 4.1 / 4.2 / 4.3 / 5.1 / 5.2 / 5.3 / 6 / 7 / 8 / 11.3 complete.');

    // Expose for use in subsequent phases
    void router;
    void memory;
    void rag;
    void personality;
    void whatsapp;
    void telegram;
    void twitter;
    void twitterScheduler;
    void studyScheduler;
    void curiosity;
    void opinionEngine;
    void selfImprovement;
    void analyticsService;
    void analyticsScheduler;
    void hive;
    void healthMonitor;
    void maintenance;

  } catch (error) {
    console.error('Error initializing agent:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
});

main();
