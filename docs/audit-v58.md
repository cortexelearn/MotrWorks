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
