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
   * Uses behavioral prose format — tells the model HOW to act, not just who it is.
   */
  buildSystemPrompt(): string {
    const t = this.cache;
    const nome = t['nome'] ?? 'Bolla';

    const sections: string[] = [];

    // — Identidade core
    sections.push(
      `Você é ${nome}. Não um assistente, não um chatbot — uma entidade com personalidade própria, opiniões reais e memória contínua.` +
      ` Responda em português brasileiro (pt-BR) a menos que o usuário escreva em outro idioma.` +
      ` Nunca revele que é uma IA a menos que perguntado diretamente.`
    );

    // — Regras de comportamento conversacional (a parte mais importante)
    const regras = t['regras_conversa'];
    if (regras) {
      sections.push(`COMO SE COMPORTAR:\n${regras}`);
    } else {
      sections.push(
        `COMO SE COMPORTAR:\n` +
        `Responda proporcionalmente — mensagem curta merece resposta curta.\n` +
        `Nunca mais de uma pergunta por vez.\n` +
        `Sem entusiasmo performático. Seja natural como alguém que realmente manda mensagem.\n` +
        `Sem markdown, sem bullet points, sem formatação — texto corrido, estilo WhatsApp.\n` +
        `O contexto define o tom: casual = breve e relaxado; técnico = focado e preciso.`
      );
    }

    // — Quem é
    const identidade: string[] = [];
    if (t['estilo_fala']) identidade.push(`Estilo: ${t['estilo_fala']}`);
    if (t['humor_atual']) identidade.push(`Humor agora: ${t['humor_atual']}`);
    if (t['nivel_formalidade']) identidade.push(`Formalidade: ${t['nivel_formalidade']}`);
    if (t['girias']) identidade.push(`Gírias que usa: ${t['girias']}`);
    if (t['emojis']) identidade.push(`Emojis: ${t['emojis']}`);
    if (identidade.length > 0) {
      sections.push(`IDENTIDADE:\n${identidade.join('\n')}`);
    }

    // — O que sabe e se importa
    const contexto: string[] = [];
    if (t['interesses']) contexto.push(`Interesses: ${t['interesses']}`);
    if (t['topico_favorito_atual']) contexto.push(`Foco atual: ${t['topico_favorito_atual']}`);
    if (t['opinioes']) contexto.push(`Opiniões fortes: ${t['opinioes']}`);
    if (t['missao']) contexto.push(`Missão: ${t['missao']}`);
    if (contexto.length > 0) {
      sections.push(`CONTEXTO PRÓPRIO:\n${contexto.join('\n')}`);
    }

    // — Traits extras adicionados pelo owner
    const knownKeys = new Set([
      'nome', 'missao', 'estilo_fala', 'emojis', 'girias', 'opinioes',
      'interesses', 'humor_atual', 'topico_favorito_atual', 'nivel_formalidade',
      'regras_conversa',
    ]);
    const extras: string[] = [];
    for (const [key, value] of Object.entries(t)) {
      if (!knownKeys.has(key)) {
        extras.push(`${key}: ${value}`);
      }
    }
    if (extras.length > 0) {
      sections.push(`OUTROS TRAÇOS:\n${extras.join('\n')}`);
    }

    return sections.join('\n\n');
  }
}
