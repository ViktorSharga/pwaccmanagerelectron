export interface Account {
  id: string;
  login: string;
  password: string;
  server: 'Main' | 'X';
  characterName?: string;
  description?: string;
  owner?: string;
  isRunning?: boolean;

  // Persistent field to track original batch file path
  originalBatchFilePath?: string;

  // Runtime only (not persisted):
  sourceBatchFile?: string;
}

export interface Settings {
  gamePath: string;
  launchDelay: number;
  processMonitoringMode?: 'disabled' | '1min' | '3min' | '5min'; // Process monitoring intervals
  autoRestartCrashedClients?: boolean; // Auto-restart clients when they crash (only when monitoring enabled)
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ProcessInfo {
  accountId: string;
  pid: number;
  login: string;
  windowTitle?: string;
}

export interface ImportResult {
  success: boolean;
  count?: number;
  error?: string;
}

export interface LaunchResult {
  success: boolean;
  error?: string;
}

export interface GameFolderResult {
  success: boolean;
  path?: string;
  error?: string;
}
