import { SystemIdentifierManager, SystemIdentifiers } from '../../src/main/services/systemIdentifierManager';

// Mock the logging service to avoid Electron app dependency
jest.mock('../../src/main/services/loggingService', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('SystemIdentifierManager', () => {
  let manager: SystemIdentifierManager;

  beforeEach(() => {
    manager = new SystemIdentifierManager();
  });

  describe('generateRandomIdentifiers', () => {
    it('should generate valid system identifiers', () => {
      const identifiers = manager.generateRandomIdentifiers();
      
      expect(identifiers).toHaveProperty('windowsProductId');
      expect(identifiers).toHaveProperty('computerName');
      expect(identifiers).toHaveProperty('hostName');
      expect(identifiers).toHaveProperty('timestamp');
      expect(typeof identifiers.timestamp).toBe('number');
    });

    it('should generate Windows Product ID in correct format', () => {
      const identifiers = manager.generateRandomIdentifiers();
      
      // Windows Product ID format: XXXXX-XXXXX-XXXXX-XXXXX (5 digits each part)
      const productIdPattern = /^\d{5}-\d{5}-\d{5}-\d{5}$/;
      expect(identifiers.windowsProductId).toMatch(productIdPattern);
    });

    it('should generate valid computer names', () => {
      const identifiers = manager.generateRandomIdentifiers();
      
      // Computer name should be between 1-15 characters, alphanumeric with hyphens
      expect(identifiers.computerName.length).toBeGreaterThan(0);
      expect(identifiers.computerName.length).toBeLessThanOrEqual(15);
      expect(identifiers.computerName).toMatch(/^[A-Z0-9-]+$/);
    });

    it('should generate different identifiers on each call', () => {
      const identifiers1 = manager.generateRandomIdentifiers();
      const identifiers2 = manager.generateRandomIdentifiers();
      
      expect(identifiers1.windowsProductId).not.toBe(identifiers2.windowsProductId);
      expect(identifiers1.computerName).not.toBe(identifiers2.computerName);
    });

    it('should set hostName same as computerName', () => {
      const identifiers = manager.generateRandomIdentifiers();
      
      expect(identifiers.hostName).toBe(identifiers.computerName);
    });
  });

  describe('storeOriginalIdentifiers', () => {
    it('should store and retrieve original identifiers', () => {
      const testIdentifiers: SystemIdentifiers = {
        windowsProductId: '12345-67890-11111-22222',
        computerName: 'TEST-PC',
        hostName: 'TEST-PC',
        timestamp: Date.now()
      };

      manager.storeOriginalIdentifiers(testIdentifiers);
      const stored = manager.getOriginalIdentifiers();

      expect(stored).toEqual(testIdentifiers);
    });

    it('should return null when no identifiers stored', () => {
      const stored = manager.getOriginalIdentifiers();
      expect(stored).toBeNull();
    });

    it('should return a copy of stored identifiers', () => {
      const testIdentifiers: SystemIdentifiers = {
        windowsProductId: '12345-67890-11111-22222',
        computerName: 'TEST-PC',
        hostName: 'TEST-PC',
        timestamp: Date.now()
      };

      manager.storeOriginalIdentifiers(testIdentifiers);
      const stored = manager.getOriginalIdentifiers();

      // Modify the returned object
      if (stored) {
        stored.computerName = 'MODIFIED';
      }

      // Original should remain unchanged
      const storedAgain = manager.getOriginalIdentifiers();
      expect(storedAgain?.computerName).toBe('TEST-PC');
    });
  });

  // Platform-specific tests only run on Windows
  if (process.platform === 'win32') {
    describe('Windows-specific functionality', () => {
      it('should detect admin privileges correctly', async () => {
        const hasAdmin = await manager.checkAdminPrivileges();
        expect(typeof hasAdmin).toBe('boolean');
      });

      // Note: We don't test actual system identifier changes in unit tests
      // as they require admin privileges and would modify the system
    });
  } else {
    describe('Non-Windows platform', () => {
      it('should return false for admin privileges check', async () => {
        const hasAdmin = await manager.checkAdminPrivileges();
        expect(hasAdmin).toBe(false);
      });

      it('should throw error for getCurrentIdentifiers', async () => {
        await expect(manager.getCurrentIdentifiers()).rejects.toThrow(
          'System identifier management is only supported on Windows'
        );
      });

      it('should throw error for applyIdentifiers', async () => {
        const testIdentifiers = manager.generateRandomIdentifiers();
        await expect(manager.applyIdentifiers(testIdentifiers)).rejects.toThrow(
          'System identifier management is only supported on Windows'
        );
      });
    });
  }
});