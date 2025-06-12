import { BrowserWindow, BrowserView, session } from 'electron';
import { Account } from '../../shared/types';
import { mainWindow } from '../main';

export class WebViewManager {
  private webViews = new Map<string, BrowserView>();
  private loginUrl = 'https://passport.pwrd.com/mini_login.jsp';

  async openWebViewForAccount(account: Account): Promise<void> {
    const existingView = this.webViews.get(account.id);
    if (existingView) {
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

    webView.webContents.on('did-finish-load', () => {
      this.autoFillCredentials(webView, account);
    });

    webView.webContents.on('dom-ready', () => {
      this.autoFillCredentials(webView, account);
    });

    webView.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        this.closeWebView(account.id);
      }
    });

    await webView.webContents.loadURL(this.loginUrl);
  }

  private async autoFillCredentials(webView: BrowserView, account: Account): Promise<void> {
    try {
      const fillScript = `
        (function() {
          const usernameSelectors = [
            'input[name="username"]',
            'input[name="user"]',
            'input[name="login"]',
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
          
          for (const selector of usernameSelectors) {
            usernameField = document.querySelector(selector);
            if (usernameField) break;
          }
          
          for (const selector of passwordSelectors) {
            passwordField = document.querySelector(selector);
            if (passwordField) break;
          }
          
          if (usernameField && passwordField) {
            usernameField.value = '${account.login}';
            passwordField.value = '${account.password}';
            
            usernameField.dispatchEvent(new Event('input', { bubbles: true }));
            passwordField.dispatchEvent(new Event('input', { bubbles: true }));
            usernameField.dispatchEvent(new Event('change', { bubbles: true }));
            passwordField.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, filled: true };
          }
          
          return { success: true, filled: false };
        })();
      `;

      await webView.webContents.executeJavaScript(fillScript);
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