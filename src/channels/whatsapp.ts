import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  useMultiFileAuthState,
  WAMessage,
  WASocket
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { RagService } from '../memory/rag.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { ConversationsRepository, ConversationMessage } from '../database/repositories/conversations.js';
import { UserRecord, UsersRepository } from '../database/repositories/users.js';
import { PermissionService } from '../core/permissions.js';
import { SelfImprovementService } from '../self-improvement/service.js';
import { AnalyticsService } from '../analytics/service.js';

export interface WhatsAppChannelConfig {
  authDir: string;
  ownerPhone: string;
  enabled: boolean;
}

export interface WhatsAppChannelDeps {
  rag: RagService;
  memory: MemoryService;
  personality: PersonalityService;
  selfImprovement: SelfImprovementService;
  analytics: AnalyticsService;
  usersRepo: UsersRepository;
  conversationsRepo: ConversationsRepository;
  permissions: PermissionService;
}

export interface WhatsAppChannel {
  start(): Promise<void>;
  notifyOwner(text: string): Promise<void>;
  isConnected(): boolean;
}

export class WhatsAppBaileysChannel implements WhatsAppChannel {
  private sock?: WASocket;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private connecting = false;

  constructor(
    private readonly config: WhatsAppChannelConfig,
    private readonly deps: WhatsAppChannelDeps
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[WhatsApp] Channel disabled by configuration.');
      return;
    }

