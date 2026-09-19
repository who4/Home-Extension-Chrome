// Favicon: fetch directly from newtab page (no background SW — FileReader unavailable there).
// Falls back to a deterministic letter tile when fetch fails.

const FAVICON_KEY = 'faviconCache';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  dataUrl: string;
  fetchedAt: number;
}

type FaviconCache = Record<string, CacheEntry>;

function readCache(): Promise<FaviconCache> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([FAVICON_KEY], (result) => {
        resolve((result?.[FAVICON_KEY] as FaviconCache | undefined) ?? {});
      });
    } catch {
      resolve({});
    }
  });
}

function writeCache(cache: FaviconCache): void {
  try {
    chrome.storage.local.set({ [FAVICON_KEY]: cache });
  } catch {
    // storage unavailable
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function fetchFaviconDirect(domain: string): Promise<string | null> {
  try {
    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(domain)}`;
    const response = await fetch(faviconUrl, { credentials: 'omit' });
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.size < 10) return null; // skip empty/generic blobs

    // Convert to data URL (FileReader available on newtab page, not in SW)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function getFaviconDataUrl(url: string): Promise<string | null> {
  const domain = domainOf(url);
  if (!domain) return null;

  const cache = await readCache();
  const entry = cache[domain];
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS && entry.dataUrl) {
    return entry.dataUrl;
  }

  const dataUrl = await fetchFaviconDirect(domain);
  if (dataUrl && !dataUrl.endsWith('AA==')) {
    cache[domain] = { dataUrl, fetchedAt: Date.now() };
    writeCache(cache);
    return dataUrl;
  }
  return null;
}

// --- Letter tile fallback ---

const TILE_HUES = [210, 260, 160, 20, 330, 90, 190, 280];

function hueFor(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  return TILE_HUES[Math.abs(hash) % TILE_HUES.length];
}

export function createLetterTile(domain: string): HTMLElement {
  const tile = document.createElement('span');
  tile.className = 'shortcut-favicon favicon-letter';
  const hue = hueFor(domain);
  tile.style.background = `hsl(${hue}, 45%, 32%)`;
  tile.style.color = `hsl(${hue}, 80%, 82%)`;
  tile.textContent = (domain[0] || '?').toUpperCase();
  return tile;
}

export async function createFaviconElement(url: string): Promise<HTMLElement | null> {
  const dataUrl = await getFaviconDataUrl(url);

  if (dataUrl) {
    const img = document.createElement('img');
    img.className = 'shortcut-favicon';
    img.src = dataUrl;
    img.alt = '';
    img.loading = 'lazy';
    return img;
  }
  // No icon — user prefers nothing over a letter tile
  return null;
}
