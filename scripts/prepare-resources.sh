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
# Upstream keys immutable web assets by product.commit. Paradise builds of the same
# upstream commit can have different JS/NLS indices, so give each payload its own key.
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path.cwd()
backend = root / 'resources/backend'
upstream = json.loads((root / 'upstream.json').read_text())['commit']
version = json.loads((root / 'package.json').read_text())['version']
digest = hashlib.sha256((upstream + ':' + version).encode())
for file in sorted((backend / 'out').rglob('*')):
    if file.is_file():
        digest.update(str(file.relative_to(backend)).encode() + b'\0')
        digest.update(file.read_bytes())
product_file = backend / 'product.json'
product = json.loads(product_file.read_text())
product.update(commit=digest.hexdigest()[:40], paradiseUpstreamCommit=upstream, paradiseVersion=version)
product_file.write_text(json.dumps(product, indent='\t') + '\n')
PY
