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
const fn = new Function('React', app + '\nreturn { computeDesign, PRESETS };');
const M = fn(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const names = Object.keys(M.PRESETS).filter(n => M.PRESETS[n].motorType === 'latm');
console.log('LATM presets found:', names.length);
for (const name of names) {
  const p = { ...base, ...M.PRESETS[name] };
  const r = M.computeDesign(p);
  const lt = r.latm;
  const ozin = 141.612;
  console.log(`\n${name}`);
  if (r.err.length) { console.log('  ✗ ERRORS:', r.err); process.exitCode = 1; continue; }
  console.log(`  Idrv ${lt.Idrv.toFixed(2)} A · Tpk ${(lt.Tpk*ozin).toFixed(2)} oz·in · Tstop ${(lt.Tstop*ozin).toFixed(2)} oz·in (${(lt.Tstop/lt.Tpk*100).toFixed(0)}%)`);
  console.log(`  travel ${lt.travel}° vs reversal ±${lt.zeroAng.toFixed(1)}° · Ra ${lt.Ra.toFixed(1)} Ω · L ${(lt.L*1e3).toFixed(2)} mH · τ ${(lt.tau*1e6).toFixed(0)} µs`);
  console.log(`  Bg ${lt.Bg.toFixed(2)} T · Bring ${lt.Bring.toFixed(2)} T · winding ${p.turns}/${Math.floor(lt.capT)} turns capacity · P_on ${(lt.Idrv**2*lt.Ra).toFixed(1)} W · Tcu ${Math.round(r.therm.Tcu)} °C`);
  const bad = [];
  if (lt.Tstop / lt.Tpk < 0.3) bad.push('Tstop < 30% of peak');
  if (lt.travel / 2 >= lt.zeroAng * 0.9) bad.push('stops too close to reversal');
  if (p.turns > lt.capT) bad.push('winding does not fit');
  if (r.therm.Tcu > 155) bad.push('overtemp held-on');
  if (r.warn.length) console.log('  warnings:', r.warn.map(w=>w.split(':')[0]).join(' | '));
  if (bad.length) { console.log('  ✗', bad.join(' · ')); process.exitCode = 1; }
  else console.log('  ✓ healthy');
}
