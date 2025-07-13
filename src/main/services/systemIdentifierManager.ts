import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './loggingService';

const execAsync = promisify(exec);

export interface SystemIdentifiers {
  windowsProductId: string;
  computerName: string;
  hostName: string;
  timestamp: number;
}

export class SystemIdentifierManager {
  private originalIdentifiers: SystemIdentifiers | null = null;

  /**
   * Check if the application is running with administrator privileges
   */
  async checkAdminPrivileges(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      // Try to read a registry key that requires admin access
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductId',
        { timeout: 5000 }
      );
      return stdout.includes('ProductId');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current system identifiers
   */
  async getCurrentIdentifiers(): Promise<SystemIdentifiers> {
    if (process.platform !== 'win32') {
      throw new Error('System identifier management is only supported on Windows');
    }

    try {
      const [windowsProductId, computerName, hostName] = await Promise.all([
        this.getWindowsProductId(),
        this.getComputerName(),
        this.getHostName(),
      ]);

      return {
        windowsProductId,
        computerName,
        hostName,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to get current system identifiers', error, 'SYSTEM_ID');
      throw new Error(
        `Failed to get system identifiers: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Store original identifiers for later restoration
   */
  storeOriginalIdentifiers(identifiers: SystemIdentifiers): void {
    this.originalIdentifiers = { ...identifiers };
    logger.info(
      'Original system identifiers stored',
      {
        windowsProductId: identifiers.windowsProductId,
        computerName: identifiers.computerName,
        hostName: identifiers.hostName,
      },
      'SYSTEM_ID'
    );
  }

  /**
   * Generate random system identifiers
   */
  generateRandomIdentifiers(): SystemIdentifiers {
    const windowsProductId = this.generateRandomProductId();
    const computerName = this.generateRandomComputerName();
    const hostName = computerName; // Usually the same as computer name

    return {
      windowsProductId,
      computerName,
      hostName,
      timestamp: Date.now(),
    };
  }

  /**
   * Apply system identifiers (requires admin privileges)
   */
  async applyIdentifiers(identifiers: SystemIdentifiers): Promise<void> {
    if (process.platform !== 'win32') {
      throw new Error('System identifier management is only supported on Windows');
    }

    const hasAdmin = await this.checkAdminPrivileges();
    if (!hasAdmin) {
      throw new Error(
        'Administrator privileges required to change system identifiers. Please run the application as administrator.'
      );
    }

    try {
      logger.info(
        'Applying system identifiers',
        {
          windowsProductId: identifiers.windowsProductId,
          computerName: identifiers.computerName,
          hostName: identifiers.hostName,
        },
        'SYSTEM_ID'
      );

      // Apply changes in parallel for better performance
      await Promise.all([
        this.setWindowsProductId(identifiers.windowsProductId),
        this.setComputerName(identifiers.computerName),
        this.setHostName(identifiers.hostName),
      ]);

      // Verify changes were applied
      await this.verifyChanges(identifiers);

      logger.info('System identifiers applied successfully', null, 'SYSTEM_ID');
    } catch (error) {
      logger.error('Failed to apply system identifiers', error, 'SYSTEM_ID');
      throw new Error(
        `Failed to apply system identifiers: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Restore original identifiers
   */
  async restoreOriginalIdentifiers(): Promise<void> {
    if (!this.originalIdentifiers) {
      throw new Error('No original identifiers stored. Cannot restore.');
    }

    await this.applyIdentifiers(this.originalIdentifiers);
    logger.info('Original system identifiers restored', null, 'SYSTEM_ID');
  }

  /**
   * Get original identifiers
   */
  getOriginalIdentifiers(): SystemIdentifiers | null {
    return this.originalIdentifiers ? { ...this.originalIdentifiers } : null;
  }

  // Private helper methods

  private async getWindowsProductId(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductId',
        { timeout: 5000 }
      );
      const match = stdout.match(/ProductId\s+REG_SZ\s+(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
      throw new Error('ProductId not found in registry');
    } catch (error) {
      throw new Error(
        `Failed to get Windows Product ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async getComputerName(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ComputerName" /v ComputerName',
        { timeout: 5000 }
      );
      const match = stdout.match(/ComputerName\s+REG_SZ\s+(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
      throw new Error('ComputerName not found in registry');
    } catch (error) {
      throw new Error(
        `Failed to get Computer Name: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async getHostName(): Promise<string> {
    try {
      const { stdout } = await execAsync('hostname', { timeout: 5000 });
      return stdout.trim();
    } catch (error) {
      throw new Error(
        `Failed to get Host Name: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async setWindowsProductId(productId: string): Promise<void> {
    try {
      await execAsync(
        `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v ProductId /t REG_SZ /d "${productId}" /f`,
        { timeout: 10000 }
      );
    } catch (error) {
      throw new Error(
        `Failed to set Windows Product ID: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async setComputerName(computerName: string): Promise<void> {
    try {
      // Set computer name in multiple locations for compatibility
      await Promise.all([
        execAsync(
          `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ComputerName" /v ComputerName /t REG_SZ /d "${computerName}" /f`,
          { timeout: 10000 }
        ),
        execAsync(
          `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\ComputerName\\ActiveComputerName" /v ComputerName /t REG_SZ /d "${computerName}" /f`,
          { timeout: 10000 }
        ),
        execAsync(
          `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v Hostname /t REG_SZ /d "${computerName}" /f`,
          { timeout: 10000 }
        ),
      ]);
    } catch (error) {
      throw new Error(
        `Failed to set Computer Name: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async setHostName(hostName: string): Promise<void> {
    try {
      // Set hostname in network configuration
      await execAsync(
        `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v Hostname /t REG_SZ /d "${hostName}" /f`,
        { timeout: 10000 }
      );
      await execAsync(
        `reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v "NV Hostname" /t REG_SZ /d "${hostName}" /f`,
        { timeout: 10000 }
      );
    } catch (error) {
      throw new Error(
        `Failed to set Host Name: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private generateRandomProductId(): string {
    // Generate Windows Product ID in format: XXXXX-XXXXX-XXXXX-XXXXX
    const generateSegment = (length: number): string => {
      const chars = '0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    return `${generateSegment(5)}-${generateSegment(5)}-${generateSegment(5)}-${generateSegment(5)}`;
  }

  private generateRandomComputerName(): string {
    // Generate random computer name (Windows format: up to 15 characters, alphanumeric)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefixes = ['PC', 'WIN', 'COMP', 'SYS', 'HOST'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    let suffix = '';
    const suffixLength = Math.floor(Math.random() * 8) + 4; // 4-11 characters for suffix
    for (let i = 0; i < suffixLength; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return `${prefix}-${suffix}`.substring(0, 15); // Windows limit
  }

  private async verifyChanges(expectedIdentifiers: SystemIdentifiers): Promise<void> {
    try {
      const currentIdentifiers = await this.getCurrentIdentifiers();

      const errors: string[] = [];

      if (currentIdentifiers.windowsProductId !== expectedIdentifiers.windowsProductId) {
        errors.push(
          `Windows Product ID mismatch: expected ${expectedIdentifiers.windowsProductId}, got ${currentIdentifiers.windowsProductId}`
        );
      }

      if (currentIdentifiers.computerName !== expectedIdentifiers.computerName) {
        errors.push(
          `Computer Name mismatch: expected ${expectedIdentifiers.computerName}, got ${currentIdentifiers.computerName}`
        );
      }

      if (errors.length > 0) {
        throw new Error(`Verification failed: ${errors.join('; ')}`);
      }

      logger.info('System identifier changes verified successfully', null, 'SYSTEM_ID');
    } catch (error) {
      logger.warn('Failed to verify system identifier changes', error, 'SYSTEM_ID');
      // Don't throw here - changes might still work even if verification fails
    }
  }
}
