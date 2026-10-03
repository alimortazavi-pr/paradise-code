#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
PIN=07f806f999227108933c2e30515b26eecc1fda74
NODE_VERSION=24.18.0
if [ ! -x "$PARADISE_VOLUME/tools/node-v$NODE_VERSION-darwin-arm64/bin/node" ]; then
  mkdir -p "$PARADISE_VOLUME/tools"
  cd "$PARADISE_VOLUME/tools"
  curl -fL --retry 3 "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-arm64.tar.gz" -o "node-v$NODE_VERSION-darwin-arm64.tar.gz"
  curl -fL --retry 3 "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o SHASUMS256.txt
  grep " node-v$NODE_VERSION-darwin-arm64.tar.gz$" SHASUMS256.txt | shasum -a 256 -c -
  tar -xzf "node-v$NODE_VERSION-darwin-arm64.tar.gz"
fi
if [ ! -d "$PARADISE_VOLUME/upstream/vscode/.git" ]; then
  git clone --depth 1 --branch 1.140.0 https://github.com/microsoft/vscode.git "$PARADISE_VOLUME/upstream/vscode"
fi
test "$(git -C "$PARADISE_VOLUME/upstream/vscode" rev-parse HEAD)" = "$PIN"
cd "$PARADISE_ROOT"
npm ci --no-audit --no-fund
bash scripts/build-backend.sh
bash scripts/package.sh
