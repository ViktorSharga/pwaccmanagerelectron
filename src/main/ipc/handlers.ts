import { ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Account, Settings } from '@shared/types';
import { AccountStorage } from '../services/accountStorage';
import { SettingsManager } from '../services/settingsManager';
import { GameProcessManager } from '../services/gameProcessManager';
import { BatchFileScanner } from '../services/batchFileScanner';
import { mainWindow } from '../main';

let accountStorage: AccountStorage;
let settingsManager: SettingsManager;
let gameProcessManager: GameProcessManager;

export function setupIpcHandlers() {
  accountStorage = new AccountStorage();
  settingsManager = new SettingsManager();
  gameProcessManager = new GameProcessManager();

  ipcMain.handle('get-accounts', async () => {
    return await accountStorage.getAccounts();
  });

  ipcMain.handle('save-account', async (_, account: Account) => {
    return await accountStorage.saveAccount(account);
  });

  ipcMain.handle('delete-account', async (_, id: string) => {
    return await accountStorage.deleteAccount(id);
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
      const elementClientPath = path.join(gamePath, 'element', 'elementclient.exe');
      
      try {
        await fs.access(elementClientPath);
        return { success: true, path: gamePath };
      } catch {
        return { success: false, error: 'elementclient.exe not found in selected folder' };
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
      const accounts = await accountStorage.importAccounts(filePath, format);
      return { success: true, count: accounts.length };
    }
    
    return { success: false, count: 0 };
  });

  gameProcessManager.on('status-update', (accountId: string, running: boolean) => {
    mainWindow?.webContents.send('process-status-update', { accountId, running });
  });
}