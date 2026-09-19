// Widget system — registry, layout persistence, grid engine.
// All widgets are OFF by default. Empty grid = current clean look.

import { storage } from './storage';

export interface WidgetSize {
  colSpan: number; // 1–4 cols
  rowSpan: number; // 1–2 rows
}

export interface WidgetDef {
  id: string;
  title: string;
  /** Default size; user can resize. */
  defaultSize: WidgetSize;
  /** Widget render function — called when widget is mounted or refreshed. */
  render: (container: HTMLElement) => void | Promise<void>;
  /** Called when the widget is removed from DOM. */
  cleanup?: () => void;
}

interface WidgetEntry {
  id: string;
  enabled: boolean;
  colSpan: number;
  rowSpan: number;
  col: number; // 1-based column position in the grid
  row: number; // 1-based row position
}

export interface LayoutData {
  widgets: WidgetEntry[];
  /** Last time user interacted with customize mode. */
  updatedAt: number;
}

const LAYOUT_KEY = 'bentoLayout';

const DEFAULT_LAYOUT: LayoutData = {
  widgets: [],
  updatedAt: 0
};

// --- Layout persistence ---

async function loadLayout(): Promise<LayoutData> {
  const raw = await storage.get<LayoutData | undefined>(LAYOUT_KEY);
  if (!raw || !Array.isArray(raw.widgets)) return DEFAULT_LAYOUT;
  return raw;
}

async function saveLayout(layout: LayoutData): Promise<void> {
  layout.updatedAt = Date.now();
  await storage.set(LAYOUT_KEY, layout);
}

// --- Registry ---

class WidgetRegistry {
  private widgets = new Map<string, WidgetDef>();

  register(def: WidgetDef): void {
    this.widgets.set(def.id, def);
  }

  get(id: string): WidgetDef | undefined {
    return this.widgets.get(id);
  }

  getAll(): WidgetDef[] {
    return Array.from(this.widgets.values());
  }
}

export const registry = new WidgetRegistry();

// --- Layout helpers ---

export async function isWidgetEnabled(id: string): Promise<boolean> {
  const layout = await loadLayout();
  const entry = layout.widgets.find((w) => w.id === id);
  return entry?.enabled ?? false;
}

export async function setWidgetEnabled(id: string, enabled: boolean): Promise<void> {
  const layout = await loadLayout();
  const entry = layout.widgets.find((w) => w.id === id);
  if (entry) {
    entry.enabled = enabled;
  } else {
    const def = registry.get(id);
    const colSpan = def?.defaultSize.colSpan ?? 1;
    const rowSpan = def?.defaultSize.rowSpan ?? 1;
    layout.widgets.push({
      id,
      enabled,
      colSpan,
      rowSpan,
      col: 1,
      row: layout.widgets.length + 1
    });
  }
  await saveLayout(layout);
}

export async function saveWidgetSize(id: string, colSpan: number, rowSpan: number): Promise<void> {
  const layout = await loadLayout();
  const entry = layout.widgets.find((w) => w.id === id);
  if (entry) {
    entry.colSpan = Math.max(1, Math.min(COLS, colSpan));
    entry.rowSpan = Math.max(1, Math.min(2, rowSpan));
    await saveLayout(layout);
  }
}

// --- Layout Presets ---

export interface LayoutPreset {
  id: string;
  name: string;
  /** Grid cell positions for each widget slot (col, row, colSpan, rowSpan) */
  slots: Array<{ col: number; row: number; colSpan: number; rowSpan: number }>;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'default',
    name: 'Default',
    slots: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 4, rowSpan: 1 },
      { col: 1, row: 3, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 3, colSpan: 2, rowSpan: 2 }
    ]
  },
  {
    id: 'compact',
    name: 'Compact',
    slots: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 2, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 2, rowSpan: 1 },
      { col: 1, row: 3, colSpan: 2, rowSpan: 1 },
      { col: 3, row: 3, colSpan: 2, rowSpan: 1 },
      { col: 1, row: 4, colSpan: 4, rowSpan: 1 }
    ]
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    slots: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 2 },
      { col: 1, row: 3, colSpan: 1, rowSpan: 2 },
      { col: 2, row: 1, colSpan: 3, rowSpan: 2 },
      { col: 2, row: 3, colSpan: 2, rowSpan: 2 },
      { col: 4, row: 3, colSpan: 1, rowSpan: 2 }
    ]
  },
  {
    id: 'wide',
    name: 'Wide',
    slots: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 2, rowSpan: 1 },
      { col: 1, row: 3, colSpan: 4, rowSpan: 1 },
      { col: 1, row: 4, colSpan: 4, rowSpan: 1 }
    ]
  }
];

