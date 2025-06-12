# Perfect World Account Manager - Electron Migration Plan

## Project Overview
Migration of Perfect World Account Manager from Python/PySide6 to Electron with enhanced UI capabilities and embedded WebView for account login.

## Technical Stack
- **Framework**: Electron (latest stable)
- **Frontend**: HTML5, CSS3, JavaScript/TypeScript
- **UI Library**: React or Vue.js (recommended for component management)
- **Process Management**: Node.js child_process
- **Data Storage**: electron-store for settings, JSON files for accounts
- **WebView**: Electron's webview tag or BrowserView

---

## Epic 1: Project Setup and Architecture

### Story 1.1: Initialize Electron Project
**As a** developer  
**I want to** set up a new Electron project with TypeScript support  
**So that** I have a solid foundation for the application  
**Acceptance Criteria:**
- Create new Electron app with TypeScript template
- Configure electron-builder for Windows packaging
- Set up development environment with hot reload
- Configure ESLint and Prettier

### Story 1.2: Define Project Structure
**As a** developer  
**I want to** establish the project folder structure  
**So that** the codebase is organized and maintainable  
**Acceptance Criteria:**
- Create folders: src/main, src/renderer, src/shared, src/types
- Set up main process entry point
- Set up renderer process structure
- Configure TypeScript paths for clean imports

### Story 1.3: Set Up IPC Communication
**As a** developer  
**I want to** implement secure IPC communication between main and renderer  
**So that** the app can safely execute system operations  
**Acceptance Criteria:**
- Create IPC handlers in main process
- Create IPC invokers in renderer
- Implement context bridge for security
- Add TypeScript types for all IPC channels

---

## Epic 2: Data Management

### Story 2.1: Implement Account Data Model
**As a** developer  
**I want to** create TypeScript interfaces for account data  
**So that** account information is strongly typed  
**Acceptance Criteria:**
- Define Account interface with all fields
- Create validation functions
- Implement serialization/deserialization methods

### Story 2.2: Create Account Storage Service
**As a** developer  
**I want to** implement account data persistence  
**So that** accounts are saved between sessions  
**Acceptance Criteria:**
- Store accounts in %APPDATA%/PerfectWorldAccountManager/accounts.json
- Implement CRUD operations for accounts
- Add file watchers for external changes
- Handle file corruption gracefully

### Story 2.3: Implement Settings Manager
**As a** developer  
**I want to** create a settings storage system  
**So that** user preferences persist  
**Acceptance Criteria:**
- Use electron-store for settings
- Store: game path, launch delay, window bounds
- Validate game folder (check for elementclient.exe)
- Provide default values

---

## Epic 3: Main Window UI

### Story 3.1: Create Main Window Layout
**As a** developer  
**I want to** implement the main window with toolbar and table  
**So that** users can see and manage their accounts  
**Acceptance Criteria:**
- Create toolbar with all action buttons
- Implement responsive account table
- Add status bar with account count
- Match the original Material Design theme

### Story 3.2: Implement Account Table
**As a** developer  
**I want to** create a feature-rich account table  
**So that** users can view and interact with accounts  
**Acceptance Criteria:**
- Display all account fields in columns
- Add checkbox selection with select-all
- Implement click-to-copy for login/password
- Add action buttons per row (Play, Close, Menu)
- Show running status indicators

### Story 3.3: Create Welcome Screen
**As a** developer  
**I want to** show a welcome screen when no accounts exist  
**So that** new users know how to start  
**Acceptance Criteria:**
- Display welcome message and instructions
- Add "Add First Account" button
- Add "Open Settings" button
- Hide when accounts exist

---

## Epic 4: Dialog Windows

### Story 4.1: Create Account Dialog
**As a** developer  
**I want to** implement add/edit account dialog  
**So that** users can manage account details  
**Acceptance Criteria:**
- Create form with all account fields
- Add real-time validation
- Check for duplicate logins
- Support both add and edit modes

