# MotrWorks v58 — bench-calibration fixes (2026-07-22)

Reconstructed after the original v58 session was lost to a context-compression limit. The bench
acceptance targets (not the lost code) were the authoritative spec; every change below is validated
against the two bench design files (`motor-15s16p-pm.json`, `motor-12s2p-brushed.json`).

## BLDC / PM inductance — was −67%, now −12% (rotor-out)
The `Lend = 0.3 × Lslot` end-winding shortcut collapses whenever end turns are comparable to or
longer than the stack — exactly the 15s16p case (~14 mm end turns on a 7.1 mm stack). Replaced with:
- **End-winding leakage from geometry**: `Lend = (12/Ns)·μ0·(2·endSide)·λ_end·Nser²`, driven by the
  same `endSide` the resistance model already computes. λ_end = 0.47 (bench/FEMM-calibratable) is the
  one knob. This is now the dominant leakage term, which is correct for a low-inductance, high-pole,
  tooth-wound machine.
- **Differential (airgap space-harmonic) leakage**: `Ldiff = σd·Lmag`, σd from slots/pole/phase;
  yields σd ≈ 3.53 for 15s16p (matches the ~3.55 the lost session cited, now computed not hardcoded).
  ~0 with the rotor removed, so it does not touch the bare-stator LCR closure.
- Rotor-out (`LllNR`, the meter reading) is validated, since the 193 µH bench value was measured
  with no rotor installed. **Result: 168 µH vs 193 measured (−12.8%).**

Note: the ACIM branch reuses `Lslot + Lend` for leakage reactance, so its breakdown torque shifts
slightly with the corrected end leakage. No anchor covers this; treat as the same underestimate fixed.

## BLDC / PM resistance — was +17.8%, now −1.6%
The head-mode end-turn model computed its axial rise as `2·headH` (double-count). Dropped to `headH`,
shortening the mean turn ~12%. **Result: 0.472 Ω vs 0.480 measured (−1.6%).** Head-mode only; auto/
bobbin end-turn modes (and the golden-gate designs) are untouched.

## Brushed — "Turns basis" toggle (definitional 2×, no physics bug)
Shop armature drawings spec **conductors per slot**; the tool read the value as turns-per-coil and
doubled Z across the double layer → Kt doubled → no-load halved, Ra doubled. New `turnBasis`
parameter {`coil` (default, unchanged) | `slot`}. On slot basis the entered number is taken as
conductors/slot directly. **Result (12s2p, slot basis, cal off): no-load 5605 rpm (target 5605,
exact); Ra 1.10 Ω** (vs 0.97 target / 0.9 measured — in cal range; calKR now sane ~0.8 instead of the
0.0004 units-bug value). Iterative calibration points expected to trim the Ra residual.

## Calibration units guard
Any cal factor (calKR/calKL/calKKe/calKKt) landing < 0.1 or > 10 now raises a warning with a
units hint. Catches the calKR = 0.0004 case (0.9 Ω typed into the mΩ field).

## UI
- Bench-calibration card notes R is mΩ, L is µH, and that a nameplate "M.H." is microhenries
  (0.193 mH = 193 µH).
- Brushed winding gains the Turns-basis picker; the turns field relabels to "Conductors per slot"
  on slot basis.

## Gates
All ten gates pass; SSR healthy at 164,043 chars (was 163,678). golden-gate anchors unchanged
(it anchors Kt/noLoad/Rll/peakT, none of which the v58 changes move on its test designs).

## Still deferred (bench/FEMM-dependent)
B6 stepper mid-band resonance · B7 LATM end-of-travel fringing · B8 brushed armature reaction.
New calibratable coefficients pending a FEMM solve: λ_end (end-winding permeance), σd (differential).

---

# v58.1 — star-of-slots fix + preset expansion (2026-07-23)

## Winding-factor bug (found while vetting preset candidates)
Slot→phase allocation used a greedy `Math.abs(c) > best` scan over the three phase axes. When a slot
lands exactly between two axes (θ = 30° + k·60°, which happens for **every 12-slot machine** and for
24s4p), the tie resolved on floating-point noise, producing **unbalanced phase allocations**:

| combo | before | after | published kw |
|---|---|---|---|
| 12s10p | 3/5/4 slots, kw 0.9367 | 4/4/4, kw 0.9330 | 0.933 |
| 12s14p | 5/5/2 slots, kw 0.8935 | 4/4/4, kw 0.9330 | 0.933 |

Replaced with deterministic 60°-sector assignment (sectors CCW from −30°: A+, C−, B+, A−, C+, B−)
plus a 1e-9 rad epsilon so boundary slots land CCW rather than on FP noise. 12s10p now yields the
canonical `A+ A− B− B+ C+ C− A− A+ B+ B− C− C+`. Combos without exact ties (9s8p, 15s16p, 18s16p)
are bit-identical to before. This also corrects the rendered winding diagrams, which share topLayer.

Impact: the `NEMA 17 · 28 V` preset is 12s14p and was running **4.4% light on Kt**.

