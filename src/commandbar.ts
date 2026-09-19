import { fuzzyMatch } from './fuzzy';
import { evaluateExpression, formatResult } from './calculator';
import { convertToToman, parseConversionQuery } from './currency';
import { ApiClient } from './api';
import { hostOfUrl } from './constants';
import { isAIReady, parseNLCommand } from './ai';
import {
  clipboardProviderFactory,
  historyProviderFactory,
  tabsProvider,
  bookmarksProvider,
  topSitesProvider
} from './chrome-providers';
import { storage } from './storage';
import type { Shortcut } from './types';

// --- Result model ---

export interface BarResult {
  id: string;
  /** Primary display text */
  title: string;
  /** Secondary text shown under/right of title */
  hint?: string;
  icon?:
    | 'shortcut'
    | 'calc'
    | 'money'
    | 'action'
    | 'search'
    | 'bang'
    | 'tab'
    | 'bookmark'
    | 'history'
    | 'topsite'
    | 'clipboard'
    | 'ai';
  /** Enter executes this */
  run: () => void;
  /** Higher sorts first. Providers return raw relevance; engine adds provider weight. */
  score: number;
}

export interface BarProvider {
  id: string;
  /** true → skip other providers (bangs do this) */
  exclusive?: boolean;
  search(query: string): Promise<BarResult[]> | BarResult[];
}

// --- Bangs ---

export interface BangDef {
  short: string; // "g"
  urlTemplate: string; // uses %s
  name: string;
}

export const BUILT_IN_BANGS: BangDef[] = [
  { short: 'g', name: 'Google', urlTemplate: 'https://www.google.com/search?q=%s' },
  { short: 'd', name: 'DuckDuckGo', urlTemplate: 'https://duckduckgo.com/?q=%s' },
  { short: 'y', name: 'YouTube', urlTemplate: 'https://www.youtube.com/results?search_query=%s' },
  { short: 'w', name: 'Wikipedia', urlTemplate: 'https://en.wikipedia.org/wiki/Special:Search?search=%s' },
  { short: 'gh', name: 'GitHub', urlTemplate: 'https://github.com/search?q=%s' }
];

const CUSTOM_BANGS_KEY = 'customBangs';

export async function getCustomBangs(): Promise<BangDef[]> {
  return storage.get<BangDef[]>(CUSTOM_BANGS_KEY, []);
}

export async function saveCustomBang(bang: BangDef): Promise<void> {
  const all = await getCustomBangs();
  const idx = all.findIndex((b) => b.short === bang.short);
  if (idx >= 0) all[idx] = bang;
  else all.push(bang);
  await storage.set(CUSTOM_BANGS_KEY, all);
}

function resolveBang(short: string, custom: BangDef[]): BangDef | undefined {
  return (
    BUILT_IN_BANGS.find((b) => b.short === short) ||
    custom.find((b) => b.short === short)
  );
}

const navigate = (url: string): void => {
  window.location.href = url;
};

/** "!gh react" or bare "!g" */
function parseBangQuery(query: string, custom: BangDef[]): { bang: BangDef; rest: string } | null {
  const m = query.match(/^!(\w+)\s*(.*)$/);
  if (!m) return null;
  const bang = resolveBang(m[1], custom);
  if (!bang) return null;
  return { bang, rest: m[2].trim() };
}

export const bangProvider = (): BarProvider => ({
  id: 'bang',
  exclusive: true,
  async search(query) {
    const parsed = parseBangQuery(query, await getCustomBangs());
    if (!parsed) return [];
    const url = parsed.bang.urlTemplate.includes('%s')
      ? parsed.bang.urlTemplate.replace('%s', encodeURIComponent(parsed.rest))
      : parsed.bang.urlTemplate;
    return [
      {
        id: `bang:${parsed.bang.short}`,
        title: parsed.rest ? `Search ${parsed.bang.name}: ${parsed.rest}` : `Open ${parsed.bang.name}`,
        hint: `!${parsed.bang.short}`,
        icon: 'bang',
        score: 1000,
        run: () => navigate(url)
      }
    ];
  }
});

// --- Calculator ---

