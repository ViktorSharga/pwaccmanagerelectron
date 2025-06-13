// Simple vanilla JavaScript implementation for the renderer
class PerfectWorldAccountManager {
  constructor() {
    this.accounts = [];
    this.settings = null;
    this.selectedAccountIds = new Set();
    this.runningProcesses = new Map(); // Map accountId -> processInfo
    this.recentErrors = [];
    this.logs = [];
    this.activeTab = 'general'; // For settings dialog tabs
    this.operationTimer = null; // Timer for status bar auto-clear
    
    this.initialize();
  }

  async initialize() {
    await this.loadSettings();
    await this.loadAccounts();
    await this.loadRunningProcesses();
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

  async loadRunningProcesses() {
    try {
      const runningProcesses = await window.electronAPI.invoke('get-running-processes');
      this.runningProcesses.clear();
      
      for (const processInfo of runningProcesses) {
        this.runningProcesses.set(processInfo.accountId, processInfo);
        
        // Update account running status
        const account = this.accounts.find(a => a.id === processInfo.accountId);
        if (account) {
          account.isRunning = true;
        }
      }
    } catch (error) {
      console.error('Failed to load running processes:', error);
    }
  }

  setupEventListeners() {
    // Toolbar buttons
    document.getElementById('btn-add')?.addEventListener('click', () => this.showAddAccountDialog());
    document.getElementById('btn-edit')?.addEventListener('click', () => this.showEditAccountDialog());
    document.getElementById('btn-delete')?.addEventListener('click', () => this.deleteSelectedAccounts());
    document.getElementById('btn-launch')?.addEventListener('click', () => this.launchSelectedAccounts());
    document.getElementById('btn-close-selected')?.addEventListener('click', () => this.closeSelectedAccounts());
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
    
    // Status bar elements
    document.getElementById('error-indicator')?.addEventListener('click', () => {
      this.showSettingsDialog('logs');
    });
    
    document.getElementById('view-logs')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSettingsDialog('logs');
    });

    // IPC listeners
    window.electronAPI.on('process-status-update', (_, data) => {
      console.log(`📥 Received status update:`, data);
      const account = this.accounts.find(a => a.id === data.accountId);
      if (account) {
        account.isRunning = data.running;
        
        // Update process information
        if (data.running && data.processInfo) {
          console.log(`📥 Updating process info for ${data.accountId}: PID ${data.processInfo.pid}`);
          this.runningProcesses.set(data.accountId, data.processInfo);
        } else {
          this.runningProcesses.delete(data.accountId);
        }
        
        this.renderAccountTable();
        this.updateStatusBar();
        this.updateToolbarButtons(); // Update toolbar buttons after status change
      }
    });
    
    // Logging event listeners
    window.electronAPI.on('log-added', (_, logEntry) => {
      this.logs.push(logEntry);
      if (this.logs.length > 1000) {
        this.logs.shift(); // Keep only last 1000 logs in UI
      }
      
      // Update logs view if it's open
      if (this.activeTab === 'logs' && document.querySelector('.logs-container')) {
        this.appendLogEntry(logEntry);
      }
    });
    
    window.electronAPI.on('error-logged', (_, logEntry) => {
      this.recentErrors.push(logEntry);
      if (this.recentErrors.length > 10) {
        this.recentErrors.shift();
      }
      this.updateErrorIndicator();
    });
    
    window.electronAPI.on('operation-changed', (_, operation) => {
      console.log(`📥 Received operation-changed: "${operation}"`);
      this.showOperationStatus(operation);
    });
    
