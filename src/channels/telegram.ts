import { Bot, Context, InlineKeyboard } from 'grammy';
import { RagService } from '../memory/rag.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { ConversationsRepository, ConversationMessage } from '../database/repositories/conversations.js';
import { UserRecord, UsersRepository } from '../database/repositories/users.js';
import { PermissionService } from '../core/permissions.js';
import { CodeImprovementsRepository } from '../database/repositories/code-improvements.js';

export interface TelegramChannelConfig {
  enabled: boolean;
  botToken: string;
  ownerTelegramId: string;
}

export interface TelegramChannelDeps {
  rag: RagService;
  memory: MemoryService;
  personality: PersonalityService;
  usersRepo: UsersRepository;
  conversationsRepo: ConversationsRepository;
  permissions: PermissionService;
  codeImprovementsRepo: CodeImprovementsRepository;
}

export interface TelegramChannel {
  start(): Promise<void>;
  notifyOwner(text: string): Promise<void>;
}

export class TelegramGrammYChannel implements TelegramChannel {
  private readonly bot?: Bot<Context>;
  private botUsername = '';
  private botId = 0;

  constructor(
    private readonly config: TelegramChannelConfig,
    private readonly deps: TelegramChannelDeps
  ) {
    if (config.enabled && config.botToken) {
      this.bot = new Bot<Context>(config.botToken);
      this.registerHandlers(this.bot);
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[Telegram] Channel disabled by configuration.');
      return;
    }

    if (!this.bot) {
      console.warn('[Telegram] TELEGRAM_BOT_TOKEN missing; channel disabled.');
      return;
    }

    const me = await this.bot.api.getMe();
    this.botUsername = me.username || '';
    this.botId = me.id;

    this.bot.start({
      onStart: () => {
        console.log(`[Telegram] Bot started as @${this.botUsername || me.first_name}`);
      }
    });
  }

  async notifyOwner(text: string): Promise<void> {
    if (!this.bot || !this.config.ownerTelegramId) return;

    const ownerId = Number(this.config.ownerTelegramId);
    if (!Number.isFinite(ownerId)) return;

    await this.bot.api.sendMessage(ownerId, text);
  }

  private registerHandlers(bot: Bot<Context>): void {
    bot.use(async (ctx, next) => {
      const text = this.extractUpdateText(ctx);
      if (!text) {
        await next();
        return;
      }

      const user = await this.getOrCreateTelegramUser(ctx);
      if (!user) {
        await next();
        return;
      }

      const permission = this.deps.permissions.authorizeInput(user.role, text, 'telegram');
      if (!permission.allowed) {
        if (ctx.chat?.id) {
          await ctx.reply(permission.reason || 'Sem permissao.');
        }
        return;
      }

      await next();
    });

    bot.command('start', async (ctx) => {
      const nome = this.deps.personality.get('nome');
      await ctx.reply(`${nome} online. Envie uma mensagem para conversar.`);
    });

    bot.command('help', async (ctx) => {
      const user = await this.getOrCreateTelegramUser(ctx);
      if (user?.role === 'owner') {
        await ctx.reply(
          'Comandos owner:\n' +
          '/status — estado atual\n' +
          '/ping — latência\n' +
          '/aprender <fato> — ensinar algo novo\n' +
          '/personalidade — ver traits atuais\n' +
          '/personalidade_set <trait> <valor> — editar trait\n' +
          '/approval <id> — revisar melhoria de código'
        );
      } else {
        await ctx.reply('Comandos: /start, /help, /status, /ping');
      }
    });

    bot.command('status', async (ctx) => {
      await this.handleStatusCommand(ctx);
    });

    bot.command('ping', async (ctx) => {
      await ctx.reply('pong');
    });

    bot.command('aprender', async (ctx) => {
      await this.handleAprenderCommand(ctx);
    });

    bot.command('personalidade', async (ctx) => {
      await this.handlePersonalidadeCommand(ctx);
    });

    bot.command('personalidade_set', async (ctx) => {
      await this.handlePersonalidadeSetCommand(ctx);
    });

    bot.command('approval', async (ctx) => {
      await this.handleApprovalCommand(ctx);
    });

    bot.on('callback_query:data', async (ctx) => {
      await this.handleApprovalCallback(ctx);
    });

    bot.on('message:text', async (ctx) => {
      await this.handleTextMessage(ctx);
    });

    bot.catch((error) => {
      console.error('[Telegram] bot error:', error.error);
    });
  }