## Golden-gate re-anchors
- **NEMA 17**: Kt 0.048729→0.050883, noLoad 6720.3→6435.9, peakT 0.29237→0.30530 (kw fix; new values correct).
- **ACIM peakT**: 4.7985→4.2091 (v58 end-winding leakage raised X1). **ANALYTICAL ONLY** — no ACIM
  bench data; replace with a measured breakdown value when a cage is characterised. Band kept at ±1%
  deliberately: it is a drift detector, and intentional model changes *should* trip it per this file's protocol.

## Presets: 25 → 33
PM 8→13, brushed 4→7. All validated error-free.

| preset | why |
|---|---|
| 2" · 18s16p · 28 V | kw 0.945, GCD=2 → no UMP, cogging LCM 144. Best general-purpose FSCW. |
| 1.6" · 9s8p · 28 V | most-published compact FSCW; GCD=1 → UMP, watch bearings |
| 1.6" · 15s16p · Hiperco | **bench-validated hardware** (R 0.480 Ω, L 193 µH rotor-out) |
| 3" · 24s22p · 270 V | large-frame, cogging LCM 264, no UMP |
| NEMA 23 · 24s4p · chorded 5/6 | first preset demonstrating short-pitch harmonic cancellation |
| Brushed 24 V · 12s2p | **bench-validated armature**, turnBasis = slot |
| Brushed 24 V · 9s2p | odd-slot smooth commutation (all prior brushed presets were 5-slot) |
| Brushed 48 V · 13s4p wave | first preset exercising wave winding (A2 = 2 regardless of poles) |

## Known pre-existing gate failures (present in the uploaded v57, NOT introduced here)
- **brushed-gate**: no-load 2677 vs expected 3000–40000. Root cause is the same conductors-vs-turns
  ambiguity v58 fixed: the test design's `turns: 25` reads as conductors/slot. Setting
  `turnBasis: 'slot'` yields 5354 rpm and passes. Left unchanged pending a decision.
- **brk-gate**: asserts a warning containing "slip over" for `brkBobID: 34`, but that string does not
  exist anywhere in the engine — the check was never implemented or was reworded. Left unchanged.

---

# v58.2 — gate repairs + brake back-iron derate (2026-07-23)

## Both long-standing gate failures fixed (they pre-dated v57)
- **brushed-gate**: the 540-class test design's `turns: 25` is a shop spec in *conductors per slot*;
  read as turns-per-coil it doubled Z and gave 2677 rpm no-load (implausible for a 540). Added
  `turnBasis: "slot"` → 5354 rpm, Kt 0.0189, Ra 0.387. Same root cause as the v58 bench discrepancy.
- **brk-gate**: asserted a warning containing `"slip over"` for `brkBobID: 34`. The check *does* exist
  (engine: "Winding-start Ø … won't clear the … boss") — it was reworded and the gate was never
  updated, so the case had been failing on a stale needle. Needle changed to `"boss"`.

**All ten gates now pass.**

## Brake: back-iron magnetic derate (`brkFeScale`, %)
New brake input, 0–100%, default 100. Interpolates the pot-core backiron between full catalog steel
and air: `mur_eff = 1 + (mur_nominal − 1)·s`. Models permeability lost to machining/cold work, weld or
plating heat, or simply wrong stock (a 303 body where 416 was intended). Enters the magnetic circuit
through the iron-path equivalent gap `gFe = lFeB/mur_eff + lFeA/mur_arm`, so it directly loads pull
force and release margin. Saturation B is composition-driven and is **not** scaled — at low derate the
reluctance rise dominates, so the model stays self-consistent without it.

Verified sweep on the 24 V · 60 mm preset:

| derate | µr eff | F_pull (N) | release margin |
|---|---|---|---|
| 100% | 700 | 387 | 1.83 |
| 60% | 420 | 330 | 1.56 |
| 40% | 281 | 276 | 1.30 |
| 20% | 141 | 174 | **0.82 — fails to release** |
| 0% | 1 | 0 | 0.00 |

Release margin crosses 1.0 between 40% and 20%, which is the useful design read: this brake tolerates
roughly a 2.5× permeability loss before it stops releasing. A warning fires whenever the derate is
below 100%, quoting effective vs nominal µr, and the effective/nominal µr is shown live in the panel.

---

# v58.3 — actuator module-scoped .json import/export (2026-07-23)

The actuator tab previously had no file IO at all (the sidebar Files card belongs to the winding
module). It now has its own, deliberately **module-scoped**: the payload carries only the 30 fields
the composite module owns — composition (`actMotor`, `actBrake`), gearing (`gbType/Ratio/Stages/Eff/
OD/Len/Brg`, `agmaQ`, `presAng`, `nPlanets`), output shaft (`osh*`), mounting (`mnt*`), finishes
(`fin*`) — under a `scope: "actuator"` envelope (`actuator-planetary-10to1.json`).

Import accepts three shapes and filters ALL of them to the actuator key list: a scoped actuator file,
a full-design file (only its actuator fields apply — a saved motor can never be dragged in through
the actuator tab), or a bare object. Reuses the existing diff-preview/confirm panel, now rendered in
the actuator tab. Motor and brake designs continue to travel in their own tabs' full-design .json.

