import { Account } from '../../src/shared/types';
import { generateAccountId, validateAccount } from '../../src/shared/utils/validation';

export class MockAccountStorage {
  private accounts: Account[] = [];

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

    return savedAccount;
  }

  async deleteAccount(id: string): Promise<void> {
    const index = this.accounts.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('Account not found');
    }

    this.accounts.splice(index, 1);
  }

  async exportAccounts(accounts: Account[], filePath: string, format: 'json' | 'csv'): Promise<void> {
    // Mock implementation - in real tests, this would write to a file
    if (format === 'json') {
      const json = JSON.stringify(accounts, null, 2);
      // Simulate file write
      return Promise.resolve();
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
      // Simulate file write
      return Promise.resolve();
    }
  }

  async importAccounts(filePath: string, format: 'json' | 'csv'): Promise<Account[]> {
    // This would be mocked in tests to return predefined data
    return [];
  }

  // Test utilities
  setAccounts(accounts: Account[]): void {
    this.accounts = [...accounts];
  }

  clearAccounts(): void {
    this.accounts = [];
  }

  getAccountCount(): number {
    return this.accounts.length;
  }
}