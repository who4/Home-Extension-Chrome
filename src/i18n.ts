const en = {
  search: 'Search',
  newNote: 'New Sticky Note',
  addShortcut: 'Add Shortcut',
  name: 'Name',
  address: 'Address',
  addToHome: 'Add to Home',
  settings: 'Settings',
  openSettings: 'Open settings',
  general: 'General',
  appearance: 'Appearance',
  widgets: 'Widgets',
  about: 'About',
  calendar: 'Calendar',
  gregorian: 'Gregorian',
  jalali: 'Jalali',
  clockFormat: 'Clock format',
  clock24h: '24-hour',
  clock12h: '12-hour',
  accentColor: 'Accent color',
  random: 'Random each tab',
  themePreset: 'Theme preset',
  midnight: 'Midnight',
  priceTicker: 'Price ticker',
  newsWidget: 'News widget',
  suggestedSites: 'Suggested sites row',
  suggested: 'Suggested',
  greeting: 'Greeting widget',
  intention: 'Daily intention widget',
  weather: 'Weather + AQI',
  calendarWidget: 'Calendar widget',
  rssWidget: 'RSS inbox',
  habitsWidget: 'Habits tracker',
  focusWidget: 'Focus mode',
  finance: 'Finance',
  financeAssets: 'Tracked assets',
  financeAsset_usd: 'USD Dollar',
  financeAsset_gold: 'Gold (gram)',
  financeAsset_eur: 'Euro',
  financeAsset_btc: 'Bitcoin',
  privacy: 'Privacy',
  historySearch: 'Search browsing history',
  clipboardHistory: 'Clipboard history',
  clipboardNote: 'Clipboard entries are captured only when you paste into the search bar, stored locally, and never synced.',
  versionLabel: 'Version',
  reloadExtension: 'Reload extension',
  dataSources: 'Prices by TGJU / BRS. News by BBC World.',
  noRecentNews: 'No recent top stories.',
  loadingTopStory: 'Loading top story...',
  breaking: 'BREAKING',
  deleteShortcut: 'Delete {name}',
  deleteNote: 'Delete note'
} as const;

export type StringKey = keyof typeof en;

export function t(key: StringKey, vars?: Record<string, string>): string {
  let s: string = en[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}
