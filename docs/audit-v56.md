# MotrWorks physics audit — v56 baseline (2026-07-19)

Scope: every module, focus on features added since the v40 audit. **No code changed** — findings
for review, ranked by likely effect on predicted results. Where I could, I quantified against the
catalog anchors we already trust (Maxon GP32-class, HD size convention).

---

## A. High priority — numbers users will act on

**A1. Lewis tooth cap is optimistic by a compounding ~25–40% (gear train, v43+).**
Three omissions stack: (1) form factor Y is a constant 0.308, but a 12–15t shifted pinion runs
Y ≈ 0.25–0.27 (−12–18%); (2) planetary load share assumes perfect Wt/nP — real 3-planet share
factor Kγ ≈ 1.15–1.25 without a floating sun, worse at 4–5 planets (−13–20%); (3) no dynamic
factor Kv — the input stage sees motor speed, and pitch-line velocity at 6 krpm knocks another
10–25% at small modules. Additionally only the sun mesh is checked: the **planet is an idler in
fully reversed bending** (≈ ×0.7 allowable) and is often the true weak tooth. Recommendation:
treat the current cap as a screening number; before trusting a margin under ×2, add Y(Z, shift),
Kγ, Kv, and the planet-tooth reversed-bending check.

**A2. Output backlash is likely understated 2–4× (v43).**
Model: per-mesh allowance m·(0.035 + kQ), ×2 meshes, reflected through downstream ratios.
Two gaps: the two meshes of one planetary stage do not simply add at the carrier (the sun–planet
share reflects down by the stage ratio; ring–planet dominates), but more importantly **bearing
clearance, planet-pin fit, and output-spline lash are excluded** — in miniature catalog units
these dominate. My 2-stage Q9 result (12′) sits below the 15–60′ catalog band for this class.
The Q-monotone trend is right; the absolute number needs a datasheet or bench anchor before it
appears on a drawing.

**A3. Gearhead losses are not fed to any thermal model (composite actuator).**
A 2-stage planetary at 82% dissipates 18% of transmitted power in the gearhead — at the peak-torque
corner of a 4″ actuator that is tens of watts into a sealed housing — yet actuator continuous
torque derives from the motor thermal model alone. Continuous ratings for geared, sealed units are
optimistic. Suggest: route (1 − η)·P into a simple gearhead thermal node, or at minimum a
warning row when gear dissipation exceeds ~25% of motor copper loss.

**A4. Auto gearhead length runs ~25% lean vs. catalog (v51).**
Bottom-up build for a GP32-class 2-stage predicts ≈27 mm vs. 36.3 mm catalog housed length. The
buildup is honest about gears + bearing but light on integrated output-bearing pairs, retaining
hardware, and adapter plates that catalog units carry. This is the right direction to be wrong in
for a custom design tool, but bench-calibrate the +6 mm interface and the per-stage clearance
against your hardware before quoting envelopes.

**A5. Harmonic efficiency is a constant 0.80 (v50).**
Real CSF-class η spans ~55–85% with ratio, speed, temperature, and load fraction (drops hard at
partial load and cold). The size table's torque limits are flagged as class approximations in-app;
the fixed η deserves the same flag plus, eventually, a load-fraction derating curve. Back-drive
η_b = 2 − 1/0.8 = 0.75 overstates back-drivability — harmonics need meaningful breakaway torque.

## B. Moderate — model structure sound, constants or coverage to verify

**B1. Gear drag split (v43).** Per-stage drag 0.085·(30/OD)^0.35 lands the 2-stage anchor
(0.9²) but implies seals/churning per stage; the output seal is one part. Fine while anchored,
wrong extrapolation at 3–4 stages (over-penalizes) — recalibrate when you have a 3-stage bench point.

**B2. Back-drive breakaway not modeled (v43).** η_b ≈ 2 − 1/η_f holds for torque-proportional
loss only; at zero load, detent + seal drag set a finite breakaway torque that the tool doesn't
report. A "back-drive breakaway (est.)" row from the drag term would complete the story.

**B3. Armature-reaction MMF into the MEC (v41).** FaOf uses (3/π)·√2 ≈ 1.35 fundamental —
defensible — but applies full q-axis MMF to the d-axis magnet circuit (conservative cross-
saturation mixing). Acceptable; note it when comparing to FEMM loaded solves.

**B4. FEMM loop not yet closed (v41).** The export exists precisely to validate ksat/Bg; no solve
has been compared yet. One run at I = 0 vs. BgAvg, one at Imax vs. kIT, would either anchor or
correct A-series items cheaply. Magnet Hc exports at 20 °C only — hot/cold solves need a manual edit.

**B5. Spur Lewis at 12t shifted pinions (v55).** Same Y-constant issue as A1 applies to the new
12t pinions (~12% optimistic); idler-style reversed bending applies to cluster intermediate gears.

