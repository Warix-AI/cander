# Cander

Desktop-first AI workspace. Chat is the command layer; Build, Studio, Research, Scheduled, and Connectors open as a contextual right panel. Cander Platform is a separate product behind the same account selector.

```bash
npm install
npm run dev
```

Light is the Recursion default. Appearance lives in Settings.

## macOS app

A thin Electron shell lives in [`desktop/`](./desktop). It loads the hosted web app in a native window.

```bash
cd desktop && npm install && npm start   # https://cander.app
npm run desktop:dev                      # from repo root → localhost:3000
npm run desktop:dmg                      # build unsigned .dmg into desktop/release
```

See [`desktop/README.md`](./desktop/README.md) for signing notes.
