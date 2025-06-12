export class PlatformService {
  private static _isMockMode = false;

  static initialize(): void {
    this._isMockMode = process.env.FORCE_MOCK_MODE === 'true' || !this.isWindows();
  }

  static isWindows(): boolean {
    return process.platform === 'win32';
  }

  static isMac(): boolean {
    return process.platform === 'darwin';
  }

  static isLinux(): boolean {
    return process.platform === 'linux';
  }

  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  static isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  static isMockMode(): boolean {
    return this._isMockMode;
  }

  static getMockGamePath(): string {
    return process.env.MOCK_GAME_DIR || 'tests/mock-data/game-folder';
  }

  static getPathSeparator(): string {
    return this.isWindows() ? '\\' : '/';
  }

  static normalizePathForPlatform(windowsPath: string): string {
    if (this.isWindows()) {
      return windowsPath;
    }
    // Convert Windows paths to POSIX for testing
    return windowsPath.replace(/\\/g, '/').replace(/^[A-Z]:/, '');
  }

  static getExecutableExtension(): string {
    return this.isWindows() ? '.exe' : '';
  }

  static getMockExecutableName(): string {
    return this.isWindows() ? 'elementclient.exe' : 'mockgame';
  }
}