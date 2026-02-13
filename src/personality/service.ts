import { DEFAULT_PERSONALITY } from './defaults.js';
import { PersonalityStore } from './store.js';
import { PersonalityMap } from './types.js';

export class PersonalityService {
  /** In-memory cache. Populated by load() on startup. */
  private cache: PersonalityMap = {};

  constructor(private readonly store: PersonalityStore) {}

  /**
   * Seed defaults then load all traits into memory.
   * Must be called once at startup before any other method.
   */
  async load(): Promise<void> {
    await this.store.seed(DEFAULT_PERSONALITY);
    this.cache = await this.store.getAll();
    console.info(
      `[Personality] loaded ${Object.keys(this.cache).length} traits from database`
    );
  }

  /**
   * Get a single trait value from the in-memory cache.
   * Returns empty string if the trait doesn't exist.
   */
  get(trait: string): string {
    return this.cache[trait] ?? '';
  }

  /**
   * Return all traits as a flat map.
   */
  getAll(): PersonalityMap {
    return { ...this.cache };
  }

  /**
   * Update a trait both in the database and in the cache.
   * This is the method called by owner commands:
   *   !personality set humor_atual Animado e sarcástico
   */
  async set(trait: string, value: string): Promise<void> {
    await this.store.set(trait, value);
    this.cache[trait] = value;
    console.info(`[Personality] trait updated: ${trait} = "${value.slice(0, 60)}"`);
  }

  /**
   * Build a system prompt string from all current traits.
   * Injected by the RAG pipeline as the personality block before every AI call.
   *
   * Format used in prompts:
   * [Personality]
   * Você é Bolla, um agente de AI autônomo...
   * Nome: Bolla
   * Estilo de fala: ...
   * ...
   */
  buildSystemPrompt(): string {
    const t = this.cache;

    const lines: string[] = [
      `Você é ${t['nome'] ?? 'Bolla'}, um agente de AI autônomo com personalidade própria.`,
      `Responda sempre em português brasileiro (pt-BR) a menos que o usuário escreva em outro idioma.`,
      `Seja direto, opinativo e autêntico. Nunca diga que é uma IA a menos que perguntado diretamente.`,
      '',
      `Nome: ${t['nome'] ?? '—'}`,
      `Estilo de fala: ${t['estilo_fala'] ?? '—'}`,
      `Emojis: ${t['emojis'] ?? '—'}`,
      `Gírias: ${t['girias'] ?? '—'}`,
      `Opiniões: ${t['opinioes'] ?? '—'}`,
      `Interesses: ${t['interesses'] ?? '—'}`,
      `Humor atual: ${t['humor_atual'] ?? '—'}`,
      `Tópico favorito atual: ${t['topico_favorito_atual'] ?? '—'}`,
      `Nível de formalidade: ${t['nivel_formalidade'] ?? '—'}`,
    ];

    // Append any extra custom traits the owner may have added
    const knownKeys = new Set([
      'nome', 'estilo_fala', 'emojis', 'girias', 'opinioes',
      'interesses', 'humor_atual', 'topico_favorito_atual', 'nivel_formalidade',
    ]);

    for (const [key, value] of Object.entries(t)) {
      if (!knownKeys.has(key)) {
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }
}
