# Cander Desktop (macOS)

Thin Electron shell that opens the hosted Cander web app in a native Mac window. The product UI stays in Next.js — this package only wraps it for Dock / download.

## Quick start

```bash
# From repo root — web app (if testing against local)
npm run dev

# In another terminal
cd desktop
npm install
npm run start          # loads https://cander.app
npm run dev            # loads http://localhost:3000
```

## Build a `.dmg`

```bash
cd desktop
npm run dist:unsigned
```

Output lands in `desktop/release/`.  

`dist:unsigned` skips code signing so you can test locally. For public downloads you’ll want an Apple Developer account, then:

```bash
npm run dist
```

…with signing certificates available in Keychain (electron-builder discovers them automatically).

## Config

| Env | Default | Purpose |
|---|---|---|
| `CANDER_URL` | `https://cander.app` | URL loaded in the window |

When you add a real backend later, **you do not need to change this shell** — keep pointing at `cander.app` and the web app picks up API changes on its own.

## Layout

```
desktop/
  src/main.js                 # BrowserWindow + menu + FM IPC
  src/preload.js              # window.canderDesktop bridge
  src/foundation-models-bridge.js
  native/FoundationModelsHelper/  # optional Apple Intelligence CLI
  assets/icon.icns
  release/                    # built .dmg (gitignored)
```

## Apple Intelligence on desktop (optional)

Electron cannot import Foundation Models directly. Build the helper binary on a Mac with Apple Intelligence / macOS that ships `FoundationModels`:

```bash
cd desktop/native/FoundationModelsHelper
swiftc -parse-as-library -O -o FoundationModelsHelper main.swift
```

Then restart the desktop app (or set `CANDER_FM_HELPER=/absolute/path/to/FoundationModelsHelper`). With Auto/Local mode, the web app will use on-device Apple models when the helper reports available; otherwise it keeps using Cloud (Edge → Ollama tunnel).
