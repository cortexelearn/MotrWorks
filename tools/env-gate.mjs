/* env-gate: envelope wizard synthesis for all six machine types.
   Extracts synthEnvelope + computeDesign from the built index.html and checks that each
   architecture returns a design that (a) computes error-free, (b) lands near its targets,
   and (c) picks wire on the half-gauge grid. Run from the repo root. */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const app = html.slice(html.indexOf('<script>/*APP*/') + 15, html.indexOf('</script>\n<script>/*BOOT*/')).replace(/<\\\/script/g, '</script');
const M = new Function('React', app + '\nreturn { computeDesign, synthEnvelope, PRESETS };')(globalThis.React);
const base = JSON.parse(readFileSync('/tmp/_base.json', 'utf8'));
const IN2 = 141.612;
let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail = 1; };
const halfG = (a) => Math.abs(a * 2 - Math.round(a * 2)) < 1e-9;
const wiz0 = { od: 57, stack: 40, vdc: 28, imax: 10, nl: 5000, tst: 60, trt: 30, nrt: 4000,
  arch: 'pm', ctrl: 'foc', shape: 'sine', freq: 60, travel: 45, stepA: 1.8, swire: 'bip-ser', stroke: 0.3, bore: 16 };
const run = (name, wiz, us, checks) => {
  console.log(name);
  const t0 = Date.now();
  const r = M.synthEnvelope({ ...wiz0, ...wiz }, base, us);
  const dt = Date.now() - t0;
  ok(!r.fail, r.fail ? 'synth failed: ' + r.fail : `synth returned a design (${dt} ms)`);
  if (r.fail) return;
  const chk = M.computeDesign(r.p);
  ok(!chk.err.length, chk.err.length ? 'engine errors: ' + chk.err[0] : 'engine computes error-free');
  ok(halfG(r.p.awg), `wire on the half-gauge grid (AWG ${r.p.awg})`);
  checks(r, chk);
  console.log('  msg: ' + r.msg.slice(0, 150) + (r.msg.length > 150 ? '…' : ''));
};

run('BLDC (default envelope, inch)', { arch: 'pm' }, 'in', (r, chk) => {
  ok(Math.abs(Math.log(chk.noLoad / 5000)) < 0.3, `no-load ${Math.round(chk.noLoad)} rpm vs asked 5000`);
  ok(chk.Kt * 10 > (60 / IN2) * 0.6, `stall @ 10 A = ${(chk.Kt * 10 * IN2).toFixed(0)} oz·in vs asked 60`);
  ok(Array.isArray(r.alts) && r.alts.length >= 2, `alternates surfaced (${(r.alts || []).length})`);
  if (r.alts && r.alts.length) {
    const ac = M.computeDesign(r.alts[0].p);
    ok(!ac.err.length && halfG(r.alts[0].p.awg), `first alternate computes clean (${r.alts[0].label})`);
  }
});

run('Brushed DC (24 V, 50 mm, 4.5 krpm)', { arch: 'brushed', od: 50, stack: 40, vdc: 24, imax: 8, nl: 4500, tst: 50, trt: 25, nrt: 3500 }, 'in', (r, chk) => {
  ok(r.p.motorType === 'brushed', 'motorType = brushed');
  ok(Math.abs(Math.log(chk.noLoad / 4500)) < 0.3, `no-load ${Math.round(chk.noLoad)} rpm vs asked 4500`);
  ok(chk.peakT > (50 / IN2) * 0.55, `stall @ limit ${(chk.peakT * IN2).toFixed(0)} oz·in vs asked 50`);
  ok(r.p.slots % r.p.poles !== 0, `slot count ${r.p.slots} not a pole multiple (commutation ripple)`);
});

run('LATM (1.5", 28 V, 45° toggle)', { arch: 'latm', od: 38, stack: 25, vdc: 28, imax: 1, travel: 45, tst: 4 }, 'in', (r, chk) => {
  ok(r.p.motorType === 'latm', 'motorType = latm');
  ok(r.p.latmSect === r.p.poles, `sectors (${r.p.latmSect}) match poles`);
  const T = chk.latm.Tstop * IN2;
  ok(Math.abs(Math.log(T / 4)) < 0.45, `toggle @ stops ${T.toFixed(2)} oz·in vs asked 4`);
  ok(chk.latm.Idrv <= 1.001, `two-wire drive ${chk.latm.Idrv.toFixed(2)} A within the 1 A limit`);
});

run('Stepper (NEMA-17-class, 1.8°, bipolar)', { arch: 'stepper', od: 42, stack: 33, vdc: 24, imax: 1.5, stepA: 1.8, swire: 'bip-ser', tst: 45 }, 'in', (r, chk) => {
  ok(r.p.motorType === 'stepper' && r.p.stpKind === 'hybrid' && r.p.stpNr === 50, '1.8° → hybrid, 50 rotor teeth');
  const T = chk.step.Th * IN2;
  ok(Math.abs(Math.log(T / 45)) < 0.45, `holding (2-on) ${T.toFixed(1)} oz·in vs asked 45`);
});

run('PM stepper (7.5°, unipolar)', { arch: 'stepper', od: 35, stack: 15, vdc: 12, imax: 0.3, stepA: 7.5, swire: 'uni', tst: 2 }, 'in', (r, chk) => {
  ok(r.p.stpKind === 'pm' && r.p.stpPP === 12, '7.5° → PM rotor, 12 pole pairs');
  ok(chk.step.angle === 7.5, 'engine confirms 7.5°/step');
});

run('Brake (24 V, 60 mm, 3.5 N·m)', { arch: 'brake', od: 60, stack: 25, vdc: 24, stroke: 0.3, bore: 26, tst: 3.5 * IN2 }, 'in', (r, chk) => {
  const b = chk.brake;
  ok(b.Thold > 3.5 * 0.85 && b.Thold < 3.5 * 1.3, `hold ${b.Thold.toFixed(2)} N·m vs asked 3.50`);
  ok(b.marginRel >= 1.25, `release margin ×${b.marginRel.toFixed(2)}`);
  ok(b.Ipull <= b.Ib, `pull-in ${b.Ipull.toFixed(2)} A within the ${b.Ib.toFixed(2)} A bus`);
  ok(b.clr >= 0.4, `coil clearance ${b.clr.toFixed(2)} mm`);
  ok(b.TcuB <= 130, `held coil ${Math.round(b.TcuB)} °C`);
});

run('ACIM (115 V / 400 Hz aero, metric)', { arch: 'acim', od: 100, stack: 60, vdc: 115, freq: 400, nl: 11800, trt: 0.5 }, 'mm', (r, chk) => {
  ok(r.p.motorType === 'induction' && r.p.poles === 4, '400 Hz / ~11.8 krpm → 4 poles');
  ok(r.p.rotorBars !== r.p.slots, `cage ${r.p.rotorBars} bars dodges ${r.p.slots} slots`);
});

console.log(fail ? 'ENV GATE: FAIL' : 'ENV GATE: PASS');
process.exitCode = fail;
