#!/usr/bin/env python3
"""Native CI build: never reuses native dependencies from another OS."""
import json, os, pathlib, shutil, subprocess, sys
root = pathlib.Path(__file__).resolve().parent.parent
up = root.parent / 'upstream/vscode'
platform = {'linux': 'linux', 'win32': 'win32', 'darwin': 'darwin'}[sys.platform]
arch = 'arm64' if platform == 'darwin' else 'x64'
def run(args, cwd=root):
    subprocess.run(args, cwd=cwd, check=True, shell=sys.platform == 'win32')
lock = json.loads((root/'upstream.json').read_text())
up.parent.mkdir(parents=True, exist_ok=True)
if not up.exists():
    run(['git','clone','--filter=blob:none','--no-checkout',lock['repository'],str(up)])
run(['git','fetch','--depth=1','origin',lock['commit']],up)
run(['git','checkout','--detach',lock['commit']],up)
os.environ['PARADISE_UPSTREAM_DIR'] = str(up)
os.environ['NODE_OPTIONS'] = '--max-old-space-size=6144'
run([sys.executable,str(root/'scripts/prepare-upstream.py')])
run(['npm','ci','--no-audit','--no-fund'],up)
run(['npm','run','gulp',f'vscode-reh-web-{platform}-{arch}-min'],up)
backend=root/'resources/backend'
shutil.copytree(up.parent/f'vscode-reh-web-{platform}-{arch}',backend,dirs_exist_ok=True)
node=backend/('node.exe' if platform=='win32' else 'node')
run([str(node),str(root/'scripts/check-runtime.cjs')])
# Keep npm beside the bundled runtime; no dependency on the user's Node install.
npm_dir=pathlib.Path(subprocess.check_output(['npm','root','-g'],text=True,shell=platform=='win32').strip())/'npm'
shutil.copytree(npm_dir,backend/'node_modules/npm',dirs_exist_ok=True)
(backend/'bin').mkdir(exist_ok=True)
for tool in ['npm','npx']:
    if platform=='win32': (backend/'bin'/f'{tool}.cmd').write_text(f'@"%~dp0..\\node.exe" "%~dp0..\\node_modules\\npm\\bin\\{tool}-cli.js" %*\r\n')
    else:
        f=backend/'bin'/tool
        f.write_text(f'#!/bin/sh\nexec "$(dirname "$0")/../node" "$(dirname "$0")/../node_modules/npm/bin/{tool}-cli.js" "$@"\n')
        f.chmod(0o755)
run(['node', str(root/'scripts/prepare-extensions.mjs')])
for extension in (root/'extensions').iterdir():
    if extension.name in ['paradise-hub','paradise-onboarding'] and extension.is_dir() and (extension/'package.json').exists(): shutil.copytree(extension,backend/'extensions'/extension.name,dirs_exist_ok=True)
product_file=backend/'product.json'
product=json.loads(product_file.read_text())
import hashlib
digest=hashlib.sha256((lock['commit']+json.loads((root/'package.json').read_text())['version']).encode())
for file in sorted((backend/'out').rglob('*')):
    if file.is_file(): digest.update(str(file.relative_to(backend)).encode()+file.read_bytes())
product['commit']=digest.hexdigest()[:40]
product_file.write_text(json.dumps(product))
run(['npm','ci','--no-audit','--no-fund'])
# Signing is done on the trusted release workstation; no signing secret in CI.
config=root/'platform-build.json'
config.write_text(json.dumps({'bundle':{'targets':['nsis'] if platform=='win32' else ['appimage','deb'], 'createUpdaterArtifacts':False}}))
run(['npm','run','tauri','--','build','--config',str(config)])
