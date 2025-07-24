import { EventEmitter } from 'events';
import { logger } from './loggingService';

export interface SpoofedIdentifiers {
  macAddress: string;
  diskSerial: string;
  volumeSerial: string;
  gpuId: string;
  biosSerial: string;
  motherboardSerial: string;
}

export interface SpoofingStatus {
  active: boolean;
  identifiers?: SpoofedIdentifiers;
  processId?: number;
  error?: string;
}

export class ProcessSpoofer extends EventEmitter {
  private nativeSpoofer: any = null;
  private currentProcessId: number | null = null;
  private processMonitorInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.loadNativeModule();
  }

  /**
   * Load the native Windows spoofer module
   */
  private loadNativeModule(): void {
    if (process.platform !== 'win32') {
      logger.warn('Process spoofing is only supported on Windows', null, 'PROCESS_SPOOFER');
      return;
    }

    try {
      // Load the native addon
      this.nativeSpoofer = require('../../../native/windows-spoofer/build/Release/windows_spoofer.node');
      logger.info('Native Windows spoofer loaded successfully', null, 'PROCESS_SPOOFER');
    } catch (error) {
      logger.error('Failed to load native Windows spoofer', error, 'PROCESS_SPOOFER');
      this.emit('error', new Error('Failed to load native spoofer module'));
    }
  }

  /**
   * Initialize spoofer for a specific process
   */
  async initializeForProcess(processId: number): Promise<boolean> {
    if (!this.nativeSpoofer) {
      throw new Error('Native spoofer module not available');
    }

    try {
      const success = this.nativeSpoofer.initializeForProcess(processId);

      if (success) {
        this.currentProcessId = processId;
        this.isInitialized = true;
        this.startProcessMonitoring(processId);

        logger.info(`Process spoofer initialized for PID ${processId}`, null, 'PROCESS_SPOOFER');

        this.emit('initialized', { processId });
      }

      return success;
    } catch (error) {
      logger.error('Failed to initialize process spoofer', error, 'PROCESS_SPOOFER');
      throw new Error(
        `Failed to initialize spoofer: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Apply spoofing with specific identifiers
   */
  async applySpoofing(identifiers: Partial<SpoofedIdentifiers>): Promise<boolean> {
    if (!this.isInitialized || !this.nativeSpoofer) {
      throw new Error('Spoofer not initialized');
    }

    try {
      // Generate missing identifiers
      const fullIdentifiers = await this.fillMissingIdentifiers(identifiers);

      const success = this.nativeSpoofer.applySpoofing(fullIdentifiers);

      if (success) {
        logger.info(
          'Process spoofing applied successfully',
          {
            processId: this.currentProcessId,
            identifiersCount: Object.keys(fullIdentifiers).length,
          },
          'PROCESS_SPOOFER'
        );

        this.emit('spoofingApplied', {
          processId: this.currentProcessId,
          identifiers: fullIdentifiers,
        });
      } else {
        logger.warn('Process spoofing application failed', null, 'PROCESS_SPOOFER');
      }

      return success;
    } catch (error) {
      logger.error('Failed to apply process spoofing', error, 'PROCESS_SPOOFER');
      throw new Error(
        `Failed to apply spoofing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate random identifiers for spoofing
   */
  async generateRandomIdentifiers(): Promise<SpoofedIdentifiers> {
    if (!this.nativeSpoofer) {
      // Fallback TypeScript implementation
      return this.generateFallbackIdentifiers();
    }

    try {
      const identifiers = this.nativeSpoofer.generateRandomIdentifiers();
      logger.info('Random identifiers generated', null, 'PROCESS_SPOOFER');
      return identifiers;
    } catch (error) {
      logger.warn(
        'Failed to generate random identifiers with native module, using fallback',
        error,
        'PROCESS_SPOOFER'
      );
      return this.generateFallbackIdentifiers();
    }
  }

  /**
   * Get current spoofing status
   */
  async getSpoofingStatus(): Promise<SpoofingStatus> {
    if (!this.nativeSpoofer) {
      return { active: false, error: 'Native module not available' };
    }

    try {
      const status = this.nativeSpoofer.getSpoofingStatus();
      return {
        ...status,
        processId: this.currentProcessId || undefined,
      };
    } catch (error) {
      logger.error('Failed to get spoofing status', error, 'PROCESS_SPOOFER');
      return {
        active: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Restore original identifiers and stop spoofing
   */
  async restoreOriginalIdentifiers(): Promise<boolean> {
    if (!this.isInitialized || !this.nativeSpoofer) {
      return true; // Nothing to restore
    }

    try {
      const success = this.nativeSpoofer.restoreOriginalIdentifiers();

      if (success) {
        logger.info('Original identifiers restored', null, 'PROCESS_SPOOFER');
        this.emit('spoofingRestored', { processId: this.currentProcessId });
      }

      return success;
    } catch (error) {
      logger.error('Failed to restore original identifiers', error, 'PROCESS_SPOOFER');
      return false;
    }
  }

  /**
   * Check if safe MAC address spoofing is possible
   */
  async canSafeMacSpoof(): Promise<boolean> {
    if (!this.nativeSpoofer) {
      return false;
    }

    try {
      return this.nativeSpoofer.canSafeMacSpoof();
    } catch (error) {
      logger.warn('Failed to check MAC spoofing safety', error, 'PROCESS_SPOOFER');
      return false;
    }
  }

  /**
   * Cleanup spoofer and restore everything
   */
  async cleanup(): Promise<void> {
    if (this.processMonitorInterval) {
      clearInterval(this.processMonitorInterval);
      this.processMonitorInterval = null;
    }

    if (this.isInitialized) {
      await this.restoreOriginalIdentifiers();
    }

    if (this.nativeSpoofer) {
      try {
        this.nativeSpoofer.cleanup();
      } catch (error) {
        logger.warn('Error during native spoofer cleanup', error, 'PROCESS_SPOOFER');
      }
    }

    this.isInitialized = false;
    this.currentProcessId = null;

    logger.info('Process spoofer cleaned up', null, 'PROCESS_SPOOFER');
    this.emit('cleanup');
  }

  /**
   * Check if spoofer is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.nativeSpoofer !== null;
  }

  /**
   * Get the current process ID being spoofed
   */
  getCurrentProcessId(): number | null {
    return this.currentProcessId;
  }

  // Private helper methods

  private async fillMissingIdentifiers(
    partial: Partial<SpoofedIdentifiers>
  ): Promise<SpoofedIdentifiers> {
    const random = await this.generateRandomIdentifiers();

    return {
      macAddress: partial.macAddress || random.macAddress,
      diskSerial: partial.diskSerial || random.diskSerial,
      volumeSerial: partial.volumeSerial || random.volumeSerial,
      gpuId: partial.gpuId || random.gpuId,
      biosSerial: partial.biosSerial || random.biosSerial,
      motherboardSerial: partial.motherboardSerial || random.motherboardSerial,
    };
  }

  private generateFallbackIdentifiers(): SpoofedIdentifiers {
    return {
      macAddress: this.generateRandomMac(),
      diskSerial: this.generateRandomSerial(16),
      volumeSerial: this.generateRandomSerial(8),
      gpuId: this.generateRandomSerial(12),
      biosSerial: this.generateRandomSerial(10),
      motherboardSerial: this.generateRandomSerial(14),
    };
  }

  private generateRandomMac(): string {
    const bytes = Array.from({ length: 6 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    );
    return bytes.join(':').toUpperCase();
  }

  private generateRandomSerial(length: number): string {
    const chars = '0123456789ABCDEF';
    return Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join('');
  }

  private startProcessMonitoring(processId: number): void {
    if (this.processMonitorInterval) {
      clearInterval(this.processMonitorInterval);
    }

    // Monitor process every 10 seconds
    this.processMonitorInterval = setInterval(async () => {
      try {
        const status = await this.getSpoofingStatus();

        if (status.active && this.currentProcessId) {
          // Check if process is still alive using native module or fallback
          const isAlive = await this.isProcessAlive(this.currentProcessId);

          if (!isAlive) {
            logger.info(
              `Target process ${this.currentProcessId} has terminated, cleaning up spoofing`,
              null,
              'PROCESS_SPOOFER'
            );

            await this.cleanup();
            this.emit('processTerminated', { processId: this.currentProcessId });
          }
        }
      } catch (error) {
        logger.warn('Error during process monitoring', error, 'PROCESS_SPOOFER');
      }
    }, 10000);
  }

  private async isProcessAlive(processId: number): Promise<boolean> {
    try {
      // Use Node.js to check if process exists
      process.kill(processId, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}
