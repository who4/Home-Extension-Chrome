import { ApiClient } from './api';
import { attachPasteCapture, getEmptyStateResults } from './chrome-providers';
import { ActionRegistry, CommandBarEngine, type BarResult } from './commandbar';
import { INTERVALS, SUGGESTIONS } from './constants';
import { createFaviconElement } from './favicons';
import { t } from './i18n';
import { formatJalaliDate } from './jalali';
import { ACCENTS, SettingsUI } from './settings-ui';
import { storage } from './storage';
import type { NoteData, Settings, Shortcut } from './types';

// --- Helpers ---
const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url);

const ensureUrl = (url: string): string => (isHttpUrl(url) ? url : `https://${url}`);

// --- Global runtime state ---
let settings: Settings | null = null;
let settingsUI: SettingsUI | null = null;

interface Spotlight {
  name: string;
  color: string;
  text: string;
}

function resolveSpotlight(accent: string): Spotlight {
  // If user has a custom color palette, pick from it
  const palette = settings?.appearance.colorPalette ?? [];
  if (palette.length > 0) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    return { name: 'custom', color, text: '#ffffff' };
  }
  if (accent !== 'random') {
    const found = ACCENTS.find((a) => a.name === accent);
    if (found) return found;
  }
  return ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
}

let currentSpotlight: Spotlight = { name: 'purple', color: 'rgba(120, 50, 200, 0.15)', text: '#d8b4fe' };

function applyBackground(): void {
  document.body.classList.remove('theme-light');
  document.body.style.backgroundColor = '#050505';
  document.body.style.backgroundImage = `radial-gradient(circle at 50% 30%, ${currentSpotlight.color} 0%, transparent 60%)`;
}

// --- Clock ---
const updateTime = (): void => {
  const now = new Date();
  const timeEl = document.getElementById('time-display');
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: !(settings?.general.clock24h ?? true)
    });
  }

  const dateEl = document.getElementById('date-display');
  if (!dateEl) return;

  if (settings?.general.calendar === 'jalali') {
    dateEl.textContent = formatJalaliDate(now);
    dateEl.dir = '';
  } else {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    dateEl.dir = '';
  }
};

let clockTimer: number | undefined;
function startClock(): void {
  window.clearInterval(clockTimer);
  updateTime();
  clockTimer = window.setInterval(updateTime, 1000);
}

// --- Command Bar ---
const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
const suggestionsEl = document.getElementById('search-suggestions');

// Initialized in boot(); declared here so listeners can reference.
let barEngine: CommandBarEngine | null = null;
const actionRegistry = new ActionRegistry();

let debounceTimer: number | undefined;
let currentResults: BarResult[] = [];
let highlightedIndex = -1;
let searchSeq = 0;

function getShortcutCache(): Shortcut[] {
  return shortcutsCache;
}

function renderBarResults(results: BarResult[]): void {
  if (!suggestionsEl) return;

  if (results.length === 0) {
    clearBar();
    return;
  }

  const fragment = document.createDocumentFragment();
  results.forEach((r, index) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item' + (index === highlightedIndex ? ' highlighted' : '');
    item.dataset.resultId = r.id;

    // Icon glyph — DOM-built, no innerHTML
    const iconSpan = document.createElement('span');
    iconSpan.className = `bar-icon bar-icon-${r.icon ?? 'search'}`;
    iconSpan.textContent =
      r.icon === 'calc' ? '=' :
      r.icon === 'money' ? '⇄' :
      r.icon === 'action' ? '▸' :
      r.icon === 'bang' ? '!' :
      r.icon === 'shortcut' ? '⌘' :
      r.icon === 'tab' ? '⧉' :
      r.icon === 'bookmark' ? '★' :
      r.icon === 'history' ? '↺' :
      r.icon === 'topsite' ? '▲' :
      r.icon === 'clipboard' ? '⎘' :
      r.icon === 'ai' ? '✦' : '';

    const textWrap = document.createElement('span');
    textWrap.className = 'bar-text-wrap';

    const title = document.createElement('span');
    title.className = 'bar-title';
    title.textContent = r.title;

    textWrap.appendChild(title);
    if (r.hint) {
      const hint = document.createElement('span');
      hint.className = 'bar-hint';
      hint.textContent = r.hint;
      textWrap.appendChild(hint);
    }

    item.append(iconSpan, textWrap);
    item.addEventListener('click', () => executeResult(r));
    fragment.appendChild(item);
  });

  suggestionsEl.replaceChildren(fragment);
  suggestionsEl.classList.add('visible');
}

