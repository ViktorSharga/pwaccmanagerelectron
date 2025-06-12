# Perfect World Account Manager - Bug Fixes and Missing Features

## Overview
This document contains work items to fix identified bugs and implement missing features discovered during initial testing of the Electron implementation.

---

## Issue 1: Game Executable Detection Failure

### Story 1.1: Fix elementclient.exe Detection
**As a** user  
**I want to** successfully select my game folder  
**So that** the application recognizes my Perfect World installation  

**Problem:**
- Application fails to detect elementclient.exe even when it exists
- Likely case-sensitivity issue or incorrect path handling

**Acceptance Criteria:**
- Detect elementclient.exe regardless of case (ElementClient.exe, ELEMENTCLIENT.EXE)
- Handle Windows path separators correctly
- Check file existence with proper permissions
- Provide detailed error message if detection fails
- Log the exact path being checked for debugging

**Implementation:**
```javascript
// Fix detection logic
async function validateGameFolder(folderPath) {
  const files = await fs.readdir(folderPath);
  const executableName = files.find(file => 
    file.toLowerCase() === 'elementclient.exe'
  );
  
  if (executableName) {
    const fullPath = path.join(folderPath, executableName);
    const stats = await fs.stat(fullPath);
    return stats.isFile();
  }
  return false;
}
```

---

## Issue 2: Non-Interactable Account Dialog Fields

### Story 2.1: Fix Account Dialog Input Fields
**As a** user  
**I want to** enter information in all fields of the Add Account dialog  
**So that** I can create new accounts  

**Problem:**
- Input fields in Add Account dialog are not interactable
- Cannot type or focus on fields

**Acceptance Criteria:**
- All input fields must be focusable
- Remove any blocking overlays or z-index issues
- Ensure proper tab navigation between fields
- Test with both mouse click and keyboard navigation
- Form submission must work

**Potential Fixes:**
```javascript
// Check for these common issues:
// 1. Remove pointer-events: none
// 2. Fix z-index stacking
// 3. Remove disabled attributes
// 4. Check event.stopPropagation() calls
// 5. Ensure modal focus trap isn't broken
```

---

## Issue 3: Missing Scan Folder Feature

### Story 3.1: Implement Scan Folder Button and Functionality
**As a** user  
**I want to** scan my game folder for existing batch files  
**So that** I can import all my accounts at once  

**Acceptance Criteria:**
- Add "Scan Folder" button to toolbar with folder icon
- Include text label "Scan Folder" next to icon
- Recursively scan game folder and all subfolders
- Find and parse all .bat files
- Show progress during scanning
- Display preview of found accounts
- Allow selection of which accounts to import

**Batch File Parser:**
```javascript
async function scanForBatchFiles(gameFolder) {
  const batchFiles = [];
  
  async function scanDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.name.toLowerCase().endsWith('.bat')) {
        const account = await parseBatchFile(fullPath);
        if (account) {
          batchFiles.push({ ...account, sourcePath: fullPath });
        }
      }
    }
  }
  
  await scanDirectory(gameFolder);
  return batchFiles;
}
```

---

## Issue 4: Missing Close Selected Feature

### Story 4.1: Implement Close Selected Windows Button
**As a** user  
**I want to** close selected running game instances  
**So that** I can manage multiple accounts efficiently  

**Acceptance Criteria:**
- Add "Close Selected" button to toolbar after "Launch Selected"
- Use window close icon (✖️ or ❌)
- Include text label "Close Selected"
- Only enable when running accounts are selected
- Terminate associated processes using stored PIDs
- Update UI immediately after closing

### Story 4.2: Implement Process ID Tracking
**As a** developer  
**I want to** track process IDs of launched games  
**So that** specific instances can be terminated  

**Acceptance Criteria:**
- Store PID when launching game
- Associate PID with account in table row
- Track process status
- Clear PID when process ends
- Update data model to include runtime information

**Data Model Update:**
```javascript
// Runtime tracking (not persisted)
const runningProcesses = new Map(); // login -> { pid, startTime }

// Launch tracking
function onGameLaunched(login, pid) {
  runningProcesses.set(login, {
    pid: pid,
    startTime: new Date()
  });
  updateUIRow(login, { isRunning: true });
}

// Termination
function closeSelectedAccounts(selectedLogins) {
  for (const login of selectedLogins) {
    const process = runningProcesses.get(login);
    if (process) {
      terminateProcess(process.pid);
      runningProcesses.delete(login);
      updateUIRow(login, { isRunning: false });
    }
  }
}
```

---

## Issue 5: Batch File Reference Tracking

### Story 5.1: Link Accounts to Source Batch Files
**As a** user  
**I want to** maintain connection between accounts and their batch files  
**So that** I can delete both together if needed  

**Acceptance Criteria:**
- Store batch file path when importing accounts
- Add `sourceBatchFile` field to account model
- Show batch file path in account details
- When deleting account, offer to delete batch file too
- Handle missing/moved batch files gracefully

