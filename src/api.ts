import { API_URLS, FINANCE_ASSETS, INTERVALS, NEWS_MAX_AGE_MS, type FinanceAssetId } from './constants';

// All price sources normalized to Rial internally; Toman conversion happens
// once at render time (script.ts).

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeDigits(text: string): string {
  // Includes U+066C (Arabic thousands separator ٬) mapped to ASCII comma.
  return text.replace(/[۰-۹٠-٩٬]/g, (ch) => {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p !== -1) return String(p);
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a !== -1) return String(a);
    return ',';
  });
}

function toRialNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseInt(normalizeDigits(raw).replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export interface PriceData {
  price: string;
  trend: 'up' | 'down' | 'flat';
}

interface BrsApiItem {
  name?: string;
  price?: string | number;
}

interface BrsApiResponse {
  currency?: BrsApiItem[];
}

// api.tgju.org summary-table-data?length=1 → newest daily OHLC row.
// Columns: [open, low, high, close, changeAmountHtml, changePercentHtml, gregorianDate, jalaliDate]
type TgjuRow = [string, string, string, string, string, string, string, string];
interface TgjuSummaryResponse {
  data?: TgjuRow[];
}

interface CachedPrice {
  value: PriceData;
  timestamp: number;
}

export class ApiClient {
  private static suggestController: AbortController | null = null;

  // In-memory cache — one fetch cycle per tab per interval even with re-renders.
  private static priceCache: Map<FinanceAssetId, CachedPrice> = new Map();

  // --- Helper: Fetch via Background Script ---
  static async fetchViaBackground(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action: 'PROXY_FETCH', url }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve(response.data as string);
          } else {
            reject(new Error((response as { error?: string })?.error || 'Unknown Error'));
          }
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  // --- News ---

  static async fetchNews(): Promise<{ title: string; url: string } | null> {
    const rssUrl = encodeURIComponent(API_URLS.newsRss);
    const apiUrl = `${API_URLS.newsConverter}?rss_url=${rssUrl}`;

    try {
      const responseText = await this.fetchViaBackground(apiUrl);
      const data = JSON.parse(responseText);

      if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        const cutoff = Date.now() - NEWS_MAX_AGE_MS;
        const recentItems = data.items
          .filter((item: { pubDate?: string }) => {
            if (!item.pubDate) return false;
            let dateStr = item.pubDate.replace(' ', 'T');
            if (!dateStr.endsWith('Z')) dateStr += 'Z';
            const ts = new Date(dateStr).getTime();
            return Number.isFinite(ts) && ts > cutoff;
          })
          .sort(
            (a: { pubDate: string }, b: { pubDate: string }) =>
              new Date(b.pubDate.replace(' ', 'T')).getTime() -
              new Date(a.pubDate.replace(' ', 'T')).getTime()
          );

        if (recentItems.length > 0) {
          return { title: recentItems[0].title, url: recentItems[0].link };
        }
      }
    } catch (e) {
      console.warn('News Fetch Failed', e);
    }
    return null;
  }

  // --- Suggestions ---

  static async fetchSuggestions(query: string): Promise<string[]> {
    if (!query) return [];

    // Abort the previous in-flight request; one BG roundtrip per settled query.
    this.suggestController?.abort();
    const controller = new AbortController();
    this.suggestController = controller;

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'FETCH_SUGGESTIONS', query }, (response) => {
          if (controller.signal.aborted) return;
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          if (response && response.success) {
            resolve(response.data as string[]);
          } else {
            resolve([]);
          }
        });
      } catch {
        resolve([]);
      }
    });
  }

  // --- Prices ---
  //
  // Source chain per asset:
  //   1. cache (< INTERVALS.priceCache old)
  //   2. TGJU JSON API (~400 bytes, includes change direction)
  //   3. TGJU profile page scrape (heavy fallback)
  //   4. brsapi free endpoint

  static async fetchPrices(): Promise<Record<FinanceAssetId, PriceData>> {
    const ids = Object.keys(FINANCE_ASSETS) as FinanceAssetId[];
    const results = await Promise.all(ids.map((id) => this.fetchAssetPrice(id)));
    const out = {} as Record<FinanceAssetId, PriceData>;
    ids.forEach((id, i) => { out[id] = results[i]; });
    return out;
  }

  static async fetchAssetPrice(asset: FinanceAssetId): Promise<PriceData> {
    const cached = this.priceCache.get(asset);
    if (cached && Date.now() - cached.timestamp < INTERVALS.priceCache) {
      return cached.value;
    }

    const jsonResult = await this.fetchTgjuJson(asset).catch(() => null);
    let result: PriceData = jsonResult ?? { price: 'Error', trend: 'flat' };

    if (result.price === 'Error' && (asset === 'usd' || asset === 'gold')) {
      result = await this.fetchProfileData(asset === 'usd' ? API_URLS.dollarProfile : API_URLS.goldProfile);
    }
    if (result.price === 'Error') {
      result = await this.fetchBrsAsset(asset);
    }

    if (result.price !== 'Error') {
      this.priceCache.set(asset, { value: result, timestamp: Date.now() });
    }
    return result;
  }

  private static async fetchTgjuJson(asset: FinanceAssetId): Promise<PriceData> {
    const symbol = FINANCE_ASSETS[asset].tgju;
    const url = `https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}?length=1`;
    const text = await this.fetchViaBackground(url);
    const json = JSON.parse(text) as TgjuSummaryResponse;
    const row = json.data?.[0];
    if (!row || !Array.isArray(row)) return { price: 'Error', trend: 'flat' };

    const rial = toRialNumber(row[3]); // close column
    if (rial === null) return { price: 'Error', trend: 'flat' };

    // Change direction: span class "high" → price rose, "low" → fell.
    const changeHtml = row[5] ?? '';
    let trend: PriceData['trend'] = 'flat';
    if (/class="high"/.test(changeHtml)) trend = 'up';
    else if (/class="low"/.test(changeHtml)) trend = 'down';

    return { price: rial.toLocaleString('en-US'), trend };
  }

  static async fetchProfileData(url: string): Promise<PriceData> {
    try {
      const html = await this.fetchViaBackground(url);
      const parsed = this.parseProfilePage(html);
      if (parsed.price !== 'Error') return parsed;
    } catch {
      // fall through
    }
    return { price: 'Error', trend: 'flat' };
  }

  static parseProfilePage(html: string): PriceData {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      let el = doc.querySelector('.info-price-left .value');
      if (el) return { price: this.cleanPrice(el.textContent || ''), trend: 'flat' };

      el = doc.querySelector('.price');
      if (el && /\d/.test(normalizeDigits(el.textContent || ''))) {
        return { price: this.cleanPrice(el.textContent || ''), trend: 'flat' };
      }

      const rows = doc.querySelectorAll('tr');
      for (const row of Array.from(rows)) {
        const rowText = normalizeDigits(row.textContent || '');
        if (rowText.includes('نرخ فعلی') || rowText.includes('Current')) {
          const val = row.querySelector('td:nth-child(2), .value');
          if (val) return { price: this.cleanPrice(val.textContent || ''), trend: 'flat' };
        }
      }
    } catch {
      // scraping error
    }
    return { price: 'Error', trend: 'flat' };
  }

  private static async fetchBrsAsset(asset: FinanceAssetId): Promise<PriceData> {
    try {
      const json = await this.fetchBrsApiJson();
      const brsapiName = FINANCE_ASSETS[asset].brsapiName;
      const item = json.currency?.find((c) => c.name?.toLowerCase() === brsapiName);
      const rial = toRialNumber(item?.price);
      if (rial !== null) {
        return { price: rial.toLocaleString('en-US'), trend: 'flat' };
      }
    } catch {
      // all sources exhausted
    }
    return { price: 'Error', trend: 'flat' };
  }

  // brsapi /FreeTether/latest serves Rial-scale values for usd/gold keys.
  private static async fetchBrsApiJson(): Promise<BrsApiResponse> {
    const responseText = await this.fetchViaBackground(API_URLS.fallbackApi);
    return JSON.parse(responseText) as BrsApiResponse;
  }

  static cleanPrice(text: string): string {
    const normalized = normalizeDigits(text);
    const match = normalized.match(/[\d,]+/);
    return match ? match[0] : 'Error';
  }
}