function clearBar(): void {
  suggestionsEl?.replaceChildren();
  suggestionsEl?.classList.remove('visible');
  currentResults = [];
  highlightedIndex = -1;
}

async function runSearch(): Promise<void> {
  if (!searchInput || !barEngine) return;
  const query = searchInput.value.trim();

  const seq = ++searchSeq;
  if (query.length < SUGGESTIONS.minQueryLength) {
    clearBar();
    return;
  }

  const { results } = await barEngine.search(query);
  if (seq !== searchSeq) return; // stale response
  currentResults = results;
  highlightedIndex = -1;
  renderBarResults(results);
}

function executeResult(r: BarResult): void {
  clearBar();
  if (searchInput) searchInput.value = '';
  r.run();
}

// Empty state: recent shortcuts + recent clipboard when bar focused with no query
async function showEmptyState(): Promise<void> {
  if (!suggestionsEl) return;
  const results = await getEmptyStateResults(
    getShortcutCache(),
    settings?.privacy.clipboardHistory ?? false
  );
  if (results.length === 0) return;
  currentResults = results;
  highlightedIndex = -1;
  renderBarResults(results);
}

if (searchInput && suggestionsEl) {
  // Clipboard history capture — only on explicit paste, only when opted in
  attachPasteCapture(searchInput, () => settings?.privacy.clipboardHistory ?? false);

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length === 0) {
      void showEmptyState();
    }
  });
  const moveHighlight = (delta: number): void => {
    if (currentResults.length === 0) return;
    highlightedIndex =
      highlightedIndex === -1
        ? delta > 0
          ? 0
          : currentResults.length - 1
        : (highlightedIndex + delta + currentResults.length) % currentResults.length;
    renderBarResults(currentResults);
  };

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    const isPersian = /[؀-ۿ]/.test(query);
    searchInput.style.direction = isPersian ? 'rtl' : 'ltr';
    searchInput.style.textAlign = isPersian ? 'right' : 'left';

    window.clearTimeout(debounceTimer);

    if (query.length < SUGGESTIONS.minQueryLength) {
      clearBar();
      return;
    }

    debounceTimer = window.setTimeout(() => {
      void runSearch();
    }, SUGGESTIONS.debounceMs);
  });

  // Global focus shortcuts: Ctrl/Cmd+K from anywhere, "/" when not typing
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const typingInField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === '/' && !typingInField) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === 'Enter') {
      const chosen =
        highlightedIndex >= 0 && currentResults[highlightedIndex]
          ? currentResults[highlightedIndex]
          : currentResults[0];
      if (chosen) {
        executeResult(chosen);
        return;
      }
      if (searchInput.value.trim()) {
        window.location.href = `https://www.google.com/search?q=${encodeURIComponent(searchInput.value.trim())}`;
      }
    } else if (e.key === 'Escape') {
      clearBar();
      searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target as Node) && !suggestionsEl.contains(e.target as Node)) {
      clearBar();
    }
  });
}

// --- References ---
const shortcutsGrid = document.getElementById('shortcuts-grid')!;
const addShortcutBtn = document.getElementById('add-shortcut-trigger');
const modal = document.getElementById('shortcut-modal')!;
const closeModalBtn = document.getElementById('close-modal');
const saveShortcutBtn = document.getElementById('save-shortcut');

