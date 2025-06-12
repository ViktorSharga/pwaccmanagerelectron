// Simple vanilla JavaScript implementation for the renderer
class PerfectWorldAccountManager {
  constructor() {
    this.accounts = [];
    this.settings = null;
    this.selectedAccountIds = new Set();
    
    this.initialize();
  }

  async initialize() {
    await this.loadSettings();
    await this.loadAccounts();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      this.settings = await window.electronAPI.invoke('get-settings');
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = { gamePath: '', launchDelay: 5 };
    }
  }

  async loadAccounts() {
    try {
      this.accounts = await window.electronAPI.invoke('get-accounts');
      this.renderAccountTable();
    } catch (error) {
      console.error('Failed to load accounts:', error);
      this.accounts = [];
    }
  }

  setupEventListeners() {
    // Toolbar buttons
    document.getElementById('btn-add')?.addEventListener('click', () => this.showAddAccountDialog());
    document.getElementById('btn-edit')?.addEventListener('click', () => this.showEditAccountDialog());
    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelectedAccounts());
    document.getElementById('btn-launch')?.addEventListener('click', () => this.launchSelectedAccounts());
    document.getElementById('btn-launch-all')?.addEventListener('click', () => this.launchAllAccounts());
    document.getElementById('btn-close-all')?.addEventListener('click', () => this.closeAllAccounts());
    document.getElementById('btn-scan-folder')?.addEventListener('click', () => this.scanFolder());
    document.getElementById('btn-import')?.addEventListener('click', () => this.importAccounts());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportAccounts());
    document.getElementById('btn-settings')?.addEventListener('click', () => this.showSettingsDialog());
    
    // Welcome screen buttons
    document.getElementById('btn-welcome-add')?.addEventListener('click', () => this.showAddAccountDialog());
    document.getElementById('btn-welcome-settings')?.addEventListener('click', () => this.showSettingsDialog());
    
    // Select all checkbox
    document.getElementById('select-all')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      this.selectAllAccounts(checked);
    });

    // IPC listeners
    window.electronAPI.on('process-status-update', (_, data) => {
      const account = this.accounts.find(a => a.id === data.accountId);
      if (account) {
        account.isRunning = data.running;
        this.renderAccountTable();
        this.updateStatusBar();
      }
    });
  }

  updateUI() {
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

  updateToolbarButtons() {
    const hasSelection = this.selectedAccountIds.size > 0;
    const hasOneSelection = this.selectedAccountIds.size === 1;
    
    document.getElementById('btn-edit')?.toggleAttribute('disabled', !hasOneSelection);
    document.getElementById('btn-delete')?.toggleAttribute('disabled', !hasSelection);
    document.getElementById('btn-launch')?.toggleAttribute('disabled', !hasSelection);
  }

  updateStatusBar() {
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

  renderAccountTable() {
    const tbody = document.getElementById('account-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    this.accounts.forEach(account => {
      const row = document.createElement('tr');
      row.dataset.accountId = account.id;
      
      const isSelected = this.selectedAccountIds.has(account.id);
      const isRunning = account.isRunning || false;
      
      if (isSelected) row.classList.add('selected');
      if (isRunning) row.classList.add('running');
      
      row.innerHTML = `
        <td>
          <input type="checkbox" ${isSelected ? 'checked' : ''} data-account-id="${account.id}">
        </td>
        <td class="login-cell" title="Click to copy">${this.escapeHtml(account.login)}</td>
        <td class="password-cell" title="Click to copy">••••••••</td>
        <td>${this.escapeHtml(account.server)}</td>
        <td>${this.escapeHtml(account.characterName || '')}</td>
        <td>${this.escapeHtml(account.description || '')}</td>
        <td>${this.escapeHtml(account.owner || '')}</td>
        <td>
          <span class="status-indicator ${isRunning ? 'running' : 'stopped'}">
            ${isRunning ? 'Running' : 'Stopped'}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button class="action-btn play" ${isRunning ? 'disabled' : ''} title="Launch">▶</button>
            <button class="action-btn close" ${!isRunning ? 'disabled' : ''} title="Close">⏹</button>
            <button class="action-btn webview" title="Open WebView">🌐</button>
          </div>
        </td>
      `;
      
      this.setupRowEventListeners(row, account);
      tbody.appendChild(row);
    });
  }

  setupRowEventListeners(row, account) {
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (checked) {
        this.selectedAccountIds.add(account.id);
        row.classList.add('selected');
      } else {
        this.selectedAccountIds.delete(account.id);
        row.classList.remove('selected');
      }
      this.updateToolbarButtons();
    });
    
    const loginCell = row.querySelector('.login-cell');
    loginCell?.addEventListener('click', () => {
      navigator.clipboard.writeText(account.login);
      this.showToast('Login copied to clipboard');
    });
    
    const passwordCell = row.querySelector('.password-cell');
    passwordCell?.addEventListener('click', () => {
      navigator.clipboard.writeText(account.password);
      this.showToast('Password copied to clipboard');
    });
    
    const playButton = row.querySelector('.action-btn.play');
    playButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.launchAccount(account);
    });
    
    const closeButton = row.querySelector('.action-btn.close');
    closeButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeAccount(account);
    });
    
    const webviewButton = row.querySelector('.action-btn.webview');
    webviewButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWebViewForAccount(account);
    });
    
    row.addEventListener('dblclick', () => {
      this.selectedAccountIds.clear();
      this.selectedAccountIds.add(account.id);
      this.showEditAccountDialog();
    });
  }

  selectAllAccounts(checked) {
    this.selectedAccountIds.clear();
    
    if (checked) {
      this.accounts.forEach(account => {
        this.selectedAccountIds.add(account.id);
      });
    }
    
    document.querySelectorAll('#account-tbody tr').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = checked;
      }
      row.classList.toggle('selected', checked);
    });
    
    this.updateToolbarButtons();
  }

  async showAddAccountDialog() {
    const account = await this.showAccountDialog();
    if (account) {
      try {
        const savedAccount = await window.electronAPI.invoke('save-account', account);
        this.accounts.push(savedAccount);
        this.renderAccountTable();
        this.updateUI();
        this.showToast('Account added successfully');
      } catch (error) {
        this.showErrorDialog('Failed to add account', error.message);
      }
    }
  }

  async showEditAccountDialog() {
    if (this.selectedAccountIds.size !== 1) return;
    
    const accountId = Array.from(this.selectedAccountIds)[0];
    const account = this.accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const updatedAccount = await this.showAccountDialog(account);
    if (updatedAccount) {
      try {
        const savedAccount = await window.electronAPI.invoke('save-account', updatedAccount);
        const index = this.accounts.findIndex(a => a.id === savedAccount.id);
        if (index !== -1) {
          this.accounts[index] = savedAccount;
          this.renderAccountTable();
        }
        this.showToast('Account updated successfully');
      } catch (error) {
        this.showErrorDialog('Failed to update account', error.message);
      }
    }
  }

  async showAccountDialog(account = null) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>${account ? 'Edit Account' : 'Add Account'}</h2>
        </div>
        <div class="dialog-content">
          <form id="account-form">
            <div class="form-group">
              <label>Login *</label>
              <input type="text" name="login" value="${account?.login || ''}" required>
            </div>
            <div class="form-group">
              <label>Password *</label>
              <input type="password" name="password" value="${account?.password || ''}" required>
            </div>
            <div class="form-group">
              <label>Server *</label>
              <select name="server" required>
                <option value="">Select server...</option>
                <option value="Main" ${account?.server === 'Main' ? 'selected' : ''}>Main</option>
                <option value="X" ${account?.server === 'X' ? 'selected' : ''}>X</option>
              </select>
            </div>
            <div class="form-group">
              <label>Character Name</label>
              <input type="text" name="characterName" value="${account?.characterName || ''}" placeholder="Supports Cyrillic characters">
            </div>
            <div class="form-group">
              <label>Description</label>
              <input type="text" name="description" value="${account?.description || ''}" placeholder="Supports Cyrillic characters">
            </div>
            <div class="form-group">
              <label>Owner</label>
              <input type="text" name="owner" value="${account?.owner || ''}" placeholder="Supports Cyrillic characters">
            </div>
          </form>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="save-btn">Save</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const form = dialog.querySelector('#account-form');
      const saveBtn = dialog.querySelector('#save-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      saveBtn.onclick = () => {
        const formData = new FormData(form);
        const result = {
          login: formData.get('login'),
          password: formData.get('password'),
          server: formData.get('server'),
        };
        
        if (account?.id) result.id = account.id;
        
        const characterName = formData.get('characterName');
        if (characterName) result.characterName = characterName;
        
        const description = formData.get('description');
        if (description) result.description = description;
        
        const owner = formData.get('owner');
        if (owner) result.owner = owner;
        
        cleanup();
        resolve(result);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      };
      
      dialog.onclick = (e) => {
        e.stopPropagation();
      };
      
      setTimeout(() => {
        const firstInput = form.querySelector('input');
        firstInput?.focus();
      }, 100);
    });
  }

  async showSettingsDialog() {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Settings</h2>
        </div>
        <div class="dialog-content">
          <form id="settings-form">
            <div class="form-group">
              <label>Game Path</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" name="gamePath" value="${this.settings?.gamePath || ''}" readonly>
                <button type="button" id="browse-btn" class="btn btn-secondary">Browse</button>
              </div>
            </div>
            <div class="form-group">
              <label>Launch Delay (seconds): ${this.settings?.launchDelay || 5}</label>
              <input type="range" name="launchDelay" min="1" max="30" value="${this.settings?.launchDelay || 5}" step="1">
            </div>
          </form>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="save-btn">Save</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const form = dialog.querySelector('#settings-form');
      const saveBtn = dialog.querySelector('#save-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      const browseBtn = dialog.querySelector('#browse-btn');
      const gamePathInput = form.querySelector('input[name="gamePath"]');
      const delaySlider = form.querySelector('input[name="launchDelay"]');
      const delayLabel = form.querySelector('label');
      
      delaySlider.oninput = () => {
        delayLabel.textContent = `Launch Delay (seconds): ${delaySlider.value}`;
      };
      
      browseBtn.onclick = async () => {
        try {
          const result = await window.electronAPI.invoke('select-game-folder');
          if (result.success) {
            gamePathInput.value = result.path;
          } else {
            alert(result.error);
          }
        } catch (error) {
          console.error('Failed to select folder:', error);
        }
      };
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
      
      saveBtn.onclick = async () => {
        const formData = new FormData(form);
        const newSettings = {
          gamePath: formData.get('gamePath'),
          launchDelay: parseInt(formData.get('launchDelay'), 10),
        };
        
        try {
          await window.electronAPI.invoke('save-settings', newSettings);
          this.settings = newSettings;
          this.showToast('Settings saved successfully');
        } catch (error) {
          this.showErrorDialog('Failed to save settings', error.message);
        }
        
        cleanup();
        resolve(true);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      };
      
      dialog.onclick = (e) => {
        e.stopPropagation();
      };
    });
  }

  async deleteSelectedAccounts() {
    if (this.selectedAccountIds.size === 0) return;
    
    const selectedAccounts = this.accounts.filter(a => this.selectedAccountIds.has(a.id));
    const message = selectedAccounts.length === 1
      ? `Are you sure you want to delete account "${selectedAccounts[0].login}"?`
      : `Are you sure you want to delete ${selectedAccounts.length} accounts?`;
    
    const confirmed = await this.showConfirmDialog('Delete Accounts', message);
    if (!confirmed) return;
    
    for (const account of selectedAccounts) {
      try {
        await window.electronAPI.invoke('delete-account', account.id);
        const index = this.accounts.findIndex(a => a.id === account.id);
        if (index !== -1) {
          this.accounts.splice(index, 1);
        }
      } catch (error) {
        console.error('Failed to delete account:', error);
      }
    }
    
    this.selectedAccountIds.clear();
    this.renderAccountTable();
    this.updateUI();
    this.showToast('Accounts deleted successfully');
  }

  async launchSelectedAccounts() {
    if (!this.settings?.gamePath) {
      this.showErrorDialog('Game path not configured', 'Please configure the game path in settings first.');
      return;
    }
    
    const selectedAccounts = this.accounts.filter(a => 
      this.selectedAccountIds.has(a.id) && !a.isRunning
    );
    
    if (selectedAccounts.length === 0) return;
    
    try {
      await window.electronAPI.invoke('launch-game', selectedAccounts.map(a => a.id));
      this.showToast(`Launching ${selectedAccounts.length} account(s)...`);
    } catch (error) {
      this.showErrorDialog('Failed to launch game', error.message);
    }
  }

  async launchAllAccounts() {
    if (!this.settings?.gamePath) {
      this.showErrorDialog('Game path not configured', 'Please configure the game path in settings first.');
      return;
    }
    
    const accountIds = this.accounts.filter(a => !a.isRunning).map(a => a.id);
    if (accountIds.length === 0) return;
    
    try {
      await window.electronAPI.invoke('launch-game', accountIds);
      this.showToast(`Launching ${accountIds.length} account(s)...`);
    } catch (error) {
      this.showErrorDialog('Failed to launch game', error.message);
    }
  }

  async launchAccount(account) {
    if (!this.settings?.gamePath) {
      this.showErrorDialog('Game path not configured', 'Please configure the game path in settings first.');
      return;
    }
    
    if (account.isRunning) return;
    
    try {
      await window.electronAPI.invoke('launch-game', [account.id]);
      this.showToast(`Launching ${account.login}...`);
    } catch (error) {
      this.showErrorDialog('Failed to launch game', error.message);
    }
  }

  async closeAccount(account) {
    if (!account.isRunning) return;
    
    try {
      await window.electronAPI.invoke('close-game', [account.id]);
      this.showToast(`Closing ${account.login}...`);
    } catch (error) {
      this.showErrorDialog('Failed to close game', error.message);
    }
  }

  async closeAllAccounts() {
    const runningAccounts = this.accounts.filter(a => a.isRunning);
    if (runningAccounts.length === 0) return;
    
    const confirmed = await this.showConfirmDialog(
      'Close All Running Games',
      `Are you sure you want to close ${runningAccounts.length} running game(s)?`
    );
    
    if (!confirmed) return;
    
    try {
      await window.electronAPI.invoke('close-game', runningAccounts.map(a => a.id));
      this.showToast(`Closing ${runningAccounts.length} game(s)...`);
    } catch (error) {
      this.showErrorDialog('Failed to close games', error.message);
    }
  }

  async scanFolder() {
    try {
      const result = await window.electronAPI.invoke('scan-batch-files');
      if (result.success && result.accounts.length > 0) {
        // Show preview dialog with found accounts
        const confirmed = await this.showScanPreviewDialog(result.accounts);
        if (confirmed) {
          let importedCount = 0;
          for (const account of result.accounts) {
            try {
              const savedAccount = await window.electronAPI.invoke('save-account', account);
              this.accounts.push(savedAccount);
              importedCount++;
            } catch (error) {
              console.error('Failed to import account:', error);
            }
          }
          
          if (importedCount > 0) {
            this.renderAccountTable();
            this.updateUI();
            this.showToast(`Successfully imported ${importedCount} account(s) from batch files.`);
          }
        }
      } else {
        this.showToast('No valid batch files found in the selected folder.');
      }
    } catch (error) {
      this.showErrorDialog('Scan Failed', error.message);
    }
  }

  async openWebViewForAccount(account) {
    try {
      const result = await window.electronAPI.invoke('open-webview', account.id);
      if (!result.success) {
        this.showErrorDialog('Failed to open WebView', result.error);
      }
    } catch (error) {
      this.showErrorDialog('Failed to open WebView', error.message);
    }
  }

  async importAccounts() {
    // Simple implementation for now
    try {
      const result = await window.electronAPI.invoke('import-accounts');
      if (result.success && result.count > 0) {
        await this.loadAccounts();
        this.showToast(`Successfully imported ${result.count} accounts.`);
      } else {
        this.showToast('No accounts were imported.');
      }
    } catch (error) {
      this.showErrorDialog('Import Failed', error.message);
    }
  }

  async exportAccounts() {
    try {
      const result = await window.electronAPI.invoke('export-accounts', 'json');
      if (result.success) {
        this.showToast('Accounts exported successfully.');
      }
    } catch (error) {
      this.showErrorDialog('Export Failed', error.message);
    }
  }

  async showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>${title}</h2>
        </div>
        <div class="dialog-content">
          <p>${message}</p>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="confirm-btn">Confirm</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const confirmBtn = dialog.querySelector('#confirm-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
      
      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      };
      
      dialog.onclick = (e) => {
        e.stopPropagation();
      };
    });
  }

  async showScanPreviewDialog(accounts) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Found ${accounts.length} Account(s)</h2>
        </div>
        <div class="dialog-content">
          <p>The following accounts were found in batch files:</p>
          <div style="max-height: 300px; overflow-y: auto; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Login</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Server</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Character</th>
                  <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Source</th>
                </tr>
              </thead>
              <tbody>
                ${accounts.map(account => `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${this.escapeHtml(account.login || 'Unknown')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${this.escapeHtml(account.server || 'Main')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${this.escapeHtml(account.characterName || '')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">${this.escapeHtml(account.sourceBatchFile ? account.sourceBatchFile.split('/').pop() : 'Unknown')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <p><strong>Do you want to import these accounts?</strong></p>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="import-btn">Import All</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const importBtn = dialog.querySelector('#import-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
      
      importBtn.onclick = () => {
        cleanup();
        resolve(true);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(false);
        }
      };
      
      dialog.onclick = (e) => {
        e.stopPropagation();
      };
    });
  }

  showErrorDialog(title, message) {
    alert(`${title}: ${message}`);
  }

  showToast(message) {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    return overlay;
  }

  createDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    return dialog;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PerfectWorldAccountManager();
});