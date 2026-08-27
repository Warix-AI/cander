# Cander Mobile (iOS / Android)

Thin Capacitor shell that opens the hosted Cander web app in a native WebView. The product UI stays in Next.js — this package only wraps it for Simulator / device, same idea as [`desktop/`](../desktop).

## Prerequisites

- Node 20+
- **iOS:** Xcode (full app, not only Command Line Tools) + CocoaPods (`brew install cocoapods`)
  - If `pod install` fails with `xcode-select` pointing at CLT:
    ```bash
    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
    ```
- **Android:** Android Studio + an emulator or device

## Quick start

```bash
# From repo root — web app (for local testing)
npm run dev

# First time
cd mobile
npm install

# iOS (opens Xcode) — production URL
npm run ios

# iOS against local Next
npm run ios:dev

# Android (opens Android Studio)
npm run android
npm run android:dev
```

From the repo root:

```bash
npm run mobile:ios:dev
npm run mobile:android:dev
```

## Config

| Env | Default | Purpose |
|---|---|---|
| `CANDER_URL` | `https://cander.app` | URL loaded in the WebView |

`npm run sync:dev` / `ios:dev` / `android:dev` set `CANDER_URL=http://localhost:3000`.

**Local networking notes**

- **iOS Simulator** can reach `http://localhost:3000` on the Mac.
- **Android Emulator** should use `http://10.0.2.2:3000` instead of localhost (host loopback). Override when needed:
  ```bash
  CANDER_URL=http://10.0.2.2:3000 npx cap sync && npx cap open android
  ```
- **Physical devices** need your Mac’s LAN IP (`http://192.168.x.x:3000`) and `next` already binds `0.0.0.0`.

**Scroll / fixed layout:** The native shell injects mobile layout CSS and disables root WebView bounce (see `CanderBridgeViewController.swift`). Rebuild the app in Xcode after pulling shell changes — no local dev server required when loading `https://cander.app`.

When you add a real backend later, **you do not need to change this shell** — keep pointing at `cander.app` and the web app picks up API changes on its own.

## Sign up & billing (iOS)

- **Account creation** happens in the app (email/password via Supabase) — same WebView as the web product.
- New iOS users start on **Free**; the onboarding flow skips in-app plan selection.
- **Upgrades** are not sold in the app. Settings → Plan shows the current plan and a **View subscription** button that opens `https://cander.app/pricing` in Safari.
- This avoids Apple IAP for SaaS subscriptions while keeping a native sign-up experience.

## Layout

```
mobile/
  capacitor.config.ts   # appId + server.url
  www/index.html        # fallback only (remote URL is used)
  ios/                  # Xcode project
  android/              # Android Studio project
```

## Out of scope (for now)

App Store / Play listing, push notifications, offline Next bundle, native Ollama. This is a remote-URL shell only.
