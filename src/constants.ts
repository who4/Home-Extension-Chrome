// Storage keys — single source of truth
export const STORAGE_KEYS = {
  shortcuts: 'shortcuts',
  stickyNotes: 'stickyNotes',
  settings: 'settings'
} as const;

// Refresh intervals (ms)
export const INTERVALS = {
  prices: 5 * 60 * 1000, // 5 min
  news: 15 * 60 * 1000, // 15 min
  priceCache: 5 * 60 * 1000, // successful parse cache lifetime
  alarmFetch: 30 * 60 * 1000 // background fetch interval (alarm)
} as const;

// News freshness window
export const NEWS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Suggestion settings
export const SUGGESTIONS = {
  debounceMs: 200,
  maxItems: 3,
  minQueryLength: 2
} as const;

// API endpoints
export const API_URLS = {
  dollarProfile: 'https://www.tgju.org/profile/price_dollar_rl',
  goldProfile: 'https://www.tgju.org/profile/geram18',
  fallbackApi: 'https://brsapi.ir/FreeTether/latest',
  newsRss: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  newsConverter: 'https://api.rss2json.com/v1/api.json'
} as const;

// Finance assets — TGJU symbols + labels
export type FinanceAssetId = 'usd' | 'gold';

export const FINANCE_ASSETS: Record<FinanceAssetId, { name: string; symbol: string; tgju: string; brsapiName: string }> = {
  usd:  { name: 'Dollar',   symbol: '$',    tgju: 'price_dollar_rl',  brsapiName: 'usd' },
  gold: { name: 'Gold',     symbol: 'Gram',  tgju: 'geram18',          brsapiName: 'gold' }
} as const;

// Price history ring buffer — 720 points × 30min = 15 days
export const PRICE_HISTORY_MAX = 720;
export const PRICE_HISTORY_KEY = 'priceHistory';

export function hostOfUrl(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
