import type { BarProvider, BarResult } from './commandbar';
import { hostOfUrl } from './constants';
import { fuzzyMatch } from './fuzzy';

// Providers backed by Chrome platform APIs. Each degrades to no results
// when the API is unavailable (e.g., dev preview outside an extension).

function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.tabs;
}

interface TabInfo {
  id?: number;
  title?: string;
  url?: string;
  windowId: number;
}

async function queryTabs(): Promise<TabInfo[]> {
  if (!hasChrome()) return [];
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => resolve(tabs as TabInfo[]));
  });
}

export const tabsProvider = (): BarProvider => ({
  id: 'tabs',
  async search(query): Promise<BarResult[]> {
    const tabs = await queryTabs();
    const results: Array<{ tab: TabInfo; score: number }> = [];
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const target = `${tab.title ?? ''} ${tab.url ?? ''}`;
      const m = fuzzyMatch(query, target);
      if (m && m.score > 30) results.push({ tab, score: m.score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 4).map(({ tab, score }) => ({
      id: `tab:${tab.id}`,
      title: tab.title || tab.url || 'Untitled tab',
      hint: 'Switch to tab',
      icon: 'tab',
      score: 120 + score / 10, // switching is cheap and relevant; mild relevance ordering
      run: () => {
        void chrome.tabs.update(tab.id!, { active: true });
        void chrome.windows?.update?.(tab.windowId, { focused: true });
      }
    }));
  }
});

interface BookmarkNode {
  id?: string;
  title?: string;
  url?: string;
}

async function searchBookmarks(query: string): Promise<BookmarkNode[]> {
  if (!hasChrome() || !chrome.bookmarks) return [];
  return new Promise((resolve) => {
    chrome.bookmarks.search(query, (nodes) => resolve(nodes.filter((n) => n.url)));
  });
}

export const bookmarksProvider = (): BarProvider => ({
  id: 'bookmarks',
  async search(query): Promise<BarResult[]> {
    const nodes = await searchBookmarks(query);
    return nodes.slice(0, 4).map((node) => ({
      id: `bm:${node.id}`,
      title: node.title || node.url!,
      hint: 'Bookmark',
      icon: 'bookmark',
      score: 90,
      run: () => {
        window.location.href = node.url!;
      }
    }));
  }
});

async function searchHistory(query: string): Promise<Array<{ title?: string; url?: string; lastVisitTime?: number }>> {
  if (!hasChrome() || !chrome.history) return [];
  const end = Date.now();
  const start = end - 30 * 24 * 60 * 60 * 1000; // last 30 days
  return new Promise((resolve) => {
    chrome.history.search(
      { text: query, startTime: start, maxResults: 20 },
      (items) => resolve(items.filter((i) => i.url))
    );
  });
}

/** History provider factory — respects the privacy toggle in settings. */
export const historyProviderFactory = (isEnabled: () => boolean): BarProvider => ({
  id: 'history',
  async search(query): Promise<BarResult[]> {
    if (!isEnabled()) return [];
    const items = await searchHistory(query);
    return items.slice(0, 4).map((item, i) => ({
      id: `hist:${item.url}`,
      title: item.title || item.url!,
      hint: 'History',
      icon: 'history',
      score: 70 - i,
      run: () => {
        window.location.href = item.url!;
      }
    }));
  }
});

interface TopSite {
  title?: string;
  url?: string;
}

async function getTopSites(): Promise<TopSite[]> {
  if (!hasChrome() || !chrome.topSites) return [];
  return new Promise((resolve) => {
    chrome.topSites.get((sites) => resolve(sites as TopSite[]));
  });
}

export const topSitesProvider = (): BarProvider => ({
  id: 'topsites',
  async search(query): Promise<BarResult[]> {
    const sites = await getTopSites();
    const results: Array<{ site: TopSite; score: number }> = [];
    for (const site of sites) {
      if (!site.url) continue;
      const target = `${site.title ?? ''} ${site.url}`;
      const m = fuzzyMatch(query, target);
      if (m && m.score > 35) results.push({ site, score: m.score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 3).map(({ site }) => ({
      id: `top:${site.url}`,
      title: site.title || site.url!,
      hint: 'Top site',
      icon: 'topsite',
      score: 60,
      run: () => {
        window.location.href = site.url!;
      }
    }));
  }
});

// --- Clipboard history (paste-captured, opt-in) ---

export interface ClipboardEntry {
  text: string;
  timestamp: number;
}

const CLIPBOARD_KEY = 'clipboardHistory';
const CLIPBOARD_CAP = 50;

export async function getClipboardEntries(): Promise<ClipboardEntry[]> {
  // Callback style: works in both real Chrome and minimal mocks
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([CLIPBOARD_KEY], (result) => {
        const entries = result?.[CLIPBOARD_KEY] as ClipboardEntry[] | undefined;
        resolve(entries ?? []);
      });
    } catch {
      resolve([]);
    }
  });
}

