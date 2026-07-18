# MotrSynth — CortexEdge Engineering Tools

Motor design tool: BLDC/PMSM, brushed PM DC, limited-angle torquers, 2-phase
hybrid steppers, power-off spring-applied brakes, and squirrel-cage ACIM with
saturation-aware physics, reactance/field-weakening drive model, thermal and
efficiency estimates, DXF lamination import/export, bench-calibration tracking,
an envelope wizard for every machine type (BLDC/PMSM, brushed, LATM, stepper,
brake, ACIM) that scores real engine builds against per-type targets, and a
a composite Actuator module (motor + brake + multi-stage planetary/harmonic/spur gearhead with per-stage efficiencies). Magnet wire in half-AWG sizes throughout.
Inch (default) or metric.

Fully self-contained index.html — React and the app are bundled in; no CDN,
no server, works on locked-down networks.

## Source layout (modular)

    src/01-shared.jsx     materials, wire tables, magnets, presets, theme, DXF export
    src/02-engine.js      computeDesign — the physics engine (pure function)
    src/03-dxf-import.js  DXF parser + lamination geometry analyzer
    src/04-views.jsx      charts, drawings, SVG components, input controls
    src/05-app.jsx        app shell: state, layout, wizard, cards

Modules concatenate in numeric order into one script — no bundler needed.
All six machine types are live. Brushed PM DC uses true armature semantics:
slots on the rotating lamination opening outward, magnet ring on the housing
ID, lap/wave paths (a = poles x plex / 2 x plex), commutator + brush model,
armature DXF export. Parameter keys are shared with BLDC (statorOD = housing
OD, statorID = magnet ring ID, rotorOD = armature OD, yoke = core depth) so
design JSON stays lossless across types.

## Building after editing source

    npm i -g typescript          # once
    python3 build.py             # rebuilds index.html in place

## Deploy: push index.html (and src/) to the repo root; Pages -> main / root.
