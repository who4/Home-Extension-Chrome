# Start Extension — Full Roadmap

Goal: fix everything, then transform "Start" from a simple new tab into a launcher/widget OS — while keeping today's clean dark design as the untouchable default. All new visual stuff is opt-in via Settings.

## Locked decisions
- Stack: Vite + @crxjs/vite-plugin@2.7.1 + TypeScript (verified maintained, Vite 8 compatible)
- Fresh install = current clean view; every widget OFF by default
- Permissions: full set (tabs, bookmarks, history, topSites, notifications, alarms, contextMenus, declarativeNetRequest, optional clipboardRead)
- Locale: English/Gregorian default; Persian UI + Jalali calendar as Settings toggles
- Current spotlight theme = "Midnight" default preset; variations only in Settings

## Testing discipline
- Per phase: `npm run build` green → load unpacked from `dist/` → run phase smoke checklist manually in browser
- Vitest for pure logic from Phase 2 onward: price parsing, Jalali conversion, fuzzy matcher, safe expression evaluator, ICS parser, theme palette extraction

---

## Phase 0 — Scaffold & migration (parity gate)
1. `npm init`, install vite, @crxjs/vite-plugin, typescript, @types/chrome, vitest
2. tsconfig (strict), vite.config.ts with defineManifest
3. Move newtab.html/style.css/script.js/api.js/background.js/icon.png → src/
4. Manifest rebuilt via CRXJS: keep existing permissions exactly; new permissions added in later phases only when their phase needs them
5. Build, load unpacked, verify: clock, search+suggestions, shortcuts add/delete, notes create/drag/edit/delete, price ticker, news widget all behave identically
6. Delete old root-level files after parity confirmed (git history keeps them)

## Phase 1 — Bug fixes (on migrated code)
1. XSS: replace all innerHTML-with-user-data with DOM APIs + textContent — suggestion items (script.js:76-77), shortcut titles (157), note textarea content (319), price values (261, 265). Escape nothing manually; never interpolate user strings into HTML
2. URL scheme regex: `/^https?:\/\//` in both saveShortcut (199) and renderShortcuts (143)
3. Fallback NaN: guard parseFloat result with Number.isFinite before toLocaleString (api.js:159-160)
4. Restore settings entry point (button in corner) so settings modal is reachable again
5. News: filter items within 24h window, sort by pubDate desc, take newest (api.js:48-54)
6. cleanPrice: normalize Persian/Arabic digits (`۰-۹` → `0-9`) before regex (api.js:166)
7. Rial/Toman: normalize every price source to Rial internally; single ÷10 at render time. brsapi response inspected once and tagged rial|toman in code
8. Notes drag clamped to viewport bounds (mousemove handler, script.js:354)
9. Multi-tab note conflicts: chrome.storage.onChanged listener reconciles remote note changes; writes go through a merge (per-note upsert by id, not whole-array overwrite)
10. Trend plumbing kept but honest: leave 'flat' until Phase 8 supplies real deltas

Smoke: XSS payloads rejected as inert text; bad URLs rejected; drag note past edge clamps; two tabs editing notes doesn't lose data.

## Phase 2 — Quality cleanup
1. Price source: probe TGJU JSON endpoints (api.tgju.org) first; keep HTML scrape as fallback chain step. Cache successful parse for 5 min
2. Suggestion debounce 250ms + abort stale requests (AbortController in background)
3. keypress → keydown; Esc closes suggestions/modals; ↑↓ navigate suggestions, Enter picks highlighted
4. Delete dead code: scrapeProfilePage stub, icon-preview cleanup block, clockStyleSelect ref, duplicate CSS rules (style.css:270-271, 669-671), debug console.logs
5. Wire getFavicon usage placeholder removed — favicon feature lands Phase 6; delete function now, reintroduce properly there
6. Drop unlimitedStorage permission
7. News anchor href="#" disabled state until article loads
8. Extract shared constants (intervals, storage keys) into typed module
9. Vitest scaffold + tests for cleanPrice digit normalization and date cutoff

