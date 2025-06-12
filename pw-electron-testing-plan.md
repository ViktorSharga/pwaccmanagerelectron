# Perfect World Account Manager - Comprehensive Testing Plan

## Overview
This testing plan enables cross-platform development (macOS) for a Windows-targeted application by implementing comprehensive mocks and test suites.

## Testing Stack
- **Test Runner**: Jest for unit/integration tests
- **E2E Framework**: Playwright or Spectron
- **Mocking**: Custom mock implementations for Windows-specific features
- **Coverage**: Istanbul/NYC
- **Platform Detection**: Node.js process.platform

---

## Epic 1: Mock Environment Setup

### Story 1.1: Create Platform Detection Service
**As a** developer  
**I want to** detect the current operating system  
**So that** I can conditionally use mocks on non-Windows systems  
**Acceptance Criteria:**
- Create PlatformService with isWindows(), isMac(), isLinux()
- Export isDevelopment flag based on NODE_ENV
- Create mock mode flag for forcing mocks on Windows
- Add environment variable FORCE_MOCK_MODE

### Story 1.2: Create Mock Game Folder Structure
**As a** developer  
**I want to** generate a mock Perfect World game folder  
**So that** I can test file operations on macOS  
**Acceptance Criteria:**
- Create mock-data/game-folder/ directory
- Add mock elementclient.exe (empty file)
- Add element/userdata/ subdirectory
- Create 5-10 sample .bat files with various formats
- Include both CP1251 and UTF-8 encoded files

### Story 1.3: Generate Mock Batch Files
**As a** developer  
**I want to** create realistic batch file samples  
**So that** I can test parsing functionality  
**Test Data Creation:**
```
mock-data/game-folder/
├── elementclient.exe (empty file)
├── element/
│   └── userdata/
├── launcher_account1.bat
├── launcher_account2.bat
├── subfolder/
│   ├── old_launcher.bat
│   └── broken_launcher.bat
└── accounts/
    ├── main_account.bat
    └── alt_accounts.bat
```

**Sample batch file content:**
```bat
@echo off
rem Owner: TestUser
rem Description: Main farming account
start elementclient.exe startbypatcher user:testuser1 pwd:testpass123 role:Warrior
```

### Story 1.4: Create Mock Process Manager
**As a** developer  
**I want to** mock Windows process management  
**So that** I can test process tracking on macOS  
**Acceptance Criteria:**
- Create MockProcessManager class
- Simulate process launching (return fake PIDs)
- Track "running" processes in memory
- Implement mock kill functionality
- Add random process termination for testing

---

## Epic 2: Data Layer Testing

### Story 2.1: Test Account Model
**As a** developer  
**I want to** test Account data model  
**So that** data integrity is maintained  
**Test Cases:**
- Account creation with valid data
- Account creation with invalid data
- Serialization to JSON
- Deserialization from JSON
- Field validation (login patterns, length limits)
- Password masking functionality

### Story 2.2: Test Account Storage
**As a** developer  
**I want to** test account persistence  
**So that** data is reliably saved and loaded  
**Test Cases:**
- Save single account
- Save multiple accounts
- Load accounts from file
- Handle missing file
- Handle corrupted JSON
- Test file permissions errors
- Concurrent write protection
- Backup creation on corruption

### Story 2.3: Test Settings Manager
**As a** developer  
**I want to** test application settings  
**So that** preferences work correctly  
**Test Cases:**
- Default settings initialization
- Save settings changes
- Load existing settings
- Validate game folder path
- Handle invalid settings file
- Migration from old versions
- Platform-specific path handling

---

## Epic 3: IPC Communication Testing

### Story 3.1: Test Main Process Handlers
**As a** developer  
**I want to** test all IPC handlers in main process  
**So that** communication is reliable  
**Test Cases:**
- account:create handler
- account:update handler  
- account:delete handler
- account:list handler
- game:launch handler
- game:terminate handler
- settings:get handler
- settings:update handler
- Error handling for each handler

### Story 3.2: Test Renderer IPC Calls
**As a** developer  
**I want to** test renderer-side IPC invocations  
**So that** UI correctly communicates with main process  
**Test Cases:**
- Mock IPC responses
- Test error propagation
- Test timeout handling
- Validate parameter passing
- Test concurrent IPC calls

---

## Epic 4: UI Component Testing

