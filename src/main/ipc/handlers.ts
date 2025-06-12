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
  gameProcessManager = new GameProcessManager();
  webViewManager = new WebViewManager();

  ipcMain.handle('get-accounts', async () => {
    return await accountStorage.getAccounts();
  });

  ipcMain.handle('save-account', async (_, account: Account) => {
    return await accountStorage.saveAccount(account);
  });

  ipcMain.handle('delete-account', async (_, id: string) => {
    return await accountStorage.deleteAccount(id);
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
    return await settingsManager.saveSettings(settings);
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
    const settings = await settingsManager.getSettings();
    if (!settings.gamePath) {
      return { success: false, error: 'Game path not configured' };
    }

    const accounts = await accountStorage.getAccounts();
    const accountsToLaunch = accounts.filter(acc => accountIds.includes(acc.id));
    
    for (let i = 0; i < accountsToLaunch.length; i++) {
      if (i > 0 && settings.launchDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, settings.launchDelay * 1000));
      }
      
      const account = accountsToLaunch[i];
      await gameProcessManager.launchGame(account, settings.gamePath);
    }
    
    return { success: true };
  });

  ipcMain.handle('close-game', async (_, accountIds: string[]) => {
    for (const accountId of accountIds) {
      await gameProcessManager.closeGame(accountId);
    }
    return { success: true };
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
    // Get current settings to access game path
    const settings = await settingsManager.getSettings();
    const createBatchFiles = true; // Always create batch files for imported accounts
    
    const result = await accountStorage.importSelectedAccounts(
      selectedAccounts, 
      createBatchFiles,
      settings.gamePath
    );
    
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

  gameProcessManager.on('status-update', (accountId: string, running: boolean) => {
    mainWindow?.webContents.send('process-status-update', { accountId, running });
  });
}