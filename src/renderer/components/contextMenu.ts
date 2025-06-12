import { Account } from '../../shared/types';

export class ContextMenu {
  private menu: HTMLElement | null = null;

  show(x: number, y: number, account: Account): void {
    this.hide();
    
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    
    const items = [
      { label: 'Launch', action: 'play', disabled: account.isRunning },
      { label: 'Close', action: 'close', disabled: !account.isRunning },
      { type: 'separator' },
      { label: 'Edit', action: 'edit' },
      { label: 'Delete', action: 'delete' },
      { type: 'separator' },
      { label: 'Copy Login', action: 'copy-login' },
      { label: 'Copy Password', action: 'copy-password' },
    ];
    
    items.forEach(item => {
      if (item.type === 'separator') {
        const separator = document.createElement('div');
        separator.className = 'context-menu-separator';
        this.menu!.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.disabled) {
          menuItem.style.opacity = '0.5';
          menuItem.style.pointerEvents = 'none';
        }
        menuItem.textContent = item.label;
        
        menuItem.addEventListener('click', () => {
          this.hide();
          document.dispatchEvent(new CustomEvent('context-menu-action', {
            detail: { action: item.action, account }
          }));
        });
        
        this.menu!.appendChild(menuItem);
      }
    });
    
    document.body.appendChild(this.menu);
    
    const rect = this.menu.getBoundingClientRect();
    const adjustedX = Math.min(x, window.innerWidth - rect.width);
    const adjustedY = Math.min(y, window.innerHeight - rect.height);
    
    this.menu.style.left = `${adjustedX}px`;
    this.menu.style.top = `${adjustedY}px`;
    
    const hideOnClick = (e: MouseEvent) => {
      if (!this.menu?.contains(e.target as Node)) {
        this.hide();
        document.removeEventListener('click', hideOnClick);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', hideOnClick);
    }, 0);
  }

  hide(): void {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
  }
}