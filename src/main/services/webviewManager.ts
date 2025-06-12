import { BrowserWindow, BrowserView, session } from 'electron';
import { Account } from '../../shared/types';
import { mainWindow } from '../main';

export class WebViewManager {
  private webViews = new Map<string, BrowserView>();
  private loginUrl = 'https://asgard.pw/lk/';

  async openWebViewForAccount(account: Account): Promise<void> {
    try {
      console.log(`Opening WebView for account: ${account.login}`);
      
      const existingView = this.webViews.get(account.id);
      if (existingView) {
        // Check if the existing WebView is still valid
        if (existingView.webContents && !existingView.webContents.isDestroyed()) {
          console.log('WebView already exists and is valid, focusing...');
          this.focusWebView(account.id);
          return;
        } else {
          console.log('WebView exists but is destroyed, removing and creating new one...');
          this.webViews.delete(account.id);
        }
      }

      if (!mainWindow) {
        throw new Error('Main window not available');
      }

      const partition = `webview_${account.id}`;
      const ses = session.fromPartition(partition);
      
      await ses.clearStorageData();

      const webView = new BrowserView({
        webPreferences: {
          partition: partition,
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          experimentalFeatures: false,
        },
      });

      mainWindow.setBrowserView(webView);

      const bounds = mainWindow.getBounds();
      // Leave space at the top for a control bar
      webView.setBounds({
        x: 0,
        y: 40,
        width: bounds.width,
        height: bounds.height - 80,
      });

      webView.setAutoResize({
        width: true,
        height: true,
      });

      this.webViews.set(account.id, webView);

      // Add error handling for webContents
      webView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`WebView failed to load: ${errorCode} - ${errorDescription} for URL: ${validatedURL}`);
      });

      webView.webContents.on('did-finish-load', () => {
        console.log('WebView finished loading, attempting to auto-fill credentials...');
        this.addControlBar(webView, account);
        this.autoFillCredentials(webView, account);
      });

      webView.webContents.on('dom-ready', () => {
        console.log('WebView DOM ready, attempting to auto-fill credentials...');
        // Add control bar first, then auto-fill
        this.addControlBar(webView, account);
        setTimeout(() => {
          this.autoFillCredentials(webView, account);
        }, 500);
      });

      webView.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
          this.closeWebView(account.id);
        }
        // Add Ctrl+W to close WebView (common browser shortcut)
        if (input.key === 'w' && (input.control || input.meta)) {
          event.preventDefault();
          this.closeWebView(account.id);
        }
      });

      // Listen for console messages to handle close requests
      webView.webContents.on('console-message', (event, level, message) => {
        if (message.includes(`WEBVIEW_CLOSE_REQUESTED_${account.id}`)) {
          console.log('Closing WebView via control bar button');
          this.closeWebView(account.id);
        }
      });

      console.log(`Loading URL: ${this.loginUrl}`);
      await webView.webContents.loadURL(this.loginUrl);
      console.log('WebView URL load initiated successfully');
    } catch (error) {
      console.error('Error opening WebView:', error);
      throw error;
    }
  }

  private async addControlBar(webView: BrowserView, account: Account): Promise<void> {
    try {
      const controlBarScript = `
        (function() {
          // Remove existing control bar if present
          const existingBar = document.getElementById('account-manager-control-bar');
          if (existingBar) {
            existingBar.remove();
          }
          
          // Create control bar
          const controlBar = document.createElement('div');
          controlBar.id = 'account-manager-control-bar';
          controlBar.style.cssText = \`
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 40px;
            background: linear-gradient(135deg, #1976d2, #1565c0);
            color: white;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 15px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            user-select: none;
          \`;
          
          // Account info
          const accountInfo = document.createElement('div');
          accountInfo.style.cssText = \`
            display: flex;
            align-items: center;
            gap: 10px;
          \`;
          accountInfo.innerHTML = \`
            <span>🌐</span>
            <span>Account: <strong>${account.login.replace(/'/g, "&apos;")}</strong></span>
          \`;
          
          // Controls
          const controls = document.createElement('div');
          controls.style.cssText = \`
            display: flex;
            align-items: center;
            gap: 10px;
          \`;
          
          // Close button
          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '✕ Close';
          closeBtn.style.cssText = \`
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
          \`;
          closeBtn.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.3)'; };
          closeBtn.onmouseout = function() { this.style.background = 'rgba(255,255,255,0.2)'; };
          closeBtn.onclick = function() {
            // Send message to close WebView
            console.log('Close button clicked');
            // Use console.log with a specific marker that we can listen for
            console.log('WEBVIEW_CLOSE_REQUESTED_${account.id}');
          };
          
          // Help text
          const helpText = document.createElement('span');
          helpText.textContent = 'Press ESC or Ctrl+W to close';
          helpText.style.cssText = \`
            font-size: 11px;
            opacity: 0.8;
          \`;
          
          controls.appendChild(helpText);
          controls.appendChild(closeBtn);
          controlBar.appendChild(accountInfo);
          controlBar.appendChild(controls);
          
          // Add to page
          document.body.appendChild(controlBar);
          
          // Adjust body padding to account for control bar
          document.body.style.paddingTop = '40px';
          
          console.log('Control bar added successfully');
        })();
      `;

      await webView.webContents.executeJavaScript(controlBarScript);
    } catch (error) {
      console.error('Failed to add control bar:', error);
    }
  }

  private async autoFillCredentials(webView: BrowserView, account: Account): Promise<void> {
    try {
      // Wait a bit for the page to fully load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const fillScript = `
        (function() {
          try {
            console.log('Auto-fill script running...');
            
            // Specific selectors for Asgard website
            const usernameSelectors = [
              'input[name="username"]',
              'input[name="user"]',
              'input[name="login"]',
              'input[type="text"][maxlength="20"]',
              'input[type="text"]',
              '#username',
              '#user',
              '#login'
            ];
            
            const passwordSelectors = [
              'input[name="password"]',
              'input[name="pwd"]',
              'input[type="password"]',
              '#password',
              '#pwd'
            ];
            
            let usernameField = null;
            let passwordField = null;
            
            // Find username field
            for (const selector of usernameSelectors) {
              const field = document.querySelector(selector);
              if (field && field.offsetParent !== null) { // Check if visible
                usernameField = field;
                console.log('Found username field with selector:', selector);
                break;
              }
            }
            
            // Find password field
            for (const selector of passwordSelectors) {
              const field = document.querySelector(selector);
              if (field && field.offsetParent !== null) { // Check if visible
                passwordField = field;
                console.log('Found password field with selector:', selector);
                break;
              }
            }
            
            if (usernameField && passwordField) {
              // Clear existing values
              usernameField.value = '';
              passwordField.value = '';
              
              // Set new values
              usernameField.value = '${account.login.replace(/'/g, "\\'")}';
              passwordField.value = '${account.password.replace(/'/g, "\\'")}';
              
              // Trigger events to ensure the website recognizes the changes
              const events = ['input', 'change', 'keyup', 'blur'];
              events.forEach(eventType => {
                usernameField.dispatchEvent(new Event(eventType, { bubbles: true }));
                passwordField.dispatchEvent(new Event(eventType, { bubbles: true }));
              });
              
              console.log('Successfully filled credentials');
              return { success: true, filled: true, username: usernameField.value.length, password: passwordField.value.length };
            } else {
              console.log('Could not find both username and password fields');
              console.log('Username field found:', !!usernameField);
              console.log('Password field found:', !!passwordField);
              
              // Log all input fields for debugging
              const allInputs = document.querySelectorAll('input');
              console.log('All input fields on page:', Array.from(allInputs).map(input => ({
                type: input.type,
                name: input.name,
                id: input.id,
                className: input.className
              })));
              
              return { success: true, filled: false, reason: 'Fields not found' };
            }
          } catch (error) {
            console.error('Error in auto-fill script:', error);
            return { success: false, error: error.message };
          }
        })();
      `;

      const result = await webView.webContents.executeJavaScript(fillScript);
      console.log('Auto-fill result:', result);
    } catch (error) {
      console.error('Failed to auto-fill credentials:', error);
    }
  }

  focusWebView(accountId: string): void {
    const webView = this.webViews.get(accountId);
    if (webView && mainWindow) {
      try {
        // Ensure the WebView is properly attached to the main window
        mainWindow.setBrowserView(webView);
        
        // Re-position the WebView in case window was resized
        const bounds = mainWindow.getBounds();
        webView.setBounds({
          x: 0,
          y: 40,
          width: bounds.width,
          height: bounds.height - 80,
        });
        
        // Focus the WebView
        if (webView.webContents && !webView.webContents.isDestroyed()) {
          webView.webContents.focus();
          console.log(`WebView for account ${accountId} focused successfully`);
        }
      } catch (error) {
        console.error('Error focusing WebView:', error);
        // If focusing fails, remove the invalid WebView
        this.webViews.delete(accountId);
      }
    }
  }

  closeWebView(accountId: string): void {
    const webView = this.webViews.get(accountId);
    if (webView && mainWindow) {
      try {
        // Remove all event listeners first to prevent memory leaks
        if (webView.webContents && !webView.webContents.isDestroyed()) {
          webView.webContents.removeAllListeners();
          // Close the webContents to free memory
          webView.webContents.close();
        }
        
        // Remove the BrowserView from the main window
        mainWindow.removeBrowserView(webView);
        
        // Remove from our tracking
        this.webViews.delete(accountId);
        
        // If no more webviews, clear the browser view
        if (this.webViews.size === 0) {
          mainWindow.setBrowserView(null);
        }
        
        console.log(`WebView for account ${accountId} closed successfully`);
      } catch (error) {
        console.error('Error closing WebView:', error);
        // Still remove from tracking even if cleanup failed
        this.webViews.delete(accountId);
      }
    }
  }

  closeAllWebViews(): void {
    for (const accountId of this.webViews.keys()) {
      this.closeWebView(accountId);
    }
  }

  getActiveWebViews(): string[] {
    return Array.from(this.webViews.keys());
  }

  hasWebView(accountId: string): boolean {
    return this.webViews.has(accountId);
  }

  resizeWebViews(): void {
    if (!mainWindow) return;

    const bounds = mainWindow.getBounds();
    for (const webView of this.webViews.values()) {
      webView.setBounds({
        x: 0,
        y: 40,
        width: bounds.width,
        height: bounds.height - 80,
      });
    }
  }

  destroy(): void {
    // Clean up all webviews and clear memory
    this.closeAllWebViews();
    this.webViews.clear();
  }
}