# Paradise Code

An experimental macOS Apple Silicon editor: Tauri 2 / WKWebView, the full Code - OSS web workbench, and a bundled local Node extension host. This repository contains the shell, reproducible upstream integration, and acceptance tests. It is not a Microsoft VS Code distribution and does not include the Microsoft Marketplace, Copilot, cloud sync, SSH, or Containers.

## Storage and build

All build data is kept in an APFS sparsebundle on the external SSD. The app intentionally requires `/Volumes/ParadiseCodeBuild` and never substitutes an internal-disk profile. Run `Mount Paradise Code.command` in the original SSD folder before using the app.

For a new machine, install Xcode Command Line Tools and Rust, then create the image without repartitioning the SSD:

```sh
hdiutil create -size 160g -type SPARSEBUNDLE -fs APFS -volname ParadiseCodeBuild \
  '/Volumes/Extreme SSD/Programming/Projects/Paradise Code IDE/ParadiseCodeBuild.sparsebundle'
hdiutil attach '/Volumes/Extreme SSD/Programming/Projects/Paradise Code IDE/ParadiseCodeBuild.sparsebundle' \
  -mountpoint /Volumes/ParadiseCodeBuild -nobrowse
touch /Volumes/ParadiseCodeBuild/.paradise-volume
git clone git@github.com:alimortazavi-pr/paradise-code.git /Volumes/ParadiseCodeBuild/project
cd /Volumes/ParadiseCodeBuild/project
bash scripts/bootstrap.sh
```

`upstream.json` pins Code - OSS 1.140.0 and its commit. The build uses upstream's Node 24.18.0; the packaged server runtime is the version selected by upstream's remote build. npm/npx are included. `scripts/prepare-upstream.py` produces `patches/paradise.patch` deterministically. The source, patches, caches, profiles, temporary files, and artifacts live on the APFS volume. Existing system Rust/Xcode installations are reused. OS-managed swap and caches are outside the app's control.

Release output: `/Volumes/ParadiseCodeBuild/artifacts/Paradise-Code-0.1.0-macos-arm64.zip` and its `.sha256`. The app uses ad-hoc signing, not Apple notarization. Updates are manual. No GitHub credentials are embedded.

## Architecture and boundaries

- Node binds only to `127.0.0.1`; an ephemeral token authenticates each launch. HTTP Host/Origin and WebSocket Origin are validated.
- Extension webviews use separate hashed localhost origins, local assets, and service workers. macOS ATS exceptions are limited to localhost.
- No Tauri IPC capabilities are granted to remote web content. Native window-close approval uses a per-window random nonce available only to the trusted top-level workbench.
- Extensions execute local code with your user permissions, as in Code - OSS. Only install trusted extensions.
- Open VSX canonical asset URLs and registry Ed25519 signatures are supported; Microsoft Marketplace signatures/services are separate.
- Profiles are separate from VS Code. Three application-specific Library directories are symlinked into the external profile; existing unrelated data is never replaced.
- The backend restarts up to three times on unexpected exit. The workbench may require **Reload Window** after a backend crash. Unsaved edits use upstream backup storage.
- Quit asks about dirty files and active terminals. The shell stops the backend process tree, including PTYs with separate sessions.

## Validation

```sh
source scripts/env.sh
cargo check
# Against a running app with its default test profile:
npm test
```

`tests/qa-extension` is a development-only VS Code extension; copy it into the test profile's `extensions/paradise-acceptance`, open a copy of `tests/fixture`, run `npm ci`, trust that fixture, and run **Paradise: Run Acceptance Checks**. It creates and edits fixture files, commits in the fixture Git repository, executes tasks/terminals, and exercises debugger breakpoints. It is never bundled with the application. Results go to the fixture's `qa-results.json`.

`measure-processes.py` groups macOS processes by resource coalition, including launchd-owned WKWebView helpers. See the release validation results for measured outcomes and remaining compatibility limits. A successful build is not a claim of complete VS Code parity or lower resource use.

Code - OSS and bundled components retain their upstream license files. The shell and integration are MIT licensed.
