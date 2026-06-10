# PlantCare — Design & Decisions

Working notes to pick the project back up. For the original brainstorming spec and
implementation plan see
`docs/superpowers/specs/2026-06-01-plantcare-design.md` and
`docs/superpowers/plans/2026-06-01-plantcare.md` in the parent monorepo. This file
reflects what is **actually built** (which has grown past the original spec).

## Status

Shipped and in personal use as an installed PWA on iPhone. Current release: **v6**.

## Where the code lives & how it's deployed

- **Development** happens in a private monorepo at `…/Documents/Playground`, in the
  `PlantCare/` subfolder.
- **Published** as its own public repo `adamdivak/plantcare`, served via **GitHub Pages**
  at https://adamdivak.github.io/plantcare/.
- Publishing is done with **git subtree** (pushes only the `PlantCare/` subfolder):
  ```bash
  git subtree push --prefix=PlantCare plantcare main
  ```
  (`plantcare` remote = `git@github.com:adamdivak/plantcare.git`.)

## Tech & architecture

Vanilla **HTML / CSS / JS (ES modules)**. No framework, no build step, no dependencies.
Single page; the two "screens" are just `<div>`s shown/hidden. Data persists in
**IndexedDB**. Installable/offline via a **service worker** + **web app manifest**.

Rationale: the app is small and the priority was minimal effort + a trivial path to a
phone "app". Vanilla keeps the deploy a static file copy and the WKWebView/PWA path
simple. If it grows a lot, the data layer (`db.js`) is isolated enough to migrate the UI
to a framework without touching storage.

## File map

```
PlantCare/
  index.html     — shell: home screen, edit overlay, emoji picker, SW registration + update flow
  style.css      — all styles, responsive rules, animations, safe-area handling
  app.js         — all UI logic, state, rendering, gestures, feedback, updates
  db.js          — IndexedDB wrapper: getAll / get / put / del
  manifest.json  — PWA manifest (name, colors, icons, standalone display)
  sw.js          — service worker, cache-first; CACHE_NAME must be bumped per release
  icon-180/192/512.png — app icons (plant on blue gradient)
  make_icon.py   — regenerates the icon (pure-Python PNG, then `sips` to downscale)
  README.md, DESIGN.md
```

## Data model

Single IndexedDB store `plants`, keyed by `id`:

```
Plant {
  id: string (UUID)
  name: string                 // required (validated on save)
  icon: string                 // emoji character
  roomName: string             // required; rooms are derived from this, not stored separately
  seasons: [                   // always exactly 2, covering the whole year
    { name: "Summer"|"Winter",
      startMonth, startDay, endMonth, endDay,   // numbers
      waterDays, fertilizerDays }               // 0 = disabled for that season
  ]
  lastWatered:    string | null  // ISO timestamp
  lastFertilized: string | null
  createdAt:      string         // ISO timestamp
}
```

