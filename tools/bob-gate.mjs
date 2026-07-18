/* bob-gate: winding-arbor tooling — computeBobbin math + BobbinView SSR. Run from repo root. */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
const RDS = require('react-dom/server');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeBobbin, computeDesign, BobbinView, PRESETS, solveBobbin, LamPreview, CoilHeadView };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail = 1; };

// NEMA-17-class stator drawing, 6-coil stick, 30t AWG 26 ×1
const p0 = { ...base, motorType: 'bobbin', slotR: 0, stackL: 25, statorOD: 41, statorID: 26, slots: 8, toothW: 3.6,
  yoke: 2.6, tipH: 0.8, slotOpen: 1.6, liner: 0.2, turns: 30, awg: 26, strands: 1, insBuild: 'Heavy',
  Tcu: 100, wbArborD: 8, wbChanW: 6, wbChanH: 5, wbFlange: 1.2, wbCoils: 6, wbJump: 25, wbSides: 2 };
const b = M.computeBobbin(p0);
console.log('computeBobbin math');
ok(!b.err.length, 'computes error-free');
ok(Math.abs(b.dBare - 0.127 * Math.pow(92, 10 / 39)) < 1e-9, `bare Ø exact (${b.dBare.toFixed(3)} mm)`);
ok(b.tpl === Math.floor((0.98 * 6) / b.dEff), `turns/layer from channel width (${b.tpl})`);
ok(b.layers === Math.ceil(30 / b.tpl), `layers (${b.layers})`);
ok(Math.abs(b.coilOD - (8 + 2 * b.build)) < 1e-9, `coil OD = arbor + 2·build (${b.coilOD.toFixed(2)} mm)`);
ok(Math.abs(b.MLT - Math.PI * (8 + b.build)) < 1e-9, 'mean turn on the built radius');
ok(Math.abs(b.lenString - (6 * b.lenCoil + 7 * 0.025)) < 1e-9, `string length with jumpers (${b.lenString.toFixed(2)} m)`);
ok(Math.abs(b.R20s / b.R20c - b.lenString / b.lenCoil) < 1e-6, 'string R scales with length');
ok(Number.isFinite(b.slot.fill) && b.slot.fill > 0 && b.slot.fill < 1, `slot fill computed (${(b.slot.fill * 100).toFixed(0)}%)`);
ok(Math.abs(b.lenTool - (6 * 6 + 7 * 1.2)) < 1e-9, `tool length (${b.lenTool.toFixed(1)} mm)`);

// overtop + feed warnings
const b2 = M.computeBobbin({ ...p0, turns: 200 });
ok(b2.warn.some((w9) => w9.includes('overtops')), 'flange-overtop warning fires');
const b3 = M.computeBobbin({ ...p0, awg: 14 });
ok(b3.warn.some((w9) => w9.includes('slot opening')), 'slot-opening feed warning fires');
// half-gauge continuity
const bh = M.computeBobbin({ ...p0, awg: 26.5 });
ok(bh.dBare < b.dBare && bh.dBare > M.computeBobbin({ ...p0, awg: 27 }).dBare, 'half-gauge wire on the continuous formula');
// engine no-op branch
const r0 = M.computeDesign(p0);
ok(r0.bobbin === true && !r0.err.length, 'computeDesign returns the tooling no-op');

console.log('BobbinView SSR');
try {
  const out = RDS.renderToStaticMarkup(globalThis.React.createElement(M.BobbinView,
    { p: p0, s: () => () => {}, us: 'in', switchType: () => {} }));
  ok(out.length > 5000, `renders (${out.length} chars)`);
  ok(out.includes('svg-arbor'), 'arbor drawing present');
  ok(out.includes('Slot fill'), 'stator verification row present');
  ok(!/NaN/.test(out), 'no NaN in the render');
} catch (e2) { ok(false, 'SSR threw: ' + e2.message); }
console.log('inverse mode');
{
  const pI = { ...p0, wbMode: 'inv', wbRt: 2.0, conn: 'wye', wbStyle: 'tooth', wbCoils: 6 };
  const sol = M.solveBobbin(pI);
  const bI = M.computeBobbin({ ...pI, wbArborD: sol.Da, wbChanW: sol.chW, wbChanH: sol.chH, wbJump: sol.jumpEst, wbFlange: sol.flgEst });
  const RllBack = 2 * (6 * bI.R20c + sol.Rjump);                       // wye: two phase strings in series
  ok(Math.abs(RllBack - 2.0) < 0.06, `L-L round trip (wye, 6 coils/ph): solved arbor Ø${sol.Da} → L-L ${RllBack.toFixed(3)} Ω (asked 2.000)`);
  ok(sol.jumpEst > 4 && sol.flgEst >= 0.8, `tool constants estimated from the lamination (jumper ${sol.jumpEst} mm, flange ${sol.flgEst} mm)`);
  ok(bI.build <= sol.chH && bI.tpl >= 1, `solved channel holds the wind (${bI.tpl}/layer × ${bI.layers})`);
  const sol0 = M.solveBobbin({ ...pI, wbRt: 0 });
  ok(Number.isFinite(sol0.DaGeo) && Math.abs(sol0.Da - Math.max(sol0.DaGeo, p0.statorID + 2 * p0.tipH)) < 0.01,
    `no target → arbor = max(geometry Ø${sol0.DaGeo}, insertion Ø${(p0.statorID + 2 * p0.tipH).toFixed(1)}) = Ø${sol0.Da} · heads ${sol0.Lhead}/end`);
  // stack-fit verification fires when the tool is too small for the stack
  const bTight = M.computeBobbin({ ...p0, stackL: 60 });
  ok(bTight.warn.some((w9) => w9.includes('straight per side')), 'stack-fit warning fires on a too-small arbor');
}
{
  const bH = M.computeBobbin(p0);
  const svgH = RDS.renderToStaticMarkup(globalThis.React.createElement(M.CoilHeadView, { p: p0, b: bH, us: 'in' }));
  ok(svgH.includes('svg-coilhead') && !/NaN/.test(svgH) && svgH.includes('stack'), `coil-head view renders (head ${bH.Lhead}/end)`);
  const svgL = RDS.renderToStaticMarkup(globalThis.React.createElement(M.LamPreview, { p: p0, us: 'in' }));
  ok(svgL.includes('svg-lam') && !/NaN/.test(svgL) && svgL.includes('slot detail'), `lamination preview renders (${svgL.length} chars, slot zoom present)`);
}
console.log(fail ? 'BOB GATE: FAIL' : 'BOB GATE: PASS');
process.exitCode = fail;
