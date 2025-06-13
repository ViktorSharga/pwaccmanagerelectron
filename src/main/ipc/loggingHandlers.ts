import { ipcMain, clipboard } from 'electron';
import { logger, LogLevel, LogFilter } from '../services/loggingService';
import { mainWindow } from '../main';

export function setupLoggingHandlers() {
  // Get logs with optional filtering
  ipcMain.handle('get-logs', async (_, filter?: LogFilter) => {
    const logs = logger.getLogs(filter);
    console.log(`📋 get-logs IPC: Returning ${logs.length} logs`);
    return logs;
  });

  // Get recent errors
  ipcMain.handle('get-recent-errors', async (_, count?: number) => {
    return logger.getRecentErrors(count);
  });

  // Clear logs
  ipcMain.handle('clear-logs', async () => {
    await logger.clearLogs();
    return { success: true };
  });

  // Export logs
  ipcMain.handle('export-logs', async (_, outputPath: string, filter?: LogFilter) => {
    try {
      await logger.exportLogs(outputPath, filter);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Copy log entry to clipboard
  ipcMain.handle('copy-log-entry', async (_, logId: string) => {
    const logs = logger.getLogs();
    const entry = logs.find(log => log.id === logId);
    
    if (entry) {
      const formatted = logger.formatForClipboard(entry);
      clipboard.writeText(formatted);
      return { success: true };
    }
    
    return { success: false, error: 'Log entry not found' };
  });

  // Set log level
  ipcMain.handle('set-log-level', async (_, level: LogLevel) => {
    logger.setLogLevel(level);
    return { success: true };
  });

  // Get current operation
  ipcMain.handle('get-current-operation', async () => {
    return logger.getCurrentOperation();
  });

  // Forward log events to renderer
  logger.on('log-added', (entry) => {
    mainWindow?.webContents.send('log-added', entry);
  });

  logger.on('error-logged', (entry) => {
    mainWindow?.webContents.send('error-logged', entry);
  });

  logger.on('operation-changed', (operation) => {
    console.log(`📤 Sending operation-changed to renderer: "${operation}"`);
    mainWindow?.webContents.send('operation-changed', operation);
  });

  logger.on('logs-cleared', () => {
    mainWindow?.webContents.send('logs-cleared');
  });
}