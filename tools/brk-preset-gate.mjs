import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const names = Object.keys(M.PRESETS).filter(n => (M.PRESETS[n].motorType || '') === 'brake');
console.log(`brake presets found: ${names.length} (expect 4)`);
if (names.length !== 4) process.exitCode = 1;
const expect = {
  'Brake 28 V · 38 mm · aero holding':   { T: [0.74, 0.83], margin: [1.45, 1.6], clr: [0.55, 0.8], Tcu: [105, 120], Ipull: [0.2, 0.35] },
  'Brake 24 V · 60 mm · spring-applied': { T: [3.4, 3.8],  margin: [1.7, 2.0],  clr: [1.0, 1.4],  Tcu: [95, 120],  Ipull: [0.4, 0.7] },
  'Brake 24 V · 90 mm · 10 N·m class':   { T: [9.5, 10.6], margin: [3.0, 3.6],  clr: [3.2, 4.2],  Tcu: [90, 115],  Ipull: [0.7, 1.1] },
  'Brake 12 V · 40 mm · light duty':     { T: [0.85, 0.97],margin: [1.35, 1.55],clr: [0.5, 0.8],  Tcu: [100, 118], Ipull: [0.5, 0.75] },
};
for (const n of names) {
  const r = M.computeDesign({ ...base, ...M.PRESETS[n] });
  const b = r.brake;
  const e = expect[n];
  const inb = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
  const clean = r.err.length === 0 && r.warn.length === 0;
  const ok = clean && b && inb(b.Thold, e.T) && inb(b.marginRel, e.margin) && inb(b.clr, e.clr) && inb(b.TcuB, e.Tcu) && inb(b.Ipull, e.Ipull) && b.Idrop < b.Ipull;
  console.log(`${ok ? 'healthy' : '✗'} ${n}: T ${b ? b.Thold.toFixed(2) : '—'} N·m · ×${b ? b.marginRel.toFixed(2) : '—'} · clr ${b ? b.clr.toFixed(2) : '—'} · Ipull ${b ? b.Ipull.toFixed(2) : '—'} A · Idrop ${b ? b.Idrop.toFixed(3) : '—'} A · ${b ? b.TcuB.toFixed(0) : '—'} °C${clean ? '' : ' · ISSUES: ' + r.err.concat(r.warn).join(' | ')}`);
  if (!ok) process.exitCode = 1;
}