/** Apply a layout preset to enabled widgets and persist it. */
export async function applyLayoutPreset(presetId: string): Promise<void> {
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;

  const layout = await loadLayout();
  const enabledWidgets = layout.widgets.filter((w) => w.enabled);

  for (let i = 0; i < enabledWidgets.length; i++) {
    const slot = preset.slots[i % preset.slots.length];
    enabledWidgets[i].col = slot.col;
    enabledWidgets[i].row = slot.row;
    enabledWidgets[i].colSpan = slot.colSpan;
    enabledWidgets[i].rowSpan = slot.rowSpan;
  }

  // Also update any non-enabled widgets to next row after enabled ones
  const maxRow = enabledWidgets.reduce((max, w) => Math.max(max, w.row + w.rowSpan), 0);
  const disabled = layout.widgets.filter((w) => !w.enabled);
  for (let i = 0; i < disabled.length; i++) {
    disabled[i].col = 1;
    disabled[i].row = maxRow + i;
    disabled[i].colSpan = 4;
    disabled[i].rowSpan = 1;
  }

  layout.widgets = [...enabledWidgets, ...disabled];
  await saveLayout(layout);
}

/** Get the current layout active preset id, or 'default'. */
export async function getCurrentPresetId(): Promise<string> {
  const layout = await loadLayout();
  // Compare with presets to find match
  for (const preset of LAYOUT_PRESETS) {
    const enabled = layout.widgets.filter((w) => w.enabled);
    if (enabled.length === 0 && preset.id === 'default') return 'default';
    const matches = enabled.every((w, i) => {
      const slot = preset.slots[i % preset.slots.length];
      return w.col === slot.col && w.row === slot.row && w.colSpan === slot.colSpan && w.rowSpan === slot.rowSpan;
    });
    if (matches && enabled.length === preset.slots.length) return preset.id;
  }
  return 'default';
}

// --- Grid Renderer ---

export interface GridOptions {
  container: HTMLElement;
  onCustomizeToggle?: (active: boolean) => void;
  onLayoutChange?: () => void;
}

const COLS = 4;

export class BentoGrid {
  private layout: LayoutData = DEFAULT_LAYOUT;
  private activeWidgets = new Map<string, { def: WidgetDef; container: HTMLElement }>();
  private customizeMode = false;
  private gridEl!: HTMLElement;

  constructor(private options: GridOptions) {}

  async init(): Promise<void> {
    this.layout = await loadLayout();
    this.renderGridShell();
    await this.mountActiveWidgets();
  }

  private renderGridShell(): void {
    this.options.container.replaceChildren();
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'bento-grid';
    this.options.container.appendChild(this.gridEl);
  }

  private async mountActiveWidgets(): Promise<void> {
    const enabled = this.layout.widgets.filter((w) => w.enabled);

    for (const entry of enabled) {
      const def = registry.get(entry.id);
      if (!def) continue;

      const slot = document.createElement('div');
      slot.className = 'bento-widget';
      slot.dataset.widgetId = entry.id;
      slot.dataset.colSpan = String(entry.colSpan);
      slot.dataset.rowSpan = String(entry.rowSpan);
      slot.dataset.col = String(entry.col);
      slot.dataset.row = String(entry.row);

      if (this.customizeMode) {
        slot.classList.add('bento-editing');
        this.addResizeHandles(slot);
      }

      this.gridEl.appendChild(slot);
      this.activeWidgets.set(entry.id, { def, container: slot });

      try {
        await def.render(slot);
      } catch (e) {
        console.warn(`Widget "${entry.id}" render error:`, e);
      }
    }
  }

  private addResizeHandles(slot: HTMLElement): void {
    const handle = document.createElement('button');
    handle.className = 'bento-resize-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Resize widget';
    handle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cycleSize(slot.dataset.widgetId!);
    });
    slot.appendChild(handle);
  }

  private async cycleSize(widgetId: string): Promise<void> {
    const entry = this.layout.widgets.find((w) => w.id === widgetId);
    if (!entry) return;

    // Cycle: 1×1 → 2×1 → 4×1 → 1×2 → 2×2 → 4×2 → back to 1×1
    const sizes: Array<[number, number]> = [
      [1, 1], [2, 1], [4, 1], [1, 2], [2, 2], [4, 2]
    ];
    const currentIdx = sizes.findIndex(([c, r]) => c === entry.colSpan && r === entry.rowSpan);
    const [nextCol, nextRow] = sizes[(currentIdx + 1) % sizes.length];
    entry.colSpan = nextCol;
    entry.rowSpan = nextRow;
    await saveLayout(this.layout);

    const slot = this.gridEl.querySelector(`[data-widget-id="${widgetId}"]`) as HTMLElement;
    if (slot) {
      slot.dataset.colSpan = String(nextCol);
      slot.dataset.rowSpan = String(nextRow);
    }
  }

  toggleCustomize(): boolean {
    this.customizeMode = !this.customizeMode;
    this.options.container.classList.toggle('bento-customize', this.customizeMode);
    this.options.onCustomizeToggle?.(this.customizeMode);

    // Re-render grid with or without resize handles
    this.gridEl.replaceChildren();
    this.activeWidgets.clear();
    void this.mountActiveWidgets();
    return this.customizeMode;
  }

  async refresh(): Promise<void> {
    // Cleanup existing
    for (const { def } of this.activeWidgets.values()) {
      def.cleanup?.();
    }
    this.activeWidgets.clear();
    this.gridEl.replaceChildren();

    this.layout = await loadLayout();
    await this.mountActiveWidgets();
    this.options.onLayoutChange?.();
  }

  destroy(): void {
    for (const [, { def }] of this.activeWidgets) {
      def.cleanup?.();
    }
    this.activeWidgets.clear();
    this.options.container.replaceChildren();
  }
}
