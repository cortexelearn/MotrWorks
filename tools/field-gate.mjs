// FIELD-SOLVER GATE — the 2-D magnetostatic solve must obey physics the analytic
// core cannot hand it: flux conservation, correct pole structure, plausible agreement
// with the magnetic-circuit model, and zero net torque at no-load on a balanced machine.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, fieldStudy, fieldStudyLoaded, fieldStudyBrake, fieldMesh, fieldMeshBrushed, fieldMeshSlotless, magPattern, solveField, gapQuantities, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
let fail = false;
const ok = (c, what, detail) => { console.log(`  ${c ? '✓' : '✗'} ${what}${detail ? ': ' + detail : ''}`); if (!c) fail = true; };

const CASES = ['NEMA 17 · 28 V · ~6 krpm', '4" direct-drive · 270 V · ~2.5 krpm', '1.6" · 9s8p · 28 V'];
for (const name of CASES) {
  if (!M.PRESETS[name]) { console.log(`(skip missing preset ${name})`); continue; }
  console.log(name);
  const p = { ...base, slotR: 0, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const t0 = Date.now();
  const F = M.fieldStudy(p, r, { nr: 44, nth: 240, quick: true });
  const ms = Date.now() - t0;
  ok(!F.err, 'solve ran', F.err || `${ms} ms, ${F.sweeps} sweeps, converged=${F.conv}`);
  if (F.err) continue;

  // 1. No NaN anywhere — a diverged or mis-indexed solve shows up here first.
  ok(F.A.every((v) => Number.isFinite(v)), 'vector potential is finite everywhere');
  ok(F.gap.Br.every((v) => Number.isFinite(v)), 'gap field is finite');

  // 2. Flux conservation: the net radial flux through any closed circle is zero.
  //    (∮B_r r dθ = 0 — the field has no monopole.)
  const netFlux = F.gap.Br.reduce((a, v) => a + v, 0) * F.msh.dth * F.gap.rGap;
  const absFlux = F.gap.Br.reduce((a, v) => a + Math.abs(v), 0) * F.msh.dth * F.gap.rGap;
  ok(Math.abs(netFlux) < 0.02 * absFlux, 'net radial flux ~ 0 (no monopole)',
    `${netFlux.toExponential(2)} vs ${absFlux.toExponential(2)} abs`);

  // 3. Pole structure: the DOMINANT spatial harmonic of the gap field must be the
  //    pole-pair number. (Counting sign changes is unreliable near a zero crossing;
  //    the Fourier order is the real statement of "this machine has p poles".)
  ok(F.domN === F.msh.poles / 2, `dominant gap harmonic is pole-pair order ${F.msh.poles / 2}`, `found ${F.domN}`);

  // 4. Magnitude sanity vs the magnetic-circuit model: a first-order circuit and a
  //    field solve should land in the same neighbourhood, not the same digit.
  ok(F.gap.Bpk > 0.25 && F.gap.Bpk < 1.6, 'peak gap flux density physical', `${F.gap.Bpk.toFixed(3)} T`);
  ok(Math.abs(F.cmp.dB1) < 0.45, 'fundamental within 45% of the analytic circuit',
    `field ${F.B1.toFixed(3)} T vs analytic ${r.B1.toFixed(3)} T (${(F.cmp.dB1 * 100).toFixed(1)}%)`);

  // 5. No-load average torque must vanish (a PM machine makes no torque unexcited).
  //    Cogging is a ripple about zero, so the mean over a cogging period is ~0; at a
  //    single position the instantaneous value is cogging alone — bound it by a small
  //    fraction of the machine's rated torque.
  const Trated = Math.max(r.op ? r.op.T : r.peakT, 1e-6);
  ok(Math.abs(F.gap.T) < 0.25 * Trated, 'no-load torque is cogging-scale, not motoring-scale',
    `${F.gap.T.toExponential(2)} N·m vs rated ${Trated.toFixed(3)}`);

  // 6. Iron must actually saturate the solve: some stator cells should carry more
  //    flux than the gap (flux focusing into teeth), else the mesh isn't resolving iron.
  ok(Math.max(...F.B) > F.gap.Bpk, 'flux concentrates in iron above gap level',
    `max |B| ${Math.max(...F.B).toFixed(2)} T`);
}

// 7. Physical response: thicker magnets must raise the gap field, a wider airgap must
//    lower it. A solver that ignores its sources passes everything above but not this.
//    Tested on a variant with a REAL airgap: the stock NEMA 17 runs a 0.05 mm gap, where
//    Bg is already ~98% of the magnet-circuit ceiling and no magnet thickness can move it.
console.log('Parametric response');
{
  // Magnet thickness is swept in the THIN regime (1 -> 2 mm). Past ~2.5 mm on this
  // rotor the solved gap field rolls OVER (0.988 -> 0.982 T at 3 -> 5 mm) because a
  // thicker magnet on a fixed rotor OD starves the back iron — a real effect the
  // first-order circuit misses entirely (it keeps climbing, 0.928 -> 0.961). That
  // divergence is a finding, not a bug, so the monotonic assertion lives where the
  // two models agree.
  const pThin = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'], magT: 1 };
  const F0 = M.fieldStudy(pThin, M.computeDesign(pThin), { nr: 44, nth: 240, quick: true });
  ok(!F0.err, 'thin-magnet baseline solves', F0.err || `Bpk ${F0.gap.Bpk.toFixed(3)} T`);
  const pThick = { ...pThin, magT: 2 };
  const Ft = M.fieldStudy(pThick, M.computeDesign(pThick), { nr: 44, nth: 240, quick: true });
  ok(Ft.gap.Bpk > F0.gap.Bpk * 1.02, 'thicker magnet raises gap B (thin regime)',
    `${F0.gap.Bpk.toFixed(3)} -> ${Ft.gap.Bpk.toFixed(3)} T`);

  const p0 = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r0 = M.computeDesign(p0);
  const Fb = M.fieldStudy(p0, r0, { nr: 44, nth: 240, quick: true });
  const pGap = { ...p0, rotorOD: p0.rotorOD - 1.0 };            // 0.5 mm more airgap per side
  const Fg = M.fieldStudy(pGap, M.computeDesign(pGap), { nr: 44, nth: 240, quick: true });
  ok(Fg.gap.Bpk < Fb.gap.Bpk * 0.97, 'wider airgap lowers gap B',
    `${Fb.gap.Bpk.toFixed(3)} -> ${Fg.gap.Bpk.toFixed(3)} T`);
  const pAir = { ...p0, statorMat: 'Non-magnetic' };
  const Fa = M.fieldStudy(pAir, M.computeDesign(pAir), { nr: 44, nth: 240, quick: true });
  ok(Fa.gap.Bpk < Fb.gap.Bpk * 0.9, 'non-magnetic stator collapses gap B',
    `${Fb.gap.Bpk.toFixed(3)} -> ${Fa.gap.Bpk.toFixed(3)} T`);
  const pWeak = { ...p0, mag: 'Ferrite C8' };
  const Fw = M.fieldStudy(pWeak, M.computeDesign(pWeak), { nr: 44, nth: 240, quick: true });
  ok(Fw.gap.Bpk < Fb.gap.Bpk * 0.7, 'ferrite gives a much weaker gap than NdFeB',
    `${Fb.gap.Bpk.toFixed(3)} -> ${Fw.gap.Bpk.toFixed(3)} T`);
  // and the saturation rollover itself, asserted so a future "fix" cannot silently
  // restore the monotonic-forever behaviour the circuit model has
  const pFat = { ...p0, magT: 5 };
  const Ff = M.fieldStudy(pFat, M.computeDesign(pFat), { nr: 44, nth: 240, quick: true });
  const rFat = M.computeDesign(pFat);
  ok(Ff.gap.Bpk < Fb.gap.Bpk * 1.02 && rFat.BgAvg > r0.BgAvg * 1.02,
    'field shows back-iron saturation rollover where the circuit does not',
    `field ${Fb.gap.Bpk.toFixed(3)} -> ${Ff.gap.Bpk.toFixed(3)} T vs circuit ${r0.BgAvg.toFixed(3)} -> ${rFat.BgAvg.toFixed(3)} T`);
}
// 8. MESH CONVERGENCE — the assertion that makes any of the above worth quoting. A
//    reported quantity must be mesh-independent; this is exactly the test that got
//    Maxwell-stress cogging REMOVED from the solver (it diverged 4e-2 -> 3.9e-1 N·m
//    over this same refinement while the field converged). See fieldStudy's comment.
console.log('Mesh convergence');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M.computeDesign(p);
  const coarse = M.fieldStudy(p, r, { nr: 44, nth: 240 });
  const fine = M.fieldStudy(p, r, { nr: 76, nth: 432 });
  const dB = Math.abs(fine.gap.Bpk - coarse.gap.Bpk) / coarse.gap.Bpk;
  const d1 = Math.abs(fine.B1 - coarse.B1) / coarse.B1;
  ok(dB < 0.05, 'peak gap B is mesh-independent to 5%',
    `${coarse.gap.Bpk.toFixed(4)} -> ${fine.gap.Bpk.toFixed(4)} T (${(dB * 100).toFixed(2)}%)`);
  ok(d1 < 0.05, 'gap fundamental is mesh-independent to 5%',
    `${coarse.B1.toFixed(4)} -> ${fine.B1.toFixed(4)} T (${(d1 * 100).toFixed(2)}%)`);
  const dF = Math.abs(fine.fluxPole - coarse.fluxPole) / coarse.fluxPole;
  ok(dF < 0.05, 'flux per pole is mesh-independent to 5%',
    `${coarse.fluxPole.toExponential(4)} -> ${fine.fluxPole.toExponential(4)} Wb (${(dF * 100).toFixed(2)}%)`);
  ok(fine.cog === undefined, 'cogging is NOT reported (failed its own convergence study)');
  // the SELF-check must exist and agree with the two-mesh comparison above: a gate can
  // only prove convergence for the presets it tests, so every solve carries its own proof
  const v = M.fieldStudy(p, r, { nr: 52, nth: 288, verify: true });
  ok(v.mesh && Number.isFinite(v.mesh.dB1), 'solve carries a per-design mesh check',
    v.mesh ? `dB1 ${(v.mesh.dB1 * 100).toFixed(2)}% dBpk ${(v.mesh.dBpk * 100).toFixed(2)}%` : 'missing');
  ok(v.mesh.ok, 'this design self-reports as mesh-converged');
}
// 9. Error paths: never throw, always explain. v61.4: brushed/LATM/PM-stepper now SOLVE
//    (each on its own mesh — sections below); what must still refuse is anything whose
//    flux path a 2-D r-θ section cannot represent.
console.log('Error handling');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['ACIM 115 V · 400 Hz · 4-pole aero'] };
  ok(!!M.fieldStudy(p, M.computeDesign(p), {}).err, 'ACIM (no PM source at no-load) returns err');
  // the HYBRID stepper's flux path is 3-D (axial PM disc between offset toothed cups) —
  // any 2-D section is a different machine, so it must refuse, PM-kind must solve.
  const ph = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 1.8° hybrid · bipolar'] };
  const fh = M.fieldStudy(ph, M.computeDesign(ph), {});
  ok(!!fh.err && /3-D|hybrid/i.test(fh.err), 'hybrid stepper is refused (3-D flux path), not mis-meshed', fh.err || 'NO ERROR - solving wrong geometry');
  // the brake is axisymmetric — the polar entry must point at the r-z solve, not mesh it
  const pk = { ...base, slotR: 0, ...M.PRESETS['Brake 28 V · 38 mm · aero holding'] };
  const fk = M.fieldStudy(pk, M.computeDesign(pk), {});
  ok(!!fk.err && /axisymmetric/i.test(fk.err), 'brake polar entry refuses and points at the r-z solve', fk.err || 'NO ERROR');
  const pBad = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'], rotorOD: NaN };
  ok(!!M.fieldStudy(pBad, M.computeDesign(pBad), {}).err, 'errored design returns err');
}

