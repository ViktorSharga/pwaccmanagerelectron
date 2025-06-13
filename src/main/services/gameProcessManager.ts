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
        let stillRunning = false;
        
        if (processInfo.pid === -1 || processInfo.pid === -2) {
          // For processes without PID or in launching state, check if any ElementClient.exe is running
          // This is less precise but better than nothing
          try {
            const currentPids = await this.getElementClientProcessesUltraLight();
            stillRunning = currentPids.length > 0;
            
            // If in launching state (-2) and we find processes, try to associate one
            if (processInfo.pid === -2 && currentPids.length > 0) {
              const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid).filter(p => p > 0));
              const availablePids = currentPids.filter(pid => !assignedPids.has(pid));
              
              if (availablePids.length > 0) {
                // Update with real PID
                processInfo.pid = availablePids[0];
                console.log(`🔄 Late association: ${processInfo.login} now has PID ${availablePids[0]}`);
              }
            }
          } catch (error) {
            console.warn(`Could not check ElementClient processes:`, error);
            stillRunning = true; // Assume still running if we can't check
          }
        } else {
          // For processes with PID, check specifically
          stillRunning = await this.checkIfProcessExists(processInfo.pid);
        }
        
        if (!stillRunning) {
          console.log(`Process ${processInfo.pid === -1 ? '(unknown PID)' : processInfo.pid} for account ${processInfo.login} crashed or was closed`);
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
    // Include already tracked processes to avoid conflicts
    const currentPids = await this.getElementClientProcessesUltraLight();
    const trackedPids = Array.from(this.processes.values()).map(p => p.pid).filter(pid => pid !== -1);
    const pidsBeforeLaunch = new Set([...currentPids, ...trackedPids]);
    
    const batContent = this.generateBatchFile(account, gameExePath);
    
    // Validate batch file format
    if (!this.validateBatchFileFormat(batContent)) {
      console.warn('Generated batch file may have formatting issues');
    }
    
    const tempDir = path.join(os.tmpdir(), 'pw-account-manager');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Sanitize login for filename
    const sanitizedLogin = account.login.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    const batPath = path.join(tempDir, `${sanitizedLogin}_${Date.now()}.bat`);
    
    // Write batch file with UTF-8 encoding (always use UTF-8 with BOM)
    console.log(`🔤 Writing batch file for ${account.login}...`);
    
    // ALWAYS use UTF-8 with BOM for batch files
    const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const contentBuffer = Buffer.from(batContent, 'utf8');
    const finalBuffer = Buffer.concat([utf8Bom, contentBuffer]);
    
    await fs.writeFile(batPath, finalBuffer);
    console.log(`✅ Batch file written with UTF-8 encoding: ${batPath}`);

    const gameDir = path.dirname(gameExePath);
    const child: ChildProcess = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      cwd: gameDir,
    });

    child.unref();
    
    // Create a placeholder entry immediately to prevent status conflicts
    this.processes.set(account.id, {
      accountId: account.id,
      pid: -2, // Special marker for "launching" state
      login: account.login,
      windowTitle: '',
    });
    
    // Set initial status to running (will be updated when we find the actual process)
    this.emit('status-update', account.id, true);
    
    // Clean up batch file
    setTimeout(() => fs.unlink(batPath).catch(() => {}), 5000);
    
    // Wait and find the new ElementClient.exe process
    this.findNewElementClientProcess(account, pidsBeforeLaunch);
  }

  private async findNewElementClientProcess(account: Account, pidsBeforeLaunch: Set<number>): Promise<void> {
    const maxAttempts = 6; // Increased attempts for better detection
    let attempts = 0;
    
    const findProcess = async (): Promise<void> => {
      attempts++;
      
      try {
        // Use ultra-light method to find new processes
        const currentPids = await this.getElementClientProcessesUltraLight();
        const newPids = currentPids.filter(pid => !pidsBeforeLaunch.has(pid));
        
        // Filter out PIDs that are already assigned to other accounts
        const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid));
        const availablePids = newPids.filter(pid => !assignedPids.has(pid));
        
        if (availablePids.length > 0) {
          // Take the first available PID
          const targetPid = availablePids[0];
          
          // Update the existing entry with the real PID
          this.processes.set(account.id, {
            accountId: account.id,
            pid: targetPid,
            login: account.login,
            windowTitle: '',
          });
          
          console.log(`✅ Associated ElementClient.exe process ${targetPid} with account ${account.login}`);
          this.emit('status-update', account.id, true);
          
          // Start crash detection now that we have a process to monitor
          this.startOptionalCrashDetection();
          return;
        }
        
        // If no new process found and we haven't reached max attempts, try again
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 2500); // Slightly longer delay
        } else {
          console.warn(`Could not find ElementClient.exe process for account ${account.login} after ${maxAttempts} attempts`);
          
          // If we still can't find a PID, create a dummy entry so we can at least try to kill processes by name
          this.processes.set(account.id, {
            accountId: account.id,
            pid: -1, // Special marker for "unknown PID"
            login: account.login,
            windowTitle: '',
          });
          
          console.log(`Created fallback process entry for ${account.login} (PID unknown)`);
          this.emit('status-update', account.id, true);
          this.startOptionalCrashDetection();
        }
      } catch (error) {
        console.error('Error finding new ElementClient process:', error);
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 2500);
        } else {
          // Create fallback entry even on error
          this.processes.set(account.id, {
            accountId: account.id,
            pid: -1,
            login: account.login,
            windowTitle: '',
          });
          this.emit('status-update', account.id, true);
          this.startOptionalCrashDetection();
        }
      }
    };
    
    // Start looking for the process after a delay
    setTimeout(findProcess, 1500);
  }

  private generateBatchFile(account: Account, gameExePath: string): string {
    const characterName = account.characterName || '';
    console.log(`🔤 Generating batch file for ${account.login}`);
    if (characterName) {
      console.log(`🔤 Character name: "${characterName}"`);
    }

    const params = [
      'startbypatcher',
      `game:cpw`,
      `user:${account.login}`,
      `pwd:${account.password}`,
      `role:${characterName}`,
    ];

    if (account.server) {
      params.push(`server:${account.server}`);
    }

    const gameDir = path.dirname(gameExePath);
    const exeName = path.basename(gameExePath);

    // ALWAYS use UTF-8 code page (65001) for modern Windows
    let content = `@echo off\r\n`;
    content += `chcp 65001 >nul 2>&1\r\n`;  // UTF-8 code page
    content += `REM Account: ${account.login}\r\n`;
    content += `REM Character: ${characterName || 'Not specified'}\r\n`;
    content += `REM Server: ${account.server || 'Default'}\r\n`;
    content += `\r\n`;
    
    content += `cd /d "${gameDir}"\r\n`;
    content += `start "" "${exeName}" ${params.join(' ')}\r\n`;
    content += `exit\r\n`;

    return content;
  }

  // Test method to validate batch file format (can be removed in production)
  private validateBatchFileFormat(content: string): boolean {
    const requiredElements = [
      '@echo off',
      'chcp 65001',  // Changed from 'chcp 1251' to 'chcp 65001'
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
      if (processInfo.pid === -1 || processInfo.pid === -2) {
        // Handle processes without known PID or in launching state
        console.log(`Attempting to close ElementClient.exe processes for account ${processInfo.login} (PID ${processInfo.pid === -2 ? 'launching' : 'unknown'})`);
        
        if (process.platform === 'win32') {
          // First try to find processes by tasklist and kill them
          try {
            const { stdout } = await execAsync(`tasklist /fi "imagename eq ElementClient.exe" /fo csv /nh`);
            const lines = stdout.split('\n').filter(line => line.includes('ElementClient.exe'));
            
            if (lines.length > 0) {
              // Kill all ElementClient processes (this is aggressive but necessary when PID is unknown)
              await execAsync(`taskkill /IM ElementClient.exe /F`);
              console.log(`Killed ElementClient.exe processes by image name`);
            } else {
              console.log(`No ElementClient.exe processes found to kill`);
            }
          } catch (killError) {
            console.warn(`Failed to kill ElementClient.exe by image name:`, killError);
          }
        }
      } else {
        // Handle processes with known PID
        console.log(`Attempting to close ElementClient.exe process ${processInfo.pid} for account ${processInfo.login}`);
        
        if (process.platform === 'win32') {
          const { stdout, stderr } = await execAsync(`taskkill /PID ${processInfo.pid} /F`);
          console.log(`Taskkill output: ${stdout}`);
          if (stderr) console.error(`Taskkill error: ${stderr}`);
        } else {
          process.kill(processInfo.pid, 'SIGTERM');
        }
      }
      
      // Remove from our tracking immediately
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
      
      // Stop crash detection if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
      
      console.log(`Successfully closed process for account ${processInfo.login}`);
    } catch (error) {
      console.error(`Failed to close game process for ${processInfo.login}:`, error);
      
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
      
      // Write batch file with UTF-8 encoding (always use UTF-8 with BOM)
      console.log(`🔤 Writing permanent batch file for ${account.login}...`);
      
      // ALWAYS use UTF-8 with BOM for batch files
      const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const contentBuffer = Buffer.from(batchContent, 'utf8');
      const finalBuffer = Buffer.concat([utf8Bom, contentBuffer]);
      
      await fs.writeFile(batchFilePath, finalBuffer);
      console.log(`✅ Permanent batch file written with UTF-8 encoding: ${batchFilePath}`);
      
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