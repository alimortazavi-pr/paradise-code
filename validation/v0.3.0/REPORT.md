# Paradise Code 0.3.0 validation

2026-10-03 · Apple M4 · 16 GiB · macOS 27.0.1. Public preview. This report supplements the original 0.1.0 evidence; older tests are not represented as newly repeated.

## New acceptance evidence

- 13/13 functional checks passed in the Release app: Node extension host, Persian file edits, TypeScript symbols, Git, PTY, file watching/search, Prettier, ESLint, stage/commit in a disposable repository, Tasks, Node breakpoint, and extension-webview worker/bridge isolation.
- Seven live token/Host/Origin/WebSocket/webview security checks passed. Five focused bridge checks passed, including an Option-key character mapping regression.
- Workbench **File: Open Folder…** displayed the native macOS panel; selecting the folder `workspace فارسی` returned to that workspace. Cancellation returned to the editor. Native menu selection also displayed the Mac panel.
- Native Save As wrote a Persian-named TypeScript file whose bytes match the original. The physical Option–Command–O shortcut opened the native folder panel. Switching editor tabs rendered normally when the app was brought to the foreground; background automation captures can precede WebKit animation-frame painting.
- Dark and Light Modern themes were visually checked in the native app; the title area follows the selected theme.
- The app title bar is overlaid into the workbench instead of a white title strip. The geometric Paradise P is shared by the icon, onboarding and website.
- Runtime packaging validates native Node dependencies before producing the app. Production backend, Rust, code signature, and ZIP integrity checks passed.

## Published delivery

- Public GitHub release `v0.3.0` includes a standard ZIP, SHA-256, signed updater archive and version-bound feed.
- Downloaded the ZIP anonymously from the public release, verified its SHA-256 and every ZIP entry, extracted it, verified its ad-hoc signature, and launched that extracted app with a fresh isolated profile. The Paradise welcome walkthrough and workbench loaded.
- Vercel production responds anonymously with HTTP 200. Direct versioned download/checksum links, loaded assets, keyboard tabs and FAQ disclosures were checked in the deployed site. Desktop and 390px mobile layouts have no horizontal overflow or browser console errors in the tested flows.

## Performance: target failed

Three alternating warm runs per application with the same TypeScript fixture and ESLint/Prettier extensions. One TypeScript editor and one idle zsh terminal. Readiness includes language symbols and terminal initialization. The full process coalition includes WebKit subprocesses. No builds or network downloads ran during the measured series. This was a multitasking desktop, not an isolated lab; the existing user editor remained open in the background for both applications. Results should not be used as general battery or large-project claims.

| Median | Paradise 0.3.0 | VS Code 1.140.0 |
|---|---:|---:|
| Total process footprint | 1,638 MiB | 1,015 MiB |
| Sum of resident sets | 1,001 MiB | 1,370 MiB |
| Ready, including language service | 3,895 ms | 3,309 ms |
| Document symbols | 1.97 ms | 0.43 ms |
| Find TypeScript files | 12.70 ms | 6.23 ms |
| Idle CPU, one core = 100% | 3.48% | 8.34% |
| Active CPU, one core = 100% | 35.95% | 86.41% |

The primary footprint measure is **61.4% higher**, and readiness is **17.7% longer**. The agreed 20% memory reduction / at most 10% latency regression target failed. RSS is lower in these runs, but summing RSS can double-count shared pages and does not overturn the footprint result. CPU is lower in this short workload; sustained energy use is untested. Raw traces and exact values are in `benchmark/` and `benchmark-summary.json`.

The WebSocket client now receives ArrayBuffer messages directly instead of allocating a Blob/FileReader queue. The packaged client contains that change. These results do not establish that this individual change caused a memory improvement over earlier runs.

## Limits

Apple notarization, full VoiceOver use, arbitrary extensions, storage-full/disconnected-drive-under-load recovery, older macOS hardware, large monorepos and battery endurance remain uncertified. A backend crash can still require Reload Window. Microsoft-only services and 100% Microsoft VS Code parity are not promised. See the original report for detailed feature boundaries.
