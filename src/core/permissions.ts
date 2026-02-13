import { UserRole } from '../database/repositories/users.js';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionService {
  isOwner(role: UserRole): boolean {
    return role === 'owner';
  }

  canUseCommand(role: UserRole, commandText: string): PermissionResult {
    const command = commandText.trim();
    if (!command.startsWith('!')) {
      return { allowed: true };
    }

    if (this.isOwner(role)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Sem permissao para comandos sensiveis.'
    };
  }
}

export const permissions = new PermissionService();
