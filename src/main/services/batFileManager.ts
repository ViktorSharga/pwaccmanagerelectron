import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { app } from 'electron';
import { Account } from '../../shared/types';
import { logger } from './loggingService';

const execAsync = promisify(exec);

export class BatFileManager {
  private tempDir: string;
  private scriptPath: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'pw-account-manager');
    // Get the PowerShell script from the app resources
    this.scriptPath = path.join(app.getAppPath(), 'assets', 'scripts', 'create-bat.ps1');
  }

  /**
   * Create a permanent BAT file using PowerShell for proper encoding
   */
  async createBatFile(account: Account, gamePath: string): Promise<string> {
    logger.startOperation(`Creating BAT file for ${account.login}`);
    
    try {
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });

      // Create a temporary JSON file with account data
      const accountData = {
        login: account.login,
        password: account.password,
        characterName: account.characterName || '',
        server: account.server || 'Main'
      };

      const jsonPath = path.join(this.tempDir, `account_${account.id}_${Date.now()}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(accountData, null, 2), 'utf8');

      // Find ElementClient.exe in the game path
      const gameExePath = await this.findElementClientPath(gamePath);
      const gameDir = path.dirname(gameExePath);
      
      // Create BAT file path in game directory
      const sanitizedLogin = account.login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      const batFileName = `pw_${sanitizedLogin}.bat`;
      const batFilePath = path.join(gameDir, batFileName);

      // Build PowerShell command
      const psCommand = [
        'powershell.exe',
        '-ExecutionPolicy', 'Bypass',
        '-File', `"${this.scriptPath}"`,
        '-JsonPath', `"${jsonPath}"`,
        '-GamePath', `"${gameExePath}"`,
        '-OutputPath', `"${batFilePath}"`
      ].join(' ');

      logger.info(`Executing PowerShell command to create BAT file`, {
        command: psCommand,
        account: account.login,
        character: account.characterName,
        outputPath: batFilePath
      }, 'BAT_CREATION');

      // Execute PowerShell script
      const { stdout, stderr } = await execAsync(psCommand, { 
        timeout: 10000,
        cwd: this.tempDir
      });

      if (stdout) {
        console.log('PowerShell stdout:', stdout);
        logger.info('PowerShell script output', { stdout }, 'BAT_CREATION');
      }

      if (stderr) {
        console.warn('PowerShell stderr:', stderr);
        logger.warn('PowerShell script warnings', { stderr }, 'BAT_CREATION');
      }

      // Verify the BAT file was created
      try {
        await fs.access(batFilePath);
        const stats = await fs.stat(batFilePath);
        logger.info(`BAT file created successfully`, {
          path: batFilePath,
          size: stats.size,
          account: account.login
        }, 'BAT_CREATION');
      } catch (accessError) {
        throw new Error(`BAT file was not created at ${batFilePath}`);
      }

      // Clean up temporary JSON file
      await fs.unlink(jsonPath).catch(() => {});

      logger.endOperation(true);
      return batFilePath;

    } catch (error) {
      logger.error(`Failed to create BAT file for ${account.login}`, error, 'BAT_CREATION');
      logger.endOperation(false);
      throw error;
    }
  }

  /**
   * Check if BAT file exists for an account
   */
  async batFileExists(account: Account, gamePath: string): Promise<string | null> {
    try {
      const gameExePath = await this.findElementClientPath(gamePath);
      const gameDir = path.dirname(gameExePath);
      
      const sanitizedLogin = account.login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      const batFileName = `pw_${sanitizedLogin}.bat`;
      const batFilePath = path.join(gameDir, batFileName);

      try {
        await fs.access(batFilePath);
        return batFilePath;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Ensure BAT file exists, create if missing
   */
  async ensureBatFile(account: Account, gamePath: string): Promise<string> {
    const existingBatFile = await this.batFileExists(account, gamePath);
    
    if (existingBatFile) {
      logger.info(`Using existing BAT file for ${account.login}`, { path: existingBatFile }, 'BAT_CREATION');
      return existingBatFile;
    }

    logger.info(`BAT file missing for ${account.login}, creating new one`, null, 'BAT_CREATION');
    return await this.createBatFile(account, gamePath);
  }

  /**
   * Create BAT files for multiple accounts (used during import)
   */
  async createBatFilesForAccounts(accounts: Account[], gamePath: string): Promise<{success: string[], failed: Array<{account: Account, error: string}>}> {
    const success: string[] = [];
    const failed: Array<{account: Account, error: string}> = [];

    for (const account of accounts) {
      try {
        const batPath = await this.createBatFile(account, gamePath);
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
          const files = await fs.readdir(checkPath);
          const executableName = files.find(file => {
            const lowerFile = file.toLowerCase();
            return lowerFile === 'elementclient.exe' ||
                   lowerFile === 'element client.exe' ||
                   lowerFile === 'element_client.exe' ||
                   (lowerFile.includes('elementclient') && lowerFile.endsWith('.exe'));
          });
          
          if (executableName) {
            const fullPath = path.join(checkPath, executableName);
            const stats = await fs.stat(fullPath);
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
  async cleanupOldBatFiles(gamePath: string, validAccountLogins: string[]): Promise<void> {
    try {
      const gameExePath = await this.findElementClientPath(gamePath);
      const gameDir = path.dirname(gameExePath);
      
      const files = await fs.readdir(gameDir);
      const batFiles = files.filter(file => 
        file.toLowerCase().startsWith('pw_') && 
        file.toLowerCase().endsWith('.bat')
      );

      for (const batFile of batFiles) {
        // Extract login from filename: pw_login.bat
        const loginMatch = batFile.match(/^pw_(.+)\.bat$/i);
        if (loginMatch) {
          const fileLogin = loginMatch[1].replace(/_/g, ' '); // Reverse sanitization
          
          // Check if this login still exists in valid accounts
          const isValid = validAccountLogins.some(login => {
            const sanitized = login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
            return sanitized === loginMatch[1];
          });

          if (!isValid) {
            const fullPath = path.join(gameDir, batFile);
            await fs.unlink(fullPath);
            logger.info(`Cleaned up orphaned BAT file: ${batFile}`, null, 'CLEANUP');
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup old BAT files', error, 'CLEANUP');
    }
  }
}