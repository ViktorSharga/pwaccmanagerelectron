import { ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Account, Settings } from '../../shared/types';
import { AccountStorage } from '../services/accountStorage';
import { SettingsManager } from '../services/settingsManager';
import { GameProcessManager } from '../services/gameProcessManager';
import { BatchFileScanner } from '../services/batchFileScanner';
import { WebViewManager } from '../services/webviewManager';
import { mainWindow } from '../main';
import { logger } from '../services/loggingService';
import { setupLoggingHandlers } from './loggingHandlers';

let accountStorage: AccountStorage;
let settingsManager: SettingsManager;
let gameProcessManager: GameProcessManager;
let webViewManager: WebViewManager;

async function validateGameFolder(folderPath: string): Promise<boolean> {
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
            console.log(`Found elementclient.exe at: ${fullPath}`);
            return true;
          }
        }
      } catch (dirError) {
        // Directory doesn't exist or can't be read, continue to next path
        continue;
      }
    }
    
    console.log(`elementclient.exe not found in ${folderPath} or ${path.join(folderPath, 'element')}`);
    return false;
  } catch (error) {
    console.error('Error validating game folder:', error);
    return false;
  }
}

export function setupIpcHandlers() {
  accountStorage = new AccountStorage();
  settingsManager = new SettingsManager();
  gameProcessManager = new GameProcessManager(settingsManager);
  webViewManager = new WebViewManager();

  // Setup logging handlers
  setupLoggingHandlers();
  
  logger.info('Application started', { version: '1.2.0' }, 'MAIN');

  ipcMain.handle('get-accounts', async () => {
    const accounts = await accountStorage.getAccounts();
    
    // DIAGNOSTIC: Log when accounts are requested
    console.log(`\n📋 GET-ACCOUNTS: Returning ${accounts.length} accounts`);
    accounts.forEach(account => {
      if (account.characterName && account.characterName.includes('?')) {
        console.error(`📋 ⚠️ ${account.login} has corrupted character: "${account.characterName}"`);
      }
    });
    
    return accounts;
  });

  ipcMain.handle('save-account', async (_, account: Account) => {
    return await accountStorage.saveAccount(account);
  });

  ipcMain.handle('delete-account', async (_, id: string) => {
    await accountStorage.deleteAccount(id);
    return { success: true };
  });

  ipcMain.handle('delete-batch-file', async (_, filePath: string) => {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete batch file:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-settings', async () => {
    return await settingsManager.getSettings();
  });

  ipcMain.handle('save-settings', async (_, settings: Settings) => {
    const result = await settingsManager.saveSettings(settings);
    
    // Update process monitoring performance if settings changed
    if (gameProcessManager && settings.processMonitoringMode) {
      gameProcessManager.updatePerformanceSettings();
    }
    
    return result;
  });

  ipcMain.handle('select-game-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Perfect World Game Folder',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const gamePath = result.filePaths[0];
      
      try {
        const isValid = await validateGameFolder(gamePath);
        if (isValid) {
          return { success: true, path: gamePath };
        } else {
          return { success: false, error: 'elementclient.exe not found in selected folder or its element subfolder' };
        }
      } catch (error: any) {
        console.error('Game folder validation error:', error);
        return { success: false, error: `Error validating folder: ${error.message}` };
      }
    }
    
    return { success: false, error: 'No folder selected' };
  });

  ipcMain.handle('launch-game', async (_, accountIds: string[]) => {
    console.log('\n========== LAUNCH-GAME HANDLER DIAGNOSTIC ==========');
    console.log('📨 Received accountIds:', accountIds);
    
    const settings = await settingsManager.getSettings();
    if (!settings.gamePath) {
      return { success: false, error: 'Game path not configured' };
    }

    // Fetch accounts fresh from storage
    const accounts = await accountStorage.getAccounts();
    console.log(`📨 Fetched ${accounts.length} accounts from storage`);
    
    const accountsToLaunch = accounts.filter(acc => accountIds.includes(acc.id));
    
    // DIAGNOSTIC: Check character names from storage
    console.log(`📨 Accounts to launch: ${accountsToLaunch.length}`);
    accountsToLaunch.forEach((account, index) => {
      console.log(`\n📨 Account ${index + 1}/${accountsToLaunch.length}:`);
      console.log(`  Login: ${account.login}`);
      console.log(`  ID: ${account.id}`);
      
      if (account.characterName) {
        console.log(`  Character name: "${account.characterName}"`);
        console.log(`  Character name type: ${typeof account.characterName}`);
        console.log(`  Character name length: ${account.characterName.length}`);
        console.log(`  Contains '?': ${account.characterName.includes('?')}`);
        console.log(`  UTF-8 bytes:`, Buffer.from(account.characterName, 'utf8'));
        console.log(`  Char codes:`, [...account.characterName].map(c => 
          `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`
        ).join(' '));
        
        if (account.characterName.includes('?')) {
          console.error(`  ⚠️ CHARACTER ALREADY CORRUPTED IN STORAGE!`);
        } else {
          console.log(`  ✅ Character name is intact`);
        }
      } else {
        console.log(`  Character name: not specified`);
      }
    });
    console.log('==================================================\n');
    
    // Validate delay is within acceptable range
    const delay = Math.max(10, Math.min(60, settings.launchDelay || 15));
    
    if (accountsToLaunch.length === 1) {
      // Individual launch - no delay
      console.log('Individual launch - no delay applied');
      await gameProcessManager.launchGame(accountsToLaunch[0], settings.gamePath);
    } else if (accountsToLaunch.length > 1) {
      // Group launch - apply delay between launches
      console.log(`Group launch of ${accountsToLaunch.length} clients with ${delay}s delay`);
      
      for (let i = 0; i < accountsToLaunch.length; i++) {
        if (i > 0) {
          console.log(`Waiting ${delay} seconds before launching ${accountsToLaunch[i].login}...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
        
        const account = accountsToLaunch[i];
        console.log(`🚀 Launching ${account.login} (${i + 1}/${accountsToLaunch.length})`);
        await gameProcessManager.launchGame(account, settings.gamePath);
        console.log(`✅ Launch completed for ${account.login} - PID associated`);
        
        // Additional delay before next launch to ensure processes are stable
        if (i < accountsToLaunch.length - 1) {
          console.log(`⏱️ Waiting additional 2 seconds for process stabilization...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    return { success: true };
  });

  ipcMain.handle('close-game', async (_, accountIds: string[]) => {
    console.log(`📨 IPC close-game received accountIds: [${accountIds.join(', ')}]`);
    
    try {
      if (accountIds.length === 1) {
        console.log(`📨 Single close for: ${accountIds[0]}`);
        await gameProcessManager.closeGame(accountIds[0]);
      } else {
        console.log(`📨 Multiple close for: [${accountIds.join(', ')}]`);
        await gameProcessManager.closeMultipleGames(accountIds);
      }
      console.log(`📨 IPC close-game completed successfully`);
      return { success: true };
    } catch (error: any) {
      console.error(`📨 IPC close-game failed:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('scan-batch-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Folder to Scan for Batch Files',
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const scanner = new BatchFileScanner();
      const accounts = await scanner.scanFolder(result.filePaths[0]);
      return { success: true, accounts };
    }
    
    return { success: false, accounts: [] };
  });

  ipcMain.handle('export-accounts', async (_, format: 'json' | 'csv') => {
    const result = await dialog.showSaveDialog({
      title: 'Export Accounts',
      defaultPath: `accounts.${format}`,
      filters: format === 'json' 
        ? [{ name: 'JSON Files', extensions: ['json'] }]
        : [{ name: 'CSV Files', extensions: ['csv'] }],
    });

    if (!result.canceled && result.filePath) {
      const accounts = await accountStorage.getAccounts();
      await accountStorage.exportAccounts(accounts, result.filePath, format);
      return { success: true };
    }
    
    return { success: false };
  });

  ipcMain.handle('export-selected-accounts', async (_, accounts: Account[], format: 'json' | 'csv') => {
    const result = await dialog.showSaveDialog({
      title: 'Export Selected Accounts',
      defaultPath: `accounts.${format}`,
      filters: format === 'json' 
        ? [{ name: 'JSON Files', extensions: ['json'] }]
        : [{ name: 'CSV Files', extensions: ['csv'] }],
    });

    if (!result.canceled && result.filePath) {
      await accountStorage.exportAccounts(accounts, result.filePath, format);
      return { success: true };
    }
    
    return { success: false };
  });

  ipcMain.handle('import-accounts', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Accounts',
      filters: [
        { name: 'Supported Files', extensions: ['json', 'csv'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'CSV Files', extensions: ['csv'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const format = path.extname(filePath).toLowerCase().substring(1) as 'json' | 'csv';
      const importData = await accountStorage.parseImportFile(filePath, format);
      return { success: true, importData };
    }
    
    return { success: false, importData: null };
  });

  ipcMain.handle('import-selected-accounts', async (_, selectedAccounts: Partial<Account>[]) => {
    const result = await accountStorage.importSelectedAccounts(selectedAccounts);
    
    return { 
      success: true, 
      count: result.savedAccounts.length, 
      errors: result.errors 
    };
  });

  ipcMain.handle('open-webview', async (_, accountId: string) => {
    const accounts = await accountStorage.getAccounts();
    const account = accounts.find(a => a.id === accountId);
    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    try {
      await webViewManager.openWebViewForAccount(account);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('close-webview', async (_, accountId: string) => {
    webViewManager.closeWebView(accountId);
    return { success: true };
  });

  ipcMain.handle('close-all-webviews', async () => {
    webViewManager.closeAllWebViews();
    return { success: true };
  });

  ipcMain.handle('get-running-processes', async () => {
    return gameProcessManager.getRunningProcesses();
  });

  gameProcessManager.on('status-update', (accountId: string, running: boolean) => {
    const processInfo = running ? gameProcessManager.getRunningProcesses().find(p => p.accountId === accountId) : null;
    console.log(`📤 Sending status update: ${accountId}, running: ${running}, PID: ${processInfo?.pid || 'none'}`);
    mainWindow?.webContents.send('process-status-update', { accountId, running, processInfo });
  });

  // Add cleanup listener to properly destroy services and prevent memory leaks
  ipcMain.on('cleanup-services', () => {
    console.log('Cleaning up services...');
    try {
      gameProcessManager.destroy();
      accountStorage.destroy();
      webViewManager.destroy();
    } catch (error) {
      console.error('Error during service cleanup:', error);
    }
  });
}