const calculatorProvider = (): BarProvider => ({
  id: 'calculator',
  search(query) {
    // Heuristic: must contain a digit and an operator/func to avoid hijacking searches like "covid"
    if (!/\d/.test(query)) return [];
    if (!/[+\-*/%^×÷]|sqrt|sin|cos|tan|log|ln/i.test(query)) return [];

    const value = evaluateExpression(query);
    if (value === null) return [];
    const formatted = formatResult(value);
    return [
      {
        id: 'calc:result',
        title: formatted,
        hint: query.trim(),
        icon: 'calc',
        score: 900,
        run: async () => {
          try {
            await navigator.clipboard.writeText(formatted);
          } catch {
            // clipboard denied — just don't crash
          }
        }
      }
    ];
  }
});

// --- Currency ---

const currencyProvider = (): BarProvider => ({
  id: 'currency',
  async search(query): Promise<BarResult[]> {
    const parsed = parseConversionQuery(query);
    if (!parsed) return [];

    // Rates are cached by ApiClient so this resolves fast after first load.
    const prices = await lastPrices();
    const usd = prices.usd.price;
    const gold = prices.gold.price;
    const rates = {
      usdToman: usd !== 'Error' ? Number(usd.replace(/,/g, '')) / 10 : null,
      goldToman: gold !== 'Error' ? Number(gold.replace(/,/g, '')) / 10 : null
    };
    const total = convertToToman(parsed, rates);

    return [
      {
        id: 'currency:result',
        title: total !== null ? `${formatResult(total)} Toman` : 'Rate unavailable',
        hint: `${parsed.amount} ${parsed.asset.toUpperCase()}`,
        icon: 'money',
        score: 850,
        run: () => {}
      }
    ];
  }
});

// Price fetch is cached by ApiClient so repeated calls are free.
// Add a TTL so stale data doesn't persist indefinitely.
let priceMemo: Awaited<ReturnType<typeof ApiClient.fetchPrices>> | null = null;
let priceMemoTimestamp = 0;
const PRICE_MEMO_TTL = 5 * 60 * 1000; // 5 minutes

async function lastPrices() {
  const now = Date.now();
  if (!priceMemo || now - priceMemoTimestamp > PRICE_MEMO_TTL) {
    priceMemo = await ApiClient.fetchPrices();
    priceMemoTimestamp = now;
  }
  return priceMemo;
}

// --- Actions registry ---

export interface ActionDef {
  name: string;
  aliases?: string[];
  run: () => void;
}

export class ActionRegistry {
  private actions: ActionDef[] = [];

  register(action: ActionDef): void {
    this.actions.push(action);
  }

  getAll(): ActionDef[] {
    return [...this.actions];
  }

  searchActions(query: string): Array<{ action: ActionDef; score: number }> {
    const terms = [query];
    const results: Array<{ action: ActionDef; score: number }> = [];
    for (const action of this.actions) {
      const names = [action.name, ...(action.aliases || [])];
      let best = 0;
      for (const term of terms) {
        for (const name of names) {
          const m = fuzzyMatch(term, name);
          if (m && m.score > best) best = m.score;
        }
      }
      if (best > 0) results.push({ action, score: best });
    }
    return results.sort((a, b) => b.score - a.score);
  }
}

const actionsProvider = (registry: ActionRegistry): BarProvider => ({
  id: 'actions',
  search(query) {
    return registry.searchActions(query).map(({ action, score }) => ({
      id: `action:${action.name}`,
      title: action.name,
      hint: 'Action',
      icon: 'action',
      score,
      run: action.run
    }));
  }
});

// --- Shortcuts ---

const shortcutsProvider = (getShortcuts: () => Shortcut[]): BarProvider => ({
  id: 'shortcuts',
  search(query) {
    const results: BarResult[] = [];
    for (const s of getShortcuts()) {
      const m = fuzzyMatch(query, s.title);
      if (m) {
        results.push({
          id: `shortcut:${s.url}`,
          title: s.title,
          hint: hostOfUrl(s.url),
          icon: 'shortcut',
          score: m.score + 30, // slight boost — user-curated
          run: () => navigate(s.url.startsWith('http') ? s.url : `https://${s.url}`)
        });
      }
    }
    return results;
  }
});

// --- Google suggestions ---

const suggestionsProvider = (): BarProvider => ({
  id: 'suggestions',
  async search(query) {
    const results = await ApiClient.fetchSuggestions(query);
    return results.slice(0, 5).map((text) => ({
      id: `sugg:${text}`,
      title: text,
      hint: 'Google',
      icon: 'search',
      score: 40,
      run: () =>
        navigate(`https://www.google.com/search?q=${encodeURIComponent(text)}`)
    }));
  }
});

