#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$PARADISE_ROOT"
test -x resources/backend/node
bash scripts/prepare-resources.sh
npm ci --no-audit --no-fund
npm run tauri -- build --bundles app
APP="$CARGO_TARGET_DIR/release/bundle/macos/Paradise Code.app"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
OUTPUT="$PARADISE_VOLUME/artifacts/Paradise-Code-0.1.0-macos-arm64.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUTPUT"
unzip -t "$OUTPUT"
(cd "$(dirname "$OUTPUT")" && shasum -a 256 "$(basename "$OUTPUT")" > "$(basename "$OUTPUT").sha256")
