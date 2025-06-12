import * as path from 'path';
import * as fs from 'fs/promises';
import { Account } from '@shared/types';
import { generateAccountId } from '@shared/utils/validation';

export class BatchFileScanner {
  async scanFolder(folderPath: string): Promise<Partial<Account>[]> {
    const accounts: Partial<Account>[] = [];
    
    try {
      await this.scanDirectory(folderPath, accounts);
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
    
    return accounts;
  }

  private async scanDirectory(dirPath: string, accounts: Partial<Account>[]): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, accounts);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.bat')) {
        const account = await this.parseBatchFile(fullPath);
        if (account && account.login && account.password) {
          accounts.push(account);
        }
      }
    }
  }

  private async parseBatchFile(filePath: string): Promise<Partial<Account> | null> {
    try {
      let content = await fs.readFile(filePath, 'utf8');
      
      try {
        const contentCP1251 = await fs.readFile(filePath, 'binary');
        const iconv = await import('iconv-lite');
        content = iconv.decode(Buffer.from(contentCP1251, 'binary'), 'cp1251');
      } catch {
      }

      const account: Partial<Account> = {};
      
      const userMatch = content.match(/user:([^\s]+)/i);
      if (userMatch) {
        account.login = userMatch[1];
      }
      
      const pwdMatch = content.match(/pwd:([^\s]+)/i);
      if (pwdMatch) {
        account.password = pwdMatch[1];
      }
      
      const serverMatch = content.match(/server:([^\s]+)/i);
      if (serverMatch) {
        account.server = serverMatch[1];
      }
      
      const accountComment = content.match(/REM\s+Account:\s*(.+)/i);
      if (accountComment && !account.login) {
        account.login = accountComment[1].trim();
      }
      
      const serverComment = content.match(/REM\s+Server:\s*(.+)/i);
      if (serverComment && !account.server) {
        account.server = serverComment[1].trim();
      }
      
      return account;
    } catch (error) {
      console.error(`Error parsing batch file ${filePath}:`, error);
      return null;
    }
  }
}