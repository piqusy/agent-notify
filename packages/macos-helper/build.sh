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
BUILD_TMP_DIR="/tmp/${APP_NAME}-build"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping macOS helper build on non-macOS"
  exit 0
fi

mkdir -p "$OUT_DIR"
rm -rf "$APP_DIR" "$ICONSET_DIR" "$ICNS_PATH" "$BUILD_TMP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources" "$ICONSET_DIR" "$BUILD_TMP_DIR"

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

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
MACOS_VERSION="$(sw_vers -productVersion)"
TARGET_VERSION="$(echo "$MACOS_VERSION" | cut -d. -f1-2)"
ARM_BINARY="$BUILD_TMP_DIR/${APP_NAME}-arm64"
X64_BINARY="$BUILD_TMP_DIR/${APP_NAME}-x86_64"
UNIVERSAL_BINARY="$APP_DIR/Contents/MacOS/${APP_NAME}"

swiftc "$SRC_PATH" \
  -target "arm64-apple-macos${TARGET_VERSION}" \
  -sdk "$SDK_PATH" \
  -o "$ARM_BINARY" \
  -framework Cocoa -framework UserNotifications

swiftc "$SRC_PATH" \
  -target "x86_64-apple-macos${TARGET_VERSION}" \
  -sdk "$SDK_PATH" \
  -o "$X64_BINARY" \
  -framework Cocoa -framework UserNotifications

lipo -create -output "$UNIVERSAL_BINARY" "$ARM_BINARY" "$X64_BINARY"
chmod +x "$UNIVERSAL_BINARY"
codesign --force --deep --sign - "$APP_DIR" >/dev/null

echo "Built macOS helper: $APP_DIR"
file "$UNIVERSAL_BINARY"
