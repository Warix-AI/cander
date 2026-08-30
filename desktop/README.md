# Cander Desktop (macOS)

Thin Electron shell that opens the **hosted** Cander web app in a native Mac window — same pattern as the Capacitor iOS/Android shells. Product UI stays in Next.js at `cander.app`; this package adds Dock presence, custom chrome, and the Apple Foundation Models bridge.

## Production vs dev (like mobile)

| Command | Loads | Use when |
|---|---|---|
| `npm run start` | `https://cander.app` | **Default** — real users, downloadable `.dmg`, App Store-style testing |
| `npm run dev` | `http://localhost:3000` | Active Next.js development only |

From repo root:

```bash
npm run desktop:prod   # production shell → cander.app
npm run desktop:dev    # dev shell → localhost:3000
npm run desktop:dmg    # build installable .dmg
```

## Quick start (production shell)

```bash
cd desktop
npm install
npm run build:fm-helper   # once, on Apple Intelligence Mac
npm run start             # opens https://cander.app with FM bridge
```

Settings → Hosting should show Foundation Models **Available** when Apple Intelligence is on. Use **Local** for on-device-only; **Auto** prefers on-device for simple chat once the hosted app includes the latest routing (deployed with the main web app).

## Build a `.dmg` for download

```bash
cd desktop
npm run dist:unsigned
```

Output: `desktop/release/Cander-<version>.dmg` — install to `/Applications`. The bundle includes:

- Cander-branded Electron shell (`2026-08-29-browser-surface`, v0.1.1+)
- Local `WebContentsView` browser bridge for right-panel web / preview tabs
- `FoundationModelsHelper` binary (Apple Intelligence CLI)
- Loads `https://cander.app` (not localhost)

For public downloads with code signing:

```bash
npm run dist
```

## Config

| Env | Default | Purpose |
|---|---|---|
| `CANDER_URL` | `https://cander.app` | Override loaded URL (dev only — do not ship localhost in releases) |
| `CANDER_FM_HELPER` | bundled `Resources/FoundationModelsHelper/...` | Override FM helper path |

## Layout

```
desktop/
  src/main.js                 # BrowserWindow + menu + FM IPC
  src/preload.js              # window.canderDesktop bridge
  src/foundation-models-bridge.js
  native/FoundationModelsHelper/  # Swift CLI → Apple Intelligence
  scripts/build-fm-helper.js
  scripts/prepare-dev-app.js
  assets/icon.icns
  release/                    # built .dmg (gitignored)
```

## Apple Intelligence

Electron cannot import Foundation Models directly. The Swift helper is built automatically before `pack` / `dist`:

```bash
cd desktop/native/FoundationModelsHelper
swiftc -parse-as-library -O -o FoundationModelsHelper main.swift
```

Or run `npm run build:fm-helper` from `desktop/`.
