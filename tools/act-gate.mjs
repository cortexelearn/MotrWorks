/* act-gate: Actuator module — composeActuator math + ActuatorView SSR.
   Run from the repo root with /tmp/_base.json staged. */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
const RDS = require('react-dom/server');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, composeActuator, ActuatorView, PRESETS, designGearTrain };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail = 1; };

const mp = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 28 V · ~6 krpm'] };
const bp = { ...base, ...M.PRESETS['Brake 24 V · 60 mm · spring-applied'] };
const mr = M.computeDesign(mp), br = M.computeDesign(bp);

console.log('composeActuator math');
const act = M.composeActuator(mr, br, { type: 'Planetary', ratio: 25, stages: 2, effOv: 0 });
ok(Math.abs(act.eta - 0.90 ** 2) < 1e-9, `planetary 2-stage η = 0.90² (${(act.eta * 100).toFixed(1)}%)`);
ok(Math.abs(act.noLoad - mr.noLoad / 25) < 1e-9, `no-load ÷ N (${act.noLoad.toFixed(0)} rpm)`);
ok(Math.abs(act.curve[0].T - mr.curve[0].T * 25 * act.eta) < 1e-9, `stall torque × N·η (${act.curve[0].T.toFixed(2)} N·m)`);
ok(Math.abs(act.hold - br.brake.Thold * 25) < 1e-9, `holding = brake × ratio, no η (${act.hold.toFixed(1)} N·m)`);
ok(act.warn.length === 0, 'clean 5:1/stage planetary carries no warnings');
const aw = M.composeActuator(mr, null, { type: 'Spur', ratio: 100, stages: 2, effOv: 0 });
ok(aw.warn.some((w9) => w9.includes('outside the typical')), 'spur 10:1/stage window warning fires');
ok(aw.hold === null, 'no brake → no holding row');
const ah = M.composeActuator(mr, null, { type: 'Harmonic', ratio: 100, stages: 1, effOv: 0 });
ok(Math.abs(ah.eta - 0.80) < 1e-9 && ah.selfLock, 'harmonic 80% η, self-locking at 100:1');
const ah2 = M.composeActuator(mr, null, { type: 'Harmonic', ratio: 2500, stages: 2, effOv: 0 });
ok(ah2.warn.some((w9) => w9.includes('single')), 'multi-stage harmonic flagged');
const ov = M.composeActuator(mr, null, { type: 'Planetary', ratio: 25, stages: 2, effOv: 88 });
ok(Math.abs(ov.eta - 0.88) < 1e-9, 'efficiency override honored');
const bad = M.composeActuator({ err: ['x'], curve: [] }, null, { type: 'Planetary', ratio: 10, stages: 1, effOv: 0 });
ok(!!bad.fail, 'errored motor source fails gracefully');

console.log('stepper as drive motor');
const sp = { ...base, slotR: 0, ...M.PRESETS['NEMA 17 · 1.8° hybrid · bipolar'] };
const sr = M.computeDesign(sp);
ok(sr.curve.length > 40 && Math.abs(sr.curve[0].T - sr.step.Th) < 1e-9, `pull-out curve anchors at Th (${(sr.step.Th * 141.612).toFixed(0)} oz·in, ${sr.curve.length} pts)`);
ok(sr.curve[sr.curve.length - 1].T < sr.step.Th * 0.2 && sr.noLoad > 500, `rolls off toward the BEMF ceiling (${Math.round(sr.noLoad)} rpm)`);
const as9 = M.composeActuator(sr, null, { type: 'Planetary', ratio: 5, stages: 1, effOv: 0 });
ok(!as9.fail && Math.abs(as9.curve[0].T - sr.step.Th * 5 * 0.90) < 1e-9, `composes through the train (${as9.curve[0].T.toFixed(2)} N·m stall @ output)`);
ok(as9.warn.some((w9) => w9.includes('resonance')), 'mid-band resonance advisory carried to the output');

console.log('ActuatorView SSR');
const pAct = { ...mp, motorType: 'actuator', actMotor: 'pm', actBrake: 'yes', gbType: 'Planetary', gbRatio: 25, gbStages: 2, gbEff: 0 };
const props = {
  p: pAct, us: 'in',
  s: () => () => {}, switchType: () => {},
  typeMem: { current: { pm: mp, brake: bp } },
  tqS: (nm) => (nm * 141.612).toFixed(1) + ' oz·in',
  typeDefaults: { brake: 'Brake 24 V · 60 mm · spring-applied' },
};
try {
  const out = RDS.renderToStaticMarkup(globalThis.React.createElement(M.ActuatorView, props));
  ok(out.length > 4000, `renders (${out.length} chars)`);
  ok(out.includes('Composite performance'), 'composite card present');
  ok(out.includes('svg-curve') && out.includes('svg-itcurve'), 'both output charts render');
  ok(out.includes('svg-actline') && out.includes('overall'), 'composite outline renders with the overall dim');
  ok(out.includes('svg-actiso') && (out.match(/linearGradient/g) || []).length >= 6, 'isometric render present (shaded cylinders)');
  ok(out.includes('Static holding'), 'holding row present');
} catch (e2) { ok(false, 'SSR threw: ' + e2.message); }

