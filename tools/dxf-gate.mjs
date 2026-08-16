import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/react/');
const React = require('react');
globalThis.React = require('react');
globalThis.document = { getElementById: () => null, createElement: () => ({ style:{}, getContext: () => null }) };
globalThis.window = { addEventListener: () => {} };
const html = readFileSync('index.html', 'utf8');
const i0 = html.indexOf('<script>/*APP*/') + '<script>/*APP*/'.length;
const i1 = html.indexOf('</script>\n<script>/*BOOT*/');
const app = html.slice(i0, i1).replace(/<\\\/script/g, '</script');
const fn = new Function('React', app + '\nreturn { computeDesign, PRESETS, buildArmDxf, buildLamDxf, parseDxf, analyzeLam };');
const M = fn(React);
const base = JSON.parse(readFileSync('/tmp/_base.json','utf8'));
const pr = { ...base, ...M.PRESETS['Brushed 1.6" · 28 V · SmCo 4-pole'] };
const r = M.computeDesign(pr);
const dxf = M.buildArmDxf(pr, r);
writeFileSync('/tmp/armature.dxf', dxf);
// geometric verification: parse our own DXF back, check radii
const parsed = M.parseDxf(dxf);
const rad = parsed.pts.map(q => Math.hypot(q[0], q[1]));
const rMax = Math.max(...rad);
const shaftR = parsed.circles[0].r;
const prof = rad.filter(x => x > shaftR + 0.5);
const rMin = Math.min(...prof);
console.log('armature DXF: pts', parsed.pts.length, '· circles', parsed.circles.length);
console.log('profile rMax', +rMax.toFixed(3), '(expect armature R', pr.rotorOD/2, ') · rMin', +rMin.toFixed(3),
  '(expect slot bottom ≈', +(pr.rotorOD/2 - pr.tipH - r.hs).toFixed(3), ')');
console.log('shaft bore circle R:', parsed.circles[0].r, '(expect', pr.shaftD/2, ')');
const ok = Math.abs(rMax - pr.rotorOD/2) < 0.01 && Math.abs(rMin - (pr.rotorOD/2 - pr.tipH - r.hs)) < 0.05
  && Math.abs(parsed.circles[0].r - pr.shaftD/2) < 0.001;
console.log(ok ? '✓ armature DXF geometry verified round-trip' : '✗ GEOMETRY MISMATCH');
if (!ok) process.exit(1);
// count slot openings at the surface: points near rMax interrupted Ns times
let gaps = 0, prev = null;
const surf = parsed.pts.map((q,i)=>({a: Math.atan2(q[1],q[0]), r: rad[i]})).filter(q=>q.r > rMax-0.08).map(q=>q.a).sort((a,b)=>a-b);
for (let i = 1; i < surf.length; i++) if (surf[i]-surf[i-1] > 0.11) gaps++;
if (surf[0] + 2*Math.PI - surf[surf.length-1] > 0.11) gaps++;
console.log('surface interruptions (slot openings):', gaps, '(expect', r.Ns, ')');
if (gaps !== r.Ns) process.exit(1);

