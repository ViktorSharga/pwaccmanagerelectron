import { EventEmitter } from 'events';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Account, ProcessInfo } from '../../shared/types';
import { logger } from './loggingService';

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
    logger.info('GameProcessManager initialized - monitoring disabled for performance', null, 'PROCESS_MANAGER');
    
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
      const existingProcesses = await this.getElementClientProcesses();
      if (existingProcesses.length > 0) {
        console.log(`🔍 GameProcessManager startup: Found ${existingProcesses.length} existing ElementClient.exe processes`);
        existingProcesses.forEach(proc => {
          console.log(`  📌 PID ${proc.pid} started at ${proc.startTime.toLocaleString()}`);
        });
        console.log('📌 These processes will be considered "pre-existing" and excluded from new launch detection');
      } else {
        console.log('🔍 GameProcessManager startup: No existing ElementClient.exe processes found');
      }
    } catch (error) {
      console.error('Error scanning existing processes during startup:', error);
    }
  }

  private async getElementClientProcesses(): Promise<Array<{pid: number, startTime: Date}>> {
    if (process.platform !== 'win32') {
      return [];
    }
    
    console.log('🔍 Starting comprehensive Perfect World process detection...');
    
    // Try multiple detection methods and combine results
    const allProcesses = new Map<number, {pid: number, startTime: Date, method: string}>();
    
    // Method 1: Window-based detection (most reliable for Perfect World)
    try {
      const windowProcesses = await this.getProcessesByWindowTitle();
      windowProcesses.forEach(proc => {
        allProcesses.set(proc.pid, { ...proc, method: 'window' });
      });
      console.log(`🪟 Found ${windowProcesses.length} processes by window title`);
    } catch (error) {
      console.warn('Window-based detection failed:', error);
    }
    
    // Method 2: Process name detection (multiple possible names)
    try {
      const nameProcesses = await this.getProcessesByExecutableName();
      nameProcesses.forEach(proc => {
        if (!allProcesses.has(proc.pid)) {
          allProcesses.set(proc.pid, { ...proc, method: 'process_name' });
        }
      });
      console.log(`📋 Found ${nameProcesses.length} processes by executable name`);
    } catch (error) {
      console.warn('Process name detection failed:', error);
    }
    
    // Method 3: Fallback tasklist approach
    if (allProcesses.size === 0) {
      try {
        const fallbackProcesses = await this.getElementClientProcessesFallback();
        fallbackProcesses.forEach(proc => {
          allProcesses.set(proc.pid, { ...proc, method: 'tasklist_fallback' });
        });
        console.log(`🔄 Found ${fallbackProcesses.length} processes via fallback method`);
      } catch (error) {
        console.warn('Fallback detection failed:', error);
      }
    }
    
    const finalProcesses = Array.from(allProcesses.values()).map(({method, ...proc}) => proc);
    console.log(`🎯 Total unique Perfect World processes found: ${finalProcesses.length}`);
    
    return finalProcesses;
  }

  private async getProcessesByWindowTitle(): Promise<Array<{pid: number, startTime: Date}>> {
    try {
      // Use WMI to find windows by title, then get associated process info
      const wmiWindowQuery = `wmic process get ProcessId,Name,CreationDate /format:csv | findstr "ElementClient.exe"`;
      
      // First, let's get all ElementClient.exe processes with their creation dates
      const { stdout: processOutput } = await execAsync(wmiWindowQuery, { 
        timeout: 5000,
        killSignal: 'SIGTERM'
      });
      
      const processes: Array<{pid: number, startTime: Date}> = [];
      
      if (processOutput.trim()) {
        const lines = processOutput.split('\n').filter(line => line.trim() && line.includes('ElementClient.exe'));
        
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 4) {
            const creationDate = parts[1]?.trim();
            const processName = parts[2]?.trim();
            const pidStr = parts[3]?.trim();
            
            if (pidStr && !isNaN(parseInt(pidStr)) && processName === 'ElementClient.exe') {
              const pid = parseInt(pidStr);
              let startTime = new Date();
              
              // Parse WMI date format: 20231025143022.000000+000
              if (creationDate && creationDate.length >= 14) {
                const year = parseInt(creationDate.substring(0, 4));
                const month = parseInt(creationDate.substring(4, 6)) - 1;
                const day = parseInt(creationDate.substring(6, 8));
                const hour = parseInt(creationDate.substring(8, 10));
                const minute = parseInt(creationDate.substring(10, 12));
                const second = parseInt(creationDate.substring(12, 14));
                
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                  startTime = new Date(year, month, day, hour, minute, second);
                }
              }
              
              // Verify this process has the expected window title
              try {
                const windowQuery = `wmic process where "ProcessId=${pid}" get ProcessId /format:csv`;
                const { stdout: windowCheck } = await execAsync(windowQuery, { timeout: 2000 });
                
                if (windowCheck.includes(pid.toString())) {
                  processes.push({ pid, startTime });
                  console.log(`🪟 Found ElementClient.exe process PID ${pid} (started: ${startTime.toLocaleString()})`);
                  
                  // Try to get window title for verification
                  try {
                    const titleQuery = `powershell -Command "Get-Process -Id ${pid} | Select-Object -ExpandProperty MainWindowTitle"`;
                    const { stdout: titleResult } = await execAsync(titleQuery, { timeout: 2000 });
                    const windowTitle = titleResult.trim();
                    if (windowTitle) {
                      console.log(`   └─ Window title: "${windowTitle}"`);
                    }
                  } catch (titleError) {
                    // Don't fail if we can't get window title
                  }
                }
              } catch (verifyError) {
                // If verification fails, still include the process
                processes.push({ pid, startTime });
                console.log(`🪟 Found ElementClient.exe process PID ${pid} (verification failed, but including)`);
              }
            }
          }
        }
      }
      
      return processes;
    } catch (error) {
      console.warn('WMI window detection failed:', error);
      return [];
    }
  }

  private async getProcessesByExecutableName(): Promise<Array<{pid: number, startTime: Date}>> {
    try {
      // Focus specifically on ElementClient.exe since you confirmed that's the correct process name
      console.log('📋 Using WMI to detect ElementClient.exe processes...');
      
      // Use a more robust WMI query format
      const wmiQuery = `wmic process where "name='ElementClient.exe'" get ProcessId,CreationDate,Name /format:csv`;
      const { stdout } = await execAsync(wmiQuery, { 
        timeout: 8000,  // Longer timeout for WMI
        killSignal: 'SIGTERM'
      });
      
      console.log('📋 WMI raw output:', stdout.substring(0, 200) + '...');
      
      const processes: Array<{pid: number, startTime: Date}> = [];
      
      if (!stdout.trim()) {
        console.log('📋 WMI returned empty output');
        return processes;
      }
      
      // Split by lines and filter for ElementClient.exe
      const lines = stdout.split('\n');
      console.log(`📋 WMI returned ${lines.length} lines`);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.includes('ElementClient.exe')) {
          continue;
        }
        
        console.log('📋 Processing line:', trimmedLine);
        
        // Parse CSV format: Node,CreationDate,Name,ProcessId
        const parts = trimmedLine.split(',');
        if (parts.length >= 4) {
          const nodeName = parts[0]?.trim();
          const creationDate = parts[1]?.trim();
          const processName = parts[2]?.trim();
          const pidStr = parts[3]?.trim();
          
          console.log(`📋 Parsed: node=${nodeName}, date=${creationDate}, name=${processName}, pid=${pidStr}`);
          
          if (pidStr && !isNaN(parseInt(pidStr)) && processName === 'ElementClient.exe') {
            const pid = parseInt(pidStr);
            let startTime = new Date();
            
            // Parse WMI date format: 20231025143022.000000+000
            if (creationDate && creationDate.length >= 14) {
              try {
                const year = parseInt(creationDate.substring(0, 4));
                const month = parseInt(creationDate.substring(4, 6)) - 1;
                const day = parseInt(creationDate.substring(6, 8));
                const hour = parseInt(creationDate.substring(8, 10));
                const minute = parseInt(creationDate.substring(10, 12));
                const second = parseInt(creationDate.substring(12, 14));
                
                if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                  startTime = new Date(year, month, day, hour, minute, second);
                  console.log(`📋 Parsed start time: ${startTime.toLocaleString()}`);
                }
              } catch (dateError) {
                console.warn('📋 Failed to parse creation date:', dateError);
              }
            }
            
            processes.push({ pid, startTime });
            console.log(`📋 ✅ Added ElementClient.exe PID ${pid} to results`);
          }
        }
      }
      
      console.log(`📋 Final WMI process count: ${processes.length}`);
      return processes;
    } catch (error) {
      console.error('📋 WMI process detection failed:', error);
      return [];
    }
  }

  private async getElementClientProcessesFallback(): Promise<Array<{pid: number, startTime: Date}>> {
    try {
      console.log('🔄 Using tasklist fallback for ElementClient.exe...');
      
      const { stdout } = await execAsync(`tasklist /fi "imagename eq ElementClient.exe" /fo csv /nh`, { timeout: 3000 });
      console.log('🔄 Tasklist raw output:', stdout.substring(0, 200) + '...');
      
      const processes: Array<{pid: number, startTime: Date}> = [];
      
      if (!stdout.trim()) {
        console.log('🔄 Tasklist returned empty output');
        return processes;
      }
      
      const lines = stdout.split('\n').filter(line => line.trim() && line.includes('ElementClient.exe'));
      console.log(`🔄 Found ${lines.length} matching lines`);
      
      for (const line of lines) {
        console.log('🔄 Processing line:', line.trim());
        
        // Parse CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
        const match = line.match(/"ElementClient\.exe","(\d+)"/);
        if (match) {
          const pid = parseInt(match[1]);
          processes.push({ 
            pid, 
            startTime: new Date() // Approximate start time for fallback
          });
          console.log(`🔄 ✅ Added ElementClient.exe PID ${pid} via fallback`);
        }
      }
      
      console.log(`🔄 Final fallback process count: ${processes.length}`);
      return processes;
    } catch (error) {
      console.error('🔄 Tasklist fallback failed:', error);
      return [];
    }
  }

  private async checkIfProcessExists(pid: number): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }
    
    try {
      // Check if the specific PID exists and verify it's ElementClient.exe
      const { stdout } = await execAsync(`tasklist /fi "pid eq ${pid}" /fo csv /nh`, { timeout: 1000 });
      
      if (!stdout.includes(`"${pid}"`)) {
        return false;
      }
      
      // Verify it's specifically ElementClient.exe
      const processLine = stdout.split('\n').find(line => line.includes(`"${pid}"`));
      if (processLine) {
        return processLine.toLowerCase().includes('elementclient.exe');
      }
      
      return false;
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
            // Still launching - only try to find PID if it's been a reasonable time
            const processAge = Date.now() - (processInfo as any).launchTime || 0;
            if (processAge > 10000) { // Only try after 10 seconds
              try {
                const currentProcesses = await this.getElementClientProcesses();
                const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid).filter(p => p > 0));
                
                // Look for very recent processes not yet assigned
                const recentProcesses = currentProcesses.filter(proc => {
                  const processAge = Date.now() - proc.startTime.getTime();
                  return processAge < 30000 && !assignedPids.has(proc.pid); // Less than 30 seconds old
                });
                
                if (recentProcesses.length > 0) {
                  const targetProcess = recentProcesses[0];
                  processInfo.pid = targetProcess.pid;
                  console.log(`🔄 Late association: ${processInfo.login} now has PID ${targetProcess.pid}`);
                  
                  // IMPORTANT: Send status update to UI when PID is finally detected
                  this.emit('status-update', accountId, true);
                  stillRunning = true;
                } else {
                  // Still launching or failed launch, assume still running for now
                  stillRunning = true;
                }
              } catch (error) {
                console.warn(`Could not check ElementClient processes:`, error);
                stillRunning = true; // Assume still running if we can't check
              }
            } else {
              stillRunning = true; // Too early to check
            }
          } else {
            // PID is -1 (unknown) - when monitoring is disabled, always assume running
            // When monitoring is enabled, we still assume running since we can't verify
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
    const operationId = logger.startOperation(`Launching ${account.login}`);
    
    return new Promise(async (resolve, reject) => {
      try {
        const gameExePath = await this.findElementClientPath(gamePath);
        
        // Get ALL existing ElementClient.exe processes before launch (only when needed)
        const existingProcesses = await this.getElementClientProcesses();
        logger.info(`Pre-launch: Found ${existingProcesses.length} existing ElementClient.exe processes`, {
          count: existingProcesses.length,
          pids: existingProcesses.map(p => p.pid)
        }, 'LAUNCH');
        
        // Record launch time for reliable new process detection
        const launchTime = new Date();
        
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
          launchTime: launchTime // Track when this was launched
        } as any);
        
        // Set initial status to running (will be updated when we find the actual process)
        this.emit('status-update', account.id, true);
        
        // Clean up batch file
        setTimeout(() => fs.unlink(batPath).catch(() => {}), 5000);
        
        // Wait and find the new ElementClient.exe process - resolve when PID is found
        this.findNewElementClientProcess(account, existingProcesses, launchTime, operationId, resolve, reject);
      } catch (error) {
        logger.error(`Failed to launch game for ${account.login}`, error, 'LAUNCH');
        logger.endOperation(operationId, false);
        reject(error);
      }
    });
  }

  private async findNewElementClientProcess(
    account: Account, 
    existingProcesses: Array<{pid: number, startTime: Date}>, 
    launchTime: Date,
    operationId: string,
    resolve: () => void, 
    _reject: (error: any) => void
  ): Promise<void> {
    const maxAttempts = 5;
    let attempts = 0;
    
    // Create set of existing PIDs to exclude
    const existingPids = new Set(existingProcesses.map(p => p.pid));
    
    const findProcess = async (): Promise<void> => {
      attempts++;
      
      try {
        console.log(`🔍 Attempt ${attempts}/${maxAttempts} for ${account.login} (launched at ${launchTime.toLocaleTimeString()})`);
        
        // Get current processes with start times - use WMI only when needed
        const currentProcesses = await this.getElementClientProcesses();
        
        // Find processes that started after our launch time and aren't in existing PIDs
        const candidateProcesses = currentProcesses.filter(proc => {
          const isNew = !existingPids.has(proc.pid);
          const startedAfterLaunch = proc.startTime >= launchTime;
          
          console.log(`  📊 PID ${proc.pid}: new=${isNew}, startedAfter=${startedAfterLaunch} (started: ${proc.startTime.toLocaleTimeString()})`);
          
          return isNew && startedAfterLaunch;
        });
        
        // Filter out PIDs already assigned to other accounts in our tracking
        const assignedPids = new Set(
          Array.from(this.processes.values())
            .map(p => p.pid)
            .filter(p => p > 0)
        );
        
        const availableProcesses = candidateProcesses.filter(proc => !assignedPids.has(proc.pid));
        
        console.log(`  🆕 Candidate processes: [${candidateProcesses.map(p => p.pid).join(', ')}]`);
        console.log(`  🏷️ Already assigned PIDs: [${Array.from(assignedPids).join(', ')}]`);
        console.log(`  ✅ Available processes: [${availableProcesses.map(p => p.pid).join(', ')}]`);
        
        if (availableProcesses.length > 0) {
          // Take the process that started closest to our launch time
          const targetProcess = availableProcesses.reduce((closest, current) => {
            const closestDiff = Math.abs(closest.startTime.getTime() - launchTime.getTime());
            const currentDiff = Math.abs(current.startTime.getTime() - launchTime.getTime());
            return currentDiff < closestDiff ? current : closest;
          });
          
          // Update the existing entry with the real PID
          this.processes.set(account.id, {
            accountId: account.id,
            pid: targetProcess.pid,
            login: account.login,
            windowTitle: '',
          });
          
          logger.info(`Successfully associated process ${targetProcess.pid} with account ${account.login}`, {
            pid: targetProcess.pid,
            accountId: account.id,
            startTime: targetProcess.startTime
          }, 'LAUNCH');
          
          // Send status update to refresh UI with actual PID
          this.emit('status-update', account.id, true);
          
          // Start crash detection now that we have a process to monitor
          this.startOptionalCrashDetection();
          
          // Resolve the Promise - PID found successfully
          logger.endOperation(operationId, true);
          resolve();
          return;
        }
        
        // If no new process found and we haven't reached max attempts, try again
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 3000); // 3 second delay between attempts
        } else {
          console.warn(`⚠️ Could not find ElementClient.exe process for account ${account.login} after ${maxAttempts} attempts`);
          console.warn(`⚠️ The process may have started but couldn't be reliably associated`);
          
          // Mark as unknown PID but still running
          this.processes.set(account.id, {
            accountId: account.id,
            pid: -1, // Special marker for "unknown PID"
            login: account.login,
            windowTitle: '',
          });
          
          console.log(`Created fallback process entry for ${account.login} (PID unknown - but likely running)`);
          this.emit('status-update', account.id, true);
          this.startOptionalCrashDetection();
          
          // Resolve - launch is considered complete even with unknown PID
          logger.endOperation(operationId, true);
          resolve();
        }
      } catch (error) {
        console.error('Error finding new ElementClient process:', error);
        if (attempts < maxAttempts) {
          setTimeout(findProcess, 3000);
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
          logger.endOperation(operationId, true);
          resolve();
        }
      }
    };
    
    // Start looking for the process after a delay to allow process startup
    setTimeout(findProcess, 2000);
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
      logger.warn(`No process found for account ${accountId}`, {
        accountId,
        trackedAccounts: Array.from(this.processes.keys())
      }, 'CLOSE');
      return;
    }

    const operationId = logger.startOperation(`Closing ${processInfo.login}`);
    logger.info(`Found process for ${processInfo.login}`, {
      accountId,
      pid: processInfo.pid,
      login: processInfo.login
    }, 'CLOSE');

    // Mark this as a user-initiated closure to prevent auto-restart
    this.userInitiatedClosures.add(accountId);
    logger.debug(`Marked ${processInfo.login} as user-initiated closure`, null, 'CLOSE');

    try {
      if (processInfo.pid === -1 || processInfo.pid === -2) {
        // Try to find the process by launch time and available PIDs
        console.warn(`⚠️ PID for ${processInfo.login} is ${processInfo.pid === -2 ? 'still launching' : 'unknown'} - attempting to locate process...`);
        
        try {
          const currentProcesses = await this.getElementClientProcesses();
          const assignedPids = new Set(Array.from(this.processes.values()).map(p => p.pid).filter(p => p > 0));
          
          // Look for unassigned processes that might belong to this account
          const unassignedProcesses = currentProcesses.filter(proc => !assignedPids.has(proc.pid));
          
          if (unassignedProcesses.length > 0) {
            // Take the most recent unassigned process (likely belongs to this account)
            const targetProcess = unassignedProcesses.reduce((latest, current) => 
              current.startTime > latest.startTime ? current : latest
            );
            
            console.log(`🎯 Found potential process PID ${targetProcess.pid} for ${processInfo.login}, attempting to close...`);
            logger.info(`Attempting to close unassigned process`, {
              accountId,
              foundPid: targetProcess.pid,
              processStartTime: targetProcess.startTime
            }, 'CLOSE');
            
            // Try to kill this process
            if (process.platform === 'win32') {
              const { stdout, stderr } = await execAsync(`taskkill /PID ${targetProcess.pid} /F`);
              console.log(`💀 Taskkill output for ${targetProcess.pid}: "${stdout.trim()}"`);
              if (stderr) {
                console.error(`💀 Taskkill error: "${stderr.trim()}"`);
              } else {
                console.log(`✅ Successfully closed process ${targetProcess.pid} for ${processInfo.login}`);
                logger.info(`Successfully closed unassigned process`, { pid: targetProcess.pid }, 'CLOSE');
              }
            }
          } else {
            console.warn(`❌ No unassigned ElementClient processes found for ${processInfo.login}`);
            logger.warn(`No unassigned processes found to close`, { accountId }, 'CLOSE');
          }
        } catch (searchError) {
          console.error(`❌ Error searching for process to close:`, searchError);
          logger.error(`Failed to search for process to close`, searchError, 'CLOSE');
        }
        
        // Always clean up tracking regardless of whether we found/killed the process
        this.processes.delete(accountId);
        this.emit('status-update', accountId, false);
        this.accountLaunchData.delete(accountId);
        
        if (this.processes.size === 0) {
          this.stopCrashDetection();
        }
        
        console.log(`✅ Marked ${processInfo.login} as stopped`);
        logger.endOperation(operationId, true);
        return;
      } else {
        // Handle processes with known PID - ONLY kill the specific PID
        console.log(`Attempting to close ElementClient.exe process ${processInfo.pid} for account ${processInfo.login}`);
        
        if (process.platform === 'win32') {
          // First verify the PID still exists and belongs to ElementClient.exe
          try {
            console.log(`🔍 Verifying PID ${processInfo.pid} for ${processInfo.login}...`);
            const { stdout: verifyOutput } = await execAsync(`tasklist /fi "pid eq ${processInfo.pid}" /fo csv /nh`);
            console.log(`🔍 Tasklist verification output: "${verifyOutput.trim()}"`);
            
            // Check if it's specifically ElementClient.exe
            if (!verifyOutput.toLowerCase().includes('elementclient.exe') || !verifyOutput.includes(`"${processInfo.pid}"`)) {
              console.log(`❌ Process ${processInfo.pid} is not ElementClient.exe or already closed`);
              logger.info(`Process verification failed - not ElementClient.exe or already closed`, {
                accountId,
                pid: processInfo.pid,
                verifyOutput: verifyOutput.trim()
              }, 'CLOSE');
              this.processes.delete(accountId);
              this.emit('status-update', accountId, false);
              this.accountLaunchData.delete(accountId);
              logger.endOperation(operationId, true);
              return;
            }
            
            console.log(`✅ PID ${processInfo.pid} verified as ElementClient.exe, proceeding to kill...`);
            // Kill only the specific PID
            const { stdout, stderr } = await execAsync(`taskkill /PID ${processInfo.pid} /F`);
            console.log(`💀 Taskkill output: "${stdout.trim()}"`);
            if (stderr) {
              console.error(`💀 Taskkill error: "${stderr.trim()}"`);
              logger.error(`Taskkill command failed`, { stdout: stdout.trim(), stderr: stderr.trim() }, 'CLOSE');
            } else {
              logger.info(`Successfully killed process`, { pid: processInfo.pid, output: stdout.trim() }, 'CLOSE');
            }
          } catch (verifyError) {
            console.warn(`❌ Could not verify or kill PID ${processInfo.pid}:`, verifyError);
            logger.error(`Failed to verify or kill process`, verifyError, 'CLOSE');
          }
        } else {
          try {
            process.kill(processInfo.pid, 'SIGTERM');
          } catch (killError) {
            console.warn(`Could not kill PID ${processInfo.pid}:`, killError);
          }
        }
      }
      
      // Remove from our tracking
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
      this.accountLaunchData.delete(accountId);
      
      // Stop crash detection if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
      
      logger.info(`Successfully closed process for account ${processInfo.login}`, { accountId, pid: processInfo.pid }, 'CLOSE');
      logger.endOperation(operationId, true);
    } catch (error) {
      logger.error(`Failed to close game process for ${processInfo.login}`, error, 'CLOSE');
      
      // Even if killing failed, remove from tracking and update status
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
      this.accountLaunchData.delete(accountId);
      
      // Stop crash detection if no more processes
      if (this.processes.size === 0) {
        this.stopCrashDetection();
      }
      
      logger.endOperation(operationId, false);
    }
  }

  async closeMultipleGames(accountIds: string[]): Promise<void> {
    console.log(`🔄 closeMultipleGames called with accountIds: [${accountIds.join(', ')}]`);
    const operationId = logger.startOperation(`Closing ${accountIds.length} selected accounts`);
    
    for (const accountId of accountIds) {
      const processInfo = this.processes.get(accountId);
      if (processInfo) {
        console.log(`  📋 Account ${processInfo.login} (ID: ${accountId}) has PID: ${processInfo.pid}`);
      } else {
        console.log(`  ⚠️ No process info found for account ID: ${accountId}`);
      }
    }
    
    const closePromises = accountIds.map(accountId => this.closeGame(accountId));
    const results = await Promise.allSettled(closePromises);
    
    // Count successes and failures
    let successCount = 0;
    let failureCount = 0;
    
    // Log results for debugging
    results.forEach((result, index) => {
      const accountId = accountIds[index];
      if (result.status === 'rejected') {
        console.error(`❌ Failed to close account ${accountId}:`, result.reason);
        failureCount++;
      } else {
        console.log(`✅ Successfully processed close for account ${accountId}`);
        successCount++;
      }
    });
    
    logger.info(`Multiple close operation completed`, {
      total: accountIds.length,
      successful: successCount,
      failed: failureCount
    }, 'CLOSE');
    
    logger.endOperation(operationId, failureCount === 0);
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