// 12. v61.4 BRUSHED on the inverted mesh (magnets on the housing ID, armature slots
//     opening outward). The refusal this replaces existed because the PM map solved a
//     different machine (2-pole presets 33-40% off); the inverted mesh plus the
//     coarse-in-θ cascade (2-pole modes stall plain line relaxation) brings every
//     brushed preset to a stable solve. The circuit keeps a FIXED 0.9 leakage factor
//     and lumps the housing wall, so field-vs-circuit lands near the PM band edge —
//     the comparison is a disclosure, not a calibration.
console.log('Brushed (inverted mesh)');
for (const name of ['Brushed 12 V · 2-pole ferrite · ~7 krpm', 'Brushed 24 V · 4-pole NdFeB · ~4.5 krpm']) {
  console.log(name);
  const p = { ...base, slotR: 0, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const F = M.fieldStudy(p, r, { nr: 44, nth: 240, quick: true });
  ok(!F.err, 'solve ran', F.err || `${F.sweeps} sweeps`);
  if (F.err) continue;
  ok(F.A.every((v) => Number.isFinite(v)) && F.gap.Br.every((v) => Number.isFinite(v)), 'solution finite everywhere');
  const netFlux = F.gap.Br.reduce((a, v) => a + v, 0), absFlux = F.gap.Br.reduce((a, v) => a + Math.abs(v), 0);
  ok(Math.abs(netFlux) < 0.02 * absFlux, 'net radial flux ~ 0 (no monopole)');
  ok(F.domN === F.msh.poles / 2, `dominant gap harmonic is pole-pair order ${F.msh.poles / 2}`, `found ${F.domN}`);
  ok(Math.abs(F.cmp.dB1) < 0.45, 'fundamental within 45% of the brushed circuit',
    `field ${F.B1.toFixed(3)} T vs analytic ${r.B1.toFixed(3)} T (${(F.cmp.dB1 * 100).toFixed(1)}%)`);
  // scale on PEAK torque, not the thermal rating: op.T on these small brushed motors is
  // a J-limited rating far below stall, while a 5-slot / 85%-arc machine has REAL
  // cogging in the 10-25%-of-stall class (plus the stress-integration noise that keeps
  // cogging unpublished). Motoring-scale torque at no-load would still trip this.
  ok(Math.abs(F.gap.T) < 0.35 * Math.max(r.peakT, 1e-6), 'no-load torque is cogging-scale, not motoring-scale',
    `${F.gap.T.toExponential(2)} N·m vs peak ${r.peakT.toFixed(3)}`);
  const v = M.fieldStudy(p, r, { nr: 52, nth: 288, verify: true });
  ok(v.mesh && v.mesh.ok, 'mesh self-check converges',
    v.mesh ? `dB1 ${(v.mesh.dB1 * 100).toFixed(2)}% dBpk ${(v.mesh.dBpk * 100).toFixed(2)}%` : 'missing');
}
{
  // parametric response on the inverted geometry: the sources must matter
  const p0 = { ...base, slotR: 0, ...M.PRESETS['Brushed 24 V · 4-pole NdFeB · ~4.5 krpm'] };
  const F0 = M.fieldStudy(p0, M.computeDesign(p0), { nr: 44, nth: 240, quick: true });
  const pG = { ...p0, rotorOD: p0.rotorOD - 0.8 };            // 0.4 mm more airgap per side
  const Fg = M.fieldStudy(pG, M.computeDesign(pG), { nr: 44, nth: 240, quick: true });
  ok(Fg.gap.Bpk < F0.gap.Bpk * 0.97, 'wider airgap lowers gap B', `${F0.gap.Bpk.toFixed(3)} -> ${Fg.gap.Bpk.toFixed(3)} T`);
  const pA = { ...p0, statorMat: 'Non-magnetic' };            // statorMat = the ARMATURE lamination on brushed
  const Fa = M.fieldStudy(pA, M.computeDesign(pA), { nr: 44, nth: 240, quick: true });
  ok(Fa.gap.Bpk < F0.gap.Bpk * 0.9, 'non-magnetic armature collapses gap B', `${F0.gap.Bpk.toFixed(3)} -> ${Fa.gap.Bpk.toFixed(3)} T`);
}

// 13. v61.4 LATM on the slotless mesh. The circuit's Bg is a 1-D plateau with no
//     fringing and no finite core-μ, so it is an UPPER bound on the solved in-arc mean
//     — the direction is asserted, and the magnitude band is measured across presets
//     (−4% on the small-gap 2.5" up to −18% where the gap+winding band is large).
console.log('LATM (slotless mesh)');
for (const name of ['LATM 1.5" · 28 V · SmCo 4-pole · 45° toggle', 'LATM 1" · 28 V · SmCo 2-pole · 90° toggle']) {
  console.log(name);
  const p = { ...base, slotR: 0, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const F = M.fieldStudy(p, r, { nr: 44, nth: 240, quick: true });
  ok(!F.err, 'solve ran', F.err || `${F.sweeps} sweeps`);
  if (F.err) continue;
  ok(F.A.every((v) => Number.isFinite(v)), 'solution finite everywhere');
  const netFlux = F.gap.Br.reduce((a, v) => a + v, 0), absFlux = F.gap.Br.reduce((a, v) => a + Math.abs(v), 0);
  ok(Math.abs(netFlux) < 0.02 * absFlux, 'net radial flux ~ 0 (no monopole)');
  ok(F.domN === F.msh.poles / 2, `dominant gap harmonic is pole-pair order ${F.msh.poles / 2}`, `found ${F.domN}`);
  ok(F.cmp.dBg < 0.05 && F.cmp.dBg > -0.35, 'in-arc mean below the no-fringing circuit plateau, within band',
    `field ${F.BgBar.toFixed(3)} T vs latm.Bg ${r.latm.Bg.toFixed(3)} T (${(F.cmp.dBg * 100).toFixed(1)}%)`);
  ok(Math.abs(F.gap.T) < 0.25 * Math.max(r.peakT, 1e-6), 'unexcited torque ~ 0 (slotless: no cogging either)',
    `${F.gap.T.toExponential(2)} N·m vs peak ${r.peakT.toFixed(3)}`);
  const v = M.fieldStudy(p, r, { nr: 52, nth: 288, verify: true });
  ok(v.mesh && v.mesh.ok, 'mesh self-check converges',
    v.mesh ? `dB1 ${(v.mesh.dB1 * 100).toFixed(2)}% dBpk ${(v.mesh.dBpk * 100).toFixed(2)}%` : 'missing');
}

// 14. v61.4 PM stepper on the salient-pole mesh, poles from stpPP (the shared poles
//     input is hidden for steppers and stale). Hybrid refusal is asserted in §9.
console.log('PM stepper');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['PM stepper 15° · 12 V · 12-pole'] };
  const r = M.computeDesign(p);
  const F = M.fieldStudy(p, r, { nr: 44, nth: 240, quick: true });
  ok(!F.err, 'solve ran', F.err || `${F.sweeps} sweeps`);
  if (!F.err) {
    ok(F.msh.poles === 2 * Math.round(p.stpPP), 'mesh poles come from stpPP, not the hidden poles field',
      `${F.msh.poles} vs stpPP ${p.stpPP}`);
    ok(F.domN === F.msh.poles / 2, `dominant gap harmonic is pole-pair order ${F.msh.poles / 2}`, `found ${F.domN}`);
    ok(F.cmp.dBg < 0.10 && F.cmp.dBg > -0.35, 'in-arc mean tracks the circuit bias BtBias within band',
      `field ${F.BgBar.toFixed(3)} T vs BtBias ${r.step.BtBias.toFixed(3)} T (${(F.cmp.dBg * 100).toFixed(1)}%)`);
    const v = M.fieldStudy(p, r, { nr: 52, nth: 288, verify: true });
    ok(v.mesh && v.mesh.ok, 'mesh self-check converges',
      v.mesh ? `dB1 ${(v.mesh.dB1 * 100).toFixed(2)}%` : 'missing');
  }
}