// ---- v60.5 fillet circularity + left/right symmetry (both laminations) ----
// The v60.5 audit found the stator DXF's LEFT slot fillet translated by one fillet
// radius (a stray "+rc" — the punched corner bulged toward the slot centerline while
// the right corner was true). The old checks only looked at radial extrema, which a
// translated fillet does not move. This asserts the profile is mirror-symmetric about
// each slot centerline, which any translated/chorded fillet breaks.
function slotSymmetry(pts, Ns9, tag) {
  // fold every point into one slot pitch, signed angle from the nearest slot center
  const pitch = (2 * Math.PI) / Ns9;
  // dedupe exact repeated vertices first (arc endpoints are also written as explicit
  // junction points) — duplicates shift the sorted pairing and fake a residual
  const seen = new Set();
  const uniq = pts.filter(([x, y]) => {
    const k9 = x.toFixed(4) + ':' + y.toFixed(4);
    if (seen.has(k9)) return false;
    seen.add(k9); return true;
  });
  const folded = uniq.map(([x, y]) => {
    const a = Math.atan2(y, x), r9 = Math.hypot(x, y);
    let d = ((a % pitch) + pitch) % pitch;
    if (d > pitch / 2) d -= pitch;
    return { d, r: r9 };
  });
  // the profile crosses a given fold angle at MULTIPLE radii (slot wall + tooth surface),
  // so mirror symmetry is a statement about the SET of radii at +d vs -d. Bin |d| and
  // compare the sorted radius lists; a translated fillet shifts one list's entries.
  const BIN = 0.004;
  const bins = new Map();
  for (const q of folded) {
    if (Math.abs(q.d) < 1e-6) continue;
    const key = Math.round(Math.abs(q.d) / BIN);
    if (!bins.has(key)) bins.set(key, { L: [], R: [] });
    bins.get(key)[q.d < 0 ? 'L' : 'R'].push(q.r);
  }
  let worst = 0;
  for (const { L, R } of bins.values()) {
    if (!L.length || !R.length || Math.abs(L.length - R.length) > 1) continue; // sampling edge
    L.sort((a, b) => a - b); R.sort((a, b) => a - b);
    const n = Math.min(L.length, R.length);
    for (let i = 0; i < n; i++) {
      const dr = Math.abs(L[i] - R[i]);
      if (dr > worst) worst = dr;
    }
  }
  console.log(`${tag} slot mirror-symmetry worst residual: ${worst.toFixed(4)} mm (limit 0.03)`);
  return worst < 0.03;
}
const prFil = { ...pr, slotR: 0.5 };                       // force fillets on
const rFil = M.computeDesign(prFil);
const armFil = M.parseDxf(M.buildArmDxf(prFil, rFil));
if (!slotSymmetry(armFil.pts, rFil.Ns, 'armature(slotR=0.5)')) process.exit(1);
const pLam = { ...base, slotR: 0.5, ...M.PRESETS['NEMA 23 · 28 V · trapezoidal 6-step'] };
const rLam = M.computeDesign(pLam);
const lamFil = M.parseDxf(M.buildLamDxf(pLam, rLam));
if (!slotSymmetry(lamFil.pts, rLam.Ns, 'stator(slotR=0.5)')) process.exit(1);
console.log('✓ fillet symmetry verified on both lamination exports');

// ---- v60.6 sloped-wall tangency (Grok) ----
// Mirror symmetry cannot see this: a fillet centered for a VERTICAL wall is still
// symmetric, but leaves a sl·rc jog (~0.13 mm on this trapezoid) where the sloped wall
// meets the arc. Walk slot 0's points in emission order; when the profile leaves the
// left wall line, the first off-wall point may deviate by at most the arc's faceting
// sagitta — a jog fails, a tangent departure passes.
function wallTangency(parsed9, p9, r9, stator9, tag) {
  // builder local frame at slot angle 0: global = [y_local, x_local]. parseDxf samples the
  // reference CIRCLE into pts first and subdivides long segments, so (1) drop circle
  // samples by radius, (2) walk slot 0's left side up to where the bottom span crosses
  // the centerline — the last point ON the wall line is the departure; the next point may
  // deviate by at most the arc's faceting sagitta.
  const rTip = stator9 ? p9.statorID / 2 + p9.tipH : p9.rotorOD / 2 - p9.tipH;
  const rBot = stator9 ? rTip + Math.max(r9.hs, 0) : rTip - Math.max(r9.hs, 0);
  const A = [-r9.w1 / 2, rTip], B = [-r9.w2 / 2, rBot];              // left wall endpoints
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const dWall = (x, y) => Math.abs((B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0])) / len;
  const circR = parsed9.circles.map((c9) => c9.r);
  const prof = parsed9.pts.filter(([gx, gy]) => !circR.some((cr) => Math.abs(Math.hypot(gx, gy) - cr) < 0.05));
  const loc = [];
  for (const [gx, gy] of prof) {                                     // local x = gy, y = gx
    if (gy > 0.05) break;                                            // bottom span crossed the centerline: left side done
    loc.push({ x: gy, y: gx, d: dWall(gy, gx) });
  }
  const rc9 = 0.5;
  const sl9 = Math.abs((r9.w2 - r9.w1) / 2 / Math.max(Math.abs(rBot - rTip), 1e-6));
  const sagMax = rc9 * (1 - Math.cos((Math.PI / 2 + Math.atan(sl9)) / 5)) + 0.02;
  let iLast = -1;
  for (let i = 0; i < loc.length - 1; i++) if (loc[i].d < 0.012) iLast = i;
  const jog = iLast >= 0 && iLast + 1 < loc.length ? loc[iLast + 1].d : NaN;
  console.log(`${tag} wall-to-arc departure: ${Number.isFinite(jog) ? jog.toFixed(4) : 'NaN'} mm (facet limit ${sagMax.toFixed(4)}, ${loc.length} pts walked)`);
  return Number.isFinite(jog) && jog <= sagMax;
}
if (!wallTangency(lamFil, pLam, rLam, true, 'stator(trap slotR=0.5)')) process.exit(1);
if (!wallTangency(armFil, prFil, rFil, false, 'armature(slotR=0.5)')) process.exit(1);
console.log('✓ fillet-to-wall tangency verified on both lamination exports');
