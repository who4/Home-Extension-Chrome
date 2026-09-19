import type {
  BackgroundRequest,
  BackgroundResponse,
  ErrorResponse,
  FetchSuggestionsRequest,
  ProxyFetchRequest,
  SuccessResponse
} from './types';
import { FINANCE_ASSETS } from './constants';

interface GetFaviconRequest {
  action: 'GET_FAVICON';
  domain: string;
}

type Handler = (
  request: never, // narrowed by registry wrapper below
  sendResponse: (response: BackgroundResponse) => void
) => void;

// Only the newest suggestion request's response is delivered; stale fetches
// still complete but their results are discarded.
let suggestionGeneration = 0;

const handlers: Record<string, Handler> = {
  FETCH_SUGGESTIONS: (request: unknown, sendResponse) => {
    const { query } = request as FetchSuggestionsRequest;
    const generation = ++suggestionGeneration;
    const targetUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;

    fetch(targetUrl)
      .then((response) => response.json())
      .then((data: unknown[]) => {
        if (generation !== suggestionGeneration) return;
        const payload: string[] = Array.isArray(data[1]) ? data[1] : [];
        const res: SuccessResponse<string[]> = { success: true, data: payload };
        sendResponse(res);
      })
      .catch((error: Error) => {
        if (generation !== suggestionGeneration) return;
        const res: ErrorResponse = { success: false, error: error.message };
        sendResponse(res);
      });
  },

  PROXY_FETCH: (request: unknown, sendResponse) => {
    const { url } = request as ProxyFetchRequest;

    // URL allowlist — only allow hostnames matching host_permissions in manifest
    const ALLOWED_HOSTS = ['google.com', 'tgju.org', 'brsapi.ir', 'rss2json.com'];
    try {
      const hostname = new URL(url).hostname;
      const allowed = ALLOWED_HOSTS.some(
        (h) => hostname === h || hostname.endsWith('.' + h)
      );
      if (!allowed) {
        sendResponse({ success: false, error: 'URL not in allowlist' } as ErrorResponse);
        return;
      }
    } catch {
      sendResponse({ success: false, error: 'Invalid URL' } as ErrorResponse);
      return;
    }

    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(response.statusText);
        const text = await response.text();
        const res: SuccessResponse<string> = { success: true, data: text };
        sendResponse(res);
      })
      .catch((error: Error) => {
        const res: ErrorResponse = { success: false, error: error.message };
        sendResponse(res);
      });
  },

  GET_FAVICON: (request: unknown, sendResponse) => {
    const { domain } = request as GetFaviconRequest;
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(domain)}`;

    fetch(faviconUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(response.statusText);
        const blob = await response.blob();
        // Convert to dataURL via FileReader in SW
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(blob);
        });
        const res: SuccessResponse<string> = { success: true, data: dataUrl };
        sendResponse(res);
      })
      .catch((error: Error) => {
        const res: ErrorResponse = { success: false, error: error.message };
        sendResponse(res);
      });
  }
};

chrome.runtime.onMessage.addListener((request: BackgroundRequest, _sender, sendResponse) => {
  const handler = handlers[request?.action];
  if (!handler) return undefined;

  handler(request as never, sendResponse);
  // Returning true keeps the message channel open for the async response.
  return true;
});

// --- Context menu: "Add to Start" ---

const CONTEXT_MENU_ID = 'start-add-shortcut';

if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Add to Start',
      contexts: ['link', 'page']
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;

    const url = info.linkUrl || info.pageUrl;
    if (!url) return;

    let title: string;
    if (tab?.title) {
      title = tab.title;
    } else {
      try {
        title = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
      } catch {
        title = 'Shortcut';
      }
    }
    title = title.charAt(0).toUpperCase() + title.slice(1);

    chrome.storage.local.get(['shortcuts'], (result) => {
      const shortcuts = (result.shortcuts as Array<{ title: string; url: string }> | undefined) || [];
      if (shortcuts.some((s) => s.url === url)) return; // dedupe
      shortcuts.push({ title, url });
      chrome.storage.local.set({ shortcuts });
    });
  });
}

// --- Price history alarm ---

const PRICE_ALARM = 'fetch-prices';
const ALARM_MINUTES = 30;

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(PRICE_ALARM, {
      periodInMinutes: ALARM_MINUTES,
      delayInMinutes: 1 // first run after install
    });
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== PRICE_ALARM) return;

    // Fetch enabled assets and store history points
    try {
      const settingsResult = await chrome.storage.local.get(['settings']);
      const settings = settingsResult.settings as { finance?: { assets?: string[]; alerts?: Array<{ asset: string; above?: number; below?: number; enabled: boolean }> } } | undefined;
      const assets = settings?.finance?.assets || ['usd', 'gold'];

      for (const assetId of assets) {
        const assetDef = FINANCE_ASSETS[assetId as keyof typeof FINANCE_ASSETS];
        if (!assetDef) continue;
        const symbol = assetDef.tgju;
        try {
          const resp = await fetch(`https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}?length=1`);
          const json = await resp.json();
          const row = json.data?.[0];
          if (!row || !Array.isArray(row)) continue;

          const priceStr = String(row[3]).replace(/[^\d]/g, '');
          const price = parseInt(priceStr, 10);
          if (!Number.isFinite(price) || price <= 0) continue;

          // NOTE: Trend detection depends on TGJU's HTML class="high"/"low" on the change cell.
          // Fallback: if neither class matches, check for direction text (up/down) in the HTML
          // before defaulting to flat.
          const changeHtml = String(row[5] ?? '');
          let trend: 'up' | 'down' | 'flat' = 'flat';
          if (/class="high"/.test(changeHtml)) {
            trend = 'up';
          } else if (/class="low"/.test(changeHtml)) {
            trend = 'down';
          } else if (/\b(up|rising|▲|⬆)/i.test(changeHtml)) {
            trend = 'up';
          } else if (/\b(down|falling|▼|⬇)/i.test(changeHtml)) {
            trend = 'down';
          }

          const historyKey = 'priceHistory';
          const historyResult = await chrome.storage.local.get([historyKey]);
          const store = (historyResult[historyKey] || {}) as Record<string, Array<{ t: number; p: number; trend: string }>>;
          const arr = store[assetId] || [];
          arr.push({ t: Date.now(), p: price, trend });
          if (arr.length > 720) arr.splice(0, arr.length - 720);
          store[assetId] = arr;
          await chrome.storage.local.set({ [historyKey]: store });

          // Check threshold alerts
          const alerts = settings?.finance?.alerts || [];
          for (const alert of alerts) {
            if (!alert.enabled || alert.asset !== assetId) continue;
            const toman = price / 10;
            if (alert.above && toman >= alert.above) {
              const aboveId = `alert-${assetId}-above-${Date.now()}`;
              chrome.notifications.create(aboveId, {
                type: 'basic',
                title: `${assetId.toUpperCase()} Alert`,
                message: `${assetId.toUpperCase()} is above ${alert.above.toLocaleString()} Toman (${toman.toLocaleString()})`,
                priority: 2
              } as chrome.notifications.NotificationCreateOptions);
            }
            if (alert.below && toman <= alert.below) {
              const belowId = `alert-${assetId}-below-${Date.now()}`;
              chrome.notifications.create(belowId, {
                type: 'basic',
                title: `${assetId.toUpperCase()} Alert`,
                message: `${assetId.toUpperCase()} is below ${alert.below.toLocaleString()} Toman (${toman.toLocaleString()})`,
                priority: 2
              } as chrome.notifications.NotificationCreateOptions);
            }
          }
        } catch {
          // individual asset fetch failed — skip, try next
        }
      }
    } catch {
      // settings read failed — skip cycle
    }
  });
}
