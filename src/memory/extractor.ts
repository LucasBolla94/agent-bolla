import { AiTextClient } from '../ai/types.js';
import { MemoryCategory } from './types.js';

const SYSTEM_PROMPT =
  'You are a fact extractor. You extract reusable facts from text and return them as a JSON array of strings. No explanation, only JSON.';

const buildExtractionPrompt = (text: string): string =>
  `Extract the most important and reusable facts from the text below.

Rules:
- Include: user preferences, learned knowledge, opinions, important events
- Skip: greetings, one-time context, filler words, questions without answers
- Write each fact as a standalone sentence (e.g. "User Lucas prefers TypeScript over JavaScript")
- Return ONLY a valid JSON array of strings: ["fact 1", "fact 2"]
- Maximum 5 facts. If no relevant facts exist, return []

Text:
"""
${text.slice(0, 2000)}
"""`;

const buildCategoryPrompt = (fact: string): string =>
  `Classify this fact into exactly one category.
Categories: user_preference | learned_fact | opinion | event | general
Fact: "${fact}"
Respond with only the category name:`;

export class MemoryExtractor {
  constructor(private readonly client: AiTextClient) {}

  /**
   * Extract a list of factual strings from any text.
   * Uses the AI to identify reusable, standalone facts.
   */
  async extractFacts(text: string): Promise<string[]> {
    try {
      const result = await this.client.generateText({
        prompt: buildExtractionPrompt(text),
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0,
      });

      return this.parseFacts(result.text);
    } catch (error) {
      console.warn(
        '[MemoryExtractor] Fact extraction failed:',
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  /**
   * Classify a single fact into a MemoryCategory.
   * Falls back to 'general' on failure.
   */
  async classifyFact(fact: string): Promise<MemoryCategory> {
    try {
      const result = await this.client.generateText({
        prompt: buildCategoryPrompt(fact),
        temperature: 0,
      });

      const word = result.text.toLowerCase().trim().split(/\s+/)[0];
      const valid: MemoryCategory[] = [
        'user_preference',
        'learned_fact',
        'opinion',
        'event',
        'general',
      ];

      return valid.includes(word as MemoryCategory)
        ? (word as MemoryCategory)
        : 'general';
    } catch {
      return 'general';
    }
  }

  private parseFacts(raw: string): string[] {
    // Try to parse as JSON directly
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed)) {
        return parsed.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
      }
    } catch {
      // Not valid JSON — try to extract JSON array from the response
    }

    // Look for JSON array anywhere in the response
    const match = raw.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (f): f is string => typeof f === 'string' && f.trim().length > 0
          );
        }
      } catch {
        // Ignore
      }
    }

    console.warn('[MemoryExtractor] Could not parse facts from response:', raw.slice(0, 200));
    return [];
  }
}
