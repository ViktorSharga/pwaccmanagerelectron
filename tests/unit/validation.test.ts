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
      const account = { password: 'test123', server: 'Main' as const };
      const errors = validateAccount(account);
      expect(errors).toContain('Login is required');
    });

    it('should fail validation for empty login', () => {
      const account = { login: '   ', password: 'test123', server: 'Main' as const };
      const errors = validateAccount(account);
      expect(errors).toContain('Login is required');
    });

    it('should fail validation for missing password', () => {
      const account = { login: 'testuser', server: 'Main' as const };
      const errors = validateAccount(account);
      expect(errors).toContain('Password is required');
    });

    it('should fail validation for missing server', () => {
      const account = { login: 'testuser', password: 'test123' };
      const errors = validateAccount(account);
      expect(errors).toContain('Server must be Main or X');
    });

    it('should fail validation for invalid server', () => {
      const account = { login: 'testuser', password: 'test123', server: 'InvalidServer' as any };
      const errors = validateAccount(account);
      expect(errors).toContain('Server must be Main or X');
    });

    it('should pass validation for Cyrillic characters in characterName', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main' as const,
        characterName: 'Тестовый персонаж'
      };
      const errors = validateAccount(account);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation for Cyrillic characters in description', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'X' as const,
        description: 'Описание персонажа с русскими символами'
      };
      const errors = validateAccount(account);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation for invalid characters in characterName', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main' as const,
        characterName: 'Test<script>alert("xss")</script>'
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Invalid characters in Character Name');
    });

    it('should fail validation for invalid characters in owner', () => {
      const account = { 
        login: 'testuser', 
        password: 'test123', 
        server: 'Main' as const,
        owner: 'User@#$%^&*()'
      };
      const errors = validateAccount(account);
      expect(errors).toContain('Invalid characters in Owner');
    });

    it('should handle account with special characters', () => {
      const account = TestDataGenerator.generateAccountWithSpecialCharacters();
      const errors = validateAccount(account);
      expect(errors).toHaveLength(0);
    });

    it('should return multiple errors for multiple issues', () => {
      const account = { 
        characterName: 'Invalid<script>',
        description: 'Also invalid<>',
        owner: 'Bad@#$%'
      };
      const errors = validateAccount(account);
      expect(errors.length).toBeGreaterThanOrEqual(5);
      expect(errors).toContain('Login is required');
      expect(errors).toContain('Password is required');
      expect(errors).toContain('Server must be Main or X');
      expect(errors).toContain('Invalid characters in Character Name');
      expect(errors).toContain('Invalid characters in Description');
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
      expect(parsed.characterName).toBe(account.characterName);
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