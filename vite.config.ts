import { defineConfig } from 'vite';
import { crx, defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'Start',
  version: '1.1.0',
  description: 'A modern, customizable new tab page with shortcuts and price ticker.',
  permissions: ['storage', 'tabs', 'bookmarks', 'history', 'contextMenus', 'alarms', 'notifications'],
  host_permissions: [
    '*://*.google.com/*',
    '*://*.tgju.org/*',
    '*://brsapi.ir/*',
    '*://api.rss2json.com/*',
    '*://api.open-meteo.com/*',
    '*://air-quality-api.open-meteo.com/*'
  ],
  background: {
    service_worker: 'src/background.ts'
  },
  chrome_url_overrides: {
    newtab: 'src/newtab.html'
  },
  action: {
    default_icon: 'src/icon.png'
  },
  icons: {
    '128': 'src/icon.png'
  }
});

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    emptyOutDir: true
  }
});
