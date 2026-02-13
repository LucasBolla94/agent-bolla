import { env } from '../config/env.js';
import { permissions } from '../core/permissions.js';
import { CodeImprovementsRepository } from '../database/repositories/code-improvements.js';
import { ConversationsRepository } from '../database/repositories/conversations.js';
import { UsersRepository } from '../database/repositories/users.js';
import { MemoryService } from '../memory/service.js';
import { RagService } from '../memory/rag.js';
import { PersonalityService } from '../personality/service.js';
import { TelegramGrammYChannel } from './telegram.js';
import { WhatsAppBaileysChannel } from './whatsapp.js';

export const createWhatsAppChannel = (
  rag: RagService,
  memory: MemoryService,
  personality: PersonalityService
): WhatsAppBaileysChannel => {
  const usersRepo = new UsersRepository();
  const conversationsRepo = new ConversationsRepository();

  return new WhatsAppBaileysChannel(
    {
      enabled: env.WHATSAPP_ENABLED === 'true',
      authDir: env.WHATSAPP_AUTH_DIR,
      ownerPhone: env.OWNER_WHATSAPP || ''
    },
    {
      rag,
      memory,
      personality,
      usersRepo,
      conversationsRepo,
      permissions
    }
  );
};

export const createTelegramChannel = (
  rag: RagService,
  memory: MemoryService,
  personality: PersonalityService
): TelegramGrammYChannel => {
  const usersRepo = new UsersRepository();
  const conversationsRepo = new ConversationsRepository();
  const codeImprovementsRepo = new CodeImprovementsRepository();

  return new TelegramGrammYChannel(
    {
      enabled: env.TELEGRAM_ENABLED === 'true',
      botToken: env.TELEGRAM_BOT_TOKEN || '',
      ownerTelegramId: env.OWNER_TELEGRAM_ID || ''
    },
    {
      rag,
      memory,
      personality,
      usersRepo,
      conversationsRepo,
      permissions,
      codeImprovementsRepo
    }
  );
};