Verified: 30/30 fields round-trip; full-design import leaks zero motor fields (slots/poles/turns/
awg/magT/Vdc/stackL/motorType all filtered); all ten gates pass; SSR 164,043.

---

# v58.4 — gearhead material / hardness condition (2026-07-24)

The Lewis tooth-yield cap had `sigAllow = 380` MPa hardcoded — every gearhead was silently assumed
case-carburized. New **Gear material / hardness** selector (`gbMat`) in the actuator gearing card,
13 conditions with AGMA 2001-D04-style bending allowables (Grade 1 basis; hardness is part of the
identity since sat is hardness-driven for through-hardened steels, ≈ 0.533·HB + 88 MPa):

carburized 8620/9310 380 (default — identical to prior behavior) · 9310 VAR aero Gr.2 450 ·
induction 4340 345 · nitrided 330 · Custom 455 aged H950 330 · 17-4 H900 300 · through-hard 4140 285 · 416 hard 270 ·
sintered PM 240 · 303/304 annealed 165 · 1018 150 · bronze 80 · 7075-T6 65 · acetal 34.

Verified: the torque cap scales exactly linearly with the allowable (TmaxOut ratio = sig/380 to 3
decimals across all 13 on the planetary test case). Aero Gr.2 buys +18% capacity; annealed 303 costs
−57%; Delrin −91%. Harmonic capacity remains ratcheting-limited and is unaffected (stated in the UI
hint). Selection + allowable shown live, echoed in the synthesis provenance note, exported in the
actuator-scoped .json (`ACT_KEYS` + `gbMat`), and carried in the gear result (`gt.gbMat`,
`gt.sigAllow`). Default preserves all golden anchors.

---

# v58.5 — winding-bobbin calibration pass (2026-08-06)

