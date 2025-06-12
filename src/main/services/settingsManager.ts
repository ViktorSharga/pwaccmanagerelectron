import Store from 'electron-store';
import { Settings } from '../../shared/types';
import * as path from 'path';
import * as fs from 'fs/promises';

interface StoreSchema {
  settings: Settings;
}

export class SettingsManager {
  private store: Store<StoreSchema>;
  private defaultSettings: Settings = {
    gamePath: '',
    launchDelay: 5,
  };

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        settings: this.defaultSettings,
      },
      schema: {
        settings: {
          type: 'object',
          properties: {
            gamePath: {
              type: 'string',
            },
            launchDelay: {
              type: 'number',
              minimum: 1,
              maximum: 30,
            },
            windowBounds: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number' },
                height: { type: 'number' },
              },
            },
          },
          required: ['gamePath', 'launchDelay'],
        },
      },
    });
  }

  async getSettings(): Promise<Settings> {
    return this.store.get('settings');
  }

  async saveSettings(settings: Settings): Promise<void> {
    if (settings.launchDelay < 1 || settings.launchDelay > 30) {
      throw new Error('Launch delay must be between 1 and 30 seconds');
    }

    if (settings.gamePath) {
      const elementClientPath = path.join(settings.gamePath, 'element', 'elementclient.exe');
      try {
        await fs.access(elementClientPath);
      } catch {
        throw new Error('Invalid game path: elementclient.exe not found');
      }
    }

    this.store.set('settings', settings);
  }

  saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    const settings = this.store.get('settings');
    settings.windowBounds = bounds;
    this.store.set('settings', settings);
  }

  getWindowBounds(): { x: number; y: number; width: number; height: number } | undefined {
    return this.store.get('settings').windowBounds;
  }
}