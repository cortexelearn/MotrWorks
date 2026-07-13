# MotrSynth — CortexEdge Engineering Tools

Interactive three-phase motor design tool (BLDC/PMSM + squirrel-cage ACIM).
Inch (default) or metric units. Fully self-contained index.html — React and the
app are bundled in; no CDN, no build step, works on locked-down networks.

- Start panel: file import/export, ten presets (28 V / 270 V aero BLDC incl.
  trapezoidal & sinusoidal profiles, 115 V/400 Hz and 460 V/60 Hz ACIMs), or an
  envelope wizard (architecture, control, target BEMF shape, OD, stack, bus,
  current budget, no-load, stall, rated point) with post-generation feasibility
  checks and concrete envelope-change suggestions.
- DXF lamination import & export (with slot corner radii); slot-in-context
  preview showing yoke, teeth, tips, opening, and airgap.
- Materials with saturation checks & iron loss; rotating-field validity check;
  cogging profile with RMS torque deduction; BEMF scope with L-L / L-N
  (center-tap) reference toggle; inductance rotor-in/out; torque-speed and
  current-torque curves. Every drawing exports to PNG.

All first-order estimates — verify against FEA and datasheets before cutting steel.

## Deploy: put index.html at the repo root, Pages -> main / root.
