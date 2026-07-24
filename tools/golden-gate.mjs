// GOLDEN GATE — physics anchors with tolerance bands.
// These are FROZEN ANALYTICAL BASELINES captured 2026-07-17 (v40), one per machine type,
// not external catalog truth: they catch physics DRIFT from refactors, which render gates
// cannot. Replace any anchor's numbers with measured/catalog data as it becomes available
// (then tighten or widen its band to the measurement confidence).
// Band: ±1% default — intentional model changes will trip this gate; update the anchor
// in the same commit and say why in module-notes.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
globalThis.React = React;
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('/home/claude/motrsynth/motrsynth/index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, computeBobbin, solveBobbin, PRESETS };')(React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));

let fail = false;
const near = (got, want, tol, what) => {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= Math.abs(want) * tol;
  console.log(`  ${ok ? '✓' : '✗'} ${what}: ${Number.isFinite(got) ? got.toPrecision(5) : got} (anchor ${want} ±${tol * 100}%)`);
  if (!ok) fail = true;
};

const GOLD = [
  // v58.1 re-anchor — NEMA 17 is 12s14p: the star-of-slots tie-break fix moved kw 0.8935 -> 0.9330
  // (the published value for 12s10p/12s14p double-layer concentrated), so Kt/peakT rise 4.4% and
  // noLoad falls 4.2%. The new numbers are the correct ones.
  // v58 re-anchor — ACIM peakT: the end-winding leakage fix raised stator leakage X1, dropping
  // breakdown torque 4.7985 -> 4.2091 (-12.3%). ANALYTICAL ONLY, no ACIM bench data yet; replace
  // with a measured breakdown value when a cage is characterised.
  { preset: 'NEMA 17 · 28 V · ~6 krpm',                 checks: { Kt: 0.050883, noLoad: 6435.9, Rll: 0.38536, peakT: 0.30530 } },
  { preset: 'NEMA 23 · 28 V · ~3 krpm torquer',         checks: { Kt: 0.09901, noLoad: 3307.5, Rll: 0.23494 } },
  { preset: '4" direct-drive · 270 V · ~2.5 krpm',      checks: { Kt: 1.1303, noLoad: 2793.8, Rll: 2.1243 } },
  { preset: 'Brushed 12 V · 2-pole ferrite · ~7 krpm',  checks: { Kt: 0.014681, noLoad: 7025.1, Rll: 1.0409 } },
  { preset: 'ACIM 115 V · 400 Hz · 4-pole aero',        checks: { noLoad: 12000, Rll: 0.83495, peakT: 4.2091 } },
  { preset: 'NEMA 17 · 1.8° hybrid · bipolar',          checks: { Kt: 0.22844, Rll: 3.075, peakT: 0.48458 } },
  { preset: 'Brake 24 V · 60 mm · spring-applied',      checks: { Rll: 142.92, peakT: 3.6 } },
  { preset: 'LATM 1.5" · 28 V · SmCo 4-pole · 45° toggle', checks: { Kt: 0.054424, Rll: 118.35, peakT: 0.035021 } },
];

for (const g of GOLD) {
  const preset = M.PRESETS[g.preset];
  if (!preset) { console.log(`✗ preset missing: ${g.preset}`); fail = true; continue; }
  console.log(g.preset);
  const r = M.computeDesign({ ...base, slotR: 0, ...preset });
  if (r.err && r.err.length) { console.log(`  ✗ compute errors: ${r.err[0]}`); fail = true; continue; }
  for (const [k, want] of Object.entries(g.checks)) near(r[k], want, 0.01, k);
}

// winding tooling anchor: the exact L-L round trip is the physics invariant
console.log('Winding tooling');
{
  const p0 = { ...base, motorType: 'bobbin', slotR: 0, stackL: 25, statorOD: 41, statorID: 26, slots: 8,
    toothW: 3.6, yoke: 2.6, tipH: 0.8, slotOpen: 1.6, liner: 0.2, turns: 30, awg: 26, strands: 1,
    insBuild: 'Heavy', Tcu: 100, wbCoils: 6, wbMode: 'inv', wbRt: 2.0, conn: 'wye', wbStyle: 'tooth' };
  const sol = M.solveBobbin(p0);
  const b = M.computeBobbin({ ...p0, wbArborD: sol.Da, wbChanW: sol.chW, wbChanH: sol.chH, wbJump: sol.jumpEst, wbFlange: sol.flgEst });
  near(2 * (6 * b.R20c + sol.Rjump), 2.0, 0.03, 'L-L round trip (wye, 6 coils/ph)');
}

// FEA-light: MEC saturation curve + FEMM export structure
console.log('MEC / FEMM');
{
  const M2 = new Function('React', app + '\nreturn { computeDesign, buildFemmLua, PRESETS };')(React);
  const p = { ...base, slotR: 0, ...M2.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M2.computeDesign(p);
  const mono = r.satCurve && r.satCurve.every((s, i, a) => !i || s.k <= a[i - 1].k + 1e-9);
  const tie = r.satCurve && Math.abs(r.satCurve[2].k - r.kIT) < 1e-9;
  console.log(`  ${mono && tie ? '✓' : '✗'} satCurve monotone, endpoint = kIT (${(r.kIT * 100).toFixed(1)}%)`);
  if (!(mono && tie)) fail = true;
  const lua = M2.buildFemmLua(p, r);
  const c = (re) => (lua.match(re) || []).length;
  const ok9 = !/NaN/.test(lua) && c(/setblockprop\("Copper"/g) === r.Ns && c(/setblockprop\("Magnet"/g) === p.poles &&
    c(/mi_addbhpoint/g) === 48 && lua.includes('"A0"');
  console.log(`  ${ok9 ? '✓' : '✗'} FEMM lua: ${r.Ns} slots, ${p.poles} poles, 48 BH points, bounded, NaN-free`);
  if (!ok9) fail = true;
}
console.log(fail ? 'GOLDEN GATE: FAIL' : 'GOLDEN GATE: PASS');
if (fail) process.exitCode = 1;
