import { MemoryExtractor } from './extractor.js';
import { MemoryStore } from './store.js';
import { Memory, MemorySource } from './types.js';

export class MemoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly extractor: MemoryExtractor
  ) {}

  /**
   * Extract facts from any text and persist each one as a long-term memory.
   * This is the main entry point — call it after every significant interaction.
   *
   * @example
   * await memory.remember(
   *   'User said he loves TypeScript and hates PHP',
   *   'whatsapp'
   * );
   */
  async remember(text: string, source: MemorySource, category?: string): Promise<Memory[]> {
    const facts = await this.extractor.extractFacts(text);

    if (facts.length === 0) return [];

    const saved: Memory[] = [];

    for (const fact of facts) {
      const resolvedCategory = category
        ? (category as Memory['category'])
        : await this.extractor.classifyFact(fact);

      const memory = await this.store.save({
        content: fact,
        embeddingText: fact,
        category: resolvedCategory ?? 'general',
        source
      });

      console.info(`[Memory] stored fact id=${memory.id} category=${memory.category}: "${fact.slice(0, 80)}"`);
      saved.push(memory);
    }

    return saved;
  }

  /**
   * Search for relevant memories using full-text search.
   * Use before building any AI prompt to inject context.
   *
   * @example
   * const memories = await memory.search('TypeScript preferences', 5);
   * // returns top 5 relevant memories
   */
  async search(query: string, limit = 10): Promise<Memory[]> {
    return this.store.search(query, limit);
  }

  /**
   * Build a formatted context string from memories relevant to a query.
   * Ready to be injected directly into an AI prompt.
   *
   * @example
   * const ctx = await memory.buildContext('TypeScript');
   * // "Relevant memories:\n- User Lucas prefers TypeScript\n- ..."
   */
  async buildContext(query: string, limit = 5): Promise<string> {
    const memories = await this.store.search(query, limit);

    if (memories.length === 0) return '';

    const lines = memories.map((m) => `- ${m.content}`).join('\n');
    return `Relevant memories:\n${lines}`;
  }

  /**
   * Save a single memory directly (no extraction step).
   */
  async saveRaw(
    content: string,
    source: MemorySource,
    category: NonNullable<Memory['category']> = 'general'
  ): Promise<Memory> {
    return this.store.save({
      content,
      embeddingText: content,
      category,
      source
    });
  }

  /**
   * Total number of memories stored.
   */
  async count(): Promise<number> {
    return this.store.count();
  }

  async markAccessed(memoryIds: number[]): Promise<void> {
    await this.store.incrementAccessCounts(memoryIds);
  }

  async topAccessed(limit = 10): Promise<Memory[]> {
    return this.store.topAccessed(limit);
  }
}
