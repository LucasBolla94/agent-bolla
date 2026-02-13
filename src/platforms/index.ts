import { env } from '../config/env.js';
import { AiRouter } from '../ai/router.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { TrainingDataCollector } from '../training/collector.js';
import { createDefaultTwitterAutonomousConfig, TwitterAutonomousScheduler } from './autonomous.js';
import { TwitterPlatform } from './twitter.js';

export { TwitterPlatform };
export { TwitterAutonomousScheduler };

export const createTwitterPlatform = (): TwitterPlatform => {
  return new TwitterPlatform({
    enabled: env.TWITTER_ENABLED === 'true',
    username: env.TWITTER_USERNAME,
    authToken: env.TWITTER_AUTH_TOKEN,
    ct0: env.TWITTER_CT0,
    headless: env.TWITTER_HEADLESS === 'true',
    cookiesPath: env.TWITTER_COOKIES_PATH
  });
};

export const createTwitterAutonomousScheduler = (deps: {
  twitter: TwitterPlatform;
  router: AiRouter;
  collector: TrainingDataCollector;
  memory: MemoryService;
  personality: PersonalityService;
}): TwitterAutonomousScheduler => {
  const enabled = env.TWITTER_ENABLED === 'true' && env.TWITTER_AUTONOMOUS_ENABLED === 'true';

  return new TwitterAutonomousScheduler(
    createDefaultTwitterAutonomousConfig(enabled),
    deps
  );
};