Driven by real bench hardware: a wound 4-coil stick (43t AWG 27×2 on a measured Ø1.8915" arbor)
with string R measured 2.374–2.387 Ω (avg 2.378 @ ~23 °C).

## Solve-mode race condition — exactly as suspected
With a target R entered, `solveBobbin` OVERWROTE the arbor with the target-R value, discarding both
the geometry arbor (the only term coil-head edits feed) and the insertion floor. Consequences: head
edits were inert with a target set, and an unachievable target shipped a physically impossible tool
(the golden/bob gates' old round-trip case asked 2 Ω on a stator whose insertion floor is Ø27.6 —
the solver returned Ø10.5, a coil ID under the tooth tips, and the gate ANCHORED it).

Now: `Da = max(target-R arbor, geometry arbor, insertion floor)` — target R is a starting point;
whichever governs is named in the basis line; and a new "Real R at solved arbor" row (L-L / per-coil,
with % vs target) moves live as heads are edited. Gates re-anchored to an achievable 5 Ω round trip
(closes to 0.01%) plus explicit clamp assertions.

Tool-known mode is unchanged by design: with a real tool, R is set by the arbor — head edits
redistribute the fixed perimeter between legs and heads (stack-fit readout); the note now says so.

## Wild multi-strand lay — per-strand model (bench-validated)
Measured MLT implies a 2.84 mm radial build — below even the precise-bundle model (3.62) and far
under the wild-bundle model (4.42). Resolution: hand-fed strands settle INDIVIDUALLY, not as round
Ø·√n bundles. New model for wild + strands>1: individual wires at 0.866 hex nest ×1.04 scramble
(single-point calibrated to this stick). Prediction 2.409 vs 2.378 measured (+1.3%, was +3.3%).
Wild single-strand and precise lays unchanged. Channel capacity made consistent (per-strand rows).

## Bench calibration card (bobbin module)
New inputs: measured string R (Ω) + copper temp (`wbMR`, `wbMRTemp`). Derived wind factor
kRw = measured/predicted (×0.9869 on the bench stick) is shown, compensates the R rows, and scales
the Coil-spec solve so target-R arbors track actual shop coils (lower-R winds → larger solved arbor).
Factors beyond ±10% flag a probable units/temperature mismatch.

---

# v59 — release roll-up (2026-08-06)

Identical physics to v58.5 as delivered; re-versioned so the deployed artifact is unambiguous after a
v58.4 screenshot surfaced post-delivery. Contents relative to v58.4 (the last confirmed deployment):
- Bobbin solve-mode arbor governance fix (target R = starting point; heads/throw move real R, reported)
- Wild multi-strand per-strand lay model (bench-validated on the 4-coil stick, +1.3% vs measured)
- Bobbin bench-calibration card (wbMR/wbMRTemp → wind factor, compensates R rows, scales the solve)
- Golden/bob gate round-trip re-anchor (old anchor certified a physically impossible tool) + clamp assertions
- Winding-arbor caption reflects the active lay model
Deployment check: 12s8p design → Coil results "Lay" row reads "wires per layer · layers (per-strand) 10 · 9".

---

# v59.1 — throw/head precedence + reach check (2026-08-06)

Post-v59 screenshots showed throw and 12" head edits not moving the solve. Fingerprint analysis
(solved arbor 1.817" = the wild-BUNDLE build number, reproducible only by the pre-v58.5 engine;
v59 gives 1.856" per-strand) proved the deployment was still serving the old file. But the test also
exposed a real gap: with a coil-head OVERRIDE entered, throw legitimately cannot move the solve
(the override pins head wire length; throw only redraws the span) — and nothing said so, nor flagged
that a 0.60"/end head is physically unable to cross a throw-11 span of 3.74".

- New reach check (solve + tool-known): lap head override shorter than the throw span arc →
  "unwindable as specified" warning quoting the span and the 1.25×span auto suggestion. Note the
  head field is WIRE LENGTH per end, not axial stick-out (bench 12s8p: real heads ≈1.18"/end of wire).
- New governance warning replaces the v58-era dead one: when geometry/insertion out-governs the
  target-R arbor, states both diameters and the real-R overshoot %.
- Precedence note under the solve card: head=0 (auto) lets throw drive heads → arbor → real R
  (throw 3/5/11 → 4.80/6.06/9.81 Ω on the 12s8p); an override pins heads and throw is drawing-only.
- Solve card lay row now shows the per-strand lay when active (was mislabeled "square bundle").

Deployment verification: v59.1 index.html is ~1,234 KB; Coil results "Lay" row must read
"wires per layer · layers (per-strand)" on the 12s8p design.

---

# v59.2 — head reach floor: throw always has teeth (2026-08-06)

v59.1's reach check only WARNED that an override head couldn't cross the span — it still computed the
impossible coil, so throw 16 with a pinned 0.60" head changed nothing, and throw 3 vs 8 at a pinned
2" head solved identically (both geometry-governed by the same fictional heads). The fix: head wire
length per end is FLOORED at the span arc it must traverse. An under-entry is raised to the floor
(flagged, with the entered value quoted), in both solve and tool-known fit numbers.

Result on the 12s8p (0.60" entered): throw 2/3 → target-governed 4.640 Ω (floored heads still under
the target-R geometry — correct); throw 8 → Ø2.846" / 6.93 Ω; throw 16 → Ø4.575" / 10.94 Ω.
Real R verified monotone in throw across 1–16. Heads above the floor are respected as entered
(2" at throw 3 → Ø2.389" / 5.875 Ω, +26.6% vs target, as v59.1 showed).

Governance transparency: new "Arbor candidates — target R · geometry · insertion" row shows all
three diameters with the governor underlined, so which constraint is binding is visible at a glance.

---

# v59.3 — actuator drawings: one axial truth + the buried internals (2026-08-13)

Actuator-tab drawing pass, driven by a full-view audit. The headline find: the composite outline
has ALWAYS drawn its gearhead as an empty box — the per-stage cutaway internals were painted
first and the opaque housing rect after, burying them. Housing (and ring band) now paint before
the shafts and internals. Related honesty fixes, all from data already in props:

- New shared `gearAxial(gt, gLen)` partition (04-views): output bearing block, then one slot per
  stage weighted by that stage's synthesized need (kF·face + 3.7 mm carrier/web — the same weights
  `gearheadAutoLen` uses). GearheadSection internals + dimension brackets, ActuatorOutline
  internals + housing grooves, and ActuatorIso grooves all draw from it, so the external stage
  dividers now land exactly on the internal gear sets (they previously used an unrelated
  0.22/0.78 length split) and per-stage slots are no longer uniform.
- Through-shaft fixed in both section views: the output shaft now stops in the output stage's
  carrier and the motor shaft at the input-stage sun — a multi-stage train has no through shaft.
- Stepper motor sources render as steppers in the outline (stator + two toothed rotor cups with
  the axial magnet for hybrids, PM ring for can-stack) and are labeled "hybrid/PM stepper" —
  previously they drew and were labeled as BLDC.
- The outline's brake is a real pot-core half-section from the Brake tab's own dimensions
  (rim/boss/web backiron, coil in its pocket, springs on the spring circle, annular armature,
  lined disc per 1/2-face architecture, hub) instead of three generic rectangles.
- GearheadSection stage brackets stagger on two rows (proportional slots could collide);
  its caption and the iso's overflow-prone caption are each split into two lines.
- ActuatorView now computes `designGearTrain`/`actEnvelope` once (was twice per render, one
  memoized and one not) and passes the train to the iso for the groove positions.

Toolchain portability (CB_Tower/Windows dev): `build.py` IO is explicit UTF-8/LF (Windows
defaults would mojibake the source and CRLF-corrupt the /*APP*/ markers) and pins
`--alwaysStrict` so the emit keeps its `"use strict";` prologue across tsc versions —
byte-identical rebuild verified against the committed artifact before any source change.
The six e2e scripts take their file:// URL from `pathToFileURL('index.html')` (cwd = repo
root, per the run instructions) instead of the hardcoded /home/claude path. Full suite
(14 compute gates + 6 e2e) verified green on Windows before and after this change.

---

# v59.4 — engine input hardening: the never-throw contract, enforced (2026-08-13)

Engine audit empirically confirmed three contract violations and a family of silent NaN
leaks in computeDesign and friends; every one now returns a named err instead. All fixes
verified by re-running the original failure triggers (15-probe script) — and none moves a
golden-gate anchor; full 14-gate + 6-e2e suite green.

- CRASH: distributed winding with span > 10·slots indexed topLayer[negative] and threw on
  .phase. True modulo + "coil span exceeds slot count" err.
- HANG: PM field-weakening sweep with Vdc = 0 and negative Imax stepped by 0 and never
  exited. Sweep now guarded on wNL > 0; Imax clamped in the exit test; negative drive
  limit errs ("must be ≥ 0").
- NaN gate: a non-finite load-bearing numeric (e.g. rotorOD: NaN) passed every bound
  check (NaN compares false) and poisoned all outputs with zero errs. New per-type input
  sanity block names the offending fields. Airgap check NaN-proofed (!(airgap > 0)) and
  scoped away from brakes, whose statorID/rotorOD have no rotor meaning.
- ACIM: freq = 0 produced an Infinity torque curve (err now); a cage with bars ≤ poles
  collapsed torque ~to zero via the FP-epsilon sine in R2bar (err now); therm.Tcont was
  NaN whenever Imax was absent (Number.isFinite fallback to Icont, all three thermal
  branches).
- Brake: Vdc = 0 returned brake.Vrel = NaN (err: coil produces no pull force); armature
  plate thickness ≤ 0 silently disabled the "too thin" warning path (err now).
- Slot geometry: liner consuming the whole slot produced Infinity fill factors with the
  true cause unstated — computeDesign and computeBobbin both err on zero usable area.
- J (current density) clamped ≥ 0 like Irate already was — a negative J silently produced
  negative rated torque and skipped both density warnings.
- solveBobbin gains the same err/warn channel computeBobbin has (was numbers-only — bad
  input returned a page of NaN diameters with nothing to say why); the solve card renders
  it. composeActuator sanitizes a non-finite ratio (Math.max(NaN, 1) is NaN — every
  composed output went NaN with fail unset).

---

# v59.5 — five presets into the coverage gaps (2026-08-13)

Preset-coverage audit found the gaps; each new entry was iterated against the live engine in
a candidate lab until compute-clean (errors AND warnings, except the LATM build-info note the
gate tolerates), then anchored in its preset gate. All values are scaled from the in-family
presets (which carry the catalog anchors) with the scaling stated in a source comment — none
are bench-measured; replace with catalog rows when a target unit is chosen.

- **NEMA 23 · 0.9° hybrid · bipolar** — first 0.9° preset. On the 23-frame deliberately: a
  100-tooth NEMA 17 rotor has 0.81 mm tooth pitch, under the tool's own ~1.2 mm
  manufacturability floor; the 23-frame's Ø38.9 rotor clears it at 1.22 mm.
- **NEMA 34 · 1.8° hybrid · bipolar** — first 34-frame. Computes 6.4 N·m holding, inside the
  4.5–8.5 N·m band for 65 mm-stack 34HS catalog units.
- **LATM 0.75" · 28 V · SmCo 2-pole · 30° toggle** — smallest LATM (all three priors ≥ 1").
  Passes every latm-preset-gate invariant: Tstop/Tpk 98%, 30° travel far inside the ±90°
  reversal, 380 turns of 708 capacity, 103 °C held-on at the 0.25 A limit.
