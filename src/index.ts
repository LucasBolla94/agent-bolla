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

async function main(): Promise<void> {
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
        personalityProvider: async () => personality.buildSystemPrompt()
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

    // WhatsApp channel (phase 3.1)
    const whatsapp = createWhatsAppChannel(rag, memory, personality, selfImprovement, analyticsService);
    await whatsapp.start();
    console.log(`WhatsApp channel initialized (enabled=${env.WHATSAPP_ENABLED}).`);

    // Telegram channel (phase 3.2)
    const telegram = createTelegramChannel(rag, memory, personality, selfImprovement, analyticsService);
    await telegram.start();
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
    await twitter.start();
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

    console.log('Agent Bolla initialized successfully!');
    console.log('Phases 1.1 / 1.2 / 1.3 / 2.1 / 2.2 / 2.3 / 3.1 / 3.2 / 3.3 / 4.1 / 4.2 / 4.3 / 5.1 / 5.2 / 5.3 / 6 / 7 complete.');

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

  } catch (error) {
    console.error('Error initializing agent:', error);
    process.exit(1);
  }
}

main();
