#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$PARADISE_VOLUME/upstream/vscode"
test "$(git rev-parse HEAD)" = "07f806f999227108933c2e30515b26eecc1fda74"
python3 "$PARADISE_ROOT/scripts/prepare-upstream.py"
npm ci --no-audit --no-fund
npm run gulp vscode-reh-web-darwin-arm64-min
mkdir -p "$PARADISE_ROOT/resources/backend"
rsync -a --delete "$PARADISE_VOLUME/upstream/vscode-reh-web-darwin-arm64/" "$PARADISE_ROOT/resources/backend/"