    window.electronAPI.on('logs-cleared', () => {
      this.logs = [];
      this.recentErrors = [];
      this.updateErrorIndicator();
      
      // Update logs view if it's open
      if (this.activeTab === 'logs' && document.querySelector('.logs-container')) {
        this.renderLogs();
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
    const hasRunningSelection = this.getSelectedRunningAccounts().length > 0;
    
    document.getElementById('btn-edit')?.toggleAttribute('disabled', !hasOneSelection);
    document.getElementById('btn-delete')?.toggleAttribute('disabled', !hasSelection);
    document.getElementById('btn-launch')?.toggleAttribute('disabled', !hasSelection);
    document.getElementById('btn-close-selected')?.toggleAttribute('disabled', !hasRunningSelection);
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

  getSelectedRunningAccounts() {
    return this.accounts.filter(account => 
      this.selectedAccountIds.has(account.id) && account.isRunning
    );
  }

  getRunningStatusText(accountId) {
    const processInfo = this.runningProcesses.get(accountId);
    if (processInfo) {
      if (processInfo.pid === -2) {
        return 'Launching...';
      } else if (processInfo.pid === -1) {
        return 'Running (PID: detecting...)';
      }
      return `Running (PID: ${processInfo.pid})`;
    }
    return 'Running';
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
            ${isRunning ? this.getRunningStatusText(account.id) : 'Stopped'}
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
            ${account?.sourceBatchFile ? `
            <div class="form-group">
              <label>Source Batch File</label>
              <input type="text" value="${this.escapeHtml(account.sourceBatchFile)}" readonly style="background: #f5f5f5; color: #666;">
              <small style="color: #666; font-size: 12px;">This account was imported from a batch file</small>
            </div>
            ` : ''}
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

  async showSettingsDialog(initialTab = 'general') {
    // Load logs first if opening logs tab
    if (initialTab === 'logs') {
      this.logs = await window.electronAPI.invoke('get-logs');
      console.log(`📋 Loaded ${this.logs.length} logs for settings dialog`);
    }
    
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      dialog.style.width = '700px'; // Wider for tabs
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Settings</h2>
        </div>
        <div class="dialog-content">
          <div class="tab-container">
            <button class="tab-button ${initialTab === 'general' ? 'active' : ''}" data-tab="general">General</button>
            <button class="tab-button ${initialTab === 'logs' ? 'active' : ''}" data-tab="logs">Logs</button>
          </div>
          
          <div id="general-tab" class="tab-content ${initialTab === 'general' ? 'active' : ''}">
            <form id="settings-form">
              <div class="form-group">
                <label>Game Path</label>
                <div style="display: flex; gap: 8px;">
                  <input type="text" name="gamePath" value="${this.settings?.gamePath || ''}" readonly>
                  <button type="button" id="browse-btn" class="btn btn-secondary">Browse</button>
                </div>
              </div>
              <div class="form-group">
                <label>Launch Delay for Group Operations (seconds): ${this.settings?.launchDelay || 15}</label>
                <input type="range" name="launchDelay" min="10" max="60" value="${this.settings?.launchDelay || 15}" step="1">
                <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
                  Delay between launches when launching multiple clients.<br>
                  Individual launches have no delay. First client in group launches immediately.
                </small>
              </div>
              <div class="form-group">
                <label>Process Monitoring</label>
                <select name="processMonitoringMode" id="processMonitoringMode">
                  <option value="disabled" ${this.settings?.processMonitoringMode === 'disabled' ? 'selected' : ''}>Disabled (Manual Control Only)</option>
                  <option value="5min" ${this.settings?.processMonitoringMode === '5min' ? 'selected' : ''}>5 Minutes (Best Performance)</option>
                  <option value="3min" ${this.settings?.processMonitoringMode === '3min' || !this.settings?.processMonitoringMode ? 'selected' : ''}>3 Minutes (Balanced)</option>
                  <option value="1min" ${this.settings?.processMonitoringMode === '1min' ? 'selected' : ''}>1 Minute (Most Responsive)</option>
                </select>
                <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
                  <strong>Disabled:</strong> Processes remain "running" until manually closed<br>
                  <strong>1-5 Minutes:</strong> Check if game processes still exist at selected intervals<br>
                  <strong>Note:</strong> Only monitors when clients are actively running
                </small>
              </div>
              <div class="form-group" id="autoRestartGroup" style="display: ${this.settings?.processMonitoringMode === 'disabled' ? 'none' : 'block'};">
                <label>
                  <input type="checkbox" name="autoRestartCrashedClients" ${this.settings?.autoRestartCrashedClients ? 'checked' : ''}>
                  Automatically Restart Crashed Clients
                </label>
                <small style="color: #666; font-size: 12px; margin-top: 4px; display: block;">
                  When monitoring detects a client has crashed (not manually closed), automatically restart it.
                </small>
              </div>
            </form>
          </div>
          
          <div id="logs-tab" class="tab-content ${initialTab === 'logs' ? 'active' : ''}">
            <div class="logs-toolbar">
              <div class="log-filter">
                <label>Level:</label>
                <select id="log-level-filter">
                  <option value="">All</option>
                  <option value="0">Debug</option>
                  <option value="1">Info</option>
                  <option value="2">Warning</option>
                  <option value="3">Error</option>
                </select>
                <input type="text" id="log-search" placeholder="Search logs..." style="width: 200px;">
              </div>
              <div>
                <button type="button" class="btn btn-secondary" id="clear-logs-btn" style="margin-right: 8px;">Clear Logs</button>
                <button type="button" class="btn btn-secondary" id="export-logs-btn">Export Logs</button>
              </div>
            </div>
            <div class="logs-container" id="logs-container">
              ${this.logs.length === 0 ? '<div class="logs-empty">No logs to display</div>' : ''}
            </div>
          </div>
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
      const gamePathInput = form?.querySelector('input[name="gamePath"]');
      const delaySlider = form?.querySelector('input[name="launchDelay"]');
      const delayLabel = dialog.querySelector('#general-tab label');
      const monitoringSelect = form?.querySelector('#processMonitoringMode');
      const autoRestartGroup = dialog.querySelector('#autoRestartGroup');
      
      // Tab switching
      const tabButtons = dialog.querySelectorAll('.tab-button');
      const tabContents = dialog.querySelectorAll('.tab-content');
      
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          const targetTab = button.dataset.tab;
          this.activeTab = targetTab;
          
          // Update active states
          tabButtons.forEach(btn => btn.classList.remove('active'));
          tabContents.forEach(content => content.classList.remove('active'));
          
          button.classList.add('active');
          dialog.querySelector(`#${targetTab}-tab`).classList.add('active');
          
          // Load logs if switching to logs tab
          if (targetTab === 'logs') {
            this.loadLogsForDialog();
          }
        });
      });
      
      // If logs tab is initially active, render logs
      if (initialTab === 'logs') {
        this.renderLogs();
      }
      
      if (delaySlider) {
        delaySlider.oninput = () => {
          const label = dialog.querySelector('#general-tab label[for="launchDelay"]') || dialog.querySelector('#general-tab label');
          if (label && label.textContent.includes('Launch Delay')) {
            label.textContent = `Launch Delay for Group Operations (seconds): ${delaySlider.value}`;
          }
        };
      }
      
      // Show/hide auto-restart option based on monitoring mode
      if (monitoringSelect) {
        monitoringSelect.onchange = () => {
          const isDisabled = monitoringSelect.value === 'disabled';
          if (autoRestartGroup) {
            autoRestartGroup.style.display = isDisabled ? 'none' : 'block';
          }
        };
      }
      
      // Log tab event handlers
      const logLevelFilter = dialog.querySelector('#log-level-filter');
      const logSearch = dialog.querySelector('#log-search');
      const clearLogsBtn = dialog.querySelector('#clear-logs-btn');
      const exportLogsBtn = dialog.querySelector('#export-logs-btn');
      
      if (logLevelFilter) {
        logLevelFilter.addEventListener('change', () => this.filterLogs());
      }
      
      if (logSearch) {
        logSearch.addEventListener('input', () => this.filterLogs());
      }
      
      if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', async () => {
          const confirmed = await this.showConfirmDialog('Clear Logs', 'Are you sure you want to clear all logs?');
          if (confirmed) {
            await window.electronAPI.invoke('clear-logs');
            this.showToast('Logs cleared successfully');
          }
        });
      }
      
      if (exportLogsBtn) {
        exportLogsBtn.addEventListener('click', async () => {
          try {
            const result = await window.electronAPI.invoke('export-logs');
            if (result.success) {
              this.showToast('Logs exported successfully');
            }
          } catch (error) {
            this.showErrorDialog('Export Failed', error.message);
          }
        });
      }
      
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
          processMonitoringMode: formData.get('processMonitoringMode'),
          autoRestartCrashedClients: formData.get('autoRestartCrashedClients') === 'on',
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
    const accountsWithBatchFiles = selectedAccounts.filter(a => a.sourceBatchFile);
    
    let message = selectedAccounts.length === 1
      ? `Are you sure you want to delete account "${selectedAccounts[0].login}"?`
      : `Are you sure you want to delete ${selectedAccounts.length} accounts?`;
    
    // Show delete confirmation with optional batch file checkbox
    const deleteResult = await this.showDeleteConfirmationDialog(message, accountsWithBatchFiles);
    if (!deleteResult) return; // User cancelled
    
    const { confirmed, deleteBatchFiles } = deleteResult;
    if (!confirmed) return;
    
    // Delete accounts and optionally batch files
    for (const account of selectedAccounts) {
      try {
        await window.electronAPI.invoke('delete-account', account.id);
        
        // Delete batch file if requested and it exists
        if (deleteBatchFiles && account.sourceBatchFile) {
          try {
            await window.electronAPI.invoke('delete-batch-file', account.sourceBatchFile);
          } catch (batchError) {
            console.warn('Failed to delete batch file:', batchError);
          }
        }
        
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
    
    const batchMessage = deleteBatchFiles && accountsWithBatchFiles.length > 0 ? ' and associated batch files' : '';
    this.showToast(`Successfully deleted ${selectedAccounts.length} account(s)${batchMessage}.`);
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
      if (selectedAccounts.length === 1) {
        this.showToast(`Launching ${selectedAccounts[0].login}...`);
      } else {
        const delay = this.settings?.launchDelay || 15;
        this.showToast(`Launching ${selectedAccounts.length} accounts with ${delay}s delay between launches...`);
      }
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
      if (accountIds.length === 1) {
        const account = this.accounts.find(a => a.id === accountIds[0]);
        this.showToast(`Launching ${account?.login || 'account'}...`);
      } else {
        const delay = this.settings?.launchDelay || 15;
        this.showToast(`Launching all ${accountIds.length} accounts with ${delay}s delay between launches...`);
      }
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
      const result = await window.electronAPI.invoke('close-game', [account.id]);
      if (result.success) {
        this.showToast(`Closing ${account.login}...`);
      } else {
        this.showErrorDialog('Failed to close game', result.error || 'Unknown error');
      }
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
      const result = await window.electronAPI.invoke('close-game', runningAccounts.map(a => a.id));
      if (result.success) {
        this.showToast(`Closing ${runningAccounts.length} game(s)...`);
      } else {
        this.showErrorDialog('Failed to close games', result.error || 'Unknown error');
      }
    } catch (error) {
      this.showErrorDialog('Failed to close games', error.message);
    }
  }

  async closeSelectedAccounts() {
    const selectedRunningAccounts = this.getSelectedRunningAccounts();
    if (selectedRunningAccounts.length === 0) return;
    
    const message = selectedRunningAccounts.length === 1
      ? `Are you sure you want to close the running game for account "${selectedRunningAccounts[0].login}"?`
      : `Are you sure you want to close ${selectedRunningAccounts.length} selected running games?`;
    
    const confirmed = await this.showConfirmDialog('Close Selected Games', message);
    if (!confirmed) return;
    
    try {
      const result = await window.electronAPI.invoke('close-game', selectedRunningAccounts.map(a => a.id));
      if (result.success) {
        this.showToast(`Closing ${selectedRunningAccounts.length} selected game(s)...`);
      } else {
        this.showErrorDialog('Failed to close selected games', result.error || 'Unknown error');
      }
    } catch (error) {
      this.showErrorDialog('Failed to close selected games', error.message);
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
    try {
      const result = await window.electronAPI.invoke('import-accounts');
      if (result.success && result.importData) {
        const importData = result.importData;
        
        if (importData.accounts.length === 0) {
          this.showToast('No accounts found in the selected file.');
          return;
        }

        const selectedAccounts = await this.showImportSelectionDialog(importData);
        if (selectedAccounts && selectedAccounts.length > 0) {
          const importResult = await window.electronAPI.invoke('import-selected-accounts', selectedAccounts);
          if (importResult.success) {
            // Add a small delay to ensure database write is complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Force reload accounts and update UI
            await this.loadAccounts();
            this.updateUI();
            
            let message = `Successfully imported ${importResult.count} accounts.`;
            if (importResult.errors && importResult.errors.length > 0) {
              message += `\n\nErrors during import:\n${importResult.errors.map(e => `• ${e.login}: ${e.error}`).join('\n')}`;
              this.showErrorDialog('Import Completed with Errors', message);
            } else {
              this.showToast(message);
            }
          }
        }
      } else {
        this.showToast('No accounts were imported.');
      }
    } catch (error) {
      this.showErrorDialog('Import Failed', error.message);
    }
  }

  async exportAccounts() {
    try {
      if (this.accounts.length === 0) {
        this.showToast('No accounts to export.');
        return;
      }

      const selectedAccounts = await this.showExportSelectionDialog(this.accounts);
      if (selectedAccounts && selectedAccounts.length > 0) {
        const result = await window.electronAPI.invoke('export-selected-accounts', selectedAccounts, 'json');
        if (result.success) {
          this.showToast(`Successfully exported ${selectedAccounts.length} accounts.`);
        }
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

  async showDeleteConfirmationDialog(message, accountsWithBatchFiles) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      const hasBatchFiles = accountsWithBatchFiles.length > 0;
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Delete Accounts</h2>
        </div>
        <div class="dialog-content">
          <p>${message}</p>
          ${hasBatchFiles ? `
            <div style="margin: 16px 0;">
              <strong>Associated batch files:</strong>
              <ul style="margin: 8px 0; padding-left: 20px; max-height: 150px; overflow-y: auto; font-size: 12px; color: #666;">
                ${accountsWithBatchFiles.map(account => `
                  <li style="margin: 4px 0;">
                    ${this.escapeHtml(account.sourceBatchFile.split('/').pop())} (${this.escapeHtml(account.login)})
                  </li>
                `).join('')}
              </ul>
              <label style="display: flex; align-items: center; margin-top: 12px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
                <input type="checkbox" id="delete-batch-files" style="margin-right: 8px;">
                <span>Also delete associated batch files</span>
              </label>
            </div>
          ` : ''}
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="confirm-btn">Delete</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const confirmBtn = dialog.querySelector('#confirm-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      const deleteBatchFilesCheckbox = dialog.querySelector('#delete-batch-files');
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      confirmBtn.onclick = () => {
        const deleteBatchFiles = deleteBatchFilesCheckbox ? deleteBatchFilesCheckbox.checked : false;
        cleanup();
        resolve({ confirmed: true, deleteBatchFiles });
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

  async showImportSelectionDialog(importData) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Import Accounts</h2>
        </div>
        <div class="dialog-content">
          <p>Found ${importData.accounts.length} account(s) in the file.</p>
          ${importData.existing.length > 0 ? `
            <div style="margin: 12px 0; padding: 8px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
              <strong>⚠️ Existing accounts:</strong> ${importData.existing.join(', ')}
              <br><small>These will be skipped during import.</small>
            </div>
          ` : ''}
          <div style="margin: 16px 0;">
            <label style="display: flex; align-items: center; margin-bottom: 8px;">
              <input type="checkbox" id="select-all-import" checked style="margin-right: 8px;">
              <strong>Select All</strong>
            </label>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
              ${importData.accounts.map((account, index) => {
                const isExisting = importData.existing.includes(account.login);
                return `
                  <label style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee; ${isExisting ? 'background: #f8f8f8; opacity: 0.6;' : ''}" 
                         ${isExisting ? 'title="Account already exists"' : ''}>
                    <input type="checkbox" class="account-checkbox" data-index="${index}" 
                           ${!isExisting ? 'checked' : 'disabled'} style="margin-right: 8px;">
                    <div style="flex: 1;">
                      <strong>${this.escapeHtml(account.login || 'Unknown')}</strong>
                      <div style="font-size: 12px; color: #666;">
                        Server: ${this.escapeHtml(account.server || 'Main')} | 
                        Character: ${this.escapeHtml(account.characterName || 'N/A')}
                      </div>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="import-btn">Import Selected</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const selectAllCheckbox = dialog.querySelector('#select-all-import');
      const accountCheckboxes = dialog.querySelectorAll('.account-checkbox:not([disabled])');
      const importBtn = dialog.querySelector('#import-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      
      const updateImportButton = () => {
        const selected = dialog.querySelectorAll('.account-checkbox:checked:not([disabled])');
        importBtn.textContent = `Import Selected (${selected.length})`;
        importBtn.disabled = selected.length === 0;
      };
      
      selectAllCheckbox.addEventListener('change', () => {
        accountCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        updateImportButton();
      });
      
      accountCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateImportButton);
      });
      
      updateImportButton();
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      importBtn.onclick = () => {
        const selectedIndices = Array.from(dialog.querySelectorAll('.account-checkbox:checked:not([disabled])'))
          .map(cb => parseInt(cb.dataset.index));
        const selectedAccounts = selectedIndices.map(i => importData.accounts[i]);
        cleanup();
        resolve(selectedAccounts);
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
    });
  }

  async showExportSelectionDialog(accounts) {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Export Accounts</h2>
        </div>
        <div class="dialog-content">
          <p>Select accounts to export:</p>
          <div style="margin: 16px 0;">
            <label style="display: flex; align-items: center; margin-bottom: 8px;">
              <input type="checkbox" id="select-all-export" checked style="margin-right: 8px;">
              <strong>Select All</strong>
            </label>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
              ${accounts.map((account, index) => `
                <label style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                  <input type="checkbox" class="account-checkbox" data-index="${index}" 
                         checked style="margin-right: 8px;">
                  <div style="flex: 1;">
                    <strong>${this.escapeHtml(account.login)}</strong>
                    <div style="font-size: 12px; color: #666;">
                      Server: ${this.escapeHtml(account.server)} | 
                      Character: ${this.escapeHtml(account.characterName || 'N/A')} |
                      Status: ${account.isRunning ? '<span style="color: green;">Running</span>' : '<span style="color: #666;">Stopped</span>'}
                    </div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="export-btn">Export Selected</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      const selectAllCheckbox = dialog.querySelector('#select-all-export');
      const accountCheckboxes = dialog.querySelectorAll('.account-checkbox');
      const exportBtn = dialog.querySelector('#export-btn');
      const cancelBtn = dialog.querySelector('#cancel-btn');
      
      const updateExportButton = () => {
        const selected = dialog.querySelectorAll('.account-checkbox:checked');
        exportBtn.textContent = `Export Selected (${selected.length})`;
        exportBtn.disabled = selected.length === 0;
      };
      
      selectAllCheckbox.addEventListener('change', () => {
        accountCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        updateExportButton();
      });
      
      accountCheckboxes.forEach(cb => {
        cb.addEventListener('change', updateExportButton);
      });
      
      updateExportButton();
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      exportBtn.onclick = () => {
        const selectedIndices = Array.from(dialog.querySelectorAll('.account-checkbox:checked'))
          .map(cb => parseInt(cb.dataset.index));
        const selectedAccounts = selectedIndices.map(i => accounts[i]);
        cleanup();
        resolve(selectedAccounts);
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
    });
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

  // Simple status bar operation display
  showOperationStatus(operation) {
    console.log(`🖼️ showOperationStatus called with: "${operation}"`);
    
    const operationStatus = document.getElementById('operation-status');
    
    if (!operationStatus) {
      console.log(`❌ Status bar element not found`);
      return;
    }
    
    // Clear any existing timer
    if (this.operationTimer) {
      clearTimeout(this.operationTimer);
      this.operationTimer = null;
    }
    
    if (operation) {
      console.log(`🔄 Showing operation: "${operation}"`);
      operationStatus.classList.remove('idle');
      operationStatus.innerHTML = `
        <div class="operation-spinner"></div>
        <span>${this.escapeHtml(operation)}</span>
      `;
      
      // Set timer to clear after 10 seconds
      console.log(`⏰ Setting 10-second auto-clear timer`);
      this.operationTimer = setTimeout(() => {
        console.log(`⏰ 10-second timer expired - clearing status bar`);
        operationStatus.classList.add('idle');
        operationStatus.innerHTML = '<span>Ready</span>';
        this.operationTimer = null;
      }, 10000);
    } else {
      console.log(`✅ Clearing status bar to Ready`);
      operationStatus.classList.add('idle');
      operationStatus.innerHTML = '<span>Ready</span>';
    }
  }
  
  updateErrorIndicator() {
    const errorIndicator = document.getElementById('error-indicator');
    const errorCount = document.getElementById('error-count');
    
    if (!errorIndicator || !errorCount) return;
    
    if (this.recentErrors.length > 0) {
      errorIndicator.style.display = 'flex';
      errorCount.textContent = this.recentErrors.length.toString();
    } else {
      errorIndicator.style.display = 'none';
    }
  }
  
  
  // Log rendering methods
  renderLogs() {
    const container = document.querySelector('#logs-container');
    if (!container) {
      console.log('📋 renderLogs: No logs container found');
      return;
    }
    
    container.innerHTML = '';
    
    const filteredLogs = this.getFilteredLogs();
    console.log(`📋 renderLogs: Rendering ${filteredLogs.length} filtered logs from ${this.logs.length} total`);
    
    if (filteredLogs.length === 0) {
      container.innerHTML = '<div class="logs-empty">No logs to display</div>';
      return;
    }
    
    // Render in reverse order (newest first)
    filteredLogs.reverse().forEach(log => {
      container.appendChild(this.createLogElement(log));
    });
  }
  
  appendLogEntry(logEntry) {
    const container = document.querySelector('#logs-container');
    if (!container) return;
    
    // Remove empty message if present
    const emptyMsg = container.querySelector('.logs-empty');
    if (emptyMsg) {
      emptyMsg.remove();
    }
    
    // Add to top (newest first)
    container.insertBefore(this.createLogElement(logEntry), container.firstChild);
  }
  
  createLogElement(log) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.dataset.logId = log.id;
    
    const levelClass = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'OPERATION'][log.level] || 'INFO';
    
    div.innerHTML = `
      <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
      <span class="log-level ${levelClass}">${levelClass}</span>
      <span class="log-message">${this.escapeHtml(log.message)}</span>
      ${log.context ? `<span class="log-context">[${this.escapeHtml(log.context)}]</span>` : ''}
      <div class="log-actions">
        <button class="log-action-btn" onclick="app.copyLogEntry('${log.id}')">Copy</button>
        ${log.details || log.stackTrace ? `<button class="log-action-btn" onclick="app.toggleLogDetails('${log.id}')">Details</button>` : ''}
      </div>
    `;
    
    if (log.details || log.stackTrace) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'log-details-container';
      detailsDiv.id = `log-details-${log.id}`;
      detailsDiv.style.display = 'none';
      
      if (log.details) {
        const details = document.createElement('div');
        details.className = 'log-details';
        details.textContent = JSON.stringify(log.details, null, 2);
        detailsDiv.appendChild(details);
      }
      
      if (log.stackTrace) {
        const stack = document.createElement('div');
        stack.className = 'log-stack-trace';
        stack.textContent = log.stackTrace;
        detailsDiv.appendChild(stack);
      }
      
      div.appendChild(detailsDiv);
    }
    
    return div;
  }
  
  getFilteredLogs() {
    const levelFilter = document.querySelector('#log-level-filter')?.value;
    const searchFilter = document.querySelector('#log-search')?.value?.toLowerCase();
    
    let filtered = [...this.logs];
    
    if (levelFilter) {
      const minLevel = parseInt(levelFilter);
      filtered = filtered.filter(log => log.level >= minLevel);
    }
    
    if (searchFilter) {
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchFilter) ||
        (log.context && log.context.toLowerCase().includes(searchFilter)) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchFilter))
      );
    }
    
    return filtered;
  }
  
  filterLogs() {
    this.renderLogs();
  }
  
  async loadLogsForDialog() {
    try {
      this.logs = await window.electronAPI.invoke('get-logs');
      console.log(`📋 loadLogsForDialog: Loaded ${this.logs.length} logs`);
      this.renderLogs();
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }
  
  async copyLogEntry(logId) {
    try {
      const result = await window.electronAPI.invoke('copy-log-entry', logId);
      if (result.success) {
        this.showToast('Log entry copied to clipboard');
      }
    } catch (error) {
      console.error('Failed to copy log entry:', error);
    }
  }
  
  toggleLogDetails(logId) {
    const detailsDiv = document.querySelector(`#log-details-${logId}`);
    if (detailsDiv) {
      detailsDiv.style.display = detailsDiv.style.display === 'none' ? 'block' : 'none';
    }
  }
}

// Initialize the application when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PerfectWorldAccountManager();
});