// --- Shortcuts Logic ---
let shortcutsCache: Shortcut[] = [];

async function loadShortcuts(): Promise<void> {
  shortcutsCache = await storage.getShortcuts();
  renderShortcuts(shortcutsCache);
}

function renderShortcuts(shortcuts: Shortcut[]): void {
  Array.from(shortcutsGrid.children).forEach((child) => {
    if (!child.classList.contains('add-shortcut-btn')) {
      shortcutsGrid.removeChild(child);
    }
  });

  shortcuts.forEach((shortcut, index) => {
    const card = document.createElement('a');
    card.className = 'shortcut-pill';
    card.href = ensureUrl(shortcut.url || '');
    card.target = '_self';
    card.style.borderColor = currentSpotlight.text + '30';
    card.draggable = true;
    card.dataset.index = String(index);

    // Favicon loads async; nothing shows if no icon available
    void createFaviconElement(shortcut.url || '').then((favicon) => {
      if (favicon) card.appendChild(favicon);
    });

    const label = document.createElement('span');
    label.className = 'shortcut-text';
    label.textContent = shortcut.title;

    // Edit on right-click (contextmenu)
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openEditDialog(index);
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', `Edit ${shortcut.title}`);
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      openEditDialog(index);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.setAttribute('aria-label', t('deleteShortcut', { name: shortcut.title }));
    delBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      removeShortcutWithUndo(index);
    });

    card.append(label, editBtn, delBtn);

    // Drag to reorder
    card.addEventListener('dragstart', (e) => {
      dragSourceIndex = index;
      card.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', String(index));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      dragSourceIndex = -1;
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragSourceIndex !== -1 && dragSourceIndex !== index) {
        card.classList.add('drag-over');
      }
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      void reorderShortcuts(dragSourceIndex, index);
    });

    shortcutsGrid.insertBefore(card, addShortcutBtn);
  });
}

let dragSourceIndex = -1;

async function reorderShortcuts(from: number, to: number): Promise<void> {
  if (from === to || from === -1) return;
  const shortcuts = await storage.getShortcuts();
  if (from >= shortcuts.length || to >= shortcuts.length) return;
  const [moved] = shortcuts.splice(from, 1);
  shortcuts.splice(to, 0, moved);
  await storage.setShortcuts(shortcuts);
  await loadShortcuts();
}

// --- Undo delete toast ---
let undoTimer: number | undefined;

function showUndoToast(message: string, onUndo: () => void): void {
  const existing = document.getElementById('undo-toast');
  existing?.remove();
  window.clearTimeout(undoTimer);

  const toast = document.createElement('div');
  toast.id = 'undo-toast';
  toast.className = 'undo-toast';

  const text = document.createElement('span');
  text.textContent = message;

  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.textContent = 'Undo';
  undoBtn.addEventListener('click', () => {
    toast.remove();
    window.clearTimeout(undoTimer);
    onUndo();
  });

  toast.append(text, undoBtn);
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));

  undoTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

async function removeShortcutWithUndo(index: number): Promise<void> {
  const shortcuts = await storage.getShortcuts();
  const removed = shortcuts[index];
  if (!removed) return;
  shortcuts.splice(index, 1);
  await storage.setShortcuts(shortcuts);
  await loadShortcuts();

  showUndoToast(`Removed "${removed.title}"`, async () => {
    const current = await storage.getShortcuts();
    current.splice(Math.min(index, current.length), 0, removed);
    await storage.setShortcuts(current);
    await loadShortcuts();
  });
}

// --- Edit dialog ---
let editingIndex = -1;

