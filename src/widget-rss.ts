import { storage } from './storage';
import type { WidgetDef } from './grid';

const FEEDS_KEY = 'rssFeeds';
const ITEMS_KEY = 'rssItems';

export interface RssFeed {
  id: string;
  title: string;
  url: string;
}

interface RssItem {
  feedId: string;
  title: string;
  link: string;
  pubDate: number;
  read: boolean;
}

async function getFeeds(): Promise<RssFeed[]> {
  return storage.get<RssFeed[]>(FEEDS_KEY, []);
}

async function getItems(): Promise<RssItem[]> {
  return storage.get<RssItem[]>(ITEMS_KEY, []);
}

async function saveItems(items: RssItem[]): Promise<void> {
  await storage.set(ITEMS_KEY, items);
}

async function fetchFeed(url: string): Promise<{ title: string; items: Array<{ title: string; link: string; pubDate: number }> }> {
  // Use rss2json proxy via background script
  const rssApiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
  try {
    const responseText = await new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'PROXY_FETCH', url: rssApiUrl }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          reject(new Error(chrome.runtime.lastError?.message || 'Failed'));
          return;
        }
        resolve(response.data as string);
      });
    });
    const data = JSON.parse(responseText);
    if (data.status !== 'ok') return { title: '', items: [] };
    return {
      title: data.feed?.title || '',
      items: (data.items || []).map((item: { title: string; link: string; pubDate: string }) => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        pubDate: new Date(item.pubDate).getTime()
      }))
    };
  } catch {
    return { title: '', items: [] };
  }
}

async function refreshAllFeeds(): Promise<void> {
  const feeds = await getFeeds();
  const existing = await getItems();
  const existingLinks = new Set(existing.map((i) => i.link));

  const newItems: RssItem[] = [];
  for (const feed of feeds) {
    const result = await fetchFeed(feed.url);
    if (!result.title && feed.title === '') {
      // Update feed title if we didn't have it
      feed.title = result.title;
    }
    for (const item of result.items) {
      if (!existingLinks.has(item.link)) {
        newItems.push({
          feedId: feed.id,
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          read: false
        });
      }
    }
  }

  if (newItems.length > 0) {
    const all = [...existing, ...newItems].sort((a, b) => b.pubDate - a.pubDate);
    // Cap at 200 items
    if (all.length > 200) all.length = 200;
    await saveItems(all);
  }

  // Update feed titles
  await storage.set(FEEDS_KEY, feeds);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const rssWidget: WidgetDef = {
  id: 'rss',
  title: 'RSS Inbox',
  defaultSize: { colSpan: 2, rowSpan: 2 },
  async render(container) {
    container.innerHTML = '';
    container.style.overflow = 'auto';

    // Header with refresh button
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--text-primary);';
    titleEl.textContent = 'RSS Inbox';

    const refreshBtn = document.createElement('button');
    refreshBtn.style.cssText = 'background:rgba(255,255,255,0.08);border:none;color:var(--text-secondary);font-size:12px;padding:3px 10px;border-radius:8px;cursor:pointer;font-family:inherit;';
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '...';
      await refreshAllFeeds();
      this.render(container);
    });

    header.append(titleEl, refreshBtn);

    // Add feed form
    const addForm = document.createElement('div');
    addForm.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
    const feedInput = document.createElement('input');
    feedInput.placeholder = 'Feed URL...';
    feedInput.style.cssText = 'flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-primary);font-size:12px;padding:5px 8px;border-radius:8px;font-family:inherit;';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:none;color:white;font-size:14px;width:30px;border-radius:8px;cursor:pointer;';
    addBtn.addEventListener('click', async () => {
      const url = feedInput.value.trim();
      if (!url) return;
      const feeds = await getFeeds();
      if (feeds.some((f) => f.url === url)) return;
      feeds.push({ id: Date.now().toString(), title: '', url });
      await storage.set(FEEDS_KEY, feeds);
      feedInput.value = '';
      await refreshAllFeeds();
      this.render(container);
    });
    addForm.append(feedInput, addBtn);

    container.append(header, addForm);

    // Items
    const items = await getItems();
    const feeds = await getFeeds();
    const feedMap = new Map(feeds.map((f) => [f.id, f]));

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:var(--text-secondary);font-size:12px;padding:20px 0;';
      empty.textContent = feeds.length === 0 ? 'Add an RSS feed above' : 'Refreshing feeds...';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    for (const item of items.slice(0, 20)) {
      const row = document.createElement('a');
      row.href = item.link;
      row.target = '_blank';
      row.style.cssText = `display:block;padding:6px 8px;border-radius:8px;text-decoration:none;color:${item.read ? 'var(--text-secondary)' : 'var(--text-primary)'};font-size:12px;line-height:1.4;transition:background 0.1s;`;
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.06)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

      const feedName = feedMap.get(item.feedId)?.title || '';
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;color:var(--accent-blue);margin-right:6px;';
      badge.textContent = feedName ? `${feedName} · ` : '';

      const text = document.createElement('span');
      text.textContent = item.title;

      const time = document.createElement('span');
      time.style.cssText = 'font-size:10px;color:var(--text-secondary);margin-left:6px;white-space:nowrap;';
      time.textContent = timeAgo(item.pubDate);

      row.append(badge, text, time);
      list.appendChild(row);
    }

    container.appendChild(list);

    // Mark as read
    const unread = items.filter((i) => !i.read);
    if (unread.length > 0) {
      const markAll = document.createElement('button');
      markAll.style.cssText = 'background:transparent;border:none;color:var(--accent-blue);font-size:11px;margin-top:6px;cursor:pointer;font-family:inherit;';
      markAll.textContent = `Mark all ${unread.length} as read`;
      markAll.addEventListener('click', async () => {
        const all = await getItems();
        for (const i of all) i.read = true;
        await saveItems(all);
        this.render(container);
      });
      container.appendChild(markAll);
    }
  }
};
