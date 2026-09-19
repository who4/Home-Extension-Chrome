import { STORAGE_KEYS } from './constants';
import type { Settings, Shortcut, NoteData } from './types';

export const DEFAULT_SETTINGS: Settings = {
  appearance: {
    accent: 'random',
    themePreset: 'midnight',
    colorPalette: []
  },
  general: {
    calendar: 'gregorian',
    clock24h: true
  },
  widgets: {
    priceTicker: true,
    newsWidget: true,
    greeting: false,
    intention: false,
    weather: false,
    calendar: false,
    rss: false,
    habits: false,
    focus: false
  },
  privacy: {
    historySearch: true,
    clipboardHistory: false
  },
  finance: {
    assets: ['usd', 'gold'],
    alerts: []
  }
};

export const SCHEMA_VERSION = 1; // for future migrations

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Deep-merge stored settings over defaults so newly-added keys always exist.
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (!isPlainObject(stored) || !isPlainObject(defaults)) {
    return (isPlainObject(defaults) ? { ...defaults } : stored) as T;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults as Record<string, unknown>)) {
    const dVal = (defaults as Record<string, unknown>)[key];
    const sVal = (stored as Record<string, unknown>)[key];
    if (sVal === undefined) continue;
    // If default is an array, stored must also be an array; otherwise fall back to default
    if (Array.isArray(dVal) && !Array.isArray(sVal)) continue;
    out[key] = isPlainObject(dVal) ? mergeWithDefaults(dVal, sVal) : sVal;
  }
  return out as T;
}

type ChangeListener = (changes: Record<string, unknown>, area: string) => void;

class StorageService {
  private listeners: Set<ChangeListener> = new Set();

  get<T>(key: string): Promise<T | undefined>;
  get<T>(key: string, fallback: T): Promise<T>;
  async get<T>(key: string, fallback?: T): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const value = result[key];
          resolve(value === undefined ? fallback : (value as T));
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  onChanged(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      this.listeners.forEach((l) => l(changes as Record<string, unknown>, area));
    });
  }

  // --- Typed convenience accessors ---

  async getShortcuts(): Promise<Shortcut[]> {
    return this.get<Shortcut[]>(STORAGE_KEYS.shortcuts, []);
  }

  async setShortcuts(shortcuts: Shortcut[]): Promise<void> {
    await this.set(STORAGE_KEYS.shortcuts, shortcuts);
  }

  async getNotes(): Promise<NoteData[]> {
    return this.get<NoteData[]>(STORAGE_KEYS.stickyNotes, []);
  }

  async setNotes(notes: NoteData[]): Promise<void> {
    await this.set(STORAGE_KEYS.stickyNotes, notes);
  }

  async getSettings(): Promise<Settings> {
    const raw = await this.get<unknown>(STORAGE_KEYS.settings);
    return mergeWithDefaults(DEFAULT_SETTINGS, raw);
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.set(STORAGE_KEYS.settings, settings);
  }
}

export const storage = new StorageService();
