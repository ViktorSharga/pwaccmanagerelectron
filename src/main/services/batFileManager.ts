import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { app } from 'electron';
import { Account } from '../../shared/types';
import { logger } from './loggingService';

export class BatFileManager {
  private readonly scriptsDir: string;
  private gamePath: string;

  constructor(gamePath: string) {
    this.gamePath = gamePath;
    this.scriptsDir = path.join(app.getPath('userData'), 'scripts');
    this.ensureScriptsDirectory();
  }

  private ensureScriptsDirectory(): void {
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
  }

  /**
   * Creates a BAT file with proper Windows-1251 encoding
   */
  public createBatFile(account: Account): string {
    const batFileName = `pw_${account.login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);

    try {
      logger.startOperation(`Creating BAT file for ${account.login}`);
      
      // Build the batch file content
      const batContent = this.buildBatContent(account);
      
      // Convert to Windows-1251 encoding
      const buffer = iconv.encode(batContent, 'win1251');
      
      // Write the file
      fs.writeFileSync(batPath, buffer);
      
      // Log success (for debugging)
      logger.info(`Created BAT file: ${batPath}`, {
        path: batPath,
        size: buffer.length,
        account: account.login
      }, 'BAT_CREATION');
      
      logger.endOperation(true);
      return batPath;
    } catch (error: any) {
      logger.error(`Failed to create BAT file for ${account.login}`, error, 'BAT_CREATION');
      logger.endOperation(false);
      throw new Error(`Failed to create BAT file: ${error.message}`);
    }
  }

  /**
   * Builds the BAT file content
   */
  private buildBatContent(account: Account): string {
    const gameDir = path.dirname(this.gamePath);
    const exeName = path.basename(this.gamePath);
    
    // Build command parameters
    const params = [
      'startbypatcher',
      'nocheck',
      `user:${account.login}`,
      `pwd:${account.password}`
    ];
    
    // Add character name if present
    if (account.characterName && account.characterName.trim()) {
      params.push(`role:${account.characterName}`);
    }
    
    params.push('rendernofocus');
    
    // Build the complete BAT file content
    const batContent = `@echo off
chcp 1251
REM Account: ${account.login}
REM Character: ${account.characterName || 'None'}
REM Server: ${account.server || 'Unknown'}

cd /d "${gameDir}"
start "" "${exeName}" ${params.join(' ')}
exit
`;
    
    return batContent;
  }

  /**
   * Ensures a BAT file exists for the account, creates if missing
   */
  public ensureBatFile(account: Account): string {
    const batFileName = `pw_${account.login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);
    
    if (!fs.existsSync(batPath)) {
      return this.createBatFile(account);
    }
    
    logger.info(`Using existing BAT file for ${account.login}`, { path: batPath }, 'BAT_CREATION');
    return batPath;
  }

  /**
   * Creates BAT files for multiple accounts (used during import)
   */
  public async createBatFilesForAccounts(accounts: Account[], gamePath?: string): Promise<{success: string[], failed: Array<{account: Account, error: string}>}> {
    // Update game path if provided
    if (gamePath) {
      this.gamePath = gamePath;
    }
    
    const success: string[] = [];
    const failed: Array<{account: Account, error: string}> = [];
    
    for (const account of accounts) {
      try {
        const batPath = this.createBatFile(account);
        success.push(batPath);
        logger.info(`Created BAT file for imported account ${account.login}`, { path: batPath }, 'IMPORT');
      } catch (error: any) {
        failed.push({ account, error: error.message });
        logger.error(`Failed to create BAT file for imported account ${account.login}`, error, 'IMPORT');
      }
    }
    
    return { success, failed };
  }

  /**
   * Deletes a BAT file for an account
   */
  public deleteBatFile(login: string): boolean {
    const batFileName = `pw_${login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);
    
    try {
      if (fs.existsSync(batPath)) {
        fs.unlinkSync(batPath);
        logger.info(`Deleted BAT file for ${login}`, { path: batPath }, 'CLEANUP');
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error(`Failed to delete BAT file for ${login}`, error, 'CLEANUP');
      return false;
    }
  }

  /**
   * Debug function to verify encoding
   */
  public debugBatFile(account: Account): void {
    const batPath = this.ensureBatFile(account);
    const buffer = fs.readFileSync(batPath);
    
    console.log('=== BAT File Debug Info ===');
    console.log('Account:', account.login);
    console.log('Character:', account.characterName);
    console.log('File path:', batPath);
    console.log('File size:', buffer.length, 'bytes');
    
    // Show first 200 bytes as hex
    const hexView = Array.from(buffer.slice(0, 200))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log('First 200 bytes (hex):', hexView);
    
    // Try to decode back to verify
    const decodedContent = iconv.decode(buffer, 'win1251');
    console.log('Decoded content preview:', decodedContent.substring(0, 200));
    console.log('=========================');
  }

  /**
   * Find ElementClient.exe in the game path
   */
  private async findElementClientPath(folderPath: string): Promise<string> {
    try {
      // Check both root folder and element subfolder
      const possiblePaths = [
        folderPath,
        path.join(folderPath, 'element')
      ];
      
      for (const checkPath of possiblePaths) {
        try {
          const files = await fs.promises.readdir(checkPath);
          const executableName = files.find(file => {
            const lowerFile = file.toLowerCase();
            return lowerFile === 'elementclient.exe' ||
                   lowerFile === 'element client.exe' ||
                   lowerFile === 'element_client.exe' ||
                   (lowerFile.includes('elementclient') && lowerFile.endsWith('.exe'));
          });
          
          if (executableName) {
            const fullPath = path.join(checkPath, executableName);
            const stats = await fs.promises.stat(fullPath);
            if (stats.isFile()) {
              return fullPath;
            }
          }
        } catch (dirError) {
          continue;
        }
      }
      
      throw new Error('elementclient.exe not found');
    } catch (error) {
      console.error('Error finding elementclient.exe:', error);
      throw new Error('elementclient.exe not found');
    }
  }

  /**
   * Clean up old BAT files (optional maintenance)
   */
  async cleanupOldBatFiles(validAccountLogins: string[]): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.scriptsDir);
      const batFiles = files.filter(file => 
        file.toLowerCase().startsWith('pw_') && 
        file.toLowerCase().endsWith('.bat')
      );

      for (const batFile of batFiles) {
        // Extract login from filename: pw_login.bat
        const loginMatch = batFile.match(/^pw_(.+)\.bat$/i);
        if (loginMatch) {
          const fileLogin = loginMatch[1];
          
          // Check if this login still exists in valid accounts
          const isValid = validAccountLogins.includes(fileLogin);

          if (!isValid) {
            const fullPath = path.join(this.scriptsDir, batFile);
            await fs.promises.unlink(fullPath);
            logger.info(`Cleaned up orphaned BAT file: ${batFile}`, null, 'CLEANUP');
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup old BAT files', error, 'CLEANUP');
    }
  }
}