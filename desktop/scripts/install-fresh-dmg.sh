#!/bin/bash
# Quit every One/Cander install, remove stale apps, build + install One DMG.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
APP_SRC="release/mac-arm64/One.app"
DMG="release/One-${VERSION}-arm64.dmg"

echo "→ Quitting One / Cander…"
osascript -e 'tell application "One" to quit' 2>/dev/null || true
osascript -e 'tell application "Cander" to quit' 2>/dev/null || true
killall One 2>/dev/null || true
killall Cander 2>/dev/null || true
sleep 1

echo "→ Removing other installs…"
rm -rf /Applications/One.app
rm -rf /Applications/Cander.app
rm -rf "$ROOT/.dev/One.app"
rm -rf "$ROOT/.dev/Cander.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Missing $APP_SRC — packaging first…"
  env -u ELECTRON_RUN_AS_NODE CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir
fi

echo "→ Installing to /Applications…"
ditto --rsrc --extattr "$APP_SRC" /Applications/One.app

if command -v hdiutil >/dev/null 2>&1; then
  echo "→ Building $DMG (optional)…"
  STAGE="$(mktemp -d /tmp/one-dmg-XXXX)"
  rm -f "$DMG"
  if cp -R "$APP_SRC" "$STAGE/One.app" \
    && ln -s /Applications "$STAGE/Applications" \
    && hdiutil create -volname "One" -srcfolder "$STAGE" -ov -format UDZO "$DMG"; then
    open -R "$DMG"
  else
    echo "DMG create skipped (hdiutil unavailable). Zip still at release/One-${VERSION}-arm64.zip"
  fi
  rm -rf "$STAGE"
fi

echo "→ Opening One…"
open -a One
echo "Done. Only /Applications/One.app (${VERSION}) should remain."