// gear synthesis physics
{
  const gt = M.designGearTrain({ agmaQ: 'Q9', presAng: 20, nPlanets: 3 }, { type: 'Planetary', st: 2, N: 25 }, 40);
  const s0 = gt.stages[0];
  const cons = s0.Zr === s0.Zs + 2 * s0.Zp && (s0.Zs + s0.Zr) % 3 === 0 && Math.abs(gt.Ntot - 25) / 25 < 0.08;
  const blQ = M.designGearTrain({ agmaQ: 'Q13', presAng: 20, nPlanets: 3 }, { type: 'Planetary', st: 2, N: 25 }, 40).blOut < gt.blOut;
  const backOk = gt.effB < gt.effF && gt.effB > 0;
  const lewisOk = Number.isFinite(gt.TmaxOut) && gt.TmaxOut > 1 && gt.limStage >= 1;
  const clr = (s0.Zs + s0.Zp) * Math.sin(Math.PI / 3) > s0.Zp + 2;   // neighbor-planet clearance
  const meshId = Math.abs(s0.a - (s0.PDs + s0.PDp) / 2) < 0.01;      // carrier = center distance
  const gShort = M.designGearTrain({ agmaQ: 'Q9', presAng: 20, nPlanets: 3 }, { type: 'Planetary', st: 2, N: 25, brg: 'radial' }, 40, 12);
  const lenCap = gShort.TmaxOut < gt.TmaxOut * 0.7 && gShort.w.some((w9) => w9.includes('limits gear face'));
  const all9 = cons && blQ && backOk && lewisOk && clr && meshId && lenCap;
  console.log(`  ${all9 ? '\u2713' : '\u2717'} gear synthesis: Zs/Zp/Zr ${s0.Zs}/${s0.Zp}/${s0.Zr} \u00b7 \u03a3${gt.Ntot.toFixed(1)}:1 \u00b7 bl ${gt.blOut.toFixed(1)}\u2032 (Q-monotone ${blQ}) \u00b7 \u03b7 ${(gt.effF*100).toFixed(1)}/${(gt.effB*100).toFixed(1)}% \u00b7 Lewis ${gt.TmaxOut.toFixed(1)} N\u00b7m @${gt.limStage} \u00b7 clr ${clr} a-id ${meshId} len-cap ${lenCap}`);
  if (!all9) fail = true;
}
// spur cluster: stepped modules, 12t shifted pinions, ladder fits, torque above uniform-m floor
{
  const gs = M.designGearTrain({ agmaQ: 'Q9', presAng: 20, nPlanets: 3 }, { type: 'Spur', st: 3, N: 20, brg: 'radial' }, 30.5, 0);
  const stepped = gs.stages[2].m > gs.stages[0].m;
  const fits = !gs.w.some((w9) => w9.includes('ladder span'));
  const strong = gs.TmaxOut > 0.2;
  const ok9 = stepped && fits && strong && gs.stages[0].Z1 === 12;
  console.log(`  ${ok9 ? '\u2713' : '\u2717'} spur cluster: m ${gs.stages.map((s9) => s9.m).join('/')} (stepped ${stepped}) \u00b7 Tmax ${gs.TmaxOut.toFixed(2)} N\u00b7m \u00b7 fits ${fits}`);
  if (!ok9) fail = true;
}
console.log(fail ? 'ACT GATE: FAIL' : 'ACT GATE: PASS');
process.exitCode = fail;

// v60.5: efficiency unification — with a synthesized train's detailed efficiency passed
// as effDet, the composed curve must carry THAT eta (the app previously mapped the curve
// with the catalog table while the gear card showed the detailed value). Override wins.
console.log('efficiency unification (v60.5)');
{
  const a0 = M.composeActuator(mr, null, { type: 'Planetary', ratio: 25, stages: 2, effOv: 0 });
  const gt = M.designGearTrain({ ...base, nPlanets: 3, agmaQ: 'Q9', presAng: 20 }, a0, 46, 60);
  const a1 = M.composeActuator(mr, null, { type: 'Planetary', ratio: 25, stages: 2, effOv: 0, effDet: gt.effF });
  ok(Math.abs(a1.eta - gt.effF) < 1e-12, `composed eta == synthesized effF (${(a1.eta * 100).toFixed(2)}%)`);
  ok(a1.etaSrc === 'synthesized', 'eta source reported as synthesized');
  ok(Math.abs(a1.curve[0].T - mr.curve[0].T * 25 * gt.effF) < 1e-9, 'curve torque scales with the synthesized eta');
  const a2 = M.composeActuator(mr, null, { type: 'Planetary', ratio: 25, stages: 2, effOv: 77, effDet: gt.effF });
  ok(Math.abs(a2.eta - 0.77) < 1e-12 && a2.etaSrc === 'override', 'user override still wins over effDet');
  ok(a0.etaSrc === 'catalog', 'no train, no override -> catalog fallback is labeled');
}
if (fail) { console.log('ACT GATE: FAIL (v60.5 block)'); process.exitCode = 1; }
