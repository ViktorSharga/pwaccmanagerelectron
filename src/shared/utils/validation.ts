import { Account } from '../types';

export function validateAccount(account: Partial<Account>): string[] {
  const errors: string[] = [];

  // Login: required and unique
  if (!account.login || account.login.trim().length === 0) {
    errors.push('Login is required');
  }

  // Password: required
  if (!account.password || account.password.trim().length === 0) {
    errors.push('Password is required');
  }

  // Server: must be Main or X
  if (!account.server || !['Main', 'X'].includes(account.server)) {
    errors.push('Server must be Main or X');
  }

  // Cyrillic support regex for optional fields - allow letters, numbers, spaces, and common punctuation
  const cyrillicRegex = /^[a-zA-Z0-9а-яА-Я\u00C0-\u024F\u1E00-\u1EFF\u4e00-\u9fff\s\-_.,'"/()]*$/;

  if (account.characterName && !cyrillicRegex.test(account.characterName)) {
    errors.push('Invalid characters in Character Name');
  }

  if (account.description && !cyrillicRegex.test(account.description)) {
    errors.push('Invalid characters in Description');
  }

  if (account.owner && !cyrillicRegex.test(account.owner)) {
    errors.push('Invalid characters in Owner');
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