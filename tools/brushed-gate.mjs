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
const fn = new Function('React', app + '\nreturn { computeDesign, BrushedSection, BrushedSlotDetail, AxialCutaway, CrossSection, SlotDetail, CurrentTorqueChart, TorqueSpeedChart, ArmLamPreview };');
const M = fn(React);

// 540-class brushed: 24 mm armature in a 28 mm can, 2-pole ferrite-ish ring -> use N35 for test
// v58.1: turns:25 is the shop spec = CONDUCTORS PER SLOT, so turnBasis:"slot". Read as turns-per-coil
// it doubled Z and halved no-load to 2677 rpm — implausible for a 540 and the cause of this gate's
// long-standing failure. Slot basis gives 5354 rpm.
const p = {
  slots: 5, poles: 2, statorOD: 35, statorID: 25, rotorOD: 24, yoke: 4.5, toothW: 4.0,
  slotOpen: 2.0, tipH: 0.8, stackL: 30, liner: 0.2, slotR: 0.3, shaftD: 5,
  pattern: "lap", layers: 2, span: 2, turns: 25, turnBasis: "slot", awg: 26, strands: 1, paths: 1, insBuild: "Heavy",
  conn: "wye", vref: "ll", motorType: "brushed", ctrl: "foc", sense: "hall",
  mag: "N35", magT: 2.5, poleArc: 85, Top: 60,
  endMode: "auto", headH: 15, bobShape: "race", bobD: 30, bobWall: 1, bobWin: 16,
  statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  loadMode: "J", Irate: 5, bdRpm: 1800, Tcu: 80, Rext: 20,
  Tamb: 25, cooling: "Open air", TcuMax: 130, mR: 0, mL: 0, mKe: 0, mNl: 0,
  gbType: "None", gbRatio: 10, gbStages: 1, gbEff: 0,
  brushV: 1.4, latmWind: 2, brkSprFree: 23.3, brkSprEng: 18.3, brkMu: 0.35, brkMuD: 0.25, brkFaces: 2, brkStroke: 0.3,
  stpNr: 50, stpKind: "hybrid", stpPP: 12, latmSect: 4, latmSpan: 60,
  rotorBars: 28, barA: 60, ringA: 120, barMat: "Cast aluminum",
  Vll: 400, Vdc: 12, Imax: 8, freq: 100, slip: 3, sb: 18, J: 6, Bg: 0.85, seq: "ABC",
};
const r = M.computeDesign(p);
console.log("errors:", r.err);
console.log("warnings:", r.warn.length, r.warn);
const chk = (name, v, lo, hi) => {
  const ok = Number.isFinite(v) && v >= lo && v <= hi;
  console.log((ok ? "  ✓" : "  ✗ OUT OF RANGE"), name, "=", typeof v === "number" ? +v.toPrecision(4) : v, ok ? "" : `(expect ${lo}..${hi})`);
  if (!ok) process.exitCode = 1;
};
// geometry sanity: slot depth inward, w1 > w2 (taper narrows toward shaft)
chk("airgap mm", r.airgap, 0.3, 1);
chk("slot depth hs mm", r.hs, 3, 8);
console.log("  w1(surface)", +r.w1.toPrecision(4), "> w2(bottom)", +r.w2.toPrecision(4), r.w1 > r.w2 ? "✓ taper correct" : "✗ TAPER WRONG");
if (!(r.w1 > r.w2)) process.exitCode = 1;
// brushed outputs
chk("Bg avg T", r.BgAvg, 0.3, 0.9);
chk("Kt N·m/A", r.Kt, 0.003, 0.05);       // 540-class: ~5-15 mN·m/A
chk("Ra ohm", r.brush.Ra, 0.05, 3);
chk("La H", r.brush.La, 1e-6, 5e-3);
chk("no-load rpm", r.noLoad, 3000, 40000);
chk("Iph (J->Ia, a=2)", r.Iph, 1, 10);     // J=6 × 0.129mm² × a=2 ≈ 3.1 A
chk("Pcu W (incl brush)", r.Pcu, 1, 60);
chk("demag margin", r.demagMargin, -1, 1);
chk("therm Tcu C", r.therm.Tcu, 25, 400);
chk("commutator bars", r.brush.segs, 5, 5);
chk("paths A2 (lap 2p×1)", r.brush.A2, 2, 2);
console.log("  eta", +(r.eta*100).toFixed(1), "% · op:", Math.round(r.op.n), "rpm @", +(r.op.T*1000).toFixed(1), "mN·m");
// sanity: Ns%3 warning must NOT fire for 5 slots brushed
if (r.warn.some(x => x.includes("multiple of 3"))) { console.log("  ✗ 3-phase warning leaked"); process.exitCode = 1; }
else console.log("  ✓ no 3-phase slot warning on 5-slot armature");

// SSR-render every brushed view
const rr = { ...r };
for (const [name, C, props] of [
  ["BrushedSection", M.BrushedSection, { p, r: rr, anim: { on: true, th: 1.3 } }],
  ["CrossSection→brushed", M.CrossSection, { p, r: rr, anim: { on: false, th: 0 }, phaseSel: "all" }],
  ["BrushedSlotDetail", M.BrushedSlotDetail, { p, r: rr, us: "in" }],
  ["SlotDetail→brushed", M.SlotDetail, { p, r: rr, us: "in" }],
  ["AxialCutaway brushed", M.AxialCutaway, { p, r: rr, us: "in" }],
  ["CurrentTorqueChart brushed", M.CurrentTorqueChart, { p, r: rr, us: "in" }],
  ["TorqueSpeedChart", M.TorqueSpeedChart, { r: rr, us: "in" }],
]) {
  try {
    const s = renderToString(React.createElement(C, props));
    console.log("  ✓ " + name + " renders (" + s.length + " chars)");
    if (!s.length) { console.log("  ✗ empty render: " + name); process.exitCode = 1; }
  } catch (e) { console.log("  ✗ " + name + " THREW: " + e.message); process.exitCode = 1; }
}
{
  const svgA = renderToString(React.createElement(M.ArmLamPreview, { p, us: "in" }));
  if (!svgA.includes("svg-armlam") || /NaN/.test(svgA) || !svgA.includes("airgap up")) { console.log("  ✗ ArmLamPreview render"); process.exitCode = 1; }
  else console.log("  ✓ ArmLamPreview renders (armature slots outward, airgap up)");
}
// wave winding check: A2 = 2
const r2 = M.computeDesign({ ...p, pattern: "concentrated" });
chk("wave paths A2", r2.brush.A2, 2, 2);
// PM regression: NEMA-23-ish still healthy
const pmP = { ...p, motorType: "pm", slots: 12, poles: 10, statorOD: 57, statorID: 32, rotorOD: 31,
  yoke: 4.5, toothW: 4.2, slotOpen: 2, tipH: 1, stackL: 45, shaftD: 8, turns: 8, awg: 19,
  pattern: "concentrated", span: 0, mag: "N45SH", magT: 2.5, Vdc: 28, Imax: 10, freq: 300 };
const rp = M.computeDesign(pmP);
console.log("PM regression: err", rp.err.length, "· Kt", +rp.Kt.toPrecision(3), "· noLoad", Math.round(rp.noLoad), "· fill", +(rp.fillGross*100).toFixed(1)+"%");
if (rp.err.length) process.exitCode = 1;
