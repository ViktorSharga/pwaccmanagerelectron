import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Account } from '@shared/types';
import { generateAccountId, validateAccount } from '@shared/utils/validation';

export class AccountStorage {
  private accountsPath: string;
  private accounts: Account[] = [];
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.accountsPath = path.join(userDataPath, 'accounts.json');
    this.loadAccounts();
  }

  private async loadAccounts(): Promise<void> {
    try {
      const data = await fs.readFile(this.accountsPath, 'utf-8');
      this.accounts = JSON.parse(data);
    } catch (error) {
      this.accounts = [];
    }
  }

  private async saveAccountsDebounced(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      await this.saveAccountsToDisk();
    }, 500);
  }

  private async saveAccountsToDisk(): Promise<void> {
    const dir = path.dirname(this.accountsPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.accountsPath, JSON.stringify(this.accounts, null, 2));
  }

  async getAccounts(): Promise<Account[]> {
    return [...this.accounts];
  }

  async saveAccount(account: Partial<Account>): Promise<Account> {
    const errors = validateAccount(account);
    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    let savedAccount: Account;

    if (account.id) {
      const index = this.accounts.findIndex(a => a.id === account.id);
      if (index === -1) {
        throw new Error('Account not found');
      }

      const existingDuplicate = this.accounts.find(
        a => a.login === account.login && a.id !== account.id
      );
      if (existingDuplicate) {
        throw new Error('An account with this login already exists');
      }

      savedAccount = { ...this.accounts[index], ...account } as Account;
      this.accounts[index] = savedAccount;
    } else {
      const duplicate = this.accounts.find(a => a.login === account.login);
      if (duplicate) {
        throw new Error('An account with this login already exists');
      }

      savedAccount = {
        ...account,
        id: generateAccountId(),
        isRunning: false,
      } as Account;
      this.accounts.push(savedAccount);
    }

    await this.saveAccountsDebounced();
    return savedAccount;
  }

  async deleteAccount(id: string): Promise<void> {
    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('Account not found');
    }

    this.accounts.splice(index, 1);
    await this.saveAccountsDebounced();
  }

  async exportAccounts(accounts: Account[], filePath: string, format: 'json' | 'csv'): Promise<void> {
    if (format === 'json') {
      await fs.writeFile(filePath, JSON.stringify(accounts, null, 2));
    } else {
      const headers = ['login', 'password', 'server', 'character', 'class', 'level', 'proxy', 'forceID'];
      const csv = [
        headers.join(','),
        ...accounts.map(account => 
          headers.map(h => {
            const value = account[h as keyof Account];
            return value !== undefined ? `"${value}"` : '';
          }).join(',')
        ),
      ].join('\n');
      
      await fs.writeFile(filePath, csv);
    }
  }

  async importAccounts(filePath: string, format: 'json' | 'csv'): Promise<Account[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    let importedAccounts: Partial<Account>[] = [];

    if (format === 'json') {
      importedAccounts = JSON.parse(content);
    } else {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const account: any = {};
        
        headers.forEach((header, index) => {
          let value = values[index]?.trim().replace(/^"|"$/g, '') || '';
          
          if (header === 'level' || header === 'forceID') {
            account[header] = value ? parseInt(value, 10) : undefined;
          } else if (value) {
            account[header] = value;
          }
        });
        
        importedAccounts.push(account);
      }
    }

    const savedAccounts: Account[] = [];
    
    for (const account of importedAccounts) {
      try {
        const existingAccount = this.accounts.find(a => a.login === account.login);
        if (!existingAccount) {
          const saved = await this.saveAccount(account);
          savedAccounts.push(saved);
        }
      } catch (error) {
        console.error(`Failed to import account ${account.login}:`, error);
      }
    }

    return savedAccounts;
  }
}