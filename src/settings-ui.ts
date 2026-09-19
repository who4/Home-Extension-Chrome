import { t } from './i18n';
import { storage } from './storage';
import type { AccentName, Settings } from './types';

export interface AccentDef {
  name: Exclude<AccentName, 'random'>;
  color: string; // spotlight rgba
  text: string; // accent text hex
}

export const ACCENTS: AccentDef[] = [
  { name: 'purple', color: 'rgba(120, 50, 200, 0.15)', text: '#d8b4fe' },
  { name: 'blue', color: 'rgba(41, 151, 255, 0.15)', text: '#7dcfff' },
  { name: 'teal', color: 'rgba(50, 200, 180, 0.15)', text: '#5eead4' },
  { name: 'rose', color: 'rgba(230, 50, 100, 0.15)', text: '#fda4af' },
  { name: 'gold', color: 'rgba(230, 180, 50, 0.15)', text: '#fde047' },
  { name: 'lime', color: 'rgba(132, 204, 22, 0.15)', text: '#a3e635' },
  { name: 'orange', color: 'rgba(251, 146, 60, 0.15)', text: '#fdba74' },
  { name: 'cyan', color: 'rgba(34, 211, 238, 0.15)', text: '#67e8f9' },
  { name: 'magenta', color: 'rgba(232, 121, 249, 0.15)', text: '#f0abfc' },
  { name: 'silver', color: 'rgba(255, 255, 255, 0.12)', text: '#e5e7eb' }
];

type SectionId = 'general' | 'appearance' | 'privacy' | 'about';

interface Section {
  id: SectionId;
  labelKey: Parameters<typeof t>[0];
}

const SECTIONS: Section[] = [
  { id: 'general', labelKey: 'general' },
  { id: 'appearance', labelKey: 'appearance' },
  { id: 'privacy', labelKey: 'privacy' },
  { id: 'about', labelKey: 'about' }
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== undefined) node.textContent = textContent;
  return node;
}

export class SettingsUI {
  private settings: Settings;
  private modal: HTMLElement;
  private contentArea!: HTMLElement;
  private navButtons = new Map<SectionId, HTMLElement>();
  private activeSection: SectionId = 'general';

  constructor(
    settings: Settings,
    private onChange: (settings: Settings) => Promise<void> | void
  ) {
    this.settings = structuredClone(settings);

    // Reuse the existing #settings-modal shell from newtab.html
    const shell = document.getElementById('settings-modal')!;
    shell.replaceChildren();
    this.modal = shell;

    this.buildShell();
  }

  async open(): Promise<void> {
    this.modal.style.display = 'flex';
    this.render();
  }

  close(): void {
    this.modal.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.modal.style.display !== 'none';
  }

  private buildShell(): void {
    const content = el('div', 'modal-content settings-content');
    const header = el('div', 'modal-header');
    header.appendChild(el('h2', undefined, t('settings')));
    const closeBtn = el('button', 'close-btn');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', t('settings'));
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);
    content.appendChild(header);

    const body = el('div', 'settings-body');
    const sidebar = el('nav', 'settings-sidebar');
    sidebar.setAttribute('aria-label', t('settings'));

    for (const section of SECTIONS) {
      const btn = el('button', 'settings-nav-item', t(section.labelKey));
      btn.dataset.section = section.id;
      btn.addEventListener('click', () => {
        this.activeSection = section.id;
        this.render();
      });
      this.navButtons.set(section.id, btn);
      sidebar.appendChild(btn);
    }

    this.contentArea = el('div', 'settings-panel');
    body.append(sidebar, this.contentArea);
    content.appendChild(body);
    this.modal.appendChild(content);

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  private render(): void {
    this.navButtons.forEach((btn, id) => {
      btn.classList.toggle('active', id === this.activeSection);
      const section = SECTIONS.find((s) => s.id === id);
      if (section) btn.textContent = t(section.labelKey);
    });
    this.contentArea.replaceChildren();

    switch (this.activeSection) {
      case 'general':
        this.renderGeneral();
        break;
      case 'appearance':
        this.renderAppearance();
        break;
      case 'privacy':
        this.renderPrivacy();
        break;
      case 'about':
        this.renderAbout();
        break;
    }
  }

  private async update(partial: (s: Settings) => void): Promise<void> {
    partial(this.settings);
    await this.onChange(this.settings);
    this.render();
  }

  // --- Sections ---

  private renderGeneral(): void {
    const calGroup = el('div', 'form-group');
    calGroup.appendChild(el('label', undefined, t('calendar')));
    const calRow = el('div', 'seg-row');
    for (const [value, key] of [
      ['gregorian', 'gregorian'],
      ['jalali', 'jalali']
    ] as const) {
      const btn = el(
        'button',
        'seg-btn' + (this.settings.general.calendar === value ? ' active' : ''),
        t(key)
      );
      btn.addEventListener('click', () =>
        this.update((s) => {
          s.general.calendar = value;
        })
      );
      calRow.appendChild(btn);
    }
    calGroup.appendChild(calRow);

    const clockGroup = el('div', 'form-group');
    clockGroup.appendChild(el('label', undefined, t('clockFormat')));
    const clockRow = el('div', 'seg-row');
    for (const [is24, key] of [
      [true, 'clock24h'],
      [false, 'clock12h']
    ] as const) {
      const btn = el(
        'button',
        'seg-btn' + (this.settings.general.clock24h === is24 ? ' active' : ''),
        t(key)
      );
      btn.addEventListener('click', () =>
        this.update((s) => {
          s.general.clock24h = is24;
        })
      );
      clockRow.appendChild(btn);
    }
    clockGroup.appendChild(clockRow);

    this.contentArea.append(calGroup, clockGroup);
  }

