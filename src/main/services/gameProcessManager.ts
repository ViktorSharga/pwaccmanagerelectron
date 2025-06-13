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
  private userInitiatedClosures: Set<string> = new Set(); // Track accounts closed by user action
  private accountLaunchData: Map<string, {account: Account, gamePath: string}> = new Map(); // Store launch data for restarts

  constructor(settingsManager?: any) {
    super();
    this.settingsManager = settingsManager;
    this.adjustPerformanceSettings();
    // NO MORE CONSTANT MONITORING! Only check when needed
    console.log('GameProcessManager initialized - monitoring disabled for performance');
    
    // Scan for existing processes on startup
    this.scanExistingProcesses();
  }

  private adjustPerformanceSettings(): void {
    if (!this.settingsManager) return;
    
    try {
      const settings = this.settingsManager.getSettings();
      const mode = settings.processMonitoringMode || '3min';
      
      switch (mode) {
        case 'disabled':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 0; // No monitoring
          break;
        case '1min':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 60000; // 1 minute
          break;
        case '3min':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 180000; // 3 minutes
          break;
        case '5min':
          this.LIGHTWEIGHT_CHECK_INTERVAL = 300000; // 5 minutes
          break;
        default:
          this.LIGHTWEIGHT_CHECK_INTERVAL = 180000; // Default to 3 minutes
          break;
      }
      
      console.log(`Process monitoring mode: ${mode}, check interval: ${this.LIGHTWEIGHT_CHECK_INTERVAL}ms`);
    } catch (error) {
      console.warn('Could not load performance settings, using defaults');
      this.LIGHTWEIGHT_CHECK_INTERVAL = 180000; // Default to 3 minutes
    }
  }

  private shouldAutoRestart(): boolean {
    if (!this.settingsManager) return false;
    
    try {
      const settings = this.settingsManager.getSettings();
      
      // Auto-restart only works when monitoring is enabled (not disabled)
      const monitoringEnabled = settings.processMonitoringMode !== 'disabled';
      const autoRestartEnabled = settings.autoRestartCrashedClients === true;
      
      const shouldRestart = monitoringEnabled && autoRestartEnabled;
      console.log(`Auto-restart check: monitoring=${monitoringEnabled}, autoRestart=${autoRestartEnabled}, result=${shouldRestart}`);
      
      return shouldRestart;
    } catch (error) {
      console.warn('Could not check auto-restart settings:', error);
      return false;
    }
  }

  private startOptionalCrashDetection(): void {
    // Only start crash detection if monitoring is enabled and we have running processes
    if (this.LIGHTWEIGHT_CHECK_INTERVAL === 0) {
      console.log('Process monitoring is disabled - not starting crash detection');
      return;
    }
    
    if (this.processes.size > 0 && !this.processCheckInterval) {
      console.log(`Starting crash detection with ${this.LIGHTWEIGHT_CHECK_INTERVAL}ms interval...`);
      this.processCheckInterval = setInterval(() => {
        this.checkForCrashedProcesses();
      }, this.LIGHTWEIGHT_CHECK_INTERVAL);
    }
  }

  private stopCrashDetection(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
      console.log('Stopped crash detection');
    }
  }

  private async scanExistingProcesses(): Promise<void> {
    try {
      // Scan for existing ElementClient.exe processes that might be running
      const existingPids = await this.getElementClientProcessesUltraLight();
      if (existingPids.length > 0) {
        console.log(`🔍 GameProcessManager startup: Found ${existingPids.length} existing ElementClient.exe processes: [${existingPids.join(', ')}]`);
        console.log('📌 These processes will be considered "pre-existing" and excluded from new launch detection');
      } else {
        console.log('🔍 GameProcessManager startup: No existing ElementClient.exe processes found');
      }
    } catch (error) {
      console.error('Error scanning existing processes during startup:', error);
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
      // Only run if we have processes to check and monitoring is enabled
      if (this.processes.size === 0) {
        this.stopCrashDetection();
        return;
      }
      
      // Skip if monitoring is disabled
      if (this.LIGHTWEIGHT_CHECK_INTERVAL === 0) {
        console.log('Monitoring disabled - skipping crash detection');
        return;
      }
      
      console.log(`Checking ${this.processes.size} tracked processes for crashes...`);
      
      for (const [accountId, processInfo] of this.processes.entries()) {
        let stillRunning = false;
        
        if (processInfo.pid === -1 || processInfo.pid === -2) {
          // For processes without PID or in launching state
          if (processInfo.pid === -2) {
            // Still launching - try to associate with real PID
            try {
              const currentPids = await this.getElementClientProcessesUltraLight();
              const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid).filter(p => p > 0));
              const availablePids = currentPids.filter(pid => !assignedPids.has(pid));
              
              if (availablePids.length > 0) {
                // Update with real PID
                processInfo.pid = availablePids[0];
                console.log(`🔄 Late association: ${processInfo.login} now has PID ${availablePids[0]}`);
                stillRunning = true;
              } else {
                // Still launching, assume still running
                stillRunning = true;
              }
            } catch (error) {
              console.warn(`Could not check ElementClient processes:`, error);
              stillRunning = true; // Assume still running if we can't check
            }
          } else {
            // PID is -1 (unknown) - in disabled mode, always assume running
            stillRunning = true;
          }
        } else {
          // For processes with PID, check specifically if still exists
          stillRunning = await this.checkIfProcessExists(processInfo.pid);
        }
        
        if (!stillRunning) {
          console.log(`Process ${processInfo.pid === -1 ? '(unknown PID)' : processInfo.pid} for account ${processInfo.login} crashed or was closed`);
          
          // Check if this was a user-initiated closure or a crash
          const wasUserInitiated = this.userInitiatedClosures.has(accountId);
          const launchData = this.accountLaunchData.get(accountId);
          
          if (!wasUserInitiated && launchData && this.shouldAutoRestart()) {
            console.log(`💥 Crash detected for ${processInfo.login} - attempting auto-restart...`);
            
            // Remove from current tracking
            this.processes.delete(accountId);
            this.emit('status-update', accountId, false);
            
            // Attempt restart after a short delay
            setTimeout(async () => {
              try {
                console.log(`🔄 Auto-restarting ${launchData.account.login}...`);
                await this.launchGame(launchData.account, launchData.gamePath);
                console.log(`✅ Auto-restart successful for ${launchData.account.login}`);
              } catch (error) {
                console.error(`❌ Auto-restart failed for ${launchData.account.login}:`, error);
                // If restart fails, clean up launch data
                this.accountLaunchData.delete(accountId);
              }
            }, 3000); // 3-second delay before restart
          } else {
            // Either user-initiated or auto-restart disabled/not available
            if (wasUserInitiated) {
              console.log(`👤 User-initiated closure for ${processInfo.login} - no auto-restart`);
            } else {
              console.log(`🔇 Auto-restart disabled or no launch data for ${processInfo.login}`);
            }
            
            this.processes.delete(accountId);
            this.emit('status-update', accountId, false);
            
            // Clean up launch data and user closure flag
            this.accountLaunchData.delete(accountId);
            this.userInitiatedClosures.delete(accountId);
          }
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
    return new Promise(async (resolve, reject) => {
      try {
        const gameExePath = await this.findElementClientPath(gamePath);
        
        // Get ALL ElementClient.exe PIDs before launch (including pre-existing ones not tracked by us)
        const allCurrentPids = await this.getElementClientProcessesUltraLight();
        console.log(`📊 Pre-launch: Found ${allCurrentPids.length} existing ElementClient.exe processes: [${allCurrentPids.join(', ')}]`);
        
        // Create set of all existing PIDs to exclude from new process detection
        const pidsBeforeLaunch = new Set(allCurrentPids);
        
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
        
        // Store launch data for potential auto-restart
        this.accountLaunchData.set(account.id, { account, gamePath });
        
        // Clear any previous user-initiated closure flag
        this.userInitiatedClosures.delete(account.id);
        
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
        
        // Wait and find the new ElementClient.exe process - resolve when PID is found
        this.findNewElementClientProcess(account, pidsBeforeLaunch, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async findNewElementClientProcess(
    account: Account, 
    pidsBeforeLaunch: Set<number>, 
    resolve: () => void, 
    reject: (error: any) => void
  ): Promise<void> {
    const maxAttempts = 6; // Increased attempts for better detection
    let attempts = 0;
    
    const findProcess = async (): Promise<void> => {
      attempts++;
      
      try {
        // Use ultra-light method to find new processes
        const currentPids = await this.getElementClientProcessesUltraLight();
        const newPids = currentPids.filter(pid => !pidsBeforeLaunch.has(pid));
        
        console.log(`🔍 Attempt ${attempts}/${maxAttempts} for ${account.login}:`);
        console.log(`  📊 Current PIDs: [${currentPids.join(', ')}]`);
        console.log(`  🆕 New PIDs: [${newPids.join(', ')}]`);
        
        // Filter out PIDs that are already assigned to other accounts
        const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid).filter(p => p > 0));
        const availablePids = newPids.filter(pid => !assignedPids.has(pid));
        
        console.log(`  🏷️ Already assigned PIDs: [${Array.from(assignedPids).join(', ')}]`);
        console.log(`  ✅ Available PIDs: [${availablePids.join(', ')}]`);
        
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
          
          // Resolve the Promise - PID found successfully
          resolve();
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
          
          // Resolve even with fallback - launch is complete
          resolve();
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
          
          // Resolve even with fallback - launch is complete
          resolve();
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

    // Mark this as a user-initiated closure to prevent auto-restart
    this.userInitiatedClosures.add(accountId);
    console.log(`🚫 Marked ${processInfo.login} as user-initiated closure`);

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
      
      // Clean up launch data for user-initiated closures (but keep user closure flag for potential restart prevention)
      this.accountLaunchData.delete(accountId);
      
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
      
      // Clean up launch data
      this.accountLaunchData.delete(accountId);
      
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
    // Update the intervals based on new settings
    this.adjustPerformanceSettings();
    
    // Restart crash detection with new intervals if we have running processes
    if (this.processes.size > 0) {
      this.stopCrashDetection();
      this.startOptionalCrashDetection();
    }
    
    const mode = this.settingsManager?.getSettings()?.processMonitoringMode || '3min';
    console.log(`Process monitoring updated to: ${mode} (${this.LIGHTWEIGHT_CHECK_INTERVAL}ms interval)`);
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
    
    // Clear auto-restart data
    this.accountLaunchData.clear();
    this.userInitiatedClosures.clear();
    
    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();
  }
}