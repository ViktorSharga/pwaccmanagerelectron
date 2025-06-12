import { Account } from '../types';

export function validateAccount(account: Partial<Account>): string[] {
  const errors: string[] = [];

  if (!account.login || account.login.trim().length === 0) {
    errors.push('Login is required');
  }

  if (!account.password || account.password.trim().length === 0) {
    errors.push('Password is required');
  }

  if (!account.server || account.server.trim().length === 0) {
    errors.push('Server is required');
  }

  if (account.level !== undefined && (account.level < 1 || account.level > 105)) {
    errors.push('Level must be between 1 and 105');
  }

  if (account.forceID !== undefined && (account.forceID < 0 || account.forceID > 255)) {
    errors.push('Force ID must be between 0 and 255');
  }

  return errors;
}

export function generateAccountId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function serializeAccount(account: Account): string {
  return JSON.stringify(account);
}

export function deserializeAccount(data: string): Account {
  return JSON.parse(data);
}