### Story 4.1: Test Account Table Component
**As a** developer  
**I want to** test the account table functionality  
**So that** users can interact with accounts correctly  
**Test Cases:**
- Render empty state
- Render with accounts
- Select single account
- Select multiple accounts
- Select all functionality
- Click to copy login
- Click to copy password
- Show/hide password
- Sort by columns
- Filter accounts
- Test with 100+ accounts

### Story 4.2: Test Account Dialog
**As a** developer  
**I want to** test account creation/editing dialog  
**So that** data entry works properly  
**Test Cases:**
- Open in create mode
- Open in edit mode
- Field validation on blur
- Form submission validation
- Duplicate login detection
- Cancel without saving
- Save with valid data
- Character limit enforcement

### Story 4.3: Test Settings Dialog  
**As a** developer  
**I want to** test settings configuration  
**So that** app configuration works correctly  
**Test Cases:**
- Load current settings
- Browse for game folder
- Validate selected folder
- Test launch delay slider
- Save settings
- Cancel without saving
- Restore defaults

### Story 4.4: Test Toolbar Actions
**As a** developer  
**I want to** test all toolbar buttons  
**So that** actions work as expected  
**Test Cases:**
- Add Account button
- Launch Selected (none selected)
- Launch Selected (single)
- Launch Selected (multiple)
- Close Selected
- Import functionality
- Export functionality
- Settings button

---

## Epic 5: Game Launching Tests

### Story 5.1: Test Batch File Generation
**As a** developer  
**I want to** test batch file creation  
**So that** game launching works correctly  
**Test Cases:**
- Generate basic batch file
- Include special characters in password
- Include unicode in metadata
- Test CP1251 encoding
- Verify file permissions
- Test path with spaces
- Maximum length values

### Story 5.2: Test Launch Queue System
**As a** developer  
**I want to** test sequential launching  
**So that** multiple launches work properly  
**Test Cases:**
- Queue single launch
- Queue multiple launches
- Cancel queue
- Launch delay timing
- Error during launch
- Queue persistence
- Maximum queue size

### Story 5.3: Test Process Monitoring
**As a** developer  
**I want to** test process tracking  
**So that** running status is accurate  
**Test Cases:**
- Detect launched process
- Detect terminated process
- Handle process not found
- Multiple processes same account
- Cleanup dead processes
- Memory leak prevention

---

## Epic 6: WebView Testing

### Story 6.1: Create Mock WebView
**As a** developer  
**I want to** mock WebView functionality  
**So that** I can test login features on macOS  
**Mock Implementation:**
- Create MockWebView class
- Simulate page navigation
- Mock DOM manipulation
- Trigger load/error events
- Mock form field detection

### Story 6.2: Test WebView Auto-Fill
**As a** developer  
**I want to** test credential auto-fill  
**So that** login assistance works correctly  
**Test Cases:**
- Find username field by ID
- Find username field by name
- Find password field
- Fill fields with values
- Handle missing fields
- Handle dynamic forms
- Verify no auto-submit

### Story 6.3: Test WebView Window Management
**As a** developer  
**I want to** test WebView window lifecycle  
**So that** windows are managed properly  
**Test Cases:**
- Create new WebView window
- Track multiple windows
- Close specific window
- Handle window crashes
- Session isolation
- Cookie management

---

## Epic 7: Import/Export Testing

### Story 7.1: Test Batch File Scanning
**As a** developer  
**I want to** test batch file discovery  
**So that** import works correctly  
**Test Cases:**
- Scan mock game folder
- Parse valid batch files
- Skip invalid files
- Handle permission errors
- Test recursive scanning
- Large folder performance
- Unicode in paths

### Story 7.2: Test Import Functionality
**As a** developer  
**I want to** test account importing  
**So that** data migration works  
**Test Cases:**
- Import from JSON
- Import from CSV
- Handle malformed data
- Duplicate handling
- Partial import on error
- Progress reporting
- Rollback on failure

### Story 7.3: Test Export Functionality
**As a** developer  
**I want to** test account exporting  
**So that** backups work correctly  
**Test Cases:**
- Export all accounts
- Export selected accounts
- JSON format validation
- CSV format validation
- File write permissions
- Export with special characters
- Large dataset performance

---

## Epic 8: Integration Testing

### Story 8.1: Test Complete Account Lifecycle
**As a** developer  
**I want to** test full account workflows  
**So that** end-to-end functionality works  
**Test Scenarios:**
- Create account → Launch → Edit → Delete
- Import accounts → Launch multiple → Export
- Batch operations on selected accounts
- Settings change → Launch behavior