**Updated Account Model:**
```javascript
interface Account {
  login: string;
  password: string;
  character_name: string;
  description?: string;
  owner?: string;
  server: string;
  sourceBatchFile?: string;  // Path to original .bat file
  isImported?: boolean;      // True if imported from scan
}
```

---

## Issue 6: Settings Icon Update

### Story 6.1: Replace Settings Icon with Gear Icon
**As a** user  
**I want to** see a standard gear icon for settings  
**So that** I can easily recognize the settings button  

**Acceptance Criteria:**
- Replace current settings icon with gear/cog icon
- Use standard gear symbol (⚙️)
- Match size and style of other toolbar icons
- Ensure visibility in both light/dark themes

---

## Issue 7: Add Text Labels to All Toolbar Buttons

### Story 7.1: Add Descriptive Text to Toolbar Buttons
**As a** user  
**I want to** see text descriptions next to all toolbar icons  
**So that** I understand each button's function  

**Acceptance Criteria:**
- Add text labels to all toolbar buttons
- Place text to the right of icons
- Maintain consistent spacing
- Ensure toolbar remains usable at minimum window width

**Button Labels:**
```
[+] Add Account
[▶] Launch Selected
[✖] Close Selected
[🔍] Scan Folder  
[↓] Import
[↑] Export
[⚙] Settings
```

**CSS Implementation:**
```css
.toolbar-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
}

.toolbar-icon {
  font-size: 18px;
  width: 20px;
  text-align: center;
}

.toolbar-text {
  font-size: 14px;
  white-space: nowrap;
}
```

---

## Implementation Priority

### Critical (Fix Immediately):
1. Fix elementclient.exe detection - Application unusable without this
2. Fix account dialog fields - Cannot add accounts without this

### High Priority (Next):
3. Add Close Selected button and process tracking
4. Add Scan Folder functionality
5. Track batch file references

### Medium Priority:
6. Update settings icon
7. Add text labels to buttons

---

## Issue 8: Incorrect Data Model Implementation

### Story 8.1: Fix Account Data Model to Match Specification
**As a** user  
**I want to** have only the required account fields  
**So that** the interface is clean and matches the original design  

**Problem:**
- Current implementation has extra fields that weren't requested
- Data model doesn't match the specification

**Acceptance Criteria:**
- Remove all fields not in the specification
- Implement exact field requirements as specified
- Update UI to show only specified fields
- Migrate existing data to new model

**Correct Account Model:**
```javascript
interface Account {
  login: string;           // Mandatory, unique
  password: string;        // Mandatory, masked in UI
  characterName?: string;  // Optional, supports Cyrillic
  description?: string;    // Optional, supports Cyrillic  
  owner?: string;         // Optional, supports Cyrillic
  server: 'Main' | 'X';   // Dropdown with only these options
  
  // Runtime only (not persisted):
  sourceBatchFile?: string;
}
```

**Field Specifications:**
- **Login**: Required, must be unique across all accounts
- **Password**: Required, displayed as bullets (••••••) in table
- **CharacterName**: Optional, allow Cyrillic (а-я, А-Я)
- **Description**: Optional, allow Cyrillic
- **Owner**: Optional, allow Cyrillic
- **Server**: Required dropdown, only "Main" or "X" options

**Validation Rules:**
```javascript
function validateAccount(account) {
  // Login: required and unique
  if (!account.login || account.login.trim() === '') {
    return { valid: false, error: 'Login is required' };
  }
  
  if (isDuplicateLogin(account.login)) {
    return { valid: false, error: 'Login already exists' };
  }
  
  // Password: required
  if (!account.password || account.password.trim() === '') {
    return { valid: false, error: 'Password is required' };
  }
  
  // Server: must be Main or X
  if (!['Main', 'X'].includes(account.server)) {
    return { valid: false, error: 'Server must be Main or X' };
  }
  
  // Cyrillic support regex
  const cyrillicRegex = /^[a-zA-Z0-9а-яА-Я\s\-_.]*$/;
  
  if (account.characterName && !cyrillicRegex.test(account.characterName)) {
    return { valid: false, error: 'Invalid characters in Character Name' };
  }
  
  return { valid: true };
}
```

**UI Updates Required:**
- Remove any extra columns from the table
- Update account dialog to show only these fields
- Server field must be a dropdown, not text input
- Ensure Cyrillic input works in all optional fields

---

## Testing Checklist

- [ ] Verify game detection works with various file name cases
- [ ] Confirm all dialog fields are interactable
- [ ] Test scanning folder with 50+ batch files
- [ ] Verify process termination works correctly
- [ ] Test batch file deletion when removing accounts
- [ ] Ensure all buttons have clear labels
- [ ] Test UI at minimum supported window width
- [ ] Verify only specified fields appear in UI
- [ ] Test Cyrillic input in CharacterName, Description, and Owner fields
- [ ] Confirm Server dropdown only shows Main and X options
- [ ] Verify Login uniqueness validation works