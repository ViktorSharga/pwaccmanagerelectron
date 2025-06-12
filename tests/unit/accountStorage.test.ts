import { MockAccountStorage } from '../mocks/mockAccountStorage';
import { TestDataGenerator } from '../mocks/testDataGenerator';
import { Account } from '../../src/shared/types';

describe('AccountStorage', () => {
  let accountStorage: MockAccountStorage;

  beforeEach(() => {
    accountStorage = new MockAccountStorage();
  });

  afterEach(() => {
    accountStorage.clearAccounts();
  });

  describe('getAccounts', () => {
    it('should return empty array when no accounts file exists', async () => {
      const accounts = await accountStorage.getAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return accounts when accounts exist', async () => {
      const testAccounts = TestDataGenerator.generateMockAccounts(3);
      accountStorage.setAccounts(testAccounts);

      const loadedAccounts = await accountStorage.getAccounts();
      expect(loadedAccounts).toHaveLength(3);
      expect(loadedAccounts[0]).toHaveProperty('id');
      expect(loadedAccounts[0]).toHaveProperty('login');
      expect(loadedAccounts[0]).toHaveProperty('password');
    });
  });

  describe('saveAccount', () => {
    it('should save new account', async () => {
      const accountData = TestDataGenerator.generateMockAccount(1);
      delete (accountData as any).id; // Remove ID to simulate new account

      const savedAccount = await accountStorage.saveAccount(accountData);
      
      expect(savedAccount).toHaveProperty('id');
      expect(savedAccount).toHaveProperty('login');
      expect(savedAccount).toHaveProperty('password');
      expect(savedAccount.id).toBeDefined();
      expect(savedAccount.login).toBe(accountData.login);
      expect(savedAccount.isRunning).toBe(false);
    });

    it('should update existing account', async () => {
      const accountData = TestDataGenerator.generateMockAccount(1);
      delete (accountData as any).id; // Remove ID to create new account
      
      // Save initial account
      const savedAccount = await accountStorage.saveAccount(accountData);
      
      // Update account
      const updatedData = { ...savedAccount, character: 'UpdatedCharacter' };
      const updatedAccount = await accountStorage.saveAccount(updatedData);
      
      expect(updatedAccount.id).toBe(savedAccount.id);
      expect(updatedAccount.character).toBe('UpdatedCharacter');
    });

    it('should reject account with missing required fields', async () => {
      const invalidAccount = { login: 'test' }; // Missing password and server
      
      await expect(accountStorage.saveAccount(invalidAccount)).rejects.toThrow();
    });

    it('should reject duplicate login for new account', async () => {
      const account1 = TestDataGenerator.generateMockAccount(1);
      delete (account1 as any).id; // Remove ID to create new account
      await accountStorage.saveAccount(account1);
      
      const account2 = { ...account1 };
      delete (account2 as any).id; // Make it a new account
      
      await expect(accountStorage.saveAccount(account2)).rejects.toThrow('An account with this login already exists');
    });

    it('should allow updating existing account with same login', async () => {
      const accountData = TestDataGenerator.generateMockAccount(1);
      delete (accountData as any).id; // Remove ID to create new account
      const savedAccount = await accountStorage.saveAccount(accountData);
      
      const updatedAccount = { ...savedAccount, character: 'Updated' };
      const result = await accountStorage.saveAccount(updatedAccount);
      
      expect(result.character).toBe('Updated');
    });

    it('should reject updating account with duplicate login', async () => {
      const account1 = TestDataGenerator.generateMockAccount(1);
      const account2 = TestDataGenerator.generateMockAccount(2);
      
      delete (account1 as any).id; // Remove ID to create new account
      delete (account2 as any).id; // Remove ID to create new account
      
      await accountStorage.saveAccount(account1);
      const savedAccount2 = await accountStorage.saveAccount(account2);
      
      // Try to update account2 with account1's login
      const invalidUpdate = { ...savedAccount2, login: account1.login };
      
      await expect(accountStorage.saveAccount(invalidUpdate)).rejects.toThrow('An account with this login already exists');
    });

    it('should handle special characters in account data', async () => {
      const account = TestDataGenerator.generateAccountWithSpecialCharacters();
      delete (account as any).id;
      
      const savedAccount = await accountStorage.saveAccount(account);
      expect(savedAccount.login).toBe(account.login);
      expect(savedAccount.character).toBe(account.character);
    });
  });

  describe('deleteAccount', () => {
    it('should delete existing account', async () => {
      const accountData = TestDataGenerator.generateMockAccount(1);
      delete (accountData as any).id; // Remove ID to create new account
      const savedAccount = await accountStorage.saveAccount(accountData);
      
      await accountStorage.deleteAccount(savedAccount.id);
      
      const accounts = await accountStorage.getAccounts();
      expect(accounts).not.toContainEqual(expect.objectContaining({ id: savedAccount.id }));
    });

    it('should throw error when deleting non-existent account', async () => {
      await expect(accountStorage.deleteAccount('non-existent-id')).rejects.toThrow('Account not found');
    });

    it('should handle deletion from multiple accounts', async () => {
      const accounts = TestDataGenerator.generateMockAccounts(5);
      const savedAccounts: Account[] = [];
      
      for (const account of accounts) {
        delete (account as any).id;
        savedAccounts.push(await accountStorage.saveAccount(account));
      }
      
      // Delete middle account
      await accountStorage.deleteAccount(savedAccounts[2].id);
      
      const remainingAccounts = await accountStorage.getAccounts();
      expect(remainingAccounts).toHaveLength(4);
      expect(remainingAccounts.find(a => a.id === savedAccounts[2].id)).toBeUndefined();
    });
  });

  describe('account management operations', () => {
    it('should handle bulk operations efficiently', async () => {
      const accounts = TestDataGenerator.generateMockAccounts(100);
      
      // Save all accounts
      const savedAccounts: Account[] = [];
      for (const account of accounts) {
        delete (account as any).id;
        savedAccounts.push(await accountStorage.saveAccount(account));
      }
      
      expect(savedAccounts).toHaveLength(100);
      
      // Verify all accounts exist
      const allAccounts = await accountStorage.getAccounts();
      expect(allAccounts).toHaveLength(100);
      
      // Delete half of them
      for (let i = 0; i < 50; i++) {
        await accountStorage.deleteAccount(savedAccounts[i].id);
      }
      
      const remainingAccounts = await accountStorage.getAccounts();
      expect(remainingAccounts).toHaveLength(50);
    });

    it('should maintain data integrity during concurrent operations', async () => {
      const account1 = TestDataGenerator.generateMockAccount(1);
      const account2 = TestDataGenerator.generateMockAccount(2);
      
      delete (account1 as any).id;
      delete (account2 as any).id;
      
      // Simulate concurrent saves
      const promises = [
        accountStorage.saveAccount(account1),
        accountStorage.saveAccount(account2),
      ];
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(2);
      
      const allAccounts = await accountStorage.getAccounts();
      expect(allAccounts).toHaveLength(2);
    });
  });
});