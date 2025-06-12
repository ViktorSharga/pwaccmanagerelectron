import { Account } from '../../shared/types';
import { EventEmitter } from 'events';

export class AccountTable extends EventEmitter {
  private tableBody: HTMLTableSectionElement;
  private accounts: Account[] = [];
  private selectedAccountIds = new Set<string>();

  constructor() {
    super();
    this.tableBody = document.getElementById('account-tbody') as HTMLTableSectionElement;
    if (!this.tableBody) {
      throw new Error('Account table body not found');
    }
  }

  setAccounts(accounts: Account[]): void {
    this.accounts = accounts;
    this.selectedAccountIds.clear();
    this.render();
  }

  addAccount(account: Account): void {
    this.accounts.push(account);
    this.renderAccount(account);
  }

  updateAccount(account: Account): void {
    const index = this.accounts.findIndex(a => a.id === account.id);
    if (index !== -1) {
      this.accounts[index] = account;
      this.renderAccount(account);
    }
  }

  removeAccount(accountId: string): void {
    this.accounts = this.accounts.filter(a => a.id !== accountId);
    this.selectedAccountIds.delete(accountId);
    const row = this.tableBody.querySelector(`tr[data-account-id="${accountId}"]`);
    if (row) {
      row.remove();
    }
    this.emit('selection-changed');
  }

  selectAccount(accountId: string, selected: boolean): void {
    if (selected) {
      this.selectedAccountIds.add(accountId);
    } else {
      this.selectedAccountIds.delete(accountId);
    }
    
    const row = this.tableBody.querySelector(`tr[data-account-id="${accountId}"]`) as HTMLTableRowElement;
    if (row) {
      const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = selected;
      }
      row.classList.toggle('selected', selected);
    }
    
    this.emit('selection-changed');
  }

  selectAll(selected: boolean): void {
    this.selectedAccountIds.clear();
    
    if (selected) {
      this.accounts.forEach(account => {
        this.selectedAccountIds.add(account.id);
      });
    }
    
    this.tableBody.querySelectorAll('tr').forEach(row => {
      const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = selected;
      }
      row.classList.toggle('selected', selected);
    });
    
    this.emit('selection-changed');
  }

  getSelectedAccounts(): Account[] {
    return this.accounts.filter(account => this.selectedAccountIds.has(account.id));
  }

  private render(): void {
    this.tableBody.innerHTML = '';
    this.accounts.forEach(account => {
      this.renderAccount(account);
    });
  }

  private renderAccount(account: Account): void {
    let row = this.tableBody.querySelector(`tr[data-account-id="${account.id}"]`) as HTMLTableRowElement;
    
    if (!row) {
      row = document.createElement('tr');
      row.dataset.accountId = account.id;
      this.tableBody.appendChild(row);
    }
    
    const isSelected = this.selectedAccountIds.has(account.id);
    const isRunning = account.isRunning || false;
    
    row.className = '';
    if (isSelected) row.classList.add('selected');
    if (isRunning) row.classList.add('running');
    
    row.innerHTML = `
      <td>
        <input type="checkbox" ${isSelected ? 'checked' : ''} data-account-id="${account.id}">
      </td>
      <td class="login-cell" title="Click to copy">${this.escapeHtml(account.login)}</td>
      <td class="password-cell" title="Click to copy">••••••••</td>
      <td>${this.escapeHtml(account.server)}</td>
      <td>${this.escapeHtml(account.character || '')}</td>
      <td>${this.escapeHtml(account.class || '')}</td>
      <td>${account.level || ''}</td>
      <td>${this.escapeHtml(account.proxy || '')}</td>
      <td>${account.forceID || ''}</td>
      <td>
        <span class="status-indicator ${isRunning ? 'running' : 'stopped'}">
          ${isRunning ? 'Running' : 'Stopped'}
        </span>
      </td>
      <td>
        <div class="action-buttons">
          <button class="action-btn play" ${isRunning ? 'disabled' : ''} title="Launch">
            ▶
          </button>
          <button class="action-btn close" ${!isRunning ? 'disabled' : ''} title="Close">
            ⏹
          </button>
          <button class="action-btn menu" title="More actions">
            ⋮
          </button>
        </div>
      </td>
    `;
    
    this.setupRowEventListeners(row, account);
  }

  private setupRowEventListeners(row: HTMLTableRowElement, account: Account): void {
    const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.selectAccount(account.id, checked);
    });
    
    const loginCell = row.querySelector('.login-cell');
    loginCell?.addEventListener('click', () => {
      this.emit('account-action', 'copy-login', account);
    });
    
    const passwordCell = row.querySelector('.password-cell');
    passwordCell?.addEventListener('click', () => {
      this.emit('account-action', 'copy-password', account);
    });
    
    const playButton = row.querySelector('.action-btn.play');
    playButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('account-action', 'play', account);
    });
    
    const closeButton = row.querySelector('.action-btn.close');
    closeButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.emit('account-action', 'close', account);
    });
    
    const menuButton = row.querySelector('.action-btn.menu');
    menuButton?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    row.addEventListener('dblclick', () => {
      this.emit('account-action', 'edit', account);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}