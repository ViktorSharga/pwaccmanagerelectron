import * as iconv from 'iconv-lite';
import { Account } from '../../src/shared/types';
import { generateAccountId } from '../../src/shared/utils/validation';

export class TestDataGenerator {
  static generateMockAccount(index: number = 1): Account {
    const owners = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    const servers: ('Main' | 'X')[] = ['Main', 'X'];
    const descriptions = ['Main character', 'Alt account', 'PvP character', 'Testing account', 'Farming character'];

    return {
      id: generateAccountId(),
      login: `testuser${index}`,
      password: `pass${index}@123`,
      server: servers[index % servers.length],
      characterName: `Character${index}`,
      description: descriptions[index % descriptions.length],
      owner: owners[index % owners.length],
      isRunning: false,
    };
  }

  static generateMockAccounts(count: number): Account[] {
    return Array.from({ length: count }, (_, i) => this.generateMockAccount(i + 1));
  }

  static generateMockBatchFile(account: Account, encoding: 'utf8' | 'cp1251' = 'utf8'): Buffer {
    const content = `@echo off
rem Owner: ${account.owner || 'TestUser'}
rem Description: ${account.description || 'Test account'}
rem Server: ${account.server}
rem Created: ${new Date().toISOString()}

cd /d "%~dp0element"
start elementclient.exe startbypatcher game:cpw user:${account.login} pwd:${account.password} role:${account.characterName || ''} server:${account.server}
exit
`;

    if (encoding === 'cp1251') {
      return iconv.encode(content, 'cp1251');
    }
    return Buffer.from(content, 'utf8');
  }

  static generateValidBatchFile(login: string, password: string): string {
    return `@echo off
rem Owner: TestUser
rem Description: Valid batch file
rem Server: Main
start elementclient.exe startbypatcher user:${login} pwd:${password} role:TestChar server:Main
`;
  }

  static generateInvalidBatchFile(): string {
    return `@echo off
rem This is an invalid batch file
echo "Missing game launch command"
pause
`;
  }

  static generateBatchFileWithUnicode(): string {
    return `@echo off
rem Owner: Tëst Üsér 测试用户
rem Description: File with unicode characters
rem Server: X
start elementclient.exe startbypatcher user:测试账号 pwd:测试密码123 role:测试角色 server:X
`;
  }

  static generateCorruptedBatchFile(): string {
    return `@echo off
rem This file is corrupted
start elementclient.exe startbypatcher user:test pwd:
rem Missing password and malformed command
invalid_command_here
`;
  }

  static generateMockAccountsJSON(count: number): string {
    const accounts = this.generateMockAccounts(count);
    return JSON.stringify(accounts, null, 2);
  }

  static generateMockAccountsCSV(count: number): string {
    const accounts = this.generateMockAccounts(count);
    const headers = ['login', 'password', 'server', 'characterName', 'description', 'owner'];
    
    const csvLines = [
      headers.join(','),
      ...accounts.map(account => 
        headers.map(header => {
          const value = account[header as keyof Account];
          if (value === undefined || value === null) return '';
          return `"${value}"`;
        }).join(',')
      )
    ];

    return csvLines.join('\n');
  }

  static generateInvalidJSON(): string {
    return `{
      "accounts": [
        {
          "login": "test1",
          "password": "pass1"
          // Missing comma and other required fields
        },
        {
          "login": "test2",
          // Missing closing brace
    }`;
  }

  static generateInvalidCSV(): string {
    return `login,password,server
test1,pass1
test2,"unclosed quote
test3,pass3,server3,extra,fields,here`;
  }

  static generateLargeDataset(size: number): Account[] {
    const accounts: Account[] = [];
    for (let i = 0; i < size; i++) {
      accounts.push(this.generateMockAccount(i + 1));
    }
    return accounts;
  }

  static generateAccountWithSpecialCharacters(): Account {
    return {
      id: generateAccountId(),
      login: 'test@user+123',
      password: 'p@ssw0rd!#$%^&*()',
      server: 'Main',
      characterName: 'Tëst Chäracter 测试',
      description: 'Тестовый персонаж с русскими символами',
      owner: 'Владелец Аккаунта',
      isRunning: false,
    };
  }

  static generateDuplicateAccounts(): Account[] {
    const base = this.generateMockAccount(1);
    return [
      base,
      { ...base, id: generateAccountId() }, // Duplicate login
      { ...base, id: generateAccountId(), login: 'different' }, // Different login
    ];
  }
}