- **ACIM 230 V · 60 Hz · 2-pole blower** — first 2-pole ACIM. 100 mm frame carries the deep
  2-pole yoke while keeping fill under the 45% insertion ceiling; 19 bars / 24 slots clears
  every cage-slot interaction check.
- **Brake 270 V · 60 mm · aero bus** — first high-voltage-bus brake. Same magnet body and
  springs as the 24 V 60 mm (Thold unchanged at 3.6 N·m); AWG 39 rewind for release authority
  (margin ×2.26 — release margin scales with V·wire-area, turns-independent) with a 50%
  economizer holding the released coil at ~65 °C (hold power scales V²·area/turns, which
  full voltage would push past the insulation class).

Gate/test bookkeeping in the same commit: brk-preset-gate expects 5 presets and carries the
270 V unit's computed baseline bands; the three e2e preset-count assertions (stepper 6,
LATM 4, brake 5) updated. CLAUDE.md preset count 33 → 38. Full suite green.

---

# v59.6 — losses the model already knew, now in the chain (2026-08-13)

Two physics refinements from the engine audit, both chosen because they are pure corrections
to the existing loss bookkeeping and move NO golden-gate anchor (Kt/noLoad/Rll/peakT are all
upstream of them). Suite green before and after.

- **AC copper factor and windage now enter efficiency.** `acFr` (a proper Dowell-style
  skin/proximity factor) and `Pwind` were computed and returned but never used — eta was
  Pout/(Pout+Pcu+Pfe) with DC copper only. The block moved above the loss summation and
  eta is now Pout/(Pout + Pcu·acFr + Pfe + Pwind). Effect at the presets: NEMA 17 BLDC
  eta 81.1% (acFr 1.013), 4" high-temp 94.0% — sub-1% shifts at these frequencies,
  honest divergence at 400 Hz+ designs.
