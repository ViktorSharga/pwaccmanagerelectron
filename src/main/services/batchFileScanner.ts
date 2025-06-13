import * as path from 'path';
import * as fs from 'fs/promises';
import { Account } from '../../shared/types';
import { generateAccountId } from '../../shared/utils/validation';
import { readFileWithEncodingDetection } from '../../shared/utils/encoding';

export class BatchFileScanner {
  private readonly MAX_SCAN_DEPTH = 5; // Limit recursion depth to prevent stack overflow
  private readonly MAX_FILES_TO_SCAN = 1000; // Limit total files scanned to prevent memory issues

  async scanFolder(folderPath: string): Promise<Partial<Account>[]> {
    const accounts: Partial<Account>[] = [];
    
    try {
      await this.scanDirectory(folderPath, accounts, 0);
    } catch (error) {
      console.error('Error scanning folder:', error);
    }
    
    return accounts;
  }

  private async scanDirectory(dirPath: string, accounts: Partial<Account>[], depth: number): Promise<void> {
    // Prevent deep recursion that could cause stack overflow
    if (depth >= this.MAX_SCAN_DEPTH) {
      console.warn(`Reached maximum scan depth (${this.MAX_SCAN_DEPTH}) at: ${dirPath}`);
      return;
    }
    
    // Prevent scanning too many files to avoid memory issues
    if (accounts.length >= this.MAX_FILES_TO_SCAN) {
      console.warn(`Reached maximum file scan limit (${this.MAX_FILES_TO_SCAN}), stopping scan`);
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`Cannot read directory ${dirPath}:`, error);
      return;
    }
    
    for (const entry of entries) {
      // Check limits again in the loop
      if (accounts.length >= this.MAX_FILES_TO_SCAN) {
        break;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, accounts, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.bat')) {
        try {
          const account = await this.parseBatchFile(fullPath);
          if (account && account.login && account.password) {
            accounts.push(account);
          }
        } catch (error) {
          console.warn(`Error processing batch file ${fullPath}:`, error);
          // Continue processing other files even if one fails
        }
      }
    }
  }

  private async parseBatchFile(filePath: string): Promise<Partial<Account> | null> {
    try {
      // Use the new encoding detection utility
      const content = await readFileWithEncodingDetection(filePath);

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
        const serverValue = serverMatch[1];
        if (serverValue === 'Main' || serverValue === 'X') {
          account.server = serverValue;
        } else {
          // Default to Main for unknown servers
          account.server = 'Main';
        }
      }
      
      const accountComment = content.match(/REM\s+Account:\s*(.+)/i);
      if (accountComment && !account.login) {
        account.login = accountComment[1].trim();
      }
      
      const serverComment = content.match(/REM\s+Server:\s*(.+)/i);
      if (serverComment && !account.server) {
        const serverValue = serverComment[1].trim();
        if (serverValue === 'Main' || serverValue === 'X') {
          account.server = serverValue;
        } else {
          // Default to Main for unknown servers
          account.server = 'Main';
        }
      }
      
      // Parse description comment
      const descriptionComment = content.match(/REM\s+Description:\s*(.+)/i);
      if (descriptionComment) {
        account.description = descriptionComment[1].trim();
      }
      
      // Parse owner comment
      const ownerComment = content.match(/REM\s+Owner:\s*(.+)/i);
      if (ownerComment) {
        account.owner = ownerComment[1].trim();
      }
      
      // Parse character name from role parameter or comment
      const roleMatch = content.match(/role:([^\s]*)/i);
      if (roleMatch && roleMatch[1]) {
        account.characterName = roleMatch[1];
      }
      
      const characterComment = content.match(/REM\s+Character:\s*(.+)/i);
      if (characterComment && !account.characterName) {
        account.characterName = characterComment[1].trim();
      }
      
      // Ensure server is set (default to Main if not specified)
      if (!account.server) {
        account.server = 'Main';
      }
      
      // Store the source batch file path for reference
      account.sourceBatchFile = filePath;
      account.originalBatchFilePath = filePath;
      
      return account;
    } catch (error) {
      console.error(`Error parsing batch file ${filePath}:`, error);
      return null;
    }
  }
}