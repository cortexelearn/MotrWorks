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
