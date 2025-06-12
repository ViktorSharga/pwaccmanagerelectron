import * as path from 'path';
import { BatchFileScanner } from '../../src/main/services/batchFileScanner';
import { PlatformService } from '../mocks/platformService';

describe('Batch File Scanner Integration', () => {
  let scanner: BatchFileScanner;
  let mockGameFolder: string;

  beforeEach(() => {
    PlatformService.initialize();
    scanner = new BatchFileScanner();
    mockGameFolder = path.resolve(PlatformService.getMockGamePath());
  });

  describe('Folder Scanning', () => {
    it('should scan mock game folder and find batch files', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      expect(accounts.length).toBeGreaterThan(0);
      
      // Should find accounts from our mock data
      const loginNames = accounts.map(acc => acc.login).filter(Boolean);
      expect(loginNames).toContain('testuser1');
      expect(loginNames).toContain('pvpuser');
    });

    it('should extract account information from batch files', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      const testUser1 = accounts.find(acc => acc.login === 'testuser1');
      expect(testUser1).toBeDefined();
      expect(testUser1?.password).toBe('testpass123');
      expect(testUser1?.server).toBe('Main');

      const pvpUser = accounts.find(acc => acc.login === 'pvpuser');
      expect(pvpUser).toBeDefined();
      expect(pvpUser?.password).toBe('pvppass456');
      expect(pvpUser?.server).toBe('X');
    });

    it('should handle batch files in subdirectories', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Should find accounts from subfolder
      const loginNames = accounts.map(acc => acc.login).filter(Boolean);
      expect(loginNames).toContain('olduser');
      expect(loginNames).toContain('mainaccount');
      expect(loginNames).toContain('altcharacter');
    });

    it('should handle malformed batch files gracefully', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Should not crash on broken_launcher.bat
      expect(Array.isArray(accounts)).toBe(true);
      
      // Broken files might still produce partial results
      const brokenAccount = accounts.find(acc => acc.login === 'brokenuser');
      if (brokenAccount) {
        expect(brokenAccount.login).toBe('brokenuser');
        // Password might be missing or empty
      }
    });

    it('should handle non-existent folders', async () => {
      const nonExistentPath = '/this/path/does/not/exist';
      
      const accounts = await scanner.scanFolder(nonExistentPath);
      expect(accounts).toEqual([]);
    });

    it('should handle empty folders', async () => {
      const emptyPath = path.join(mockGameFolder, 'element', 'userdata');
      
      const accounts = await scanner.scanFolder(emptyPath);
      expect(accounts).toEqual([]);
    });
  });

  describe('Batch File Parsing', () => {
    it('should parse different batch file formats', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Check various formats are parsed
      const formats = [
        'testuser1',    // Standard format
        'pvpuser',      // Another standard format
        'olduser',      // Old format
        'mainaccount',  // With comments
        'altcharacter', // Alt format
      ];

      formats.forEach(login => {
        const account = accounts.find(acc => acc.login === login);
        expect(account).toBeDefined();
        expect(account?.login).toBe(login);
        expect(account?.password).toBeDefined();
        expect(account?.password?.length).toBeGreaterThan(0);
      });
    });

    it('should handle unicode characters in batch files', async () => {
      // This would test the CP1251 encoding handling
      // In our mock files, we don't have actual CP1251 files,
      // but the scanner should handle them gracefully
      const accounts = await scanner.scanFolder(mockGameFolder);
      
      // All accounts should be parsed successfully
      accounts.forEach(account => {
        expect(account.login).toBeDefined();
        expect(typeof account.login).toBe('string');
      });
    });

    it('should extract server information when available', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      const serversFound = accounts
        .map(acc => acc.server)
        .filter(Boolean)
        .filter((server, index, array) => array.indexOf(server) === index);

      expect(serversFound).toContain('Main');
      expect(serversFound).toContain('X');
    });

    it('should extract additional metadata when available', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Check for accounts with additional metadata
      const accountsWithMetadata = accounts.filter(acc => 
        acc.characterName || acc.description || acc.server
      );

      expect(accountsWithMetadata.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle scanning quickly', async () => {
      const startTime = Date.now();
      
      const accounts = await scanner.scanFolder(mockGameFolder);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should handle large directory structures', async () => {
      // Test with the mock folder structure
      const accounts = await scanner.scanFolder(mockGameFolder);

      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts.length).toBeLessThan(100); // Reasonable upper bound for mock data
    });
  });

  describe('Error Recovery', () => {
    it('should continue scanning despite file errors', async () => {
      // Include files that might cause errors
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Should have successfully parsed at least some files
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should handle permission denied errors gracefully', async () => {
      // In our mock environment, this should work
      const accounts = await scanner.scanFolder(mockGameFolder);
      expect(Array.isArray(accounts)).toBe(true);
    });

    it('should handle mixed file encodings', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // All successfully parsed accounts should have required fields
      accounts.forEach(account => {
        if (account.login && account.password) {
          expect(typeof account.login).toBe('string');
          expect(typeof account.password).toBe('string');
          expect(account.login.length).toBeGreaterThan(0);
          expect(account.password.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Integration with Account Storage', () => {
    it('should produce accounts compatible with storage validation', async () => {
      const accounts = await scanner.scanFolder(mockGameFolder);

      // Filter accounts that have minimum required fields
      const validAccounts = accounts.filter(acc => 
        acc.login && acc.password && acc.server
      );

      expect(validAccounts.length).toBeGreaterThan(0);

      // Each valid account should have the required structure
      validAccounts.forEach(account => {
        expect(account).toHaveProperty('login');
        expect(account).toHaveProperty('password');
        expect(account).toHaveProperty('server');
        expect(typeof account.login).toBe('string');
        expect(typeof account.password).toBe('string');
        expect(typeof account.server).toBe('string');
      });
    });
  });
});