- **Rooms are derived** at render time from the set of `roomName` values — a room with no
  plants simply disappears. (Note: this means a room can't exist "empty".)
- **Countdown** shows whichever of water/fertilizer is due soonest. Due date = the relevant
  `lastWatered`/`lastFertilized` + the active season's frequency. If a plant was **never**
  watered/fertilized, the count is measured from `createdAt` (so a new plant starts counting
  immediately rather than showing nothing).
- **Active season** is chosen by today's date against each season's date range (ranges may
  wrap the year end).
- Only the **last** care timestamp is kept — no full history log.

## Key behaviours

**Home screen** — room-grouped grid of square emoji tiles with an in-tile countdown
(green > 3d, amber 1–3d, red + ⚠️ overdue, grey "today"). Tap a tile to select; tap a room
header to select all in that room; multi-select supported. Sticky bottom bar:
💧 Water / 🧪 Fertilize (enabled with ≥1 selected, show count), ✏️ Edit (exactly 1),
＋ Add (always). Buttons are icon-over-label for discoverability and larger tap targets.

**Edit screen** — tappable icon (curated emoji picker), name, room (free-text with a custom
autocomplete dropdown built from existing rooms). Care schedule is **two season cards**
(not a table — fits phones without horizontal scroll): each has Start and End as
month+day `<select>` pairs and "every N days" inputs for water and fertilizer. **All four
dates are editable**; changing a start adjusts the other season's end to the previous day,
and changing an end adjusts the other season's start to the next day, so the year stays
fully covered with no gaps/overlaps. History section shows last/next dates. Buttons: Water
Now, Fertilize, Duplicate, Delete (confirms, names the plant). Save validates that **name
and room are non-empty**.

**Context menu** — long-press (touch) or right-click (desktop) on a tile opens a menu:
Water, Fertilize, Edit, Duplicate, Delete. Clamped to the viewport; closes on outside tap,
scroll, resize, or Escape. The follow-up tap is suppressed so a long-press doesn't also
toggle selection.

**Feedback** — watering/fertilizing shows a toast, a droplet/emoji float-up animation on the
tile, a pulse ring, and a short Web Audio chime.

## PWA, versioning & release process

- `manifest.json` + `sw.js` make it installable and offline. The SW is **cache-first**: it
  caches all listed assets on install, serves from cache, falls back to network.
- **Releasing a change requires bumping two things together:**
  1. `APP_VERSION` in `app.js` (shown as `vN` in the header).
  2. `CACHE_NAME` in `sw.js` (`plantcare-vN`).
  If you don't bump `CACHE_NAME`, devices keep serving the old cached files.
- **Update flow:** on launch the page calls `registration.update()`. The SW uses
  `skipWaiting()` + `clients.claim()`, so a new version activates promptly; a
  `controllerchange` listener then reloads the page once (guarded so a first install doesn't
  spuriously reload). Tapping the **version label** forces an update check + reload — this is
  the manual "refresh", since standalone PWAs have no pull-to-refresh.
- The **home-screen icon is cached by iOS at install time**; to change it you must remove and
  re-add the home-screen tile.
- **Install banner (v6)** — a dismissible "Add PlantCare to your home screen" bar shows below
  the header for non-installed visitors. On **Chromium** (Android/desktop) it captures the
  `beforeinstallprompt` event and the Add button triggers a real one-tap install. **iOS Safari
  exposes no install API**, so there the Add button opens an instructions sheet pointing at the
  Share → "Add to Home Screen" flow. The banner hides when already running standalone
  (`display-mode: standalone` / `navigator.standalone`), on `appinstalled`, or once dismissed
  (remembered in `localStorage` key `plantcare-install-dismissed`).

## Decisions worth remembering

- **Local-only storage, no server** — chosen for simplicity. Consequence: data is
  per-device and not backed up. Clearing Safari's site data wipes the plants. A sync/backup
  story is deferred (see below).
- **Season editor is cards, not a table** — the original spec showed a 5-column table; on a
  phone the month/day controls wrapped and the fertilizer column was cut off. Cards fixed it.
- **Room field is a custom autocomplete**, not a native `<datalist>` — the datalist rendered
  as a dropdown with a chevron on iOS and surfaced Safari's own autofill history. The custom
  list is built only from current plants.
- **iOS long-press hardening** — `user-select`/`-webkit-touch-callout: none` app-wide (re-
  enabled on inputs) to stop the native text-selection overlay and copy/look-up popup from
  appearing alongside our context menu.
- **Safe-area handling** — `viewport-fit=cover` + `env(safe-area-inset-*)` padding fixed a
  stray black line near the home indicator and keeps the action bar clear of it.

## Open questions & future work

### Background notifications — the big open item

The most-wanted feature is a reminder when a plant is overdue **even if the app hasn't been
opened in a while**. This **cannot be done within the current pure-PWA design on iOS**:

- "Wake up daily and check" relies on the **Periodic Background Sync API, which iOS Safari
  does not support at all** — there's no way to run our JS on a schedule while the app is
  closed.
- **Web Push** *is* supported for home-screen PWAs (iOS 16.4+), but a push must be **sent
  from a server**; the device can't schedule its own future local notification from web code.
  And because plant data lives only on-device, a server wouldn't know what's due without us
  syncing data to it.

Three possible paths (decision deferred — user dismissed the choice for now):

| Path | Fires when app closed? | Server? | Notes |
|---|---|---|---|
| Stay pure PWA | ❌ (only "remind me when I open the app") | No | Could add an on-open overdue check/badge cheaply. |
| PWA + Web Push | ✅ | Yes | Needs a small scheduled job (cron/serverless), VAPID keys, push subscription per device, and syncing schedules to the server. |
| Native wrapper (Capacitor / thin WKWebView) | ✅ via on-device **local** notifications | No | Best fit for the "no server" preference. Schedules notifications on-device from plant data; works offline. Cost: build/sign an iOS app in Xcode (free Apple ID re-signs weekly; $99/yr for a stable/TestFlight build). |

Recommendation on file: the **native wrapper** matches the no-server preference best. If
going that route, the existing web app can be embedded almost unchanged; the native layer
reads the schedule (or receives it via a JS bridge) and registers local notifications.

### Other deferred items

- **Data sync / cloud backup** — currently no backup; data is device-local. Each plant is a
  self-contained JSON object, so syncing later is mostly a push/pull of these objects.
- **Custom plant photos** instead of emoji — the icon is just a string the tile renders, so
  the picker can be extended without reworking the UI.
- **Drag-to-reorder** plants / move between rooms by dragging (currently room is changed via
  the edit screen).
- **Full watering history log** (only the last timestamp is kept today).
- **Duplicate-name handling** — names must be non-empty but duplicates are allowed
  (intentional; Duplicate appends "(copy)"). Revisit if it causes confusion.
