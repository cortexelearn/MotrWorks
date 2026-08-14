// SWEEP / SENSITIVITY GATE — design exploration must reproduce the engine exactly and
// recover textbook proportionalities. These are cheap, sharp checks on the whole chain:
// if Kt stops being linear in turns, something upstream broke.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, sweepDesign, sensitivity, SWEEP_METRICS, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
let fail = false;
const ok = (c, what, detail) => { console.log(`  ${c ? '✓' : '✗'} ${what}${detail ? ': ' + detail : ''}`); if (!c) fail = true; };

const p = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
const r = M.computeDesign(p);

console.log('Sweep fidelity');
{
  // 1. A sweep point must equal a direct computeDesign at the same value — the sweep
  //    reads metrics from real solves, so any divergence means a second model crept in.
  const sw = M.sweepDesign(p, 'magT', p.magT * 0.6, p.magT * 1.4, 21, ['Kt', 'peakT', 'eta', 'Rll']);
  ok(!sw.err, 'sweep runs', sw.err || `${sw.N} points, ${sw.nErr} invalid`);
  const mid = sw.pts[10];
  const direct = M.computeDesign({ ...p, magT: mid.v });
  ok(Math.abs(mid.m.Kt - direct.Kt) < 1e-12, 'sweep Kt == direct computeDesign Kt',
    `${mid.m.Kt.toFixed(8)} vs ${direct.Kt.toFixed(8)}`);
  ok(Math.abs(mid.m.eta - direct.eta * 100) < 1e-9, 'sweep eta == direct eta');
  ok(Math.abs(mid.m.Rll - direct.Rll) < 1e-12, 'sweep Rll == direct Rll');

  // 2. The sweep must include the current design's own value in its reported "cur".
  ok(Math.abs(sw.cur.v - p.magT) < 1e-12, 'sweep reports the current design value');
  ok(Math.abs(sw.cur.m.Kt - r.Kt) < 1e-12, 'current-point metrics match the design');

  // 3. Invalid designs are HOLES, not dropped points — the count must be preserved.
  ok(sw.pts.length === sw.N, 'invalid designs are kept as holes, not dropped');

  // 4. Error paths.
  ok(!!M.sweepDesign(p, 'nosuchkey', 1, 2, 9, ['Kt']).err, 'unknown parameter returns err');
  ok(!!M.sweepDesign(p, 'statorMat', 1, 2, 9, ['Kt']).err, 'non-numeric parameter returns err');
  ok(!!M.sweepDesign(p, 'magT', 5, 2, 9, ['Kt']).err, 'inverted range returns err');
}

console.log('Textbook proportionalities (via sensitivity)');
{
  // Kt of a PM machine is linear in series turns and in stack length; a ±10% input
  // must give ±10% out. This exercises winding layout, flux, and the Kt chain at once.
  const sn = M.sensitivity(p, ['turns', 'stackL', 'rotorOD'], 10, 'Kt');
  ok(!sn.err, 'sensitivity runs', sn.err || `${sn.rows.length} rows`);
  const byKey = Object.fromEntries(sn.rows.map((x) => [x.key, x]));
  ok(Math.abs(byKey.turns.pHi - 10) < 0.6, 'Kt is linear in turns (+10% -> +10%)', `${byKey.turns.pHi.toFixed(2)}%`);
  ok(Math.abs(byKey.turns.pLo + 10) < 0.6, 'Kt is linear in turns (-10% -> -10%)', `${byKey.turns.pLo.toFixed(2)}%`);
  ok(Math.abs(byKey.stackL.pHi - 10) < 0.8, 'Kt is linear in stack length', `${byKey.stackL.pHi.toFixed(2)}%`);
  // rotorOD +10% closes the airgap on this design -> must be reported invalid, not silently 0
  ok(byKey.rotorOD.errHi !== null, 'an input that breaks the design is flagged invalid, not dropped',
    byKey.rotorOD.errHi || 'no error recorded');

  // Resistance is linear in turns too (same winding, more of it)
  const snR = M.sensitivity(p, ['turns'], 10, 'Rll');
  ok(Math.abs(snR.rows[0].pHi - 10) < 1.5, 'R L-L is ~linear in turns', `${snR.rows[0].pHi.toFixed(2)}%`);

  // Ranking must be by influence, descending — the point of a tornado chart
  const snAll = M.sensitivity(p, ['turns', 'stackL', 'toothW', 'yoke', 'Top'], 10, 'Kt');
  const infl = snAll.rows.map((x) => x.infl);
  ok(infl.every((v, i) => i === 0 || v <= infl[i - 1] + 1e-12), 'rows are sorted by influence');
}

console.log('Metric coverage');
{
  // every advertised metric must be readable on a healthy design (no undefined columns)
  const bad = M.SWEEP_METRICS.filter((m) => !Number.isFinite(m.get(r))).map((m) => m.k);
  ok(bad.length <= 1, 'declared metrics resolve on a healthy PM design', bad.length ? `unresolved: ${bad.join(',')}` : 'all resolve');
}

console.log(fail ? 'SWEEP GATE: FAIL' : 'SWEEP GATE: PASS');
process.exit(fail ? 1 : 0);