- **The generic thermal branch now heats each machine with its own copper.** It applied
  the 3-phase model (3·Iph²·Rphase) to everything that reached it — including the 2-phase
  stepper (real hold: 1–2 phases at Imax through its own Rs, temperature-iterated) and
  the brake (real loss: the released coil at economizer voltage, self-limiting hot).
  Stepper thermals moved substantially: NEMA 17 1.8° held-on 90 °C, NEMA 34 98 °C —
  numbers a stepper datasheet would recognize. Brake copper mass now from its actual
  wire length. Tcont was already un-anchored; no gate carries these values.
- **Consequence caught by the corrected model:** the v59.5 0.9° NEMA 23 preset's scaled
  winding (31t AWG 25, Rs 3.9 Ω) would have held 157 °C at its 2.8 A rating — physically
  inconsistent with the current class. Rewound 20t AWG 23 (Rs 1.58 Ω hot): 70 °C held-on,
  Kt 0.583, holding 2.31 N·m, squarely in the 23HM 0.9° catalog band. The wrong-model
  version had looked fine — this is exactly why the thermal fix matters.

Deliberately NOT done tonight (each moves anchors and deserves owner sign-off; see the
engine-audit list): computed magnet leakage in place of the fixed 0.9, Carter's coefficient
for the stepper/cogging gaps, brushed saturation iteration, ACIM deep-bar + real X2,
drag-corrected PM no-load intercept, two-harmonic stepper permeance model.

---

# v59.7 — stack skew: EMF, cogging, and the diagonal every wire actually runs (2026-08-13)

New `skew` parameter (mechanical degrees, end-to-end of the stack, default 0 — a straight
stack computes bit-identically to before; all 20 tests unchanged). Three classical effects,
one input, applied to BLDC/PMSM, brushed, ACIM, and the Winding module:

- **EMF/torque:** the sinc-form skew factor k_sk = sin(γe/2)/(γe/2), γe = (p/2)·θ_skew,
  folded into kw as the conventional kd·kp·k_sk product (magnetizing coupling follows).
  Harmonic EMFs in the BEMF synthesis get k_sk(n) — skew filters harmonics harder than
  the fundamental, as it should. Brushed applies the same factor to its conductor-count Kt.
- **Cogging:** attenuated by |sinc| over the cogging period — verified: one cogging period
  of skew ("covering a full bar") drives Tpp to ~zero (12s14p probe: ×0.000 at one period).
  The in-app guidance is denominated in COGGING PERIODS, not slot pitches: on fractional-slot
  machines one period is a few degrees and nearly free (12s14p: 4.3°, k_sk 0.989), while a
  full slot pitch would cost half the EMF (30°: k_sk 0.527) — the tool now says so.