## Phase 3 — Core architecture + real Settings
1. Typed storage service: schema-driven keys (shortcuts, notes, settings, layout, priceHistory…) with defaults + migrations
2. Settings schema: appearance (accent, theme preset, wallpaper mode), general (clock format, greeting, language, calendar), widgets (map of enabled flags), data (sources, refresh intervals), privacy (history provider on/off)
3. Message router in background: typed request/response union replacing ad-hoc action strings
4. Settings UI: proper modal/page with sidebar sections. Appearance shows theme presets — Midnight (current) selected by default, others previewable but not applied unless chosen
5. i18n groundwork: string table module en/fa, `t()` helper, RTL flip class on body; fa not fully translated yet — table covers existing strings
6. Jalali conversion util (jalaali algorithm, vendored ~60 lines) + unit tests; clock shows Jalali date when toggled

## Phase 4 — Command bar v1 (the spine)
1. Provider interface: `{ id, canHandle(q), search(q) → Result[] }`; results merged, ranked, keyboard-navigable
2. Providers: Shortcuts (fuzzy title match, Enter opens), Google Suggestions (existing), Calculator (safe tokenizer/evaluator — no eval; +−×÷%^ parentheses, sqrt), Currency converter (`100 usd` / `50$ to toman` using cached prices), Actions registry (see 3)
3. Actions registry: extensible `{ name, aliases, run() }` — seeds: "new note", "toggle theme", "focus mode" stub. Later phases register more
4. Bangs: built-in (!g !d !y !w !gh) + custom user bangs stored in settings; bang input bypasses other providers
5. Inline result rendering: calculator answer shown as top result with copy-on-Enter
6. Old search-container becomes the bar shell; visual unchanged when idle (same pill)

## Phase 5 — Command bar v2
1. Providers: Tabs (chrome.tabs.query, switch on Enter), Bookmarks, History (respecting settings toggle), Top Sites
2. Fuzzy matcher util (subsequence + scoring) with tests; used across providers
3. Clipboard history: experimental — opt-in setting; captures on new-tab open with explicit permission flow; capped 50 entries; clearly documented privacy note
4. Bar opens with Ctrl/Cmd+K or `/` focus shortcut from anywhere on page
5. Empty-state: recent shortcuts + recent clipboard (if enabled) instead of blank

## Phase 6 — Shortcuts upgrade
1. Favicon on pill (Google s2 favicons, cached in storage; letter-tile fallback with deterministic hue)
2. Edit mode: right-click or long-press → edit dialog (reuse add-modal), drag-reorder with persisted order, delete confirmation undo toast instead of instant delete
3. Optional auto row: "Suggested" pills from chrome.topSites, toggle in settings, excluded from manual grid
4. Context menu integration: background registers "Add to Start" on link/right-click → saves shortcut + favicon

## Phase 7 — Bento grid framework
1. Widget API: `registerWidget({ id, name, description, defaultSize, component, settings })`
2. Grid engine: CSS-grid based, drag handles + resize handles, layout persisted per-slot; widgets lazy-loaded via dynamic import
3. Edit mode toggle ("Customize") showing add-widget shelf; drag-in placement
4. Settings > Widgets lists all with switches — all OFF by default; empty grid renders nothing (current look intact)
5. Ship two proof widgets: Daily Intention (single pinned line above clock when set), Greeting (time-of-day line under clock)
6. Existing price/news widgets become bento widgets (default positions preserved for users who enable them); fixed-corner originals removed once bento versions reach parity

## Phase 8 — Finance widget pro
1. Price history: chrome.alarms 30-min background fetch (even tab closed) → ring-buffer store (last 720 points ≈ 15 days)
2. Assets configurable: USD, EUR, gold coin, gold gram, BTC (tgju symbols); add/remove in widget settings
3. Sparkline per asset (canvas, 7d/24h range toggle); real trend arrows ▲▼ vs previous close — trend classes finally live
4. Threshold alerts: per-asset above/below rules → chrome.notifications; alert management inline
5. Converter action in command bar uses same history cache

## Phase 9 — Weather + AQI widget
1. Open-Meteo forecast + air-quality APIs (free, no key); host_permissions added
2. Location: navigator.geolocation opt-in; manual city search (Open-Meteo geocoding) fallback; stored
3. Display: temp, condition icon, high/low, AQI colored badge; hourly strip on hover-expand
4. Units °C/°F setting; 30-min cache

## Phase 10 — Calendar widget
1. Month grid dual-rendered Gregorian + Jalali (Phase 3 util); today highlighted in both
2. Iranian official holidays baked-in dataset (current year + next); weekend config (Fri/Sat default for Iran locale setting)
3. Events: local events CRUD + .ics URL subscription (minimal ICS parser: VEVENT/DTSTART/SUMMARY/recurrence-exclude basics) refreshed via alarm
4. Upcoming-events list view; click day → agenda

