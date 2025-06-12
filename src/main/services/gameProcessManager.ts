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
    // NO MORE CONSTANT MONITORING! Only check when needed
    console.log('GameProcessManager initialized - monitoring disabled for performance');
  }

  private adjustPerformanceSettings(): void {
    if (!this.settingsManager) return;
    
    try {
      const settings = this.settingsManager.getSettings();
      const mode = settings.processMonitoringMode || 'normal';
      
      switch (mode) {
        case 'high':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 60000; // Much less frequent
          break;
        case 'low':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 300000; // 5 minutes - very rare
          break;
        default: // normal
          this.LIGHTWEIGHT_CHECK_INTERVAL = 120000; // 2 minutes
          break;
      }
      
      console.log(`Process monitoring mode: ${mode}, check interval: ${this.LIGHTWEIGHT_CHECK_INTERVAL}ms (only for crash detection)`);
    } catch (error) {
      console.warn('Could not load performance settings, using defaults');
    }
  }

  private startOptionalCrashDetection(): void {
    // Only start crash detection if we have running processes
    if (this.processes.size > 0 && !this.processCheckInterval) {
      console.log('Starting optional crash detection...');
      this.processCheckInterval = setInterval(() => {
        this.checkForCrashedProcesses();
      }, this.LIGHTWEIGHT_CHECK_INTERVAL);
    }
  }

  private stopCrashDetection(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
      console.log('Stopped crash detection - no processes to monitor');
    }
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

  private async checkForCrashedProcesses(): Promise<void> {
    try {
      // Only run if we have processes to check
      if (this.processes.size === 0) {
        this.stopCrashDetection();
        return;
      }
      
      console.log(`Checking ${this.processes.size} tracked processes for crashes...`);
      
      for (const [accountId, processInfo] of this.processes.entries()) {
        const stillRunning = await this.checkIfProcessExists(processInfo.pid);
        if (!stillRunning) {
          console.log(`Process ${processInfo.pid} for account ${processInfo.login} crashed or was closed`);
          this.processes.delete(accountId);
          this.emit('status-update', accountId, false);
        }
      }
      
      // Stop monitoring if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
    } catch (error) {
      console.error('Error checking for crashed processes:', error);
    }
  }

  private async checkProcesses(): Promise<void> {
    // Legacy method - now just calls crash detection
    await this.checkForCrashedProcesses();
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
    
    // Validate batch file format
    if (!this.validateBatchFileFormat(batContent)) {
      console.warn('Generated batch file may have formatting issues');
    }
    
    console.log(`Generated batch file for ${account.login} with character: ${account.characterName || 'none'}`);
    
    const tempDir = path.join(os.tmpdir(), 'pw-account-manager');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Sanitize login for filename
    const sanitizedLogin = account.login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    const batPath = path.join(tempDir, `${sanitizedLogin}_${Date.now()}.bat`);
    
    // Write batch file with CP1251 encoding for Cyrillic support
    try {
      const iconv = await import('iconv-lite');
      const encodedContent = iconv.encode(batContent, 'cp1251');
      await fs.writeFile(batPath, encodedContent);
    } catch (error) {
      console.warn('iconv-lite not available, using UTF-8 encoding:', error);
      await fs.writeFile(batPath, batContent, { encoding: 'utf8' });
    }

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
          
          // Start crash detection now that we have a process to monitor
          this.startOptionalCrashDetection();
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

    // Proper batch file format with CP1251 for Cyrillic support
    let content = `@echo off\r\n`;
    content += `chcp 1251 >nul 2>&1\r\n`;  // Set code page for Cyrillic characters, suppress output
    content += `REM Perfect World Account Manager - Generated Batch File\r\n`;
    content += `REM Account: ${account.login}\r\n`;
    content += `REM Character: ${account.characterName || 'Not specified'}\r\n`;
    content += `REM Server: ${account.server || 'Default'}\r\n`;
    content += `REM Game executable: ${gameExePath}\r\n`;
    content += `REM Generated: ${new Date().toISOString()}\r\n`;
    content += `\r\n`;
    
    content += `cd /d "${gameDir}"\r\n`;
    content += `if exist "${exeName}" (\r\n`;
    content += `    start "" "${exeName}" ${params.join(' ')}\r\n`;
    content += `) else (\r\n`;
    content += `    echo ERROR: ${exeName} not found in ${gameDir}\r\n`;
    content += `    pause\r\n`;
    content += `)\r\n`;
    content += `exit\r\n`;

    return content;
  }

  // Test method to validate batch file format (can be removed in production)
  private validateBatchFileFormat(content: string): boolean {
    const requiredElements = [
      '@echo off',
      'chcp 1251',
      'cd /d',
      'start ""',
      'startbypatcher',
      'game:cpw',
      'user:',
      'pwd:',
      'role:',
      'exit'
    ];
    
    return requiredElements.every(element => content.includes(element));
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
      
      // Stop crash detection if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
      
      console.log(`Successfully closed process ${processInfo.pid} for account ${processInfo.login}`);
    } catch (error) {
      console.error(`Failed to close game process ${processInfo.pid}:`, error);
      
      // Even if killing failed, remove from tracking and update status
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
      
      // Stop crash detection if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
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
      
      // Validate batch file format
      if (!this.validateBatchFileFormat(batchContent)) {
        console.warn('Generated permanent batch file may have formatting issues');
      }
      
      // Create filename based on account login (sanitize for filesystem)
      // Remove or replace characters that are invalid in Windows filenames
      const sanitizedLogin = account.login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
      const batchFileName = `pw_${sanitizedLogin}.bat`;
      const batchFilePath = path.join(gameDir, batchFileName);
      
      // Write batch file with CP1251 encoding for Cyrillic support
      try {
        const iconv = await import('iconv-lite');
        const encodedContent = iconv.encode(batchContent, 'cp1251');
        await fs.writeFile(batchFilePath, encodedContent);
      } catch (error) {
        console.warn('iconv-lite not available, using UTF-8 encoding:', error);
        await fs.writeFile(batchFilePath, batchContent, 'utf-8');
      }
      
      console.log(`Created permanent batch file: ${batchFilePath}`);
      return batchFilePath;
    } catch (error) {
      console.error('Failed to create permanent batch file:', error);
      throw error;
    }
  }

  updatePerformanceSettings(): void {
    // Just update the intervals - monitoring is only active when we have processes
    this.adjustPerformanceSettings();
    
    // Restart crash detection with new intervals if we have running processes
    if (this.processes.size > 0) {
      this.stopCrashDetection();
      this.startOptionalCrashDetection();
    }
    
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