function openEditDialog(index: number): void {
  const shortcut = shortcutsCache[index];
  if (!shortcut) return;
  editingIndex = index;

  const titleInput = document.getElementById('shortcut-title') as HTMLInputElement | null;
  const urlInput = document.getElementById('shortcut-url') as HTMLInputElement | null;
  if (!titleInput || !urlInput) return;

  titleInput.value = shortcut.title;
  urlInput.value = shortcut.url;
  saveShortcutBtn!.textContent = 'Save Changes';
  modal.style.display = 'flex';
  titleInput.focus();
}

// Add Shortcut Modal
addShortcutBtn?.addEventListener('click', () => {
  editingIndex = -1;
  const titleInput = document.getElementById('shortcut-title') as HTMLInputElement | null;
  const urlInput = document.getElementById('shortcut-url') as HTMLInputElement | null;
  if (titleInput) titleInput.value = '';
  if (urlInput) urlInput.value = '';
  if (saveShortcutBtn) saveShortcutBtn.textContent = t('addToHome');
  modal.style.display = 'flex';
});
closeModalBtn?.addEventListener('click', () => {
  editingIndex = -1;
  modal.style.display = 'none';
});

// Save Shortcut (handles both add and edit)
saveShortcutBtn?.addEventListener('click', async () => {
  const titleInput = document.getElementById('shortcut-title') as HTMLInputElement | null;
  const urlInput = document.getElementById('shortcut-url') as HTMLInputElement;
  let urlVal = urlInput.value.trim();

  if (!urlVal) return;

  urlVal = ensureUrl(urlVal);

  let title: string;
  if (titleInput?.value?.trim()) {
    title = titleInput.value.trim();
  } else {
    try {
      title = new URL(urlVal).hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      title = urlVal.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    }
  }
  title = title.charAt(0).toUpperCase() + title.slice(1);

  const shortcuts = await storage.getShortcuts();

  if (editingIndex >= 0) {
    if (shortcuts[editingIndex]) {
      shortcuts[editingIndex] = { title, url: urlVal };
    }
  } else {
    shortcuts.push({ title, url: urlVal });
  }

  await storage.setShortcuts(shortcuts);

  editingIndex = -1;
  modal.style.display = 'none';
  if (titleInput) titleInput.value = '';
  urlInput.value = '';
  if (saveShortcutBtn) saveShortcutBtn.textContent = t('addToHome');
  await loadShortcuts();
});

// Esc closes modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modal.style.display !== 'none') modal.style.display = 'none';
    if (settingsUI?.isOpen) settingsUI.close();
  }
});

// Click Outside
window.addEventListener('click', (e) => {
  if (e.target === modal) modal.style.display = 'none';
});

// --- Price Ticker ---
async function updatePrices(): Promise<void> {
  const usdEl = document.getElementById('price-usd');
  const goldEl = document.getElementById('price-gold');
  if (!usdEl || !goldEl || !settings?.widgets.priceTicker) return;

  if (usdEl.textContent?.includes(t('loadingTopStory').toLowerCase()) || usdEl.textContent?.includes('Loading')) {
    usdEl.textContent = 'Updating...';
  }

  const data = await ApiClient.fetchPrices();

  // All sources deliver Rial; single conversion point to Toman.
  const formatToman = (priceStr: string): string => {
    if (priceStr === 'Error' || priceStr === 'Unavailable') return 'Unavailable';
    const num = parseInt(priceStr.replace(/,/g, ''), 10);
    if (!Number.isFinite(num)) return priceStr;
    return (num / 10).toLocaleString('en-US');
  };

  const setPriceCell = (el: HTMLElement, value: string, trend: 'up' | 'down' | 'flat'): void => {
    el.replaceChildren();
    el.style.color = '';
    el.style.cssText = 'display:flex;align-items:center;gap:5px;';

    // Price number (always white)
    const num = document.createElement('span');
    num.style.fontWeight = '600';
    num.style.color = 'var(--text-primary)';
    num.textContent = value;

    // Unit
    const unit = document.createElement('span');
    unit.style.fontSize = '0.75em';
    unit.style.opacity = '0.6';
    unit.style.color = 'var(--text-secondary)';
    unit.textContent = 'Toman';

    // Trend indicator pill
    if (trend === 'up' || trend === 'down') {
      const pill = document.createElement('span');
      pill.style.cssText = `
        display:inline-flex;align-items:center;gap:2px;
        font-size:11px;font-weight:600;padding:1px 5px;border-radius:4px;
        background:${trend === 'up' ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'};
        color:${trend === 'up' ? '#30D158' : '#ff453a'};
      `;
      pill.textContent = trend === 'up' ? '▲' : '▼';
      el.append(num, unit, pill);
    } else {
      el.append(num, unit);
    }
  };

  setPriceCell(usdEl, formatToman(data.usd.price), data.usd.trend);
  usdEl.className = 'price-value';

  setPriceCell(goldEl, formatToman(data.gold.price), data.gold.trend);
  goldEl.className = 'price-value';
}

