import { EventEmitter } from 'events';
import { Account } from '../../src/shared/types';

interface MockProcess {
  pid: number;
  name: string;
  login: string;
  accountId: string;
  startTime: number;
  running: boolean;
}

export class MockProcessManager extends EventEmitter {
  private processes = new Map<string, MockProcess>();
  private nextPid = 1000;
  private processCheckInterval: NodeJS.Timeout | null = null;
  private randomTerminationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startProcessMonitoring();
    this.startRandomTermination();
  }

  async launchGame(account: Account, gamePath: string): Promise<void> {
    // Simulate launch delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const pid = this.nextPid++;
    const process: MockProcess = {
      pid,
      name: 'mockgame',
      login: account.login,
      accountId: account.id,
      startTime: Date.now(),
      running: true,
    };

    this.processes.set(account.id, process);
    this.emit('status-update', account.id, true);

    // Simulate occasional launch failures
    if (Math.random() < 0.05) {
      setTimeout(() => {
        this.terminateProcess(account.id);
      }, 500);
    }
  }

  async closeGame(accountId: string): Promise<void> {
    const process = this.processes.get(accountId);
    if (process) {
      this.terminateProcess(accountId);
    }
  }

  private terminateProcess(accountId: string): void {
    const process = this.processes.get(accountId);
    if (process) {
      process.running = false;
      this.processes.delete(accountId);
      this.emit('status-update', accountId, false);
    }
  }

  isAccountRunning(accountId: string): boolean {
    return this.processes.has(accountId);
  }

  getRunningProcesses(): MockProcess[] {
    return Array.from(this.processes.values());
  }

  private startProcessMonitoring(): void {
    this.processCheckInterval = setInterval(() => {
      // Simulate process status checking
      const runningCount = this.processes.size;
      if (runningCount > 0) {
        console.log(`Mock: Monitoring ${runningCount} processes`);
      }
    }, 5000);
  }

  private startRandomTermination(): void {
    // Randomly terminate processes to simulate crashes
    this.randomTerminationInterval = setInterval(() => {
      const processes = Array.from(this.processes.values());
      if (processes.length > 0 && Math.random() < 0.02) {
        const randomProcess = processes[Math.floor(Math.random() * processes.length)];
        console.log(`Mock: Randomly terminating process for ${randomProcess.login}`);
        this.terminateProcess(randomProcess.accountId);
      }
    }, 10000);
  }

  destroy(): void {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
    }
    if (this.randomTerminationInterval) {
      clearInterval(this.randomTerminationInterval);
    }
    
    // Terminate all processes
    for (const accountId of this.processes.keys()) {
      this.terminateProcess(accountId);
    }
  }

  // Test utilities
  simulateProcessCrash(accountId: string): void {
    this.terminateProcess(accountId);
  }

  simulateLaunchFailure(accountId: string): void {
    setTimeout(() => {
      this.terminateProcess(accountId);
    }, 100);
  }

  getProcessUptime(accountId: string): number {
    const process = this.processes.get(accountId);
    return process ? Date.now() - process.startTime : 0;
  }
}