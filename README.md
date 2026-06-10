# 🪴 PlantCare

A simple, local-first web app for keeping house plants alive — track when each plant needs watering or fertilizing, and tick them off with a tap. Works offline and installs to your phone's home screen like a native app.

**Live:** https://adamdivak.github.io/plantcare/

## What it does

- **Plants grouped by room** on one scrollable screen, each shown as an emoji tile with a countdown (e.g. `5d`, `today`, `−2d` overdue).
- **Tap a plant to select it** (select several at once, or tap a room name to select the whole room), then use the bottom bar to **💧 Water** or **🧪 Fertilize** them. A tap resets that plant's counter.
- **Long-press a plant** (or right-click on desktop) for a quick menu: Water, Fertilize, Edit, Duplicate, Delete.
- **Per-plant schedules with two seasons** (Summer / Winter). Each season has its own watering and fertilizer frequency in days (`0` = not needed that season). The two seasons always cover the whole year.
- **Overdue plants** turn red with a ⚠️ badge so you can see at a glance what needs attention.
- All data is stored **locally on your device** (IndexedDB). No account, no server.

## Using it on your phone (iOS)

1. Open the live URL in **Safari**.
2. Share button → **Add to Home Screen**.
3. Launch it from the home-screen icon — it runs full-screen and works offline.

To check you have the latest version, **tap the small version number** (`v5`) in the top-right of the header; it checks for an update and reloads.

## Running locally

It's plain HTML/CSS/JS with no build step, but it must be served over HTTP (ES modules don't load from `file://`):

```bash
cd PlantCare
python3 -m http.server 8091
# open http://localhost:8091
```

## More

See [DESIGN.md](DESIGN.md) for architecture, decisions, the release process, and open questions (including why background notifications aren't possible in the current pure-web design).