**B6. Stepper pull-out curve (pre-v40 model, standing).** Analytical curve has no mid-band
resonance dips or damping input; calibration against a bench pull-out sweep remains on the
horizon list. Hollow-rotor J change (v56) is correct (r⁴) and raises f₀ slightly — the resonance
placement matters more once dips are modeled.

**B7. LATM end-of-travel fringing (standing horizon item).** Torque is effectively flat vs.
angle; sector-edge fringing droops torque approaching the stops — end-stop holding predictions
are optimistic. Also: slotless mode runs no armature-reaction demag iteration (disclosed
in-app) — the −40 °C cold-start at full drive current is the corner to hand-check against HcJ.

**B8. Brushed armature reaction (standing horizon item).** No brush-shift/cross-field demag at
peak current; commutation modeled as a fixed brush drop. Peak-torque linearity at high current is
optimistic for the 2-pole ferrite class where reaction bites earliest.

## C. Low / disclosed / working as intended

- Brake: friction µ static value; no temperature fade or spring relaxation — conservative design
  margins (×1.42 anchor) cover typical duty; revisit for hot continuous-slip duty only.
- Wild-wind constants (1.0 stacking, +8%, ×0.8 cap) and jumper/flange estimates: disclosed in the
  assumptions ledger; standing ask to tune against weighed coils.
- Iron loss: two-term fit, PWM harmonics excluded (disclosed).
- Golden gate anchors: still frozen analytical baselines, not measurements — replace as bench
  data lands (by design).
- Tooth-yield chart line represents a static cap; consider labeling momentary vs. continuous
  when A1 refinements land (harmonic already distinguishes rated vs. ratcheting).

## Suggested verification order (cheapest anchor per finding)
1. One FEMM solve at 0 A and one at Imax (closes B4, checks A-series MEC inputs) — an hour.
2. GP32 (or equivalent on your shelf) tri-check: housed length, backlash at output, back-drive
   feel/torque → anchors A2, A4, B2 in one sitting.
3. Torque-to-failure or published S-N point for one gear set → scales A1's allowable honestly.
4. Thermal soak of any geared unit at rated → sizes A3's node constant.


---

# Resolution appendix (v57, same day)

**Resolved analytically, verified against the catalog anchors:**
- **A1** — Lewis rebuilt: Y(Z) interpolated (12t–rack) with +0.035 shift credit, planet checked as a
  reversed-bending idler (×0.7 — and it IS the limiting tooth on the 18/27/72 set), planet load-share
  Kγ (1.15–1.45 by count), AGMA-style Kv from input-stage pitch-line speed (Q-quality-dependent).
  Net: the 2-stage reference cap 6.7 → 4.7 N·m static, 4.4 at a 6 krpm input — the audit's predicted
  25–40% reduction, now earned rather than estimated.
- **A2** — Backlash restructured: single-mesh allowance with the sun–planet term reflected by the stage
  ratio (×2 removed), plus an explicit MECHANICAL clearance estimate (bearing play, pin fits, spline
  lash — output-referred once, bearing-style aware: AC pair tightest). Reference case: 10.9′ gear +
  17.4′ mech = 28.3′, mid catalog band; the card shows the split so the estimate is visible.
- **A3** — Gear dissipation row at the operating point with a natural-convection housing ΔT estimate
  and a warning above 40 °C stating plainly that this heat is NOT in the motor thermal model.
- **A4** — Auto length gains retention hardware per stage, seal/retainer on the bearing block, and a
  GP-class adapter allowance: Ø32 2-stage now 34.2 mm vs 36.3 catalog (6% lean, was 21%).
- **A5** — Harmonic η by ratio (82/79/75% at 50/100/160:1, rated warm), partial-load/cold caveat in
  the size warning.
- **B1** — Drag split: per-stage churning + ONE output-seal loss; η progression 89.1/83.0/77.3% for
  1/2/3 stages (2-stage inside the GP32 75–83% band; 3-stage no longer over-penalized).
- **B2** — Back-drive breakaway row (est., OD^2.5, ×4 harmonic preload): Ø32 planetary ≈ 0.009 N·m
  (catalog no-load friction ~0.01 ✓), harmonic size-20 ≈ 0.2 N·m.
- **B3** — Conservative q-into-d MMF mixing now stated in the assumptions ledger for PM machines.
- **B4** — FEMM magnets export at the design magnet temperature via aBr (header states the temp).
  The solve-and-compare loop remains yours to run — unchanged call to action.
- **B5** — Covered by A1's Y(Z) at the 12t spur pinions (0.33 N·m, honest).

**Explicitly deferred (bench-dependent, standing horizon items, own passes):**
- **B6** stepper resonance dips/damping — needs a pull-out sweep to calibrate against.
- **B7** LATM end-of-travel fringing — needs either a FEMM-style 2D check or bench torque-vs-angle.
- **B8** brushed armature reaction — planned with the same satAux pattern once a peak-current bench
  point exists to anchor the knockdown.
