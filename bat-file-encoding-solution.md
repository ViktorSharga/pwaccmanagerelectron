# Reliable BAT File Creation with Windows-1251 Encoding

## Overview
This solution replaces the PowerShell script with a direct Node.js implementation using `iconv-lite` for reliable Windows-1251 encoding of BAT files containing Cyrillic characters.

## Step 1: Install Dependencies

```bash
npm install iconv-lite
npm install --save-dev @types/node
```

## Step 2: Create the BAT File Service

Create or update `src/main/services/batFileManager.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { app } from 'electron';
import { Account } from '../types';

export class BatFileManager {
  private readonly scriptsDir: string;
  private readonly gamePath: string;

  constructor(gamePath: string) {
    this.gamePath = gamePath;
    this.scriptsDir = path.join(app.getPath('userData'), 'scripts');
    this.ensureScriptsDirectory();
  }

  private ensureScriptsDirectory(): void {
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
  }

  /**
   * Creates a BAT file with proper Windows-1251 encoding
   */
  public createBatFile(account: Account): string {
    const batFileName = `pw_${account.login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);

    try {
      // Build the batch file content
      const batContent = this.buildBatContent(account);
      
      // Convert to Windows-1251 encoding
      const buffer = iconv.encode(batContent, 'win1251');
      
      // Write the file
      fs.writeFileSync(batPath, buffer);
      
      // Log success (for debugging)
      console.log(`Created BAT file: ${batPath}`);
      console.log(`File size: ${buffer.length} bytes`);
      
      return batPath;
    } catch (error) {
      console.error(`Failed to create BAT file for ${account.login}:`, error);
      throw new Error(`Failed to create BAT file: ${error.message}`);
    }
  }

  /**
   * Builds the BAT file content
   */
  private buildBatContent(account: Account): string {
    const gameDir = path.dirname(this.gamePath);
    const exeName = path.basename(this.gamePath);
    
    // Build command parameters
    const params = [
      'startbypatcher',
      'nocheck',
      `user:${account.login}`,
      `pwd:${account.password}`
    ];
    
    // Add character name if present
    if (account.characterName && account.characterName.trim()) {
      params.push(`role:${account.characterName}`);
    }
    
    params.push('rendernofocus');
    
    // Build the complete BAT file content
    const batContent = `@echo off
chcp 1251
REM Account: ${account.login}
REM Character: ${account.characterName || 'None'}
REM Server: ${account.server || 'Unknown'}

cd /d "${gameDir}"
start "" "${exeName}" ${params.join(' ')}
exit
`;
    
    return batContent;
  }

  /**
   * Ensures a BAT file exists for the account, creates if missing
   */
  public ensureBatFile(account: Account): string {
    const batFileName = `pw_${account.login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);
    
    if (!fs.existsSync(batPath)) {
      return this.createBatFile(account);
    }
    
    return batPath;
  }

  /**
   * Creates BAT files for multiple accounts (used during import)
   */
  public createBatFilesForAccounts(accounts: Account[]): Map<string, string> {
    const results = new Map<string, string>();
    
    for (const account of accounts) {
      try {
        const batPath = this.createBatFile(account);
        results.set(account.login, batPath);
      } catch (error) {
        console.error(`Failed to create BAT for ${account.login}:`, error);
        results.set(account.login, null);
      }
    }
    
    return results;
  }

  /**
   * Deletes a BAT file for an account
   */
  public deleteBatFile(login: string): boolean {
    const batFileName = `pw_${login}.bat`;
    const batPath = path.join(this.scriptsDir, batFileName);
    
    try {
      if (fs.existsSync(batPath)) {
        fs.unlinkSync(batPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Failed to delete BAT file for ${login}:`, error);
      return false;
    }
  }

  /**
   * Debug function to verify encoding
   */
  public debugBatFile(account: Account): void {
    const batPath = this.ensureBatFile(account);
    const buffer = fs.readFileSync(batPath);
    
    console.log('=== BAT File Debug Info ===');
    console.log('Account:', account.login);
    console.log('Character:', account.characterName);
    console.log('File path:', batPath);
    console.log('File size:', buffer.length, 'bytes');
    
    // Show first 200 bytes as hex
    const hexView = Array.from(buffer.slice(0, 200))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log('First 200 bytes (hex):', hexView);
    
    // Try to decode back to verify
    const decodedContent = iconv.decode(buffer, 'win1251');
    console.log('Decoded content preview:', decodedContent.substring(0, 200));
    console.log('=========================');
  }
}
```

## Step 3: Update GameProcessManager

Update your `gameProcessManager.ts` to use the new BatFileManager:

```typescript
import { BatFileManager } from './batFileManager';
import { Account } from '../types';
import { spawn } from 'child_process';

