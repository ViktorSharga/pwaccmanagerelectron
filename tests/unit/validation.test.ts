import { validateAccount, generateAccountId, serializeAccount, deserializeAccount } from '../../src/shared/utils/validation';
import { TestDataGenerator } from '../mocks/testDataGenerator';
import { Account } from '../../src/shared/types';

describe('Account Validation', () => {
  describe('validateAccount', () => {
    it('should pass validation for valid account', () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const errors = validateAccount(account);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for missing login', () => {
      const account = { password: 'test123', server: 'Main' };
      const errors = validateAccount(account);
      expect(errors).toContain('Login is required');
    });

    it('should fail validation for empty login', () => {
      const account = { login: '   ', password: 'test123', server: 'Main' };
      const errors = validateAccount(account);
      expect(errors).toContain('Login is required');
    });

    it('should fail validation for missing password', () => {
      const account = { login: 'testuser', server: 'Main' };
      const errors = validateAccount(account);
      expect(errors).toContain('Password is required');
    });

    it('should fail validation for missing server', () => {
      const account = { login: 'testuser', password: 'test123' };
      const errors = validateAccount(account);
      expect(errors).toContain('Server is required');
    });

    it('should fail validation for invalid level', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main',
        level: 0 
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Level must be between 1 and 105');
    });

    it('should fail validation for level too high', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main',
        level: 106 
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Level must be between 1 and 105');
    });

    it('should fail validation for invalid force ID', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main',
        forceID: -1 
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Force ID must be between 0 and 255');
    });

    it('should fail validation for force ID too high', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main',
        forceID: 256 
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Force ID must be between 0 and 255');
    });

    it('should handle account with special characters', () => {
      const account = TestDataGenerator.generateAccountWithSpecialCharacters();
      const errors = validateAccount(account);
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple issues', () => {
      const account = { level: 0, forceID: -1 };
      const errors = validateAccount(account);
      expect(errors.length).toBeGreaterThan(3);
      expect(errors).toContain('Login is required');
      expect(errors).toContain('Password is required');
      expect(errors).toContain('Server is required');
      expect(errors).toContain('Level must be between 1 and 105');
      expect(errors).toContain('Force ID must be between 0 and 255');
    });
  });

  describe('generateAccountId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateAccountId();
      const id2 = generateAccountId();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });

    it('should generate many unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateAccountId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('serializeAccount', () => {
    it('should serialize account to JSON string', () => {
      const account = TestDataGenerator.generateMockAccount(1);
      const serialized = serializeAccount(account);
      expect(typeof serialized).toBe('string');
      
      const parsed = JSON.parse(serialized);
      expect(parsed.login).toBe(account.login);
      expect(parsed.password).toBe(account.password);
      expect(parsed.server).toBe(account.server);
    });

    it('should handle account with special characters', () => {
      const account = TestDataGenerator.generateAccountWithSpecialCharacters();
      const serialized = serializeAccount(account);
      const parsed = JSON.parse(serialized);
      expect(parsed.login).toBe(account.login);
      expect(parsed.character).toBe(account.character);
    });
  });

  describe('deserializeAccount', () => {
    it('should deserialize JSON string to account', () => {
      const originalAccount = TestDataGenerator.generateMockAccount(1);
      const serialized = serializeAccount(originalAccount);
      const deserialized = deserializeAccount(serialized);
      
      expect(deserialized).toEqual(originalAccount);
      expect(deserialized).toHaveProperty('id');
      expect(deserialized).toHaveProperty('login');
      expect(deserialized).toHaveProperty('password');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        deserializeAccount('invalid json');
      }).toThrow();
    });

    it('should handle round-trip serialization', () => {
      const accounts = TestDataGenerator.generateMockAccounts(5);
      
      accounts.forEach(account => {
        const serialized = serializeAccount(account);
        const deserialized = deserializeAccount(serialized);
        expect(deserialized).toEqual(account);
      });
    });
  });
});