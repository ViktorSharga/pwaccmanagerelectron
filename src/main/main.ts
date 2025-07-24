import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { setupIpcHandlers } from './ipc/handlers';
import { createApplicationMenu } from './menu';
import { SettingsManager } from './services/settingsManager';

let mainWindow: BrowserWindow | null = null;
let settingsManager: SettingsManager;

app.commandLine.appendSwitch('lang', 'en-US');
app.commandLine.appendSwitch('--enable-features', 'DefaultEncodingIsUTF8');
if (process.platform === 'win32') {
  process.env.NODE_ENCODING = 'utf8';
}

function createWindow() {
  settingsManager = new SettingsManager();
  const savedBounds = settingsManager.getWindowBounds();

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 1200,
    height: savedBounds?.height || 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      settingsManager.saveWindowBounds(bounds);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createApplicationMenu();
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Clean up resources before quitting to prevent memory leaks
  try {
    // Trigger cleanup for all services via IPC
    await new Promise<void>((resolve) => {
      ipcMain.emit('cleanup-services');
      setTimeout(resolve, 1000); // Give cleanup time to complete
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});

export { mainWindow };