// --- News Widget ---
async function updateNews(): Promise<void> {
  const newsEl = document.getElementById('news-widget') as HTMLAnchorElement | null;
  const headlineEl = document.getElementById('news-headline');
  if (!newsEl || !headlineEl || !settings?.widgets.newsWidget) return;

  const article = await ApiClient.fetchNews();
  if (article) {
    headlineEl.textContent = article.title;
    newsEl.href = article.url;
    newsEl.classList.remove('news-widget--inert');
  } else {
    headlineEl.textContent = t('noRecentNews');
    newsEl.removeAttribute('href'); // inert anchor instead of blank tab
    newsEl.classList.add('news-widget--inert');
  }
}

let priceTimer: number | undefined;
let newsTimer: number | undefined;

function startWidgetTimers(): void {
  window.clearInterval(priceTimer);
  window.clearInterval(newsTimer);

  const priceWidget = document.getElementById('price-widget');
  const newsWidget = document.getElementById('news-widget');

  if (priceWidget) priceWidget.style.display = settings?.widgets.priceTicker ? '' : 'none';
  if (newsWidget) newsWidget.style.display = settings?.widgets.newsWidget ? '' : 'none';

  if (settings?.widgets.priceTicker) {
    updatePrices();
    priceTimer = window.setInterval(updatePrices, INTERVALS.prices);
  }
  if (settings?.widgets.newsWidget) {
    updateNews();
    newsTimer = window.setInterval(updateNews, INTERVALS.news);
  }
}

// --- Sticky Notes System ---
const notesContainer = document.getElementById('notes-container')!;
const addNoteBtn = document.getElementById('add-note-btn');

let notes: NoteData[] = [];
let noteZIndex = 0;

async function saveNotes(): Promise<void> {
  await storage.setNotes(notes);
}

(async () => {
  notes = await storage.getNotes();
  notes.forEach((noteData) => createNoteElement(noteData, false));
})();

// Reconcile writes from other tabs: apply per-note upserts/removals by id
// instead of blindly replacing the local array.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['stickyNotes']) return;
  const incoming = (changes['stickyNotes'].newValue as NoteData[] | undefined) || [];

  notes.filter((n) => !incoming.some((r) => r.id === n.id)).forEach((n) => {
    document.querySelector(`[data-note-id="${n.id}"]`)?.remove();
  });

  incoming.forEach((remote) => {
    const local = notes.find((n) => n.id === remote.id);
    if (!local) {
      createNoteElement(remote, false);
    } else if (local.text !== remote.text || local.x !== remote.x || local.y !== remote.y) {
      const noteEl = document.querySelector(`[data-note-id="${remote.id}"]`) as HTMLElement | null;
      const textarea = noteEl?.querySelector('textarea');
      if (textarea && document.activeElement !== textarea) {
        textarea.value = remote.text;
        autoResize(textarea);
        noteEl!.style.left = `${remote.x}px`;
        noteEl!.style.top = `${remote.y}px`;
      }
    }
  });

  notes = incoming.map((n) => ({ ...n }));
});

