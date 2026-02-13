import { env } from '../config/env.js';
import { permissions } from '../core/permissions.js';
import { ConversationsRepository } from '../database/repositories/conversations.js';
import { UsersRepository } from '../database/repositories/users.js';
import { MemoryService } from '../memory/service.js';
import { RagService } from '../memory/rag.js';
import { WhatsAppBaileysChannel } from './whatsapp.js';

export const createWhatsAppChannel = (rag: RagService, memory: MemoryService): WhatsAppBaileysChannel => {
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
      usersRepo,
      conversationsRepo,
      permissions
    }
  );
};