  private renderAppearance(): void {
    // Custom color palette
    const paletteGroup = el('div', 'form-group');
    paletteGroup.appendChild(el('label', undefined, 'Spotlight colors'));

    const desc = el('div', 'settings-note');
    desc.textContent = 'Add custom colors. Each tab picks one at random.';
    desc.style.marginBottom = '8px';
    paletteGroup.appendChild(desc);

    const paletteRow = el('div', 'swatch-row');
    const palette = this.settings.appearance.colorPalette ?? [];

    for (let i = 0; i < palette.length; i++) {
      const swatch = el('button', 'accent-swatch selected');
      swatch.style.background = palette[i];
      swatch.title = 'Click to remove';
      swatch.addEventListener('click', () => {
        const newPalette = [...this.settings.appearance.colorPalette];
        newPalette.splice(i, 1);
        this.update((s) => {
          s.appearance.colorPalette = newPalette;
        });
      });
      paletteRow.appendChild(swatch);
    }

    // Color picker to add new color
    const addColor = el('input');
    addColor.type = 'color';
    addColor.value = '#2997FF';
    addColor.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px dashed rgba(255,255,255,0.2);background:none;cursor:pointer;padding:0;';
    addColor.title = 'Add a custom color';
    addColor.addEventListener('change', () => {
      // Convert hex to rgba for consistency with spotlight colors
      const hex = addColor.value;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const rgba = `rgba(${r}, ${g}, ${b}, 0.15)`;
      const newPalette = [...(this.settings.appearance.colorPalette ?? []), rgba];
      this.update((s) => {
        s.appearance.colorPalette = newPalette;
      });
    });
    paletteRow.appendChild(addColor);

    paletteGroup.appendChild(paletteRow);

    // Keep the default random option below palette
    const accentGroup = el('div', 'form-group');
    accentGroup.appendChild(el('label', undefined, t('accentColor')));

    const swatchRow = el('div', 'swatch-row');
    const current = this.settings.appearance.accent;

    const randomSwatch = el(
      'button',
      'accent-swatch accent-random' + (current === 'random' ? ' selected' : '')
    );
    randomSwatch.title = t('random');
    randomSwatch.textContent = '?';
    randomSwatch.addEventListener('click', () =>
      this.update((s) => {
        s.appearance.accent = 'random';
      })
    );
    swatchRow.appendChild(randomSwatch);

    for (const accent of ACCENTS) {
      const swatch = el('button', 'accent-swatch' + (current === accent.name ? ' selected' : ''));
      swatch.style.background = accent.color;
      swatch.style.borderColor = accent.text;
      swatch.title = accent.name.charAt(0).toUpperCase() + accent.name.slice(1);
      swatch.setAttribute('aria-label', swatch.title);
      swatch.addEventListener('click', () =>
        this.update((s) => {
          s.appearance.accent = accent.name;
        })
      );
      swatchRow.appendChild(swatch);
    }
    accentGroup.appendChild(swatchRow);

    const presetGroup = el('div', 'form-group');
    presetGroup.appendChild(el('label', undefined, t('themePreset')));
    const presetRow = el('div', 'seg-row');
    const midnight = el(
      'button',
      'seg-btn active',
      `${t('midnight')} · ${t('midnight') === 'Midnight' ? 'default' : ''}`.trim()
    );
    midnight.disabled = true; // only preset so far
    presetRow.appendChild(midnight);
    presetGroup.appendChild(presetRow);

    this.contentArea.append(accentGroup, presetGroup);
  }

  private renderPrivacy(): void {
    const toggles: Array<{ key: keyof Settings['privacy']; labelKey: Parameters<typeof t>[0] }> = [
      { key: 'historySearch', labelKey: 'historySearch' },
      { key: 'clipboardHistory', labelKey: 'clipboardHistory' }
    ];

    for (const { key, labelKey } of toggles) {
      const group = el('div', 'form-group widget-toggle-group');
      const row = el('div', 'widget-toggle-row');
      row.appendChild(el('span', 'widget-toggle-label', t(labelKey)));

      const track = el('button', 'toggle-track' + (this.settings.privacy[key] ? ' on' : ''));
      track.setAttribute('role', 'switch');
      track.setAttribute('aria-checked', String(this.settings.privacy[key]));
      const knob = el('span', 'toggle-knob');
      track.appendChild(knob);
      track.addEventListener('click', () =>
        this.update((s) => {
          s.privacy[key] = !s.privacy[key];
        })
      );

      row.appendChild(track);
      group.appendChild(row);
      this.contentArea.appendChild(group);
    }

    if (this.settings.privacy.clipboardHistory) {
      this.contentArea.appendChild(el('div', 'settings-note', t('clipboardNote')));
    }
  }

  private renderAbout(): void {
    const manifest = chrome.runtime.getManifest();

    const versionGroup = el('div', 'form-group');
    versionGroup.appendChild(el('label', undefined, t('versionLabel')));
    versionGroup.appendChild(el('div', 'settings-note', manifest.version));

    const sourcesGroup = el('div', 'form-group');
    sourcesGroup.appendChild(el('div', 'settings-note', t('dataSources')));

    const reloadBtn = el('button', 'primary-btn reload-btn', t('reloadExtension'));
    reloadBtn.addEventListener('click', () => chrome.runtime.reload());

    this.contentArea.append(versionGroup, sourcesGroup, reloadBtn);
  }

  static async init(onChange: (settings: Settings) => Promise<void> | void): Promise<SettingsUI> {
    const settings = await storage.getSettings();
    return new SettingsUI(settings, onChange);
  }
}
