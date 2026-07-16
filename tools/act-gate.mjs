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
const M = new Function('React', app + '\nreturn { computeDesign, composeActuator, ActuatorView, PRESETS };')(globalThis.React);
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
  ok(out.includes('Static holding'), 'holding row present');
} catch (e2) { ok(false, 'SSR threw: ' + e2.message); }

console.log(fail ? 'ACT GATE: FAIL' : 'ACT GATE: PASS');
process.exitCode = fail;
