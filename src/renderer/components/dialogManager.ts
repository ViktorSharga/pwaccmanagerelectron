import { Account, Settings } from '../../shared/types';

export class DialogManager {
  private dialogContainer: HTMLElement;

  constructor() {
    this.dialogContainer = document.getElementById('dialogs') || document.body;
  }

  async showAccountDialog(account?: Account): Promise<Account | null> {
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
              <input type="text" name="server" value="${account?.server || ''}" required>
            </div>
            <div class="form-group">
              <label>Character</label>
              <input type="text" name="character" value="${account?.character || ''}">
            </div>
            <div class="form-group">
              <label>Class</label>
              <input type="text" name="class" value="${account?.class || ''}">
            </div>
            <div class="form-group">
              <label>Level</label>
              <input type="number" name="level" min="1" max="105" value="${account?.level || ''}">
            </div>
            <div class="form-group">
              <label>Proxy</label>
              <input type="text" name="proxy" value="${account?.proxy || ''}">
            </div>
            <div class="form-group">
              <label>Force ID</label>
              <input type="number" name="forceID" min="0" max="255" value="${account?.forceID || ''}">
            </div>
          </form>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="save-btn">Save</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      this.dialogContainer.appendChild(overlay);
      
      const form = dialog.querySelector('#account-form') as HTMLFormElement;
      const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
      
      const cleanup = () => overlay.remove();
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      saveBtn.onclick = () => {
        const formData = new FormData(form);
        const result: Partial<Account> = {
          login: formData.get('login') as string,
          password: formData.get('password') as string,
          server: formData.get('server') as string,
        };
        
        if (account?.id) result.id = account.id;
        
        const character = formData.get('character') as string;
        if (character) result.character = character;
        
        const cls = formData.get('class') as string;
        if (cls) result.class = cls;
        
        const level = formData.get('level') as string;
        if (level) result.level = parseInt(level, 10);
        
        const proxy = formData.get('proxy') as string;
        if (proxy) result.proxy = proxy;
        
        const forceID = formData.get('forceID') as string;
        if (forceID) result.forceID = parseInt(forceID, 10);
        
        cleanup();
        resolve(result as Account);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      };
      
      setTimeout(() => {
        const firstInput = form.querySelector('input') as HTMLInputElement;
        firstInput?.focus();
      }, 100);
    });
  }

  async showSettingsDialog(settings: Settings): Promise<Settings | null> {
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
                <input type="text" name="gamePath" value="${settings.gamePath}" readonly>
                <button type="button" id="browse-btn" class="btn btn-secondary">Browse</button>
              </div>
            </div>
            <div class="form-group">
              <label>Launch Delay (seconds): ${settings.launchDelay}</label>
              <input type="range" name="launchDelay" min="1" max="30" value="${settings.launchDelay}" step="1">
            </div>
          </form>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="save-btn">Save</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      this.dialogContainer.appendChild(overlay);
      
      const form = dialog.querySelector('#settings-form') as HTMLFormElement;
      const saveBtn = dialog.querySelector('#save-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
      const browseBtn = dialog.querySelector('#browse-btn') as HTMLButtonElement;
      const gamePathInput = form.querySelector('input[name="gamePath"]') as HTMLInputElement;
      const delaySlider = form.querySelector('input[name="launchDelay"]') as HTMLInputElement;
      const delayLabel = form.querySelector('label') as HTMLLabelElement;
      
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
        resolve(null);
      };
      
      saveBtn.onclick = () => {
        const formData = new FormData(form);
        const result: Settings = {
          gamePath: formData.get('gamePath') as string,
          launchDelay: parseInt(formData.get('launchDelay') as string, 10),
        };
        
        cleanup();
        resolve(result);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      };
    });
  }

  async showConfirmDialog(title: string, message: string): Promise<boolean> {
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
      this.dialogContainer.appendChild(overlay);
      
      const confirmBtn = dialog.querySelector('#confirm-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
      
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
    });
  }

  async showErrorDialog(title: string, message: string): Promise<void> {
    return this.showInfoDialog(title, message);
  }

  async showInfoDialog(title: string, message: string): Promise<void> {
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
          <button type="button" class="btn btn-primary" id="ok-btn">OK</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      this.dialogContainer.appendChild(overlay);
      
      const okBtn = dialog.querySelector('#ok-btn') as HTMLButtonElement;
      const cleanup = () => overlay.remove();
      
      okBtn.onclick = () => {
        cleanup();
        resolve();
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve();
        }
      };
    });
  }

  async showImportTypeDialog(): Promise<'file' | 'scan' | null> {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Import Accounts</h2>
        </div>
        <div class="dialog-content">
          <p>Choose import method:</p>
          <div style="margin: 16px 0;">
            <button type="button" class="btn btn-primary" id="file-btn" style="margin-right: 8px;">Import from File</button>
            <button type="button" class="btn btn-secondary" id="scan-btn">Scan Batch Files</button>
          </div>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      this.dialogContainer.appendChild(overlay);
      
      const fileBtn = dialog.querySelector('#file-btn') as HTMLButtonElement;
      const scanBtn = dialog.querySelector('#scan-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
      
      const cleanup = () => overlay.remove();
      
      fileBtn.onclick = () => {
        cleanup();
        resolve('file');
      };
      
      scanBtn.onclick = () => {
        cleanup();
        resolve('scan');
      };
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      };
    });
  }

  async showExportFormatDialog(): Promise<'json' | 'csv' | null> {
    return new Promise((resolve) => {
      const overlay = this.createOverlay();
      const dialog = this.createDialog();
      
      dialog.innerHTML = `
        <div class="dialog-header">
          <h2>Export Accounts</h2>
        </div>
        <div class="dialog-content">
          <p>Choose export format:</p>
          <div style="margin: 16px 0;">
            <button type="button" class="btn btn-primary" id="json-btn" style="margin-right: 8px;">JSON Format</button>
            <button type="button" class="btn btn-secondary" id="csv-btn">CSV Format</button>
          </div>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
        </div>
      `;
      
      overlay.appendChild(dialog);
      this.dialogContainer.appendChild(overlay);
      
      const jsonBtn = dialog.querySelector('#json-btn') as HTMLButtonElement;
      const csvBtn = dialog.querySelector('#csv-btn') as HTMLButtonElement;
      const cancelBtn = dialog.querySelector('#cancel-btn') as HTMLButtonElement;
      
      const cleanup = () => overlay.remove();
      
      jsonBtn.onclick = () => {
        cleanup();
        resolve('json');
      };
      
      csvBtn.onclick = () => {
        cleanup();
        resolve('csv');
      };
      
      cancelBtn.onclick = () => {
        cleanup();
        resolve(null);
      };
      
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      };
    });
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    return overlay;
  }

  private createDialog(): HTMLElement {
    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    return dialog;
  }
}