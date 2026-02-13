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
import { ConversationsRepository, ConversationMessage } from '../database/repositories/conversations.js';
import { UserRecord, UsersRepository } from '../database/repositories/users.js';
import { PermissionService } from '../core/permissions.js';

export interface WhatsAppChannelConfig {
  authDir: string;
  ownerPhone: string;
  enabled: boolean;
}

export interface WhatsAppChannelDeps {
  rag: RagService;
  memory: MemoryService;
  usersRepo: UsersRepository;
  conversationsRepo: ConversationsRepository;
  permissions: PermissionService;
}

export interface WhatsAppChannel {
  start(): Promise<void>;
  notifyOwner(text: string): Promise<void>;
}

export class WhatsAppBaileysChannel implements WhatsAppChannel {
  private sock?: WASocket;

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

  private async connect(): Promise<void> {
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
        console.log('[WhatsApp] Connected. Session persisted on disk.');
        await this.notifyOwner('WhatsApp channel online.');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
          ?.output?.statusCode;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.warn('[WhatsApp] Connection closed.', { statusCode, shouldReconnect });

        if (shouldReconnect) {
          await this.connect();
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
    const command = commandText.trim().toLowerCase();

    if (command === '!status') {
      return 'Agent online. WhatsApp conectado e pipeline RAG ativo.';
    }

    if (command === '!ping') {
      return 'pong';
    }

    if (command === '!help') {
      if (user.role === 'owner') {
        return 'Comandos owner: !status, !ping, !help';
      }
      return 'Comandos disponíveis: !status, !ping, !help';
    }

    return 'Comando sensível ou não reconhecido. Use !help';
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
