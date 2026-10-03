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
