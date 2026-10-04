#!/usr/bin/env python3
"""Prepare immutable release assets after a successful local package build."""
import base64
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
volume = Path(os.environ.get('PARADISE_VOLUME', '/Volumes/ParadiseCodeBuild'))
version = json.loads((root / 'package.json').read_text())['version']
artifacts = volume / 'artifacts'
bundle = volume / 'cache/target/release/bundle/macos'
output = artifacts / ('release-' + version)
output.mkdir(exist_ok=True)
archive = artifacts / f'Paradise-Code-{version}-macos-arm64.zip'
updater = bundle / 'Paradise Code.app.tar.gz'
signature = (bundle / 'Paradise Code.app.tar.gz.sig').read_text().strip()
if f'version:{version}' not in base64.b64decode(signature).decode():
    raise SystemExit('Updater signature is not bound to the expected version')
shutil.copy2(archive, output / 'Paradise-Code-macos-arm64.zip')
shutil.copy2(updater, output / 'Paradise-Code.app.tar.gz')
(output / 'Paradise-Code.app.tar.gz.sig').write_text(signature + '\n')
digest = hashlib.sha256()
with archive.open('rb') as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
sha = digest.hexdigest()
(output / 'Paradise-Code-macos-arm64.zip.sha256').write_text(sha + '  Paradise-Code-macos-arm64.zip\n')
dmg = artifacts / f'Paradise-Code-{version}-macos-arm64.dmg'
shutil.copy2(dmg, output / 'Paradise-Code-macos-arm64.dmg')
dmg_sha = hashlib.sha256(dmg.read_bytes()).hexdigest()
(output / 'Paradise-Code-macos-arm64.dmg.sha256').write_text(dmg_sha + '  Paradise-Code-macos-arm64.dmg\n')
network = root / 'build/extensions/paradise.network-0.1.0.vsix'
shutil.copy2(network, output / network.name)
(output / (network.name + '.sha256')).write_text(hashlib.sha256(network.read_bytes()).hexdigest() + '  ' + network.name + '\n')
base = f'https://github.com/alimortazavi-pr/paradise-code/releases/download/v{version}'
feed = {'version': version, 'notes': 'Native macOS clipboard for files, folders and text, including copy/cut across windows and Finder file copy. Project and active-file window titles, plus the standard Window menu.', 'pub_date': datetime.now(timezone.utc).isoformat(), 'platforms': {'darwin-aarch64': {'signature': signature, 'url': base + '/Paradise-Code.app.tar.gz'}}}
(output / 'latest.json').write_text(json.dumps(feed, indent=2) + '\n')
print(output)