## Phase 11 — RSS inbox widget
1. Direct RSS/Atom parsing via offscreen document DOMParser (kills rss2json dependency); api.rss2json.com host permission removed
2. Feed manager: add/remove/pause feeds, per-feed unread counts, items marked read on click
3. Article preview card on hover; open in new tab
4. Refresh via alarm (30 min default); offline-cached items
5. Optional AI digest hook point (stubbed until Phase 15)

## Phase 12 — Habits widget
1. Habit CRUD (name, color, target days/week)
2. Year heatmap per habit (GitHub-style, Jalali-aware year boundary when fa calendar active)
3. Day toggle interaction; streak counter; weekly progress ring
4. Data in storage.local, compact bit-packed by day-index

## Phase 13 — Notes upgrade
1. Color options (6 sticky tints) + color persists per note
2. Checklist mode toggle per note (lines become checkboxes, strikethrough done)
3. Pin/unpin (pinned notes float above others)
4. Sync setting: notes follow profile via storage.sync when enabled (size-capped with warning), local otherwise
5. Export all notes to markdown file

## Phase 14 — Focus mode + soundscapes
1. Pomodoro: durations configurable, timer rendered as subtle progress ring around clock (or widget), session/break cycle, notification on phase end
2. Blocking: declarativeNetRequest rules generated from user-picked blocklist (suggest current shortcuts as candidates); active only during focus sessions; hard-block vs gentle-banner setting
3. Session stats: today/week totals, streak; small stats line after session ends
4. Soundscapes: procedurally generated noise scenes (rain = filtered brown noise, cafe = layered filtered noise bursts, fire = crackle synthesis) — zero audio assets; volume slider; auto-stops with session

## Phase 15 — AI (Gemini Nano, feature-detected)
1. Availability gate: detect `LanguageModel` API; if absent, all AI surfaces hidden — no degraded UX
2. NL commands in bar: intent prompt → structured action JSON (create note, remove shortcut, change accent, start focus) executed after inline confirm chip
3. News digest: "Summarize" affordance on news widget → 2-sentence TL;DR cached per headline set
4. Notes brain: select notes → "Organize" → merged checklist proposal shown as diff-preview before applying
5. Session-local prompt caching; nothing sent anywhere except on-device model

## Phase 16 — Theming system
1. Theme token layer: CSS custom properties fully derived from settings (accent, bg tint, radius, font choice among 3 stacks)
2. Presets: Midnight (exact current look, default), plus 5 curated variants; live preview in Settings
3. Light mode + auto (prefers-color-scheme); contrast-checked pairs
4. Wallpaper modes: none (default gradient), solid color, image upload (stored compressed), Unsplash daily (topic pref), Living Sky — WebGL shader whose palette tracks local sun position
5. Palette extraction: uploaded image → canvas dominant-color sampling → proposed accent/theme; user accepts or tweaks
6. Theme share codes: serialize theme+layout bundle to base64 string; import box in Settings

## Phase 17 — Platform, perf, polish
1. Export/import full config (settings + shortcuts + feeds + habits) as JSON file
2. storage.sync for settings by default (notes exempt unless Phase 13 toggle on)
3. Perf: per-widget dynamic imports, idle-time init for heavy widgets, background fetch results cached in storage to make new-tab paint instant
4. Accessibility pass: focus rings, aria labels on interactive widgets, reduced-motion respect for animations/shader
5. Store readiness: final icons (16/32/48/128), screenshots pipeline, privacy policy draft (permissions justification), version bump 2.0

---

## Sequencing rationale
Phases 0–2 pay all debt first (bugs on vanilla code would be harder to chase after refactor). Phase 3 builds the spine (storage/settings/i18n) everything else consumes. Phases 4–6 ship visible value early. Bento (7) unlocks widget parallelism; 8–13 are independent widgets that can be reordered freely once 7 lands. 14–16 depend on settings/actions/grid. 17 is the shipping gate.

## Risks
- Gemini Nano: device/flag dependent — strict feature detection, zero UX loss when missing
- TGJU endpoints may shift — fallback chain (JSON → scrape → brsapi) with health logging
- storage.sync quota (100KB/item) — sync limited to settings; large blobs stay local
- declarativeNetRequest rules must be session-scoped to avoid blocking after crash — rules registered only while focus session active, alarm watchdog clears orphans
