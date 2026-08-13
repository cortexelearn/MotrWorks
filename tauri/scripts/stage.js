/* stage.js — copies the built app (repo-root index.html) into tauri/dist/,
   the directory tauri.conf.json's frontendDist embeds into the binary.

   index.html is the whole application — self-contained, no other assets —
   so staging is a single-file copy. It is the COMMITTED build artifact
   (build.py output); this script does not run build.py. If you changed
   src/, run `python3 build.py` at the repo root first. */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "index.html");
const outDir = path.join(__dirname, "..", "dist");

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, path.join(outDir, "index.html"));
console.log(`staged index.html (${(fs.statSync(src).size / 1024).toFixed(0)} kB) -> tauri/dist/`);
