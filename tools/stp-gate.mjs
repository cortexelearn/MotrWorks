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
const fn = new Function('React', app + '\nreturn { computeDesign, StepperSection, StepperTorqueChart, CrossSection, AxialCutaway, MotorDesigner };');
const M = fn(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));

// NEMA17-class hybrid: 42 mm frame, lam OD ~41, rotor 25.9, gap 0.05, Nr 50, stack 33
const n17 = { ...base,
  slots: 8, statorOD: 41, statorID: 26, rotorOD: 25.9, yoke: 3.0, toothW: 4.6, slotOpen: 2,
  tipH: 0.8, stackL: 33, liner: 0.2, slotR: 0.3, shaftD: 5,
  turns: 33, awg: 25, strands: 1, paths: 1, conn: "wye", pattern: "concentrated", layers: 2, span: 0,
  motorType: "stepper", stpKind: "hybrid", stpNr: 50, stpWire: "bip-ser", stpOn: 2,
  mag: "N35", magT: 3, poleArc: 85, Top: 60, Vdc: 24, Imax: 1.5, freq: 100, J: 6,
  seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
  statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", poles: 2,
};
const r17 = M.computeDesign(n17);
console.log("NEMA17 errors:", r17.err, "\nwarnings:", r17.warn);
const s17 = r17.step, oz = 141.612;
const chk = (n, v, lo, hi) => { const ok = Number.isFinite(v) && v >= lo && v <= hi;
  console.log((ok?"  ✓":"  ✗"), n, "=", typeof v==="number"?+v.toPrecision(4):v, ok?"":`(expect ${lo}..${hi})`); if(!ok) process.exitCode=1; };
chk("step angle (deg)", s17.angle, 1.79, 1.81);
chk("steps/rev", s17.stepsRev, 200, 200);
chk("holding 2-on N·m (catalog ~0.4, ±60%)", s17.Th2, 0.16, 0.65);
chk("R phase Ω (catalog 1.5-3)", s17.Rs, 0.7, 6);
chk("L phase mH (catalog 2-6)", s17.Ls*1e3, 0.8, 20);
chk("detent ~5.5% of Th2", s17.detent/s17.Th2, 0.05, 0.06);
chk("teeth per pole (real: 4-6)", s17.teethPP, 3, 7);
chk("bias tooth flux T (first-order band)", s17.BtBias, 0.6, 1.95);
chk("1-step natural freq Hz (real-ish band)", s17.f0, 30, 380);
console.log("  Th 1-on/2-on ratio:", (s17.Th1/s17.Th2).toFixed(3), "(expect 0.707)");
if (Math.abs(s17.Th1/s17.Th2 - 0.7071) > 0.01) process.exitCode = 1;

// wiring physics: series vs unipolar vs parallel
const rU = M.computeDesign({ ...n17, stpWire: "uni" }).step;
const rP = M.computeDesign({ ...n17, stpWire: "bip-par" }).step;
console.log(`  wiring: series Kt ${s17.Kt.toFixed(3)} R ${s17.Rs.toFixed(2)} · uni Kt ${rU.Kt.toFixed(3)} R ${rU.Rs.toFixed(2)} · par Kt ${rP.Kt.toFixed(3)} R ${rP.Rs.toFixed(2)}`);
const serOK = Math.abs(s17.Kt/rU.Kt - 2) < 0.01 && Math.abs(s17.Rs/rU.Rs - 2) < 0.01 && Math.abs(rP.Rs/rU.Rs - 0.5) < 0.01;
console.log(serOK ? "  ✓ series=2N·2R, parallel=N·R/2 vs unipolar N·R" : "  ✗ wiring factors wrong");
// equal-dissipation torque ratio series/uni = √2
const tRatio = (s17.Kt * Math.sqrt(1/s17.Rs)) / (rU.Kt * Math.sqrt(1/rU.Rs));
console.log(`  equal-watts torque ratio ser/uni: ${tRatio.toFixed(3)} (expect 1.414) ${Math.abs(tRatio-1.414)<0.01?"✓":"✗"}`);
if (Math.abs(tRatio-1.414) > 0.01) process.exitCode = 1;

