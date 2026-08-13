# Decision memo — deeper numerics and STEP export for MotrWorks desktop

*2026-08-13. For the owner. Context: MotrWorks now has a Tauri desktop shell
(`tauri/`), and the ask is deeper calculations ("FEA-light"), plus STEP export of
rendered builds. This memo lays out the architecture options and a recommendation.
Nothing here is built; the v59.3–v59.6 work stayed inside the pure-JS core.*

## The question

The instinct "JavaScript can't do deep calculations, Python could" deserves a
correction before it drives architecture: **JS numerics are not the bottleneck.**
Double-precision floating point is identical across JS/Python/C, and the current
engine already runs saturation fixed-point loops, Lewis/AGMA gear synthesis, and
fringing-smoothed cross-correlation in microseconds. What Python (SciPy) actually
offers is *libraries* — sparse matrix solvers, meshing, optimizers — which matter
for exactly one class of feature: **real 2-D field solutions (FEA)** and **real
CAD kernels (STEP)**. So the decision is about those two features, not about
rewriting calculations that already work.

## What must not be lost

The current architecture has three properties every option must be measured against:

1. **Browser/desktop parity.** One `index.html` is the whole app; the exe embeds
   it. Any capability that exists only in the desktop build forks the product.
2. **Gate-testability.** The pure cores (`computeDesign` etc.) are instantiated
   directly by 14 compute gates. Anything that computes through a subprocess or
   IPC boundary can't be gated that way.
3. **Zero-install, zero-network.** The exe is 3.6 MB and runs offline. A bundled
   Python runtime is ~80–150 MB and a supply-chain surface.

## Options for deeper compute

| Option | Parity | Gates | Size | Verdict |
|---|---|---|---|---|
| **A. Stay pure-JS** (reluctance networks, closed-form refinements) | ✓ | ✓ | +0 | **Default — most "FEA-light" belongs here** |
| **B. WASM module** (compiled 2-D magnetostatic solver, e.g. Rust/C → wasm) | ✓ (inlined as base64 in index.html) | ✓ (Node runs wasm) | +0.3–1 MB | **Recommended for true FEA-light** |
| C. Rust in the Tauri shell (`invoke_handler` command) | ✗ desktop-only | ✗ needs harness | +small | Only for OS-bound features (file trees, DB) |
| D. Python sidecar (PyInstaller + tauri sidecar) | ✗ desktop-only | ✗ subprocess | +80–150 MB | **Not recommended** — pays the maximum cost for capability B already provides |

**Recommendation:** A + B. The audit's refinement list (below) is all Option A.
If a genuine mesh solver is wanted, a small fixed-grid 2-D magnetostatic solver
(nonlinear Gauss-Seidel on the lamination cross-section — the geometry is already
parameterized) compiled to WASM keeps parity and gate-testability. FEMM stays the
export path for high-fidelity checks, as today.

### The Option-A backlog (from the v59 engine audit, each with its textbook basis)

Anchor-moving (each needs a same-commit golden-gate re-anchor + changelog entry):
1. Computed magnet leakage factor (Hanselman closed form) replacing fixed 0.9 — all PM-field machines.
2. Carter's coefficient in the stepper and cogging effective gaps (currently 1.05 fudge).
3. Brushed-branch saturation iteration (the PM branch's `Hof` loop, armature circuit).
4. ACIM deep-bar R2(s) + slot-permeance X2 (currently X2 = 0.8·X1 placeholder).
5. Drag-corrected PM no-load intercept (solve Kt·I = (Pfe+Pwind)/ω).
6. Two-harmonic stepper permeance model (replaces fixed 0.4/0.55/detent fractions).

Non-anchor (safe any time): Bertotti three-term iron loss; speed-dependent film
coefficients h(v) in the thermal network; slot-leakage taper term (moves ACIM
peakT only); brake gap fringing + soft saturation knee (re-anchor brk-preset-gate
bands when done).

## STEP export

Real STEP AP203/214 B-rep from scratch is a CAD-kernel project — not a weekend
hand-rolled writer. Honest options:

| Option | What it can emit | Cost |
|---|---|---|
| **S1. Hand-written AP214 writer, revolve/extrude solids only** | Housings, shafts, spacers as solids of revolution; lamination as extruded profile (the DXF outline already exists in `buildLamDxf`) | ~1–2 weeks of careful work, pure JS, parity kept. Covers "export the rendered actuator envelope to CAD" |
| **S2. Rust `truck` CAD kernel → WASM** | True B-rep: lofts, booleans, fillets | Heavier integration; kernel is young but real. Parity kept via WASM |
| S3. OpenCascade via Python/C++ sidecar | Everything | Same sidecar costs as compute Option D — not recommended |
| S0. Ship STEP-adjacent instead | Today: DXF (2-D) exists. Add extruded **3MF/STL** of the actuator envelope (trivial mesh writer) as an interim | Days, not weeks; imports into every CAD package as reference geometry |

**Recommendation:** S0 now (an STL/3MF of the actuator assembly is genuinely
useful for packaging studies and costs almost nothing), S1 as the real feature —
scoped to solids of revolution + extrusions, which covers motors, gearheads,
brakes, and shafts almost entirely. Skip S2/S3 unless S1's scope proves too tight.

## Suggested sequencing

1. S0 (STL/3MF export of the actuator envelope) — quick, visible.
2. Option-A refinements in gate-sized commits, anchor-moving ones one at a time.
3. S1 STEP writer for revolve/extrude solids.
4. Re-evaluate WASM FEA-light only after 2 lands (the refined analytics may be enough).
