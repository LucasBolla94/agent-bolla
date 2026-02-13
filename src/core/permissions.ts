import { UserRole } from '../database/repositories/users.js';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

type Channel = 'whatsapp' | 'telegram' | 'internal';

const USER_ALLOWED_COMMANDS = new Set([
  '!status',
  '!help',
  '!ping',
  '/start',
  '/help',
  '/status',
  '/ping'
]);

export class PermissionService {
  isOwner(role: UserRole): boolean {
    return role === 'owner';
  }

  private normalizeCommand(commandText: string): string {
    const command = commandText.trim().split(/\s+/)[0].toLowerCase();
    if (command.startsWith('/')) {
      return command.replace(/@.+$/, '');
    }
    return command;
  }

  private isCommand(text: string, channel: Channel): boolean {
    if (channel === 'whatsapp') return text.trim().startsWith('!');
    if (channel === 'telegram') return text.trim().startsWith('/');
    return false;
  }

  authorizeInput(role: UserRole, text: string, channel: Channel): PermissionResult {
    if (!this.isCommand(text, channel)) {
      return { allowed: true };
    }

    const command = this.normalizeCommand(text);

    if (this.isOwner(role)) {
      return { allowed: true };
    }

    if (USER_ALLOWED_COMMANDS.has(command)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Sem permissão para esse comando.'
    };
  }

  canUseCommand(role: UserRole, commandText: string): PermissionResult {
    const trimmed = commandText.trim();
    const channel: Channel = trimmed.startsWith('/') ? 'telegram' : 'whatsapp';
    return this.authorizeInput(role, commandText, channel);
  }
}

export const permissions = new PermissionService();
