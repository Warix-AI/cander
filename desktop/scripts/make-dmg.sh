#!/bin/bash
# Build an installable One DMG from the packaged .app
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
APP="release/mac-arm64/One.app"
OUT="release/One-${VERSION}-arm64.dmg"
STAGE="$(mktemp -d /tmp/one-dmg-XXXX)"

if [[ ! -d "$APP" ]]; then
  echo "Missing $APP — package first: CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir"
  exit 1
fi

echo "Building $OUT …"
rm -f "$OUT"
cp -R "$APP" "$STAGE/One.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "One" -srcfolder "$STAGE" -ov -format UDZO "$OUT"
rm -rf "$STAGE"
ls -lah "$OUT"
open -R "$OUT"
echo "Done. Drag One into Applications (replace), quit old One, reopen."
