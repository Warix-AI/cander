#!/bin/bash
# Quit every Cander, remove stale installs, build + install 0.1.32 DMG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
APP_SRC="release/mac-arm64/Cander.app"
DMG="release/Cander-${VERSION}-arm64.dmg"

echo "→ Quitting Cander…"
osascript -e 'tell application "Cander" to quit' 2>/dev/null || true
killall Cander 2>/dev/null || true
sleep 1

echo "→ Removing other Cander apps…"
rm -rf /Applications/Cander.app
rm -rf "$ROOT/.dev/Cander.app"
# Remove Dock persistent items named Cander (best-effort)
defaults read com.apple.dock persistent-apps >/dev/null 2>&1 || true

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing $APP_SRC — packaging first…"
  env -u ELECTRON_RUN_AS_NODE CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir
fi

echo "→ Building $DMG…"
STAGE="$(mktemp -d /tmp/cander-dmg-XXXX)"
rm -f "$DMG"
cp -R "$APP_SRC" "$STAGE/Cander.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "Cander" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

echo "→ Installing to /Applications…"
hdiutil attach "$DMG" -nobrowse -quiet
cp -R "/Volumes/Cander/Cander.app" /Applications/
hdiutil detach "/Volumes/Cander" -quiet || true

echo "→ Opening Cander…"
open -a Cander
open -R "$DMG"
echo "Done. Only /Applications/Cander.app (${VERSION}) should remain."
