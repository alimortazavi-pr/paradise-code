#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$PARADISE_ROOT"
test -x resources/backend/node
resources/backend/node scripts/check-runtime.cjs
bash scripts/prepare-resources.sh
npm ci --no-audit --no-fund
export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$PARADISE_VOLUME/secrets/updater.key}"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
npm run tauri -- build --bundles app
APP="$CARGO_TARGET_DIR/release/bundle/macos/Paradise Code.app"
codesign --verify --deep --strict "$APP"
OUTPUT="$PARADISE_VOLUME/artifacts/Paradise-Code-$(node -p "require('./package.json').version")-macos-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUTPUT"
unzip -t "$OUTPUT" > "$PARADISE_VOLUME/artifacts/archive-check.log"
(cd "$(dirname "$OUTPUT")" && shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")

# Generate Finder metadata directly: no Finder automation permission is needed.
DMG_PYTHON="$PARADISE_VOLUME/tools/dmg-venv/bin/python3"
if [ ! -x "$DMG_PYTHON" ]; then
  python3 -m venv "$PARADISE_VOLUME/tools/dmg-venv"
fi
"$DMG_PYTHON" -m pip --cache-dir "$PARADISE_VOLUME/cache/pip" install -r scripts/dmg-requirements.txt
DMG_OUTPUT="${OUTPUT%.zip}.dmg"
"$PARADISE_VOLUME/tools/dmg-venv/bin/dmgbuild" -s scripts/dmg-settings.py "Paradise Code" "$DMG_OUTPUT"
hdiutil verify "$DMG_OUTPUT"
(cd "$(dirname "$DMG_OUTPUT")" && shasum -a 256 "$(basename "$DMG_OUTPUT")" > "$(basename "$DMG_OUTPUT").sha256")

# Validate the app inside the actual installer, not just the build directory.
VERIFY_MOUNT=$(mktemp -d "${TMPDIR%/}/paradise-dmg-check.XXXXXX")
rmdir "$VERIFY_MOUNT"
cleanup_dmg_check() {
  hdiutil detach "$VERIFY_MOUNT" >/dev/null 2>&1 || true
  rmdir "$VERIFY_MOUNT" 2>/dev/null || true
}
trap cleanup_dmg_check EXIT
if diskutil image attach --help >/dev/null 2>&1; then
  # DiskImages2 rejects the build TMPDIR. Only this OS mount helper uses its default;
  # the image, mount point and all application/build payloads remain on the SSD.
  env -u TMPDIR diskutil image attach --readOnly --nobrowse --mountPoint "$VERIFY_MOUNT" "$DMG_OUTPUT" >/dev/null
else
  hdiutil attach "$DMG_OUTPUT" -readonly -nobrowse -mountpoint "$VERIFY_MOUNT" >/dev/null
fi
codesign --verify --deep --strict "$VERIFY_MOUNT/Paradise Code.app"
test "$(readlink "$VERIFY_MOUNT/Applications")" = /Applications
cleanup_dmg_check
trap - EXIT
