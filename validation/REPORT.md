**Current:** [0.3.0 validation and benchmarks](v0.3.0/REPORT.md). The report below is preserved as historical 0.1.0 evidence.

# Paradise Code 0.1.0 validation

Tested 2026-10-03 on Apple M4, 16 GiB RAM, macOS 27.0.1. This is an experimental release. The performance acceptance target **FAILED**.

## Performance

Three alternating warm runs per application, Code - OSS / VS Code 1.140.0 at the same commit, the same TypeScript fixture, ESLint 3.0.34 and Prettier 12.4.0, one open TypeScript document and a zsh terminal. AI and telemetry were disabled in both. Initial warm-up runs were excluded. No builds or downloads ran during the measured series.

| Median metric | Paradise Code | VS Code |
| --- | ---: | ---: |
| Process footprint | 1762 MiB | 975 MiB |
| Sum of resident sets (RSS) | 2100 MiB | 2135 MiB |
| Editor + TypeScript + terminal ready | 2982 ms | 2362 ms |
| Document symbols command | 2.03 ms | 0.25 ms |
| Find TypeScript files command | 12.19 ms | 6.03 ms |
| Idle CPU, one core = 100% | 3.78% | 7.42% |
| Active CPU, one core = 100% | 50.26% | 51.87% |

Installed app size: Paradise approximately 460 MiB on disk; VS Code approximately 872 MiB. ZIP size and exact file checksum accompany the release.

Paradise had **80.7% higher total process footprint** and **26.2% longer readiness time**. The required 20% memory reduction and maximum 10% latency regression were not achieved. RSS also failed the 20% reduction target. Lower idle CPU in this short fixture does not establish lower energy use generally.

Method: `scripts/benchmark-run.py`, `scripts/measure-processes.py`, and the acceptance extension. Resource-coalition membership includes launchd-owned WebKit networking/GPU/content processes. Footprint includes macOS memory accounting; summed RSS can double-count shared pages and is shown separately. CPU counters are converted from Mach ticks using `mach_timebase_info` (125/3 on this machine). The first Paradise CPU trace was corrected from the original tick units; the JSON records that correction. After readiness the fixture settles for 20 seconds, runs symbols/search repeatedly for 8 seconds, then settles 5 seconds before a 10-second idle sample. Readiness includes the TypeScript service and terminal process, not just a painted window. These are small-fixture measurements on a multitasking desktop, not a claim about every project or battery life.

## Functional and security evidence

- Full Code - OSS workbench ran in WKWebView, with native menus, local folder picker, separate Finder-opened file window, split editors, and Persian text.
- 13/13 acceptance checks passed in the standalone Release app: local Node host; Persian read/edit/save; TypeScript symbols; Git discovery and stage/commit; real PTY; file watching; file search; Prettier formatting; ESLint diagnostics; Tasks; actual Node breakpoint on line 2; webview worker and native-bridge isolation.
- All 13 functional checks also passed with outbound IP networking blocked by the macOS sandbox (`tests/offline.sb`), while localhost and Unix IPC stayed available. A 14th check confirmed that the extension host could not reach Open VSX. This did not disable the host machine network.
- A TypeScript project compiled with `tsc` and its generated JavaScript ran successfully.
- Open VSX download/install and uninstall passed. Local VSIX installation passed. Registry signatures are checked using the Open VSX Ed25519 format; the Microsoft verifier is not used for this registry.
- 7/7 loopback security checks passed, including token, Host, HTTP Origin, WebSocket Origin, and webview traversal rejection.
- A forced backend kill restarted the backend. Workbench recovered after its Reload Window prompt. Reconnection without reload is not implemented.
- An unsaved Persian edit survived a forced native process kill and was subsequently saved successfully.
- Normal Quit prompted about active terminals; the app, backend, PTY host, and test shell all exited. After forced native termination the launcher also stopped its backend.
- Persian text search returned four matching files; scoped Replace changed only the chosen Persian text fixture and persisted it to disk. Light Modern and the default dark workbench were visually inspected.
- Finder-style file opening handled a path containing spaces and Persian; a second native window opened the requested file.
- Missing backend produced a visible startup error rather than creating a fallback profile.
- The ZIP was downloaded from the private GitHub release, reassembled from verified HTTP byte ranges, checked against SHA-256, checked with `unzip -t`, extracted into the external Applications folder, and verified with `codesign --verify --deep --strict`. That downloaded app launched its own bundled backend and rendered the Paradise welcome screen with a clean personal profile. Bundled Node and npm ran without using the system Node.
- Native zoom resized the workbench successfully.
- `cargo check`, upstream client TypeScript typecheck, production server-web build, Release Tauri build, ad-hoc code signature verification, and ZIP integrity checks passed.

## Remaining limits

- Performance target failed. This release must not be described as lighter in RAM, fully compatible with Microsoft VS Code, or production certified.
- Apple notarization is not included. Only this Apple Silicon/macOS 27 machine was exercised; the configured macOS 14 minimum has not been validated on macOS 14 hardware.
- Marketplace-only extensions, proprietary Microsoft services, AI, SSH, Containers, and cloud sync are outside this release.
- Full VoiceOver interaction and Finder drag-and-drop have not been manually certified. Semantic accessibility labels were inspected, but that is not equivalent to a screen-reader user test.
- Storage-full / unplugged-SSD-under-load recovery and arbitrary third-party extension compatibility are not certified. Keep the SSD mounted while editing.
- The benchmark does not cover large monorepos, sustained indexing, battery drain, or long sessions.

See `functional-tests.json`, `security-tests.txt`, `environment.json`, and `benchmark/` for recorded evidence.