// 15. v61.4 BRAKE, axisymmetric r-z (fieldStudyBrake). ψ = r·Aθ makes the pole-face
//     fluxes exact bookkeeping (Φ = 2πψ); the pull force is Maxwell stress on a closed
//     box averaged over every interior gap plane, VERIFIED here against a virtual-work
//     identity on a linear-iron pair of solves (F = −dW'/dg with W' = ½LI²) — an
//     independent force method, so an integration bug cannot hide. The circuit
//     comparison band is wide and one-sided by physics: the reluctance chain cannot
//     see coil-window leakage or pole-edge fringing, so it reads HIGH — measured
//     +15…+43% on force across the five shipped presets.
console.log('Brake (axisymmetric r-z)');
for (const name of ['Brake 28 V · 38 mm · aero holding', 'Brake 24 V · 60 mm · spring-applied']) {
  console.log(name);
  const p = { ...base, slotR: 0, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const t0 = Date.now();
  const F = M.fieldStudyBrake(p, r, { verify: true });
  ok(!F.err, 'solve ran', F.err || `${Date.now() - t0} ms, ${F.nr}x${F.nz}`);
  if (F.err) continue;
  ok(F.psi.every((v) => Number.isFinite(v)) && F.B.every((v) => Number.isFinite(v)), 'solution finite everywhere');
  ok(F.leak >= 0 && F.leak < 0.20, 'boss and rim fluxes agree to the reported leakage, leakage plausible',
    `${(F.leak * 100).toFixed(1)}% of pole flux bypasses the gap through the coil window`);
  // F is published as max(−Fz, 0): a repulsive or null solve reads exactly 0 here
  ok(F.F > 0, 'pull is attractive (armature toward the backiron)', `${F.F.toFixed(1)} N`);
  ok(F.Fseat > F.F, 'seated pull exceeds working-gap pull (smaller gap, more force)',
    `${F.F.toFixed(1)} -> ${F.Fseat.toFixed(1)} N`);
  ok(F.cmp.dF > -0.45 && F.cmp.dF < 0.10, 'working-gap pull within band of the circuit (circuit reads high by physics)',
    `field ${F.F.toFixed(1)} N vs circuit ${r.brake.Fpull.toFixed(1)} N (${(F.cmp.dF * 100).toFixed(1)}%)`);
  ok(F.cmp.dFseat > -0.60 && F.cmp.dFseat < 0.10, 'seated pull within band of the circuit',
    `field ${F.Fseat.toFixed(1)} N vs circuit ${r.brake.Fseat.toFixed(1)} N (${(F.cmp.dFseat * 100).toFixed(1)}%)`);
  ok(F.Bin < r.brake.Bin * 1.05, 'boss-face flux density does not exceed the no-leakage circuit',
    `${F.Bin.toFixed(3)} vs ${r.brake.Bin.toFixed(3)} T`);
  ok(F.mesh && F.mesh.ok, 'mesh self-check converges (pull and boss flux)',
    F.mesh ? `dF ${(F.mesh.dF * 100).toFixed(2)}% dBin ${(F.mesh.dBin * 100).toFixed(2)}%` : 'missing');
  // virtual-work identity on LINEAR iron: two solves at nearby gaps, F = −dW'/dg
  const g1 = Math.max(p.brkStroke, 0.05), g2 = g1 * 1.3;
  const L1 = M.fieldStudyBrake(p, r, { lin: true, gapOv: g1, sweeps: 300 });
  const L2 = M.fieldStudyBrake(p, r, { lin: true, gapOv: g2, sweeps: 300 });
  const Fvw = (L1.Wco - L2.Wco) / ((g2 - g1) / 1000);
  const Fmx = (L1.F + L2.F) / 2;
  ok(Fvw > 0 && Math.abs(Fmx / Fvw - 1) < 0.10, 'Maxwell force matches the virtual-work identity (linear iron)',
    `stress ${Fmx.toFixed(1)} N vs -dW'/dg ${Fvw.toFixed(1)} N (${((Fmx / Fvw - 1) * 100).toFixed(1)}%)`);
}
{
  // parametric response: the r-z solve must react to its own knobs
  const p0 = { ...base, slotR: 0, ...M.PRESETS['Brake 28 V · 38 mm · aero holding'] };
  const r0 = M.computeDesign(p0);
  const F0 = M.fieldStudyBrake(p0, r0, { quick: true });
  const Fg = M.fieldStudyBrake(p0, r0, { quick: true, gapOv: Math.max(p0.brkStroke, 0.05) * 2 });
  ok(Fg.F < F0.F * 0.85, 'doubling the working gap cuts the pull', `${F0.F.toFixed(1)} -> ${Fg.F.toFixed(1)} N`);
  const pD = { ...p0, brkFeScale: 30 };
  const Fd = M.fieldStudyBrake(pD, M.computeDesign(pD), { quick: true });
  ok(Fd.F < F0.F * 0.9, 'back-iron magnetic derate (brkFeScale 30%) cuts the pull in the field too',
    `${F0.F.toFixed(1)} -> ${Fd.F.toFixed(1)} N`);
  const pN = { ...p0, statorMat: 'Non-magnetic' };
  const Fn = M.fieldStudyBrake(pN, M.computeDesign(pN), { quick: true });
  ok(Fn.F < F0.F * 0.25, 'non-magnetic backiron collapses the pull', `${F0.F.toFixed(1)} -> ${Fn.F.toFixed(1)} N`);
}

// 10. v60.7 field-informed leakage: the default must stay the disclosed 0.9, and
//     adopting the kl the field card derives (with the same 3-pass refinement the UI
//     runs) must reconcile the circuit fundamental to the solve it came from.
console.log('Field-informed leakage');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M.computeDesign(p);
  ok(r.kl === 0.9, 'default leakage is the disclosed 0.9', `r.kl ${r.kl}`);
  const F = M.fieldStudy(p, r, { nr: 44, nth: 240, quick: true });
  let klF = Math.min(Math.max(r.kl * (F.B1 / r.B1), 0.5), 1.0);
  for (let i = 0; i < 3; i++) {
    const rT = M.computeDesign({ ...p, klOv: klF });
    klF = Math.min(Math.max(klF * (F.B1 / rT.B1), 0.5), 1.0);
  }
  const r2 = M.computeDesign({ ...p, klOv: +klF.toFixed(4) });
  const d2 = Math.abs(r2.B1 - F.B1) / F.B1;
  ok(d2 < 0.01, 'adopted field kl reconciles circuit B1 to the solve',
    `kl ${klF.toFixed(4)}: ${r2.B1.toFixed(4)} vs ${F.B1.toFixed(4)} T (${(d2 * 100).toFixed(2)}%)`);
  ok(r2.Kt !== r.Kt && r2.kl !== 0.9, 'adoption actually moves the circuit (Kt, kl)',
    `Kt ${r.Kt.toFixed(4)} -> ${r2.Kt.toFixed(4)}`);
  const r3 = M.computeDesign({ ...p, klOv: 0 });
  ok(Math.abs(r3.Kt - r.Kt) < 1e-12, 'revert (klOv=0) restores the default exactly');
}

