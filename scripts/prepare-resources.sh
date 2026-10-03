#!/bin/bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$PARADISE_ROOT"
# Ship npm/npx with the standalone Node runtime so web projects need no system Node.
mkdir -p resources/backend/node_modules/npm resources/backend/bin
rsync -a --delete "$PARADISE_VOLUME/tools/node-v24.18.0-darwin-arm64/lib/node_modules/npm/" resources/backend/node_modules/npm/
for tool in npm npx; do
  cat > "resources/backend/bin/$tool" <<SCRIPT
#!/bin/sh
exec "\$(dirname "\$0")/../node" "\$(dirname "\$0")/../node_modules/npm/bin/$tool-cli.js" "\$@"
SCRIPT
  chmod +x "resources/backend/bin/$tool"
done
sips -z 192 192 icons/icon.png --out resources/backend/resources/server/code-192.png >/dev/null
sips -z 512 512 icons/icon.png --out resources/backend/resources/server/code-512.png >/dev/null
cp icons/icon.ico resources/backend/resources/server/favicon.ico
rsync -a --delete extensions/paradise-onboarding/ resources/backend/extensions/paradise-onboarding/
