#!/bin/bash
# Source this file before all local build commands. Never fall back to the internal disk.
export PARADISE_VOLUME="${PARADISE_VOLUME:-/Volumes/ParadiseCodeBuild}"
if ! mount | grep -F " on $PARADISE_VOLUME (" >/dev/null; then
  echo "Paradise build volume is not mounted. Attach ParadiseCodeBuild.sparsebundle first." >&2
  return 1 2>/dev/null || exit 1
fi
export PARADISE_ROOT="$PARADISE_VOLUME/project"
export TMPDIR="$PARADISE_VOLUME/tmp/"
export npm_config_cache="$PARADISE_VOLUME/cache/npm"
export npm_config_devdir="$PARADISE_VOLUME/cache/node-gyp"
export CARGO_HOME="$PARADISE_VOLUME/cache/cargo"
export CARGO_TARGET_DIR="$PARADISE_VOLUME/cache/target"
export ELECTRON_CACHE="$PARADISE_VOLUME/cache/electron"
export PLAYWRIGHT_BROWSERS_PATH="$PARADISE_VOLUME/cache/playwright"
export XDG_CACHE_HOME="$PARADISE_VOLUME/cache/xdg"
export CLANG_MODULE_CACHE_PATH="$PARADISE_VOLUME/cache/clang"
export SWIFT_MODULECACHE_PATH="$PARADISE_VOLUME/cache/swift"
export PATH="$PARADISE_VOLUME/tools/node-v24.18.0-darwin-arm64/bin:$PATH"
mkdir -p "$TMPDIR" "$npm_config_cache" "$CARGO_HOME" "$XDG_CACHE_HOME"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PUPPETEER_SKIP_DOWNLOAD=1