export async function addClipboardEntry(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  let entries = await getClipboardEntries();
  entries = entries.filter((e) => e.text !== trimmed); // dedupe: move to front
  entries.unshift({ text: trimmed, timestamp: Date.now() });
  if (entries.length > CLIPBOARD_CAP) entries.length = CLIPBOARD_CAP;
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [CLIPBOARD_KEY]: entries }, () => resolve());
  });
}

export async function clearClipboardHistory(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [CLIPBOARD_KEY]: [] }, () => resolve());
  });
}

/** Captures on explicit paste into the bar — no ambient reading. */
export function attachPasteCapture(input: HTMLInputElement, isEnabled: () => boolean): void {
  input.addEventListener('paste', () => {
    if (!isEnabled()) return;
    void (async () => {
      try {
        // navigator.clipboard.readText requires focus; paste event implies it.
        const text = await navigator.clipboard.readText();
        await addClipboardEntry(text);
        void getClipboardEntries(); // keep storage warm
      } catch {
        // permission denied or unsupported — silently skip
      }
    })();
  });
}

export const clipboardProviderFactory = (isEnabled: () => boolean): BarProvider => ({
  id: 'clipboard',
  async search(query): Promise<BarResult[]> {
    if (!isEnabled()) return [];
    const entries = await getClipboardEntries();
    const results: Array<{ entry: ClipboardEntry; score: number }> = [];
    for (const entry of entries) {
      const m = fuzzyMatch(query, entry.text.slice(0, 200));
      if (m) results.push({ entry, score: m.score - 10 }); // slight demotion vs live sources
    }
    results.sort((a, b) => b.score - a.score || b.entry.timestamp - a.entry.timestamp);
    return results.slice(0, 4).map(({ entry }) => ({
      id: `clip:${entry.timestamp}`,
      title: entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text,
      hint: 'Clipboard',
      icon: 'clipboard',
      score: 55,
      run: async () => {
        try {
          await navigator.clipboard.writeText(entry.text);
        } catch {
          // ignore
        }
      }
    }));
  }
});

// Recents for the empty state: most recent shortcuts + clipboard tail.
export async function getEmptyStateResults(
  shortcuts: Array<{ title: string; url: string }>,
  clipboardEnabled: boolean
): Promise<BarResult[]> {
  const results: BarResult[] = shortcuts.slice(0, 5).map((s) => ({
    id: `recent:${s.url}`,
    title: s.title,
    hint: hostOfUrl(s.url),
    icon: 'shortcut',
    score: 10,
    run: () => {
      window.location.href = s.url.startsWith('http') ? s.url : `https://${s.url}`;
    }
  }));

  if (clipboardEnabled) {
    const entries = await getClipboardEntries();
    for (const entry of entries.slice(0, 3)) {
      results.push({
        id: `recent-clip:${entry.timestamp}`,
        title: entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text,
        hint: 'Clipboard · Enter to copy again',
        icon: 'clipboard',
        score: 9,
        run: async () => {
          try {
            await navigator.clipboard.writeText(entry.text);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  return results;
}

