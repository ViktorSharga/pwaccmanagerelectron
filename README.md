# Perfect World Account Manager

A modern Electron-based account manager for Perfect World games with embedded WebView login functionality.

## Features

- **Account Management**: Store and manage multiple game accounts securely
- **Embedded WebView**: Log in to accounts using integrated browser sessions
- **Game Launching**: Launch games with automatic credential injection
- **Process Monitoring**: Track running game instances with real-time status updates
- **Import/Export**: Support for JSON, CSV, and legacy batch file formats
- **Modern UI**: Material Design inspired interface with responsive layout
- **Cross-Platform**: Built with Electron for Windows, macOS, and Linux support

## Getting Started

### Prerequisites

- Node.js 16 or higher
- npm or yarn package manager

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd accmanagerElectron
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Start the application:
   ```bash
   npm start
   ```

### Development

For development with hot reload:
```bash
npm run watch
```

Then in another terminal:
```bash
npm run dev
```

## Usage

### First Time Setup

1. **Configure Game Path**: Go to Settings and select your Perfect World game folder (should contain `element/elementclient.exe`)
2. **Add Accounts**: Click the "+" button to add your first account
3. **Launch Games**: Select accounts and click the play button to launch

### Features Overview

#### Account Table
- **Click to copy**: Click on login/password fields to copy to clipboard
- **Status indicators**: See which accounts are currently running
- **Bulk operations**: Select multiple accounts for batch operations

#### WebView Integration
- **Secure login**: Each account gets its own isolated browser session
- **Auto-fill**: Credentials are automatically filled in login forms
- **Session management**: Cookies and data are cleared between different accounts

#### Import/Export
- **Batch file scanning**: Import from existing `.bat` files
- **Multiple formats**: Export to JSON or CSV for backup
- **Duplicate detection**: Prevent duplicate accounts during import

#### Context Menu
- Right-click on any account row for quick actions:
  - Launch/Close game
  - Open WebView
  - Edit/Delete account
  - Copy credentials

## Configuration

### Settings
- **Game Path**: Path to your Perfect World installation
- **Launch Delay**: Delay between launching multiple accounts (1-30 seconds)

### Data Storage
- **Accounts**: Stored in `%APPDATA%/perfect-world-account-manager/accounts.json`
- **Settings**: Managed by electron-store in app's config directory

## Keyboard Shortcuts

- `Ctrl+N`: Add new account
- `Ctrl+,`: Open settings
- `Ctrl+I`: Import accounts
- `Ctrl+E`: Export accounts
- `Ctrl+R`: Refresh account list
- `Delete`: Delete selected accounts
- `Escape`: Close WebView (when focused)

## Building for Distribution

Create a distributable package:
```bash
npm run dist
```

This will create installers in the `dist-electron` directory.

## Security Features

- **Context Isolation**: Renderer process is sandboxed
- **No Node Integration**: Secure communication via IPC
- **Session Isolation**: Each WebView runs in its own partition
- **Input Validation**: All user inputs are validated
- **Secure Storage**: Sensitive data is stored locally only

## Troubleshooting

### Game Won't Launch
- Verify game path points to correct Perfect World installation
- Check that `elementclient.exe` exists in `game-path/element/`
- Ensure accounts have valid login credentials

### WebView Issues
- Clear browser data in Settings if login fails
- Check internet connection
- Verify Perfect World login page is accessible

### Performance
- For 100+ accounts, virtual scrolling is automatically enabled
- Close unused WebView instances to free memory
- Regular cleanup of temporary batch files

## Development Architecture

### Project Structure
```
src/
├── main/           # Main Electron process
│   ├── ipc/        # IPC handlers
│   └── services/   # Business logic services
├── renderer/       # Renderer process (UI)
│   └── components/ # UI components
└── shared/         # Shared types and utilities
```

### Key Services
- **AccountStorage**: Manages account persistence
- **SettingsManager**: Application configuration
- **GameProcessManager**: Game launching and monitoring
- **WebViewManager**: Browser session management
- **BatchFileScanner**: Legacy import functionality

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This application is not affiliated with Perfect World Entertainment. Use at your own risk and in accordance with the game's terms of service.