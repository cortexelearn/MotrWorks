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
  // v59.9 re-anchor — drag-corrected no-load: the model's own iron + windage torque is now
  // subtracted from the curve, so no-load sits where EM torque just covers drag instead of
  // the pure V/Ke intercept. Ferrite 2-pole at 7 krpm: 7025.1 -> 6937.3 (-1.25%). The PM
  // rows moved less than the 91-point curve grid and keep their anchors.
  { preset: 'Brushed 12 V · 2-pole ferrite · ~7 krpm',  checks: { Kt: 0.014681, noLoad: 6937.3, Rll: 1.0409 } },
  { preset: 'ACIM 115 V · 400 Hz · 4-pole aero',        checks: { noLoad: 12000, Rll: 0.83495, peakT: 4.2091 } },
  // v60.5 re-anchor — Rll for stepper/brake/LATM now reports the REAL coil at 20 C
  // (copper-only, same basis as pm) instead of the phantom 3-phase MLT formula those
  // machines never had. Stepper: per-phase Rs20 3.5496 (was certifying 3.075 of a
  // nonexistent winding). Kt/peakT untouched.
  { preset: 'NEMA 17 · 1.8° hybrid · bipolar',          checks: { Kt: 0.22844, Rll: 3.5496, peakT: 0.48458 } },
  // v60.5 re-anchor — brake coil terminal R at 20 C: 22.976 (phantom was 142.92).
  { preset: 'Brake 24 V · 60 mm · spring-applied',      checks: { Rll: 22.976, peakT: 3.6 } },
  // v59.8 re-anchor — LATM is slotless: the 1.05 "Carter" on its magnetic gap was a leftover
  // from the slotted branches, not physics. Removing it shortens the effective gap ~5%,
  // lifting Bg and thus Kt/peakT by +4.1% (0.054424 -> 0.056661, 0.035021 -> 0.036461).
  // ANALYTICAL ONLY — replace with the bench LATM calibration set when captured.
  // v60.5 re-anchor — LATM toroidal coil terminal R at 20 C: 35.210, matching an
  // independent hand calculation (35.22) to 0.03%. The old 118.35 was the phantom.
  { preset: 'LATM 1.5" · 28 V · SmCo 4-pole · 45° toggle', checks: { Kt: 0.056661, Rll: 35.210, peakT: 0.036461 } },
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
    insBuild: 'Heavy', Tcu: 100, wbCoils: 6, wbMode: 'inv', wbRt: 5.0, conn: 'wye', wbStyle: 'tooth' };
  // v58.5 re-anchor: the old 2.0 Ω target wanted a Ø10.5 arbor — BELOW this stator's Ø27.6
  // insertion floor — and the pre-fix solver shipped that impossible tool, so the old anchor
  // certified a coil whose ID sat under the tooth tips. 5.0 Ω is achievable (Ø30.3 > floor);
  // the exact round trip remains the physics invariant. bob-gate covers the clamp behavior.
  const sol = M.solveBobbin(p0);
  const b = M.computeBobbin({ ...p0, wbArborD: sol.Da, wbChanW: sol.chW, wbChanH: sol.chH, wbJump: sol.jumpEst, wbFlange: sol.flgEst });
  near(2 * (6 * b.R20c + sol.Rjump), 5.0, 0.03, 'L-L round trip (wye, 6 coils/ph)');
}

// FEA-light: MEC saturation curve + FEMM export structure
console.log('MEC / FEMM');
{
  const M2 = new Function('React', app + '\nreturn { computeDesign, buildFemmLua, PRESETS, STEELS };')(React);
  const p = { ...base, slotR: 0, ...M2.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
  const r = M2.computeDesign(p);
  const mono = r.satCurve && r.satCurve.every((s, i, a) => !i || s.k <= a[i - 1].k + 1e-9);
  const tie = r.satCurve && Math.abs(r.satCurve[2].k - r.kIT) < 1e-9;
  console.log(`  ${mono && tie ? '✓' : '✗'} satCurve monotone, endpoint = kIT (${(r.kIT * 100).toFixed(1)}%)`);
  if (!(mono && tie)) fail = true;
  const lua = M2.buildFemmLua(p, r);
  const c = (re) => (lua.match(re) || []).length;
  // two-layer machines emit TWO copper regions per slot (v60.5 star-of-slots winding)
  const cuPerSlot = r.layers === 2 ? 2 : 1;
  const ok9 = !/NaN/.test(lua) && c(/setblockprop\("Copper"/g) === r.Ns * cuPerSlot && c(/setblockprop\("Magnet"/g) === r.poles &&
    c(/mi_addbhpoint/g) === 48 && lua.includes('"A0"');
  console.log(`  ${ok9 ? '✓' : '✗'} FEMM lua: ${r.Ns} slots x${cuPerSlot} layers, ${r.poles} poles, 48 BH points, bounded, NaN-free`);
  if (!ok9) fail = true;

  // v60.5 CONTENT assertions — the pre-v60.5 exporter read dead fields (p.steel/p.magTemp)
  // and a 60° belt rule, so every export was M19 at 20 °C with a winding that disagreed
  // with the engine on fractional-slot machines. The old structural check could not see
  // any of that. These parse the emitted model and compare it to the design's own symbols.
  const pHot = { ...base, slotR: 0, ...M2.PRESETS['4" high-temp · 270 V · Hiperco/SmCo'] };
  const rHot = M2.computeDesign(pHot);
  const luaHot = M2.buildFemmLua(pHot, rHot);
  const hotM = M2.STEELS[pHot.statorMat];
  const matOK = new RegExp(`mi_addmaterial\\("StatorSteel",${hotM.muri},`).test(luaHot)
    && luaHot.includes(`magnets at ${pHot.Top} C`)
    && luaHot.includes(pHot.statorMat);
  console.log(`  ${matOK ? '✓' : '✗'} FEMM materials/temp follow the design (Hiperco muri ${hotM.muri}, Top ${pHot.Top} C)`);
  if (!matOK) fail = true;
  // odd pole request must export the engine's ROUNDED machine, not the raw input
  const pOdd = { ...p, poles: 7 };
  const rOdd = M2.computeDesign(pOdd);
  const luaOdd = M2.buildFemmLua(pOdd, rOdd);
  const oddOK = (luaOdd.match(/setblockprop\("Magnet"/g) || []).length === rOdd.poles && rOdd.poles === 8;
  console.log(`  ${oddOK ? '✓' : '✗'} FEMM exports the rounded pole count (7 -> ${rOdd.poles})`);
  if (!oddOK) fail = true;
  // slot-0 winding must match the engine's star-of-slots, not a belt rule
  const t0 = rHot.topLayer[0];
  const wantPH = ['A', 'B', 'C'][t0.phase];
  const firstCu = /setblockprop\("Copper",1,0,"([ABC])",0,0,(-?\d+)/.exec(luaHot);
  const windOK = firstCu && firstCu[1] === wantPH && Math.sign(parseInt(firstCu[2], 10)) === Math.sign(t0.sign);
  console.log(`  ${windOK ? '✓' : '✗'} FEMM slot-0 circuit matches engine topLayer (${wantPH}${t0.sign > 0 ? '+' : '-'})`);
  if (!windOK) fail = true;
}
console.log(fail ? 'GOLDEN GATE: FAIL' : 'GOLDEN GATE: PASS');
if (fail) process.exitCode = 1;