const autoResize = (textarea: HTMLTextAreaElement): void => {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const clampNotePosition = (x: number, y: number): { x: number; y: number } => {
  const margin = 28; // header grabbable even when mostly off-screen
  const maxX = Math.max(margin, window.innerWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - margin);
  return {
    x: Math.min(Math.max(x, -40), maxX),
    y: Math.min(Math.max(y, -10), maxY)
  };
};

const NOTE_COLORS: string[] = ['transparent', 'rgba(41,151,255,0.2)', 'rgba(48,209,88,0.2)', 'rgba(251,146,60,0.2)', 'rgba(255,69,58,0.2)', 'rgba(232,121,249,0.2)'];

function rebuildNoteContent(noteEl: HTMLElement, noteData: NoteData): void {
  const existing = noteEl.querySelector('.note-content, .note-checklist');
  if (existing) existing.remove();

  if (noteData.checklist) {
    const list = document.createElement('div');
    list.className = 'note-checklist';
    list.style.cssText = 'padding:8px 12px;display:flex;flex-direction:column;gap:2px;';
    const lines = noteData.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isChecked = line.startsWith('✓ ');
      const item = document.createElement('label');
      item.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-primary);cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isChecked;
      cb.style.cssText = 'accent-color:var(--accent-blue);';
      const span = document.createElement('span');
      span.textContent = isChecked ? line.slice(2) : line;
      span.style.cssText = isChecked ? 'text-decoration:line-through;opacity:0.5;' : '';
      cb.addEventListener('change', () => {
        lines[i] = cb.checked ? `✓ ${lines[i].replace(/^✓ /, '')}` : lines[i].replace(/^✓ /, '');
        span.textContent = cb.checked ? lines[i].slice(2) : lines[i];
        span.style.textDecoration = cb.checked ? 'line-through' : '';
        span.style.opacity = cb.checked ? '0.5' : '';
        noteData.text = lines.join('\n');
        saveNotes();
      });
      item.append(cb, span);
      list.appendChild(item);
    }
    // Add new line input
    const addInput = document.createElement('input');
    addInput.placeholder = 'Add item...';
    addInput.style.cssText = 'background:transparent;border:none;color:var(--text-primary);font-size:13px;font-family:inherit;padding:2px 0;outline:none;';
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && addInput.value.trim()) {
        lines.push(addInput.value.trim());
        noteData.text = lines.join('\n');
        addInput.value = '';
        rebuildNoteContent(noteEl, noteData);
        saveNotes();
      }
    });
    list.appendChild(addInput);
    noteEl.appendChild(list);
  } else {
    const textarea = document.createElement('textarea');
    textarea.className = 'note-content';
    textarea.placeholder = 'Note...';
    textarea.value = noteData.text;
    textarea.addEventListener('input', () => {
      autoResize(textarea);
      noteData.text = textarea.value;
      saveNotes();
    });
    noteEl.appendChild(textarea);
    if (noteData.text) setTimeout(() => autoResize(textarea), 0);
  }
}

