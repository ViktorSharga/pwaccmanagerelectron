import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Account } from '../../shared/types';
import { generateAccountId, validateAccount } from '../../shared/utils/validation';

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
      // Explicitly use UTF-8 encoding
      const data = await fs.readFile(this.accountsPath, 'utf-8');
      
      // Debug the raw JSON data
      console.log('📄 Loading accounts from:', this.accountsPath);
      console.log('📄 Raw JSON preview (first 200 chars):', data.substring(0, 200));
      
      this.accounts = JSON.parse(data);
      
      // Debug loaded accounts for Cyrillic corruption
      console.log(`📄 Loaded ${this.accounts.length} accounts`);
      this.accounts.forEach((account, index) => {
        if (account.characterName) {
          const hasQuestionMarks = account.characterName.includes('?');
          if (hasQuestionMarks) {
            console.error(`⚠️ Account ${account.login} has corrupted character name in JSON file: "${account.characterName}"`);
          } else {
            console.log(`✅ Account ${account.login} character name loaded correctly: "${account.characterName}"`);
          }
        }
      });
    } catch (error) {
      console.log('📄 No existing accounts file or error reading it:', error);
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
    
    // Debug before saving
    console.log('💾 Saving accounts to disk...');
    this.accounts.forEach(account => {
      if (account.characterName) {
        console.log(`💾 Saving ${account.login} with character: "${account.characterName}"`);
      }
    });
    
    // IMPORTANT: Explicitly specify UTF-8 encoding when writing
    const jsonContent = JSON.stringify(this.accounts, null, 2);
    await fs.writeFile(this.accountsPath, jsonContent, 'utf-8');
    console.log('💾 Accounts saved successfully');
  }

  async getAccounts(): Promise<Account[]> {
    // Debug when accounts are requested
    console.log('🔍 getAccounts called, returning', this.accounts.length, 'accounts');
    
    // Populate runtime sourceBatchFile field if the original batch file still exists
    const accountsWithBatchFiles = await Promise.all(
      this.accounts.map(async (account) => {
        const accountCopy = { ...account };
        
        if (account.originalBatchFilePath) {
          try {
            await fs.access(account.originalBatchFilePath);
            // File exists, set the runtime field
            accountCopy.sourceBatchFile = account.originalBatchFilePath;
          } catch {
            // File doesn't exist, don't set the runtime field
            accountCopy.sourceBatchFile = undefined;
          }
        }
        
        // Debug character name when returning accounts
        if (accountCopy.characterName && accountCopy.characterName.includes('?')) {
          console.error(`⚠️ getAccounts: ${accountCopy.login} has corrupted character name: "${accountCopy.characterName}"`);
        }
        
        return accountCopy;
      })
    );
    
    return accountsWithBatchFiles;
  }

  async saveAccount(account: Partial<Account>): Promise<Account> {
    // Debug incoming account data
    if (account.characterName) {
      console.log(`📝 saveAccount: Saving ${account.login} with character: "${account.characterName}"`);
      if (account.characterName.includes('?')) {
        console.error(`⚠️ saveAccount: Character name already corrupted!`);
      }
    }
    
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

      // Exclude runtime-only fields when updating
      const { sourceBatchFile, ...accountToSave } = account;
      savedAccount = { ...this.accounts[index], ...accountToSave } as Account;
      this.accounts[index] = savedAccount;
    } else {
      const duplicate = this.accounts.find(a => a.login === account.login);
      if (duplicate) {
        throw new Error('An account with this login already exists');
      }

      // Exclude runtime-only fields when saving
      const { sourceBatchFile, ...accountToSave } = account;
      savedAccount = {
        ...accountToSave,
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
      // Ensure UTF-8 encoding for export
      await fs.writeFile(filePath, JSON.stringify(accounts, null, 2), 'utf-8');
    } else {
      const headers = ['login', 'password', 'server', 'characterName', 'description', 'owner'];
      const csv = [
        headers.join(','),
        ...accounts.map(account => 
          headers.map(h => {
            const value = account[h as keyof Account];
            return value !== undefined ? `"${value}"` : '';
          }).join(',')
        ),
      ].join('\n');
      
      // Ensure UTF-8 encoding for CSV export
      await fs.writeFile(filePath, csv, 'utf-8');
    }
  }

  async parseImportFile(filePath: string, format: 'json' | 'csv'): Promise<{
    accounts: Partial<Account>[];
    existing: string[];
    new: string[];
  }> {
    // Ensure UTF-8 encoding when reading import files
    const content = await fs.readFile(filePath, 'utf-8');
    
    console.log(`📥 Importing from ${filePath}, format: ${format}`);
    console.log(`📥 File content preview (first 200 chars):`, content.substring(0, 200));
    
    let importedAccounts: Partial<Account>[] = [];

    if (format === 'json') {
      const parsed = JSON.parse(content);
      
      // Handle old format with metadata wrapper
      if (parsed.metadata && parsed.accounts) {
        console.log('Detected old format JSON with metadata wrapper');
        importedAccounts = parsed.accounts;
      } else if (Array.isArray(parsed)) {
        console.log('Detected new format JSON (direct array)');
        importedAccounts = parsed;
      } else {
        console.log('Unknown JSON format, treating as single account');
        importedAccounts = [parsed];
      }
      
      // Normalize field names for old format compatibility
      importedAccounts = importedAccounts.map(account => {
        const normalized: any = { ...account };
        
        // Convert character_name to characterName
        if (normalized.character_name !== undefined) {
          normalized.characterName = normalized.character_name;
          delete normalized.character_name;
        }
        
        // Debug imported character names
        if (normalized.characterName) {
          console.log(`📥 Imported ${normalized.login} with character: "${normalized.characterName}"`);
          if (normalized.characterName.includes('?')) {
            console.error(`⚠️ Import: Character name already corrupted in source file!`);
          }
        }
        
        // Ensure empty strings are converted to undefined for optional fields
        if (normalized.characterName === '') normalized.characterName = undefined;
        if (normalized.description === '') normalized.description = undefined;
        if (normalized.owner === '') normalized.owner = undefined;
        
        return normalized;
      });
    } else {
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) return { accounts: [], existing: [], new: [] };

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].match(/(".*?"|[^,]+)/g) || [];
        const account: any = {};
        
        headers.forEach((header, index) => {
          let value = values[index]?.trim().replace(/^"|"$/g, '') || '';
          
          if (value) {
            account[header] = value;
          }
        });
        
        importedAccounts.push(account);
      }
    }

    const existing: string[] = [];
    const newAccounts: string[] = [];

    for (const account of importedAccounts) {
      if (account.login) {
        const existingAccount = this.accounts.find(a => a.login === account.login);
        if (existingAccount) {
          existing.push(account.login);
        } else {
          newAccounts.push(account.login);
        }
      }
    }

    return {
      accounts: importedAccounts,
      existing,
      new: newAccounts
    };
  }

  async importSelectedAccounts(selectedAccounts: Partial<Account>[], createBatchFiles: boolean = false, gamePath?: string): Promise<{
    savedAccounts: Account[];
    errors: { login: string; error: string }[];
  }> {
    const savedAccounts: Account[] = [];
    const errors: { login: string; error: string }[] = [];
    
    for (const account of selectedAccounts) {
      try {
        // Debug before saving
        if (account.characterName) {
          console.log(`📥 Processing import for ${account.login} with character: "${account.characterName}"`);
        }
        
        // Remove id and runtime-only fields to ensure accounts are treated as new
        const { id, isRunning, sourceBatchFile, ...accountToImport } = account;
        
        // Note: BAT file creation is now handled in the IPC handlers after import
        
        const saved = await this.saveAccount(accountToImport);
        savedAccounts.push(saved);
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error';
        errors.push({ login: account.login || 'Unknown', error: errorMsg });
      }
    }

    // Force immediate save to disk after import to ensure data is available
    if (savedAccounts.length > 0) {
      await this.saveAccountsToDisk();
    }
    
    return { savedAccounts, errors };
  }

  async importAccounts(filePath: string, format: 'json' | 'csv'): Promise<Account[]> {
    const importData = await this.parseImportFile(filePath, format);
    const result = await this.importSelectedAccounts(importData.accounts);
    return result.savedAccounts;
  }

  destroy(): void {
    // Clear any pending save timeout to prevent memory leaks
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Clear accounts array to free memory
    this.accounts = [];
  }
}