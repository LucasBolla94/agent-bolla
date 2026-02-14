import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  useMultiFileAuthState,
  WAMessage,
  WASocket
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import { RagService } from '../memory/rag.js';
import { MemoryService } from '../memory/service.js';
import { PersonalityService } from '../personality/service.js';
import { ConversationsRepository, ConversationMessage } from '../database/repositories/conversations.js';
import { UserRecord, UsersRepository } from '../database/repositories/users.js';
import { PermissionService } from '../core/permissions.js';
import { SelfImprovementService } from '../self-improvement/service.js';
import { AnalyticsService } from '../analytics/service.js';
import { HiveNetwork } from '../hive/index.js';

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
  hive?: HiveNetwork;
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

  private async clearAuthFiles(): Promise<void> {
    try {
      if (existsSync(this.config.authDir)) {
        await rm(this.config.authDir, { recursive: true, force: true });
        console.log('[WhatsApp] Auth directory cleared:', this.config.authDir);
      }
    } catch (error) {
      console.error('[WhatsApp] Error clearing auth files:', error);
    }
  }

  private async renderQRCode(text: string): Promise<void> {
    try {
      // Salva QR code como imagem PNG
      const qrImagePath = 'data/whatsapp-qr.png';
      await QRCode.toFile(qrImagePath, text, {
        errorCorrectionLevel: 'M',
        type: 'png',
        width: 400,
        margin: 2
      });
      process.stdout.write(`\n🎯 QR Code salvo em: ${qrImagePath}\n`);
      process.stdout.write(`📥 Baixe/abra este arquivo para escanear!\n\n`);

      // Detecta se está em ambiente SSH/remoto
      const isSSH = Boolean(process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY);
      const term = process.env.TERM || '';
      const isLimitedTerminal = term.includes('xterm') || term.includes('screen') || term.includes('vt100');

      // IMPORTANTE: Usar process.stdout.write() ao invés de console.log()
      // para evitar que o logger estruturado (pino) escape os \n

      // Se for SSH ou terminal limitado, mostra header
      if (isSSH || isLimitedTerminal) {
        process.stdout.write('\n╔═══════════════════════════════════════════════════════╗\n');
        process.stdout.write('║  📱 WHATSAPP QR CODE - Scan with your phone          ║\n');
        process.stdout.write('╚═══════════════════════════════════════════════════════╝\n\n');
      }

      // Gera QR code como matriz de dados
      const qrMatrix = await QRCode.create(text, {
        errorCorrectionLevel: 'M'
      });

      const modules = qrMatrix.modules;
      const size = modules.size;
      const data = modules.data;

      // Adiciona borda branca
      const border = 2;
      let qrString = '';

      // Usa caracteres diferentes dependendo do ambiente
      const darkPixel = (isSSH || isLimitedTerminal) ? '  ' : '  ';
      const lightPixel = (isSSH || isLimitedTerminal) ? '██' : '██';

      // Linha superior da borda
      for (let i = 0; i < size + border * 2; i++) {
        qrString += lightPixel;
      }
      qrString += '\n';

      // Renderiza o QR code com borda
      for (let y = 0; y < size; y++) {
        // Borda esquerda
        for (let i = 0; i < border; i++) {
          qrString += lightPixel;
        }

        // Conteúdo do QR code
        for (let x = 0; x < size; x++) {
          const isDark = data[y * size + x];
          qrString += isDark ? darkPixel : lightPixel;
        }

        // Borda direita
        for (let i = 0; i < border; i++) {
          qrString += lightPixel;
        }
        qrString += '\n';
      }

      // Linha inferior da borda
      for (let i = 0; i < size + border * 2; i++) {
        qrString += lightPixel;
      }
      qrString += '\n';

      // Imprime o QR code diretamente no stdout (sem passar pelo logger)
      process.stdout.write(qrString);

      // Adiciona instrução extra para SSH
      if (isSSH || isLimitedTerminal) {
        process.stdout.write('\n╔═══════════════════════════════════════════════════════╗\n');
        process.stdout.write('║  DICA: Se o QR code não estiver legível:             ║\n');
        process.stdout.write('║  1. Aumente o tamanho da fonte do terminal            ║\n');
        process.stdout.write('║  2. Dê zoom out na janela do terminal                 ║\n');
        process.stdout.write('║  3. Use cliente SSH melhor (Windows Terminal, iTerm2) ║\n');
        process.stdout.write('╚═══════════════════════════════════════════════════════╝\n\n');
      }

      process.stdout.write('\n[WhatsApp] Escaneie o QR code acima com o WhatsApp.\n\n');
    } catch (error) {
      console.error('[WhatsApp] Erro ao gerar QR code:', error);
      // Fallback: imprime o texto do QR
      process.stdout.write('\n❌ Falha ao renderizar QR code. Texto do QR:\n');
      process.stdout.write('─'.repeat(60) + '\n');
      process.stdout.write(text + '\n');
      process.stdout.write('─'.repeat(60) + '\n');
      process.stdout.write('\nGere o QR code em: https://www.qr-code-generator.com/\n');
      process.stdout.write('Cole o texto acima para gerar um QR code escaneável.\n\n');
    }
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

      this.sock.ev.on('creds.update', async () => {
        console.log('[WhatsApp] 💾 Credenciais atualizadas, salvando...');
        await saveCreds();
        console.log('[WhatsApp] ✓ Credenciais salvas em:', this.config.authDir);
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const timestamp = new Date().toLocaleTimeString('pt-BR');
          console.log(`\n[WhatsApp] 🔄 NOVO QR Code gerado às ${timestamp}:\n`);
          await this.renderQRCode(qr);
          console.log(`\n[WhatsApp] ⚡ QR Code válido por ~60 segundos. Um novo será gerado automaticamente.\n`);
        }

        if (connection === 'open') {
          this.connected = true;
          this.reconnectAttempts = 0;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
          }
          console.log('[WhatsApp] 🎉 Connected! Aguardando sincronização...');
          // Aguarda um pouco para garantir que todas as credenciais foram salvas
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('[WhatsApp] ✓ Connected. Session persisted on disk.');
          await this.notifyOwner('WhatsApp channel online.');
        }

        if (connection === 'close') {
          this.connected = false;
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
            ?.output?.statusCode;

          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          console.warn('[WhatsApp] Connection closed.', { statusCode, shouldReconnect });

          // Se foi logout (desconectado pelo app), limpa as credenciais
          if (statusCode === DisconnectReason.loggedOut) {
            console.warn('[WhatsApp] Session logged out. Clearing auth files...');
            await this.clearAuthFiles();
            console.log('[WhatsApp] Auth files cleared. Use "bolla qr" to reconnect.');
          }

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

    // Indica que o bot está digitando enquanto processa a resposta da IA
    await socket.sendPresenceUpdate('composing', message.key.remoteJid).catch(() => {});

    let ragResponse;
    try {
      ragResponse = await this.deps.rag.respond(incomingText, {
        conversationId: `whatsapp:${conversation.id}`,
        source: 'whatsapp',
        channel: 'whatsapp',
        userRole: user.role
      });
    } finally {
      await socket.sendPresenceUpdate('paused', message.key.remoteJid).catch(() => {});
    }

    if (!ragResponse) return;

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
      const soul = this.deps.personality.hasSoulFile() ? 'soul.md ativo' : 'usando defaults';
      return `${nome} online.\nHumor: ${humor}\nMemórias: ${memCount}\nSoul: ${soul}\nPipeline RAG ativo.`;
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
          '!analytics [suggest|approve <id>|reject <id>]\n' +
          '!hive [status|peers|ask <peer> <tarefa>|role <role> <tarefa>]'
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

    if (cmd === '!hive') {
      const hive = this.deps.hive;
      if (!hive) return 'Hive indisponível.';

      const sub = parts[1]?.toLowerCase();

      if (!sub || sub === 'status') {
        const status = hive.status();
        return (
          `Hive: ${status.enabled ? 'enabled' : 'disabled'}\n` +
          `Agent: ${status.agentName} (${status.role})\n` +
          `Listening: ${status.listening}\n` +
          `Port: ${status.port}\n` +
          `Peers: ${status.peers.length}`
        );
      }

      if (sub === 'peers') {
        const peers = hive.status().peers;
        if (peers.length === 0) return 'Sem peers configurados.';
        return peers.map((peer) => `- ${peer.name} [${peer.role}] ${peer.baseUrl}`).join('\n');
      }

      if (sub === 'ask' && parts[2] && parts.length > 3) {
        const peerName = parts[2];
        const task = parts.slice(3).join(' ').trim();
        if (!task) return 'Uso: !hive ask <peer> <tarefa>';

        const result = await hive.delegateToPeer(peerName, task, 'complex');
        if (!result.ok) return `Falha: ${result.error || 'erro desconhecido'}`;
        return `[${result.agent}/${result.role}] ${result.response.slice(0, 1400)}`;
      }

      if (sub === 'role' && parts[2] && parts.length > 3) {
        const role = parts[2];
        const task = parts.slice(3).join(' ').trim();
        if (!task) return 'Uso: !hive role <role> <tarefa>';

        const result = await hive.delegateToRole(role, task, 'complex');
        if (!result.ok) return `Falha: ${result.error || 'erro desconhecido'}`;
        return `[${result.agent}/${result.role}] ${result.response.slice(0, 1400)}`;
      }

      return 'Uso: !hive [status|peers|ask <peer> <tarefa>|role <role> <tarefa>]';
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
