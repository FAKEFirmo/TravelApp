#!/usr/bin/env bash
# Builds Little Prince for this Mac with the "Travel globe" widget, signs it with your own Apple Development
# certificate (a free Apple ID in Xcode is enough) and installs it in /Applications. Personal use only.
# Run: npm run widget
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

# Your signing identity and team (the App Group folder must be prefixed with the team ID)
IDENTITY=$(security find-identity -v -p codesigning | awk '/Apple Development/ { print $2; exit }')
[ -n "$IDENTITY" ] || { echo "No Apple Development certificate. Xcode → Settings → Accounts → add your Apple ID → Manage Certificates → +"; exit 1; }
TEAM=$(security find-certificate -Z -a -c "Apple Development" -p | openssl x509 -noout -subject | sed -n 's/.*OU=\([A-Z0-9]*\).*/\1/p' | head -1)
GROUP="$TEAM.com.littleprince.app"
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
echo "Signing as team $TEAM, shared folder $GROUP"

# 1. The app (release build), told where to write the widget's data
LP_APP_GROUP="$GROUP" npx tauri build --bundles app
APP="src-tauri/target/release/bundle/macos/Little Prince.app"

# 2. The widget extension, built by Xcode (widget/LittlePrinceWidget.xcodeproj) and signed with your team.
#    Xcode's working files go to a temp folder: its build database doesn't like this project's path.
node --experimental-strip-types --no-warnings widget/world.mjs > widget/world.json
XCB="$(mktemp -d)"
xcodebuild -quiet -project widget/LittlePrinceWidget.xcodeproj -target LittlePrinceWidget -configuration Release \
  ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES DEVELOPMENT_TEAM="$TEAM" LP_APP_GROUP="$GROUP" MARKETING_VERSION="$VERSION" \
  SYMROOT="$XCB/build" OBJROOT="$XCB/obj" -allowProvisioningUpdates build
APPEX="$XCB/build/Release/LittlePrinceWidget.appex"
OUT="src-tauri/target/widget" && mkdir -p "$OUT"
sed "s/__GROUP__/$GROUP/" widget/app.entitlements > "$OUT/app.entitlements"

# 3. Embed and sign (inside out: widget first, then the app that contains it)
mkdir -p "$APP/Contents/PlugIns" && rm -rf "$APP/Contents/PlugIns/LittlePrinceWidget.appex"
cp -R "$APPEX" "$APP/Contents/PlugIns/" && rm -rf "$XCB"   # keeps Xcode's own signature
codesign --force --sign "$IDENTITY" --entitlements "$OUT/app.entitlements" "$APP"
codesign --verify --deep --strict "$APP"

# 4. Install (the previous copy goes to the Trash) and launch, which registers the widget with macOS
pkill -f "Little Prince.app/Contents/MacOS/little-prince" 2>/dev/null || true
[ -d "/Applications/Little Prince.app" ] && trash "/Applications/Little Prince.app"
cp -R "$APP" /Applications/
open "/Applications/Little Prince.app"
sleep 3
# The widget gallery caches what it found; restart its services so the new/updated widget is picked up
pluginkit -a "/Applications/Little Prince.app/Contents/PlugIns/LittlePrinceWidget.appex" 2>/dev/null || true
killall chronod NotificationCenter 2>/dev/null || true
sleep 2
pluginkit -m -p com.apple.widgetkit-extension | grep -q com.littleprince.app.widget \
  && echo "Done. Add it: right-click the desktop → Edit Widgets → search \"Little Prince\"." \
  || echo "Installed; if the widget isn't listed yet, log out and back in once."