const createNoteElement = (noteData: NoteData, isNew = false): void => {
  const noteEl = document.createElement('div');
  noteEl.className = 'sticky-note';
  noteEl.dataset.noteId = String(noteData.id);
  const pos = clampNotePosition(noteData.x, noteData.y);
  noteEl.style.left = `${pos.x}px`;
  noteEl.style.top = `${pos.y}px`;
  noteEl.style.zIndex = String(++noteZIndex);
  if (noteData.color && noteData.color !== 'transparent') {
    noteEl.style.background = noteData.color;
    noteEl.style.backdropFilter = 'blur(20px) saturate(180%)';
  }
  if (noteData.pinned) noteEl.style.zIndex = String(9999);

  const header = document.createElement('div');
  header.className = 'note-header';

  // Color dots
  const colorRow = document.createElement('div');
  colorRow.style.cssText = 'display:flex;gap:3px;padding:0 4px;flex:1;';
  for (const c of NOTE_COLORS) {
    const dot = document.createElement('button');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);background:${c === 'transparent' ? 'rgba(255,255,255,0.06)' : c};cursor:pointer;padding:0;`;
    dot.title = 'Set color';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      noteData.color = c;
      noteEl.style.background = c === 'transparent' ? '' : c;
      noteEl.style.backdropFilter = c === 'transparent' ? '' : 'blur(20px) saturate(180%)';
      saveNotes();
    });
    colorRow.appendChild(dot);
  }

  // Checklist toggle
  const checkToggle = document.createElement('button');
  checkToggle.style.cssText = 'background:transparent;border:none;color:var(--text-secondary);font-size:11px;cursor:pointer;padding:0 3px;opacity:0.6;';
  checkToggle.textContent = noteData.checklist ? '☑' : '☐';
  checkToggle.title = 'Toggle checklist';
  checkToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    noteData.checklist = !noteData.checklist;
    checkToggle.textContent = noteData.checklist ? '☑' : '☐';
    rebuildNoteContent(noteEl, noteData);
    saveNotes();
  });

  // Pin toggle
  const pinBtn = document.createElement('button');
  pinBtn.style.cssText = 'background:transparent;border:none;color:var(--text-secondary);font-size:11px;cursor:pointer;padding:0 3px;opacity:0.6;';
  pinBtn.textContent = noteData.pinned ? '📌' : '📍';
  pinBtn.title = noteData.pinned ? 'Unpin' : 'Pin to top';
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    noteData.pinned = !noteData.pinned;
    noteEl.style.zIndex = noteData.pinned ? '9999' : String(++noteZIndex);
    pinBtn.textContent = noteData.pinned ? '📌' : '📍';
    saveNotes();
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'note-close';
  closeBtn.setAttribute('aria-label', t('deleteNote'));

  header.append(colorRow, checkToggle, pinBtn, closeBtn);
  noteEl.append(header);

  const contentEl = document.createElement('div');
  noteEl.appendChild(contentEl);
  rebuildNoteContent(noteEl, noteData);

  notesContainer.appendChild(noteEl);

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notes = notes.filter((n) => n.id !== noteData.id);
    noteEl.remove();
    saveNotes();
  });

  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = noteEl.offsetLeft;
    const startTop = noteEl.offsetTop;

    const onMouseMove = (ev: MouseEvent): void => {
      const pos = clampNotePosition(startLeft + (ev.clientX - startX), startTop + (ev.clientY - startY));
      noteEl.style.left = `${pos.x}px`;
      noteEl.style.top = `${pos.y}px`;
    };

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const p = clampNotePosition(parseInt(noteEl.style.left, 10), parseInt(noteEl.style.top, 10));
      noteData.x = p.x;
      noteData.y = p.y;
      saveNotes();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  if (isNew) {
    const firstInput = noteEl.querySelector('textarea, input[type="text"]') as HTMLElement | null;
    firstInput?.focus();
  }
};

addNoteBtn?.addEventListener('click', () => {
  const offset = (notes.length % 6) * 24;
  const pos = clampNotePosition(100 + offset, 100 + offset);
  const newNote: NoteData = { id: Date.now(), x: pos.x, y: pos.y, text: '' };
  notes.push(newNote);
  createNoteElement(newNote, true);
  saveNotes();
});

// --- Static text via i18n ---
function applyStaticTexts(): void {
  const searchPlaceholder = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchPlaceholder) searchPlaceholder.placeholder = t('search');

  const addNote = document.getElementById('add-note-btn');
  if (addNote) addNote.title = t('newNote');

  const modalHeader = document.querySelector('#shortcut-modal h2');
  if (modalHeader) modalHeader.textContent = t('addShortcut');

  const titleLabel = document.querySelector('label[for="shortcut-title"]');
  if (titleLabel) titleLabel.textContent = t('name');

  const urlLabel = document.querySelector('label[for="shortcut-url"]');
  if (urlLabel) urlLabel.textContent = t('address');

  const titleField = document.getElementById('shortcut-title') as HTMLInputElement | null;
  if (titleField) titleField.placeholder = 'YouTube';

  const saveBtn = document.getElementById('save-shortcut');
  if (saveBtn) saveBtn.textContent = t('addToHome');

  const breakingLabel = document.querySelector('.news-label');
  if (breakingLabel) breakingLabel.textContent = t('breaking') + ' 🔴';
}

// Re-apply spotlight tint to existing pills when accent changes
function refreshShortcutTint(): void {
  document.querySelectorAll<HTMLElement>('.shortcut-pill').forEach((pill) => {
    pill.style.borderColor = currentSpotlight.text + '30';
  });
}

// --- Boot ---
(async function boot(): Promise<void> {
  settings = await storage.getSettings();

  currentSpotlight = resolveSpotlight(settings.appearance.accent);
  applyBackground();
  applyStaticTexts();

  // Default actions — extensible registry
  actionRegistry.register({
    name: 'New note',
    aliases: ['note', 'sticky'],
    run: () => addNoteBtn?.click()
  });
  actionRegistry.register({
    name: 'Add shortcut',
    aliases: ['shortcut', 'link'],
    run: () => (modal.style.display = 'flex')
  });
  actionRegistry.register({
    name: 'Export notes',
    aliases: ['export', 'download'],
    run: () => {
      const markdown = notes.map((n) => {
        const prefix = n.checklist ? n.text.split('\n').map((l) => `- ${l}`).join('\n') : n.text;
        return `---\n${prefix}\n`;
      }).join('\n');
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `notes-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
  actionRegistry.register({
    name: 'Export config',
    aliases: ['backup', 'save config'],
    run: async () => {
      const config = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: await storage.getSettings(),
        shortcuts: await storage.getShortcuts(),
        notes: await storage.getNotes()
      };
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `start-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
  actionRegistry.register({
    name: 'Import config',
    aliases: ['restore', 'load config'],
    run: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const config = JSON.parse(text);
          if (config.settings) await storage.saveSettings(config.settings);
          if (config.shortcuts) await storage.setShortcuts(config.shortcuts);
          if (config.notes) await storage.setNotes(config.notes);
          window.location.reload();
        } catch {
          alert('Invalid config file');
        }
      });
      input.click();
    }
  });
  barEngine = new CommandBarEngine(actionRegistry, getShortcutCache, {
    historyEnabled: () => settings?.privacy.historySearch ?? false,
    clipboardEnabled: () => settings?.privacy.clipboardHistory ?? false
  });

  // --- Bento grid (hidden for now) ---
  // Registry + init preserved for future re-enable.
  // registry.register(greetingWidget);
  // registry.register(intentionWidget);
  // registry.register(weatherWidget);
  // registry.register(calendarWidget);
  // registry.register(rssWidget);
  // registry.register(habitsWidget);
  // registry.register(focusWidget);
  // if (settings) registry.register(createFinanceWidget(settings));

  settingsUI = await SettingsUI.init(async (updated) => {
    settings = updated;
    await storage.saveSettings(updated);

    currentSpotlight = resolveSpotlight(updated.appearance.accent);
    applyBackground();
    refreshShortcutTint();

    startClock();
    startWidgetTimers();
  });

  // Gear button
  const gear = document.createElement('button');
  gear.id = 'settings-btn';
  gear.className = 'settings-gear';
  gear.title = t('settings');
  gear.setAttribute('aria-label', t('openSettings'));
  gear.textContent = '⚙';
  gear.addEventListener('click', () => settingsUI?.open());
  document.body.appendChild(gear);

  startClock();
  await loadShortcuts();
  startWidgetTimers();
})();
