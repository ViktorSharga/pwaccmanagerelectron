export interface Account {
  id: string;
  login: string;
  password: string;
  server: string;
  character?: string;
  class?: string;
  level?: number;
  proxy?: string;
  forceID?: number;
  isRunning?: boolean;
}

export interface Settings {
  gamePath: string;
  launchDelay: number;
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