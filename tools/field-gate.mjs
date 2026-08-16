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
const M = new Function('React', app + '\nreturn { computeDesign, fieldStudy, fieldMesh, magPattern, solveField, gapQuantities, PRESETS };')(globalThis.React);
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
// 9. Error paths: never throw, always explain.
console.log('Error handling');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['ACIM 115 V · 400 Hz · 4-pole aero'] };
  ok(!!M.fieldStudy(p, M.computeDesign(p), {}).err, 'unsupported machine type returns err');
  // brushed is inside-out (magnets on the housing, slots on the rotating armature) and
  // this mesh models inner-rotor PM only. Solving it anyway produced confident wrong
  // numbers — 2-pole brushed presets sat 33-40% off the circuit — so it must refuse.
  const pb = { ...base, slotR: 0, ...M.PRESETS['Brushed 12 V · 2-pole ferrite · ~7 krpm'] };
  const fb = M.fieldStudy(pb, M.computeDesign(pb), {});
  ok(!!fb.err && /inside-out|inverted mesh/.test(fb.err), 'brushed topology is refused, not mis-meshed', fb.err || 'NO ERROR - solving wrong geometry');
  const pBad = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'], rotorOD: NaN };
  ok(!!M.fieldStudy(pBad, M.computeDesign(pBad), {}).err, 'errored design returns err');
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

console.log(fail ? 'FIELD GATE: FAIL' : 'FIELD GATE: PASS');
process.exit(fail ? 1 : 0);
