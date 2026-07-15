# MotrSynth — Module Audit Notes

Audit of build `motrsynth-envelope-v4` (2026-07-14), updated after implementation of the
five priority fixes in `motrsynth-fidelity-v5` (2026-07-14). Items marked **[#1]–[#5]** are
implemented and gate-verified; the status table at the end records what shipped and the
follow-on modifications each one opens up.

---

## 02-engine.js — shared physics

| Item | Note | Priority |
|---|---|---|
| Carter's coefficient | **DONE.** kc computed from slot opening / slot pitch on the effective gap (g + lm/μr for surface PM); applied to BgAvg (PM & brushed, including inside the saturation iteration), the Lmag magnetizing gap, brushed La, and the induction Lmag path. kc → 1 with closed slots; clamped ≤ 1.9; exposed as `kcGap` in the engine return. *Follow-on:* apply to the stepper salient-pole branch (pole-face geometry differs — needs its own pitch definition); consider a second-order kc for very open slots (so/g > 3). | **[#1] ✓** |
| Two-term iron loss | **DONE.** Hysteresis (∝ f·B^1.8) + eddy (∝ f²·B²) split by a per-material eddy fraction `ef` in STEELS (M19 0.30, M15 0.28, Hiperco 50 0.15, solids 0.80–0.85). Reduces exactly to mass·w at 60 Hz / 1.5 T. Verified at 743 Hz: Hiperco ≈ ½ of M19; solid 1018 ≈ 13× M19. *Follow-on:* excess/anomalous-loss third term if bench data warrants; `ef` per lamination gauge (26 vs 29 ga) rather than per grade; PWM ripple-flux loss adder for six-step drives. | **[#2] ✓** |
| Thermal transient / duty | **DONE.** Copper mass computed per thermal branch (3-phase from MLT·coils·turns; brushed from Z conductors; LATM from the toroidal MLT), τ winding and τ machine reported, and a periodic-duty solution (duty % + cycle time state params) using the intermittent pulse factor (1−e^−ton/τ)/(1−e^−tc/τ) over an averaging housing node. Brake economizer modeled: hold at `brkEco` % of bus sets TcuB and Ihold, with a ×1.3 hold-vs-drop-out margin warning. *Follow-on:* validity check when cycle approaches τ machine (currently a stated assumption, not enforced); single-shot time-to-temperature curve; brake engage/release time from the same masses + coil L. | **[#3] ✓** |
| Cold demag | **DONE.** `Tmin` state param (default −40 °C, UI next to magnet temperature); HcJ evaluated at Top and Tmin, margin taken against the minimum, warning names the governing temperature. Verified: ferrite governs at −55 °C, NdFeB at Top. Qualitative ferrite notes removed (now quantified). *Follow-on:* Br also rises cold for NdFeB (slightly higher armature MMF at the same current) — second-order, unmodeled; knee-point (HcB) modeling beyond the HcJ margin. | **[#4] ✓** |
| Kt saturation droop | Kt is constant with current; 2–3× overload torque reads optimistic. A Kt(I) knee tied to the existing ksat iteration would be honest. | future |
| L(I) droop | Inductance has no current dependence — matters for FOC loop design and six-step commutation timing. | future |
| Skew | Absent. One input (slots of skew), well-known kw and cogging-kill factors. | future |
| Radial-force mode number | Flag \|Ns − p\| ≤ 2 as a noise/vibration risk — one line. | future |
| AC copper | Dowell first-order with layer count, capped ×4 — reasonable. True litz behavior (vs strands-in-hand) differs; disclosed limitation. | future |

## 02-engine.js — per machine type

### PM / BLDC
- BEMF harmonic synthesis from pole arc is shape-honest; no tooth-tip fringing shaping (fine, first-order).
- Cogging edge-passing model: periodicity/shape good, magnitude rough — disclosed. Skew input would pair with it.

### Brushed
- `La` exists but no **commutation check**: reactance voltage per coil (L·di/dt at rated speed) vs a ~2–3 V arcing threshold is the classic first-order commutator viability test; every input already exists. — future
- No commutation-limited zone on the torque-speed curve. — future
- Cold ferrite demag currently only a qualitative warning → quantified by **[#4]**.

### Stepper
- Statics complete (holding, detent, f0, L/R). Missing the headline deliverable: **pull-out torque vs step rate** curve (L/R + BEMF rolloff) with mid-band resonance flagging around f0. — future, high value
- Carter not applied to the salient-pole PM branch (pole-face geometry differs); 1.05 retained, disclosed.

### Brake
- **Semantics change (2026-07-14):** bobbin fields now describe the winding window — `brkBobID` = winding start Ø (wire begins here), `brkBobOD` = max winding finish Ø (flange cap; build also still respects pocket − 0.5 mm clearance). Presets migrated losslessly (start unchanged, cap = pocket − 1 mm ≡ old limit); legacy design files auto-migrate on import when the old bore/barrel pair is detected. Engine warns if the wound coil overruns the flange.
- Static pull-in inversion is good; no **engage/release time** (integrate force vs armature motion with the existing L and stroke). Aero brake specs call this out. — future
- Economizer (reduced hold voltage) mentioned in a warning but not modeled → modeled by **[#3]**.
- RthB hardcodes h = 14 with no cooling selector like motors get. — future

### LATM
- Torque-vs-angle correlation model is the strongest per-type model in the tool. Held-on thermal exists; duty from **[#3]** extends it.
- **Layer-resolved winding (2026-07-14):** capacity is now built from layer physics — a perfect single layer lays turns with insulated diameters touching along the bore-face arc (N1); further layers nest at +0.866·dIns per row while crossovers can stack two full diameters (worst-case build = layers·dIns). Warnings fire when turns exceed one perfect layer, when the crossover build exceeds the wrap allowance, and when the worst-case build approaches the rotor magnets (< 0.2 mm) — air-gap interference. `latm` returns N1/layersW/buildNest/buildX/clrMag; capT redefined as the nested capacity inside the wrap allowance.

### ACIM
- X2 = 0.8·X1 placeholder; no **deep-bar effect** (bar skin raises R2 at slip = 1 → locked-rotor torque/current off for deep bars; closed-form correction exists). No magnetizing saturation. — future

## 01-shared.jsx — materials & data
- STEELS carries one specific-loss point per material — extended by **[#2]** with an eddy fraction.
- Wire table: no insulation thermal-class tie (Heavy build vs class 180/200/240); TcuMax is free-entry. — future
- Magnet table solid (Arnold-style, temp-corrected). Knee-point (HcB) modeling beyond HcJ margin — future.

## 03-dxf-import.js
- Round-trip verified by dxf-gate. Future: per-part export beyond the lamination (magnet segments, housing), winding table CSV for the shop.

## 04-views.jsx — visualization
- Cross-section, scope, envelope curves all render SSR-clean. Future: efficiency map over the n-T plane; sensitivity tornado (finite-difference on the pure engine is nearly free).

## 05-app.jsx — app shell & wizard
- **Envelope architecture lock (2026-07-14):** the wizard's architecture now follows the globally selected machine type (no cross-module plug/play); the Pick was replaced with a read-only line. `synthEnvelope` keeps its arch parameter for gate-testability.
- Envelope wizard: **DONE [#5].** One-level restore (toggling snapshot) after Generate or an alternate apply; top-5 alternates surfaced for BLDC, brushed, LATM, and brake (deduped by construction key, each showing its headline numbers, applied with its own snapshot). Stepper/ACIM are single-construction synths — no alternates by design. *Follow-on:* multi-slot design compare (A/B diff view of two snapshots); persist the alternate list into the design file so a saved trade study survives reload.
- Consolidated warnings strip with jump-to-card links. — future
- Printable one-page design summary (params + curves + warnings) for design reviews. — future
- Per-quantity confidence tags (R ±5%, L ±25%, cogging shape-only) to formalize the honest-disclosure principle. — future

## Tooling / process
- Gate suite is strong (11 gates + e2e). Wire into GitHub Actions on push to protect the Pages deploy. — future
- Monte-Carlo tolerance stackup (Br ±3%, gap ±0.05 mm → Kt/R/no-load distributions) is nearly free with the pure engine. — future, high value for reviews

---

## Status of priority fixes

| # | Fix | Status | Verification |
|---|---|---|---|
| 1 | Carter's coefficient | **shipped** | kc 1.032 open / 1.000 closed slots on NEMA-17-class PM; BgAvg & no-load respond; all gates pass |
| 2 | Two-term iron loss | **shipped** | @743 Hz: M19 14.3 W, Hiperco 7.6 W, 1018 solid 182 W; 60 Hz calibration preserved |
| 3 | Thermal duty + brake economizer | **shipped** | 30%/10 s peak < 30%/120 s < continuous; brake 109→46 °C at 50% hold; re-engage warning at 15% |
| 4 | Cold demag (Tmin) | **shipped** | Ferrite governs at −55 °C (33% margin @20 A), NdFeB at Top |
| 5 | Wizard alternates + restore | **shipped** | env-gate asserts ≥2 alternates, first alternate computes clean, half-gauge grid |

New engine params: `Tmin`, `dutyPct`, `cycleT`, `brkEco` (all defaulted in state and `tools/_base.json`;
old design files load safely — the importer merges over defaults). New healthy SSR baseline: **150,008 chars**.
Engine return gains `kcGap`, `HcJmin`, `demagT`; `therm` gains `mCu`, `tauW`, `tauM`, `TcuDuty`, `duty`;
`brake` gains `Ihold`, `Phold`, `eco`.