- **Copper path:** every in-slot conductor runs the skewed slot's diagonal —
  hypot(stack, skew arc at mid-slot Ø)/stack multiplies the in-slot legs of the MLT
  (head/auto end modes and the racetrack bobbin's stack leg), so R, copper mass, and the
  thermal chain all see it (NEMA 17 at 30°: Rll ×1.020). ACIM rotor bars run the same
  diagonal (Rbar ×slant). In the Winding module, solveBobbin/computeBobbin size the coil
  against the skew DIAGONAL: required straight length, perimeter, solved arbor Ø, and the
  stack-fit verdicts all use it (new `stkReq` field; fit rows show "vs skew diagonal").

UI: skew field in the BLDC/Brushed/ACIM geometry card and the Winding tab; results row
shows k_sk, slot-path multiplier, and the cogging attenuation when skew > 0. `_base.json`
gains `skew: 0` (engine-consumed key, per the v59 sync rule). Verified by 12-probe script:
skew 0 reproduces the golden anchors exactly; 30° matches the analytic k_sk to 4 decimals.

---

# v59.8 — Carter where it belongs, and nowhere it doesn't (2026-08-13)

First deliberate anchor-moving refinement, per the owner's go-ahead on the audit backlog.
The engine's own trusted `carterK` (already applied in the PM/brushed/ACIM branches) now
covers the two gaps that carried a bare 1.05 fudge, and the slotless machine stops
pretending it has slots:

- **PM can-stack stepper:** magnet-circuit gap and phase inductance use
  carterK(pole pitch, g + lm/µr, slot opening) — the same call, same form, at the
  stepper's coarse pole pitch. (Not golden-anchored; stp-preset-gate stays warning-free.)
- **Cogging model:** effective gap uses the PM branch's computed kcGap instead of 1.05.
- **LATM (slotless):** Carter does not apply to a slotless gap — the 1.05 multiplier on
  (airgap + winding) was a leftover from the slotted branches. Removed from the field,
  inductance, and fringing-angle expressions. **Golden re-anchor:** the ~5% shorter
  effective gap lifts Bg → Kt 0.054424 → 0.056661 and peakT 0.035021 → 0.036461 (both
  +4.1%); Rll untouched. ANALYTICAL — flag for replacement by the bench LATM cal set.
- **Deferred with reason:** the hybrid stepper's toothlet-scale Carter needs a toothlet
  opening the parameter set doesn't carry (only 0.42·pitch tooth width is assumed);
  adding it is a parameter-shape decision, not a drop-in.

Calibration interplay (the Pages site is collecting bench sets): calibration factors are
multiplicative on model output, so any model refinement shifts the *implied* factor. Sets
captured before v59.8 remain valid as measurements; re-derive kKe/kKt against the current
model before using them to judge model error — especially the LATM set, whose baseline
moved +4.1% here. Full suite green (14 gates + 6 e2e).

---

# v59.9 — no-load where drag says it is (2026-08-13)

Second anchor-moving refinement. The PM/brushed no-load point was the pure V/Ke intercept —
zero-loss physics from a model that computes its own iron and windage losses two hundred
lines later. Now the model's drag torque (Pfe(n) + Pwind(n))/ω is subtracted from the whole
torque-speed curve (frequency-resolved Steinmetz via the new feTermF(B, f)), so no-load sits
where electromagnetic torque just covers drag, the rated point is net shaft torque, and
efficiency is Pout_net/Pin with each loss counted exactly once (the old eta divided gross
torque by gross-plus-losses — a subtle double standard). Pure power balance, no new
empirics. Skipped whenever a bench drag calibration (cTd) is active, since measured drag
already contains iron + windage and applying both would double-count.

Anchors: brushed 12 V ferrite 7 krpm noLoad 7025.1 → 6937.3 (−1.25% — a ferrite 2-pole at
7 krpm carries real iron drag). The three PM rows moved less than the 91-point curve grid
and keep their anchors; stall peakT is untouched by construction (drag → 0 at stall).

Recorded for the owner while re-anchoring: the NEMA 23 torquer row has computed
Kt 0.098617 / noLoad 3320.6 vs its written anchors 0.09901 / 3307.5 (±0.4%, inside the
band) since BEFORE this branch — verified by probing the v59.2 baseline build. A pre-v59.2
intentional change evidently moved it without re-anchoring. Left as-is deliberately; worth
folding into the next re-anchor pass or checking against the bench set.

---

# v60.0 — efficiency maps and drive cycles from ONE loss chain (2026-08-13)

Roadmap move 1. The pre-v60 EfficiencyMap view carried its **own** loss model — including
an iron loss scaled `(n/n0)^1.5` instead of the real two-term Steinmetz, and its own copy of
the AC-copper factor — so the map and the results column could (and did) disagree. Physics
now lives in the engine and every screen reads it:

- **`lossesAt(p, r, n, T)`** — losses at any (speed, shaft torque): drag-inclusive
  electromagnetic torque, current, AC copper re-evaluated at THAT speed's electrical
  frequency (Dowell), two-term Steinmetz at that frequency, windage, and η. Signed torque:
  braking still draws current and heats the winding but does no useful work (regeneration
  to the bus is not modeled — conservative and disclosed).
- **`efficiencyMap(p, r, opts)`** — node grid over the drive envelope (56×40 default) for
  marching-squares contours, the per-speed best-efficiency locus, the peak point, the rated
  point, and the S1 continuous-torque line from the thermal model's own Icont.
- **`driveCycle(p, r, samples)`** — midpoint integration of a `time_s, speed_rpm, torque_Nm`
  cycle: energy in/out, cycle-average η, loss split, RMS current/torque, peaks, the fraction
  of the cycle demanded above the drive envelope, and the winding temperature the cycle-mean
  copper loss implies through the design's own thermal resistance. Parsed locally; the file
  never leaves the machine (posture unchanged).

Views: `EfficiencyMap` is now a pure renderer — filled cells on a perceptual ramp, white
iso-efficiency contours (heavier at 80/90%), best-η ridge, drive envelope, S1 line, peak and
rated markers with edge-aware label flipping, and a η legend. New `DriveCycleChart` traces
speed/torque with per-sample efficiency shading. New Drive-cycle card with CSV loader.

**New gate `tools/eff-gate.mjs` (15 compute gates now).** Its load-bearing assertion is that
the map's rated-point η equals `computeDesign`'s η to 0.5% — two independent code paths over
one physics. Verified on three presets (77.90/77.90, 93.11/93.11, 78.58/78.58) plus energy
conservation (Pin = Pout + losses), monotonic copper-in-torque and iron-in-speed, ridge
inside the envelope, constant-cycle η == point η, RMS identities, braking heats-without-work,
and error paths for empty/NaN cycles.

---

# v60.1 — a real field solution, and one number it refuses to report (2026-08-13)

Roadmap move 3 (+ the overlay half of move 4). MotrWorks now solves its own 2-D nonlinear
magnetostatic field, in-app, in a fraction of a second — no external FEMM round trip.

**Solver.** Magnetic vector potential on a structured polar grid, finite-VOLUME so flux is
conserved cell to cell; harmonic-mean face reluctivities so iron↔air jumps aren't smeared;
nonlinear iron from the SAME Froelich curve (`Hof`) the analytical core uses. Magnets enter
as their equivalent magnetization current ∇×M — which lives on the arc's side faces — with
FRACTIONAL cell occupancy at the edges, so rotor rotation is a smooth shift of the source on
a fixed mesh rather than a staircase. The mesh is radially GRADED (cells concentrated in the
airgap, thinned in the yoke) with segment boundaries landing exactly on the physical radii.
θ is periodic over the full 360°, so no symmetry is assumed and fractional-slot machines
solve correctly. Az = 0 at the stator OD, natural at the shaft bore.

Convergence needed a real solver, not a loop: point SOR crawls because a thin airgap makes
the grid violently anisotropic, so the linear solve is radial LINE relaxation — every angular
column's tridiagonal system in r solved exactly (Thomas) with θ-coupling from the current
iterate. Typical solve: 54×288 cells, ~450 ms, residual 4e-5.

**What it reports, and why you can believe it.** A mesh-convergence study (36×216 → 96×576)
holds peak gap B, the gap fundamental, and flux per pole to ~1–2%; `field-gate` asserts all
three stay within 5% between two mesh densities, alongside flux conservation (net radial flux
1e-15 of the absolute), the dominant gap harmonic equalling the pole-pair number, and
parametric responses (thicker magnet ↑, wider gap ↓, non-magnetic stator ↓, ferrite ↓).

**What it refuses to report: cogging torque.** Maxwell-stress cogging was implemented and then
REMOVED when that same study showed it diverging — 4.0e-2 → 3.9e-1 N·m as the mesh refined,
while every other quantity converged. A structured polar mesh staircases the curved
slot-opening and tooth-side boundaries, and stress-tensor torque is a small difference of
large quantities that integrates exactly that noise. A number that fails its own convergence
test does not ship; the analytical cogging model remains the app's source, and a real cogging
capability needs conforming elements or a virtual-work (co-energy) formulation.

**First finding.** Sweeping magnet thickness on the NEMA 17 preset, the field solve shows gap
flux SATURATING and rolling over past ~2.5 mm (0.988 → 0.982 T at 3 → 5 mm) because a thicker
magnet on a fixed rotor OD starves the back iron, while the first-order circuit keeps climbing
(0.928 → 0.961 T). The circuit is trustworthy for sweeps in the thin-magnet regime and
misleading past the knee — which is precisely the sort of thing this card exists to expose.
`field-gate` now asserts the rollover so a future "fix" can't silently restore the
monotonic-forever behaviour.

**UI.** New on-demand Field solution card (Fast/Normal/Fine): flux-line plot (iso-A contours,
which ARE flux lines in 2-D — no streamline integration) over |B| shading to the material's
saturation, geometry rings, the solved air-gap waveform with its true Fourier fundamental
overlaid, and a comparison row against the magnetic circuit. It states plainly when the design
has changed since the solve, and that it is magnetostatic and no-load.

---

# v60.2 — design exploration and the datasheet (2026-08-13)

Roadmap move 5a and the document half of move 4.

**Sweeps and sensitivity (engine).** `computeDesign` is pure and runs in microseconds, so
exploring it needs no optimiser library and no second model — which is the point:
`sweepDesign(p, key, lo, hi, n, metrics)` runs 41 FULL solves across a range and reads every
metric off the real result, so a sweep can never disagree with the results column (the gate
asserts equality to 1e-12 against a direct `computeDesign` at the same value). Designs that
fail inside a sweep are kept as HOLES with their error, not dropped — where a design stops
being buildable is usually the most useful feature of the curve, and the chart shades it.
`sensitivity(p, keys, ±%, metric)` perturbs each input on its own and ranks by influence, so
the top bar is the parameter worth arguing about; inputs whose perturbation breaks the design
read "invalid" instead of vanishing.

**New gate `tools/sweep-gate.mjs` (17 compute gates now)** turns this into a check on the whole
engine, because exploration makes textbook proportionalities cheap to assert: Kt must be
exactly linear in series turns (+10% → +10.00%) and in stack length (+10.00%), R L-L linear in
turns, ranking monotonic, error paths clean. If anything upstream breaks those, this gate
catches it before a person does.

**UI.** Design-exploration card: pick any numeric input, a ± range, and up to six metrics;
each curve is normalised to its own range so shapes compare across units, with a "now" marker
at the current design and shaded invalid bands. Below it, the tornado chart for a chosen metric.

**Datasheet.** The on-screen tool IS the document, printed: a `@media print` sheet drops the
input column, tab bar, controls and file pickers, stacks the results into one measure, keeps
cards whole across page breaks, and leads with a screen-hidden title block carrying the derived
constants (Kt, Ke, R, L, no-load, peak torque, rated point, peak η, winding temp, fill) plus
whether the numbers are analytical or BENCH CALIBRATED. Verified through Chromium's real print
path (emulateMedia + page.pdf), not just by eye.
