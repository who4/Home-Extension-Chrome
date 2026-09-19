import type { FinanceAssetId } from './constants';

export type CalendarType = 'gregorian' | 'jalali';

export type AccentName =
  | 'random'
  | 'purple'
  | 'blue'
  | 'teal'
  | 'rose'
  | 'gold'
  | 'lime'
  | 'orange'
  | 'cyan'
  | 'magenta'
  | 'silver';

export interface Settings {
  appearance: {
    accent: AccentName;
    themePreset: string;
    /** User-defined spotlight colors (rgba strings). When non-empty, used instead of presets. */
    colorPalette: string[];
  };
  general: {
    calendar: CalendarType;
    clock24h: boolean;
  };
  widgets: {
    priceTicker: boolean;
    newsWidget: boolean;
    greeting: boolean;
    intention: boolean;
    weather: boolean;
    calendar: boolean;
    rss: boolean;
    habits: boolean;
    focus: boolean;
  };
  privacy: {
    historySearch: boolean;
    clipboardHistory: boolean;
  };
  finance: {
    /** Which assets to display in the finance widget */
    assets: FinanceAssetId[];
    /** Threshold alerts: { assetId, above?, below? } */
    alerts: Array<{
      asset: FinanceAssetId;
      above?: number;
      below?: number;
      enabled: boolean;
    }>;
  };
}

export interface Shortcut {
  title: string;
  url: string;
}

export interface NoteData {
  id: number;
  x: number;
  y: number;
  text: string;
  color?: string;
  checklist?: boolean;
  pinned?: boolean;
}

// Background message protocol
export interface FetchSuggestionsRequest {
  action: 'FETCH_SUGGESTIONS';
  query: string;
}

export interface ProxyFetchRequest {
  action: 'PROXY_FETCH';
  url: string;
}

export type BackgroundRequest = FetchSuggestionsRequest | ProxyFetchRequest;

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type BackgroundResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
