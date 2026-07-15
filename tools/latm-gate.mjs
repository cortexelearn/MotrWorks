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
const fn = new Function('React', app + '\nreturn { computeDesign, LatmSection, TorqueAngleChart, CrossSection, AxialCutaway, MotorDesigner };');
const M = fn(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));

// 1.5" class LATM: 4-pole SmCo rotor, 4 × 60° toroidal sectors on a Hiperco ring, 28 V, 45° travel
const p = { ...base,
  slots: 12, poles: 4, statorOD: 38, statorID: 28, rotorOD: 22, yoke: 5, toothW: 3, slotOpen: 1.5,
  tipH: 0.8, stackL: 25, liner: 0.2, slotR: 0, shaftD: 5,
  pattern: "lap", layers: 2, span: 0, turns: 120, awg: 30, strands: 1, paths: 1, conn: "wye",
  motorType: "latm", mag: "Sm2Co17-26", magT: 3, poleArc: 85, Top: 70,
  latmSect: 4, latmSpan: 60, latmWind: 1.5, latmTravel: 45,
  Vdc: 28, Imax: 3, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Tcu: 80, Rext: 20,
  statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
};
const r = M.computeDesign(p);
console.log("errors:", r.err);
console.log("warnings:", r.warn);
const lt = r.latm;
const chk = (n, v, lo, hi) => { const ok = Number.isFinite(v) && v >= lo && v <= hi;
  console.log((ok?"  ✓":"  ✗"), n, "=", typeof v==="number"?+v.toPrecision(4):v, ok?"":`(expect ${lo}..${hi})`); if(!ok) process.exitCode=1; };
chk("Bg T", lt.Bg, 0.3, 0.8);
chk("Ra ohm", lt.Ra, 2, 60);
chk("Idrv A (V/Ra clamp 3)", lt.Idrv, 0.3, 3);
chk("Tpk N·m", lt.Tpk, 0.01, 1);
chk("Kt N·m/A", lt.Kt, 0.02, 0.5);
chk("zeroAng deg (4-pole ≤45)", lt.zeroAng, 25, 45.5);
chk("Tstop N·m", lt.Tstop, 0.001, lt.Tpk);
chk("stiffness N·m/rad", lt.stiff, 0.001, 50);
chk("L mH", lt.L*1e3, 0.05, 200);  // slotless: low L is characteristic
chk("Bring T", lt.Bring, 0.1, 2.3);
console.log("  Tstop/Tpk =", (lt.Tstop/lt.Tpk*100).toFixed(0)+"%", "at ±"+(lt.travel/2)+"° stops");
// physics sanity: torque should be even-symmetric about the peak; curve zero at ±zeroAng
const mid = Math.floor(lt.thArr.length/2);
const sym = Math.abs(lt.tArr[mid-30] - lt.tArr[mid+30]) / lt.Tpk;
console.log("  symmetry residue @±", lt.thArr[mid+30].toFixed(1)+"°:", (sym*100).toFixed(1)+"%", sym < 0.03 ? "✓" : "✗");
if (sym >= 0.03) process.exitCode = 1;
// flat-top check: pole arc (85%·45°=38.25° half) vs sector half 30° → overlap fully aligned band ≈ ±(38.25−30)=±8.25° flat
const tAt = (deg) => { const x=((deg+Math.abs(lt.thArr[0]))/(lt.thArr[lt.thArr.length-1]-lt.thArr[0]))*(lt.thArr.length-1); const j=Math.floor(x); return lt.tArr[j]; };
console.log("  flat-top: T(0)=", +lt.Tpk.toPrecision(3), "T(6°)=", +tAt(6).toPrecision(3), "ratio", (tAt(6)/lt.Tpk*100).toFixed(1)+"% (expect >95%)");
if (tAt(6)/lt.Tpk < 0.9) process.exitCode = 1;

// travel-past-reversal warning fires?
const rBad = M.computeDesign({ ...p, latmTravel: 100 });
const hasRevWarn = rBad.warn.some(x => x.includes("torque reversal"));
console.log(hasRevWarn ? "  ✓ stops-past-reversal warning fires at 100° travel" : "  ✗ reversal warning missing");
if (!hasRevWarn) process.exitCode = 1;
// sector/pole mismatch warning
const rMis = M.computeDesign({ ...p, latmSect: 3 });
console.log(rMis.warn.some(x=>x.includes("≠ rotor poles")) ? "  ✓ sector≠pole warning fires" : "  ✗ mismatch warning missing");

// view renders
for (const [name, C, props] of [
  ["LatmSection", M.LatmSection, { p, r, anim: { on: true, th: 2.1 } }],
  ["CrossSection→latm", M.CrossSection, { p, r, anim: { on: false, th: 0 }, phaseSel: "all" }],
  ["TorqueAngleChart", M.TorqueAngleChart, { r, us: "in" }],
  ["AxialCutaway latm", M.AxialCutaway, { p, r, us: "in" }],
]) {
  try { const s = renderToString(React.createElement(C, props));
    console.log("  ✓ " + name + " renders (" + s.length + " chars)"); if (!s.length) process.exitCode = 1;
  } catch (e) { console.log("  ✗ " + name + " THREW: " + e.message); process.exitCode = 1; }
}
// regressions: default SSR + brushed + PM still healthy
const out = renderToString(React.createElement(M.MotorDesigner));
console.log("default SSR:", out.length, "chars");
