// EFFICIENCY-MAP / DRIVE-CYCLE GATE — the map must agree with the engine's own
// operating-point efficiency (one loss chain, not two) and obey physical monotonies.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, efficiencyMap, driveCycle, lossesAt, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
let fail = false;
const ok = (cond, what, detail) => { console.log(`  ${cond ? '✓' : '✗'} ${what}${detail ? ': ' + detail : ''}`); if (!cond) fail = true; };

for (const name of ['NEMA 17 · 28 V · ~6 krpm', '4" direct-drive · 270 V · ~2.5 krpm', 'Brushed 12 V · 2-pole ferrite · ~7 krpm']) {
  console.log(name);
  const p = { ...base, slotR: 0, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const em = M.efficiencyMap(p, r, {});
  ok(!!em, 'map computed');
  if (!em) continue;

  // 1. THE consistency check: the map's rated-point efficiency IS the engine's eta.
  //    These are separate code paths over the same physics; drift means a second model.
  ok(Math.abs(em.op.eta - r.eta) < 0.005, 'map η at rated == engine η',
    `${(em.op.eta * 100).toFixed(2)}% vs ${(r.eta * 100).toFixed(2)}%`);

  // 2. Efficiency must vanish at zero speed and stay bounded everywhere.
  const all = em.grid.flat();
  ok(all.every((e) => e >= 0 && e < 1), 'all η in [0,1)');
  ok(em.grid.every((row) => row[0] === 0), 'η = 0 at zero speed (stall does no work)');

  // 3. Peak efficiency must be at least the rated-point value and physically sane.
  ok(em.best.eta >= em.op.eta - 1e-9, 'peak η >= rated η', `${(em.best.eta * 100).toFixed(2)}%`);
  ok(em.best.eta > 0.5 && em.best.eta < 0.995, 'peak η physically sane');

  // 4. Loss split must add up at any probe point (energy conservation).
  const L = M.lossesAt(p, r, em.best.n, em.best.T);
  ok(Math.abs(L.Pin - (L.Pout + L.Pcu + L.Pfe + L.Pwind)) < 1e-6 * Math.max(L.Pin, 1), 'Pin = Pout + losses');

  // 5. At fixed speed, copper loss must rise with torque (I ~ T) — catches sign/υ errors.
  const nT = em.nMax * 0.5;
  const lo = M.lossesAt(p, r, nT, em.tMax * 0.2), hi = M.lossesAt(p, r, nT, em.tMax * 0.6);
  ok(hi.Pcu > lo.Pcu * 2, 'copper loss grows with torque', `${lo.Pcu.toFixed(2)} -> ${hi.Pcu.toFixed(2)} W`);

  // 6. At fixed torque, iron loss must rise with speed (Steinmetz in f).
  const lo2 = M.lossesAt(p, r, em.nMax * 0.25, em.tMax * 0.3), hi2 = M.lossesAt(p, r, em.nMax * 0.75, em.tMax * 0.3);
  ok(hi2.Pfe > lo2.Pfe, 'iron loss grows with speed', `${lo2.Pfe.toFixed(2)} -> ${hi2.Pfe.toFixed(2)} W`);

  // 7. The ridge (best-η locus) must lie inside the envelope at every speed.
  ok(em.ridge.every((pt) => pt.T <= em.tAt(pt.n) * 1.001), 'best-η locus inside the drive envelope');
}

// 8. Drive cycle: a constant operating point must reproduce that point's efficiency,
//    and energy must integrate to power x duration.
console.log('Drive cycle');
{
  const p = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M.computeDesign(p);
  const em = M.efficiencyMap(p, r, {});
  const n0 = em.best.n, T0 = em.best.T;
  const dc = M.driveCycle(p, r, [{ t: 0, n: n0, T: T0 }, { t: 10, n: n0, T: T0 }, { t: 20, n: n0, T: T0 }]);
  ok(!dc.err, 'constant cycle runs', dc.err || '');
  ok(Math.abs(dc.etaCycle - em.best.eta) < 1e-6, 'constant cycle η == point η',
    `${(dc.etaCycle * 100).toFixed(3)}% vs ${(em.best.eta * 100).toFixed(3)}%`);
  const Pout0 = (T0 * n0 * 2 * Math.PI) / 60;
  ok(Math.abs(dc.Eout - Pout0 * 20) < 1e-6 * Pout0 * 20, 'energy = power x duration');
  ok(Math.abs(dc.Irms - M.lossesAt(p, r, n0, T0).I) < 1e-9, 'RMS current of a constant cycle == its current');
  // half-load/half-idle cycle: RMS current must sit between, never outside
  const dc2 = M.driveCycle(p, r, [{ t: 0, n: n0, T: T0 }, { t: 10, n: n0, T: T0 }, { t: 10.001, n: n0, T: 0 }, { t: 20, n: n0, T: 0 }]);
  ok(!dc2.err && dc2.Irms < dc.Irms && dc2.Irms > 0, 'duty cycle lowers RMS current', dc2.err || `${dc2.Irms.toFixed(2)} < ${dc.Irms.toFixed(2)} A`);
  // braking samples: heat the winding, produce no useful output, never negative energy
  const dcB = M.driveCycle(p, r, [{ t: 0, n: n0, T: -T0 }, { t: 10, n: n0, T: -T0 }]);
  ok(!dcB.err && dcB.Eout === 0 && dcB.Ecu > 0, 'braking does no useful work but still heats',
    dcB.err || `Eout ${dcB.Eout.toFixed(3)} J · Ecu ${dcB.Ecu.toFixed(1)} J`);
  ok(dcB.etaCycle === 0, 'braking-only cycle has zero efficiency');
  // malformed input must be handled, never thrown
  ok(!!M.driveCycle(p, r, []).err, 'empty cycle returns err');
  ok(!!M.driveCycle(p, r, [{ t: 0, n: NaN, T: 1 }, { t: 1, n: 1, T: NaN }]).err, 'NaN samples return err');
}

console.log(fail ? 'EFF GATE: FAIL' : 'EFF GATE: PASS');
process.exit(fail ? 1 : 0);