  private async handleStatusCommand(ctx: Context): Promise<void> {
    const memCount = await this.deps.memory.count();
    const nome = this.deps.personality.get('nome');
    const humor = this.deps.personality.get('humor_atual');
    await ctx.reply(`${nome} online.\nHumor: ${humor}\nMemórias: ${memCount}\nPipeline RAG ativo.`);
  }

  private async handleAprenderCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateTelegramUser(ctx);
    if (!user) return;

    if (user.role !== 'owner') {
      await ctx.reply('Sem permissão.');
      return;
    }

    const text = ctx.message?.text || '';
    const fact = text.replace(/^\/aprender\s*/i, '').trim();

    if (!fact) {
      await ctx.reply('Uso: /aprender <fato>');
      return;
    }

    await this.deps.memory.saveRaw(fact, 'telegram', 'learned_fact');
    await ctx.reply(`Aprendi e memorizei: "${fact}"`);
  }

  private async handlePersonalidadeCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateTelegramUser(ctx);
    if (!user || user.role !== 'owner') {
      await ctx.reply('Sem permissão.');
      return;
    }

    const all = this.deps.personality.getAll();
    const lines = Object.entries(all)
      .map(([k, v]) => `<b>${k}</b>: ${v.slice(0, 120)}`)
      .join('\n');

    await ctx.reply(lines, { parse_mode: 'HTML' });
  }

  private async handlePersonalidadeSetCommand(ctx: Context): Promise<void> {
    const user = await this.getOrCreateTelegramUser(ctx);
    if (!user || user.role !== 'owner') {
      await ctx.reply('Sem permissão.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.replace(/^\/personalidade_set\s*/i, '').trim().split(/\s+/);
    const trait = parts[0]?.toLowerCase();
    const value = parts.slice(1).join(' ').trim();

    if (!trait || !value) {
      await ctx.reply('Uso: /personalidade_set <trait> <valor>');
      return;
    }

    await this.deps.personality.set(trait, value);
    await ctx.reply(`Trait "<b>${trait}</b>" atualizado.`, { parse_mode: 'HTML' });
  }

  private async handleApprovalCommand(ctx: Context): Promise<void> {
    let user = await this.getOrCreateTelegramUser(ctx);
    if (!user) return;

    if (this.config.ownerTelegramId && String(ctx.from?.id || '') === this.config.ownerTelegramId && user.role !== 'owner') {
      const promoted = await this.deps.usersRepo.updateRole(user.id, 'owner');
      if (promoted) user = promoted;
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    const id = Number(parts[1]);

    if (!Number.isFinite(id)) {
      await ctx.reply('Uso: /approval <code_improvement_id>');
      return;
    }

    const improvement = await this.deps.codeImprovementsRepo.findById(id);
    if (!improvement) {
      await ctx.reply(`Nenhuma melhoria encontrada com id ${id}.`);
      return;
    }

    const keyboard = new InlineKeyboard()
      .text('✅ Aprovar', `approval:approve:${id}`)
      .text('❌ Rejeitar', `approval:reject:${id}`);

    await ctx.reply(
      `Revisao #${id}\nArquivo: ${improvement.file}\nStatus atual: ${improvement.status}\n\n${improvement.description}`,
      { reply_markup: keyboard }
    );
  }

  private async handleApprovalCallback(ctx: Context): Promise<void> {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData) return;

    let user = await this.getOrCreateTelegramUser(ctx);
    if (!user) return;

    if (this.config.ownerTelegramId && String(ctx.from?.id || '') === this.config.ownerTelegramId && user.role !== 'owner') {
      const promoted = await this.deps.usersRepo.updateRole(user.id, 'owner');
      if (promoted) user = promoted;
    }

    const permission = this.deps.permissions.authorizeInput(user.role, '/approval', 'telegram');
    if (!permission.allowed || user.role !== 'owner') {
      await ctx.answerCallbackQuery({ text: 'Sem permissao.', show_alert: true });
      return;
    }

    const match = callbackData.match(/^approval:(approve|reject):(\d+)$/);
    if (!match) {
      await ctx.answerCallbackQuery();
      return;
    }

    const action = match[1];
    const id = Number(match[2]);
    const status = action === 'approve' ? 'approved' : 'rejected';

    const updated = await this.deps.codeImprovementsRepo.setStatus(id, status);
    if (!updated) {
      await ctx.answerCallbackQuery({ text: 'Registro nao encontrado.', show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: `Status atualizado para ${status}.` });

    if (ctx.callbackQuery?.message?.chat?.id && ctx.callbackQuery.message.message_id) {
      await ctx.api.editMessageReplyMarkup(
        ctx.callbackQuery.message.chat.id,
        ctx.callbackQuery.message.message_id,
        { reply_markup: new InlineKeyboard() }
      );
    }
  }

  private async handleTextMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text?.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      return;
    }

    if (!this.shouldRespondToMessage(ctx)) {
      return;
    }

    let user = await this.getOrCreateTelegramUser(ctx);
    if (!user) return;

    if (this.config.ownerTelegramId && String(ctx.from?.id || '') === this.config.ownerTelegramId && user.role !== 'owner') {
      const promoted = await this.deps.usersRepo.updateRole(user.id, 'owner');
      if (promoted) user = promoted;
    }

    const conversation = await this.deps.conversationsRepo.getOrCreate(user.id, 'telegram');

    const ragResponse = await this.deps.rag.respond(text, {
      conversationId: `telegram:${conversation.id}`,
      source: 'telegram',
      channel: 'telegram',
      userRole: user.role
    });

    await ctx.reply(ragResponse.text);

    const nowIso = new Date().toISOString();
    const messages: ConversationMessage[] = [
      { role: 'user', text, timestamp: nowIso },
      {
        role: 'assistant',
        text: ragResponse.text,
        timestamp: nowIso,
        metadata: {
          provider: ragResponse.routerOutput.provider,
          complexity: ragResponse.routerOutput.complexity,
          memoriesUsed: ragResponse.usedMemories.map((memory) => memory.id)
        }
      }
    ];

    await this.deps.conversationsRepo.appendMessages(conversation.id, messages);

    await this.deps.memory.remember(
      `User ${user.name} (${user.role}) on Telegram said: ${text}\nAgent response: ${ragResponse.text}`,
      'telegram'
    );
  }

  private shouldRespondToMessage(ctx: Context): boolean {
    const message = ctx.message;
    const chat = message?.chat;
    if (!chat) return false;

    if (chat.type === 'private') {
      return true;
    }

    if (chat.type === 'group' || chat.type === 'supergroup') {
      const text = message?.text || '';
      const mention = this.botUsername ? `@${this.botUsername}` : '';

      const mentioned = mention ? text.includes(mention) : false;
      const repliedToBot = message?.reply_to_message?.from?.id === this.botId;

      return mentioned || repliedToBot;
    }

    return false;
  }

  private async getOrCreateTelegramUser(ctx: Context): Promise<UserRecord | null> {
    const from = ctx.from;
    if (!from) return null;

    const telegramId = String(from.id);
    const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || `Telegram ${telegramId}`;

    return this.deps.usersRepo.getOrCreateByTelegramId({
      telegramId,
      ownerTelegramId: this.config.ownerTelegramId,
      name: displayName
    });
  }

  private extractUpdateText(ctx: Context): string {
    if (ctx.message?.text) return ctx.message.text.trim();
    if (ctx.callbackQuery?.data) return ctx.callbackQuery.data.trim();
    return '';
  }
}
