import { Account, Settings } from '../shared/types';
import { AccountTable } from './components/accountTable';
import { DialogManager } from './components/dialogManager';
import { ContextMenu } from './components/contextMenu';

class App {
  private accountTable: AccountTable;
  private dialogManager: DialogManager;
  private contextMenu: ContextMenu;
  private accounts: Account[] = [];
  private settings: Settings | null = null;

  constructor() {
    this.accountTable = new AccountTable();
    this.dialogManager = new DialogManager();
    this.contextMenu = new ContextMenu();
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadSettings();
    await this.loadAccounts();
    this.setupEventListeners();
    this.setupIpcListeners();
    this.updateUI();
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await window.electronAPI.invoke('get-settings');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private async loadAccounts(): Promise<void> {
    try {
      this.setLoading(true);
      this.accounts = await window.electronAPI.invoke('get-accounts');
      this.accountTable.setAccounts(this.accounts);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      this.setLoading(false);
    }
  }

  private setLoading(loading: boolean): void {
    const buttons = document.querySelectorAll('.toolbar-btn');
    buttons.forEach(btn => {
      if (loading) {
        btn.setAttribute('disabled', 'true');
      } else {
        btn.removeAttribute('disabled');
      }
    });
    
    if (loading) {
      document.body.style.cursor = 'wait';
    } else {
      document.body.style.cursor = 'default';
      this.updateToolbarButtons();
    }
  }

  private setupEventListeners(): void {
    document.getElementById('btn-add')?.addEventListener('click', () => this.showAddAccountDialog());
    document.getElementById('btn-edit')?.addEventListener('click', () => this.showEditAccountDialog());
    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelectedAccounts());
    document.getElementById('btn-launch')?.addEventListener('click', () => this.launchSelectedAccounts());
    document.getElementById('btn-launch-all')?.addEventListener('click', () => this.launchAllAccounts());
    document.getElementById('btn-close-all')?.addEventListener('click', () => this.closeAllAccounts());
    document.getElementById('btn-import')?.addEventListener('click', () => this.importAccounts());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportAccounts());
    document.getElementById('btn-settings')?.addEventListener('click', () => this.showSettingsDialog());
    
    document.getElementById('btn-welcome-add')?.addEventListener('click', () => this.showAddAccountDialog());
    document.getElementById('btn-welcome-settings')?.addEventListener('click', () => this.showSettingsDialog());
    
