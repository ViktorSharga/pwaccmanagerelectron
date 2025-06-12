import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const validChannels = [
  'get-accounts',
  'save-account',
  'delete-account',
  'launch-game',
  'close-game',
  'get-settings',
  'save-settings',
  'select-game-folder',
  'scan-batch-files',
  'export-accounts',
  'import-accounts',
  'process-status-update',
  'open-webview',
  'close-webview',
  'close-all-webviews',
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
  
  removeListener: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => {
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, listener);
    }
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;