### Story 4.2: Create Settings Dialog
**As a** developer  
**I want to** implement settings configuration dialog  
**So that** users can configure the application  
**Acceptance Criteria:**
- Add game folder selection with file browser
- Create launch delay slider (1-30 seconds)
- Implement save/cancel functionality
- Validate settings before saving

### Story 4.3: Implement Confirmation Dialogs
**As a** developer  
**I want to** create reusable confirmation dialogs  
**So that** destructive actions require confirmation  
**Acceptance Criteria:**
- Create generic confirmation component
- Use for account deletion
- Use for closing running accounts
- Support custom messages

---

## Epic 5: Game Launching

### Story 5.1: Create Batch File Generator
**As a** developer  
**I want to** generate batch files for game launching  
**So that** the game can be started with credentials  
**Acceptance Criteria:**
- Generate .bat files with proper format
- Encode in CP1251 for compatibility
- Include metadata as comments
- Store in temporary directory

### Story 5.2: Implement Game Process Manager
**As a** developer  
**I want to** manage game processes  
**So that** I can track running accounts  
**Acceptance Criteria:**
- Launch game via Node.js child_process
- Track processes by PID
- Map login names to PIDs
- Detect elementclient.exe processes

### Story 5.3: Create Launch Queue System
**As a** developer  
**I want to** implement sequential launching with delays  
**So that** multiple accounts don't overload the system  
**Acceptance Criteria:**
- Queue multiple launch requests
- Add configurable delay between launches
- Show progress in UI
- Allow queue cancellation

### Story 5.4: Implement Process Monitoring
**As a** developer  
**I want to** monitor running game processes  
**So that** the UI shows accurate status  
**Acceptance Criteria:**
- Check process status every 5 seconds
- Update UI when processes end
- Clean up dead process references
- Handle process termination

---

## Epic 6: WebView Integration

### Story 6.1: Create WebView Component
**As a** developer  
**I want to** implement an embedded WebView  
**So that** users can log in without external browser  
**Acceptance Criteria:**
- Create WebView window/component
- Configure for Perfect World login page
- Set appropriate security settings
- Handle navigation events

### Story 6.2: Implement Auto-Fill Functionality
**As a** developer  
**I want to** auto-fill login credentials in WebView  
**So that** users don't need to type them  
**Acceptance Criteria:**
- Detect login form fields
- Fill username and password fields
- Do NOT auto-submit the form
- Handle different page structures

### Story 6.3: Create WebView Window Management
**As a** developer  
**I want to** manage WebView windows properly  
**So that** each account has its own session  
**Acceptance Criteria:**
- Create separate WebView for each account
- Use partition for session isolation
- Clear cookies between different accounts
- Handle window closing

### Story 6.4: Add WebView Error Handling
**As a** developer  
**I want to** handle WebView errors gracefully  
**So that** users know when something goes wrong  
**Acceptance Criteria:**
- Handle page load errors
- Show user-friendly error messages
- Provide retry functionality
- Log errors for debugging

---

## Epic 7: Import/Export Features

### Story 7.1: Implement Batch File Scanner
**As a** developer  
**I want to** scan folders for existing batch files  
**So that** users can import legacy accounts  
**Acceptance Criteria:**
- Recursively scan selected folder
- Parse .bat files for account data
- Support CP1251 and UTF-8 encoding
- Show import preview

### Story 7.2: Create Export Functionality
**As a** developer  
**I want to** export accounts to various formats  
**So that** users can backup their data  
**Acceptance Criteria:**
- Export to JSON format
- Export to CSV format
- Allow selecting specific accounts
- Choose export location

### Story 7.3: Create Import Functionality
**As a** developer  
**I want to** import accounts from files  
**So that** users can restore backups  
**Acceptance Criteria:**
- Import from JSON format
- Import from CSV format
- Validate imported data
- Handle duplicates appropriately

