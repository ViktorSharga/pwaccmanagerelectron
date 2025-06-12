import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Account, ProcessInfo } from '../../shared/types';

const execAsync = promisify(exec);

export class GameProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private processCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startProcessMonitoring();
  }

  private startProcessMonitoring(): void {
    // Initial scan for existing processes
    this.scanExistingProcesses();
    
    // Start periodic monitoring with longer interval to reduce system load
    this.processCheckInterval = setInterval(() => {
      this.checkProcesses();
    }, 10000); // Increased from 3s to 10s to reduce system strain
  }

  private async scanExistingProcesses(): Promise<void> {
    try {
      const runningProcesses = await this.getElementClientProcesses();
      console.log(`Found ${runningProcesses.length} existing ElementClient processes`);
      
      // Don't associate existing processes with accounts initially
      // They'll be associated when we launch new ones
    } catch (error) {
      console.error('Error scanning existing processes:', error);
    }
  }

  private async getElementClientProcesses(): Promise<Array<{pid: number, windowTitle: string, commandLine: string}>> {
    if (process.platform !== 'win32') {
      return [];
    }
    
    try {
      // Use wmic to get ElementClient.exe processes with window titles
      const { stdout } = await execAsync(`wmic process where "name='ElementClient.exe'" get ProcessId,CommandLine /format:csv`);
      const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
      
      const processes: Array<{pid: number, windowTitle: string, commandLine: string}> = [];
      
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          const pid = parseInt(parts[2]);
          const commandLine = parts[1] || '';
          
          if (!isNaN(pid)) {
            // Get window title for this process
            try {
              const { stdout: titleOutput } = await execAsync(`powershell "Get-Process -Id ${pid} | Select-Object MainWindowTitle | ConvertTo-Csv -NoTypeInformation"`);
              const titleLines = titleOutput.split('\n');
              let windowTitle = '';
              if (titleLines.length > 1) {
                windowTitle = titleLines[1].replace(/"/g, '').trim();
              }
              
              processes.push({ pid, windowTitle, commandLine });
            } catch {
              processes.push({ pid, windowTitle: '', commandLine });
            }
          }
        }
      }
      
      return processes;
    } catch (error) {
      console.error('Error getting ElementClient processes:', error);
      return [];
    }
  }

  private async checkProcesses(): Promise<void> {
    // Get all current ElementClient processes
    const runningProcesses = await this.getElementClientProcesses();
    const runningPids = new Set(runningProcesses.map(p => p.pid));
    
    // Check if our tracked processes are still running
    for (const [accountId, processInfo] of this.processes.entries()) {
      if (!runningPids.has(processInfo.pid)) {
        // Process is no longer running
        console.log(`Process ${processInfo.pid} for account ${processInfo.login} is no longer running`);
        this.processes.delete(accountId);
        this.emit('status-update', accountId, false);
      }
    }
    
    // Update window titles for existing tracked processes
    for (const [accountId, processInfo] of this.processes.entries()) {
      const runningProcess = runningProcesses.find(p => p.pid === processInfo.pid);
      if (runningProcess && runningProcess.windowTitle !== processInfo.windowTitle) {
        processInfo.windowTitle = runningProcess.windowTitle;
      }
    }
  }

  private async findElementClientPath(folderPath: string): Promise<string> {
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
              return fullPath;
            }
          }
        } catch (dirError) {
          // Directory doesn't exist or can't be read, continue to next path
          continue;
        }
      }
      
      throw new Error('elementclient.exe not found');
    } catch (error) {
      console.error('Error finding elementclient.exe:', error);
      throw new Error('elementclient.exe not found');
    }
  }

  async launchGame(account: Account, gamePath: string): Promise<void> {
    const gameExePath = await this.findElementClientPath(gamePath);
    
    // Get processes before launch to compare
    const processesBeforeLaunch = await this.getElementClientProcesses();
    const pidsBeforeLaunch = new Set(processesBeforeLaunch.map(p => p.pid));
    
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
    
    // Set initial status to running (will be updated when we find the actual process)
    this.emit('status-update', account.id, true);
    
    // Clean up batch file
    setTimeout(() => fs.unlink(batPath).catch(() => {}), 5000);
    
    // Wait and find the new ElementClient.exe process
    this.findNewElementClientProcess(account, pidsBeforeLaunch);
  }

  private async findNewElementClientProcess(account: Account, pidsBeforeLaunch: Set<number>): Promise<void> {
    const maxAttempts = 6; // Reduced from 10 to 6 attempts
    let attempts = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const findProcess = async (): Promise<void> => {
      attempts++;
      
      try {
        const currentProcesses = await this.getElementClientProcesses();
        const newProcesses = currentProcesses.filter(p => !pidsBeforeLaunch.has(p.pid));
        
        if (newProcesses.length > 0) {
          // Found new process(es), try to match by command line or take the most recent
          let targetProcess = newProcesses[0];
          
          // If multiple new processes, try to find one with matching login in command line
          if (newProcesses.length > 1) {
            const matchingProcess = newProcesses.find(p => 
              p.commandLine.toLowerCase().includes(`user:${account.login.toLowerCase()}`)
            );
            if (matchingProcess) {
              targetProcess = matchingProcess;
            }
          }
          
          // Associate the process with the account
          this.processes.set(account.id, {
            accountId: account.id,
            pid: targetProcess.pid,
            login: account.login,
            windowTitle: targetProcess.windowTitle,
          });
          
          console.log(`Associated ElementClient.exe process ${targetProcess.pid} with account ${account.login}`);
          this.emit('status-update', account.id, true);
          return;
        }
        
        // If no new process found and we haven't reached max attempts, try again
        if (attempts < maxAttempts) {
          timeoutId = setTimeout(findProcess, 5000); // Increased delay from 3s to 5s
        } else {
          console.warn(`Could not find ElementClient.exe process for account ${account.login} after ${maxAttempts} attempts`);
          // Still keep status as running in case the process started but we couldn't detect it
        }
      } catch (error) {
        console.error('Error finding new ElementClient process:', error);
        if (attempts < maxAttempts) {
          timeoutId = setTimeout(findProcess, 5000);
        }
      }
    };
    
    // Start looking for the process after a short delay
    timeoutId = setTimeout(findProcess, 3000);
  }

  private generateBatchFile(account: Account, gameExePath: string): string {
    const params = [
      'startbypatcher',
      `game:cpw`,
      `user:${account.login}`,
      `pwd:${account.password}`,
      `role:${account.characterName || ''}`,
    ];

    if (account.server) {
      params.push(`server:${account.server}`);
    }

    const gameDir = path.dirname(gameExePath);
    const exeName = path.basename(gameExePath);

    let content = `@echo off\n`;
    content += `REM Account: ${account.login}\n`;
    content += `REM Character: ${account.characterName || 'Not specified'}\n`;
    content += `REM Server: ${account.server || 'Default'}\n`;
    content += `REM Game executable: ${gameExePath}\n`;
    content += `REM Generated: ${new Date().toISOString()}\n\n`;
    
    content += `cd /d "${gameDir}"\n`;
    content += `start "" "${exeName}" ${params.join(' ')}\n`;
    content += `exit\n`;

    return content;
  }

  async closeGame(accountId: string): Promise<void> {
    const processInfo = this.processes.get(accountId);
    if (!processInfo) {
      console.log(`No process found for account ${accountId}`);
      return;
    }

    try {
      console.log(`Attempting to close ElementClient.exe process ${processInfo.pid} for account ${processInfo.login}`);
      
      if (process.platform === 'win32') {
        // Use taskkill to force close the process
        const { stdout, stderr } = await execAsync(`taskkill /PID ${processInfo.pid} /F`);
        console.log(`Taskkill output: ${stdout}`);
        if (stderr) console.error(`Taskkill error: ${stderr}`);
      } else {
        process.kill(processInfo.pid, 'SIGTERM');
      }
      
      // Remove from our tracking immediately
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
      
      console.log(`Successfully closed process ${processInfo.pid} for account ${processInfo.login}`);
    } catch (error) {
      console.error(`Failed to close game process ${processInfo.pid}:`, error);
      
      // Even if killing failed, remove from tracking and update status
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
    }
  }

  async closeMultipleGames(accountIds: string[]): Promise<void> {
    const closePromises = accountIds.map(accountId => this.closeGame(accountId));
    await Promise.allSettled(closePromises);
  }

  async closeAllGames(): Promise<void> {
    const accountIds = Array.from(this.processes.keys());
    await this.closeMultipleGames(accountIds);
  }

  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  isAccountRunning(accountId: string): boolean {
    return this.processes.has(accountId);
  }

  async createPermanentBatchFile(account: Account, gamePath: string | null | undefined): Promise<string> {
    if (!gamePath) {
      throw new Error('Game path is required to create batch file');
    }
    
    try {
      const gameExePath = await this.findElementClientPath(gamePath);
      const gameDir = path.dirname(gameExePath);
      
      // Generate batch file content
      const batchContent = this.generateBatchFile(account, gameExePath);
      
      // Create filename based on account login (sanitize for filesystem)
      const sanitizedLogin = account.login.replace(/[^a-zA-Z0-9]/g, '_');
      const batchFileName = `pw_${sanitizedLogin}.bat`;
      const batchFilePath = path.join(gameDir, batchFileName);
      
      // Write batch file
      await fs.writeFile(batchFilePath, batchContent, 'utf-8');
      
      console.log(`Created permanent batch file: ${batchFilePath}`);
      return batchFilePath;
    } catch (error) {
      console.error('Failed to create permanent batch file:', error);
      throw error;
    }
  }

  destroy(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
    
    // Clear all tracked processes
    this.processes.clear();
    
    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();
  }
}