// torque-angle arrays: zero at 0, peak at ±1 step, next-step curve zero at +step
const at = (arr, deg) => { const th=s17.thArr; const x=((deg-th[0])/(th[th.length-1]-th[0]))*(th.length-1); const j=Math.max(0,Math.min(Math.floor(x),th.length-2)); return arr[j]+(x-j)*(arr[j+1]-arr[j]); };
console.log(`  T(0)=${at(s17.tArr,0).toExponential(1)} (≈0) · T(−step)=${at(s17.tArr,-s17.angle).toFixed(3)} (=+Th ${s17.Th.toFixed(3)}) · Tnext(+step)=${at(s17.tNxt,s17.angle).toExponential(1)} (≈0)`);
if (Math.abs(at(s17.tArr,0)) > 0.01*s17.Th || Math.abs(at(s17.tArr,-s17.angle)-s17.Th) > 0.02*s17.Th) process.exitCode = 1;

// NEMA23-class: 56 mm, rotor 38.9, Nr 50, stack 45 → catalog ~1.2 N·m @ 2.8 A
const n23 = { ...n17, statorOD: 55, statorID: 39, rotorOD: 38.9, yoke: 4.0, toothW: 6.5, stackL: 45,
  turns: 28, awg: 22, Imax: 2.8, shaftD: 6.35, magT: 4 };
const r23 = M.computeDesign(n23);
const s23 = r23.step;
console.log("\nNEMA23:", "err", r23.err.length, "· holding 2-on", s23.Th2.toFixed(2), "N·m (catalog ~1.2, ±60%)", "· R", s23.Rs.toFixed(2), "Ω");
if (s23.Th2 < 0.5 || s23.Th2 > 2.2) { console.log("  ✗ NEMA23 holding out of band"); process.exitCode = 1; } else console.log("  ✓ in band");

// PM coarse stepper: pp 6 → 15°, pp 3 → 30°; kind-mismatch warnings
const pm15 = M.computeDesign({ ...n17, stpKind: "pm", stpPP: 6, statorID: 26, rotorOD: 24.6, magT: 2.5, mag: "Ferrite C8", stackL: 15, turns: 300, awg: 32, Imax: 0.3, Vdc: 12 });
console.log("\nPM stepper pp6:", "step", pm15.step.angle, "° (expect 15) ·", pm15.step.stepsRev, "steps/rev ·", (pm15.step.Th2*oz).toFixed(2), "oz·in");
if (pm15.step.angle !== 15) process.exitCode = 1;
const wHyb = M.computeDesign({ ...n17, stpNr: 5 }).warn.some(x => x.includes("PM-rotor"));
const wPm = M.computeDesign({ ...n17, stpKind: "pm", stpPP: 20 }).warn.some(x => x.includes("hybrid"));
console.log((wHyb?"  ✓":"  ✗") + " coarse-hybrid warning · " + (wPm?"✓":"✗") + " fine-PM warning");
if (!wHyb || !wPm) process.exitCode = 1;

// views render
for (const [name, C, props] of [
  ["StepperSection hyb", M.StepperSection, { p: n17, r: r17, anim: { on: true, th: 3.7 } }],
  ["StepperSection pm", M.StepperSection, { p: { ...n17, stpKind: "pm" }, r: pm15, anim: { on: false, th: 0 } }],
  ["StepperTorqueChart", M.StepperTorqueChart, { r: r17, us: "in" }],
  ["Axial hybrid", M.AxialCutaway, { p: n17, r: r17, us: "in" }],
  ["CrossSection→stp", M.CrossSection, { p: n17, r: r17, anim: { on: false, th: 0 }, phaseSel: "all" }],
]) {
  try { const s = renderToString(React.createElement(C, props));
    console.log("  ✓ " + name + " renders (" + s.length + ")"); if (!s.length) process.exitCode = 1;
  } catch (e) { console.log("  ✗ " + name + " THREW: " + e.message); process.exitCode = 1; }
}
const out = renderToString(React.createElement(M.MotorDesigner));
console.log("default SSR:", out.length);
