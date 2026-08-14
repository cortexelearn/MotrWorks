# Roadmap — taking MotrWorks to MotorSolve/JMAG-Express class

> **Status 2026-08-13 (v60.2).** Moves 1, 3, 4 and 5 are LANDED — efficiency maps + drive
> cycle (v60.0), the in-app 2-D magnetostatic solver with flux plots (v60.1), design
> exploration + printed datasheet (v60.2), and the design library. Move 2 (physics backlog)
> is partly done: Carter (v59.8) and drag-corrected no-load (v59.9) shipped with re-anchors;
> magnet leakage, brushed saturation, ACIM deep-bar and the stepper permeance model remain.
> The capability table below is the PRE-work inventory, kept as the baseline it was measured
> against; see `audit-v58.md` v60.x for what each move actually delivered — including the
> cogging torque the solver computes and deliberately refuses to report.

*2026-08-13. Owner-facing plan. Premise per owner direction: the desktop exe IS the
platform (browser parity not binding; Pages stays only as the calibration-collection
channel). Goal: a tool a motor engineer would reach for instead of JMAG-Express for
the machine classes MotrWorks covers.*

## Where MotrWorks actually stands (from the v59 full audit)

Honest inventory against the JMAG-Express feature set (templates · machine constants ·
efficiency map · cogging/ripple · induced voltage · demag · thermal · winding tool ·
FEA correction · optimization):

| Capability | MotrWorks today | Gap to Express-class |
|---|---|---|
| Templates/presets | 38 gate-anchored presets, envelope wizard, 6 machine types + actuator/winding | Comparable in breadth for its classes; ACIM/PMSM depth thinner |
| Machine constants | Kt/Ke/R/L, curve, saturation kIT, skew (v59.7), calibration factors | Solid analytical core; magnet leakage still fixed 0.9 |
| Cogging/ripple | Edge-energy cogging model + skew sinc | Heuristic; no ripple-under-load |
| Induced voltage | BEMF harmonic synthesis w/ per-harmonic skew | Good |
| Demag | First-order margin at Imax, temp-resolved HcJ | No spatial field check |
| Thermal | Lumped 2-node + duty pulse, per-type copper (v59.6) | No drive-cycle transient, fixed film coefficients |
| Efficiency map | Single-point eta (loss-complete since v59.6/v59.9); an EfficiencyMap view exists | No full torque-speed efficiency MAP |
| Winding | Star-of-slots auto, arbor/bobbin tooling module (unique — Express has nothing like it) | No manual winding editor |
| FEA | FEMM Lua export only (external tool) | THE gap: no in-app field solution |
| Optimization | None | Gap |
| Reporting | PNG/DXF export per view | No one-click datasheet |
| Rendering | Hand-built SVG sections (strong 2-D), iso render | No field overlays, no 3-D |

Two structural advantages the commercial tools don't have here: the **bench-calibration
loop** (capture kR/kL/kKe/kKt per module — being collected now) and the **manufacturing
modules** (winding-arbor tooling, DXF laminations, NCR-free preset gates). Keep leaning
into both — "analytical + your bench truth" is a defensible position against "FEA you
must trust blind."

## The five moves, in order

### 1. In-app 2-D magnetostatic FEA (WASM) — the credibility jump
JMAG's core claim is field-verified numbers. MotrWorks' geometry is already fully
parameterized (it emits FEMM models today), so the path is: one-pole-pitch polar mesh,
nonlinear vector-potential solve (Newton + the BH tables already in `STEELS`), periodic
boundary, magnet regions from `poleArc/magT`. Deliverables per solve: Bg waveform,
flux-line overlay on the cross-section, Kt/cogging/demag cross-check vs the analytic
core, and a JMAG-Express-style "corrected" badge. Build it as a Rust→WASM module loaded
by the exe (decision memo, option B): keeps the pure-JS core gate-testable, adds ~1 MB.
The existing FEMM export becomes the validation harness for the solver itself — solve
the same model both ways, gate the agreement. *Effort: the big one — weeks, staged:
(a) linear solve + flux plot, (b) nonlinear BH, (c) cogging via virtual work, (d) the
correction workflow.*

### 2. Efficiency maps + drive-cycle — highest value-per-effort
Sweep the existing loss-complete model over the torque-speed plane (it's microseconds
per point): contour efficiency map, loss-split maps (Cu/Fe/windage), MTPA/field-weakening
trajectory, and a drive-cycle evaluator (upload a cycle CSV → energy, RMS torque, thermal
duty into the existing pulse model). Pure JS, no anchors move (new outputs). This is the
single most visible "Express-class" screen and it's almost free. *Effort: days.*

### 3. Finish the physics backlog, bench-validated
Magnet leakage per Qu & Lipo 2004 (implemented against the paper, validated with the
incoming calibration sets before re-anchor), brushed saturation loop, ACIM deep-bar,
stepper two-harmonic permeance (task list holds details). Do these BEFORE trusting the
FEA correction deltas — otherwise the FEA "corrects" known analytic gaps and the
correction factors lie about accuracy. *Effort: 1–2 gate-verified commits each.*

### 4. Rendering: field overlays first, 3-D second
The rendering upgrade that reads as "real tool" is **flux lines + |B| shading on the
existing cross-sections** (falls out of move 1's solution — contour Az). Second:
torque-ripple/cogging animated at true angle. Third: a WebGL exploded 3-D of the
actuator assembly (the envelope geometry already exists in `actEnvelope`/`gearAxial`;
hand WebGL or an approved three.js dependency — ask-first). Print-quality datasheet
(one-click PDF: cross-section, curves, table of constants, assumptions ledger) belongs
here too — Express's "design sheet" is half its perceived value. *Effort: overlays
days-after-move-1; 3-D and datasheet ~a week each.*

### 5. Product spine: persistence, sweeps, distribution
- **SQLite design library** via tauri-plugin-sql (the shell's documented seam):
  versioned designs, comparison view, calibration-set storage per module.
- **Parameter sweep/optimizer**: grid/Pareto over any numeric inputs against any
  outputs (the pure `computeDesign` makes this trivial to parallelize across workers);
  tornado sensitivity chart. Express sells "multipurpose optimization" — this is the
  match, and it's pure JS. *Effort: days for sweep, more for a real optimizer.*
- **Distribution**: code-sign the NSIS installer, version the design-file schema
  (imports already migrate), auto-update feed if desired (breaks zero-network — it's
  a product decision; a manual "check for updates" link is the conservative middle).

## Sequencing recommendation

Order: **2 → 3 → 1(a,b) → 4-overlays → 1(c,d) → 5 → 4-3D.** Efficiency maps land
Express-class value in days and change nothing under the gates; the physics backlog
must precede FEA correction for the corrections to mean anything; FEA staged so a
linear solver with flux plots ships early. The calibration loop runs through all of it:
every module's bench set is the acceptance test the commercial tools can't offer.

## What NOT to do

- No Python sidecar (decision memo stands — WASM covers the solver need at 1% of the cost).
- No 3-D FEA ambition — 2-D + analytic end effects is exactly what Express-class tools do.
- Don't soften the gates: every move above adds outputs; anchored outputs only move
  with the documented re-anchor ritual, which is the tool's integrity story.
