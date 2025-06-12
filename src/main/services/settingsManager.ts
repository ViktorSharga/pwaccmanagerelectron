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
    processMonitoringMode: 'normal',
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
      // Check for elementclient.exe in multiple locations with case-insensitive search
      const possiblePaths = [
        settings.gamePath,
        path.join(settings.gamePath, 'element')
      ];
      
      let found = false;
      for (const basePath of possiblePaths) {
        try {
          const files = await fs.readdir(basePath);
          const executableName = files.find(file => {
            const lowerFile = file.toLowerCase();
            return lowerFile === 'elementclient.exe' ||
                   lowerFile === 'element client.exe' ||
                   lowerFile === 'element_client.exe' ||
                   (lowerFile.includes('elementclient') && lowerFile.endsWith('.exe'));
          });
          
          if (executableName) {
            const fullPath = path.join(basePath, executableName);
            await fs.access(fullPath);
            found = true;
            break;
          }
        } catch {
          // Directory doesn't exist or not accessible, continue to next path
        }
      }
      
      if (!found) {
        throw new Error('Invalid game path: ElementClient.exe not found');
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