    document.getElementById('select-all')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.accountTable.selectAll(checked);
    });
    
    this.accountTable.on('selection-changed', () => this.updateToolbarButtons());
    this.accountTable.on('account-action', (action: string, account: Account) => {
      this.handleAccountAction(action, account);
    });
    
    document.addEventListener('contextmenu', (e) => {
      const row = (e.target as HTMLElement).closest('tr');
      if (row && row.dataset.accountId) {
        e.preventDefault();
        const account = this.accounts.find(a => a.id === row.dataset.accountId);
        if (account) {
          this.contextMenu.show(e.clientX, e.clientY, account);
        }
      }
    });
  }

  private setupIpcListeners(): void {
    window.electronAPI.on('process-status-update', (_, data) => {
      const account = this.accounts.find(a => a.id === data.accountId);
      if (account) {
        account.isRunning = data.running;
        this.accountTable.updateAccount(account);
        this.updateStatusBar();
      }
    });
    
    window.electronAPI.on('menu-add-account', () => this.showAddAccountDialog());
    window.electronAPI.on('menu-settings', () => this.showSettingsDialog());
    window.electronAPI.on('menu-import', () => this.importAccounts());
    window.electronAPI.on('menu-export', () => this.exportAccounts());
    window.electronAPI.on('menu-refresh', () => this.loadAccounts());
  }

  private updateUI(): void {
    const hasAccounts = this.accounts.length > 0;
    const welcomeScreen = document.getElementById('welcome-screen');
    const tableContainer = document.getElementById('account-table-container');
    
    if (welcomeScreen && tableContainer) {
      welcomeScreen.style.display = hasAccounts ? 'none' : 'flex';
      tableContainer.style.display = hasAccounts ? 'block' : 'none';
    }
    
    this.updateToolbarButtons();
    this.updateStatusBar();
  }

  private updateToolbarButtons(): void {
    const selectedAccounts = this.accountTable.getSelectedAccounts();
    const hasSelection = selectedAccounts.length > 0;
    
    document.getElementById('btn-edit')?.toggleAttribute('disabled', selectedAccounts.length !== 1);
    document.getElementById('btn-delete')?.toggleAttribute('disabled', !hasSelection);
    document.getElementById('btn-launch')?.toggleAttribute('disabled', !hasSelection);
  }

  private updateStatusBar(): void {
    const runningCount = this.accounts.filter(a => a.isRunning).length;
    const accountCountEl = document.getElementById('account-count');
    const runningCountEl = document.getElementById('running-count');
    
    if (accountCountEl) {
      accountCountEl.textContent = `${this.accounts.length} account${this.accounts.length !== 1 ? 's' : ''}`;
    }
    
    if (runningCountEl) {
      runningCountEl.textContent = `${runningCount} running`;
    }
  }

  private async showAddAccountDialog(): Promise<void> {
    const account = await this.dialogManager.showAccountDialog();
    if (account) {
      try {
        const savedAccount = await window.electronAPI.invoke('save-account', account);
        this.accounts.push(savedAccount);
        this.accountTable.addAccount(savedAccount);
        this.updateUI();
      } catch (error: any) {
        await this.dialogManager.showErrorDialog('Failed to add account', error.message);
      }
    }
  }

  private async showEditAccountDialog(): Promise<void> {
    const selectedAccounts = this.accountTable.getSelectedAccounts();
    if (selectedAccounts.length !== 1) return;
    
    const account = selectedAccounts[0];
    const updatedAccount = await this.dialogManager.showAccountDialog(account);
    
    if (updatedAccount) {
      try {
        const savedAccount = await window.electronAPI.invoke('save-account', updatedAccount);
        const index = this.accounts.findIndex(a => a.id === savedAccount.id);
        if (index !== -1) {
          this.accounts[index] = savedAccount;
          this.accountTable.updateAccount(savedAccount);
        }
      } catch (error: any) {
        await this.dialogManager.showErrorDialog('Failed to update account', error.message);
      }
    }
  }

  private async deleteSelectedAccounts(): Promise<void> {
    const selectedAccounts = this.accountTable.getSelectedAccounts();
    if (selectedAccounts.length === 0) return;
    
    const message = selectedAccounts.length === 1
      ? `Are you sure you want to delete account "${selectedAccounts[0].login}"?`
      : `Are you sure you want to delete ${selectedAccounts.length} accounts?`;
    
    const confirmed = await this.dialogManager.showConfirmDialog('Delete Accounts', message);
    if (!confirmed) return;
    
    for (const account of selectedAccounts) {
      try {
        await window.electronAPI.invoke('delete-account', account.id);
        const index = this.accounts.findIndex(a => a.id === account.id);
        if (index !== -1) {
          this.accounts.splice(index, 1);
        }
        this.accountTable.removeAccount(account.id);
      } catch (error) {
        console.error('Failed to delete account:', error);
      }
    }
    
    this.updateUI();
  }

  private async launchSelectedAccounts(): Promise<void> {
    if (!this.settings?.gamePath) {
      await this.dialogManager.showErrorDialog('Game path not configured', 'Please configure the game path in settings first.');
      return;
    }
    
    const selectedAccounts = this.accountTable.getSelectedAccounts();
    const accountIds = selectedAccounts.filter(a => !a.isRunning).map(a => a.id);
    
    if (accountIds.length === 0) return;
    
    try {
      await window.electronAPI.invoke('launch-game', accountIds);
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Failed to launch game', error.message);
    }
  }

  private async launchAllAccounts(): Promise<void> {
    if (!this.settings?.gamePath) {
      await this.dialogManager.showErrorDialog('Game path not configured', 'Please configure the game path in settings first.');
      return;
    }
    
    const accountIds = this.accounts.filter(a => !a.isRunning).map(a => a.id);
    if (accountIds.length === 0) return;
    
    try {
      await window.electronAPI.invoke('launch-game', accountIds);
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Failed to launch game', error.message);
    }
  }

  private async closeAllAccounts(): Promise<void> {
    const runningAccounts = this.accounts.filter(a => a.isRunning);
    if (runningAccounts.length === 0) return;
    
    const confirmed = await this.dialogManager.showConfirmDialog(
      'Close All Running Games',
      `Are you sure you want to close ${runningAccounts.length} running game${runningAccounts.length !== 1 ? 's' : ''}?`
    );
    
    if (!confirmed) return;
    
    try {
      await window.electronAPI.invoke('close-game', runningAccounts.map(a => a.id));
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Failed to close games', error.message);
    }
  }

  private async importAccounts(): Promise<void> {
    const importType = await this.dialogManager.showImportTypeDialog();
    if (!importType) return;
    
    try {
      let result;
      if (importType === 'scan') {
        result = await window.electronAPI.invoke('scan-batch-files');
        if (result.success && result.accounts.length > 0) {
          for (const account of result.accounts) {
            try {
              const savedAccount = await window.electronAPI.invoke('save-account', account);
              this.accounts.push(savedAccount);
              this.accountTable.addAccount(savedAccount);
            } catch (error) {
              console.error('Failed to import account:', error);
            }
          }
          this.updateUI();
          await this.dialogManager.showInfoDialog('Import Complete', `Successfully imported ${result.accounts.length} accounts.`);
        } else {
          await this.dialogManager.showInfoDialog('No Accounts Found', 'No valid batch files were found in the selected folder.');
        }
      } else {
        result = await window.electronAPI.invoke('import-accounts');
        if (result.success && result.count > 0) {
          await this.loadAccounts();
          await this.dialogManager.showInfoDialog('Import Complete', `Successfully imported ${result.count} accounts.`);
        }
      }
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Import Failed', error.message);
    }
  }

  private async exportAccounts(): Promise<void> {
    const format = await this.dialogManager.showExportFormatDialog();
    if (!format) return;
    
    try {
      const result = await window.electronAPI.invoke('export-accounts', format);
      if (result.success) {
        await this.dialogManager.showInfoDialog('Export Complete', 'Accounts exported successfully.');
      }
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Export Failed', error.message);
    }
  }

  private async showSettingsDialog(): Promise<void> {
    const settings = await this.dialogManager.showSettingsDialog(this.settings || { gamePath: '', launchDelay: 5 });
    if (settings) {
      try {
        await window.electronAPI.invoke('save-settings', settings);
        this.settings = settings;
      } catch (error: any) {
        await this.dialogManager.showErrorDialog('Failed to save settings', error.message);
      }
    }
  }

  private async handleAccountAction(action: string, account: Account): Promise<void> {
    switch (action) {
      case 'play':
        if (!account.isRunning && this.settings?.gamePath) {
          await window.electronAPI.invoke('launch-game', [account.id]);
        }
        break;
      case 'close':
        if (account.isRunning) {
          await window.electronAPI.invoke('close-game', [account.id]);
        }
        break;
      case 'edit':
        this.accountTable.selectAccount(account.id, true);
        await this.showEditAccountDialog();
        break;
      case 'delete':
        this.accountTable.selectAccount(account.id, true);
        await this.deleteSelectedAccounts();
        break;
      case 'copy-login':
        await navigator.clipboard.writeText(account.login);
        break;
      case 'copy-password':
        await navigator.clipboard.writeText(account.password);
        break;
      case 'webview':
        await this.openWebViewForAccount(account);
        break;
    }
  }

  private async openWebViewForAccount(account: Account): Promise<void> {
    try {
      const result = await window.electronAPI.invoke('open-webview', account.id);
      if (!result.success) {
        await this.dialogManager.showErrorDialog('Failed to open WebView', result.error);
      }
    } catch (error: any) {
      await this.dialogManager.showErrorDialog('Failed to open WebView', error.message);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});