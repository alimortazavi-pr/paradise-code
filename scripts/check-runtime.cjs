const { createRequire } = require('node:module');
const path = require('node:path');
const backend = path.resolve(__dirname, '../resources/backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
for (const name of ['undici', 'fs-extra', '@vscode/spdlog', 'node-pty', '@parcel/watcher']) {
  requireBackend(name);
  process.stdout.write(`Runtime dependency loaded: ${name}\n`);
}
