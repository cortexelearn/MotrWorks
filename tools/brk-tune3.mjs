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
const p60 = { ...base, ...M.PRESETS['Brake 24 V · 60 mm · spring-applied'] };
const targets = [
  { name: '28V 38mm aero', p: { ...p60, Vdc: 28, statorOD: 38, stackL: 18, shaftD: 8, brkBore: 16,
      brkRo: 17, brkRi: 11, brkSprFree: 16.9, brkSprEng: 12.2, brkK: 15, brkStroke: 0.2, brkArm: 4, brkSpringN: 4, brkPktD: 12 },
    boss: [24, 22], pkt: [32, 33], pktD: [13, 14], turnsList: [700, 800, 900, 1000, 1100, 1250] },
  { name: '24V 90mm 10Nm', p: { ...p60, statorOD: 90, stackL: 32, shaftD: 15, brkBore: 34,
      brkRo: 40, brkRi: 26, brkSprFree: 30.7, brkSprEng: 24.4, brkK: 60, brkStroke: 0.4, brkArm: 8, brkSpringN: 6, brkPktD: 24 },
    boss: [54, 50, 46], pkt: [74, 78], pktD: [24, 26] },
  { name: '12V 40mm light', p: { ...p60, Vdc: 12, statorOD: 40, stackL: 16, shaftD: 6, brkBore: 13,
      brkRo: 18, brkRi: 12, brkSprFree: 15.0, brkSprEng: 11.25, brkK: 20, brkStroke: 0.25, brkArm: 4, brkSpringN: 4, brkPktD: 11 },
    boss: [26, 24, 22], pkt: [33, 34, 35], pktD: [12, 13], turnsList: [300, 340, 380, 420, 460, 500, 540, 580, 620, 660] },
];
for (const tg of targets) {
  let best = null;
  for (const boss of tg.boss) for (const pktID of tg.pkt) for (const pktD of tg.pktD)
  for (let awg = 26; awg <= 38; awg++) for (const turns of (tg.turnsList || [350, 450, 536, 650, 780])) {
    const bobL = pktD - 2.5;
    const p = { ...tg.p, brkBossOD: boss, brkPktID: pktID, brkPktD: pktD,
      brkBobID: boss + 2.2, brkBobOD: pktID - 1, brkBobL: bobL, awg, turns };
    const r = M.computeDesign(p);
    if (r.err.length || !r.brake || r.warn.length) continue;
    const b = r.brake;
    if (!Number.isFinite(b.marginRel) || b.marginRel < 1.4 || b.TcuB > 118 || b.clr < 0.6) continue;
    if (!Number.isFinite(b.Ipull) || b.Ipull > 0.92 * b.Ib) continue;
    const score = b.marginRel - Math.abs(b.TcuB - 90) * 0.004;
    if (!best || score > best.score) best = { p, b, score };
  }
  if (!best) { console.log(tg.name, ': NO CLEAN POINT'); process.exitCode = 1; continue; }
  const b = best.b, q = best.p;
  console.log(`${tg.name} -> boss ${q.brkBossOD} pktID ${q.brkPktID} pktD ${q.brkPktD} bob ${q.brkBobID}/${q.brkBobOD}x${q.brkBobL} ${q.turns}t AWG${q.awg}`);
  console.log(`   T ${b.Thold.toFixed(2)} N·m · margin x${b.marginRel.toFixed(2)} · clr ${b.clr.toFixed(2)} · Ipull ${b.Ipull.toFixed(2)}/${b.Ib.toFixed(2)} A · Idrop ${b.Idrop.toFixed(3)} A · Tcu ${b.TcuB.toFixed(0)}°C · P ${b.Pb.toFixed(1)} W`);
}
