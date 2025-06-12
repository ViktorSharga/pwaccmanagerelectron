import { MockProcessManager } from '../mocks/mockProcessManager';
import { TestDataGenerator } from '../mocks/testDataGenerator';
import { PlatformService } from '../mocks/platformService';

describe('Game Process Manager Integration', () => {
  let processManager: MockProcessManager;

  beforeEach(() => {
    PlatformService.initialize();
    processManager = new MockProcessManager();
  });

  afterEach(() => {
    processManager.destroy();
  });

  describe('Game Launching', () => {
    it('should launch game and track process', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      const statusUpdates: Array<{ accountId: string; running: boolean }> = [];
      processManager.on('status-update', (accountId, running) => {
        statusUpdates.push({ accountId, running });
      });

      await processManager.launchGame(account, gamePath);

      expect(processManager.isAccountRunning(account.id)).toBe(true);
      expect(statusUpdates).toContainEqual({ accountId: account.id, running: true });

      const runningProcesses = processManager.getRunningProcesses();
      expect(runningProcesses).toHaveLength(1);
      expect(runningProcesses[0].login).toBe(account.login);
    });

    it('should handle multiple game launches', async () => {
      const accounts = TestDataGenerator.generateMockAccounts(3);
      const gamePath = PlatformService.getMockGamePath();

      for (const account of accounts) {
        await processManager.launchGame(account, gamePath);
      }

      expect(processManager.getRunningProcesses()).toHaveLength(3);

      accounts.forEach(account => {
        expect(processManager.isAccountRunning(account.id)).toBe(true);
      });
    });

    it('should handle process termination', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      await processManager.launchGame(account, gamePath);
      expect(processManager.isAccountRunning(account.id)).toBe(true);

      await processManager.closeGame(account.id);
      expect(processManager.isAccountRunning(account.id)).toBe(false);
    });

    it('should handle random process crashes', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      const statusUpdates: Array<{ accountId: string; running: boolean }> = [];
      processManager.on('status-update', (accountId, running) => {
        statusUpdates.push({ accountId, running });
      });

      await processManager.launchGame(account, gamePath);
      expect(processManager.isAccountRunning(account.id)).toBe(true);

      // Simulate crash
      processManager.simulateProcessCrash(account.id);
      expect(processManager.isAccountRunning(account.id)).toBe(false);

      // Should have received both start and stop events
      expect(statusUpdates).toContainEqual({ accountId: account.id, running: true });
      expect(statusUpdates).toContainEqual({ accountId: account.id, running: false });
    });

    it('should track process uptime', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      await processManager.launchGame(account, gamePath);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const uptime = processManager.getProcessUptime(account.id);
      expect(uptime).toBeGreaterThan(50);
      expect(uptime).toBeLessThan(200);
    });

    it('should handle launch failures gracefully', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      const statusUpdates: Array<{ accountId: string; running: boolean }> = [];
      processManager.on('status-update', (accountId, running) => {
        statusUpdates.push({ accountId, running });
      });

      await processManager.launchGame(account, gamePath);
      
      // Simulate immediate failure
      processManager.simulateLaunchFailure(account.id);
      
      // Wait for failure to be detected
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(processManager.isAccountRunning(account.id)).toBe(false);
    });
  });

  describe('Process Monitoring', () => {
    it('should emit status updates for process changes', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      const statusUpdates: Array<{ accountId: string; running: boolean }> = [];
      processManager.on('status-update', (accountId, running) => {
        statusUpdates.push({ accountId, running });
      });

      // Launch
      await processManager.launchGame(account, gamePath);
      expect(statusUpdates).toContainEqual({ accountId: account.id, running: true });

      // Close
      await processManager.closeGame(account.id);
      expect(statusUpdates).toContainEqual({ accountId: account.id, running: false });
    });

    it('should handle concurrent operations', async () => {
      const accounts = TestDataGenerator.generateMockAccounts(5);
      const gamePath = PlatformService.getMockGamePath();

      // Launch all concurrently
      const launchPromises = accounts.map(account =>
        processManager.launchGame(account, gamePath)
      );

      await Promise.all(launchPromises);

      expect(processManager.getRunningProcesses()).toHaveLength(5);

      // Close all concurrently
      const closePromises = accounts.map(account =>
        processManager.closeGame(account.id)
      );

      await Promise.all(closePromises);

      expect(processManager.getRunningProcesses()).toHaveLength(0);
    });

    it('should clean up properly on destroy', async () => {
      const accounts = TestDataGenerator.generateMockAccounts(3);
      const gamePath = PlatformService.getMockGamePath();

      for (const account of accounts) {
        await processManager.launchGame(account, gamePath);
      }

      expect(processManager.getRunningProcesses()).toHaveLength(3);

      processManager.destroy();

      expect(processManager.getRunningProcesses()).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle attempts to close non-running processes', async () => {
      const account = TestDataGenerator.generateMockAccount(1);

      // Try to close a process that was never started
      await expect(processManager.closeGame(account.id)).resolves.not.toThrow();
      expect(processManager.isAccountRunning(account.id)).toBe(false);
    });

    it('should handle double launch attempts', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const gamePath = PlatformService.getMockGamePath();

      await processManager.launchGame(account, gamePath);
      expect(processManager.isAccountRunning(account.id)).toBe(true);

      // Launch again - should either replace or be ignored gracefully
      await processManager.launchGame(account, gamePath);
      
      // Should still be running (implementation dependent)
      const runningProcesses = processManager.getRunningProcesses();
      expect(runningProcesses.filter(p => p.accountId === account.id).length).toBeGreaterThanOrEqual(1);
    });

    it('should handle invalid game paths', async () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const invalidPath = '/nonexistent/path';

      // In mock mode, this should still work but might emit different events
      await expect(processManager.launchGame(account, invalidPath)).resolves.not.toThrow();
    });
  });
});