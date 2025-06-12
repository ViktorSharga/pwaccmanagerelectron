import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Account, ProcessInfo } from '../../shared/types';

export class GameProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private processCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startProcessMonitoring();
  }

  private startProcessMonitoring(): void {
    this.processCheckInterval = setInterval(() => {
      this.checkProcesses();
    }, 5000);
  }

  private async checkProcesses(): Promise<void> {
    for (const [accountId, processInfo] of this.processes.entries()) {
      try {
        process.kill(processInfo.pid, 0);
      } catch {
        this.processes.delete(accountId);
        this.emit('status-update', accountId, false);
      }
    }
  }

  private async findElementClientPath(folderPath: string): Promise<string | null> {
    try {
      // Check both root folder and element subfolder
      const possiblePaths = [
        folderPath,
        path.join(folderPath, 'element')
      ];
      
      for (const checkPath of possiblePaths) {
        try {
          const files = await fs.readdir(checkPath);
          const executableName = files.find(file => 
            file.toLowerCase() === 'elementclient.exe'
          );
          
          if (executableName) {
            const fullPath = path.join(checkPath, executableName);
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
              return fullPath;
            }
          }
        } catch (dirError) {
          // Directory doesn't exist or can't be read, continue to next path
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding elementclient.exe:', error);
      return null;
    }
  }

  async launchGame(account: Account, gamePath: string): Promise<void> {
    const gameExePath = await this.findElementClientPath(gamePath);
    if (!gameExePath) {
      throw new Error('elementclient.exe not found');
    }
    
    const batContent = this.generateBatchFile(account, gameExePath);
    const tempDir = path.join(os.tmpdir(), 'pw-account-manager');
    await fs.mkdir(tempDir, { recursive: true });
    
    const batPath = path.join(tempDir, `${account.login}_${Date.now()}.bat`);
    await fs.writeFile(batPath, batContent, { encoding: 'utf8' });

    const gameDir = path.dirname(gameExePath);
    const child: ChildProcess = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      cwd: gameDir,
    });

    child.unref();

    if (child.pid) {
      this.processes.set(account.id, {
        accountId: account.id,
        pid: child.pid,
        login: account.login,
      });
      
      this.emit('status-update', account.id, true);
    }

    setTimeout(() => fs.unlink(batPath).catch(() => {}), 5000);
  }

  private generateBatchFile(account: Account, gameExePath: string): string {
    const params = [
      'startbypatcher',
      `game:cpw`,
      `user:${account.login}`,
      `pwd:${account.password}`,
      `role:`,
    ];

    if (account.server) {
      params.push(`server:${account.server}`);
    }

    const gameDir = path.dirname(gameExePath);
    const exeName = path.basename(gameExePath);

    let content = `@echo off\n`;
    content += `REM Account: ${account.login}\n`;
    content += `REM Server: ${account.server || 'Default'}\n`;
    content += `REM Game executable: ${gameExePath}\n`;
    content += `REM Generated: ${new Date().toISOString()}\n\n`;
    
    content += `cd /d "${gameDir}"\n`;
    content += `start "${exeName}" ${params.join(' ')}\n`;
    content += `exit\n`;

    return content;
  }

  async closeGame(accountId: string): Promise<void> {
    const processInfo = this.processes.get(accountId);
    if (!processInfo) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', processInfo.pid.toString(), '/F']);
      } else {
        process.kill(processInfo.pid);
      }
      
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
    } catch (error) {
      console.error('Failed to close game process:', error);
    }
  }

  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  isAccountRunning(accountId: string): boolean {
    return this.processes.has(accountId);
  }

  destroy(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
    }
  }
}