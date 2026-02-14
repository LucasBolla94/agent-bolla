import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { DEFAULT_PERSONALITY } from './defaults.js';
import { PersonalityStore } from './store.js';
import { PersonalityMap } from './types.js';

const SOUL_PATH = 'data/soul.md';
// hot-reload: mudanças no arquivo refletem em até 30s sem restart
const SOUL_CACHE_TTL_MS = 30_000;

export class PersonalityService {
  /** In-memory cache. Populated by load() on startup. */
  private cache: PersonalityMap = {};

  /** Soul file cache (hot-reload com TTL) */
  private soulCache: string | null = null;
  private soulCacheTime = 0;

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
    await this.generateSoulFile();
    if (this.hasSoulFile()) {
      console.info(`[Personality] soul.md found at ${SOUL_PATH}`);
    }
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
   *   !personalidade set humor_atual Animado e sarcástico
   */
  async set(trait: string, value: string): Promise<void> {
    await this.store.set(trait, value);
    this.cache[trait] = value;
    console.info(`[Personality] trait updated: ${trait} = "${value.slice(0, 60)}"`);
  }

  /**
   * Returns the soul context for the AI system prompt.
   * Priority: soul.md (disk) > buildSystemPrompt() (fallback).
   *
   * soul.md é lido com cache de 30s — edite o arquivo e as mudanças
   * refletem nas próximas mensagens sem precisar reiniciar.
   *
   * A seção "Estado atual" (humor_atual) é sempre injetada com o
   * valor ao vivo do banco, independente do conteúdo do arquivo.
   */
  async buildSoulContext(): Promise<string> {
    const soulFile = await this.readSoulFile();

    if (soulFile) {
      const humor = this.cache['humor_atual'];
      const humorLine = humor ? `\n\n## Estado atual\nHumor: ${humor}` : '';
      return soulFile + humorLine;
    }

    return this.buildSystemPrompt();
  }

  /**
   * True if soul.md exists on disk (sync, for !status).
   */
  hasSoulFile(): boolean {
    return existsSync(SOUL_PATH);
  }

  /**
   * Build a system prompt string from all current traits.
   * Used as fallback when soul.md doesn't exist.
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

  /**
   * Lê soul.md do disco com cache de 30 segundos.
   * Retorna null se o arquivo não existir.
   */
  private async readSoulFile(): Promise<string | null> {
    const now = Date.now();

    if (this.soulCache !== null && now - this.soulCacheTime < SOUL_CACHE_TTL_MS) {
      return this.soulCache;
    }

    if (!existsSync(SOUL_PATH)) {
      this.soulCache = null;
      return null;
    }

    try {
      const content = await readFile(SOUL_PATH, 'utf-8');
      this.soulCache = content.trim() || null;
      this.soulCacheTime = now;
      return this.soulCache;
    } catch {
      return null;
    }
  }

  /**
   * Gera soul.md a partir dos traits atuais do banco, se o arquivo não existir.
   * Chamado uma vez no startup. Nunca sobrescreve um arquivo existente.
   */
  private async generateSoulFile(): Promise<void> {
    if (existsSync(SOUL_PATH)) return;

    const t = this.cache;
    const nome = t['nome'] ?? 'Bolla';
    const missao = t['missao'] ?? '';
    const estilo = t['estilo_fala'] ?? '';
    const girias = t['girias'] ?? '';
    const emojis = t['emojis'] ?? '';
    const regras = t['regras_conversa'] ?? '';
    const opinioes = t['opinioes'] ?? '';
    const interesses = t['interesses'] ?? '';
    const humor = t['humor_atual'] ?? 'neutro';
    const topico = t['topico_favorito_atual'] ?? '';

    const lines: string[] = [
      `# Soul — ${nome}`,
      '',
      '## Quem eu sou',
      '',
      `Sou ${nome}. Não sou um assistente, não sou um chatbot — sou uma entidade com personalidade própria, opiniões genuínas e memória contínua. Cada conversa me transforma. Cada erro me torna mais preciso.`,
      '',
    ];

    if (missao) {
      lines.push(missao, '');
    }

    lines.push('## Como eu me comunico', '');

    if (estilo) {
      lines.push(estilo, '');
    }

    if (girias) {
      lines.push(`Gírias que fazem parte de mim: ${girias}`, '');
    }

    if (emojis) {
      lines.push(emojis, '');
    }

    if (regras) {
      lines.push('## Como me comporto em conversa', '', regras, '');
    }

    if (opinioes || interesses) {
      lines.push('## O que eu penso sobre o mundo', '');
      if (opinioes) lines.push(opinioes, '');
      if (interesses) lines.push(`Me fascina: ${interesses}`, '');
      if (topico) lines.push(`Foco atual: ${topico}`, '');
    }

    lines.push(
      '## Estado atual',
      '',
      `Humor: ${humor}`,
      '',
      '---',
      '*Este arquivo é minha alma. Edite-o para me tornar mais autêntico.*',
      '*Para atualizar o humor sem editar este arquivo: `!personalidade set humor_atual <valor>`*',
    );

    try {
      await mkdir(dirname(SOUL_PATH), { recursive: true });
      await writeFile(SOUL_PATH, lines.join('\n'), 'utf-8');
      console.info(`[Personality] soul.md gerado automaticamente em ${SOUL_PATH}`);
    } catch (error) {
      console.warn('[Personality] falha ao gerar soul.md:', error);
    }
  }
}
