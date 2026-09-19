import type { WidgetDef } from './grid';

const STORAGE_KEY = 'weatherCache';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

interface WeatherCache {
  temp: number;
  condition: string;
  code: number;
  aqi: number;
  aqiLabel: string;
  high: number;
  low: number;
  fetchedAt: number;
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Moderate showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + heavy hail'
};

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

async function fetchWeather(): Promise<WeatherCache | null> {
  // Try to get cached
  try {
    const stored = await new Promise<WeatherCache | undefined>((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (r) => resolve((r as Record<string, WeatherCache>)[STORAGE_KEY]));
    });
    if (stored && Date.now() - stored.fetchedAt < CACHE_TTL) return stored;
  } catch { /* ignore */ }

  // Get location
  let lat = 35.6892, lon = 51.3890; // Tehran default
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
  } catch { /* use default */ }

  try {
    const [weatherResp, aqiResp] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi`)
    ]);

    const weather = await weatherResp.json();
    const aqiData = await aqiResp.json();

    const current = weather.current;
    const daily = weather.daily;
    const aqi = aqiData.current?.european_aqi ?? 0;

    const cache: WeatherCache = {
      temp: Math.round(current.temperature_2m),
      code: current.weather_code,
      condition: WMO_CODES[current.weather_code] || 'Unknown',
      aqi,
      aqiLabel: aqiLabel(aqi),
      high: Math.round(daily.temperature_2m_max[0]),
      low: Math.round(daily.temperature_2m_min[0]),
      fetchedAt: Date.now()
    };

    try {
      chrome.storage.local.set({ [STORAGE_KEY]: cache });
    } catch { /* ignore */ }

    return cache;
  } catch {
    return null;
  }
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#30D158';
  if (aqi <= 100) return '#fde047';
  if (aqi <= 150) return '#fb923c';
  return '#ff453a';
}

export const weatherWidget: WidgetDef = {
  id: 'weather',
  title: 'Weather',
  defaultSize: { colSpan: 2, rowSpan: 1 },
  async render(container) {
    container.innerHTML = '';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '12px';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    const tempEl = document.createElement('div');
    tempEl.style.cssText = 'font-size:2rem;font-weight:600;color:var(--text-primary);';
    tempEl.textContent = '...';

    const conditionEl = document.createElement('div');
    conditionEl.style.cssText = 'font-size:12px;color:var(--text-secondary);';

    const hiLoEl = document.createElement('div');
    hiLoEl.style.cssText = 'font-size:11px;color:var(--text-secondary);';

    left.append(tempEl, conditionEl, hiLoEl);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;margin-left:auto;';

    const aqiBadge = document.createElement('div');
    aqiBadge.style.cssText = 'padding:3px 8px;border-radius:8px;font-size:11px;font-weight:600;';
    aqiBadge.textContent = '...';

    const aqiLabelEl = document.createElement('div');
    aqiLabelEl.style.cssText = 'font-size:10px;color:var(--text-secondary);';

    right.append(aqiBadge, aqiLabelEl);
    container.append(left, right);

    // Fetch
    const data = await fetchWeather();
    if (!data) {
      tempEl.textContent = '—';
      conditionEl.textContent = 'Weather unavailable';
      return;
    }

    tempEl.textContent = `${data.temp}°C`;
    conditionEl.textContent = data.condition;
    hiLoEl.textContent = `H: ${data.high}° L: ${data.low}°`;
    aqiBadge.textContent = `AQI ${data.aqi}`;
    aqiBadge.style.background = aqiColor(data.aqi) + '20';
    aqiBadge.style.color = aqiColor(data.aqi);
    aqiLabelEl.textContent = data.aqiLabel;
  }
};
