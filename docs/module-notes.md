# MotrWorks — Module Audit Notes

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
- **Pull-out curve (2026-07-14): DONE.** Quasi-static upper bound anchored at 2-on holding: I_ach = (0.9V − kφω)/√(Rs² + (kE·ω·Ls)²) clamped to Imax, T = √2·kφ·I_ach; kφ back-solved from Th. Mid-band resonance rpm (step rate = f0) reported and flagged as avoid-sustained. Shown in the stepper tab and consumed by the Actuator module (advisory carried through ÷N). Real pull-out dips near resonance — noted as a derate.
- Carter not applied to the salient-pole PM branch (pole-face geometry differs); 1.05 retained, disclosed.

### Brake
- **Lining field fix (2026-07-15):** the card's "Lining OD/ID" bound `brkRo`/`brkRi` raw, which the engine treats as *radii* — entering a diameter drew a 2× disc. Fields now display true diameters (storage stays radii, so presets, files, wizard, and torque math are untouched), and the engine warns when the lining Ø reaches the backiron Ø.
- **Spring model (2026-07-15):** clamp force is no longer a direct input — springs are specified catalog-style by free height and engaged height (force = k·ΔL), with the engaged height physically tied to the coil pocket: springs seat on the pocket floor and bear on the armature, so engaged height should equal pocket depth + air gap (checked, with a warning naming dedicated seats as the exception). Also checks no-preload (free ≤ engaged) and coil-bind risk (released height < 40% of free). Presets, wizard, tuner, and importer migrated losslessly; legacy design files with brkSpring auto-derive the heights on import.
- **Friction architecture (2026-07-14):** face-count-aware — 1 face: static lining bonded to the armature working the bare rotating disc (no pressure plate); 2 faces: lining bonded to both sides of the rotating disc, pinched between the static pressure plate and the moveable non-rotating armature. Energized animation overlays the flux path (rim leg → working gap → armature → boss gap → back web) as nested loops around the coil. Bobbin drawn seated at the pocket bottom. Backiron (statorMat) and armature (rotorMat) materials now independent: split-μr iron path, saturation cap = min(backiron pole faces, armature ring section at the boss radius), armature B reported with a warning — this immediately caught the 90 mm preset's armature at 2.00 T (thickened 8 → 9 mm).
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

## Audit resolution pass (2026-07-19, v57)
- Resolved audit items A1–A5, B1–B5 (see docs/audit-v56.md resolution appendix): Lewis Y(Z)/Kγ/Kv/planet-idler check (caps down 25–35%, planet correctly limits), backlash mesh+mech split (28′ mid-band, shown split in-card), gear-dissipation row + ΔT warning, auto length GP-anchored to 6% lean, harmonic η(ratio), drag re-split (seal once) with η 89/83/77% by stages, back-drive breakaway row, MEC-mixing assumption line, FEMM magnets at design temp. B6/B7/B8 deferred pending bench anchors, stated in the appendix. New SSR baseline 163,678 (ledger line).

