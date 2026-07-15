import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
const { renderToString, renderToStaticMarkup } = require('react-dom/server');
globalThis.React = React;
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
const app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, PRESETS, BrushedWindingDiagram, StepperWindingDiagram, MotorDesigner };')(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));

// brushed lap + wave
const pBr = { ...base, ...M.PRESETS['Brushed 24 V · 4-pole NdFeB · ~4.5 krpm'] };
const rBr = M.computeDesign(pBr);
const sLap = renderToStaticMarkup(React.createElement(M.BrushedWindingDiagram, { p: pBr, r: rBr }));
const polys = (sLap.match(/<polyline/g) || []).length;
console.log(`lap diagram: polylines ${polys} (expect ≥ 2×Ns=${2*rBr.Ns}) · bars ${(sLap.match(/#E8B44C/g)||[]).length} (${rBr.brush.segs}) · brushes ${(sLap.match(/#3F3F46/g)||[]).length} (${rBr.poles})`);
if (polys < 2 * rBr.Ns || (sLap.match(/#E8B44C/g)||[]).length !== rBr.brush.segs) process.exitCode = 1;

const pWv = { ...pBr, pattern: "wave", slots: 21, paths: 1 };  // 21 slots, 4 poles: (21-1)/2=10 ✓ valid wave
const rWv = M.computeDesign(pWv);
const sWv = renderToStaticMarkup(React.createElement(M.BrushedWindingDiagram, { p: pWv, r: rWv }));
const wvOK = sWv.includes('(wave)') && (sWv.match(/#3F3F46/g)||[]).length === 2;
console.log(`wave diagram: pitch label + 2 brushes: ${wvOK ? '✓' : '✗'} · engine warn count ${rWv.warn.length}`);
if (!wvOK) process.exitCode = 1;
// invalid wave fires the new warning
const rBad = M.computeDesign({ ...pWv, slots: 20 }); // (20±1)/2 not integer
const wOK = rBad.warn.some(x => x.includes('integer commutator pitch'));
console.log(`invalid wave (20 slots/4 poles) warns: ${wOK ? '✓' : '✗'}`);
if (!wOK) process.exitCode = 1;

// stepper: all three wiring modes render with correct lead labels
const pSt = { ...base, ...M.PRESETS['NEMA 17 · 1.8° hybrid · bipolar'] };
for (const [wire, expect] of [["bip-ser", "loops back in series"], ["bip-par", "8-lead"], ["uni", "COM"]]) {
  const r = M.computeDesign({ ...pSt, stpWire: wire });
  const s = renderToStaticMarkup(React.createElement(M.StepperWindingDiagram, { p: { ...pSt, stpWire: wire }, r }));
  const coils = (s.match(/a 5 9 0 0 1/g) || []).length;
  const ok = s.includes(expect) && coils === 4 * 8; // 4 arcs × 8 coils (4/phase × 2 phases)
  console.log(`stepper ${wire}: termination "${expect}" + ${coils} turn arcs (32): ${ok ? '✓' : '✗'}`);
  if (!ok) process.exitCode = 1;
}
const out = renderToString(React.createElement(M.MotorDesigner));
console.log('default SSR:', out.length, out.length === 150033 ? '✓' : '(changed — check)');
// dump for raster
writeFileSync('/tmp/br-wind.svg', sLap.replace('<svg ', '<svg style="background:#F8FAFC" '));
const rS = M.computeDesign(pSt);
writeFileSync('/tmp/stp-wind.svg', renderToStaticMarkup(React.createElement(M.StepperWindingDiagram, { p: pSt, r: rS })).replace('<svg ', '<svg style="background:#F8FAFC" '));
