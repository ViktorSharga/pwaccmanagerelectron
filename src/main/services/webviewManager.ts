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
        console.log('WebView already exists, focusing...');
        this.focusWebView(account.id);
        return;
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
      webView.setBounds({
        x: 0,
        y: 80,
        width: bounds.width,
        height: bounds.height - 120,
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
        this.autoFillCredentials(webView, account);
      });

      webView.webContents.on('dom-ready', () => {
        console.log('WebView DOM ready, attempting to auto-fill credentials...');
        // Add a delay before auto-fill to ensure page is fully rendered
        setTimeout(() => {
          this.autoFillCredentials(webView, account);
        }, 500);
      });

      webView.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
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
      mainWindow.setBrowserView(webView);
      webView.webContents.focus();
    }
  }

  closeWebView(accountId: string): void {
    const webView = this.webViews.get(accountId);
    if (webView && mainWindow) {
      mainWindow.removeBrowserView(webView);
      (webView as any).destroy();
      this.webViews.delete(accountId);
      
      if (this.webViews.size === 0) {
        mainWindow.setBrowserView(null);
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
        y: 80,
        width: bounds.width,
        height: bounds.height - 120,
      });
    }
  }
}