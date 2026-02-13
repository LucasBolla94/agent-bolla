import type { AiRouter } from '../ai/router.js';
import type { AiTextClient } from '../ai/types.js';
import type { TrainingDataCollector } from '../training/collector.js';
import { MemoryExtractor } from './extractor.js';
import { RagService, RagServiceOptions } from './rag.js';
import { MemoryService } from './service.js';
import { ShortTermMemory } from './short-term.js';
import { MemoryStore } from './store.js';

export { MemoryExtractor } from './extractor.js';
export { RagService } from './rag.js';
export { MemoryService } from './service.js';
export { ShortTermMemory } from './short-term.js';
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

interface CreateRagServiceInput {
  memoryService: MemoryService;
  router: AiRouter;
  collector?: TrainingDataCollector;
  shortTermLimit?: number;
  options?: RagServiceOptions;
}

/**
 * Factory: create a complete RAG service for runtime message handling.
 * Includes short-term memory (last N messages) + long-term memory retrieval.
 */
export const createRagService = ({
  memoryService,
  router,
  collector,
  shortTermLimit = 10,
  options
}: CreateRagServiceInput): RagService => {
  const shortTermMemory = new ShortTermMemory(shortTermLimit);
  return new RagService(memoryService, router, shortTermMemory, collector, options);
};