    await this.connect();
  }

  async notifyOwner(text: string): Promise<void> {
    const socket = this.sock;
    if (!socket || !this.config.ownerPhone) return;

    const ownerJid = `${this.normalizePhone(this.config.ownerPhone)}@s.whatsapp.net`;
    await socket.sendMessage(ownerJid, { text });
  }

  isConnected(): boolean {
    return this.connected && Boolean(this.sock);
  }

  private async connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.config.authDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        syncFullHistory: false
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          qrcode.generate(qr, { small: true });
          console.log('[WhatsApp] QR code generated. Scan it with WhatsApp.');
        }

        if (connection === 'open') {
          this.connected = true;
          this.reconnectAttempts = 0;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
          }
          console.log('[WhatsApp] Connected. Session persisted on disk.');
          await this.notifyOwner('WhatsApp channel online.');
        }

        if (connection === 'close') {
          this.connected = false;
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
            ?.output?.statusCode;

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.warn('[WhatsApp] Connection closed.', { statusCode, shouldReconnect });

          if (shouldReconnect) {
            this.scheduleReconnect();
          }
        }
      });

      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const message of messages) {
          try {
            await this.handleIncomingMessage(message);
          } catch (error) {
            console.error('[WhatsApp] Error handling message:', error);
          }
        }
      });
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempts, 5));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error) => {
        console.error('[WhatsApp] reconnect failed', error);
        this.scheduleReconnect();
      });
    }, delayMs);
  }

  private async handleIncomingMessage(message: WAMessage): Promise<void> {
    const socket = this.sock;
    if (!socket) return;

    if (!message.key.remoteJid || message.key.fromMe) return;
    if (isJidBroadcast(message.key.remoteJid)) return;
    if (message.key.remoteJid.endsWith('@g.us')) return;

    const incomingText = this.extractText(message);
    if (!incomingText) return;

    const phone = this.normalizePhone(message.key.remoteJid.split('@')[0]);
    let user = await this.deps.usersRepo.getOrCreateByPhone({
      phone,
      ownerPhone: this.normalizePhone(this.config.ownerPhone),
      name: `WhatsApp ${phone}`
    });

    if (this.config.ownerPhone && phone === this.normalizePhone(this.config.ownerPhone) && user.role !== 'owner') {
      const promoted = await this.deps.usersRepo.updateRole(user.id, 'owner');
      if (promoted) user = promoted;
    }

    const conversation = await this.deps.conversationsRepo.getOrCreate(user.id, 'whatsapp');

    const permission = this.deps.permissions.authorizeInput(user.role, incomingText, 'whatsapp');
    if (!permission.allowed) {
      await this.replyAndPersist({
        jid: message.key.remoteJid,
        conversationId: conversation.id,
        userText: incomingText,
        replyText: permission.reason || 'Sem permissao.'
      });
      return;
    }

    if (incomingText.startsWith('!')) {
      const commandResponse = await this.handleCommand(incomingText, user);
      await this.replyAndPersist({
        jid: message.key.remoteJid,
        conversationId: conversation.id,
        userText: incomingText,
        replyText: commandResponse
      });
      return;
    }

    const ragResponse = await this.deps.rag.respond(incomingText, {
      conversationId: `whatsapp:${conversation.id}`,
      source: 'whatsapp',
      channel: 'whatsapp',
      userRole: user.role
    });

    await this.replyAndPersist({
      jid: message.key.remoteJid,
      conversationId: conversation.id,
      userText: incomingText,
      replyText: ragResponse.text,
      metadata: {
        provider: ragResponse.routerOutput.provider,
        complexity: ragResponse.routerOutput.complexity,
        memoriesUsed: ragResponse.usedMemories.map((memory) => memory.id)
      }
    });

    await this.deps.memory.remember(
      `User ${user.name} (${user.role}) on WhatsApp said: ${incomingText}\nAgent response: ${ragResponse.text}`,
      'whatsapp'
    );
  }

  private async handleCommand(commandText: string, user: UserRecord): Promise<string> {
    const parts = commandText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === '!status') {
      const memCount = await this.deps.memory.count();
      const nome = this.deps.personality.get('nome');
      const humor = this.deps.personality.get('humor_atual');
      return `${nome} online.\nHumor: ${humor}\nMemórias: ${memCount}\nPipeline RAG ativo.`;
    }

    if (cmd === '!ping') return 'pong';

    if (cmd === '!help') {
      if (user.role === 'owner') {
        return (
          'Comandos owner:\n' +
          '!status — estado atual\n' +
          '!ping — latência\n' +
          '!aprender <fato> — ensinar algo novo\n' +
          '!personalidade ver — ver traits atuais\n' +
          '!personalidade set <trait> <valor> — editar trait\n' +
          '!code analyze — rodar ciclo de auto-melhoria\n' +
          '!approval approve <id> | !approval reject <id>\n' +
          '!analytics [suggest|approve <id>|reject <id>]'
        );
      }
      return 'Comandos: !status, !ping, !help';
    }

    // Owner-only commands
    if (user.role !== 'owner') {
      return 'Sem permissão para este comando.';
    }

    if (cmd === '!aprender') {
      const fact = parts.slice(1).join(' ').trim();
      if (!fact) return 'Uso: !aprender <fato>';
      await this.deps.memory.saveRaw(fact, 'whatsapp', 'learned_fact');
      return `Aprendi e memorizei: "${fact}"`;
    }

    if (cmd === '!personalidade') {
      const sub = parts[1]?.toLowerCase();

      if (sub === 'ver') {
        const all = this.deps.personality.getAll();
        return Object.entries(all)
          .map(([k, v]) => `*${k}*: ${v.slice(0, 100)}`)
          .join('\n');
      }

      if (sub === 'set' && parts[2] && parts.length > 3) {
        const trait = parts[2].toLowerCase();
        const value = parts.slice(3).join(' ');
        await this.deps.personality.set(trait, value);
        return `Trait "${trait}" atualizado para: "${value}"`;
      }

      return 'Uso: !personalidade ver | !personalidade set <trait> <valor>';
    }

    if (cmd === '!code' && parts[1]?.toLowerCase() === 'analyze') {
      const summary = await this.deps.selfImprovement.analyzeAndPropose();
      return (
        'Auto-análise concluída.\n' +
        `Sugestões: ${summary.suggestions.length}\n` +
        `Propostas criadas: ${summary.createdProposals.length}`
      );
    }

    if (cmd === '!approval' && parts.length >= 3) {
      const action = parts[1]?.toLowerCase();
      const id = Number(parts[2]);

      if (!Number.isFinite(id) || (action !== 'approve' && action !== 'reject')) {
        return 'Uso: !approval approve <id> | !approval reject <id>';
      }

      const result = await this.deps.selfImprovement.handleApproval(
        id,
        action as 'approve' | 'reject'
      );
      return result;
    }

    if (cmd === '!analytics') {
      const sub = parts[1]?.toLowerCase();

      if (!sub) {
        return this.deps.analytics.formatDashboardText();
      }

      if (sub === 'suggest') {
        const result = await this.deps.analytics.runPatternAnalysisCycle();
        const summary = result.suggestions.length === 0
          ? 'Nenhuma sugestão nova.'
          : result.suggestions.map((s) => `#${s.id} ${s.trait}: ${s.suggestedValue.slice(0, 60)}`).join('\n');

        return `Insights:\n${result.insights.slice(0, 800)}\n\nSugestões:\n${summary}`;
      }

      if ((sub === 'approve' || sub === 'reject') && parts[2]) {
        const id = Number(parts[2]);
        if (!Number.isFinite(id)) return 'ID inválido.';
        return this.deps.analytics.reviewSuggestion(id, sub === 'approve');
      }

      if (sub === 'pending') {
        const pending = await this.deps.analytics.listPendingSuggestions(10);
        if (pending.length === 0) return 'Sem sugestões pendentes.';
        return pending
          .map((s) => `#${s.id} ${s.trait}: ${s.suggestedValue.slice(0, 70)}`)
          .join('\n');
      }

      return 'Uso: !analytics | !analytics suggest | !analytics pending | !analytics approve <id> | !analytics reject <id>';
    }

    return 'Comando não reconhecido. Use !help';
  }

  private async replyAndPersist(input: {
    jid: string;
    conversationId: number;
    userText: string;
    replyText: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const socket = this.sock;
    if (!socket) return;

    await socket.sendMessage(input.jid, { text: input.replyText });

    const nowIso = new Date().toISOString();
    const messages: ConversationMessage[] = [
      {
        role: 'user',
        text: input.userText,
        timestamp: nowIso
      },
      {
        role: 'assistant',
        text: input.replyText,
        timestamp: nowIso,
        metadata: input.metadata
      }
    ];

    await this.deps.conversationsRepo.appendMessages(input.conversationId, messages);
  }

  private extractText(message: WAMessage): string {
    return (
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      ''
    ).trim();
  }

  private normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }
}
