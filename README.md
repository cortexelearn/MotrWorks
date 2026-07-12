# MotrSynth — CortexEdge Engineering Tools

Interactive three-phase BLDC motor design tool. Inch (default) or metric units.

- Start panel: design-file import/export, curated NEMA/aero-bus presets, or an
  envelope wizard (stator OD, stack, bus, current budget, no-load speed, stall
  and rated point -> synthesized starting design).
- DXF lamination import (auto-detect OD/bore/rotor/slots) and DXF export of the
  lamination profile including slot corner radii.
- Lamination & rotor materials with saturation checks and iron-loss estimates;
  squirrel-cage ACIM model computed from bar count/area/material.
- Fill factor, magnet grades, coil build & end turns, winding development
  diagram with energization animation, inductance (rotor in/out), BEMF
  oscilloscope with phase/line-line views, cogging torque profile, and
  torque-speed / current-torque curves. Every drawing exports to PNG.

All first-order estimates — verify against FEA and magnet datasheets before
cutting steel.

## Deploy to GitHub Pages

1. Create a repository (e.g. `motrsynth`) under the cortexelearn account.
2. Upload the contents of this zip to the repository root.
3. Settings -> Pages -> Source: "Deploy from a branch" -> `main`, `/ (root)` -> Save.
4. Live in ~1 minute at `https://cortexelearn.github.io/motrsynth/`.

## Files

- `index.html` — the complete app, self-contained (React via CDN, compiled in-browser).
- `src/motor-designer.jsx` — the component source, for editing or migrating to a Vite build later.

No build step, no server, no account, no ads.
