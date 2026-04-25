#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="AgentNotify"
APP_DISPLAY_NAME="Agent Notify"
BUNDLE_ID="io.github.piqusy.agentnotify"
SRC_PATH="$ROOT_DIR/packages/macos-helper/src/AgentNotify.swift"
ICON_SOURCE="$ROOT_DIR/app-icon.png"
OUT_DIR="$ROOT_DIR/packages/macos-helper/dist"
APP_DIR="$OUT_DIR/${APP_NAME}.app"
ICONSET_DIR="/tmp/${APP_NAME}.iconset"
ICNS_PATH="/tmp/${APP_NAME}.icns"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping macOS helper build on non-macOS"
  exit 0
fi

mkdir -p "$OUT_DIR"
rm -rf "$APP_DIR" "$ICONSET_DIR" "$ICNS_PATH"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$ICONSET_DIR"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_DISPLAY_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleIconFile</key><string>${APP_NAME}</string>
  <key>LSUIElement</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST

for size in 16 32 128 256; do
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "$retina" "$retina" "$ICON_SOURCE" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil --convert icns --output "$ICNS_PATH" "$ICONSET_DIR"
cp "$ICNS_PATH" "$APP_DIR/Contents/Resources/${APP_NAME}.icns"

swiftc "$SRC_PATH" -o "$APP_DIR/Contents/MacOS/${APP_NAME}" -framework Cocoa -framework UserNotifications
chmod +x "$APP_DIR/Contents/MacOS/${APP_NAME}"
codesign --force --deep --sign - "$APP_DIR" >/dev/null

echo "Built macOS helper: $APP_DIR"