export class GameProcessManager {
  private batFileManager: BatFileManager;
  
  constructor(gamePath: string) {
    this.batFileManager = new BatFileManager(gamePath);
  }
  
  public async launchGame(account: Account): Promise<void> {
    try {
      // Ensure BAT file exists (creates if missing)
      const batPath = this.batFileManager.ensureBatFile(account);
      
      console.log(`Launching game for ${account.login} using: ${batPath}`);
      
      // Launch the BAT file
      const process = spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      
      // Detach the process
      process.unref();
      
      console.log(`Game launched successfully for ${account.login}`);
    } catch (error) {
      console.error(`Failed to launch game for ${account.login}:`, error);
      throw error;
    }
  }
}
```

## Step 4: Testing the Implementation

Create a test file `src/main/services/batFileManager.test.ts`:

```typescript
import { BatFileManager } from './batFileManager';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';

// Test function to verify encoding
export function testBatFileCreation() {
  const testAccounts = [
    {
      login: 'snkill2x',
      password: 'testpass',
      characterName: 'лучник',
      server: 'X',
      description: 'Test archer character'
    },
    {
      login: 'testuser',
      password: 'testpass',
      characterName: 'воин',
      server: 'X',
      description: 'Test warrior character'
    },
    {
      login: 'testuser2',
      password: 'testpass',
      characterName: 'маг',
      server: 'X',
      description: 'Test mage character'
    }
  ];

  const batManager = new BatFileManager('C:\\Games\\PerfectWorld\\element\\ElementClient.exe');
  
  console.log('Testing BAT file creation with Cyrillic characters...\n');
  
  for (const account of testAccounts) {
    console.log(`\nTesting account: ${account.login} (${account.characterName})`);
    
    try {
      // Create BAT file
      const batPath = batManager.createBatFile(account);
      
      // Read and verify
      const buffer = fs.readFileSync(batPath);
      const content = iconv.decode(buffer, 'win1251');
      
      console.log(`✓ BAT file created: ${batPath}`);
      console.log(`✓ File size: ${buffer.length} bytes`);
      console.log(`✓ Contains character: ${content.includes(account.characterName)}`);
      
      // Show character encoding
      const charBuffer = iconv.encode(account.characterName, 'win1251');
      const hexChars = Array.from(charBuffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      console.log(`✓ Character encoding (hex): ${hexChars}`);
      
    } catch (error) {
      console.error(`✗ Failed: ${error.message}`);
    }
  }
}
```

## Step 5: Integration Points

### During Account Import

```typescript
// In your import handler
async function importAccounts(jsonPath: string) {
  const content = await fs.promises.readFile(jsonPath, 'utf8');
  const data = JSON.parse(content);
  
  const batManager = new BatFileManager(gamePath);
  
  // Create BAT files for all imported accounts
  const results = batManager.createBatFilesForAccounts(data.accounts);
  
  // Check results
  results.forEach((batPath, login) => {
    if (batPath) {
      console.log(`Created BAT for ${login}: ${batPath}`);
    } else {
      console.error(`Failed to create BAT for ${login}`);
    }
  });
}
```

### During Account Deletion

```typescript
// When deleting an account
function deleteAccount(login: string) {
  // Delete from database/storage
  // ...
  
  // Also delete the BAT file
  const batManager = new BatFileManager(gamePath);
  batManager.deleteBatFile(login);
}
```

## Step 6: Troubleshooting

If characters still don't work correctly:

1. **Verify the game expects Windows-1251**:
   ```typescript
   // Try different encodings
   const encodings = ['win1251', 'cp866', 'utf8'];
   for (const encoding of encodings) {
     const buffer = iconv.encode(batContent, encoding);
     fs.writeFileSync(`test_${encoding}.bat`, buffer);
   }
   ```

2. **Check if the game needs specific formatting**:
   - Some games expect quotes around parameters with special characters
   - Try: `role:"${account.characterName}"` instead of `role:${account.characterName}`

3. **Debug the exact bytes**:
   ```typescript
   batManager.debugBatFile(account);
   ```

4. **Compare with working BAT files**:
   - If you have manually created working BAT files, compare their byte structure
   - Use a hex editor to see the exact encoding

## Benefits of This Approach

1. **No External Dependencies**: No PowerShell required
2. **Full Control**: Direct control over encoding process
3. **Better Error Handling**: Node.js exceptions are easier to handle
4. **Debugging**: Can log and inspect at every step
5. **Cross-platform Potential**: Although BAT files are Windows-specific, the encoding logic could be adapted
6. **Performance**: Direct file operations are faster than spawning PowerShell

## Next Steps

1. Remove the PowerShell script and related code
2. Implement this solution
3. Test with your Cyrillic characters
4. Use the debug function to verify encoding if issues persist