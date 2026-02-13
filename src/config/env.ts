import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  // AI APIs
  AI_API_URL: string;
  AI_API_CONTENT_TYPE: string;
  AI_API_MODEL: string;
  AI_API_STREAM: string;
  AI_TIMEOUT_MS: string;
  AI_RETRY_ATTEMPTS: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_MAX_TOKENS: string;
  GROK_API_KEY?: string;
  GROK_API_URL?: string;
  GROK_MODEL: string;
  GROK_MAX_TOKENS: string;

  // Database
  DATABASE_URL: string;

  // Owner
  OWNER_WHATSAPP?: string;
  OWNER_TELEGRAM_ID?: string;
  OWNER_NAME?: string;

  // Telegram
  TELEGRAM_BOT_TOKEN?: string;

  // Twitter
  TWITTER_AUTH_TOKEN?: string;
  TWITTER_CT0?: string;
  TWITTER_USERNAME?: string;

  // Behavior
  STUDY_INTERVAL_MIN?: string;
  POST_INTERVAL_MIN?: string;
  MENTIONS_CHECK_MIN?: string;

  // Environment
  NODE_ENV: string;
  LOG_LEVEL: string;
}

const getEnv = (key: keyof EnvConfig, defaultValue?: string, required: boolean = false): string => {
  const value = process.env[key] || defaultValue;
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
};

export const env: EnvConfig = {
  // AI APIs
  AI_API_URL: getEnv('AI_API_URL', '', true),
  AI_API_CONTENT_TYPE: getEnv('AI_API_CONTENT_TYPE', 'application/json'),
  AI_API_MODEL: getEnv('AI_API_MODEL', 'llama3.2:3b'),
  AI_API_STREAM: getEnv('AI_API_STREAM', 'false'),
  AI_TIMEOUT_MS: getEnv('AI_TIMEOUT_MS', '30000'),
  AI_RETRY_ATTEMPTS: getEnv('AI_RETRY_ATTEMPTS', '3'),
  ANTHROPIC_API_KEY: getEnv('ANTHROPIC_API_KEY', ''),
  ANTHROPIC_MODEL: getEnv('ANTHROPIC_MODEL', 'claude-3-5-sonnet-latest'),
  ANTHROPIC_MAX_TOKENS: getEnv('ANTHROPIC_MAX_TOKENS', '1024'),
  GROK_API_KEY: getEnv('GROK_API_KEY', ''),
  GROK_API_URL: getEnv('GROK_API_URL', ''),
  GROK_MODEL: getEnv('GROK_MODEL', 'grok-2'),
  GROK_MAX_TOKENS: getEnv('GROK_MAX_TOKENS', '1024'),

  // Database
  DATABASE_URL: getEnv('DATABASE_URL', '', true),

  // Owner
  OWNER_WHATSAPP: getEnv('OWNER_WHATSAPP', ''),
  OWNER_TELEGRAM_ID: getEnv('OWNER_TELEGRAM_ID', ''),
  OWNER_NAME: getEnv('OWNER_NAME', 'Owner'),

  // Telegram
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN', ''),

  // Twitter
  TWITTER_AUTH_TOKEN: getEnv('TWITTER_AUTH_TOKEN', ''),
  TWITTER_CT0: getEnv('TWITTER_CT0', ''),
  TWITTER_USERNAME: getEnv('TWITTER_USERNAME', ''),

  // Behavior
  STUDY_INTERVAL_MIN: getEnv('STUDY_INTERVAL_MIN', '30'),
  POST_INTERVAL_MIN: getEnv('POST_INTERVAL_MIN', '120'),
  MENTIONS_CHECK_MIN: getEnv('MENTIONS_CHECK_MIN', '60'),

  // Environment
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info')
};