---

## Epic 8: Context Menus and Shortcuts

### Story 8.1: Implement Table Context Menu
**As a** developer  
**I want to** add right-click context menu to table  
**So that** users have quick access to actions  
**Acceptance Criteria:**
- Create context menu for account rows
- Include: Edit, Delete, Launch, Copy Login
- Show appropriate options based on state
- Position menu at cursor

### Story 8.2: Add Keyboard Shortcuts
**As a** developer  
**I want to** implement keyboard shortcuts  
**So that** power users can work efficiently  
**Acceptance Criteria:**
- Ctrl+A: Add account
- Ctrl+L: Launch selected
- Delete: Delete selected
- Ctrl+C/V: Copy/Paste in table

### Story 8.3: Implement Application Menu
**As a** developer  
**I want to** create application menu bar  
**So that** users have standard menu access  
**Acceptance Criteria:**
- File menu: Import, Export, Exit
- Edit menu: Add Account, Settings
- View menu: Refresh
- Help menu: About

---

## Epic 9: Performance and Polish

### Story 9.1: Optimize Table Rendering
**As a** developer  
**I want to** implement virtual scrolling for large lists  
**So that** the app remains responsive  
**Acceptance Criteria:**
- Use virtual scrolling for 100+ accounts
- Maintain smooth scrolling
- Keep selection state during scroll
- Update only visible rows

### Story 9.2: Add Loading States
**As a** developer  
**I want to** show loading indicators  
**So that** users know when operations are in progress  
**Acceptance Criteria:**
- Show spinner during file operations
- Indicate launch queue progress
- Show WebView loading state
- Disable buttons during operations

### Story 9.3: Implement Error Boundaries
**As a** developer  
**I want to** handle errors gracefully  
**So that** the app doesn't crash  
**Acceptance Criteria:**
- Catch and log all errors
- Show user-friendly error messages
- Provide recovery options
- Send error reports (optional)

---

## Epic 10: Testing and Distribution

### Story 10.1: Create Unit Tests
**As a** developer  
**I want to** write unit tests for core logic  
**So that** the app is reliable  
**Acceptance Criteria:**
- Test account CRUD operations
- Test batch file generation
- Test validation functions
- Achieve 80% code coverage

### Story 10.2: Implement E2E Tests
**As a** developer  
**I want to** create end-to-end tests  
**So that** user workflows are verified  
**Acceptance Criteria:**
- Test account creation flow
- Test game launching
- Test import/export
- Use Spectron or Playwright

### Story 10.3: Configure Auto-Updates
**As a** developer  
**I want to** implement automatic updates  
**So that** users get new features easily  
**Acceptance Criteria:**
- Set up electron-updater
- Configure update server
- Add update notifications
- Allow manual update checks

### Story 10.4: Create Installer
**As a** developer  
**I want to** build Windows installer  
**So that** users can easily install the app  
**Acceptance Criteria:**
- Configure electron-builder for NSIS
- Add start menu shortcuts
- Set up uninstaller
- Sign the executable

---

## Implementation Notes

### Priority Order
1. Epic 1-2: Foundation (Week 1)
2. Epic 3-4: Basic UI (Week 2)
3. Epic 5: Game Launching (Week 3)
4. Epic 6: WebView Integration (Week 4)
5. Epic 7-8: Additional Features (Week 5)
6. Epic 9-10: Polish and Release (Week 6)

### Key Differences from Python Version
- WebView replaces external browser launching
- Better UI responsiveness with web technologies
- Native Windows integration through Electron
- Improved error handling and recovery
- Modern async/await patterns throughout

### Security Considerations
- Use context isolation in Electron
- Validate all IPC inputs
- Sanitize file paths
- Use secure WebView settings
- Store sensitive data appropriately

### Migration Path
1. Export accounts from Python version
2. Install Electron version
3. Import accounts
4. Verify all features work
5. Uninstall Python version (optional)