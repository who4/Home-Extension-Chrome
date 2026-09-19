// Finance bento widget — sparklines, configurable assets, threshold alerts.
import { ApiClient, type PriceData } from './api';
import { FINANCE_ASSETS, PRICE_HISTORY_KEY, PRICE_HISTORY_MAX, type FinanceAssetId } from './constants';
import { storage } from './storage';
import type { Settings } from './types';
import type { WidgetDef } from './grid';

// --- Price history ---

export interface PriceHistoryPoint {
  t: number;       // timestamp ms
  p: number;       // price in Rial
  trend: 'up' | 'down' | 'flat';
}

interface PriceHistoryStore {
  [assetId: string]: PriceHistoryPoint[];
}

export async function appendPricePoint(asset: FinanceAssetId, price: number, trend: PriceData['trend']): Promise<void> {
  const store = await storage.get<PriceHistoryStore>(PRICE_HISTORY_KEY, {});
  const arr = store[asset] || [];
  arr.push({ t: Date.now(), p: price, trend });
  if (arr.length > PRICE_HISTORY_MAX) arr.splice(0, arr.length - PRICE_HISTORY_MAX);
  store[asset] = arr;
  await storage.set(PRICE_HISTORY_KEY, store);
}

async function getHistory(asset: FinanceAssetId): Promise<PriceHistoryPoint[]> {
  const store = await storage.get<PriceHistoryStore>(PRICE_HISTORY_KEY, {});
  return store[asset] || [];
}

// --- Sparkline renderer ---

function drawSparkline(
  canvas: HTMLCanvasElement,
  points: number[],
  trendColor: string
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || points.length < 2) return;

  // Use CSS layout size, not backing store size — prevents DPR compounding
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 36;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, trendColor + '30');
  grad.addColorStop(1, trendColor + '05');

  ctx.beginPath();
  ctx.moveTo(0, h - ((points[0] - min) / range) * (h * 0.85));
  for (let i = 1; i < points.length; i++) {
    const x = i * step;
    const y = h - ((points[i] - min) / range) * (h * 0.85);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Stroke
  ctx.beginPath();
  ctx.moveTo(0, h - ((points[0] - min) / range) * (h * 0.85));
  for (let i = 1; i < points.length; i++) {
    const x = i * step;
    const y = h - ((points[i] - min) / range) * (h * 0.85);
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = trendColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Latest point dot
  const lastX = (points.length - 1) * step;
  const lastY = h - ((points[points.length - 1] - min) / range) * (h * 0.85);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = trendColor;
  ctx.fill();
}

// --- Widget definition ---

export function createFinanceWidget(settings: Settings): WidgetDef {
  return {
    id: 'finance',
    title: 'Finance',
    defaultSize: { colSpan: 4, rowSpan: 1 },
    async render(container) {
      container.innerHTML = '';

      const assetIds = settings.finance.assets;
      if (assetIds.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;text-align:center;padding:12px">No assets configured</div>';
        return;
      }

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;width:100%;';

      for (const assetId of assetIds) {
        const def = FINANCE_ASSETS[assetId];
        if (!def) continue;

        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(255,255,255,0.04);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:4px;min-width:120px;';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:11px;color:var(--text-secondary);';
        nameEl.textContent = `${def.symbol} ${def.name}`;

        const trendEl = document.createElement('span');
        trendEl.style.cssText = 'font-size:12px;font-weight:600;';

        header.append(nameEl, trendEl);

        // Price
        const priceEl = document.createElement('div');
        priceEl.style.cssText = 'font-size:16px;font-weight:600;color:var(--text-primary);font-variant-numeric:tabular-nums;';
        priceEl.textContent = '...';

        // Sparkline canvas
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:36px;margin-top:2px;';

        card.append(header, priceEl, canvas);
        grid.appendChild(card);

        // Fetch + render
        void renderAsset(assetId, priceEl, trendEl, canvas);
      }

      container.appendChild(grid);
    }
  };
}

async function renderAsset(
  assetId: FinanceAssetId,
  priceEl: HTMLElement,
  trendEl: HTMLElement,
  canvas: HTMLCanvasElement
): Promise<void> {
  const data = await ApiClient.fetchAssetPrice(assetId);
  if (data.price === 'Error') {
    priceEl.textContent = '—';
    return;
  }

  // Format to Toman (÷10)
  const rialNum = parseInt(data.price.replace(/,/g, ''), 10);
  const toman = Number.isFinite(rialNum) ? rialNum / 10 : NaN;
  priceEl.textContent = Number.isFinite(toman) ? toman.toLocaleString('en-US') : data.price;

  // Trend arrow
  const trendColor = data.trend === 'up' ? '#30D158' : data.trend === 'down' ? '#ff453a' : 'var(--text-secondary)';
  trendEl.style.color = trendColor;
  trendEl.textContent = data.trend === 'up' ? '▲' : data.trend === 'down' ? '▼' : '—';

  // Sparkline from history
  const history = await getHistory(assetId);
  if (history.length >= 2) {
    const prices = history.map((h) => h.p / 10); // Toman
    const last = prices[prices.length - 1];
    const prev = prices[prices.length - 2];
    const color = last >= prev ? '#30D158' : '#ff453a';
    drawSparkline(canvas, prices.slice(-60), color); // last ~30 hours at 30min intervals
  }
}
