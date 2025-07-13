import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const validChannels = [
  'get-accounts',
  'save-account',
  'delete-account',
  'delete-batch-file',
  'launch-game',
  'close-game',
  'get-settings',
  'save-settings',
  'select-game-folder',
  'scan-batch-files',
  'export-accounts',
  'export-selected-accounts',
  'import-accounts',
  'import-selected-accounts',
  'process-status-update',
  'get-running-processes',
  'open-webview',
  'close-webview',
  'close-all-webviews',
  // Logging channels
  'get-logs',
  'get-recent-errors',
  'clear-logs',
  'export-logs',
  'copy-log-entry',
  'set-log-level',
  'get-current-operation',
  'log-added',
  'error-logged',
  'operation-changed',
  'logs-cleared',
  // Isolated Start Mode channels
  'check-admin-privileges',
  'get-current-system-identifiers',
  'restore-original-system-identifiers',
  'test-isolated-start',
];

const api = {
  invoke: (channel: string, ...args: any[]) => {
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    throw new Error(`Invalid channel: ${channel}`);
  },

  on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, listener);
    }
  },

  removeListener: (
    channel: string,
    listener: (event: IpcRendererEvent, ...args: any[]) => void
  ) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, listener);
    }
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