### Story 8.2: Test Error Recovery
**As a** developer  
**I want to** test error handling scenarios  
**So that** app recovers gracefully  
**Test Scenarios:**
- Corrupt data file recovery
- Missing game executable
- Process launch failures
- Network errors in WebView
- Disk full during save
- Permission denied errors

### Story 8.3: Test Platform-Specific Features
**As a** developer  
**I want to** test platform differences  
**So that** mocks work correctly  
**Test Cases:**
- Path separator handling
- File encoding differences
- Process management mocks
- WebView behavior mocks
- File system case sensitivity

---

## Epic 9: Performance Testing

### Story 9.1: Test Large Data Sets
**As a** developer  
**I want to** test with many accounts  
**So that** performance remains acceptable  
**Test Cases:**
- Load 1000 accounts
- Render 1000 rows
- Select all performance
- Search/filter performance
- Launch queue with 50 items
- Import 500 accounts

### Story 9.2: Test Memory Usage
**As a** developer  
**I want to** monitor memory consumption  
**So that** there are no memory leaks  
**Test Cases:**
- Long-running process monitoring
- Repeated dialog open/close
- WebView creation/destruction
- Large file operations
- Event listener cleanup

---

## Epic 10: E2E Test Scenarios

### Story 10.1: Test New User Experience
**As a** developer  
**I want to** test first-time user flow  
**So that** onboarding works smoothly  
**Test Flow:**
1. Launch app (no data)
2. See welcome screen
3. Open settings
4. Select mock game folder
5. Add first account
6. Launch account
7. Verify process tracking

### Story 10.2: Test Power User Workflows
**As a** developer  
**I want to** test advanced features  
**So that** power users are satisfied  
**Test Flows:**
- Keyboard shortcuts
- Bulk operations
- Quick account switching
- Import/export workflows
- Multi-window WebView

### Story 10.3: Test Migration Scenarios
**As a** developer  
**I want to** test Python version migration  
**So that** users can switch versions  
**Test Cases:**
- Import Python version batch files
- Verify account data integrity
- Settings migration
- Handle version differences

---

## Test Data Generators

### Account Data Generator
```javascript
function generateMockAccount(index) {
  return {
    login: `testuser${index}`,
    password: `pass${index}@123`,
    character_name: `Character${index}`,
    description: `Test account ${index}`,
    owner: ['Alice', 'Bob', 'Charlie'][index % 3],
    server: index % 2 === 0 ? 'Main' : 'PvP'
  };
}
```

### Batch File Generator
```javascript
function generateMockBatchFile(account, encoding = 'utf8') {
  const content = `@echo off
rem Owner: ${account.owner}
rem Description: ${account.description}
start elementclient.exe startbypatcher user:${account.login} pwd:${account.password} role:${account.character_name}
`;
  return encoding === 'cp1251' ? 
    iconv.encode(content, 'cp1251') : 
    Buffer.from(content);
}
```

### Process Mock Generator
```javascript
class MockProcess {
  constructor(pid, name, login) {
    this.pid = pid;
    this.name = name;
    this.login = login;
    this.running = true;
    this.startTime = Date.now();
  }
  
  kill() {
    this.running = false;
    return true;
  }
}
```

---

## Platform-Specific Mocking Strategy

### Windows Mocks on macOS
1. **File Paths**: Convert Windows paths to POSIX
2. **Process Names**: Mock 'elementclient.exe' as 'mockgame'
3. **Batch Files**: Create executable shell scripts
4. **Registry**: Mock with JSON file
5. **File Encoding**: Use iconv-lite for CP1251

### Environment Variables for Testing
```bash
# Force mock mode even on Windows
FORCE_MOCK_MODE=true

# Set mock game directory
MOCK_GAME_DIR=/path/to/mock-data/game-folder

# Enable verbose test logging
TEST_LOG_LEVEL=debug

# Disable actual process launching
DISABLE_REAL_LAUNCH=true
```

---

## CI/CD Testing Strategy

### Local Development (macOS)
```bash
npm test                    # Run all tests with mocks
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:e2e:mock      # E2E with mocks
```

### CI Pipeline (Windows)
```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests
npm run test:e2e:real      # E2E with real game
```

### Coverage Requirements
- Unit Tests: 90% coverage
- Integration Tests: 80% coverage
- E2E Tests: Critical paths only
- Platform-specific code: 100% coverage