// 11. v61 LOADED solve: winding currents + dq flux-linkage torque + demag map. The
//     torque-vs-circuit referee is the unit anchor for the winding source (any scale
//     slip shows as a ×1000 error); linearity and the mesh self-check keep it honest.
console.log('Loaded solve');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M.computeDesign(p);
  const F = M.fieldStudyLoaded(p, r, { nAng: 9 });
  ok(!F.err, 'loaded solve ran', F.err || `${F.nr}x${F.nth}, angle ${(F.thE * 180 / Math.PI).toFixed(0)}°e`);
  if (!F.err) {
    ok(Math.abs(F.dTcir) < 0.3, 'dq torque within 30% of the circuit Kt·I·sat referee',
      `field ${F.TemRaw.toFixed(4)} vs circuit ${F.Tcir.toFixed(4)} N·m (${(F.dTcir * 100).toFixed(1)}%)`);
    ok(F.mesh && F.mesh.ok, 'loaded torque and B1 are mesh-converged',
      F.mesh ? `dT ${(F.mesh.dT * 100).toFixed(1)}% dB1 ${(F.mesh.dB1 * 100).toFixed(1)}%` : 'no mesh check');
    const F2 = M.fieldStudyLoaded(p, r, { nAng: 9, I: F.Irms / 2, verify: false });
    const lin = F2.TemRaw / F.TemRaw;
    ok(Math.abs(lin - 0.5) < 0.06, 'torque is linear in current below saturation', `T(I/2)/T(I) = ${lin.toFixed(3)}`);
    ok(F.demag.worstMargin > 0, 'no demag at rated current', `worst margin ${(F.demag.worstMargin * 100).toFixed(0)}%`);
    const pThin = { ...p, magT: 0.8, mag: 'N52', Top: 65 };
    const rThin = M.computeDesign(pThin);
    const Fd = M.fieldStudyLoaded(pThin, rThin, { nAng: 5, I: F.Irms * 25, verify: false });
    ok(!Fd.err && Fd.demag.worstMargin < F.demag.worstMargin - 0.15,
      'thin hot magnet at 25x current erodes the demag margin',
      Fd.err || `${(F.demag.worstMargin * 100).toFixed(0)}% -> ${(Fd.demag.worstMargin * 100).toFixed(0)}%`);
  }
}

console.log(fail ? 'FIELD GATE: FAIL' : 'FIELD GATE: PASS');
process.exit(fail ? 1 : 0);
