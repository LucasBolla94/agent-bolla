export type TrainingDataType =
  | 'conversation'
  | 'tweet_read'
  | 'tweet_write'
  | 'study'
  | 'code_analysis'
  | 'opinion'
  | 'analytics';

export type TrainingDataSource = 'whatsapp' | 'telegram' | 'twitter' | 'internal';

export interface TweetEngagement {
  likes?: number;
  retweets?: number;
  replies?: number;
}

export interface TrainingMetadata {
  provider?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  complexity?: string;
  fallbackUsed?: boolean;
  tweetEngagement?: TweetEngagement;
  [key: string]: unknown;
}

export interface TrainingContext {
  channel?: string;
  userRole?: 'owner' | 'user';
  topic?: string;
  memoriesUsed?: string[];
  conversationLength?: number;
  [key: string]: unknown;
}

export interface TrainingEntry {
  type: TrainingDataType;
  input: string;
  context?: TrainingContext;
  output: string;
  source: TrainingDataSource;
  metadata?: TrainingMetadata;
}

export interface SavedTrainingEntry extends TrainingEntry {
  id: number;
  qualityScore: number;
  createdAt: Date;
}