## Stepper hollow rotor (2026-07-19, v56)
- **Rotor definition gains Shaft/Hub OD (0 = auto 1.6× shaft) and Through-hole Ø (0 = none)** — thin-section ID pass-through rotors now model. Physics: rotor inertia subtracts the bore (r⁴-honest: a Ø8 hole in a Ø25 hybrid removes only 0.9% of J, single-step f₀ rises accordingly); holding torque untouched (the magnetic path doesn't run through the bore). Warnings: hub wall < 1 mm (machining/press-fit review) and < 2 mm (thin-section, verify fits), through-hole ≥ 45% of rotor Ø (magnet-ring seat intrusion — check ring ID / cup webs clear the bore), hole ≥ hub. Cross-section draws the hub ring and a dashed through-bore; both fields serialize and export in step results (hubD/thruD).

## Spur stepped modules + housekeeping (2026-07-19, v55)
- **Spur clusters now step module per stage** (promised in v50): modules scale ~√torque for balanced bending stress (e.g. 1.2″ 3-stage: m 0.15/0.25/0.4), with 12-tooth positively-shifted pinions per cluster practice (drawing note emitted). Torque caps rose 2–2.5× — 0.75″: 0.14→0.26, 1.2″: →0.35, 1.5″: →0.29 N·m — landing in real miniature-spur catalog territory. Ladder-span fit and Lewis limiting stage recompute per-stage; sections draw the per-stage geometry they already carried. act-gate asserts stepping, 12t pinions, fit, and the torque floor.
- **GearFaceView removed** — dead since the v47 side-section replacement.

## Field-pertinence pass (2026-07-19, v54)
- **Phase sequence hidden where inert (user-caught on LATM):** `seq` only feeds the rotation-direction readout, which was already hidden for LATM/stepper/brake — the input itself now hides there too. Kept: BLDC/ACIM ("Phase sequence A-B-C/A-C-B") and brushed (its existing "Supply polarity Normal/Reversed" mapping). Hidden with a source comment stating why: single-winding LATM and brake have no sequence; the 2-phase stepper's direction is step-order, not a 3-phase sequence.
- "Drive + lead R / phase" drops the "/ phase" for single-winding machines (LATM, brake).

## Tcu clarity + LATM flux overlay (2026-07-19, v53)
- **"Hot reference temp" relabeled** to "Performance temp (copper)" with an in-card note: wire tables and the L-L resistance target stay at 20 °C ambient per magnet-wire convention (the inverse solve is gated exact at 20 °C); this field only sets the copper temperature the performance model runs at (R × (1 + 0.393%/°C·ΔT) into the curves and hot-side rows).
- **LATM flux visualization (user request):** PM gap flux now draws during the toggle animation — five arrows per pole face crossing the working gap (N outward red, S inward blue), riding the rotor. Where a pole face overlaps a sector whose conductor current direction drives the current half-stroke, arrows render heavy and a green band marks the torque zone — the concentration visibly migrates and flips as the rotor swings and polarity reverses. Caption clarified: ⊗/⊙ are conductor current directions per sector of the ONE toroidal winding (not separate coils), alternating by sector and flipping with drive.

## Brushed anatomy in the composite (2026-07-19, v52)
- **Motor-type-correct internals (user-caught):** the composite outline drew BLDC anatomy (stator coil heads flanking the stack) for every motor type. Brushed sources now draw the inside-out truth: stationary magnet arcs bonded to the housing ID (N red / S blue), the wound armature on the shaft with its end turns, and the commutator + brush at the rear. BLDC path unchanged. Also fixed the stale 0.42·OD note under the outline (now describes the built-up length rule).

## Auto-length rebuild + section completeness (2026-07-19, v51)
- **Auto gearhead length rebuilt bottom-up (user-caught waste):** the proportional 0.42·OD/stage rule ballooned at large OD (Ø165 3-stage: 244 mm of mostly air). New `gearheadAutoLen`: per-stage = 1.5×face + carrier + clearance, real bearing widths (radial 0.138·OD min 4 mm, double ×1.9, AC pair ×2.1), faceplate + interfaces. Results: Ø46 2st 49→35 mm (−28%), Ø101.6 3st 150→78 (−48%), Ø165 3st 244→116 (−52%); gears + carriers now fill their slots. designGearTrain's bearing block unified to the same widths so the length budget, Lewis face cap, and drawings all agree. Bench-calibrate the constants against your hardware — the rule is disclosed in the explainer.
- **Harmonic auto = drop-in catalog size:** with OD in auto, the envelope snaps to the smallest HD-convention size that swallows the motor (NEMA23 Ø57 → size 17, Ø60) and the length comes straight from the size table + bearing + faceplate — no wasted space, per the HD/Sito catalogs.
- **Side section now complete for all three trains:** harmonic draws its real architecture — flexspline cup wall running to the output diaphragm, grounded circular-spline block at the input end, elliptical wave-generator hub with bearing balls, "size N · cup length" callout, component-set dimension. Spur stages draw on their actual ladder axes (climbing one center distance per stage, dashed axis lines) in both the side section and the composite cutaway.
- Intentional model change: envelope lengths shifted by design; gates updated in-commit (len-cap probe to 12 mm), full suite green.

## Harmonic & spur fidelity (2026-07-19, v50)
- **Harmonic, catalog-sized:** `HARMONIC_SIZES` table in the CSF/CSG size convention (8–40: OD, gear-set length, available ratios, rated + momentary-peak torque) — CLASS APPROXIMATIONS, flagged in-app to replace with the datasheet row. The synthesis picks the largest size fitting the envelope, snaps the ratio to that size's catalog set (warned), computes Zf = 2N / Zc = Zf+2, and the momentary peak becomes the torque cap — labeled "ratcheting limit, size class" instead of Lewis, feeding the chart line and margin row. Radial section is now the real component set: circular spline (toothed, grounded), flexspline following the ellipse, wave-generator bearing with balls on the elliptical race, mesh zones marked at the major axis.
- **Spur, cluster-real:** multi-stage ladder synthesis — pinion on axis i drives the gear on axis i+1, module sized so the ladder of center distances spans the housing DIAMETER (input axis offset to the wall, as real spur heads are built); fine modules 0.1/0.15 added to the standard series; span check warns honestly. Radial section draws the cluster ladder with per-stage center-distance dimensions. Uniform module per cluster for now; stepping module up on output stages is the known next refinement.
- **Presets:** HD size 14/20/25 (Ø2″/2.75″/3.35″, 50/100/80:1) + spur clusters 0.75″ 6:1/2st, 1.2″ 20:1/3st, 1.5″ 60:1/4st — all synthesis-validated (harmonic exact, spur within 2.5% with ✓ fit). Spur torque caps land in the honest miniature range (~0.14 N·m at these sizes — why planetaries exist).

## Pinion wrap rendering (2026-07-19, v49)
- **Sawtooth silhouettes removed (user direction):** pinion teeth now render as parallel axial flank lines whose vertical spacing follows the circular projection y = R·cos(θ) — lines bunch and darken toward the silhouette edges, reading as teeth wrapping the diameter. End-face tooth-tick ring (matched count) and center-drill dot stay; the stepped tip Ø from v48 unchanged. Same treatment in the 2D outline.

## Stepped pinion (2026-07-19, v48)
- **Pinion redrawn to match real hardware (user reference photo):** the gear portion is now its OWN stepped cylinder at a larger tip diameter than the shaft — new "Pinion tip Ø" field (0 = auto 1.35× shaft) — with fine knurl-density axial teeth on the silhouette, lengthwise flank lines, a 12-tick tooth ring on the end face, and a center-drill dot. The 2D outline steps the same way with its shoulder line. Caption calls out both diameters: "pinion shaft Ø0.31″ · pinion Ø0.43″ × 0.39″".
- oshPinD serializes with the design; auto keeps prior files rendering sensibly.

## Gearhead side section (2026-07-19, v47)
- **Face view replaced (user feedback: "gives me nothing"):** the "Output face" radial card is gone; in its place, **Gearhead section — side**: a dedicated axial half-section of the gearhead at true scale. Sectioned housing walls (hatched), per-stage sun/planets/pins/carrier with S1…Sn labels (stage 1 at the motor), ring bands in the wall, the output bearing drawn at size with Ø callouts (race and bore) and pair/stack annotation, mounting tapped holes drawn entering the face they engage (fwd = output face, aft = rear) with thread hatching and a n× thread ⤓ depth callout, and dimension brackets underneath for the bearing block and every stage slot. PNG export (svg-ghsec).
- Same JSX-text escape trap bit the new labels (brg Ø/bore Ø/hole callout) — caught in verification, wrapped in template literals. Edit-script rule reaffirmed: JSX TEXT needs real characters or {`…`}.
- GearFaceView remains in code but unreferenced (candidate for removal next housekeeping pass).

## Composite-outline cutaway (2026-07-19, v46)
- **Cutaway internals in the axial composite view (user request, per cutaway reference):** the gearhead block now shows its insides at true scale from the synthesized geometry — per-stage sun (gold) and top/bottom planet sections with pins, carrier plates (bronze) on each stage's output side, ring bands grounded in the housing wall, stage 1 nearest the motor. The output bearing occupies its real block: races + ball sections top and bottom, one row for radial, two for double/AC pair, diagonal contact lines marking the angular-contact pair. Spur draws offset gear pairs; harmonic keeps the plain block (its cup section is a future pass).
- **Literal-escape bug fixed (user-caught):** "Output face \u2014 radial" and "PNG \u2913" rendered raw — JSX text does not process \u escapes; real characters now. Lesson noted for edit scripts.
- Verified: NaN-free across all train types and bearing variants; sun/carrier counts match stage count; default SSR baseline unchanged (163,378).

## Gear detail pass II (2026-07-18, v45)
- **Pinion rendering fixed (user-caught):** the dense radial ticks read as threads. Now: sawtooth tooth strips along the top/bottom silhouette (teeth run AXIALLY) with faint lengthwise flank lines, in both the iso and 2D outline; the output-face view shows the toothed cross-section radially.
- **Drawing callouts per gear:** stage-1 table rows for Sun (with shift note) / Planet / Ring(internal) — Z, PD, tip Ø, root Ø (internal ring inverted: tip = PD−2m, root = PD+2.5m), module + DP, pressure angle, face, AGMA Q — what a gear drawing needs, ready to transcribe.
- **Length limits torque:** gear face width is now capped by the axial budget — 0.62·(gearhead length − bearing block)/stages — so shrinking the envelope thins the gears and the Lewis cap follows (40 mm 2-stage: 19 mm length is fine, 14 mm halves the cap to 3.3 N·m, warned). Gated monotone.
- **Tooth-yield on the charts:** the composite torque–speed AND current–torque charts draw a red dashed "tooth yield" line at the Lewis cap, axes scaled to show it.
- **Output bearing:** Radial / 2× radial / Angular-contact pair — sets the envelope's bearing-block length (0.22/0.30/0.34·OD, radial = previous default so nothing shifts silently) and draws in the new view.
- **Output-face radial view:** the BLDC-lamination-style companion to the mesh plane — housing wall, tapped pattern on its BC, pilot boss, output bearing (races + ball row, pair/stack annotated), and the shaft cross-section with its drive feature. PNG export.

## Gear geometry corrections + presets (2026-07-17, v44)
- **Drawing bug fixed (user-caught):** the planetary section drew planets at HALF the true carrier radius — center distance was divided twice — so they crashed the sun and floated off the ring. Carrier radius = a = (PDs+PDp)/2 now, gated as a mesh identity along with a + PDp/2 = PDr/2. Carrier spider arms added; caption states the grounded-ring power path ("sun Xt drives → carrier out · ring Yt grounded").
- **Neighbor-interference constraint:** synthesis now rejects tooth sets where adjacent planets collide — (Zs+Zp)·sin(π/nP) must exceed Zp + 2.5. This is a real feasibility wall: 4 planets cap near 6.8:1/stage, 5 planets near 4:1 — two draft presets failed it honestly and were corrected.
- **Gear presets (1–4″), all synthesis-validated:** 1″ 4:1/1st/3P, 1.6″ 25:1/2st/3P, 2.5″ 50:1/2st/3P, 3.2″ 64:1/3st/4P, 4″ 100:1/3st/4P — each hits its ratio within 0.2% with assembly + clearance satisfied.
- **Stage recommendation:** entering a ratio checks the per-stage value against the train's practical window (planetary 3–10:1, spur 1.5–6, harmonic 30–160); in-window shows ✓, out-of-window recommends a count with a one-tap apply. Stage table rows add center distance a and planet-pin circle Ø.

## Gear train deep-dive + output shaft (2026-07-17, v43)
- **`designGearTrain(p, act, gOD)`** synthesizes real gear geometry from gearhead Ø, AGMA quality (Q7–Q13), pressure angle, and planet count. Planetary: searches Zs 14–48 for tooth sets satisfying Zr = Zs + 2·Zp and the (Zs+Zr) % nP assembly constraint, nearest the per-stage ratio (warns >6% off; <17t sun flags profile shift); module snapped to the standard series from ring PD ≈ 0.8·gOD; face 8·m. Spur: 15t pinion pairs in the envelope. Harmonic: catalog-level (flex/circular counts, near-zero backlash, ratchet-limited — stated, not Lewis).
- **Refinement outputs:** output-shaft backlash (per-mesh AGMA allowance reflected through downstream ratios — output stage dominates; Q-monotone gated), forward AND back-driving efficiency (mesh sliding ∝ tooth counts + seal/churning drag; η_b ≈ 2 − 1/η_f per stage, self-locking detected), friction torque through the train at peak output, and a Lewis tooth-yield torque cap (380 MPa case-hardened, limiting stage named, color-coded margin vs peak). Constants land on the established catalog anchors (2-stage planetary ≈ 82% ≈ 0.9²).
- **Gear cross-section view:** stage-1 section to scale — planetary ring/planets/sun with pitch-circle teeth ticks and carrier pins, spur pair, harmonic wave-gen schematic — plus a per-stage mini-table in the SVG and full stage table + refinement rows in the card. PNG export.
- **Output shaft section:** Round / Keyed / D-flat / Pinion with OD, overall length from face, and feature length at tip (0 = auto), drawn in BOTH the 2D outline and the isometric (key rect, D chord, pinion teeth ticks), caption states style + Ø. Defaults preserve the previous keyed look.
- act-gate extended: assembly/ratio constraints, Q-monotone backlash, η_back < η_fwd, Lewis finite + limiting stage; the ActuatorView SSR check caught (and we fixed) a field-name crash during development — the gates doing their job.

## FEA-light (2026-07-17, v41)
- **Finding first:** the proposed Phase-1 magnetic-equivalent-circuit largely EXISTED — `satAux(Fext)` iterates Froelich tooth/stator-yoke/rotor-yoke MMF drops against the magnet load line with Carter's gap (→ ksat), and armature reaction already feeds the same solver at Imax (→ kIT bending the I–T chart). What was missing: exposure and the external-validation bridge.
- **Saturation-vs-current curve:** `satCurve` runs the MEC at 0/0.5/1/1.5·Imax; a "Flux retention vs current (MEC)" row shows the droop (e.g. NEMA17: 100/98.7/97.4/96.1%), endpoint provably equal to kIT.
- **FEMM export:** "Export FEMM" (PM machines) writes a complete Lua model — full lamination with slots closed at the tooth-tip radius (copper / opening-neck / airgap mesh as separate regions), rotor + shaft in group 1 with alternating radially-magnetized poles, materials carrying THIS tool's Froelich BH points (24/steel) and magnet Br/µr so a FEMM solve validates the analytical circuit apples-to-apples, 60°-belt phase circuits at 0 A (balanced, verified), A=0 outer boundary, torque-integral instructions in the header. This is the truth source for calibrating the MEC and the Phase-2 stepping stone.
- Golden-gate extended: satCurve monotonicity + kIT tie, FEMM structural assertions. SSR baseline 163,378.

## Usability & integrity pass (2026-07-17, v40)
- **Autosave + undo:** debounced (1.2 s) snapshots to localStorage (guarded — blocked storage degrades silently); restore banner on load with timestamp, Restore/Dismiss; 25-deep undo stack with an ↩ Undo button in the header. Restores merge type-safely like imports.
- **Import diff preview:** imports no longer merge silently — a confirm panel lists every field the file would change (old → new, first 14 + count), Apply/Cancel, in both the wizard Files tab and the Winding module's Files card. Identical files short-circuit with "nothing would change". All migrations (brake semantics, finish rename) run on Apply as before.
- **Assumptions ledger:** collapsible "Assumptions in effect" card (machine inputs column, Winding sidebar, Actuator sidebar) listing every ACTIVE estimate with its rule — coil-head autos, jumper/flange estimates, wild-wind constants, envelope proportions, per-stage η, iron-loss model, insertion limit, calibration status. Pure function `activeAssumptions(p)`; entered values never appear.
- **Golden gate (`tools/golden-gate.mjs`):** frozen analytical anchors — one preset per machine type (pm ×3 sizes, brushed, ACIM, stepper, brake, LATM) at ±1% on Kt/noLoad/Rll/peakT, plus the winding L-L round-trip invariant. These are baselines against drift, not catalog truth; replace numbers with measured data as available. Intentional model changes must update anchors in the same commit.
- **Unit-aware entry:** audited as missing, found already implemented — `Num` converts display AND entry through the inch context (42 mm field renders/accepts 1.6535″). No change needed; noted for the record.
- New SSR baseline 163,117 (Undo button + ledger cards in the default render).

## Actuator module (new, 2026-07-14)
- **Pilot boss + finishes (2026-07-17):** Mounting card gains "Piloting boss OD/depth (0 = none)" — a small projecting boss around the shaft exit on the forwardmost face (gearhead face, or fwd-flange front), drawn in both views, added to the axial protrusion and stated in the caption ("pilot Ø×depth"); it supersedes the flat decorative pilot rings when present. A "Finish (iso)" group sets per-housing cosmetics — Polished steel, Matte steel, Aluminum, Iridite (chem film — the gold/olive-brass Alodine conversion-coat look), Black anodized — for gearhead (flange/boss follow it), motor, and brake independently; each finish carries its own palette and specular strength. Defaults: gearhead Matte steel, motor Aluminum, brake Black anodized (the old green brake is gone). Purely cosmetic on the iso; no physics implied.
- **Flange direction (2026-07-16):** Toward output (projection ahead of the face, as before) or Away — the flange sets back by a "spacing from output face" with its own thickness, and the gearhead OD ahead of it becomes the mounting boss registering in the mating bore. The iso splits the gearhead into rear body / flange / boss segments for correct occlusion (bolt pattern on the flange's forward annulus, BCD auto-centered between boss and flange Ø and clamped clear of both), the 2D outline places the flange rect at the setback, and only a forward flange adds axial length. Caption states the full geometry ("flange Ø×t at gap aft of face (boss Ø)").
- **Mounting widget (2026-07-16):** Face mount vs Flange toggle in the Composition card. Face mount (default) puts the tapped pattern directly on the gearhead's forward face — nothing pokes past the OD. Standard threads (2-56…1/4-20, M2…M5, drawn at major Ø), hole count evenly spaced, bolt-circle Ø (0 = auto: 0.72·face / 0.8·flange, clamped inside the face). Flange adds Ø (0 = auto 1.15·gearhead) and projection from the output face; the 2D outline draws it too and the caption states the full pattern (e.g. "6× 8-32 on Ø1.65″ BC"). Pure drawing config — no envelope physics claimed.
- **Isometric detail pass (2026-07-16):** upgraded toward the 2D's fidelity — radial-gradient machined faces with chamfer highlight rings, specular strip along each body, output mounting flange with bolt circle (6 bolts >30 mm, else 4) and pilot boss, keyed output shaft, endbell parting lines on the motor, groove-style stage dividers, brake rear-cover parting line with red/blue lead wires exiting the top, and a soft ground shadow. Same shared envelope; no-brake and single-stage variants degrade cleanly (verified).
- **Isometric view (2026-07-16):** oblique-projection render below the 2D outline — shaded cylinders (vertical gradients for roundness, near-face ellipses toward the output, far rims peeking past) for gearhead > motor > brake plus the output stub, stage-divider rings on the gearhead, per-component Ø × L leaders and the overall dim. Envelope math extracted into a shared `actEnvelope()` used by BOTH views, so the 2D and iso can never disagree; specified gearhead OD/length flow through identically. PNG export.
- Composes the live motor design (BLDC or Brushed tab) and optionally the Brake-tab design through a
  multi-stage gearhead (corrected 2026-07-15 against Maxon/Faulhaber-class catalog data: planetary 90%/stage — GP32-class runs 80–90% single, ~70% three-stage; spur 93%/stage — a 141:1 multi-stage head lands ~66% overall; harmonic 80% at rated & warm, catalog band 60–90%; η = η_stage^stages,
  even ratio split with per-train practical windows: planetary 3–10, spur 1.5–6, harmonic 30–160 per stage).
- Output-shaft composite: torque–speed and motor-current-vs-output-torque charts (motor curve mapped ÷N, ×N·η
  with the motor's saturation bend preserved on the current axis), rated/peak/continuous rows, static holding
  = brake × ratio (no η — friction aids holding), back-drive η ≈ 2 − 1/η with self-locking detection,
  reflected inertia ÷ N². Pure `composeActuator(mr, br, cfg)` in the engine; `act-gate` covers the math and
  SSRs the view. The old per-motor Gearbox card was removed — this module replaces it.
- Gearhead OD & length accept specified values (0 = representative shell). Stepper drives supported via the new pull-out curve. Follow-ons: gearhead torque rating & inertia; brake on the
  output side option; combined power budget (motor + brake coil) row.

## Winding module (new, 2026-07-15)
- **Armature lamination preview, brushed (2026-07-16):** the brushed module gets the same verification style with the geometry properly inverted — slots on the OUTSIDE diameter: teeth radiate outward, openings at the armature surface, core (yoke) between the slot bottoms and the shaft, shaft hole at center. The slot zoom draws airgap-UP with the trapezoid narrowing inward (wₒ under the tips > wᵢ at the slot bottom) and both internal corner-radius pairs called out; the machine card's mouth-radius input covers brushed too. Numerically verified inverted (outermost slot vertex at the armature surface, innermost clear of the shaft) and gated in brushed-gate.
- **Preview adopted app-wide (2026-07-16):** the lamination verification view proved better than the machine modules' presentation, so (a) the winding module now shows it in BOTH driving modes (forward benefits from the same error checking), and (b) BLDC and ACIM gained the identical card — true polar lamination + dimensioned slot zoom with corner radii — placed above their slot/insertion map, which stays for winding placement. The machine lamination card exposes both corner radii (bottom pair `slotR` as before, mouth pair `wbRtip` added), shared with the winding module so the same design file drives both.
- **Inserted-coil view (2026-07-16):** plan view of one coil as inserted — straight legs running the stack (shaded band), head loops beyond each end sized from the scheme (tooth: around one tooth; lap: diamond over the throw arc at the mean slot Ø), dimensioned stack / head-per-end / span / overall. With a head override entered, a dashed ghost shows the scheme's auto estimate for comparison. This is the visual counterpart of the perimeter that sizes the inverse arbor.
- **Stack + coil heads (2026-07-16):** the missing perimeter physics. Stator card gains stack length and a coil-head-per-end field (0 = auto from the scheme: tooth-wound ≈ toothW + 0.8·mean slot width + bends; lap ≈ 1.25 × throw arc at the mean slot Ø). The inserted coil's perimeter = 2·stack + 2·heads now drives the inverse arbor Ø as the primary basis — solved Da = max(geometry, insertion floor), with an R target checked against BOTH floors (a coil that hits the ohms but can't reach around the stack is flagged). Forward mode verifies the wound MLT against the stator: "stack fit" row shows straight length per side vs the stack with short/✓/loose status, and warnings name the corrective arbor Ø both ways. Gated: geometry-vs-insertion max rule, stack-fit warning, and the L-L round trip still exact.
- **Wild-wind lay model (2026-07-16):** shop practice is scramble ("wild") winding for later insertion, so it's now the default lay model. The first layer lays clean on the arbor; after it, crossovers kill the row nesting — rows stack at ~1.0·wire Ø (vs 0.866 nested) with an 8% random bump — and channel capacity derates ×0.8. Coil OD, mean turn, resistance, and wire mass all carry the penalty (typ. ~1–2% R, ~0.8 mm build on a 5-layer AWG-20 coil), and a "Wild-wind cost vs precise lay" row quantifies it against the same tool. solveBobbin mirrors the lay model, so inverse L-L round trips stay exact under wild. Single-layer coils show no penalty (first layer is clean either way). Precise-lay toggle remains for orthocyclic tooling.
- **Wire mass rows (2026-07-16):** the compilation table adds "Magnet wire per phase (incl. jumpers)" and "per motor (3 phases)" — engine `mPhase` from the full string length (coils + jumpers + lead tails), displayed as lb in inch mode and kg in metric, hand-verified against ρ·L·A.
- **Slot corner radii + preview scoping (2026-07-16):** the stator-drawing card gains the four internal slot corner radii as two inputs — bottom pair (`slotR`, shared with the machine modules) and mouth pair (`wbRtip`). The slot-detail zoom draws true rounded corners with R callouts, and the slot-area verification deducts the fillet corners exactly (2·(rB² + rT²)·(1 − π/4), unit-verified). The lamination preview card now renders only in the inverse (coil-spec → tool) mode, where the lamination is the thing being verified.
- **Inverse refinements (2026-07-16):** the resistance target is entered as the **L-L (phase-to-phase)** value — converted through connection (wye ÷2, delta ×1.5) and the series string, with the estimated jumper copper deducted before the per-coil budget. Flange thickness and inter-coil jumper are no longer inputs in inverse mode — estimated from the lamination and winding scheme (style tooth/lap, coil throw, coils per phase; same-phase coils land every Ns/coils slots, jumper spans that arc at the mean slot Ø +25% slack; flange t from channel-width stiffness, flange Ø reported). A **lamination preview** card (full polar 2D lamination + dimensioned single-slot zoom, PNG export) renders from the stator-drawing fields so a wrong entry is visible immediately. Gate: wye L-L round trip 2.000 Ω asked → 2.000 Ω verified.
- **Driving modes (2026-07-15):** a sub-toggle splits the module — *Tool known → coil data* (forward: arbor/channel dims in, resistance/wire weight/lengths/fit out) and *Coil spec → tool dims* (inverse: turns/wire/strands plus an optional target per-coil resistance in; `solveBobbin` returns the required arbor Ø — from the target-R mean turn, or the insertion rule when no target — plus square-bundle channel W × flange H, then the forward calculator verifies and the arbor draws the solved tool). Round-trip gate: solve at 1.000 Ω target → verify computes 1.000 Ω; conflict between resistance-required and insertion-required arbor Ø is flagged with remedies.
- Winding-arbor tooling mode: arbor Ø sets the coil ID, channel width/flange height set the lay
  (turns/layer, layers, nested build with crossover worst case, channel capacity), sequential multi-coil
  stick with jumper allowance → wire per coil & per string, R cold/hot, copper mass, tool length/flange OD.
  Verification is drawing-limited by design: slot fill (1 or 2 sides, lined), slot-opening feed check for the
  strand bundle (dEff = dIns·√strands, disclosed) — no rotor, no performance claims. Arbor side-view drawing
  with PNG export mirrors the physical multi-channel tool. `computeBobbin` is pure; `bob-gate` covers the
  math (18 checks) and SSRs the view. Follow-ons: alternating wind-direction callout per channel on the
  drawing; export a coil card (shop traveler) with the string schedule.

## 05-app.jsx — app shell & wizard
- **Envelope architecture lock (2026-07-14):** the wizard's architecture now follows the globally selected machine type (no cross-module plug/play); the Pick was replaced with a read-only line. `synthEnvelope` keeps its arch parameter for gate-testability.
- Envelope wizard: **DONE [#5].** One-level restore (toggling snapshot) after Generate or an alternate apply; top-5 alternates surfaced for BLDC, brushed, LATM, and brake (deduped by construction key, each showing its headline numbers, applied with its own snapshot). Stepper/ACIM are single-construction synths — no alternates by design. *Follow-on:* multi-slot design compare (A/B diff view of two snapshots); persist the alternate list into the design file so a saved trade study survives reload.
- Consolidated warnings strip with jump-to-card links. — future
- Printable one-page design summary (params + curves + warnings) for design reviews. — future
- **Compensated-curve overlay (2026-07-16):** with calibration Active, the torque–speed and current–torque charts draw BOTH worlds — solid "compensated" (captured factors + fitted drag) over a dashed "analytical" ghost of the uncompensated model, with an in-chart legend and axes scaled to cover whichever is larger. Tweaking turns/wire/geometry moves both curves; the gap between them is the frozen bench correction, so the real motor's predicted response reads directly. Charts without a ghost (actuator, stepper, uncalibrated) render exactly as before.
- **Raw BEMF entry (2026-07-15):** the pre-converted V/krpm Ke field is replaced with what the bench instruments actually read — BLDC: back-driven pk-pk, RMS, and electrical frequency (speed derives from pole count; RMS falls back to pk-pk/2√2 sine estimate); brushed: DC volts at rig speed. The card derives Ke and implied Kt live, and when both amplitudes are entered the crest ratio (pk-pk/RMS, sine 2.83) flags the waveform shape. Compare rows consume the derived value; legacy mKe files still work.
- **Active bench calibration (2026-07-14):** pm & brushed. Measured R/L/no-load plus rated point (T @ n) and stall torque; "Capture factors" freezes measured-vs-model multipliers against the as-built geometry (kR, kL, kKe from no-load, kKt from stall — their ratio is the real saturation droop — and a fitted drag torque from the rated point). With the toggle Active, the engine applies them multiplicatively through R, L, BEMF, torque production, and subtracts the drag from the delivered curve — so ±turn tweaks predict the real motor's response (verified: −1 turn gives an identical relative shift on calibrated vs raw models). Factors serialize with the design; re-capture after a physical change. Follow-on: thermal-resistance and iron-loss capture from a coast-down.
- Per-quantity confidence tags (R ±5%, L ±25%, cogging shape-only) to formalize the honest-disclosure principle. — future

## QA sweep (2026-07-15)
- Automated audit added to the workflow: state-key usage scan, duplicate-binding scan, all-presets × all-views
  SSR render checked for NaN/undefined/negative dims, and a 400-case parameter fuzz (computeDesign must return
  err[], never throw — passes 400/400).
- Removed dead parameters: `brkPole`, `brkRf` (never read), `sb`, `slip` (ACIM leftovers from before the
  equivalent circuit computed slip itself). Old design files remain loadable — unknown keys are ignored.
- Fixed: SlotDetail rendered NaN coordinates when magT was absent, and subtracted a magnet band from the
  induction rotor sketch — now PM-only.
- Gated dumb fields: "Rated loading by" + Irate/J hidden for brake/LATM/stepper (they don't consume Iph);
  "Airgap flux B̂g" is induction-only.
- Inverse fix: steppers USE magnet grade & thickness in the engine but had no UI — the magnet card now renders
  for steppers (grade, thickness, temperatures; arc coverage stays PM/LATM-only, flux/demag rows hidden where
  the stepper branch doesn't compute them).

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
