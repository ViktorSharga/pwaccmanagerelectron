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
  private processCache: Map<number, {windowTitle: string, commandLine: string, lastChecked: number}> = new Map();
  private readonly CACHE_DURATION = 30000; // Cache process info for 30 seconds
  private LIGHTWEIGHT_CHECK_INTERVAL = 5000; // Quick checks interval (configurable)
  private FULL_SCAN_INTERVAL = 30000; // Full WMI scan interval (configurable)
  private lastFullScan = 0;
  private settingsManager: any; // Will be injected

  constructor(settingsManager?: any) {
    super();
    this.settingsManager = settingsManager;
    this.adjustPerformanceSettings();
    this.startProcessMonitoring();
  }

  private adjustPerformanceSettings(): void {
    if (!this.settingsManager) return;
    
    try {
      const settings = this.settingsManager.getSettings();
      const mode = settings.processMonitoringMode || 'normal';
      
      switch (mode) {
        case 'high':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 3000; // More frequent for responsiveness
          this.FULL_SCAN_INTERVAL = 15000;
          break;
        case 'low':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 15000; // Less frequent for performance
          this.FULL_SCAN_INTERVAL = 60000;
          break;
        default: // normal
          this.LIGHTWEIGHT_CHECK_INTERVAL = 5000;
          this.FULL_SCAN_INTERVAL = 30000;
          break;
      }
      
      console.log(`Process monitoring mode: ${mode}, intervals: ${this.LIGHTWEIGHT_CHECK_INTERVAL}ms/${this.FULL_SCAN_INTERVAL}ms`);
    } catch (error) {
      console.warn('Could not load performance settings, using defaults');
    }
  }

  private startProcessMonitoring(): void {
    // Initial scan for existing processes
    this.scanExistingProcesses();
    
    // Start lightweight periodic monitoring
    this.processCheckInterval = setInterval(() => {
      this.checkProcessesEfficiently();
    }, this.LIGHTWEIGHT_CHECK_INTERVAL);
  }

  private async scanExistingProcesses(): Promise<void> {
    try {
      // Just log that we're starting up - no need to scan existing processes
      // We only care about processes we launch ourselves
      console.log('GameProcessManager started - will track new launches only');
    } catch (error) {
      console.error('Error during startup:', error);
    }
  }

  private async getElementClientProcessesUltraLight(): Promise<number[]> {
    if (process.platform !== 'win32') {
      return [];
    }
    
    try {
      // Use the fastest possible method - just check if processes exist
      const { stdout } = await execAsync(`tasklist /fi "imagename eq ElementClient.exe" /fo csv /nh`, { timeout: 2000 });
      const lines = stdout.split('\n').filter(line => line.trim() && line.includes('ElementClient.exe'));
      
      const pids: number[] = [];
      for (const line of lines) {
        // Extract PID more efficiently
        const match = line.match(/"(\d+)"/);
        if (match) {
          pids.push(parseInt(match[1]));
        }
      }
      
      return pids;
    } catch (error) {
      console.error('Error getting ElementClient PIDs:', error);
      return [];
    }
  }

  // COMPLETELY ELIMINATE WMI - Only track processes we launch ourselves
  private async checkIfProcessExists(pid: number): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }
    
    try {
      // Fastest way to check if a specific PID exists - no WMI needed
      const { stdout } = await execAsync(`tasklist /fi "pid eq ${pid}" /fo csv /nh`, { timeout: 1000 });
      return stdout.includes(`"${pid}"`);
    } catch (error) {
      return false;
    }
  }

  private async checkProcessesEfficiently(): Promise<void> {
    try {
      // ULTRA-EFFICIENT: Only check specific PIDs we're tracking
      // No need to scan all ElementClient processes - we only care about ones we launched
      
      for (const [accountId, processInfo] of this.processes.entries()) {
        const stillRunning = await this.checkIfProcessExists(processInfo.pid);
        if (!stillRunning) {
          console.log(`Process ${processInfo.pid} for account ${processInfo.login} is no longer running`);
          this.processes.delete(accountId);
          this.emit('status-update', accountId, false);
        }
      }
      
      // No need for window title updates - they're just for display and not critical
      // This eliminates ALL WMI/PowerShell usage during normal operation
    } catch (error) {
      console.error('Error in efficient process check:', error);
    }
  }

  private async checkProcesses(): Promise<void> {
    // Legacy method - now just calls the efficient version
    await this.checkProcessesEfficiently();
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
    
    // Get PIDs before launch to compare (ultra-lightweight)
    const pidsBeforeLaunch = new Set(await this.getElementClientProcessesUltraLight());
    
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
    const maxAttempts = 4; // Further reduced attempts
    let attempts = 0;
    
    const findProcess = async (): Promise<void> => {
      attempts++;
      
      try {
        // Use ultra-light method to find new processes
        const currentPids = await this.getElementClientProcessesUltraLight();
        const newPids = currentPids.filter(pid => !pidsBeforeLaunch.has(pid));
        
        if (newPids.length > 0) {
          // Just take the first new process - no need for complex matching
          // We launched it, so it's almost certainly ours
          const targetPid = newPids[0];
          
          // Associate the process with the account (no window title needed)
          this.processes.set(account.id, {
            accountId: account.id,
            pid: targetPid,
            login: account.login,
            windowTitle: '', // Skip window title - not critical
          });
          
          console.log(`Associated ElementClient.exe process ${targetPid} with account ${account.login}`);
          this.emit('status-update', account.id, true);
          return;
        }
        
        // If no new process found and we haven't reached max attempts, try again
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 3000);
        } else {
          console.warn(`Could not find ElementClient.exe process for account ${account.login} after ${maxAttempts} attempts`);
          // Still keep status as running - the process might exist but we couldn't detect it
        }
      } catch (error) {
        console.error('Error finding new ElementClient process:', error);
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 3000);
        }
      }
    };
    
    // Start looking for the process after a short delay
    setTimeout(findProcess, 2000);
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

  updatePerformanceSettings(): void {
    // Stop current monitoring
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
    
    // Adjust settings and restart monitoring
    this.adjustPerformanceSettings();
    this.processCheckInterval = setInterval(() => {
      this.checkProcessesEfficiently();
    }, this.LIGHTWEIGHT_CHECK_INTERVAL);
    
    console.log('Process monitoring intervals updated');
  }

  destroy(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
    
    // Clear all tracked processes
    this.processes.clear();
    
    // Clear process cache to free memory
    this.processCache.clear();
    
    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();
  }
}