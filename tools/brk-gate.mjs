import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
const { renderToString } = require('react-dom/server');
globalThis.React = React;
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
const app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, PRESETS, BRAKE_MATS, BrakeSection, AxialCutaway, MotorDesigner };')(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const p0 = { ...base, ...M.PRESETS['Brake 24 V · 60 mm · spring-applied'] };
const r0 = M.computeDesign(p0);
const b = r0.brake;
console.log('preset errors:', r0.err, '\nwarnings:', r0.warn);
const chk = (n, v, lo, hi) => { const ok = Number.isFinite(v) && v >= lo && v <= hi;
  console.log((ok?'  ✓':'  ✗'), n, '=', +v.toPrecision(4), ok?'':`(expect ${lo}..${hi})`); if(!ok) process.exitCode=1; };
chk('holding torque N·m (hand: 3.6)', b.Thold, 3.2, 4.0);
chk('dynamic torque N·m', b.Tdyn, 2.5, 3.3);
chk('effective radius mm (22.5)', b.re, 22.4, 22.6);
chk('uniform-pressure re > uniform-wear re', b.reUP - b.re, 0.01, 3);
chk('springs compressed N (212)', b.Fcompr, 210, 214);
chk('pad pressure MPa (hand: 0.157)', b.padP, 0.13, 0.19);
chk('pull @ gap N (tuned ≈ 387)', b.Fpull, 330, 450);
chk('release margin (tuned ≈ 1.83)', b.marginRel, 1.4, 2.4);
chk('seated pull >> gap pull', b.Fseat / b.Fpull, 2, 60);
chk('coil R Ω (tuned ≈ 28)', b.Rb, 22, 36);
chk('wound coil clearance mm (tuned ≈ 1.19)', b.clr, 0.6, 2.5);
chk('coil OD mm (tuned ≈ 47.6)', b.coilOD, 45, 49.5);
chk('coil P W (≈ 19)', b.Pb, 14, 29);
chk('coil temp °C held released (≈ 109)', b.TcuB, 80, 120);
chk('inner pole B at gap T (hand ≈ 1.0)', b.Bin, 0.6, 1.6);
chk('coil fits window', p0.turns / b.capT, 0.1, 0.99);
if (r0.err.length || r0.warn.length) { console.log('  ✗ preset must be error/warning-free'); process.exitCode = 1; }
else console.log('  ✓ preset clean');

const r2 = M.computeDesign({ ...p0, brkMu: 0.20 });
console.log(`  µ linearity T(0.2)/T(0.4) = ${(r2.brake.Thold/b.Thold).toFixed(3)} (0.5) ${Math.abs(r2.brake.Thold/b.Thold-0.5)<0.01?'✓':'✗'}`);
const r3 = M.computeDesign({ ...p0, brkFaces: 1 });
console.log(`  faces T(1)/T(2) = ${(r3.brake.Thold/b.Thold).toFixed(3)} (0.5) ${Math.abs(r3.brake.Thold/b.Thold-0.5)<0.01?'✓':'✗'}`);
if (Math.abs(r2.brake.Thold/b.Thold-0.5)>0.01 || Math.abs(r3.brake.Thold/b.Thold-0.5)>0.01) process.exitCode = 1;
const rHalf = M.computeDesign({ ...p0, brkStroke: 0.15 });
console.log(`  pull rises as gap closes: ${rHalf.brake.Fpull.toFixed(0)} N @0.15 > ${b.Fpull.toFixed(0)} N @0.3: ${rHalf.brake.Fpull > b.Fpull ? '✓' : '✗'}`);
if (rHalf.brake.Fpull <= b.Fpull) process.exitCode = 1;
for (const [k, v] of Object.entries(M.BRAKE_MATS)) {
  if (v === null) continue;
  if (!(v.mus > v.mud && v.pMax > 0 && v.Tmax > 100)) { console.log('  ✗ bad material', k); process.exitCode = 1; }
}
console.log('  ✓ material table sane (µs > µd, limits present)');
const wcase = [
  ['weak coil (low bus)', { Vdc: 10 }, 'Release margin'],
  ['overpressure', { brkSprFree: 300, brkSprEng: 20, brkK: 12 }, 'exceeds'],
  ['hot coil', { awg: 24 }, '°C class'],
  ['no wear allowance', { brkStroke: 0.1 }, 'wear allowance'],
  ['thin armature', { brkArm: 1 }, 'too thin'],
  ['overfull bobbin', { turns: 3000 }, "won't fit"],
  ['coil-pocket interference', { turns: 1200 }, 'interferes', true],
  ['tight clearance', { turns: 745 }, 'radial clearance'],
  ['bobbin-boss fit', { brkBobID: 34 }, "slip over"],
  ['bobbin vs pocket depth', { brkBobL: 17 }, "seat in"],
  ['back web saturation', { brkPktD: 24 }, 'Back web', false],
  ['bad lining dims', { brkRi: 30 }, 'ID must be smaller', true],
];
for (const [name, patch, needle, isErr] of wcase) {
  const rr = M.computeDesign({ ...p0, ...patch });
  const hit = (isErr ? rr.err : rr.warn).some(x => x.includes(needle));
  console.log(`  ${hit?'✓':'✗'} ${name} fires "${needle}"`);
  if (!hit) process.exitCode = 1;
}
const rNoise = M.computeDesign({ ...p0, toothW: 50, slots: 5, yoke: 0.1 });
const leaks = rNoise.err.concat(rNoise.warn).filter(x => /slot|tooth|yoke|rotating field|multiple of 3|lamination/i.test(x));
console.log(`  slot-geometry checks gated: ${leaks.length === 0 ? '✓' : '✗ ' + leaks.join(' | ')}`);
if (leaks.length) process.exitCode = 1;
for (const [name, C, props, tag] of [
  ['BrakeSection', M.BrakeSection, { p: p0, r: r0 }, 'face view'],
  ['Axial engaged', M.AxialCutaway, { p: p0, r: r0, us: 'in', anim: { on: false, th: 0 } }, 'POWER OFF'],
  ['Axial released', M.AxialCutaway, { p: p0, r: r0, us: 'in', anim: { on: true, th: 3.2 } }, 'POWER ON'],
]) {
  try { const s = renderToString(React.createElement(C, props));
    const ok = s.length && s.includes(tag);
    console.log(`  ${ok ? '✓' : '✗'} ${name} renders (${s.length}), "${tag}" present`);
    if (!ok) process.exitCode = 1;
  } catch (e) { console.log('  ✗ ' + name + ' THREW: ' + e.message); process.exitCode = 1; }
}
console.log('default SSR:', renderToString(React.createElement(M.MotorDesigner)).length);
