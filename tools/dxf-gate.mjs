import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
const app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
const fn = new Function('React', app + '\nreturn { computeDesign, PRESETS, buildArmDxf, buildLamDxf, parseDxf, analyzeLam };');
const M = fn(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const pr = { ...base, ...M.PRESETS['Brushed 1.6" · 28 V · SmCo 4-pole'] };
const r = M.computeDesign(pr);
const dxf = M.buildArmDxf(pr, r);
writeFileSync('/tmp/armature.dxf', dxf);
// geometric verification: parse our own DXF back, check radii
const parsed = M.parseDxf(dxf);
const rad = parsed.pts.map(q => Math.hypot(q[0], q[1]));
const rMax = Math.max(...rad);
const shaftR = parsed.circles[0].r;
const prof = rad.filter(x => x > shaftR + 0.5);
const rMin = Math.min(...prof);
console.log('armature DXF: pts', parsed.pts.length, '· circles', parsed.circles.length);
console.log('profile rMax', +rMax.toFixed(3), '(expect armature R', pr.rotorOD/2, ') · rMin', +rMin.toFixed(3),
  '(expect slot bottom ≈', +(pr.rotorOD/2 - pr.tipH - r.hs).toFixed(3), ')');
console.log('shaft bore circle R:', parsed.circles[0].r, '(expect', pr.shaftD/2, ')');
const ok = Math.abs(rMax - pr.rotorOD/2) < 0.01 && Math.abs(rMin - (pr.rotorOD/2 - pr.tipH - r.hs)) < 0.05
  && Math.abs(parsed.circles[0].r - pr.shaftD/2) < 0.001;
console.log(ok ? '✓ armature DXF geometry verified round-trip' : '✗ GEOMETRY MISMATCH');
if (!ok) process.exit(1);
// count slot openings at the surface: points near rMax interrupted Ns times
let gaps = 0, prev = null;
const surf = parsed.pts.map((q,i)=>({a: Math.atan2(q[1],q[0]), r: rad[i]})).filter(q=>q.r > rMax-0.08).map(q=>q.a).sort((a,b)=>a-b);
for (let i = 1; i < surf.length; i++) if (surf[i]-surf[i-1] > 0.11) gaps++;
if (surf[0] + 2*Math.PI - surf[surf.length-1] > 0.11) gaps++;
console.log('surface interruptions (slot openings):', gaps, '(expect', r.Ns, ')');
if (gaps !== r.Ns) process.exit(1);