// --- AI NL Commands ---

const aiNlProvider = (registry: ActionRegistry): BarProvider => ({
  id: 'ai-nl',
  async search(query): Promise<BarResult[]> {
    // Only use AI for natural-looking queries (3+ words, not a calculator expression, not a bang)
    if (!isAIReady()) return [];
    if (/^[!]/.test(query)) return [];
    if (/^[\d+\-*/%^().\s]+$/.test(query)) return [];
    if (query.split(/\s+/).length < 3) return [];

    const result = await parseNLCommand(query);
    if (!result || result.action === 'none' || result.confidence < 0.5) return [];

    const actionMap: Record<string, string> = {
      create_note: 'New note',
      remove_shortcut: 'Add shortcut',
      add_shortcut: 'Add shortcut',
      toggle_setting: 'Settings',
      start_focus: 'Start focus',
      search: 'Google',
      none: ''
    };

    const actionName = actionMap[result.action];
    if (!actionName) return [];

    const matched = registry.searchActions(actionName);
    if (matched.length === 0) return [];

    return [{
      id: `ai:${result.action}`,
      title: `${matched[0].action.name}${result.params.query ? `: ${result.params.query}` : ''}`,
      hint: `AI suggestion`,
      icon: 'action',
      score: 50,
      run: matched[0].action.run
    }];
  }
});

// --- Engine ---

export interface MergedResults {
  results: BarResult[];
  exclusive: boolean;
}

export interface EngineOptions {
  historyEnabled?: () => boolean;
  clipboardEnabled?: () => boolean;
}

export class CommandBarEngine {
  private providers: BarProvider[] = [];

  constructor(
    registry: ActionRegistry,
    getShortcuts: () => Shortcut[],
    options: EngineOptions = {}
  ) {
    const { historyEnabled = () => false, clipboardEnabled = () => false } = options;

    // Chrome API providers — degrade gracefully outside an extension context.
    // Gated providers self-check at search time so toggles apply live.
    this.providers.push(
      tabsProvider(),
      bookmarksProvider(),
      topSitesProvider(),
      historyProviderFactory(historyEnabled),
      clipboardProviderFactory(clipboardEnabled),
      bangProvider(),
      calculatorProvider(),
      currencyProvider(),
      actionsProvider(registry),
      shortcutsProvider(getShortcuts),
      suggestionsProvider(),
      aiNlProvider(registry)
    );
  }

  private static providerWeight(id: string): number {
    switch (id) {
      case 'bang':
        return 0;
      case 'tabs':
        return 25;
      case 'shortcuts':
        return 20;
      case 'actions':
        return 15;
      case 'bookmarks':
        return 12;
      case 'calculator':
      case 'currency':
        return 10;
      case 'clipboard':
        return 8;
      case 'history':
        return 6;
      case 'topsites':
        return 4;
      default:
        return 0;
    }
  }

  async search(query: string): Promise<MergedResults> {
    const q = query.trim();
    if (!q) return { results: [], exclusive: false };

    let exclusive = false;

    const settled = await Promise.all(
      this.providers.map(async (p) => {
        try {
          return { provider: p.id, results: await p.search(q) };
        } catch {
          return { provider: p.id, results: [] as BarResult[] };
        }
      })
    );

    for (const s of settled) {
      if (s.results.length > 0 && this.providers.find((p) => p.id === s.provider)?.exclusive) {
        exclusive = true;
      }
    }

    const merged = new Map<string, BarResult>();
    for (const s of settled) {
      const weight = CommandBarEngine.providerWeight(s.provider);
      for (const r of s.results) {
        const weighted = { ...r, score: r.score + weight };
        const existing = merged.get(r.id);
        if (!existing || existing.score < weighted.score) merged.set(r.id, weighted);
      }
    }

    const results = Array.from(merged.values()).sort((a, b) => b.score - a.score).slice(0, 8);

    // Fallback: plain Google search for the raw query
    if (results.length === 0) {
      results.push({
        id: 'fallback:google',
        title: q,
        hint: 'Google Search',
        icon: 'search',
        score: 0,
        run: () => navigate(`https://www.google.com/search?q=${encodeURIComponent(q)}`)
      });
    }

    return { results, exclusive };
  }
}
