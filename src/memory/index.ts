import { AiTextClient } from '../ai/types.js';
import { MemoryExtractor } from './extractor.js';
import { MemoryService } from './service.js';
import { MemoryStore } from './store.js';

export { MemoryExtractor } from './extractor.js';
export { MemoryService } from './service.js';
export { MemoryStore } from './store.js';
export * from './types.js';

/**
 * Factory: create a ready-to-use MemoryService.
 * Pass the Ollama client (or any AiTextClient) for fact extraction.
 *
 * @example
 * const memory = createMemoryService(aiClients.ollama);
 * await memory.remember('User prefers dark mode', 'whatsapp');
 */
export const createMemoryService = (client: AiTextClient): MemoryService => {
  const store = new MemoryStore();
  const extractor = new MemoryExtractor(client);
  return new MemoryService(store, extractor);
};
