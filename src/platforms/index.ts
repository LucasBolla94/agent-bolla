import { env } from '../config/env.js';
import { TwitterPlatform } from './twitter.js';

export { TwitterPlatform };

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
