export type MemoryCategory =
  | 'user_preference'
  | 'learned_fact'
  | 'opinion'
  | 'event'
  | 'general';

export type MemorySource =
  | 'whatsapp'
  | 'telegram'
  | 'twitter'
  | 'study'
  | 'internal';

export interface Memory {
  id: number;
  content: string;
  embeddingText: string;
  category: MemoryCategory | null;
  source: MemorySource | null;
  accessCount: number;
  createdAt: Date;
}

export interface MemorySaveInput {
  content: string;
  embeddingText: string;
  category?: MemoryCategory;
  source?: MemorySource;
}
