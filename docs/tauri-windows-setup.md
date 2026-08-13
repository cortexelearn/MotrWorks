# MotrWorks desktop — Tauri setup on Windows (CB-Tower)

The repo carries a Tauri v2 desktop shell in `src-tauri/`. It wraps the shipped
`index.html` (the same self-contained artifact GitHub Pages serves) in a native
WebView2 window and produces a standalone `MotrWorks.exe` plus an NSIS
installer. Nothing about the web app or its build pipeline changes — the shell
is purely additive.

## How it fits the existing architecture

- `src/` → `build.py` → `index.html` stays the single source of truth.
- `tools/make-dist.py` copies `index.html` into `dist/` (git-ignored).
  Tauri's `beforeDevCommand` / `beforeBuildCommand` hooks run it automatically.
- `src-tauri/tauri.conf.json` points `frontendDist` at `dist/`, so the desktop
  app ships exactly the artifact the gates validated.
- If you change `src/`, run `python build.py` first — `make-dist.py` stages,
  it does not rebuild.
- localStorage autosave works in the desktop app; WebView2 persists it under
  the app's data directory (keyed by the `com.cortexedge.motrworks`
  identifier), separate from any browser profile.

## One-time machine setup (CB-Tower)

1. **Microsoft C++ Build Tools** — install "Desktop development with C++"
   from https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. **Rust (MSVC toolchain)** — install rustup from https://rustup.rs and
   accept the default `stable-x86_64-pc-windows-msvc` toolchain.
3. **WebView2 runtime** — preinstalled on Windows 10/11; nothing to do
   normally. (Installer: https://developer.microsoft.com/microsoft-edge/webview2/)
4. **Python 3** — needed by `build.py` and `tools/make-dist.py`; make sure
   `python` is on PATH (the Microsoft Store stub or python.org installer both
   work).
5. **Tauri CLI** —

       cargo install tauri-cli --version "^2"

6. Optional, only for editing the web app itself: `npm i -g typescript`
   (build.py shells out to `tsc`).

## Clone into C:\Dev

    cd C:\Dev
    git clone https://github.com/cortexelearn/MotrWorks.git
    cd MotrWorks
    git checkout claude/tauri-setup-cb-tower-airib4   # until this branch merges to main

## Run / build

    cargo tauri dev      # launch the app in a dev window
    cargo tauri build    # release build + installer

Run both from the repo root (`C:\Dev\MotrWorks`). Outputs:

- `src-tauri\target\release\motrworks.exe` — the standalone executable
- `src-tauri\target\release\bundle\nsis\MotrWorks_0.1.0_x64-setup.exe` — installer

The first build compiles the Tauri crates and takes several minutes;
incremental builds are fast.

## Notes and knobs

- **Icon** is a generated placeholder (motor lamination). To replace it, drop
  a 1024×1024 PNG somewhere and run `cargo tauri icon path\to\logo.png` — it
  regenerates `src-tauri/icons/`.
- **Installer targets**: `bundle.targets` in `src-tauri/tauri.conf.json` is
  `["nsis"]`; add `"msi"` if you want a WiX MSI as well (the CLI downloads the
  toolchain on first use).
- **CSP is `null`** deliberately — the app is one file of inline scripts and
  needs no network, so Tauri injects no Content-Security-Policy that would
  break it.
- **Hooks assume `python` on PATH.** On a Linux/macOS checkout, change the two
  hook commands in `tauri.conf.json` to `python3 tools/make-dist.py` (or add a
  `python` alias).
- File open/save currently uses the browser-style download/upload paths built
  into the app. If native file dialogs (real Save As into C:\..., remembered
  directories) are wanted later, that is the `tauri-plugin-dialog` +
  `tauri-plugin-fs` follow-up — a deliberate next step, not part of this
  scaffold.
