import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
const app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const names = Object.keys(M.PRESETS).filter(n => M.PRESETS[n].motorType === 'stepper');
console.log('stepper presets:', names.length);
const oz = 141.612;
for (const name of names) {
  const p = { ...base, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  console.log(`\n${name}`);
  if (r.err.length) { console.log('  ✗ ERRORS:', r.err); process.exitCode = 1; continue; }
  const s = r.step;
  console.log(`  ${s.angle.toFixed(s.angle<10?1:0)}°/step · ${s.stepsRev} steps/rev · hold ${s.Th2 >= 0.5 ? s.Th2.toFixed(2)+' N·m' : (s.Th2*oz).toFixed(1)+' oz·in'} (2-on) · detent ${(s.detent*oz).toFixed(2)} oz·in`);
  console.log(`  R ${s.Rs.toFixed(2)} Ω · L ${(s.Ls*1e3).toFixed(1)} mH · τ ${(s.tau*1e3).toFixed(1)} ms · wiring ${s.wire} (${s.leads} leads) · f0 ${s.f0.toFixed(0)} Hz · fill ${(r.fillGross*100).toFixed(0)}%`);
  const expectedWarn = s.wire === 'uni' ? 1 : 0;   // unipolar torque note is intentional
  const other = r.warn.filter(x => !x.includes('Unipolar wiring'));
  if (other.length) { console.log('  ✗ unexpected warnings:', other); process.exitCode = 1; }
  else console.log('  ✓ healthy' + (expectedWarn ? ' (unipolar note only)' : ''));
}
