#!/usr/bin/env python3
"""Stage the built app for the Tauri desktop shell.

Copies the shipped index.html (the build.py output, committed at the repo
root) into dist/, which src-tauri/tauri.conf.json points at as frontendDist.
Run automatically by `cargo tauri dev` / `cargo tauri build` via the
beforeDevCommand / beforeBuildCommand hooks; safe to run by hand from any
directory. If src/ changed, run build.py first — this script does not rebuild.
"""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parents[1]
src = root / "index.html"
if not src.exists():
    sys.exit("make-dist: index.html not found at repo root — run build.py first")

dist = root / "dist"
dist.mkdir(exist_ok=True)
shutil.copy2(src, dist / "index.html")
print(f"make-dist: dist/index.html staged ({src.stat().st_size} bytes)")
