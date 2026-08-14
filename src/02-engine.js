/* MotrWorks module 02 — physics engine: computeDesign (pure function, mm-canonical) */
/* ---- actuator composition: motor result × gear train (+ brake), pure & gate-testable.
   Per-stage efficiencies for the miniature/precision gearhead class this tool targets
   (Maxon/Faulhaber scale catalog data): planetary 90% (GP32-class runs 80–90% single-stage,
   ~70% three-stage; premium needle-bearing versions reach 95%+ — use the override),
   spur 93% (single mesh per stage; e.g. a 141:1 multi-stage spur head lands ~66% overall),
   harmonic 80% at rated load & temperature (catalog band 60–90%; drops at partial load,
   cold, and the highest ratios). Compounded per stage: η_total = η_stage^stages. ---- */
/* ---- gear train synthesis & refinement: from gearhead OD, AGMA quality, pressure angle,
   and planet count, synthesize per-stage tooth counts / module / face width, then derive
   output backlash, mesh-loss efficiency forward & back-driving, and Lewis tooth-yield
   torque limits. Planetary is the deep path; spur is pair-based; harmonic is catalog-level
   (near-zero backlash, ratcheting-limited — stated, not Lewis-computed). ---- */
const AGMA_J = { "Q7": 0.030, "Q9": 0.018, "Q11": 0.010, "Q13": 0.006 };   // backlash allowance factor ·module
// Lewis form factor Y for 20° full-depth (load at tip), interpolated; +0.035 with positive shift
const LEWIS_Y = [[12, 0.245], [15, 0.290], [18, 0.309], [22, 0.331], [26, 0.346], [30, 0.359], [34, 0.371], [45, 0.399], [60, 0.422], [80, 0.435], [100, 0.447], [400, 0.485]];
function yLewis(Z9, shifted) {
  let y9 = LEWIS_Y[0][1];
  for (let i9 = 1; i9 < LEWIS_Y.length; i9++) {
    const [z0, v0] = LEWIS_Y[i9 - 1], [z1, v1] = LEWIS_Y[i9];
    if (Z9 <= z1) { y9 = v0 + ((v1 - v0) * (Z9 - z0)) / (z1 - z0); break; }
    y9 = v1;
  }
  return y9 + (shifted ? 0.035 : 0);
}
const KGAMMA = { 2: 1.10, 3: 1.15, 4: 1.25, 5: 1.35, 6: 1.45 };   // planet load-share (no floating sun)
function kvDyn(vMs, agmaQ9) {                                     // AGMA-style dynamic factor
  if (!(vMs > 0)) return 1;
  const Qv = agmaQ9 === "Q7" ? 7 : agmaQ9 === "Q11" ? 11 : agmaQ9 === "Q13" ? 11.5 : 9;
  const B9 = 0.25 * Math.pow(12 - Math.min(Qv, 11), 2 / 3);
  const A9 = 50 + 56 * (1 - B9);
  return Math.pow((A9 + Math.sqrt(200 * vMs)) / A9, B9);
}
// Harmonic sizes in the industry catalog convention (CSF/CSG-class). Numbers are CLASS
// APPROXIMATIONS for envelope + limit sanity: od/len mm, rated & momentary-peak N·m
// (ratcheting limit) at mid ratios. Replace with the exact datasheet row when chosen.
const HARMONIC_SIZES = {
  8:  { od: 31,  len: 20, ratios: [30, 50, 100],                rated: 0.9,  peak: 3.3 },
  11: { od: 40,  len: 24, ratios: [30, 50, 100],                rated: 3.5,  peak: 8.3 },
  14: { od: 50,  len: 28, ratios: [30, 50, 80, 100],            rated: 7.8,  peak: 28 },
  17: { od: 60,  len: 32, ratios: [30, 50, 80, 100, 120],       rated: 16,   peak: 56 },
  20: { od: 70,  len: 36, ratios: [30, 50, 80, 100, 120, 160],  rated: 25,   peak: 82 },
  25: { od: 85,  len: 42, ratios: [30, 50, 80, 100, 120, 160],  rated: 63,   peak: 157 },
  32: { od: 110, len: 50, ratios: [30, 50, 80, 100, 120, 160],  rated: 118,  peak: 281 },
  40: { od: 135, len: 60, ratios: [30, 50, 80, 100, 120, 160],  rated: 206,  peak: 402 },
};
function harmonicSizeUp(minOD) {                                   // smallest catalog size that swallows the motor
  for (const sz of Object.keys(HARMONIC_SIZES)) if (HARMONIC_SIZES[sz].od >= minOD * 0.98) return +sz;
  return 40;
}
/* auto gearhead length, built UP from what the stages actually need (face + carrier +
   clearance) plus real bearing width, faceplate, and interface - replaces the old
   proportional 0.42·OD/stage rule that ballooned at large OD. Harmonic comes straight
   from the catalog size table: a set size that drops in with no wasted space. */
function gearheadAutoLen(type9, st9, gOD9, brg9) {
  const brgW = (brg9 === "acpair" ? 2.1 : brg9 === "double" ? 1.9 : 1.0) * 1.25 * Math.max(0.138 * gOD9, 4); // +seal & retainer
  const face9 = Math.max(0.07 * gOD9, 2) + 2.5;                    // faceplate + rear interface
  if (type9 === "Harmonic") {
    const hs = HARMONIC_SIZES[harmonicSizeFor(gOD9)];
    return hs.len + brgW + face9;
  }
  const mEst = (0.8 * gOD9) / 72;                                  // typical ring 72t at 0.8·OD pitch
  const F9 = Math.min(8 * mEst, 0.3 * gOD9);
  const perSt = (type9 === "Spur" ? 1.35 : 1.5) * F9 + 3.7;        // face + carrier/web + clearance + retention hardware
  return st9 * perSt + brgW + face9 + 8;                           // +8 mm motor adapter/interface (GP-class anchored)
}
function harmonicSizeFor(gOD) {
  let pick = 8;
  for (const sz of Object.keys(HARMONIC_SIZES)) if (HARMONIC_SIZES[sz].od <= gOD * 1.02) pick = +sz;
  return pick;
}
const GEAR_MODS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0];
function designGearTrain(p, act, gODin, gLenIn) {
  const type = act.type, st = Math.max(act.st, 1);
  const uTarget = Math.pow(act.N, 1 / st);
  const gOD = gODin > 0 ? gODin : 40;
  const brgF = Math.max((act.brg === "acpair" ? 0.29 : act.brg === "double" ? 0.26 : 0.138), 4 / Math.max(gOD, 10)); // real bearing width / OD
  const gLen = gLenIn > 0 ? gLenIn : gearheadAutoLen(type, st, gOD, act.brg);
  const Fcap = Math.max(0.62 * (gLen - brgF * gOD) / st, 1);     // axial budget per stage for the gear face
  const nP = Math.max(Math.round(p.nPlanets) || 3, 2);
  const jQ = AGMA_J[p.agmaQ] ?? AGMA_J["Q9"];
  const pa = (Math.max(p.presAng || 20, 14.5) * Math.PI) / 180;
  const mu = 0.06;                                                   // lubricated steel sliding
  // v58.4: tooth-bending allowable from the selected gear material/hardness condition
  // (was hardcoded 380 MPa case-hardened). Governs the Lewis torque cap below.
  const gmat = GEAR_MATS[p.gbMat] || GEAR_MATS[GEAR_MAT_DEF];
  const sigAllow = gmat.sig;
  const Y9 = 0.308;                                                  // Lewis form, ~18–30 t @20°
  const stages = [], w = [];
  let effF = 1, effB = 1, blOut = 0, TmaxOut = Infinity, limStage = 0;
  const ratios = [];
  if (type === "Planetary") {
    // per-stage synthesis: ratio u = 1 + Zr/Zs; Zr = Zs + 2·Zp; assembly (Zs+Zr) % nP = 0
    for (let i9 = 0; i9 < st; i9++) {
      let best = null;
      for (let Zs = 14; Zs <= 48; Zs++) {
        const Zp = Math.round((Zs * (uTarget - 2)) / 2);
        if (Zp < 12) continue;
        const Zr = Zs + 2 * Zp;
        if ((Zs + Zr) % nP !== 0) continue;
        // adjacent planets must clear: pin chord > planet tip dia (+0.5 m margin)
        if ((Zs + Zp) * Math.sin(Math.PI / nP) < Zp + 2.5) continue;
        const u9 = 1 + Zr / Zs;
        const err9 = Math.abs(u9 - uTarget) / uTarget;
        if (!best || err9 < best.err9) best = { Zs, Zp, Zr, u9, err9 };
      }
      if (!best) { w.push(`Stage ${i9 + 1}: no planetary tooth set meets ratio ${uTarget.toFixed(2)} with ${nP} planets — adjust ratio, stages, or planet count.`); best = { Zs: 18, Zp: 27, Zr: 72, u9: 5, err9: 1 }; }
      if (best.err9 > 0.06) w.push(`Stage ${i9 + 1}: nearest tooth set gives ${best.u9.toFixed(2)}:1 vs ${uTarget.toFixed(2)} target (${(best.err9 * 100).toFixed(1)}% off) — total ratio shifts accordingly.`);
      const ringPD = 0.80 * gOD;                                     // ring pitch Ø inside the housing wall
      let m9 = ringPD / best.Zr;
      m9 = GEAR_MODS.reduce((a9, b9) => (b9 <= m9 * 1.02 ? b9 : a9), GEAR_MODS[0]);
      const F9 = +(Math.min(8 * m9, 0.30 * gOD, Fcap)).toFixed(1);   // face: 8·m typical, housed, LENGTH-capped
      if (Fcap < Math.min(8 * m9, 0.30 * gOD) - 0.05 && i9 === 0)
        w.push(`Gearhead length ${gLen.toFixed(0)} mm limits gear face to ${F9} mm/stage (vs ${Math.min(8 * m9, 0.3 * gOD).toFixed(1)} unconstrained) \u2014 the tooth-yield torque cap shrinks with it.`);
      // backlash at the carrier: ring–planet mesh acts directly; sun–planet reflects
      // down by the stage ratio (the old ×2 overstated the gear contribution)
      const jmm = m9 * (0.035 + jQ);
      const bl9 = ((jmm / (best.Zr * m9 / 2) + jmm / (best.Zs * m9 / 2) / best.u9) * (10800 / Math.PI));
      // efficiency: external sun–planet + internal planet–ring mesh sliding + miniature drag
      const Lext = 2.3 * mu * (1 / best.Zs + 1 / best.Zp);
      const Lint = 2.3 * mu * Math.abs(1 / best.Zp - 1 / best.Zr);
      const sizeF = Math.pow(30 / Math.max(gOD, 10), 0.35);
      const Lchurn = 0.058 * sizeF;                                  // grease churning, per stage (2-stage anchored to 0.9²)
      const Lseal = i9 === st - 1 ? 0.045 * sizeF : 0;               // ONE output seal, output stage
      const ef9 = Math.max(1 - Lext - Lint - Lchurn - Lseal, 0.5);
      const eb9 = Math.max(2 - 1 / ef9, 0.01);                       // torque-proportional losses reversed
      if (best.Zs < 17) w.push(`Stage ${i9 + 1}: ${best.Zs}-tooth sun needs positive profile shift to avoid undercut at ${p.presAng || 20}° — standard practice, note on the gear drawing.`);
      stages.push({ i: i9 + 1, Zs: best.Zs, Zp: best.Zp, Zr: best.Zr, u: best.u9, m: m9, shift: best.Zs < 17,
        a: +((best.Zs + best.Zp) * m9 / 2).toFixed(2), pinBC: +((best.Zs + best.Zp) * m9).toFixed(2),
        PDs: +(best.Zs * m9).toFixed(2), PDp: +(best.Zp * m9).toFixed(2), PDr: +(best.Zr * m9).toFixed(2),
        F: F9, bl: bl9, ef: ef9, eb: eb9, mesh: Lext + Lint, drag: Lchurn + Lseal });
      ratios.push(best.u9);
    }
  } else if (type === "Spur") {
    // cluster ladder with STEPPED modules: stage i carries u^i more torque, so modules
    // scale ~ sqrt(torque) for balanced bending stress; the whole ladder of center
    // distances still spans the housing diameter (input axis offset to the wall)
    const Z1 = 12;                                                  // cluster practice: small shifted pinions
    const Z2 = Math.max(Math.round(Z1 * uTarget), Z1 + 3);
    w.push("12-tooth pinions need positive profile shift (standard cluster practice) \u2014 note on the gear drawings.");
    const wgt = Array.from({ length: st }, (_, i9) => Math.pow(uTarget, i9 / 2));
    const ladderW = wgt.reduce((a9, b9) => a9 + b9, 0) * (Z1 + Z2) / 2 + wgt[0] * Z1 / 2 + wgt[st - 1] * Z2 / 2;
    const mBase = (0.86 * gOD) / ladderW;
    let yAx = 0;
    for (let i9 = 0; i9 < st; i9++) {
      const mRaw = mBase * wgt[i9];
      const m9 = GEAR_MODS.reduce((a9, b9) => (b9 <= mRaw * 1.02 ? b9 : a9), GEAR_MODS[0]);
      const u9 = Z2 / Z1;
      const F9 = +(Math.min(9 * m9, 0.3 * gOD, Fcap)).toFixed(1);
      const a9m = +((Z1 + Z2) * m9 / 2).toFixed(2);
      const jmm = m9 * (0.035 + jQ);
      const bl9 = ((jmm / (Z2 * m9 / 2)) * (10800 / Math.PI));
      const Lm = 2.3 * mu * (1 / Z1 + 1 / Z2);
      const sizeF = Math.pow(30 / Math.max(gOD, 10), 0.35);
      const ef9 = Math.max(1 - Lm - 0.024 * sizeF - (i9 === st - 1 ? 0.03 * sizeF : 0), 0.5), eb9 = Math.max(2 - 1 / ef9, 0.01);
      stages.push({ i: i9 + 1, Z1, Z2, u: u9, m: m9, PD1: +(Z1 * m9).toFixed(2), PD2: +(Z2 * m9).toFixed(2),
        a: a9m, yAx: +(yAx).toFixed(2), F: F9, bl: bl9, ef: ef9, eb: eb9, mesh: Lm, drag: 1 - ef9 - Lm });
      yAx += a9m;
      ratios.push(u9);
    }
    const span9 = (stages[0].PD1) / 2 + yAx + (stages[st - 1].PD2) / 2;
    if (span9 > 0.92 * gOD) w.push(`Spur ladder span ${span9.toFixed(1)} mm exceeds the \u00d8${gOD.toFixed(0)} housing (input axis offset to the wall) \u2014 fewer stages, lower per-stage ratio, or a bigger gearhead.`);
  } else {                                                            // Harmonic: size-based, catalog convention
    if (st > 1) w.push("Harmonic units are single-stage components \u2014 modeling 1 stage (compound harmonic trains are exotic).");
    const sz = harmonicSizeFor(gOD);
    const hs = HARMONIC_SIZES[sz];
    if (hs.od > gOD + 0.5) w.push(`Smallest harmonic size (8, \u00d831 mm) exceeds the \u00d8${gOD.toFixed(0)} mm envelope \u2014 treat this as a floor.`);
    let Nh = hs.ratios.reduce((a9, b9) => Math.abs(b9 - act.N) < Math.abs(a9 - act.N) ? b9 : a9, hs.ratios[0]);
    if (Math.abs(Nh - act.N) > 0.5) w.push(`Size ${sz} offers ${hs.ratios.join('/')}:1 \u2014 snapped ${act.N}:1 to ${Nh}:1 (catalog ratios are fixed per size).`);
    const Zf = 2 * Nh, Zc = Zf + 2;
    const efH = Math.min(Math.max(0.85 - 0.0006 * Nh, 0.60), 0.84); // rated, warm; falls with ratio (catalog trend)
    const ebH = Math.max(2 - 1 / efH, 0.01);
    stages.push({ i: 1, Zf, Zc, u: Nh, m: +(Math.PI * 0.72 * hs.od / Zf / Math.PI).toFixed(3), F: +(0.22 * hs.od).toFixed(1),
      bl: 0.7, ef: efH, eb: ebH, mesh: 0.12, drag: 1 - efH - 0.12, harmonic: true, size: sz, hsOD: hs.od, hsLen: hs.len,
      rated: hs.rated, ratchet: hs.peak });
    ratios.push(Nh);
    TmaxOut = hs.peak; limStage = 0;                               // ratcheting, not Lewis \u2014 flagged in UI
    w.push(`Size ${sz} class limits: rated ${hs.rated} N\u00b7m, momentary peak (ratcheting) ${hs.peak} N\u00b7m; \u03b7 ${Math.round(efH * 100)}% at rated load, warm \u2014 drops sharply at partial load and cold. CSF-class approximations, replace with the datasheet row.`);
  }
  // compose: backlash reflected by downstream ratio; efficiencies compound
  const Ntot = ratios.reduce((a9, b9) => a9 * b9, 1);
  for (let i9 = 0; i9 < stages.length; i9++) {
    const dsRatio = ratios.slice(i9 + 1).reduce((a9, b9) => a9 * b9, 1);
    blOut += stages[i9].bl / dsRatio;
    effF *= stages[i9].ef; effB *= stages[i9].eb;
  }
  const blGear = blOut;
  // mechanical clearances at the output (bearing play, planet-pin fits, spline/key lash) -
  // ESTIMATED, output-referred, once; these dominate gear-mesh lash in miniature units.
  const blMech = type === "Harmonic" ? 0.5
    : 11 * Math.pow(32 / Math.max(gOD, 10), 0.25) + (act.brg === "acpair" ? 2 : act.brg === "double" ? 4 : 7);
  blOut += blMech;
  // Lewis tooth-yield: per stage, tangential load at its input mesh vs allowable → output torque cap
  const rpmMotor = act.noLoad > 0 && act.N > 0 ? act.noLoad * act.N : 0;   // input shaft speed if known
  let KvMax = 1;
  if (type !== "Harmonic") for (let i9 = 0; i9 < stages.length; i9++) {
    const s9 = stages[i9];
    const usRatio = ratios.slice(0, i9).reduce((a9, b9) => a9 * b9, 1);   // motor → this stage input
    const dsRatio = ratios.slice(i9).reduce((a9, b9) => a9 * b9, 1);      // this stage input → output
    const nIn = rpmMotor / usRatio;
    const PDin = type === "Planetary" ? s9.PDs : s9.PD1;
    const vMs = (Math.PI * PDin * nIn) / 60000;                           // pitch-line velocity, m/s
    const Kv9 = kvDyn(vMs, p.agmaQ);
    if (Kv9 > KvMax) KvMax = Kv9;
    let WtAllow, share;
    if (type === "Planetary") {
      const Ysun = yLewis(s9.Zs, s9.shift);
      const Ypl = 0.7 * yLewis(s9.Zp, false);                             // idler: fully reversed bending
      WtAllow = sigAllow * s9.m * s9.F * Math.min(Ysun, Ypl);             // weakest tooth in the mesh
      share = nP / (KGAMMA[nP] || 1.2);                                   // effective planets after load share
      s9.limTooth = Ysun <= Ypl ? "sun" : "planet";
    } else {
      WtAllow = sigAllow * s9.m * s9.F * Math.min(yLewis(s9.Z1, true), yLewis(s9.Z2, false));
      share = 1;
      s9.limTooth = "pinion";
    }
    const TinAllow = ((WtAllow / Kv9) * share * (PDin / 2000));           // N·m at this stage's input
    const ToutCap = TinAllow * dsRatio * effF;
    if (ToutCap < TmaxOut) { TmaxOut = ToutCap; limStage = s9.i; }
  }
  const selfLock = effB <= 0.02;
  // back-drive breakaway at the output: seal + grease drag as absolute torque (est.,
  // OD^2.5 scaling anchored to miniature catalog no-load friction); harmonics need ~4x (preload)
  const Tbd = (0.004 + 0.002 * st) * Math.pow(gOD / 30, 2.5) * (type === "Harmonic" ? 4 : 1);
  // stage recommendation: planetary practical window 3-10:1/stage, spur 1.5-6, harmonic 30-160
  const win = type === "Planetary" ? [3, 10] : type === "Spur" ? [1.5, 6] : [30, 160];
  let recSt = st;
  for (let s9 = 1; s9 <= 4; s9++) { const u9 = Math.pow(act.N, 1 / s9); recSt = s9; if (u9 >= win[0] && u9 <= win[1]) break; }
  if (uTarget > win[1] * 1.02) w.push(`Per-stage ratio ${uTarget.toFixed(1)}:1 exceeds the ${type.toLowerCase()} practical window (${win[0]}\u2013${win[1]}:1) \u2014 recommend ${recSt} stage${recSt > 1 ? "s" : ""} for ${act.N}:1 (${Math.pow(act.N, 1 / recSt).toFixed(2)}:1 each).`);
  else if (uTarget < win[0] * 0.98 && st > 1) w.push(`Per-stage ratio ${uTarget.toFixed(2)}:1 is below the practical window \u2014 ${recSt} stage${recSt > 1 ? "s" : ""} would suffice for ${act.N}:1.`);
  const stOk = uTarget >= win[0] * 0.98 && uTarget <= win[1] * 1.02;
  return { type, st, nP, stages, Ntot, effF, effB, selfLock, blOut, blGear, blMech, Tbd, KvMax, TmaxOut, limStage, w, recSt, win, stOk, gLen, brgF,
    agmaQ: p.agmaQ || "Q9", presAng: p.presAng || 20, gOD,
    gbMat: GEAR_MATS[p.gbMat] ? p.gbMat : GEAR_MAT_DEF, sigAllow, gbMatNote: gmat.note };
}

function composeActuator(mr, br, cfg) {
  const w = [];
  const type9 = ["Planetary", "Harmonic", "Spur"].includes(cfg.type) ? cfg.type : "Planetary";
  const N = Math.max(Number.isFinite(cfg.ratio) ? cfg.ratio : 1, 1), st = Math.max(Math.round(cfg.stages) || 1, 1); // Math.max(NaN,1) is NaN — a NaN ratio would silently NaN every output
  const ETA_STAGE = { Planetary: 0.90, Spur: 0.93, Harmonic: 0.80 };
  const etaStage = ETA_STAGE[type9];
  const eta = cfg.effOv > 0 ? Math.min(cfg.effOv, 100) / 100 : Math.pow(etaStage, st);
  const spr = Math.pow(N, 1 / st);
  const win = { Planetary: [3, 10], Spur: [1.5, 6], Harmonic: [30, 160] }[type9];
  if (type9 === "Harmonic" && st > 1) w.push("Harmonic stages are almost always single — cascading flexsplines is unusual; check availability.");
  if (spr < win[0] * 0.999 || spr > win[1] * 1.001)
    w.push(`Per-stage ratio ${spr.toFixed(1)}:1 is outside the typical ${type9.toLowerCase()} window (${win[0]}\u2013${win[1]}:1) — ${spr > win[1] ? "add a stage" : "drop a stage"} or change type.`);
  if (!mr || mr.err.length) return { fail: "The source motor design has errors — fix it in its tab first.", warn: w };
  if (!mr.curve || !mr.curve.length || !(mr.Kt > 0)) return { fail: "The source motor has no torque-speed curve to compose — fix the design in its tab.", warn: w };
  const curve = mr.curve.map((c) => ({ n: c.n / N, T: c.T * N * eta }));
  if (mr.step && Number.isFinite(mr.step.nRes))
    w.push(`Stepper source: quasi-static pull-out bound — avoid sustained output speeds near ${(mr.step.nRes / N).toFixed(1)} rpm (mid-band resonance at the motor).`);
  const iAtOut = (Tout) => Tout / (N * eta) / mr.Kt;                 // motor amps for an output torque (pre-saturation)
  const hold = br && br.brake && Number.isFinite(br.brake.Thold) ? br.brake.Thold * N : null; // static: ratio only (friction aids holding)
  if (br && br.err && br.err.length) w.push("The brake design in its tab has errors — holding torque not composed.");
  const etaBack = Math.max(2 - 1 / eta, 0);                          // first-order back-drive efficiency
  const selfLock = etaBack <= 0.02 || type9 === "Harmonic" && N >= 80;
  return { N, st, spr, eta, etaStage, type: type9, brg: cfg.brg || "radial", curve,
    noLoad: mr.noLoad / N,
    op: mr.op ? { n: mr.op.n / N, T: mr.op.T * N * eta } : null,
    peakT: (mr.peakT || 0) * N * eta,
    Tcont: mr.therm && Number.isFinite(mr.therm.Tcont) ? mr.therm.Tcont * N * eta : null,
    hold: hold !== null && br && br.err && br.err.length ? null : hold,
    iAtOut, etaBack, selfLock, warn: w };
}

/* ---- winding-arbor tooling calculator: coil dimensions from the arbor & channel, wire/turns
   capacity, resistance & copper, and fill verified against ONLY what the stator drawing says —
   no rotor, no performance. Strand bundle treated as dEff = dIns·√strands (disclosed). ---- */
/* ---- inverse winding solve: known stator drawing + winding spec → required arbor Ø, channel
   dims, and tool constants. Square-ish bundle lay; the resistance target is entered as the
   L-L (phase-to-phase) value at 20 °C — converted through the connection and the series
   string (coils per phase) with the estimated jumper copper included. Flange thickness and
   inter-coil jumper allowance are estimated from the lamination and winding scheme rather
   than entered. ---- */
function solveBobbin(p) {
  // err/warn channel matching computeBobbin's — bad input names itself instead of
  // returning a silent page of NaN diameters (the UI already knows how to render these)
  const err = [], warn = [];
  {
    const bad = ["turns", "awg", "statorOD", "statorID", "stackL", "toothW", "yoke", "tipH"]
      .filter((k9) => !Number.isFinite(p[k9]));
    if (bad.length) err.push("Non-numeric input: " + bad.join(", ") + " — the solve is meaningless until these are fixed.");
  }
  const dBare = awgBareDia(p.awg);
  const dIns = awgInsDia(dBare, p.insBuild);
  const st = Math.max(Math.round(p.strands) || 1, 1);
  const dEff = dIns * Math.sqrt(st);
  const aBare = (Math.PI / 4) * dBare * dBare;
  const N = Math.max(Math.round(p.turns), 1);
  const nC = Math.max(Math.round(p.wbCoils) || 1, 1);                // coils per phase = the sequential string
  const tpl = Math.max(Math.ceil(Math.sqrt(N)), 1);                  // square bundle in turns
  const layers = Math.ceil(N / tpl);
  const wild = (p.wbLay || "wild") !== "precise";
  const chW = +((tpl * dEff) / 0.98 + 0.1).toFixed(2);
  // v58.5: wild multi-strand hand winding settles the strands INDIVIDUALLY, not as round bundles —
  // bench (4-coil stick, 43t AWG 27×2): measured build implies individual-wire near-hex packing,
  // 2.9 mm vs the bundle model's 4.4 mm. Single-point calibrated ×1.04 scramble allowance.
  const buildOf = (chW9) => {
    if (wild && st > 1) {
      const tplW = Math.max(Math.floor((0.98 * chW9) / dIns), 1);
      const Lw = Math.ceil((N * st) / tplW);
      return dIns * (1 + (Lw - 1) * 0.866) * 1.04;
    }
    const tpl9 = Math.max(Math.floor((0.98 * chW9) / dEff), 1);
    const L9 = Math.ceil(N / tpl9);
    return wild ? (L9 <= 1 ? dEff : dEff * L9 * 1.08) : dEff * (1 + (L9 - 1) * 0.866);
  };
  const build = buildOf(chW);
  const chH = +(dEff * layers * (wild ? 1.08 : 1) * 1.12 + 0.2).toFixed(2); // clears the crossover worst
  // lamination-derived tool constants
  const Ns = Math.max(Math.round(p.slots), 3);
  const hs9 = Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0);
  const d1 = p.statorID + 2 * p.tipH, dm = p.statorID + 2 * (p.tipH + hs9 / 2); // mean slot diameter
  // same-phase coils land every Ns/nC slots — jumper spans that arc at the mean slot Ø, + lay slack
  const jumpEst = Math.max(Math.round((Math.PI * dm) / nC * 1.25), 5);
  const flgEst = +Math.min(Math.max(0.25 * chW, 0.8), 3).toFixed(1); // stiffness vs channel width
  const DaIns = +(d1).toFixed(2);
  // coil-head estimate (same scheme model as the verifier) and the perimeter the coil must measure
  const wmS = ((Math.PI * d1) / Ns - p.toothW + (Math.PI * (dm + hs9)) / Ns - p.toothW) / 2;
  const headAuto9 = (p.wbStyle || "tooth") === "lap"
    ? 1.25 * (Math.max(p.wbThrow, 1) * Math.PI * dm) / Ns
    : p.toothW + 0.8 * Math.max(wmS, 0) + 3;
  const LheadEnt = p.wbHead > 0 ? p.wbHead : +headAuto9.toFixed(1);
  // reach floor: a lap head must physically traverse the throw span — wire length per end can't be
  // shorter than the span arc, whatever is typed. An under-entry is RAISED to the floor (and flagged),
  // so throw is always monotone in perimeter → arbor → real R, matching shop reality.
  const spanArc9 = (p.wbStyle || "tooth") === "lap" ? (Math.max(p.wbThrow, 1) * Math.PI * dm) / Ns : 0;
  const reachShort = p.wbHead > 0 && spanArc9 > 0 && p.wbHead < spanArc9;
  const Lhead = reachShort ? +spanArc9.toFixed(1) : LheadEnt;
  // stack skew: the coil's in-slot legs run the skewed slot's diagonal, so the straight
  // length the tool must produce grows by hypot(stack, skew arc at mean slot Ø)/stack
  const skewB9 = Math.max(Number.isFinite(p.skew) ? p.skew : 0, 0);
  const stkStr9 = Number.isFinite(p.stackL) ? Math.max(p.stackL, 1) : 1;
  const slantB9 = skewB9 > 0 ? Math.hypot(stkStr9, (Math.PI * dm * skewB9) / 360) / stkStr9 : 1;
  const perim = 2 * stkStr9 * slantB9 + 2 * Lhead;
  const DaGeo = +((perim / Math.PI) - build).toFixed(2);             // arbor that yields exactly stack + heads
  let Da = Math.max(DaGeo, DaIns), RcT = 0, DaR = 0;
  let basis = DaGeo >= DaIns ? "stator geometry (2\u00b7stack + 2\u00b7heads)" : "insertion rule (geometry coil would be under the tips)";
  // bench calibration: measured string R on the CURRENT tool vs prediction → per-shop wind factor,
  // scales the MLT the target-R budget buys so solved diameters track your actual coils
  let kRw = 1;
  if (p.wbMR > 0 && p.wbArborD > 0) {
    const cb9 = computeBobbin(p);
    const pred9 = cb9.R20s * cb9.RhotF(Number.isFinite(p.wbMRTemp) ? p.wbMRTemp : 20);
    if (pred9 > 0) kRw = p.wbMR / pred9;
  }
  const Rjump = (RHO_CU * ((nC + 1) * jumpEst / 1000) * 1e6) / (aBare * st);
  if (p.wbRt > 0) {
    const Rph = p.conn === "delta" ? p.wbRt * 1.5 : p.wbRt / 2;      // L-L → per phase
    RcT = Math.max((Rph - kRw * Rjump) / nC, 1e-6);                  // per-coil budget after jumper copper
    const MLTmm = (RcT * aBare * st) / (RHO_CU * 1e3 * N) / kRw;     // mean turn the budget buys (cal-scaled)
    DaR = +(MLTmm / Math.PI - build).toFixed(2);
    // v58.5: the target-R arbor no longer OVERWRITES the geometry/insertion arbors (that made coil-head
    // edits inert with a target set). Target R is a starting point — the largest requirement governs,
    // and head iteration moves the real R away from target, reported below.
    Da = +Math.max(DaR, DaGeo, DaIns).toFixed(2);
    basis = Da <= DaR + 0.005
      ? `target R (${p.conn === "delta" ? "delta" : "wye"} L-L \u2192 ${RcT.toFixed(3)} \u03a9/coil)`
      : (DaGeo >= DaIns
        ? "stator geometry (2\u00b7stack + 2\u00b7heads) \u2014 needs more than the target-R arbor; real R runs above target"
        : "insertion rule \u2014 needs more than the target-R arbor; real R runs above target");
  }
  // real resistance at the solved arbor (cal-compensated) — this is what head iteration moves
  const MLTre = Math.PI * (Da + build);
  const RcReal = kRw * (RHO_CU * ((MLTre * N) / 1000) * 1e6) / (aBare * st);
  const RphReal = nC * RcReal + kRw * Rjump;
  const RllReal = p.conn === "delta" ? (2 / 3) * RphReal : 2 * RphReal;
  const throwArc = p.wbStyle === "lap" ? +((Math.max(p.wbThrow, 1) * Math.PI * d1) / Ns).toFixed(1) : 0;
  const perStrand9 = wild && st > 1;
  const tplW9s = perStrand9 ? Math.max(Math.floor((0.98 * chW) / dIns), 1) : 0;
  return { Da, DaIns, DaGeo, DaR, Lhead, perim, chW, chH, tpl, layers, build: +build.toFixed(2), basis,
    jumpEst, flgEst, RcT, Rjump, throwArc, kRw, RcReal, RphReal, RllReal,
    spanArc: +spanArc9.toFixed(1), reachShort, LheadEnt, headAuto: +headAuto9.toFixed(1),
    perStrand: perStrand9, tplW: tplW9s, LwW: perStrand9 ? Math.ceil((N * st) / tplW9s) : 0,
    skewSlant: slantB9, err, warn };
}

function computeBobbin(p) {
  const w = [], err = [];
  const dBare = awgBareDia(p.awg);
  const dIns = awgInsDia(dBare, p.insBuild);
  const st = Math.max(Math.round(p.strands) || 1, 1);
  const dEff = dIns * Math.sqrt(st);                                 // strand bundle effective diameter
  const arbor = Math.max(p.wbArborD, 1), chW = Math.max(p.wbChanW, dEff), chH = Math.max(p.wbChanH, 0.2);
  const nC = Math.max(Math.round(p.wbCoils) || 1, 1), flg = Math.max(p.wbFlange, 0.3);
  const tpl = Math.max(Math.floor((0.98 * chW) / dEff), 1);          // turns per layer across the channel
  const layers = Math.ceil(p.turns / tpl);
  const wild = (p.wbLay || "wild") !== "precise";                    // shop default: wild wind for insertion
  // lay model — precise (machine lay): bundles nest at 0.866. Wild multi-strand (hand wind): the
  // strands settle INDIVIDUALLY, not as round bundles — bench-validated on a 4-coil stick
  // (43t AWG 27×2: measured build ≈ individual-wire hex packing, ×1.04 scramble allowance; the
  // bundle model overstated build 4.4 vs 2.9 mm and string R by +3%). Wild single-strand keeps
  // the crossover-stacking model.
  const perStrand = wild && st > 1;
  const tplW9 = Math.max(Math.floor((0.98 * chW) / dIns), 1);        // wires per layer, individual lay
  const LwW9 = Math.ceil((p.turns * st) / tplW9);
  const build = perStrand
    ? dIns * (1 + (LwW9 - 1) * 0.866) * 1.04
    : wild
      ? (layers <= 1 ? dEff : dEff * layers * 1.08)
      : dEff * (1 + (layers - 1) * 0.866);
  const buildX = perStrand ? build * 1.06 : dEff * layers * (wild ? 1.08 : 1); // crossover worst case
  const coilOD = arbor + 2 * build;
  const capCh = perStrand
    ? Math.max(Math.floor((tplW9 * Math.max(Math.floor((0.98 * chH) / (dIns * 0.9)), 1)) / st), 1)
    : Math.max(Math.floor(tpl * Math.max(Math.floor((0.98 * chH) / (dEff * 0.866) - 0.15), 1) * (wild ? 0.8 : 1)), 1); // channel capacity
  if (Math.max(build, buildX) > chH) w.push(`Winding build ${Math.max(build, buildX).toFixed(2)} mm (${wild ? "wild wind" : "crossover worst"}) overtops the ${chH} mm flange — wire will not stay in the channel. Fewer turns, finer wire, or a taller flange.`);
  else if (build > 0.9 * chH) w.push(`Build ${build.toFixed(2)} mm is within 10% of the ${chH} mm flange — no margin for lay error.`);
  if (p.turns > capCh) w.push(`Channel holds ~${capCh} turns of this bundle (${tpl}/layer) — asked ${p.turns}.`);
  // coil heads: what the wire does beyond the stack at each end, per the winding scheme
  const NsH = Math.max(Math.round(p.slots), 3);
  const hsH = Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0);
  const dmH = p.statorID + 2 * (p.tipH + hsH / 2);                   // mean slot diameter
  const wmH = ((Math.PI * (p.statorID + 2 * p.tipH)) / NsH - p.toothW + (Math.PI * (dmH + hsH)) / NsH - p.toothW) / 2;
  const headAuto = (p.wbStyle || "tooth") === "lap"
    ? 1.25 * (Math.max(p.wbThrow, 1) * Math.PI * dmH) / NsH          // diamond head over the throw arc
    : p.toothW + 0.8 * Math.max(wmH, 0) + 3;                        // around one tooth + bend radii
  const spanArcH = (p.wbStyle || "tooth") === "lap" ? (Math.max(p.wbThrow, 1) * Math.PI * dmH) / NsH : 0;
  const LheadEnt = p.wbHead > 0 ? p.wbHead : +headAuto.toFixed(1);
  const Lhead = p.wbHead > 0 && spanArcH > 0 && LheadEnt < spanArcH ? +spanArcH.toFixed(1) : LheadEnt; // reach floor: head wire can't be shorter than the span it crosses
  if (Lhead !== LheadEnt)
    w.push(`Entered coil head ${(p.wbHead).toFixed(1)} mm/end is shorter than the throw-${Math.max(p.wbThrow, 1)} span arc — the head can't reach the return slot, so it's been RAISED to the ${spanArcH.toFixed(1)} mm reach floor for the fit numbers. Scheme auto suggests ${headAuto.toFixed(1)} mm/end (1.25×span); clear the override (0) for throw-driven heads.`);
  const LheadAuto = +headAuto.toFixed(1);
  const stk9 = Number.isFinite(p.stackL) ? Math.max(p.stackL, 1) : 1;
  // stack skew: the in-slot legs must cover the skewed slot's DIAGONAL, not the straight stack
  const skewB = Math.max(Number.isFinite(p.skew) ? p.skew : 0, 0);
  const slantB = skewB > 0 ? Math.hypot(stk9, (Math.PI * dmH * skewB) / 360) / stk9 : 1;
  const stkReq = +(stk9 * slantB).toFixed(2);                        // straight length each coil side must provide
  const skewNote = skewB > 0 ? ` (${skewB}° skew diagonal of the ${stk9} mm stack)` : "";
  const perim = 2 * stkReq + 2 * Lhead;                              // what the inserted coil must measure
  // wire & resistance (per coil and the sequential string with inter-coil jumpers)
  const MLTb = Math.PI * (arbor + build);                            // mean turn as wound on this arbor, mm
  const stackFit = MLTb / 2 - Lhead;                                 // straight length the wound coil offers per side
  if (Number.isFinite(p.stackL) && stackFit < stkReq - 0.5)
    w.push(`Wound coil offers ${stackFit.toFixed(1)} mm straight per side vs the ${stkReq} mm required${skewNote} (heads ${Lhead} mm/end) — arbor too small; grow it to \u2265 \u00d8${((perim / Math.PI) - build).toFixed(1)} mm.`);
  else if (Number.isFinite(p.stackL) && stackFit > stkReq + Math.max(6, 0.15 * stkReq))
    w.push(`Wound coil is ${(stackFit - stkReq).toFixed(1)} mm long per side beyond ${skewB > 0 ? "the skew diagonal" : "stack"} + heads — loose fit wastes copper and resistance; shrink the arbor toward \u00d8${((perim / Math.PI) - build).toFixed(1)} mm.`);
  const lenCoil = (MLTb * p.turns) / 1000;                           // m, per strand
  const jump = Math.max(p.wbJump, 0) / 1000;
  const lenString = nC * lenCoil + (nC - 1) * jump + 2 * jump;       // + lead tails
  const aBare = (Math.PI / 4) * dBare * dBare;
  const R20c = (RHO_CU * lenCoil * 1e6) / (aBare * st);              // Ω per coil
  const R20s = (RHO_CU * lenString * 1e6) / (aBare * st);
  const Rhot = (T9) => 1 + 0.00393 * (T9 - 20);
  const mCu = 8960 * nC * lenCoil * aBare * 1e-6 * st;               // kg, coil copper on the stick
  const mPhase = 8960 * lenString * aBare * 1e-6 * st;               // kg per phase incl. jumpers + lead tails
  // stator-drawing verification: slot geometry from the lamination alone
  let slot = null;
  if (p.statorID > 0 && p.slots >= 3 && p.toothW > 0) {
    const hs9 = (p.statorOD - p.statorID) / 2 - p.yoke - p.tipH;
    const d1 = p.statorID + 2 * p.tipH, d2 = p.statorID + 2 * (p.tipH + Math.max(hs9, 0));
    const w1 = (Math.PI * d1) / p.slots - p.toothW, w2 = (Math.PI * d2) / p.slots - p.toothW;
    const areaG = Math.max(((w1 + w2) / 2) * Math.max(hs9, 0), 0);
    const per = 2 * Math.max(hs9, 0) + w1 + w2;
    const rB9 = Math.min(Math.max(p.slotR, 0), Math.min(w1, w2) / 2, Math.max(hs9, 0) / 2);   // slot-bottom pair
    const rT9 = Math.min(Math.max(p.wbRtip || 0, 0), Math.min(w1, w2) / 2, Math.max(hs9, 0) / 2); // slot-mouth pair
    const areaU = Math.max(areaG - per * Math.max(p.liner, 0) - (2 * rB9 * rB9 + 2 * rT9 * rT9) * (1 - Math.PI / 4), 0);
    const sides = Math.max(Math.round(p.wbSides) || 2, 1);
    const aIns = (Math.PI / 4) * dIns * dIns;
    const fill = areaU > 0 ? (sides * p.turns * st * aIns) / areaU : NaN;
    slot = { hs: hs9, w1, w2, areaU, fill, sides, rB: rB9, rT: rT9 };
    if (!(hs9 > 0.5)) err.push("Stator drawing leaves no slot depth (check yoke / tip / bore) — nothing to verify against.");
    else if (!(areaU > 0)) err.push("Slot liner (or fillets) consume the entire slot area — no usable winding window, fill is undefined.");
    else {
      if (fill > 0.42) w.push(`Slot fill ${(fill * 100).toFixed(0)}% with ${sides} coil side(s) per slot — above the ~42% insertion ceiling.`);
      else if (fill > 0.35) w.push(`Slot fill ${(fill * 100).toFixed(0)}% — insertable but tight; expect careful lacing.`);
      if (dEff > p.slotOpen - 0.1) w.push(`Wire bundle Ø${dEff.toFixed(2)} mm vs ${p.slotOpen} mm slot opening — will not feed through for insertion winding.`);
      const DaIns9 = p.statorID + 2 * p.tipH;
      if (arbor < DaIns9 - 0.25) w.push(`Arbor Ø${arbor} mm is under bore + 2·tip height = Ø${DaIns9.toFixed(1)} mm — the coil ID won't seat over the tooth tips at insertion.`);
    }
  }
  const lenTool = nC * chW + (nC + 1) * flg;                         // arbor stack length
  // bench calibration: measured string R (at its temperature) vs prediction → per-shop wind factor
  const mrT = Number.isFinite(p.wbMRTemp) ? p.wbMRTemp : 20;
  const predAtMeasT = R20s * Rhot(mrT);
  const kRw = p.wbMR > 0 && predAtMeasT > 0 ? p.wbMR / predAtMeasT : 1;
  return { err, warn: w, dBare, dIns, dEff, tpl, layers, build, buildX, coilOD, capCh,
    MLT: MLTb, lenCoil, lenString, R20c, R20s, RhotF: Rhot, mCu, mPhase, slot, lenTool, wild, perStrand,
    tplW: tplW9, LwW: LwW9,
    kRw, predAtMeasT, R20cC: kRw * R20c, R20sC: kRw * R20s,
    Lhead, LheadAuto, perim, stackFit, stkReq, skewSlant: slantB,
    flangeOD: arbor + 2 * chH };
}

function computeDesign(p) {
  const w = []; // warnings
  const err = [];
  if (p.motorType === "actuator" || p.motorType === "bobbin")        // composition/tooling modules — no machine of their own
    return { err, warn: w, curve: [], [p.motorType]: true, noLoad: 0, Kt: 0 };
  if (p.motorType === "bobbin")                                      // tooling module — see computeBobbin
    return { err, warn: w, curve: [], bobbin: true, noLoad: 0, Kt: 0 };

  const Ns = Math.max(3, Math.round(p.slots));
  const poles = Math.max(2, Math.round(p.poles / 2) * 2);
  const brushedM = p.motorType === "brushed"; // slots on the rotating armature, magnets on the housing ID
  const latmE = p.motorType === "latm";       // slotless — slot-geometry fields are unused
  const brkE = p.motorType === "brake";       // no slots, no rotor lamination — geometry checks don't apply
  const stpE = p.motorType === "stepper";     // 2-phase salient-pole — 3-phase balance/flux checks don't apply
  if (p.poles % 2 !== 0) w.push("Pole count must be even — rounded to " + poles + ".");
  if (!stpE && !brkE && !brushedM && Ns % 3 !== 0) w.push("Slot count is not a multiple of 3 — winding will be unbalanced.");

  // ---- geometry (mm) ----
  // brushed: statorOD = housing OD, statorID = magnet-ring ID, rotorOD = armature OD,
  // yoke = armature core depth over the shaft; slots open OUTWARD from the armature surface.
  // ---- input sanity: a NaN/undefined in a load-bearing numeric compares false against
  // every bound below, so it would sail through the geometry checks and poison every
  // downstream number silently. Name the offenders instead. (Never throw — err[].)
  {
    const needs = ["statorOD", "stackL", "turns", "awg"];
    if (!brkE) needs.push("statorID", "rotorOD");
    if (!latmE && !brkE) needs.push("slots", "poles", "yoke", "toothW", "tipH", "slotOpen");
    if (p.motorType === "induction") needs.push("freq", "Vll", "rotorBars", "barA", "ringA");
    const bad = needs.filter((k9) => !Number.isFinite(p[k9]));
    if (bad.length) err.push("Non-numeric input: " + bad.join(", ") + " — fix these fields; every downstream number is meaningless until then.");
  }
  if ((p.motorType === "pm" || brushedM || latmE || stpE) && !(p.magT > 0))
    err.push("Magnet thickness must be > 0.");
  if (p.motorType === "induction" && !(p.freq > 0))
    err.push("Supply frequency must be > 0.");
  if (p.motorType === "induction" && Math.round(p.rotorBars) <= poles)
    err.push(`A ${Math.round(p.rotorBars)}-bar cage cannot support ${poles} poles — practical cages need bars comfortably above the pole count.`);
  if (brkE && !(p.brkArm > 0))
    err.push("Brake armature plate thickness must be > 0.");
  if (p.Imax !== undefined && !(p.Imax >= 0))
    err.push("Drive current limit must be ≥ 0.");

  const airgap = (p.statorID - p.rotorOD) / 2;
  if (!brkE && !(airgap > 0)) err.push(brushedM
    ? "Armature OD must be smaller than the magnet ring ID (airgap ≤ 0)."
    : "Rotor OD must be smaller than stator bore (airgap ≤ 0).");
  const hs = brushedM
    ? (p.rotorOD - p.shaftD) / 2 - p.yoke - p.tipH                 // armature slot depth (inward)
    : (p.statorOD - p.statorID) / 2 - p.yoke - p.tipH;             // stator slot depth (outward)
  if (hs <= 0 && !latmE && !brkE) err.push(brushedM
    ? "No room for armature slots: reduce core depth / tooth-tip or grow the armature OD."
    : "No room for slots: reduce yoke/tooth-tip or increase stator OD.");
  const d1 = brushedM ? p.rotorOD - 2 * p.tipH : p.statorID + 2 * p.tipH;                 // airgap-side slot diameter
  const d2 = brushedM ? p.rotorOD - 2 * (p.tipH + Math.max(hs, 0)) : p.statorID + 2 * (p.tipH + Math.max(hs, 0)); // slot-bottom diameter
  const w1 = (Math.PI * d1) / Ns - p.toothW; // slot width at the airgap side
  const w2 = (Math.PI * d2) / Ns - p.toothW; // slot width at the bottom (yoke side; narrower than w1 on an armature)
  if (w1 <= 0.3 && !latmE && !brkE) err.push(brushedM ? "Tooth width leaves no slot room at the armature surface." : "Tooth width leaves no slot opening room at the bore.");
  if (brushedM && w2 <= 0.3) err.push("Tooth width leaves no slot room at the slot bottom near the shaft — fewer slots, thinner teeth, or a bigger armature.");
  const rcFil = Math.min(Math.max(p.slotR, 0), Math.max(Math.min(w1, w2), 0) / 2, Math.max(hs, 0) / 2); // slot corner fillet
  const slotArea = ((w1 + w2) / 2) * Math.max(hs, 0) - 2 * (1 - Math.PI / 4) * rcFil * rcFil; // mm², fillets remove corner area
  const slotPerim = 2 * Math.max(hs, 0) + Math.max(w1, 0) + Math.max(w2, 0);
  const usableArea = Math.max(slotArea - slotPerim * p.liner, 0);
  if (!latmE && !brkE && hs > 0 && slotArea > 0 && usableArea <= 0)
    err.push("Slot liner consumes the entire slot area — no room left for winding.");

  // ---- wire ----
  const dBare = awgBareDia(p.awg);
  const dIns = awgInsDia(dBare, p.insBuild);
  const aBare = (Math.PI / 4) * dBare * dBare; // mm²
  const aIns = (Math.PI / 4) * dIns * dIns;

  const layers = brushedM || p.pattern === "concentrated" ? 2 : p.layers; // brushed armature: double-layer (2 coil sides per slot)
  // v58: "Turns basis" — shop armature drawings usually spec *conductors per slot*, but the tool otherwise reads the value as
  // turns-per-coil and doubles Z across the double layer. slotBasis takes the entered number as conductors/slot directly.
  const slotBasis = brushedM && p.turnBasis === "slot";
  const condPerSlot = (slotBasis ? 1 : layers) * p.turns * p.strands;
  const fillGross = usableArea > 0 ? (condPerSlot * aIns) / usableArea : Infinity;   // insulated / usable (strict)
  const fillCu = usableArea > 0 ? (condPerSlot * aBare) / usableArea : Infinity;
  const fillInsSlot = slotArea > 0 ? (condPerSlot * aIns) / slotArea : Infinity;      // insulated / gross slot
  const fillCuSlot = slotArea > 0 ? (condPerSlot * aBare) / slotArea : Infinity;      // bare Cu / gross slot (common shop number)
  if (!latmE && !brkE) {
    if (fillGross > 0.45) w.push("Fill factor above ~45% — usually not insertable by hand or machine.");
    else if (fillGross > 0.4) w.push("Fill factor in the 40–45% range — tight insertion, expect effort.");
  }

  // ---- winding layout: star of slots ----
  const gamma = ((poles / 2) * 2 * Math.PI) / Ns; // electrical rad per slot
  const q = Ns / (3 * poles);
  const span =
    p.pattern === "concentrated" ? 1 : Math.max(1, Math.round(p.span > 0 ? p.span : Ns / poles));
  const axes = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]; // A, B, C
  const topLayer = [];
  // Star of slots: assign each slot to the nearest phase axis (or anti-axis) by 60° sector.
  // Equivalent to max|cos(θ−axis)| but with a deterministic boundary rule — the pre-v58.1 greedy
  // comparison resolved exact ties (θ = 30°+k·60°, e.g. every 12-slot machine) on float noise,
  // producing unbalanced allocations like 12s10p → 3/5/4 and 12s14p → 5/5/2 instead of 4/4/4.
  // Sectors CCW from −30°: A+, C−, B+, A−, C+, B−.
  const SECT = [[0, 1], [2, -1], [1, 1], [0, -1], [2, 1], [1, -1]];
  for (let i = 0; i < Ns; i++) {
    const th = ((i * gamma) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const s6 = Math.floor((th + Math.PI / 6 + 1e-9) / (Math.PI / 3)) % 6; // +1e-9 rad: ties land CCW, not on FP noise
    topLayer.push({ phase: SECT[s6][0], sign: SECT[s6][1] });
  }
  if (span > Ns) err.push(`Coil span ${span} exceeds the slot count ${Ns} — a coil cannot span more slots than exist.`);
  const botLayer = topLayer.map((_, i) => {
    // true modulo: the old `(i - span + Ns*10) % Ns` went negative for span > 10·Ns
    // and indexed topLayer[-k] — undefined — throwing on .phase (never-throw contract)
    const src = topLayer[(((i - span) % Ns) + Ns) % Ns];
    return { phase: src.phase, sign: -src.sign };
  });

  // winding factor from phasor sum of phase-A coil sides (top layer)
  let re = 0, im = 0, nA = 0;
  topLayer.forEach((s, i) => {
    if (s.phase === 0) {
      const th = i * gamma + (s.sign < 0 ? Math.PI : 0);
      re += Math.cos(th); im += Math.sin(th); nA++;
    }
  });
  // balanced rotating-field check: per-phase EMF phasors must be equal and 120° apart
  const phasor = (phIdx) => {
    let re3 = 0, im3 = 0, n3 = 0;
    topLayer.forEach((t, i3) => {
      if (t.phase === phIdx) {
        const th3 = i3 * gamma + (t.sign < 0 ? Math.PI : 0);
        re3 += Math.cos(th3); im3 += Math.sin(th3); n3++;
      }
    });
    return { m: n3 ? Math.hypot(re3, im3) / n3 : 0, a: Math.atan2(im3, re3), n: n3 };
  };
  const phs = [phasor(0), phasor(1), phasor(2)];
  const mags = phs.map((x) => x.m);
  const magMax = Math.max(...mags), magMin = Math.min(...mags);
  const angDiff = (a3, b3) => { let d3 = ((a3 - b3) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI); return Math.min(d3, 2 * Math.PI - d3) * 180 / Math.PI; };
  const sepAB = angDiff(phs[0].a, phs[1].a), sepBC = angDiff(phs[1].a, phs[2].a);
  const rotDead = !brushedM && (magMax < 0.05 || phs.some((x) => x.n === 0));
  const rotBad = !brushedM && !rotDead && (magMin < 0.85 * magMax || Math.abs(sepAB - 120) > 20 || Math.abs(sepBC - 120) > 20);
  if (!stpE && !brkE && rotDead) err.push(`This ${Ns}-slot / ${poles}-pole combination cannot form a rotating field (phase EMFs collapse) — the motor will not rotate. Use Ns divisible by 3 with Ns ≠ poles and q = Ns/(3·poles) ≥ 0.25.`);
  else if (rotBad) w.push(`⚠ ${Ns}s/${poles}p winding is unbalanced (phase magnitudes or 120° spacing off) — heavy vibration and torque ripple; likely won't run cleanly.`);

  let kw = nA ? Math.hypot(re, im) / nA : 0;
  if (layers === 2) {
    const kp = Math.abs(Math.sin((span * gamma) / 2)); // span = 1 for tooth-wound
    kw *= kp;
  }

  // ---- turns / resistance ----
  const coilsTotal = layers === 2 ? Ns : Ns / 2;
  const coilsPerPhase = coilsTotal / 3;
  const a = Math.max(1, Math.round(p.paths));
  const Nser = (coilsPerPhase * p.turns) / a;

  const midD = (d1 + d2) / 2; // mid-slot diameter (valid outward stator slots or inward armature slots)
  const coilArc = (span * Math.PI * midD) / Ns;

  // ---- stack skew (end-to-end, mechanical degrees; 0 = straight stack) ----
  // Three physical effects, all classical: (1) the EMF fundamental sees the sinc-form
  // skew factor k_sk = sin(γe/2)/(γe/2), γe = (p/2)·θ_skew — folded into kw as the
  // conventional kd·kp·k_sk product (magnetizing coupling scales with it too);
  // (2) each in-slot conductor runs the DIAGONAL of the skewed slot, lengthening the
  // in-slot portion of every turn by hypot(stack, arc)/stack at the mid-slot radius;
  // (3) cogging is attenuated by the skew's sinc over the cogging period (applied in
  // the cogging block below). Harmonic EMFs get k_sk(n) in the BEMF synthesis.
  const skewDeg = Math.max(Number.isFinite(p.skew) ? p.skew : 0, 0);
  const skewArc = (Math.PI * midD * skewDeg) / 360;            // mm of arc, end-to-end, at mid-slot
  const skewSlant = p.stackL > 0 && skewDeg > 0 ? Math.hypot(p.stackL, skewArc) / p.stackL : 1;
  const gammaSkE = ((poles / 2) * skewDeg * Math.PI) / 180;    // electrical skew angle, rad
  const kskH = (n9) => { const x9 = (n9 * gammaSkE) / 2; return x9 > 1e-9 ? Math.sin(x9) / x9 : 1; };
  const ksk = kskH(1);
  kw *= ksk;
  if (skewDeg > 0 && !stpE && !brkE && !latmE) {
    // guidance in COGGING PERIODS, not slot pitches: on fractional-slot machines
    // (e.g. 12s14p, lcm 84) one cogging period is a few degrees and nulls cogging
    // almost free, while a full slot pitch would cost half the EMF
    const gcd9 = (a9, b9) => (b9 ? gcd9(b9, a9 % b9) : a9);
    const perCog9 = 360 / ((Ns * poles) / gcd9(Ns, poles));
    if (ksk < 0.9)
      w.push(`Stack skew ${skewDeg}° costs ${(100 * (1 - ksk)).toFixed(0)}% of EMF/torque (k_sk ${ksk.toFixed(3)}) — one cogging period (${perCog9.toFixed(1)}° on this ${Ns}s/${poles}p) already smooths cogging.`);
    else if (p.motorType === "pm" && skewDeg > 3 * perCog9)
      w.push(`Stack skew ${skewDeg}° is ${(skewDeg / perCog9).toFixed(1)}× the cogging period (${perCog9.toFixed(1)}°) — cogging nulls at ~one period; the extra skew only costs EMF (k_sk ${ksk.toFixed(3)}).`);
  }

  // ---- coil build / end-turn model → MLT (mm) ----
  const nCoilCond = p.turns * p.strands;           // conductors in one coil bundle
  const winH = Math.max(p.bobWin, dIns);           // winding window height
  const tb = (nCoilCond * aIns) / (0.72 * winH);   // radial build depth @72% lay
  let MLTmm = 0, endSide = 0, coilOD = 0;
  if (p.endMode === "bobbin") {
    if (p.bobShape === "round") {
      MLTmm = Math.PI * (p.bobD + tb);
      coilOD = p.bobD + 2 * tb;
    } else { // racetrack bobbin around the tooth (a skewed tooth stretches the stack-direction leg)
      const ca = p.stackL * skewSlant + 2 * p.bobWall, cb = p.toothW + 2 * p.bobWall;
      MLTmm = 2 * (ca + cb) + Math.PI * tb;
      coilOD = tb; // envelope build per side
    }
    const slotHalf = (Math.max(w1, 0) + Math.max(w2, 0)) / 4;
    if (tb > slotHalf && p.pattern === "concentrated")
      w.push(`Coil build ${tb.toFixed(1)} mm exceeds the ~${slotHalf.toFixed(1)} mm half-slot width — won't seat in the slot.`);
  } else if (p.endMode === "head") {
    endSide = Math.sqrt(coilArc * coilArc + p.headH * p.headH) + 5; // throw + single-sided rise + nose (rise was double-counted as 2·headH pre-v58)
    MLTmm = 2 * p.stackL * skewSlant + 2 * endSide;                 // in-slot legs run the skew diagonal
  } else { // auto
    endSide = 1.35 * coilArc + 10;
    MLTmm = 2 * (p.stackL * skewSlant + endSide);
  }
  const MLT = MLTmm / 1000; // m per turn
  const coilDia = MLTmm / Math.PI;                            // equivalent round-coil Ø
  const bobSuggest = Math.max(coilDia - tb, 0);               // core Ø that yields this MLT
  // bench calibration (pm & brushed): captured multiplicative factors ride every downstream
  // calculation, so design tweaks (±turns, wire, geometry) predict the REAL motor's response
  const calAct = p.calOn === "yes" && (p.motorType === "pm" || brushedM);
  const cKR = calAct ? Math.max(p.calKR || 1, 0.05) : 1;
  const cKL = calAct ? Math.max(p.calKL || 1, 0.05) : 1;
  const cKe = calAct ? Math.max(p.calKKe || 1, 0.05) : 1;
  const cKt = calAct ? Math.max(p.calKKt || 1, 0.05) : 1;
  const cTd = calAct ? Math.max(p.calTd || 0, 0) : 0;
  // v58: units-mismatch guard — a cal factor far from 1.0 almost always means a measured value was typed into the
  // wrong-unit field (e.g. 0.9 Ω into the mΩ box → calKR ≈ 4e-4, or 193 into a mH box read as µH).
  if (calAct) {
    for (const [nm, kv, hint] of [["R", p.calKR, "mΩ vs Ω"], ["L", p.calKL, "µH vs mH"], ["Ke", p.calKKe, "V/krpm vs mV/krpm"], ["Kt", p.calKKt, "N·m/A vs mN·m/A"]]) {
      if (kv > 0 && (kv < 0.1 || kv > 10))
        w.push(`Calibration cal${nm} = ${kv} is far from 1.0 — check the measured entry's units (${hint}). A factor this size usually means a units mismatch, not a real correction.`);
    }
  }
  const Rphase =
    cKR * (RHO_CU * MLT * coilsPerPhase * p.turns * 1e6) / (aBare * p.strands * a * a); // ohm
  const Rll = p.conn === "wye" ? 2 * Rphase : (2 / 3) * Rphase;
  // operating resistance: copper at winding temp + drive FETs / leads per phase
  const Rhot = Rphase * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;

  // ---- inductance estimates (computed after kw/Nser are known; filled below) ----

  // ---- electrical operating point: from current density J, or from a specified rated current ----
  // brushed: armature current divides over A2 parallel paths (lap = poles × plex, wave = 2 × plex)
  const pathsEff = brushedM ? (p.pattern === "lap" ? poles * a : 2 * a) : a;
  const Iph = p.loadMode === "I" ? Math.max(p.Irate, 0) : Math.max(p.J, 0) * aBare * p.strands * pathsEff; // rms (brushed: armature terminal current; J clamped ≥ 0 like Irate)
  const Jimp = Iph / (aBare * p.strands * pathsEff); // implied copper current density, A/mm²
  if (Jimp > 10) w.push(`Copper current density ≈ ${Jimp.toFixed(1)} A/mm² — needs forced-air or liquid cooling (passive designs usually run 3–6).`);
  else if (Jimp > 7) w.push(`Copper current density ≈ ${Jimp.toFixed(1)} A/mm² — fine with good airflow, hot for a sealed housing.`);
  const IlineOut = p.conn === "delta" ? Iph * Math.sqrt(3) : Iph;
  const Vph = p.conn === "wye" ? p.Vll / Math.sqrt(3) : p.Vll;
  const Istall = Rphase > 0 ? Vph / Rphase : 0;

  // ---- rotor magnet circuit (BLDC/PMSM) ----
  const mag = MAGNETS[p.mag] || MAGNETS["N42"];
  const dT = p.Top - 20;
  const BrT = mag.Br * (1 + (mag.aBr / 100) * dT);
  const HcJT = Math.max(mag.HcJ * (1 + (mag.aHcJ / 100) * dT), 1); // kA/m at Top
  // cold-start extreme: NdFeB HcJ falls hot, ferrite falls COLD (aHcJ > 0) — evaluate both
  const Tmin9 = Number.isFinite(p.Tmin) ? p.Tmin : -40;
  const HcJcold = Math.max(mag.HcJ * (1 + (mag.aHcJ / 100) * (Tmin9 - 20)), 1);
  const HcJmin = Math.min(HcJT, HcJcold);
  const demagT = HcJcold < HcJT ? Tmin9 : p.Top;
  const stM = STEELS[p.statorMat] || STEELS["M19 (29 ga)"];
  const rtM = STEELS[p.rotorMat] || STEELS["1018 steel (solid)"];
  const tauS = (Math.PI * (brushedM ? p.rotorOD : p.statorID)) / Ns;   // slot pitch at the airgap surface
  const tauP = (Math.PI * (brushedM ? p.rotorOD : p.statorID)) / poles; // pole pitch at the airgap surface
  // Carter's coefficient from slot opening & slot pitch on the effective gap
  // (surface PM: magnet recoil looks like air, so slotting sees g + lm/mur)
  const carterK = (tauSl, g9, so) => {
    if (!(g9 > 0) || !(so > 0.05) || !(tauSl > so)) return 1;
    const gam = ((so / g9) * (so / g9)) / (5 + so / g9);
    return Math.min(Math.max(tauSl / (tauSl - gam * g9), 1), 1.9);
  };
  let kcGap = 1.05; // legacy default for branches without a slotted gap model
  let BgEff = p.Bg, BgAvg = 0, B1 = 0, geSat = 0, ksat = 1, satAux = null;
  if (brushedM) {
    // housing-mounted magnet ring, same leakage/Carter first-order circuit as the PM branch
    kcGap = carterK(tauS, airgap + p.magT / mag.mur, p.slotOpen);
    BgAvg = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * kcGap * airgap) : 0;
    B1 = (4 / Math.PI) * BgAvg * Math.sin(((p.poleArc / 100) * Math.PI) / 2);
    BgEff = B1;
    if (p.Top > mag.Tmax) w.push(`Operating temp ${p.Top} °C exceeds ${p.mag} max working temp (${mag.Tmax} °C) — irreversible loss risk.`);
  } else if (p.motorType === "pm") {
    const kLeak = 0.9;
    kcGap = carterK(tauS, airgap + p.magT / mag.mur, p.slotOpen);
    BgAvg = airgap > 0
      ? (kLeak * BrT * p.magT) / (p.magT + mag.mur * kcGap * airgap)
      : 0;
    // nonlinear steel: iterate tooth/yoke MMF drops as an equivalent added gap
    if (BgAvg > 0) {
      const mu0 = 4e-7 * Math.PI;
      const Bg0 = BgAvg;
      const lt2 = (Math.max((p.statorOD - p.statorID) / 2 - p.yoke, p.tipH) / 1000);
      const lys = tauP / 2 / 1000;
      const hyr2 = Math.max(p.rotorOD / 2 - p.magT - p.shaftD / 2, 0.5);
      const lyr = (Math.PI * p.rotorOD) / poles / 2 / 1000;
      satAux = (Fext) => {
        let Bg2 = Bg0;
        for (let it2 = 0; it2 < 14; it2++) {
          const Bt2 = (Bg2 * tauS) / (p.toothW * stM.kst);
          const By2 = (Bg2 * tauP) / (2 * p.yoke * stM.kst);
          const Byr2 = ((Bg2 * (Math.PI * p.rotorOD)) / poles) / (2 * hyr2 * rtM.kst);
          const F = 2 * Hof(Bt2, stM) * lt2 + Hof(By2, stM) * lys + Hof(Byr2, rtM) * lyr + Fext;
          const geMM = ((mu0 * F) / Math.max(Bg2, 1e-3)) * 1000;
          const BgN = (0.9 * BrT * p.magT) / (p.magT + mag.mur * (kcGap * airgap + geMM));
          Bg2 = 0.6 * Bg2 + 0.4 * BgN;
          if (Fext === 0) geSat = geMM;
        }
        return Bg2;
      };
      BgAvg = satAux(0);
      ksat = BgAvg / Bg0;
    }
    B1 = (4 / Math.PI) * BgAvg * Math.sin(((p.poleArc / 100) * Math.PI) / 2); // fundamental peak
    BgEff = B1;
    if (p.Top > mag.Tmax) w.push(`Operating temp ${p.Top} °C exceeds ${p.mag} max working temp (${mag.Tmax} °C) — irreversible loss risk.`);
  }

  // ---- core flux densities & saturation checks ----
  if (p.motorType === "induction") kcGap = carterK(tauS, airgap, p.slotOpen);
  const Bavg = p.motorType === "pm" || brushedM ? BgAvg : (2 / Math.PI) * p.Bg; // average gap density over a pole
  const Bt = (Bavg * tauS) / (p.toothW * stM.kst);                   // tooth flux density (brushed: armature teeth)
  const By = (Bavg * tauP) / (2 * p.yoke * stM.kst);                 // back-iron (brushed: armature core over the shaft)
  // return-path web: PM = rotor hub between magnets & shaft; brushed = housing wall behind the magnet ring
  const hyr = brushedM ? (p.statorOD - p.statorID) / 2 - p.magT
    : p.motorType === "pm" ? p.rotorOD / 2 - p.magT - p.shaftD / 2 : p.rotorOD / 2 - p.shaftD / 2;
  const Byr = hyr > 0 ? (Bavg * (Math.PI * (brushedM ? p.statorID : p.rotorOD)) / poles) / (2 * hyr * rtM.kst) : Infinity;
  const lamName = brushedM ? "armature" : "stator";
  if (!latmE && !stpE && !brkE) {
  if (Bt > stM.Bmax) w.push(`Tooth saturation: Bt ≈ ${Bt.toFixed(2)} T vs ~${stM.Bmax} T for ${p.statorMat} — widen teeth, add slots, or reduce B̂g/magnet.`);
  else if (Bt > 0.88 * stM.Bmax) w.push(`Teeth running hot magnetically: Bt ≈ ${Bt.toFixed(2)} T (limit ~${stM.Bmax} T for ${p.statorMat}).`);
  if (By > stM.Bmax) w.push(`${brushedM ? "Armature core" : "Stator yoke"} saturation: By ≈ ${By.toFixed(2)} T vs ~${stM.Bmax} T — deepen the ${brushedM ? "core over the shaft" : "back-iron"}.`);
  else if (By > 0.88 * stM.Bmax) w.push(`${brushedM ? "Armature core" : "Stator yoke"} near limit: By ≈ ${By.toFixed(2)} T (limit ~${stM.Bmax} T).`);
  if (p.motorType === "pm") {
    if (hyr <= 0) w.push("No rotor back-iron left between magnets and shaft — enlarge rotor or reduce magnet/shaft.");
    else if (Byr > rtM.Bmax) w.push(`Rotor back-iron saturation: ≈ ${Byr.toFixed(2)} T vs ~${rtM.Bmax} T for ${p.rotorMat} — thicker hub or higher-Bsat material.`);
    if (rtM.Bmax < 0.5) w.push("Rotor hub material is non-magnetic — the magnetic circuit has no return path.");
  }
  if (brushedM) {
    if (hyr <= 0) w.push("No housing wall left behind the magnet ring — grow the housing OD or thin the magnets.");
    else if (Byr > rtM.Bmax) w.push(`Housing flux-return saturation: ≈ ${Byr.toFixed(2)} T vs ~${rtM.Bmax} T for ${p.rotorMat} — thicker can or higher-Bsat material.`);
    if (rtM.Bmax < 0.5) w.push("Housing material is non-magnetic — the field magnets have no flux return path.");
  }
  }
  if (!stM.lam && !latmE && !stpE && !brkE) w.push(`Solid ${lamName} material selected — expect very large eddy-current losses; use laminations.`);

  // ---- performance (sizing estimate at rated point) ----
  const D = p.rotorOD / 1000, L = p.stackL / 1000;
  const Arms = brushedM
    ? (condPerSlot * Ns * (Iph / pathsEff)) / (Math.PI * D)          // armature: Z conductors at Ia/A2 each
    : (6 * Nser * Iph) / (Math.PI * (p.statorID / 1000)); // A/m
  const Trated = (Math.PI / (2 * Math.SQRT2)) * kw * Arms * BgEff * D * D * L; // N·m
  const nSync = (120 * p.freq) / poles;
  const wSync = (2 * Math.PI * nSync) / 60;

  // back-EMF constant at the working airgap flux
  const fluxPole = (2 * BgEff * D * L) / poles; // Wb
  const Eph = 4.44 * p.freq * kw * Nser * fluxPole; // rms @ f
  const Ke = (calAct ? cKe : 1) * (wSync > 0 ? Eph / wSync : 0); // V_rms per mech rad/s

  // first-order demagnetization check at the drive current limit
  let Hdemag = 0, demagMargin = 1;
  if (p.motorType === "pm" && airgap > 0 && p.magT > 0) {
    const Fpk = ((3 * Math.SQRT2) / Math.PI) * ((kw * Nser) / (poles / 2)) * p.Imax; // A·t per pole
    Hdemag = Fpk / ((p.magT + airgap) / 1000) / 1000; // kA/m across magnet+gap
    demagMargin = 1 - Hdemag / HcJmin;
    if (demagMargin < 0.3) w.push(`Demag margin ${(demagMargin * 100).toFixed(0)}% at ${p.Imax} A — worst case at ${demagT} °C (HcJ ${HcJmin.toFixed(0)} kA/m). Thicken magnets or pick a higher-HcJ grade (SH/UH or SmCo).`);
  }

  // ---- phase inductance: airgap magnetizing + slot & end leakage ----
  const MU0 = 4e-7 * Math.PI;
  const dMagGap = p.motorType === "pm"
    ? (airgap * kcGap + geSat + p.magT / mag.mur) / 1000  // Carter gap + magnets + steel MMF drop
    : (airgap * kcGap) / 1000;
  const Lmag = (3 / Math.PI) * MU0 * ((D * L) / Math.max(dMagGap, 1e-5)) * Math.pow(kw * Nser, 2) / (poles * poles);
  const LmagNR = (3 / Math.PI) * MU0 * ((D * L) / (p.statorID / 2000)) * Math.pow(kw * Nser, 2) / (poles * poles); // rotor removed: flux crosses the open bore
  const bAvgSlot = (Math.max(w1, 0) + Math.max(w2, 0)) / 2;
  const lamSlot = bAvgSlot > 0 ? Math.max(hs, 0) / (3 * bAvgSlot) + p.tipH / Math.max(p.slotOpen, 0.1) : 1.5; // slot-body + tip/opening permeance
  const Lslot = ((4 * 3) / Ns) * MU0 * (p.stackL / 1000) * lamSlot * Nser * Nser;
  // v58: end-winding leakage from the real end-turn path (endSide from the coil-build model), replacing the pre-v58 0.3×Lslot shortcut
  // — that shortcut collapses whenever end turns are comparable to or longer than the stack (short-stack, high-pole machines).
  const lEnd = (2 * (endSide > 0 ? endSide : 1.35 * coilArc + 10)) / 1000; // total end-turn path, both ends, m
  const lamEnd = 0.47;                                                     // end-turn permeance coefficient (bench/FEMM-calibratable)
  const Lend = ((4 * 3) / Ns) * MU0 * lEnd * lamEnd * Nser * Nser;
  // v58: differential (airgap space-harmonic) leakage — first-order fractional-slot estimate, rises as slots/pole/phase → 0;
  // ~0 with the rotor removed (bare-stator LCR). FEMM-calibratable; see audit B-series.
  const qSpp = Ns / (3 * Math.max(poles, 1));
  const sigmaD = Math.min(6, Math.pow(Math.max(1 / Math.max(qSpp, 1e-3) - 1, 0), 1.6));
  const Ldiff = sigmaD * Lmag, LdiffNR = sigmaD * LmagNR;
  const Lph = cKL * (Lmag + Ldiff + Lslot + Lend);         // rotor installed
  const LphNR = cKL * (LmagNR + LdiffNR + Lslot + Lend);   // rotor removed (bare-stator LCR reading): leakage-dominated
  const Lll = p.conn === "wye" ? 2 * Lph : (2 / 3) * Lph;
  const LllNR = p.conn === "wye" ? 2 * LphNR : (2 / 3) * LphNR;

  // armature-loaded saturation knockdown at the drive current limit
  let kIT = 1, satCurve = null;
  if (p.motorType === "pm" && satAux && BgAvg > 0) {
    const FaOf = (I9) => (1.35 * kw * Nser * Math.SQRT2 * I9) / (poles / 2);
    kIT = Math.min(satAux(FaOf(p.Imax)) / BgAvg, 1);
    satCurve = [0, 0.5, 1, 1.5].map((f9) => ({ f: f9, k: Math.min(satAux(FaOf(f9 * p.Imax)) / BgAvg, 1) }));
  }

  /* ============ drive / control model ============ */
  let curve = [], op = null, noLoad = 0, peakT = 0, baseN = 0, Kt = 0, VphAvail = 0, TstallW = 0, acim = null, brush = null, latm = null, brake = null, step = null;
  let rotation = p.seq === "ABC" ? "CCW" : "CW";

  if (p.motorType === "pm") {
    // inverter fundamental phase voltage (rms), from DC bus
    const tapDrive = p.conn === "wye" && p.vref === "ln"; // line-to-neutral (center-tap) excitation
    VphAvail = tapDrive
      ? (p.ctrl === "foc" ? p.Vdc / (2 * Math.SQRT2)              // phase swings ±Vdc/2 about the tap
        : (Math.SQRT2 / Math.PI) * (p.Vdc / 2))
      : (p.ctrl === "foc" ? p.Vdc / (Math.sqrt(3) * Math.SQRT2)   // SVM linear limit, L-L bridge
        : (Math.SQRT2 / Math.PI) * p.Vdc);                        // six-step fundamental
    Kt = (p.ctrl === "foc" ? 1.0 : 0.955) * 3 * Ke * (tapDrive ? 0.5 : 1); // half-winding drive halves torque/amp
    if (calAct) Kt *= cKt / cKe;                                    // measured stall vs no-load = real Kt droop
    if (Ke > 0 && Rhot > 0) {
      // steady-state phasor limit: Vph² = (R·I + Ke·ω)² + (pp·ω·L·I)²  (Id = 0 below base speed)
      const pp3 = poles / 2, lamF = Ke / pp3, Lq2 = Math.max(Lph, 1e-7);
      const wOf = (I) => {
        const A2 = Ke * Ke + Math.pow(pp3 * Lq2 * I, 2), Bq = 2 * Rhot * I * Ke, Cq = Math.pow(Rhot * I, 2) - VphAvail * VphAvail;
        const d = Bq * Bq - 4 * A2 * Cq;
        return d <= 0 ? 0 : (-Bq + Math.sqrt(d)) / (2 * A2);
      };
      const Iof = (wm) => {
        const X2 = pp3 * wm * Lq2, A2 = Rhot * Rhot + X2 * X2, Bq = 2 * Rhot * Ke * wm, Cq = Ke * Ke * wm * wm - VphAvail * VphAvail;
        const d = Bq * Bq - 4 * A2 * Cq;
        return d <= 0 ? 0 : (-Bq + Math.sqrt(d)) / (2 * A2);
      };
      const wNL = wOf(0);
      noLoad = (wNL * 60) / (2 * Math.PI);
      peakT = Kt * Math.min(p.Imax, VphAvail / Rhot);
      TstallW = Kt * (VphAvail / Rhot); // winding V/R limit, no drive clamp
      const wB = wOf(p.Imax);
      baseN = (wB * 60) / (2 * Math.PI);
      // full dq voltage limit incl. R: Vd = R·Id − ωL·Iq, Vq = R·Iq + ω(λ + L·Id); max Iq over Id ∈ [−Imax, 0]
      const IqMax = (wm) => {
        const we = pp3 * wm;
        if (we <= 0) return VphAvail / Rhot;
        let best = 0;
        const nId = p.ctrl === "foc" ? 24 : 0; // six-step commutation can't field-weaken (Id = 0 only)
        for (let k4 = 0; k4 <= nId; k4++) {
          const Id = nId ? (-p.Imax * k4) / 24 : 0;
          const a4 = Rhot * Rhot + Math.pow(we * Lq2, 2);
          const b4 = 2 * Rhot * we * lamF;
          const c4 = Math.pow(Rhot * Id, 2) + Math.pow(we * (lamF + Lq2 * Id), 2) - VphAvail * VphAvail;
          const d4 = b4 * b4 - 4 * a4 * c4;
          if (d4 <= 0) continue;
          const Iq = (-b4 + Math.sqrt(d4)) / (2 * a4);
          best = Math.max(best, Math.min(Iq, Math.sqrt(Math.max(p.Imax * p.Imax - Id * Id, 0))));
        }
        return best;
      };
      let wEnd = wNL;
      // wNL = 0 (e.g. Vdc = 0) makes the step size 0 — the loop would never advance,
      // and with a negative Imax the exit test stays true forever: guard, don't hang
      if (wNL > 0) for (let wm = wNL; wm <= wNL * 1.6; wm += wNL / 40) { if (IqMax(wm) > Math.max(p.Imax, 0) * 0.01) wEnd = wm; else break; }
      for (let i = 0; i <= 90; i++) {
        const wm = (wEnd * i) / 90;
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: Kt * Math.min(IqMax(wm), p.Imax) });
      }
      // thermally-rated operating point at Iph (from J)
      const wOp = wOf(Iph);
      op = { n: (wOp * 60) / (2 * Math.PI), T: Kt * Math.min(Iph, p.Imax) };
      if (Iph > p.Imax) w.push("Winding thermal current exceeds drive current limit — drive-limited.");
    }
  } else if (p.motorType === "brake") {
    // Power-off spring-applied brake. Bobbin-wound annular solenoid in a ferromagnetic pot-core
    // backiron; springs clamp the friction disc through the armature plate when de-energized.
    // Backiron nomenclature: OD > pocket ID > boss OD > through-hole, with pocket depth < length.
    const rOD = p.statorOD / 2;                                       // backiron OD /2 (mm)
    const rPkt = Math.max(p.brkPktID, 4) / 2;                         // coil pocket ID /2 (outer rim bore)
    const rBoss = Math.max(p.brkBossOD, 2) / 2;                       // center boss OD /2
    const rThru = Math.max(p.brkBore, p.shaftD + 2) / 2;              // through-hole /2 (over hub)
    const pktD = Math.max(p.brkPktD, 1);                              // pocket depth (mm)
    const tBack = p.stackL - pktD;                                    // flux-return web behind the pocket
    const g0 = Math.max(p.brkStroke, 0.05) / 1000;                    // working gap = armature stroke (m)
    const gRes = 0.05e-3;                                             // residual gap, armature seated
    const Ain = Math.PI * (Math.pow(rBoss / 1000, 2) - Math.pow(rThru / 1000, 2));   // boss pole face
    const Aout = Math.PI * (Math.pow(rOD / 1000, 2) - Math.pow(rPkt / 1000, 2));     // rim pole face
    const Amin = Math.min(Ain, Aout);
    // ---- bobbin-wound coil: layers build outward from the bobbin OD at ~85% packing ----
    const Ntot = Math.max(p.turns, 1);
    const bobL = Math.max(p.brkBobL, 1);
    const hBuild = (Ntot * dIns * dIns) / (0.85 * bobL);              // radial winding build (mm)
    const coilOD = p.brkBobID + 2 * hBuild;                           // wound coil outer Ø (winding starts at bobbin ID)
    const clr = (p.brkPktID - coilOD) / 2;                            // radial clearance to the pocket ID
    // build room: capped by the bobbin flange (max winding finish Ø) AND the pocket wall (0.5 mm clearance)
    const hMax = Math.max(Math.min((p.brkBobOD - p.brkBobID) / 2, (p.brkPktID - p.brkBobID) / 2 - 0.5), 0);
    const capB = (0.85 * bobL * hMax) / (dIns * dIns);                // turns that fit
    const MLTb = Math.PI * (p.brkBobID + hBuild);                     // mean wound turn (mm)
    const Rb = ((RHO_CU * (MLTb / 1000) * Ntot) / (aBare * 1e-6 * Math.max(p.strands, 1))) * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
    const Ib = p.Vdc / Math.max(Rb, 1e-6);
    const NI = Ntot * Ib;
    const mu0b = 4e-7 * Math.PI;
    const bodyM = STEELS[p.statorMat] || { Bmax: 1.6, mur: 700 };   // backiron (pot core)
    const armM = STEELS[p.rotorMat] || bodyM;                        // sliding armature plate
    // Back-iron magnetic derate: real pot cores lose permeability to machining/cold work, weld heat,
    // plating bake, or plain wrong stock (a 303 body instead of 416). Scale interpolates the backiron
    // between full catalog steel (100%) and air/austenitic (0%): mur_eff = 1 + (mur − 1)·s.
    // Bsat is composition-driven and is NOT scaled — at low s the reluctance rise dominates anyway.
    const feS = Math.min(Math.max(Number.isFinite(p.brkFeScale) ? p.brkFeScale : 100, 0), 100) / 100;
    const murBody = 1 + ((bodyM.mur || 700) - 1) * feS;
    const Bsat = Math.min(bodyM.Bmax || 1.6, 2.1);
    const BsatA = Math.min(armM.Bmax || 1.6, 2.1);
    // iron path as equivalent extra gap, split by material: boss + web + rim in the backiron,
    // the radial run across the armature in its own steel
    const lFeB = (2 * pktD + (rOD - rThru) / 2) / 1000;
    const lFeA = ((rOD - rThru) / 2 + p.brkArm) / 1000;
    const gFe = lFeB / Math.max(murBody, 1) + lFeA / Math.max(armM.mur || 700, 100);
    const AarmMin = 2 * Math.PI * (rBoss / 1000) * (Math.max(p.brkArm, 0.5) / 1000); // tightest armature ring section
    const pullAt = (g) => {
      const Rtot = (g / (mu0b * Ain)) + (g / (mu0b * Aout)) + (gFe / (mu0b * Amin));
      let Phi = NI / Rtot;
      Phi = Math.min(Phi, Bsat * Amin, BsatA * AarmMin);              // saturation cap: backiron OR armature
      const F = (Phi * Phi / (2 * mu0b)) * (1 / Ain + 1 / Aout);
      return { F, Phi, Bin: Phi / Ain, Bout: Phi / Aout, Barm: Phi / AarmMin,
        satLim: Phi >= Math.min(Bsat * Amin, BsatA * AarmMin) * 0.999 };
    };
    const atGap = pullAt(g0), atSeat = pullAt(gRes);
    // spring pack from catalog-style heights: free length L0, engaged height L1 (springs seat on
    // the pocket floor and bear on the armature, so L1 physically = pocket depth + air gap);
    // pulling in compresses them a further stroke.
    const sprL0 = Math.max(Number.isFinite(p.brkSprFree) ? p.brkSprFree : 0, 0.1);
    const sprL1 = Math.max(Number.isFinite(p.brkSprEng) ? p.brkSprEng : 0, 0.1);
    const strk9 = Math.max(p.brkStroke, 0.05);
    const Fclamp = Math.max(Math.max(p.brkK, 0) * Math.max(sprL0 - sprL1, 0), 1);
    const Fcompr = Fclamp + Math.max(p.brkK, 0) * strk9;
    const sprCav = pktD + strk9;                                    // the spring's working cavity
    if (sprL0 <= sprL1) w.push(`Spring free length ${sprL0} mm ≤ engaged height ${sprL1} mm — no preload; the brake cannot clamp.`);
    if (Math.abs(sprL1 - sprCav) > 1.5) w.push(`Engaged spring height ${sprL1} mm vs pocket depth + air gap = ${sprCav.toFixed(1)} mm — springs seat on the pocket floor and bear on the armature, so these should agree (or call out dedicated spring seats).`);
    if (sprL1 - strk9 < 0.4 * sprL0) w.push(`Released spring height ${(sprL1 - strk9).toFixed(1)} mm is under 40% of the ${sprL0} mm free length — coil-bind (solid) risk at pull-in; deepen the pocket or pick a shorter-travel spring.`);
    const marginRel = atGap.F / Fcompr;
    const marginHold = atSeat.F / Fcompr;
    const ro = Math.max(p.brkRo, 2) / 1000, ri = Math.max(Math.min(p.brkRi, p.brkRo - 1), 1) / 1000;
    const re = (ro + ri) / 2;
    const reUP = (2 / 3) * (Math.pow(ro, 3) - Math.pow(ri, 3)) / (Math.pow(ro, 2) - Math.pow(ri, 2));
    const faces = Math.max(Math.min(Math.round(p.brkFaces), 2), 1);
    const Thold = Math.max(p.brkMu, 0.05) * Fclamp * re * faces;
    const Tdyn = Math.max(p.brkMuD, 0.03) * Fclamp * re * faces;
    const padP = Fclamp / (Math.PI * (ro * ro - ri * ri)) / 1e6;
    const matB = BRAKE_MATS[p.brkMat] || null;
    const Pb = p.Vdc * Ib;                                            // pull-in power at full bus
    const eco = Math.min(Math.max(Number.isFinite(p.brkEco) ? p.brkEco : 100, 10), 100) / 100;
    const Vhold = p.Vdc * eco, Ihold = Vhold / Math.max(Rb, 1e-6), Phold = Vhold * Ihold;
    const Asurf = (Math.PI * p.statorOD * p.stackL + 2 * (Math.PI / 4) * p.statorOD * p.statorOD) / 1e6;
    const RthB = 1 / (14 * Asurf) * 0.6;
    const TcuB = p.Tamb + Phold * RthB;                               // held released at economizer voltage
    const Lb = (Ntot * Ntot) / ((g0 / (mu0b * Ain)) + (g0 / (mu0b * Aout)) + (gFe / (mu0b * Amin)));
    const Vrel = atGap.F > 0 ? Math.sqrt(Math.max(1.35 * Fcompr / atGap.F, 0)) * p.Vdc : NaN;
    if (!(atGap.F > 0)) err.push("Coil produces no pull force (check bus voltage and coil turns) — the brake cannot release.");
    // ---- actuation currents: invert the circuit for the force targets ----
    const Rtot = (g) => (g / (mu0b * Ain)) + (g / (mu0b * Aout)) + (gFe / (mu0b * Amin));
    const kF = (1 / Ain + 1 / Aout) / (2 * mu0b);                     // F = kF·Φ²
    const Ineed = (g, F) => {
      const PhiN = Math.sqrt(F / kF);
      if (PhiN > Bsat * Amin) return Infinity;                        // saturation-unreachable
      return (PhiN * Rtot(g)) / Ntot;
    };
    // pull-in: must beat the springs at every point of the stroke (worst case governs)
    let Ipull = 0;
    for (let ix = 0; ix <= 20; ix++) {
      const x = (ix / 20) * Math.max(p.brkStroke, 0.05);              // travel from engaged, mm
      const g9 = Math.max(g0 - x / 1000, gRes);
      Ipull = Math.max(Ipull, Ineed(g9, Fclamp + Math.max(p.brkK, 0) * x));
    }
    // drop-out: seated armature re-engages when force falls below the fully compressed springs
    const Idrop = Ineed(gRes, Fcompr);
    const wireLen = (MLTb * Ntot) / 1000;                             // m
    const Rcold = ((RHO_CU * (MLTb / 1000) * Ntot) / (aBare * 1e-6 * Math.max(p.strands, 1))) + Math.max(p.Rext, 0) / 1000;
    const Bback = atGap.Phi / (2 * Math.PI * (rBoss / 1000) * (Math.max(tBack, 0.1) / 1000)); // web at the boss root
    brake = { Thold, Tdyn, re: re * 1000, reUP: reUP * 1000, faces, Fclamp, Fcompr, padP,
      pMax: matB ? matB.pMax : NaN, Tmax: matB ? matB.Tmax : NaN,
      Fpull: atGap.F, Fseat: atSeat.F, marginRel, marginHold, satLim: atGap.satLim,
      Bin: atGap.Bin, Bout: atGap.Bout, Barm: atSeat.Barm, Bback, NI, Rb, Ib, Pb, Ihold, Phold, eco, TcuB, RthB, Lb, tau: Lb / Math.max(Rb, 1e-6),
      Fclamp, Fcompr, sprL0, sprL1, sprCav,
      Vrel: Math.min(Vrel, 10 * p.Vdc), capT: capB, Ain: Ain * 1e6, Aout: Aout * 1e6,
      hBuild, coilOD, clr, tBack, Ipull, Idrop, Rcold, wireLen, feS: feS * 100, murBody, murNom: bodyM.mur || 700 };
    op = { n: 0, T: Thold }; peakT = Thold; noLoad = 0;
    if (p.brkRi >= p.brkRo) err.push("Friction lining ID must be smaller than its OD.");
    if (2 * p.brkRo > p.statorOD - 1) w.push(`Lining \u00d8${(2 * p.brkRo).toFixed(1)} mm reaches or exceeds the \u00d8${p.statorOD} mm backiron — the disc normally sits inside the housing envelope.`);
    if (!(rThru < rBoss - 0.5)) err.push("Boss OD must exceed the through-hole by a usable pole width.");
    if (!(rBoss < rPkt - 1)) err.push("Pocket ID must exceed the boss OD — no room for a coil pocket.");
    if (!(rPkt < rOD - 0.5)) err.push("Backiron OD must exceed the pocket ID by a usable rim width.");
    if (tBack <= 0.5) err.push(`Pocket depth ${pktD} mm leaves ${tBack.toFixed(1)} mm of back web — the pocket breaks through the backiron.`);
    if (clr <= 0) err.push(`Wound coil Ø${coilOD.toFixed(1)} mm interferes with the pocket ID Ø${p.brkPktID} mm — fewer turns, finer wire, longer bobbin, or a bigger pocket.`);
    else if (clr < 0.5) w.push(`Wound coil Ø${coilOD.toFixed(1)} mm leaves only ${clr.toFixed(2)} mm radial clearance to the pocket ID — under the 0.5 mm assembly minimum.`);
    if (feS < 0.999) w.push(`Back-iron magnetic derate at ${(feS * 100).toFixed(0)}% — effective \u00b5r ${murBody.toFixed(0)} vs ${(bodyM.mur || 700).toFixed(0)} nominal for ${p.statorMat}. Pull force and release margin below model this as extra reluctance; verify against a magnetised sample before release.`);
    if (p.brkBobID < p.brkBossOD + 0.2) w.push(`Winding-start \u00d8 ${p.brkBobID} mm won't clear the ${p.brkBossOD} mm boss — the barrel needs ≥ 0.2 mm over it.`);
    if (p.brkBobOD < p.brkBobID + 1) w.push("Winding window under 0.5 mm radial between the start and max-finish \u00d8 — no room for wire.");
    if (Number.isFinite(coilOD) && coilOD > p.brkBobOD + 0.05) w.push(`Wound coil \u00d8${coilOD.toFixed(1)} overruns the ${p.brkBobOD} mm bobbin flange — fewer turns, finer wire, or a taller flange.`);
    if (bobL + 2 > pktD) w.push(`Bobbin ${bobL} mm + flanges won't seat in the ${pktD} mm pocket depth.`);
    if (Ntot > capB) w.push(`Coil won't fit: ${Ntot} turns vs ≈ ${Math.floor(capB)} at this wire on a ${bobL} mm bobbin before the pocket ID (85% winding efficiency).`);
    if (Number.isFinite(brake.Ipull) && brake.Ipull > Ib) w.push(`Pull-in needs ${brake.Ipull.toFixed(2)} A but the bus only pushes ${Ib.toFixed(2)} A — the brake will not release at ${p.Vdc} V.`);
    if (Number.isFinite(atSeat.Barm) && atSeat.Barm > BsatA * 0.95)
      w.push(`Armature ring section runs ${atSeat.Barm.toFixed(2)} T vs ~${BsatA.toFixed(1)} T for ${p.rotorMat} — thicken the armature or pick a higher-Bsat plate.`);
    if (eco < 1 && Number.isFinite(Idrop) && Ihold < 1.3 * Idrop) w.push(`Economizer hold ${(eco * 100).toFixed(0)}% gives ${Ihold.toFixed(2)} A vs drop-out ${Idrop.toFixed(3)} A — under a ×1.3 hold margin; the brake may re-engage. Raise the hold voltage.`);
    if (marginRel < 1.3) w.push(`Release margin ×${marginRel.toFixed(2)}: pull at the full ${p.brkStroke} mm gap must beat the springs compressed to ${Fcompr.toFixed(0)} N by ≥ ×1.3 — more turns/voltage, less stroke, or wider poles.`);
    if (atGap.satLim) w.push(`Pole iron saturates at the working gap (${Bsat.toFixed(1)} T cap) — more ampere-turns won't add pull; widen the boss/rim.`);
    if (Bback > Bsat) w.push(`Back web ${tBack.toFixed(1)} mm runs ≈ ${Bback.toFixed(1)} T — saturated; deepen the backiron or shrink the pocket.`);
    if (matB && padP > matB.pMax) w.push(`Lining pressure ${padP.toFixed(2)} MPa exceeds ${p.brkMat} limit ${matB.pMax} MPa — grow the lining annulus or cut spring force.`);
    if (TcuB > p.TcuMax) w.push(`Coil ≈ ${Math.round(TcuB)} °C held released continuously (${Pb.toFixed(0)} W) — over the ${p.TcuMax} °C class. More turns / finer wire, or deepen the economizer (hold-voltage %).`);
    if (p.brkStroke < 0.15) w.push("Stroke under 0.15 mm leaves no lining-wear allowance — the brake will drag as it wears.");
    {
      const Barm = atGap.Phi / (2 * Math.PI * ((rThru + (rBoss - rThru) / 2) / 1000) * (p.brkArm / 1000));
      if (Barm > Bsat) w.push(`Armature plate ${p.brkArm} mm is too thin to carry the return flux (≈ ${Barm.toFixed(1)} T) — thicken it.`);
    }
  } else if (p.motorType === "stepper") {
    // 2-phase stepper. Hybrid: axially magnetized PM disc between two toothed soft-iron cups offset by
    // half a tooth pitch; fine steps (≤15°). PM type: BLDC-like magnet-arc rotor on a salient-pole
    // stator; coarse steps (15–30°). Electrical angle = k·θmech with k = rotor teeth (hybrid) or pole pairs (PM).
    const hyb = p.stpKind !== "pm";
    const kE = hyb ? Math.max(Math.round(p.stpNr), 3) : Math.max(Math.round(p.stpPP), 2);
    const stepA = 90 / kE;                                           // full step, mech deg (2-phase)
    const NsP = Math.max(Math.round(p.slots), 4);                    // stator poles (typ 8)
    const polesPh = Math.max(Math.floor(NsP / 2), 1);                // poles per phase
    // ---- drive wiring: turns entered per pole per strand (bifilar); classic √2 series-vs-unipolar ----
    const wire = p.stpWire || "bip-ser";
    const tF = wire === "bip-ser" ? 2 : 1;                           // active turns factor
    const rF = wire === "bip-ser" ? 2 : wire === "bip-par" ? 0.5 : 1;// phase R vs one strand
    const leads = wire === "bip-ser" ? "4–6" : wire === "bip-par" ? "8" : "5–6";
    const NphStr = Math.max(p.turns, 1) * polesPh;                   // one strand, whole phase
    const Nph = NphStr * tF;                                         // active series turns per phase
    const hsS = Math.max(hs, 6);                                     // slot depth from shared geometry
    const MLTs = 2 * (p.stackL + p.toothW) + Math.PI * Math.min(hsS, 25); // around the pole body
    const rStr = ((RHO_CU * (MLTs / 1000) * NphStr) / (aBare * 1e-6 * Math.max(p.strands, 1))) * (1 + 0.00393 * (p.Tcu - 20));
    const Rs = rStr * rF + Math.max(p.Rext, 0) / 1000;
    // ---- flux linkage swing per phase ----
    let dPhiPole, BtBias = 0, teethPP = 0, tPitch = 0;
    if (hyb) {
      tPitch = (Math.PI * p.rotorOD) / kE;                           // rotor tooth pitch, mm
      const faceArc = ((Math.PI * p.statorID) / NsP) * 0.72;         // pole face arc
      teethPP = Math.max(Math.floor(faceArc / tPitch), 1);           // stator teeth per pole face
      const Lcup = Math.max((p.stackL - p.magT) / 2, 2);             // each toothed cup
      const wT = 0.42 * tPitch;                                      // tooth width at the gap
      const AgPole = teethPP * (wT / 1000) * (Lcup / 1000);          // aligned tooth area, one pole one cup
      const AgTot = NsP * AgPole * 2 * 0.55;                         // both cups; ~55% of teeth conduct at any alignment
      const dM = Math.min(0.8 * p.rotorOD, p.rotorOD - 2);           // PM disc OD ≈ inside the cups
      const Am = (Math.PI / 4) * ((dM / 1000) ** 2 - (p.shaftD / 1000) ** 2);
      const lm = Math.max(p.magT, 0.5) / 1000;
      const gM = Math.max(airgap, 0.03) / 1000;
      // series magnetic circuit: magnet internal reluctance vs two gap crossings over the aligned teeth
      const PhiM = (BrT * Am) / (1 + (mag.mur * Am * 2 * gM) / (lm * AgTot));
      BtBias = Math.min(PhiM / AgTot, 1.95);                         // aligned-tooth bias flux (runs near sat by design)
      // half-pitch cup offset already inherent in the swing; permeance modulation depth ≈ 0.4
      dPhiPole = 0.4 * BtBias * AgPole;
    } else {
      // v59.8: the stator pole openings see the same Carter's coefficient the PM/brushed
      // branches already use, at the stepper's pole pitch — replaces a bare 1.05 fudge
      const kcS = carterK((Math.PI * p.statorID) / NsP, airgap + p.magT / mag.mur, p.slotOpen);
      const Bg6 = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * kcS * airgap) : 0;
      const APole = ((Math.PI * (p.statorID / 1000)) / NsP) * 0.7 * (p.stackL / 1000);
      dPhiPole = 0.9 * Bg6 * APole;
      BtBias = Bg6;
    }
    const KtPh = kE * Nph * dPhiPole;                                // per-phase torque constant, N·m/A
    const on2 = (p.stpOn || 2) === 2;
    const Th1 = KtPh * Math.max(p.Imax, 0.01);                       // 1-phase-on holding
    const Th2 = Math.SQRT2 * Th1;                                    // 2-phase-on
    const Th = on2 ? Th2 : Th1;
    const kd = hyb ? 0.055 : 0.10;
    const Td = kd * Th2;                                             // detent (unpowered), est vs 2-on holding
    // torque vs angle: energized restoring sinusoid, next-step curve, detent 4th harmonic
    const NP6 = 161, span6 = 2 * stepA;                              // ±2 full steps
    const thArr6 = [], tArr6 = [], tNxt6 = [], tDet6 = [];
    for (let i6 = 0; i6 < NP6; i6++) {
      const d6 = -span6 + (2 * span6 * i6) / (NP6 - 1);
      const eR = (d6 * Math.PI) / 180;
      thArr6.push(d6);
      tArr6.push(-Th * Math.sin(kE * eR));
      tNxt6.push(-Th * Math.sin(kE * (eR - (stepA * Math.PI) / 180)));
      tDet6.push(-Td * Math.sin(4 * kE * eR));
    }
    const Ls = (4e-7 * Math.PI) * Nph * Nph * (hyb
      ? (NsP * teethPP * (0.42 * tPitch / 1000) * (Math.max((p.stackL - p.magT) / 2, 2) / 1000)) / (2 * Math.max(airgap, 0.03) / 1000) / (NsP * NsP / 4)
      : ((Math.PI * (p.rotorOD / 1000) * (p.stackL / 1000)) / NsP) / Math.max((carterK((Math.PI * p.statorID) / NsP, airgap + p.magT / mag.mur, p.slotOpen) * airgap + p.magT / mag.mur) / 1000, 1e-5) / (kE * 2));
    const tauS = Ls / Math.max(Rs, 1e-6);
    const rpmC2 = (Math.max(p.Vdc - p.Imax * Rs, 0) / Math.max(KtPh * kE, 1e-9)) * (60 / (2 * Math.PI)); // ω where bemf eats bus
    const hubD9 = p.stpHubD > 0 ? p.stpHubD : 1.6 * p.shaftD;      // rotor hub the cups/ring mount on
    const thruD9 = Math.max(p.stpThruD || 0, 0);                    // hollow-rotor pass-through (0 = solid)
    const Jr = 0.5 * 7800 * Math.PI * (Math.pow(p.rotorOD / 2000, 4) - Math.pow(thruD9 / 2000, 4)) * (p.stackL / 1000) * 0.9; // rotor inertia, hollow-aware, kg·m²
    if (thruD9 > 0) {
      const wall9 = (hubD9 - thruD9) / 2;
      if (wall9 < 1) w.push(`Through-hole \u00d8${thruD9.toFixed(1)} leaves ${wall9.toFixed(2)} mm of hub wall (\u00d8${hubD9.toFixed(1)} hub) \u2014 below ~1 mm; thin-section machining and press-fit stress need review.`);
      else if (wall9 < 2) w.push(`Thin-section hub: ${wall9.toFixed(1)} mm wall on the \u00d8${hubD9.toFixed(1)} hub \u2014 workable, verify fits and keyless torque transfer.`);
      if (thruD9 >= 0.45 * p.rotorOD) w.push(`Through-hole \u00d8${thruD9.toFixed(1)} intrudes on the magnet-ring seat (\u2265 45% of rotor \u00d8${p.rotorOD}) \u2014 check the ${hyb ? "axial magnet ring ID and cup webs" : "ring magnet ID"} clear the bore.`);
      if (thruD9 >= hubD9) w.push(`Through-hole \u00d8${thruD9.toFixed(1)} \u2265 hub \u00d8${hubD9.toFixed(1)} \u2014 no hub wall remains.`);
    }
    const stiffS = Th * kE;                                          // N·m/rad at equilibrium
    const f0 = (1 / (2 * Math.PI)) * Math.sqrt(stiffS / Math.max(Jr, 1e-9)); // single-step natural freq
    step = { angle: stepA, stepsRev: 4 * kE, kind: hyb ? "hybrid" : "PM", wire, leads,
      Th, Th1, Th2, detent: Td, Kt: KtPh, Rs, Ls, tau: tauS, rpmC: Math.max(rpmC2, 0), kE, hubD: hubD9, thruD: thruD9,
      teethPP, tPitch, BtBias, stiff: stiffS, f0, J: Jr, on2, thArr: thArr6, tArr: tArr6, tNxt: tNxt6, tDet: tDet6 };
    op = { n: 0, T: Th }; peakT = Th;
    Kt = KtPh;
    // pull-out torque vs speed: per-phase flux constant back-solved from holding torque so the
    // curve anchors at Th; achievable current rolls off with BEMF and phase impedance —
    // T(ω) = √2·kφ·I_ach, I_ach = (0.9·V − kφ·ω)/√(Rs² + (kE·ω·Ls)²), clamped to Imax.
    // Quasi-static upper bound (no mid-band resonance dip) — chopper-drive assumed above V/R.
    {
      const kphi = Th / Math.max(Math.SQRT2 * p.Imax, 1e-9);        // N·m/A ≡ V·s/rad per phase
      const wMax = (0.9 * p.Vdc) / Math.max(kphi, 1e-9);            // BEMF eats the bus
      for (let i6 = 0; i6 <= 80; i6++) {
        const wm = (wMax * i6) / 80.5;
        const Zp = Math.sqrt(Rs * Rs + Math.pow(kE * wm * Ls, 2));
        const Ia = Math.min(Math.max((0.9 * p.Vdc - kphi * wm) / Math.max(Zp, 1e-9), 0), p.Imax);
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: Math.SQRT2 * kphi * Ia });
      }
      noLoad = (wMax * 60) / (2 * Math.PI);
      step.kphi = kphi;
      step.nRes = (60 * f0) / step.stepsRev;                        // rpm where step rate ≈ f0 (mid-band resonance)
    }
    if (hyb && stepA > 15) w.push(`Hybrid at ${stepA.toFixed(1)}°/step is unusual — coarse steps (15–30°) are normally a PM-rotor stepper; switch the type or raise tooth count.`);
    if (!hyb && stepA < 15) w.push(`PM stepper at ${stepA.toFixed(1)}°/step needs ${kE} pole pairs — fine steps are normally a hybrid (toothed) rotor; switch the type.`);
    if (hyb && tPitch < 1.2) w.push(`Rotor tooth pitch ${tPitch.toFixed(2)} mm is under ~1.2 mm — hard to cut; fewer teeth or a larger rotor.`);
    if (hyb && teethPP < 2) w.push(`Only ${teethPP} stator tooth fits each pole face — widen the bore/poles or reduce tooth pitch mismatch.`);
    if (hyb && p.magT > 0.4 * p.stackL) w.push("PM disc is a large fraction of the stack — cups get short and tooth area (torque) suffers.");
    if (wire === "uni") w.push("Unipolar wiring: ≈ 0.71× the torque of bipolar-series at equal dissipation — the price of the simpler 2-transistor-per-phase drive.");
    if (NsP % 4 !== 0) w.push(`2-phase steppers want stator poles in multiples of 4 — ${NsP} splits unevenly between phases.`);
    if (p.Vdc / Math.max(Rs, 1e-6) < p.Imax * 0.98) w.push(`Supply can only push V/R = ${(p.Vdc / Rs).toFixed(2)} A per phase — below the ${p.Imax} A rating; L/R drive won't reach rated torque (chopper drive with higher bus, or fewer turns).`);
  } else if (p.motorType === "brushed") {
    // PM brushed DC: magnet ring on the housing ID (stationary), slotted lamination = rotating armature
    const PhiP = (BgAvg * Math.PI * (p.rotorOD / 1000) * (p.stackL / 1000)) / poles; // flux per pole at the armature surface
    const Z = condPerSlot * Ns;                                     // total armature conductors
    const A2 = pathsEff;                                            // parallel paths (lap = poles × plex, wave = 2 × plex)
    Kt = (calAct ? cKe : 1) * ksk * (poles * Z * PhiP) / (2 * Math.PI * A2); // = Ke in SI (BEMF, bench-scaled); armature skew applies the same sinc factor
    const KtT9 = calAct ? Kt * (cKt / cKe) : Kt;                    // torque production with measured stall droop
    const Ra = ((RHO_CU * ((MLT / 2) * Z)) / (A2 * A2 * aBare * 1e-6)) * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
    // armature inductance seen at the brushes: airgap term (magnets ≈ air) + slot-leakage adder
    const geB = Math.max((airgap * kcGap + p.magT / mag.mur) / 1000, 1e-5);
    const NeffA = Z / (2 * A2);
    const La = 1.3 * (2 / Math.PI) * (4e-7 * Math.PI) * ((D * L) / geB) * ((NeffA * NeffA) / (poles * poles));
    VphAvail = Math.max(p.Vdc - Math.max(p.brushV, 0), 0);
    if (Kt > 0 && Ra > 0) {
      const wNL = VphAvail / Kt;
      noLoad = (wNL * 60) / (2 * Math.PI);
      peakT = KtT9 * Math.min(p.Imax, VphAvail / Ra);
      TstallW = KtT9 * (VphAvail / Ra);
      baseN = ((Math.max(VphAvail - p.Imax * Ra, 0) / Kt) * 60) / (2 * Math.PI);
      for (let i = 0; i <= 80; i++) {
        const wm = (wNL * i) / 80;
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: KtT9 * Math.min(Math.max((VphAvail - Kt * wm) / Ra, 0), p.Imax) });
      }
      op = { n: ((Math.max(VphAvail - Iph * Ra, 0) / Kt) * 60) / (2 * Math.PI), T: KtT9 * Math.min(Iph, p.Imax) };
    }
    // armature-reaction demag at the current limit: cross-field A·t per pole across magnet + gap
    if (airgap > 0 && p.magT > 0) {
      const Fa = (Z * (p.Imax / A2)) / (2 * poles);
      Hdemag = Fa / ((p.magT + airgap) / 1000) / 1000; // kA/m
      demagMargin = 1 - Hdemag / HcJmin;
      if (demagMargin < 0.3) w.push(`Demag margin ${(demagMargin * 100).toFixed(0)}% at ${p.Imax} A (armature reaction) — worst case at ${demagT} °C (HcJ ${HcJmin.toFixed(0)} kA/m). Thicken magnets or pick a higher-HcJ grade.`);
    }
    brush = { Ra, La, Vb: p.brushV, Z, A2, segs: Ns, Bg: BgAvg };    // double-layer lap/wave: commutator bars = coils = slots
    if (poles > Ns) w.push("Armature slots fewer than poles — commutation will be poor; add slots.");
    if (p.pattern === "wave") {
      const hp = Math.max(Math.round(poles / 2), 1), plx = Math.max(Math.round(p.paths), 1);
      if ((Ns - plx) % hp !== 0 && (Ns + plx) % hp !== 0)
        w.push(`Wave winding needs an integer commutator pitch: (bars ± plex)/(poles/2) = (${Ns} ± ${plx})/${hp} doesn't divide — this coil set can't close. Adjust slot count (e.g. ${Ns + (hp - ((Ns - plx) % hp))}) or plex.`);
    }
    if (Ns % poles === 0) w.push(`Armature slots (${Ns}) divisible by poles (${poles}) — all coils commutate simultaneously; strong torque ripple. Odd or non-multiple slot counts (e.g. ${Ns + 1}) run smoother.`);
    if (p.brushV > 0.08 * p.Vdc) w.push(`Brush drop ${p.brushV} V is ${((p.brushV / p.Vdc) * 100).toFixed(0)}% of the supply — significant efficiency and low-speed torque penalty at ${p.Vdc} V.`);
  } else if (p.motorType === "latm") {
    // limited-angle torquer: toroidal sector windings on a slotless ring core, PM rotor,
    // two-wire drive — flipping polarity toggles between two stop positions.
    const tw = Math.max(p.latmWind, 0.5);
    // v59.8: slotless gap — Carter's coefficient does not apply (no slotting ripple);
    // the previous 1.05 was a leftover from the slotted branches, not physics
    const Bg4 = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * (airgap + tw)) : 0;
    const sect = Math.max(Math.round(p.latmSect), 1);
    const spanR = (Math.max(p.latmSpan, 5) * Math.PI) / 180;
    const Ntot = p.turns * sect;                                    // turns/sector × sectors
    const rR = p.rotorOD / 2000, Lz = p.stackL / 1000;
    const coreD = Math.max((p.statorOD - p.statorID) / 2, 0.5);     // ring radial depth from OD/ID
    const MLTt = 2 * (p.stackL + 2 * coreD + 3 * tw);               // toroidal turn length, mm
    const Ra2 = ((RHO_CU * (MLTt / 1000) * Ntot) / (aBare * 1e-6 * Math.max(p.strands, 1))) * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
    const L4 = ((4e-7 * Math.PI) / Math.PI) * (((p.rotorOD / 1000) * (p.stackL / 1000)) / Math.max((airgap + tw + p.magT / mag.mur) / 1000, 1e-5)) * ((Ntot * Ntot) / (poles * poles));
    const Idrv = Math.min(p.Imax, Ra2 > 0 ? p.Vdc / Ra2 : p.Imax);  // two-wire: supply/Ra, clamped by the drive limit
    // ---- torque vs angle: circular cross-correlation of the alternating pole field (fringing-
    //      smoothed square) with the alternating sector current sheet; trapezoid shape falls out ----
    const NPH = 720;
    const wrapPi = (x) => { let y = x % (2 * Math.PI); if (y > Math.PI) y -= 2 * Math.PI; if (y < -Math.PI) y += 2 * Math.PI; return y; };
    const arcHalf = ((p.poleArc / 100) * Math.PI) / poles;          // mech half pole-arc
    const sigF = Math.max((airgap + tw + p.magT / mag.mur) / Math.max(p.rotorOD / 2, 1), 0.01); // fringing angle, rad (slotless — no Carter)
    const field = new Array(NPH), sheet = new Array(NPH).fill(0);
    const polePitch = (2 * Math.PI) / poles;
    for (let i5 = 0; i5 < NPH; i5++) {
      const ph = (i5 / NPH) * 2 * Math.PI;
      const idx = Math.round(ph / polePitch);
      const d = wrapPi(ph - idx * polePitch);
      const edge = (x) => 0.5 * (1 + Math.tanh(x / sigF));          // smoothed pole edge
      const mag5 = edge(d + arcHalf) - edge(d - arcHalf);           // 1 inside arc, fringed edges
      field[i5] = (idx % 2 === 0 ? 1 : -1) * mag5;
      // sector sheet: sectors evenly spaced, alternating current direction (adjacent sectors reversed)
      const sIdx = Math.round(ph / (2 * Math.PI / sect));
      const ds = wrapPi(ph - sIdx * (2 * Math.PI / sect));
      if (Math.abs(ds) <= spanR / 2) sheet[i5] = ((sIdx % sect) % 2 === 0 ? 1 : -1);
    }
    const dphi = (2 * Math.PI) / NPH;
    const Tof5 = (thm) => {                                          // T(θ) at drive current
      let c = 0;
      const off = Math.round(thm / dphi);
      for (let i5 = 0; i5 < NPH; i5++) c += sheet[i5] * field[(((i5 - off) % NPH) + NPH) % NPH];
      return (p.turns / spanR) * Bg4 * Idrv * Lz * rR * c * dphi;   // line density × BIL·r × overlap
    };
    const NPTS = 181, thSpanC = polePitch;                           // plot ±1 pole pitch about the peak
    // locate the torque peak (travel center) then sample the curve about it
    let thPk = 0, tPk5 = -Infinity;
    for (let i5 = 0; i5 <= 240; i5++) {
      const th5 = -polePitch / 2 + (polePitch * i5) / 240;
      const t5 = Tof5(th5);
      if (t5 > tPk5) { tPk5 = t5; thPk = th5; }
    }
    const thArr = [], tArr = [];
    for (let i5 = 0; i5 < NPTS; i5++) {
      const th5 = -thSpanC / 2 + (thSpanC * i5) / (NPTS - 1);
      thArr.push((th5 * 180) / Math.PI);
      tArr.push(Tof5(thPk + th5));
    }
    // first zero crossing right of the peak = electrical travel limit
    let zeroAng = (thSpanC / 2) * (180 / Math.PI);
    for (let i5 = Math.floor(NPTS / 2); i5 < NPTS - 1; i5++) {
      if (tArr[i5] > 0 && tArr[i5 + 1] <= 0) {
        const f5 = tArr[i5] / (tArr[i5] - tArr[i5 + 1]);
        zeroAng = thArr[i5] + f5 * (thArr[i5 + 1] - thArr[i5]);
        break;
      }
    }
    const travel = Math.max(p.latmTravel, 1);
    const stopA = travel / 2;                                        // stops symmetric about the peak
    const tAt5 = (deg) => {                                          // interpolate the sampled curve
      const x5 = ((deg + (thSpanC / 2) * (180 / Math.PI)) / (thSpanC * (180 / Math.PI))) * (NPTS - 1);
      const j5 = Math.min(Math.max(Math.floor(x5), 0), NPTS - 2);
      return tArr[j5] + (x5 - j5) * (tArr[j5 + 1] - tArr[j5]);
    };
    const Tstop = tAt5(stopA);
    const stiff = (tAt5(stopA - 0.5) - tAt5(stopA + 0.5)) / ((1 * Math.PI) / 180); // −dT/dθ at the stop, N·m/rad
    Kt = Idrv > 0 ? tPk5 / Idrv : 0;                                 // peak torque constant
    peakT = tPk5;
    TstallW = Kt * (Ra2 > 0 ? Math.max(p.Vdc, 1) / Ra2 : 0);
    op = { n: 0, T: Math.max(Tstop, 0) };                            // guaranteed toggle/holding torque
    noLoad = 0;
    latm = { Kt, Tpk: tPk5, Tstop, stiff, travel, zeroAng, Ra: Ra2, L: L4, tau: L4 / Math.max(Ra2, 1e-6),
      Bg: Bg4, Ntot, Idrv, thArr, tArr };
    if (poles < 2) w.push("LATM needs at least a 2-pole rotor.");
    if (sect !== poles) w.push(`Winding sectors (${sect}) ≠ rotor poles (${poles}) — sector and pole patterns misalign; net torque drops and the profile skews. Match them unless intentional.`);
    if (sect % 2 !== 0 && sect > 1) w.push(`Odd sector count (${sect}) with alternating drive leaves adjacent like-polarity sectors — part of the winding fights itself.`);
    if (stopA >= zeroAng * 0.98) w.push(`Stops at ±${stopA.toFixed(1)}° sit at/past the ${zeroAng.toFixed(1)}° torque reversal — the rotor cannot be driven onto the stop; reduce travel or widen pole arc/sectors.`);
    else if (Tstop < 0.25 * tPk5) w.push(`Toggle torque at the stops is ${((Tstop / Math.max(tPk5, 1e-9)) * 100).toFixed(0)}% of peak — stops are deep in the rolloff; consider less travel.`);
    if (sect * spanR > 2 * Math.PI * 0.98) w.push("Sector spans overlap — total winding coverage exceeds the circumference.");
    const Bring = (Bg4 * (Math.PI * p.rotorOD) / poles) / (2 * coreD * stM.kst); // half-pole flux through the ring section
    if (Bring > stM.Bmax) w.push(`Ring core saturation: ≈ ${Bring.toFixed(2)} T vs ~${stM.Bmax} T for ${p.statorMat} — deepen the ring (OD−ID) or reduce magnet flux.`);
    else if (Bring > 0.88 * stM.Bmax) w.push(`Ring core near limit: ≈ ${Bring.toFixed(2)} T (limit ~${stM.Bmax} T).`);
    latm.Bring = Bring;
    // ---- layer-resolved sector winding: a perfect first layer lays turns with insulated
    //      diameters touching along the bore-face arc, each turn spanning the coil length.
    //      Each further layer nests between the previous (rows +0.866·dIns radially), but
    //      crossovers can stack two full diameters — that worst case governs interference. ----
    const N1 = Math.max(Math.floor((0.98 * spanR * (p.statorID / 2 - dIns / 2)) / dIns), 1); // perfect single layer
    const capL = (L9) => L9 * N1 - Math.floor(L9 / 2);              // nested rows alternate N1, N1−1, …
    let layersW = 1;
    while (capL(layersW) < p.turns && layersW < 40) layersW++;
    const buildNest = dIns * (1 + (layersW - 1) * 0.866);           // nominal nested radial build
    const buildX = dIns * layersW;                                   // crossover worst case: stacked diameters
    const encr = Math.max(buildX - tw, 0);                           // protrusion past the wrap allowance
    const clrMag = airgap - buildX;                                  // bore-face build toward the rotor magnets
    const LfitB = Math.max(Math.floor((tw / dIns - 1) / 0.866) + 1, 1);
    const capT = capL(LfitB);                                        // turns that nest inside the wrap allowance
    latm.capT = capT; latm.N1 = N1; latm.layersW = layersW;
    latm.buildNest = buildNest; latm.buildX = buildX; latm.clrMag = clrMag;
    if (p.turns > capT) w.push(`Sector winding won't fit: ${p.turns} turns vs ~${capT} nested in the ${tw} mm wrap over ${p.latmSpan}° — thicker wrap allowance, wider sectors, or finer wire.`);
    else if (p.turns > 0.85 * capT) w.push(`Sector winding is tight: ${p.turns} of ~${capT} turns capacity — expect a careful wind.`);
    if (p.turns > N1) {
      w.push(`Sector coil exceeds a perfect single layer (${N1} turns of \u00d8${dIns.toFixed(3)} mm touching along the ${p.latmSpan}° bore arc) — ${layersW} layers: nested build ≈ ${buildNest.toFixed(2)} mm, crossovers stack to ${buildX.toFixed(2)} mm.`);
      if (encr > 0) w.push(`Layered build ${buildX.toFixed(2)} mm exceeds the ${tw} mm wrap allowance by ${encr.toFixed(2)} mm — ${clrMag > 0 ? clrMag.toFixed(2) + " mm left to the rotor magnets" : "contacts the rotor magnets"}: air-gap interference risk. Finer wire, wider sectors, or more wrap allowance.`);
      else if (clrMag < 0.2) w.push(`Only ${clrMag.toFixed(2)} mm between the crossover build and the rotor magnets — air-gap interference risk.`);
    } else if (dIns > tw) {
      w.push(`Wire \u00d8${dIns.toFixed(3)} mm is thicker than the ${tw} mm wrap allowance even single-layer — the build encroaches the rotor clearance.`);
    }
  } else {
    // induction: single-cage equivalent circuit with rotor resistance computed from the cage
    noLoad = nSync; // minus friction/windage
    const Nb = Math.max(4, Math.round(p.rotorBars));
    const rhoBar = (BARS[p.barMat] || 3.2e-8) * (1 + 0.004 * (p.Tcu - 20));
    const Rbar = (rhoBar * ((p.stackL * skewSlant) / 1000)) / Math.max(p.barA * 1e-6, 1e-9); // skewed bars run the stack diagonal
    const Dring = (p.rotorOD * 0.85) / 1000; // mean end-ring diameter
    const Rseg = (rhoBar * ((Math.PI * Dring) / Nb)) / Math.max(p.ringA * 1e-6, 1e-9);
    const pp2 = poles / 2;
    const R2bar = Rbar + Rseg / (2 * Math.pow(Math.sin((Math.PI * pp2) / Nb), 2));
    const R2p = R2bar * ((4 * 3 * Math.pow(kw * Nser, 2)) / Nb); // referred to stator
    const we2 = 2 * Math.PI * p.freq;
    const X1 = we2 * (Lslot + Lend), X2 = 0.8 * X1, Xt = X1 + X2, Xm2 = we2 * Lmag;
    const R1 = Rhot;
    const Tof = (s2) => (3 * Vph * Vph * (R2p / s2)) / (wSync * (Math.pow(R1 + R2p / s2, 2) + Xt * Xt));
    const sb2 = R2p / Math.sqrt(R1 * R1 + Xt * Xt);
    peakT = Tof(sb2);
    let sr2 = Math.min(sb2 * 0.5, 0.03);
    if (Trated < peakT * 0.98) {
      let lo = 1e-4, hi = sb2;
      for (let it = 0; it < 48; it++) { const mid = (lo + hi) / 2; if (Tof(mid) < Trated) lo = mid; else hi = mid; }
      sr2 = (lo + hi) / 2;
    } else {
      w.push("Sizing torque exceeds computed breakdown torque — cage too resistive or leakage too high for this rating.");
      sr2 = sb2 * 0.7;
    }
    for (let i = 0; i <= 110; i++) {
      const s2 = 1 - (i / 110) * 0.998; // 1 → 0.002
      curve.push({ n: nSync * (1 - s2), T: Tof(s2) });
    }
    op = { n: nSync * (1 - sr2), T: Tof(sr2) };
    const I2r = Vph / Math.hypot(R1 + R2p / sr2, Xt);
    const Im2 = Xm2 > 0 ? Vph / Xm2 : 0;
    acim = {
      R2p, sr: sr2, sb: sb2, Tlr: Tof(1),
      Ilr: Vph / Math.hypot(R1 + R2p, Xt),
      Im: Im2, Irun: Math.hypot(I2r, Im2),
    };
    if (Nb === Ns) w.push("Rotor bars = stator slots — severe locking and noise; change the bar count.");
    else if (Math.abs(Ns - Nb) === poles || Math.abs(Ns - Nb) === 2 * poles)
      w.push(`Bar count ${Nb} vs ${Ns} slots differs by ${Math.abs(Ns - Nb)} (= p or 2p) — synchronous torque cusps likely; shift the bar count.`);
  }

  const nShaft = op ? op.n : 0;
  const wShaft = (2 * Math.PI * nShaft) / 60;
  const Pout = (op ? op.T : 0) * wShaft;
  const Pcu = brushedM && brush
    ? Iph * Iph * brush.Ra + Math.max(p.brushV, 0) * Iph            // armature I²R + brush contact loss
    : p.motorType === "latm" && latm
    ? latm.Idrv * latm.Idrv * latm.Ra                               // two-wire single circuit at drive current
    : p.motorType === "stepper" && step
    ? (step.on2 ? 2 : 1) * p.Imax * p.Imax * step.Rs                // energized phase(s) held at rated current
    : p.motorType === "brake" && brake
    ? brake.Pb                                                      // coil across the bus while released
    : 3 * Iph * Iph * Rhot;
  if (calAct && cTd > 0 && curve.length) {
    // measured rated point implies friction/windage drag the geometry model doesn't see
    curve = curve.map((c9) => ({ ...c9, T: Math.max(c9.T - cTd, 0) }));
    let nz9 = 0;
    for (const c9 of curve) if (c9.T > 0) nz9 = Math.max(nz9, c9.n);
    if (nz9 > 0) noLoad = Math.min(noLoad, nz9);
    peakT = Math.max(peakT - cTd, 0);
    if (op) op = { ...op, T: Math.max(op.T - cTd, 0) };
  }

  // iron loss estimate (Steinmetz-style scaling from 1.5 T / 60 Hz specific loss)
  const fe = nShaft > 0 ? (nShaft * poles) / 120 : p.freq;
  // lam body radii: stator = bore→OD; brushed armature = shaft→armature OD (yoke band = core over the shaft)
  const rBoreM = (brushedM ? p.rotorOD : p.statorID) / 2000,
    rTopM = (brushedM ? Math.max(d2, p.shaftD) : p.statorID + 2 * (p.tipH + Math.max(hs, 0))) / 2000,
    rODm = (brushedM ? p.rotorOD : p.statorOD) / 2000, Lm2 = p.stackL / 1000;
  const mYoke = latmE
    ? Math.PI * (Math.pow(p.statorOD / 2000, 2) - Math.pow(p.statorID / 2000, 2)) * Lm2 * stM.kst * stM.rho
    : brushedM
    ? Math.PI * (rTopM * rTopM - Math.pow(p.shaftD / 2000, 2)) * Lm2 * stM.kst * stM.rho
    : Math.PI * (rODm * rODm - rTopM * rTopM) * Lm2 * stM.kst * stM.rho;
  const mTeeth = latmE ? 0 : Math.max(Math.PI * Math.abs(rBoreM * rBoreM - rTopM * rTopM) * Lm2 - (Ns * slotArea * p.stackL) / 1e9, 0) * stM.kst * stM.rho;
  const coreMass = mYoke + mTeeth;
  // two-term iron loss: hysteresis (∝ f·B^1.8) + eddy (∝ f²·B²), split by the material's
  // eddy fraction at the 1.5 T / 60 Hz calibration point (thin CoFe low, solid steel high).
  // Reduces exactly to mass·w at 60 Hz / 1.5 T, diverges correctly at 400 Hz+ electrical.
  const efFe = Number.isFinite(stM.ef) ? stM.ef : 0.30;
  const feTermF = (B, f9) => {
    const b = Math.min(B, 2.4) / 1.5;
    return (1 - efFe) * Math.pow(b, 1.8) * (f9 / 60) + efFe * b * b * Math.pow(f9 / 60, 2);
  };
  const feTerm = (B) => feTermF(B, fe);
  const Pfe = latmE || brkE ? 0 : (mYoke * feTerm(By) + mTeeth * feTerm(Bt)) * stM.w;

  // ---- AC copper (skin/proximity) and windage at the rated point ----
  // (moved above eta in v59.6 — both were computed and returned but never entered the
  // loss chain, so efficiency ignored high-frequency copper and air drag it already knew)
  const feOp = op && p.motorType === "pm" ? (op.n * poles) / 120 : p.freq;
  let acFr = 1;
  if (feOp > 0 && dBare > 0) {
    const delta = Math.sqrt(RHO_CU / (Math.PI * feOp * 4e-7 * Math.PI)) * 1000; // skin depth, mm
    const xi = dBare / delta;
    const NlL = Math.ceil(Math.sqrt(Math.max(condPerSlot, 1)));
    acFr = Math.min(1 + ((5 * NlL * NlL - 1) / 45) * Math.pow(xi, 4), 4);
  }
  const Pwind = op ? 0.01 * Math.PI * 1.2 * Math.pow((op.n * 2 * Math.PI) / 60, 3) * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000) : 0;

  // v59.9: drag-corrected curve and no-load (PM + brushed) — the pure V/Ke intercept
  // ignores the iron and windage the model itself computes. Subtract the model's own
  // drag torque (Pfe(n)+Pwind(n))/ω from the curve; the no-load point moves to where
  // electromagnetic torque only just covers drag. Pure power balance, no new empirics.
  // Skipped when a bench drag calibration (cTd) is active — the measured drag already
  // contains iron + windage, and applying both would double-count.
  if ((p.motorType === "pm" || brushedM) && !(calAct && cTd > 0) && curve.length > 1 && noLoad > 0) {
    const TdragAt = (n9) => {
      if (!(n9 > 1)) return 0;
      const w9 = (n9 * 2 * Math.PI) / 60;
      const fe9 = (n9 * poles) / 120;
      const Pfe9 = (mYoke * feTermF(By, fe9) + mTeeth * feTermF(Bt, fe9)) * stM.w;
      const Pw9 = 0.01 * Math.PI * 1.2 * Math.pow(w9, 3) * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000);
      return (Pfe9 + Pw9) / w9;
    };
    curve = curve.map((c9) => ({ ...c9, T: Math.max(c9.T - TdragAt(c9.n), 0) }));
    let nz9 = 0;
    for (const c9 of curve) if (c9.T > 0) nz9 = Math.max(nz9, c9.n);
    if (nz9 > 0) noLoad = Math.min(noLoad, nz9);
    if (op) op = { ...op, T: Math.max(op.T - TdragAt(op.n), 0) };
    // stall drag is zero, so peakT is untouched by construction
  }

  // efficiency with the full loss set: NET shaft power over input power — op.T is now
  // net of iron/windage drag, so Pin = PoutN + Pfe + Pwind + Pcu·acFr counts each loss once
  const acF9 = latmE || brkE ? 1 : acFr;
  const PoutN = (op ? op.T : 0) * wShaft;
  const eta = PoutN > 0 ? PoutN / (PoutN + Pcu * acF9 + Pfe + Pwind) : 0;

  // ---- backdriven BEMF waveform (PM): harmonic synthesis from pole-arc flux + per-harmonic winding factors ----
  let bemf = null;
  if (p.motorType === "pm" && Nser > 0 && BgAvg > 0) {
    const fBd = (Math.max(p.bdRpm, 1) * poles) / 120;
    const kwH = (k) => {
      let re2 = 0, im2 = 0, n2 = 0;
      topLayer.forEach((t, i2) => {
        if (t.phase === 0) {
          const th2 = k * i2 * gamma + (t.sign < 0 ? Math.PI : 0);
          re2 += Math.cos(th2); im2 += Math.sin(th2); n2++;
        }
      });
      let v = n2 ? Math.hypot(re2, im2) / n2 : 0;
      if (layers === 2) v *= Math.abs(Math.sin((k * span * gamma) / 2)); // span = 1 for tooth-wound
      return v;
    };
    const ks = [1, 3, 5, 7, 9, 11, 13];
    const Ek = ks.map((k) => {
      const bk = ((4 / Math.PI) * BgAvg * Math.sin((k * (p.poleArc / 100) * Math.PI) / 2)) / k;
      return 4.44 * fBd * kwH(k) * kskH(k) * Nser * ((2 * bk * D * L) / poles); // rms, per phase; skew filters harmonics harder than the fundamental
    });
    const NPT = 241;
    const phW = (thE, off) => ks.reduce((acc, k, j) => acc + Math.SQRT2 * Ek[j] * Math.sin(k * (thE - off)), 0);
    const ea = [], eb = [], ec = [], vab = [], vbc = [], vca = [];
    for (let i2 = 0; i2 < NPT; i2++) {
      const th2 = (i2 / (NPT - 1)) * 4 * Math.PI; // two electrical cycles
      const a2 = phW(th2, 0), b2 = phW(th2, (2 * Math.PI) / 3), c2 = phW(th2, (4 * Math.PI) / 3);
      ea.push(a2); eb.push(b2); ec.push(c2);
      vab.push(a2 - b2); vbc.push(b2 - c2); vca.push(c2 - a2);
    }
    const metr = (arr) => {
      const half = arr.slice(0, Math.ceil(NPT / 2));
      return {
        Vpp: Math.max(...half) - Math.min(...half),
        Vrms: Math.sqrt(half.reduce((a3, v) => a3 + v * v, 0) / half.length),
      };
    };
    const thdPh = Ek[0] > 0 ? Math.sqrt(Ek.slice(1).reduce((a3, e) => a3 + e * e, 0)) / Ek[0] : 0;
    const thdLL = Ek[0] > 0
      ? Math.sqrt(ks.reduce((a3, k, j) => (j > 0 && k % 3 !== 0 ? a3 + Ek[j] * Ek[j] : a3), 0)) / Ek[0]
      : 0;
    bemf = {
      f: fBd, thdPh, thdLL,
      ll: { tr: [vab, vbc, vca], ...metr(vab) },
      ph: { tr: [ea, eb, ec], ...metr(ea) },
    };
  }

  // ---- cogging torque profile (PM): edge-passing energy model ----
  let cog = null;
  if (p.motorType === "pm" && BgAvg > 0 && airgap > 0) {
    const gcd = (a2, b2) => (b2 ? gcd(b2, a2 % b2) : a2);
    const Ncog = (Ns * poles) / gcd(Ns, poles);          // cogging cycles per mech rev
    const perDeg = 360 / Ncog;
    const gp = (airgap * kcGap + p.magT / mag.mur) / 1000; // effective magnetic gap, m — the PM branch's Carter coefficient, not a fudge (v59.8)
    const b0 = p.slotOpen / 1000, Lm3 = p.stackL / 1000;
    const eta2 = b0 / (b0 + 4 * gp);
    const dW = ((BgAvg * BgAvg) / (2 * 4e-7 * Math.PI)) * b0 * Lm3 * gp * eta2; // J per edge crossing
    const wA = Math.max((b0 / 2 + 2 * (airgap / 1000)) / (p.rotorOD / 2000), 1e-4); // edge-interaction width: half opening + fringing ~2g, over rotor radius
    const arcHalf = ((p.poleArc / 100) * Math.PI) / poles;
    const wrap = (x) => { let y = x % (2 * Math.PI); if (y > Math.PI) y -= 2 * Math.PI; if (y < -Math.PI) y += 2 * Math.PI; return y; };
    const NPT2 = 241, span2 = (2 * perDeg * Math.PI) / 180; // two cogging periods
    const thArr = [], tArr = [];
    const amp = dW / (Math.sqrt(2 * Math.PI) * wA);
    for (let i3 = 0; i3 < NPT2; i3++) {
      const th3 = (i3 / (NPT2 - 1)) * span2;
      let tau = 0;
      for (let m3 = 0; m3 < poles; m3++) {
        const cm = (2 * Math.PI * m3) / poles + th3;
        for (const [edge, sgn] of [[cm - arcHalf, 1], [cm + arcHalf, -1]]) {
          for (let i4 = 0; i4 < Ns; i4++) {
            const d = wrap(edge - (2 * Math.PI * i4) / Ns);
            if (Math.abs(d) < 4 * wA) tau += sgn * amp * (d / wA) * Math.exp((-d * d) / (2 * wA * wA)) * Math.E ** 0.5 * 0.6065; // normalized dGauss
          }
        }
      }
      thArr.push((th3 * 180) / Math.PI);
      tArr.push(tau);
    }
    // skew attenuation: a conductor/magnet edge skewed across the stack averages the
    // cogging waveform over skewDeg of rotation — the classic sinc over the cogging
    // period. One full period of skew ("covering a full bar") nulls the fundamental.
    const kskCog = skewDeg > 0 ? Math.abs(Math.sin(Math.PI * skewDeg / perDeg) / (Math.PI * skewDeg / perDeg)) : 1;
    if (kskCog !== 1) for (let i5 = 0; i5 < tArr.length; i5++) tArr[i5] *= kskCog;
    const Tpk = Math.max(...tArr.map(Math.abs));
    const Trms = Math.sqrt(tArr.reduce((a4, v) => a4 + v * v, 0) / tArr.length);
    cog = { Ncog, perDeg, thArr, tArr, Tpk, Trms, Tpp: Math.max(...tArr) - Math.min(...tArr), kskCog };
  }

  if (p.motorType === "induction" && Eph > Vph) w.push("Back-EMF exceeds supply phase voltage — lower turns, B̂g, or frequency.");
  if (q < 0.25) w.push("Slots per pole per phase is very low (q = " + q.toFixed(2) + ").");

  // (acFr / Pwind moved above eta — see the loss chain before the BEMF section)

  // ---- lumped thermal: Cu -> lamination -> housing -> ambient, steady state + periodic duty ----
  // duty model: square-wave power, housing node averages (valid for cycle « machine tau),
  // winding node rides the classic intermittent pulse factor (1−e^−ton/τ)/(1−e^−tc/τ)
  const duty9 = Math.min(Math.max(Number.isFinite(p.dutyPct) ? p.dutyPct : 100, 5), 100) / 100;
  const cycT9 = Math.max(Number.isFinite(p.cycleT) ? p.cycleT : 10, 0.5);
  const pulseF = (tauW9) => {
    if (duty9 >= 1 || !(tauW9 > 0)) return 1;
    const ton = duty9 * cycT9;
    return (1 - Math.exp(-ton / tauW9)) / Math.max(1 - Math.exp(-cycT9 / tauW9), 1e-9);
  };
  const CP_CU = 385, CP_FE = 460;                          // J/kg·K
  const COOLH = { "Sealed": 10, "Open air": 40, "Cold plate": 220 };
  const hOut = COOLH[p.cooling] || 40;
  const AslotW = Ns * ((2 * Math.max(hs, 0) + Math.max(w1, 0) + Math.max(w2, 0)) / 1000) * (p.stackL / 1000);
  const RthCu = AslotW > 0 ? 1 / (400 * AslotW) : 99;      // impregnated winding-to-iron
  const AoutH = Math.PI * (p.statorOD / 1000) * ((p.stackL * 1.6) / 1000) + 2 * Math.PI * Math.pow(p.statorOD / 2000, 2);
  const RthOut = 1 / (hOut * Math.max(AoutH, 1e-4));
  let therm = null;
  if (p.motorType === "latm" && latm) {
    // stationary toroid: winding heat leaves through both ring faces over the covered arc
    const RextO = Math.max(p.Rext, 0) / 1000;
    const Ra20 = Math.max((latm.Ra - RextO) / (1 + 0.00393 * (p.Tcu - 20)), 1e-6);
    latm.Ra20 = Ra20 + RextO;                                        // terminal resistance at ambient
    const kcov2 = Math.min((Math.max(p.latmSect, 1) * Math.max(p.latmSpan, 5)) / 360, 1);
    const AtorW = 2 * (Math.PI * ((p.statorID + p.statorOD) / 2 / 1000) * (p.stackL / 1000)) * kcov2; // ID + OD faces
    const RthCuT = AtorW > 0 ? 1 / (400 * AtorW) : 99;
    const RthTot = RthCuT + RthOut;
    let Tc = p.Tamb + 40;
    for (let it3 = 0; it3 < 10; it3++) {
      const Rh3 = Ra20 * (1 + 0.00393 * (Tc - 20)) + RextO;
      Tc = p.Tamb + latm.Idrv * latm.Idrv * Rh3 * RthTot + Pfe * RthOut;
    }
    const RhMax = Ra20 * (1 + 0.00393 * (p.TcuMax - 20)) + RextO;
    const PcuAllow = Math.max((p.TcuMax - p.Tamb - Pfe * RthOut) / RthTot, 0);
    const Icont = Math.sqrt(PcuAllow / Math.max(RhMax, 1e-6));
    const coreD9 = Math.max((p.statorOD - p.statorID) / 2, 0.5), tw9 = Math.max(p.latmWind, 0.5);
    const MLTt9 = 2 * (p.stackL + 2 * coreD9 + 3 * tw9);
    const mCu = 8960 * (MLTt9 / 1000) * p.turns * Math.max(p.latmSect, 1) * Math.max(p.strands, 1) * aBare * 1e-6;
    const tauW = mCu * CP_CU * RthCuT, tauM = (mCu * CP_CU + coreMass * CP_FE) * RthOut;
    let TcuDuty = null;
    if (duty9 < 1) {
      const pf = pulseF(tauW);
      let Td = p.Tamb + 30;
      for (let it4 = 0; it4 < 8; it4++) {
        const Rh4 = Ra20 * (1 + 0.00393 * (Td - 20)) + RextO;
        const Pc4 = latm.Idrv * latm.Idrv * Rh4;
        Td = p.Tamb + (Pc4 + Pfe) * duty9 * RthOut + Pc4 * RthCuT * pf;
      }
      TcuDuty = Td;
    }
    therm = { Tcu: Tc, Rth: RthTot, Icont, Tcont: Kt * (Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont), mCu, tauW, tauM, TcuDuty, duty: duty9 };
    if (Tc > p.TcuMax) w.push(`Held-on winding temp ≈ ${Math.round(Tc)} °C exceeds the ${p.TcuMax} °C class at the ${latm.Idrv.toFixed(2)} A drive current — a toggle LATM energized continuously needs Idrv ≤ ~${Icont.toFixed(2)} A (current limit or higher-R winding), or pulse duty.`);
  } else if (brushedM && brush) {
    // rotating armature: winding heat crosses the airgap too — lump an extra series resistance
    const RextO = Math.max(p.Rext, 0) / 1000;
    const Ra20 = Math.max((brush.Ra - RextO) / (1 + 0.00393 * (p.Tcu - 20)), 1e-6);
    const Agap = Math.PI * (p.rotorOD / 1000) * (p.stackL / 1000);
    const RthGap = 1 / (60 * Math.max(Agap, 1e-4));                 // rotating-gap convection, first-order
    const RthTot = RthCu + RthGap + RthOut;
    let Tc = p.Tamb + 40;
    for (let it3 = 0; it3 < 10; it3++) {
      const Rh3 = Ra20 * (1 + 0.00393 * (Tc - 20)) + RextO;
      const Pc3 = Iph * Iph * Rh3 + Math.max(p.brushV, 0) * Iph;
      Tc = p.Tamb + Pc3 * RthTot + Pfe * RthOut;
    }
    const RhMax = Ra20 * (1 + 0.00393 * (p.TcuMax - 20)) + RextO;
    const PcuAllow = Math.max((p.TcuMax - p.Tamb - Pfe * RthOut) / RthTot, 0);
    const Vb = Math.max(p.brushV, 0); // solve I²·R + Vb·I = Pallow
    const Icont = (-Vb + Math.sqrt(Vb * Vb + 4 * Math.max(RhMax, 1e-6) * PcuAllow)) / (2 * Math.max(RhMax, 1e-6));
    const mCu = 8960 * (MLT / 2) * brush.Z * Math.max(p.strands, 1) * aBare * 1e-6;
    const tauW = mCu * CP_CU * (RthCu + RthGap), tauM = (mCu * CP_CU + coreMass * CP_FE) * RthOut;
    let TcuDuty = null;
    if (duty9 < 1) {
      const pf = pulseF(tauW);
      let Td = p.Tamb + 30;
      for (let it4 = 0; it4 < 8; it4++) {
        const Rh4 = Ra20 * (1 + 0.00393 * (Td - 20)) + RextO;
        const Pc4 = Iph * Iph * Rh4 + Vb * Iph;
        Td = p.Tamb + (Pc4 + Pfe) * duty9 * RthOut + Pc4 * (RthCu + RthGap) * pf;
      }
      TcuDuty = Td;
    }
    therm = { Tcu: Tc, Rth: RthTot, Icont, Tcont: Kt * (Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  } else {
    // v59.6: heat input now matches the Pcu discrimination above — this branch used the
    // 3-phase winding model (3·Iph²·Rphase) for EVERY machine that landed here, including
    // the 2-phase stepper (which holds 1–2 phases at Imax through its own Rs, a different
    // winding with a different MLT) and the brake (whose loss is the released coil's
    // hold power at the economizer voltage, self-limiting as the coil heats).
    const RextO = Math.max(p.Rext, 0) / 1000;
    const stpTh = stpE && step, brkTh = brkE && brake;
    const tcoF = 1 + 0.00393 * (p.Tcu - 20);
    const kPh = stpTh ? (step.on2 ? 2 : 1) : brkTh ? 1 : 3;      // energized circuits
    const phN = stpTh ? 2 : brkTh ? 1 : 3;                       // circuits carrying copper mass
    const R20a = stpTh ? Math.max((step.Rs - RextO) / tcoF, 1e-6)
      : brkTh ? Math.max((brake.Rb - RextO) / tcoF, 1e-6)
      : Rphase;
    const IofT = (Rh9) => brkTh ? (brake.eco * p.Vdc) / Math.max(Rh9, 1e-6)
      : stpTh ? Math.max(p.Imax, 0) : Iph;
    let Tc = p.Tamb + 40;
    for (let it3 = 0; it3 < 10; it3++) {
      const Rh3 = R20a * (1 + 0.00393 * (Tc - 20)) + RextO;
      const I3 = IofT(Rh3);
      const Pc3 = kPh * I3 * I3 * Rh3;
      Tc = p.Tamb + Pc3 * (RthCu + RthOut) + Pfe * RthOut;
    }
    const RhMax = R20a * (1 + 0.00393 * (p.TcuMax - 20)) + RextO;
    const PcuAllow = Math.max((p.TcuMax - p.Tamb - Pfe * RthOut) / (RthCu + RthOut), 0);
    const Icont = Math.sqrt(PcuAllow / (kPh * Math.max(RhMax, 1e-6)));
    // copper mass: brake from its actual wire length; stepper first-order on the shared
    // MLT (its true MLTs is branch-local) — mass only shapes the duty transient, not steady state
    const mCu = brkTh
      ? 8960 * brake.wireLen * Math.max(p.strands, 1) * aBare * 1e-6
      : 8960 * phN * MLT * coilsPerPhase * Math.max(p.turns, 1) * Math.max(p.strands, 1) * aBare * 1e-6;
    const tauW = mCu * CP_CU * RthCu, tauM = (mCu * CP_CU + coreMass * CP_FE) * RthOut;
    let TcuDuty = null;
    if (duty9 < 1) {
      const pf = pulseF(tauW);
      let Td = p.Tamb + 30;
      for (let it4 = 0; it4 < 8; it4++) {
        const Rh4 = R20a * (1 + 0.00393 * (Td - 20)) + RextO;
        const I4 = IofT(Rh4);
        const Pc4 = kPh * I4 * I4 * Rh4;
        Td = p.Tamb + (Pc4 + Pfe) * duty9 * RthOut + Pc4 * RthCu * pf;
      }
      TcuDuty = Td;
    }
    therm = { Tcu: Tc, Rth: RthCu + RthOut, Icont, Tcont: Kt * (Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  }


  return {
    err, warn: w, Ns, poles, airgap, hs, w1, w2, slotArea, usableArea,
    dBare, dIns, aBare, condPerSlot, fillGross, fillCu, fillInsSlot, fillCuSlot, q, span, kw, rcFil, ksat, kIT, satCurve,
    skewDeg, ksk, skewSlant, skewArc,
    Nser, MLT, Rphase, Rll, Iph, Iline: IlineOut, Istall, Vph, Arms,
    Trated, nSync, nShaft, Pout: PoutN, Pcu, eta, Eph, Ke, Kt, VphAvail,
    rotation, topLayer, botLayer, layers, curve, op, noLoad, peakT, baseN,
    mag, BrT, HcJT, HcJmin, demagT, kcGap, BgAvg, B1, BgEff, Hdemag, demagMargin,
    cal: calAct ? { kR: cKR, kL: cKL, kKe: cKe, kKt: cKt, Td: cTd } : null,
    MLTmm, endSide, tb, coilOD, coilDia, bobSuggest, coilArc,
    stM, rtM, Bt, By, Byr, hyr, coreMass, mYoke, mTeeth, efFe, Bavg, TstallW, Jimp, bemf, Rhot, cog,
    Lph, LphNR, Lll, LllNR, acim, therm, acFr, Pwind, Pfe, feOp, brush, latm, brake, step,
  };
}

/* ================= 2-D magnetostatic field solver (FEA-light) =================
   A real field solution for the radial-flux machines, living in the same file as
   the analytical core so the gates can drive both and compare them.

   FORMULATION. Magnetic vector potential A = Az(r,θ)ẑ on a structured polar grid,
   finite-VOLUME so flux is conserved cell to cell:

       Σ_faces  ν_face · (A_nb − A_P) · (face length / node distance)  =  −I_cell

   Radial faces contribute ν·r_face·Δθ/Δr, angular faces ν·Δr/(r·Δθ), and face
   reluctivities are harmonic means so material jumps (iron↔air) are handled without
   smearing. Nonlinear iron enters as ν(|B|) from the SAME Froelich curve (Hof) the
   analytical branch uses — one BH model in the whole tool.

   MAGNETS. A radially magnetized arc has M = Br/μ0 r̂ inside and 0 outside, so its
   equivalent magnetization current ∇×M = −(1/r)(∂M_r/∂θ)ẑ lives on the arc's SIDE
   faces. Discretely that is the θ-derivative of M_r, which means rotor rotation is
   just a shift of the magnetization pattern on a FIXED mesh — no remeshing. Magnet
   edges carry FRACTIONAL cell occupancy, so a rotating magnet sweeps smoothly across
   cells instead of snapping; without that, the staircase produces spurious torque
   ripple far larger than real cogging.

   MESH. Radially GRADED: cells are concentrated in the airgap (the region that sets
   every number worth having) and thinned in the yoke. Segment boundaries land exactly
   on the physical radii (magnet ID/OD, bore, tip, slot top), so no material boundary
   falls mid-cell. θ is uniform and periodic over the full 360°, so no symmetry is
   assumed and fractional-slot machines solve correctly.

   SOLVER. Radial LINE relaxation: for every angular column the tridiagonal system in
   r is solved exactly (Thomas), with the θ-coupling taken from the current iterate
   (line Gauss-Seidel) plus over-relaxation. Point SOR converges badly here because a
   thin airgap makes the grid violently anisotropic; solving along r removes that.

   BOUNDARY. Az = 0 at the stator OD (flux stays inside the iron); natural (Neumann)
   at the shaft bore.

   TORQUE. Maxwell stress averaged over SEVERAL mid-gap circles (single-circle stress
   is notoriously mesh-noisy): T = (L r²/μ0)∮ B_r B_θ dθ.

   HONEST LIMITS: first-order structured solver — no adaptive meshing, slot corners
   land on grid lines, fields are linear in a cell, and it is magnetostatic (no eddy
   currents, no hysteresis). It exists to CHECK the analytical core; where the two
   disagree, the disagreement is the finding. ================================== */

const MU0 = 4e-7 * Math.PI;
const FR_AIR = 0, FR_STAT = 1, FR_ROT = 2;

/* graded radial faces: `segs` = [{ r0, r1, n }] contiguous, boundaries preserved */
function gradeRadial(segs) {
  const rf = [segs[0].r0];
  for (const s of segs) {
    for (let k = 1; k <= s.n; k++) rf.push(s.r0 + ((s.r1 - s.r0) * k) / s.n);
  }
  return Float64Array.from(rf);
}

/* Fixed region map + magnet-ring mask. nrHint sets overall refinement. */
function fieldMesh(p, nrHint, nth) {
  const Ns = Math.max(3, Math.round(p.slots));
  const poles = Math.max(2, Math.round(p.poles / 2) * 2);
  const rSh = Math.max(p.shaftD / 2, 0.5);
  const rRot = p.rotorOD / 2;
  const rMagIn = Math.max(rRot - p.magT, rSh + 0.2);
  const rBore = p.statorID / 2;
  const hs9 = Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0.2);
  const rTip = rBore + p.tipH;
  const rSlotTop = rTip + hs9;
  const rOD = p.statorOD / 2;
  // cell budget by importance: the airgap gets the most per mm, the yoke the least
  const sc = Math.max(nrHint / 56, 0.5);
  const nOf = (n) => Math.max(Math.round(n * sc), 2);
  const rf = gradeRadial([
    { r0: rSh, r1: rMagIn, n: nOf(8) },        // rotor back iron
    { r0: rMagIn, r1: rRot, n: nOf(8) },       // magnet
    { r0: rRot, r1: rBore, n: nOf(8) },        // AIRGAP — refined
    { r0: rBore, r1: rTip, n: nOf(4) },        // tooth tips
    { r0: rTip, r1: rSlotTop, n: nOf(16) },    // slots / tooth bodies
    { r0: rSlotTop, r1: rOD, n: nOf(10) },     // yoke
  ]);
  const nr = rf.length - 1;
  const rC = new Float64Array(nr), drC = new Float64Array(nr);
  for (let i = 0; i < nr; i++) { rC[i] = (rf[i] + rf[i + 1]) / 2; drC[i] = rf[i + 1] - rf[i]; }
  const dth = (2 * Math.PI) / nth;
  const reg = new Uint8Array(nr * nth);
  const isMag = new Uint8Array(nr);            // magnet ring by radial band
  const slotPitch = (2 * Math.PI) / Ns;
  for (let i = 0; i < nr; i++) {
    const r = rC[i];
    if (r > rMagIn && r < rRot) isMag[i] = 1;
    for (let j = 0; j < nth; j++) {
      const th = (j + 0.5) * dth;
      let m = FR_AIR;
      if (r < rMagIn) m = FR_ROT;                                  // shaft + rotor yoke, one material
      else if (r < rBore) m = FR_AIR;                              // magnet ring & airgap (magnet ν set below)
      else if (r < rOD) {
        const off = ((th % slotPitch) + slotPitch) % slotPitch - slotPitch / 2;
        if (r < rTip) {
          const openHalf = p.slotOpen / 2 / r;
          m = Math.abs(Math.abs(off) - slotPitch / 2) < openHalf ? FR_AIR : FR_STAT;
        } else if (r < rSlotTop) {
          m = Math.abs(off) < p.toothW / 2 / r ? FR_STAT : FR_AIR;
        } else m = FR_STAT;
      }
      reg[i * nth + j] = m;
    }
  }
  // gap circles used for Maxwell stress (averaged): all cells strictly inside the gap
  const gapIdx = [];
  for (let i = 0; i < nr; i++) if (rC[i] > rRot && rC[i] < rBore) gapIdx.push(i);
  if (!gapIdx.length) for (let i = 0; i < nr; i++) if (rC[i] > rRot * 0.999 && rC[i] < rBore * 1.001) gapIdx.push(i);
  return { nr, nth, rf, rC, drC, dth, reg, isMag, Ns, poles,
    rSh, rMagIn, rRot, rBore, rTip, rSlotTop, rOD, gapIdx,
    rGap: (rRot + rBore) / 2 };
}

/* Magnetization M_r (A/m) at a rotor position. Magnet edges get FRACTIONAL
   occupancy so rotation is smooth on the fixed mesh. */
function magPattern(p, msh, rotRad, BrT) {
  const M = new Float64Array(msh.nr * msh.nth);
  const poles = msh.poles, polePitch = (2 * Math.PI) / poles;
  const arcHalf = ((Math.min(Math.max(p.poleArc, 5), 100) / 100) * polePitch) / 2;
  const Mmag = BrT / MU0, dth = msh.dth;
  for (let i = 0; i < msh.nr; i++) {
    if (!msh.isMag[i]) continue;
    for (let j = 0; j < msh.nth; j++) {
      // fraction of this cell's angular span covered by a magnet, and its polarity
      const thA = j * dth - rotRad, thB = (j + 1) * dth - rotRad;
      let cov = 0, pol = 0;
      const kA = Math.floor(thA / polePitch) - 1, kB = Math.floor(thB / polePitch) + 1;
      for (let k = kA; k <= kB; k++) {
        const cen = (k + 0.5) * polePitch;
        const a = Math.max(thA, cen - arcHalf), b = Math.min(thB, cen + arcHalf);
        if (b > a) {
          const f = (b - a) / dth;
          const s = ((k % 2) + 2) % 2 === 0 ? 1 : -1;
          cov += f * s;                                   // signed coverage
          pol = s;
        }
      }
      if (cov !== 0) M[i * msh.nth + j] = cov * Mmag;
      void pol;
    }
  }
  return M;
}

/* Thomas algorithm for a tridiagonal system (a·x[i-1] + b·x[i] + c·x[i+1] = d). */
function triSolve(a, b, c, d, x, n, cp, dp) {
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
}

/* Solve one rotor position. opts: { warm, nl, sweeps, tol, relax }. */
function solveField(p, msh, M, opts) {
  const o = opts || {};
  const { nr, nth, rf, rC, drC, dth, reg } = msh;
  const N = nr * nth;
  const A = o.warm && o.warm.length === N ? Float64Array.from(o.warm) : new Float64Array(N);
  const nu = new Float64Array(N), Bmag = new Float64Array(N);
  const stM = STEELS[p.statorMat] || STEELS["M19 (29 ga)"];
  const rtM = STEELS[p.rotorMat] || STEELS["1018 steel (solid)"];
  const magM = MAGNETS[p.mag] || MAGNETS["N42"];
  const nuAir = 1 / MU0, nuMag = 1 / (MU0 * (magM.mur || 1.05));
  const matOf = (m) => (m === FR_STAT ? stM : m === FR_ROT ? rtM : null);
  for (let i = 0; i < nr; i++) for (let j = 0; j < nth; j++) {
    const k = i * nth + j, mt = matOf(reg[k]);
    nu[k] = mt ? 1 / (MU0 * (mt.muri || 1000)) : (msh.isMag[i] ? nuMag : nuAir);
  }
  // source: −∂M_r/∂θ integrated over the cell = −(M_{j+½} − M_{j−½})·Δr
  const src = new Float64Array(N);
  for (let i = 0; i < nr; i++) for (let j = 0; j < nth; j++) {
    const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
    const dM = (M[i * nth + jp] - M[i * nth + jm]) / 2;
    if (dM !== 0) src[i * nth + j] = -dM * drC[i];
  }
  // geometric face factors (θ-independent)
  const gRp = new Float64Array(nr), gRm = new Float64Array(nr), gT = new Float64Array(nr);
  for (let i = 0; i < nr; i++) {
    gRp[i] = i === nr - 1 ? 0 : (rf[i + 1] * dth) / ((drC[i] + drC[i + 1]) / 2);
    gRm[i] = i === 0 ? 0 : (rf[i] * dth) / ((drC[i] + drC[i - 1]) / 2);
    gT[i] = drC[i] / (rC[i] * dth);
  }
  const a = new Float64Array(nr), b = new Float64Array(nr), c = new Float64Array(nr);
  const d = new Float64Array(nr), x = new Float64Array(nr);
  const cp = new Float64Array(nr), dp = new Float64Array(nr);
  const relax = o.relax || 1.25;
  const nlMax = o.nl || 14, swMax = o.sweeps || 90, tol = o.tol || 1e-3;
  let conv = false, sweeps = 0, resid = Infinity;
  const hmean = (u, v) => (2 * u * v) / (u + v);
  for (let nl = 0; nl < nlMax; nl++) {
    // ---- linear solve at frozen ν: radial line Gauss-Seidel ----
    for (let sw = 0; sw < swMax; sw++) {
      let maxd = 0, scale = 1e-30;
      for (let j = 0; j < nth; j++) {
        const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
        for (let i = 0; i < nr; i++) {
          const k = i * nth + j;
          if (i === nr - 1) { a[i] = 0; b[i] = 1; c[i] = 0; d[i] = 0; continue; }
          const nuP = nu[k];
          const fE = hmean(nuP, nu[i * nth + jp]) * gT[i];
          const fW = hmean(nuP, nu[i * nth + jm]) * gT[i];
          const fN = i === nr - 1 ? 0 : hmean(nuP, nu[(i + 1) * nth + j]) * gRp[i];
          const fS = i === 0 ? 0 : hmean(nuP, nu[(i - 1) * nth + j]) * gRm[i];
          a[i] = -fS; c[i] = -fN; b[i] = fE + fW + fN + fS;
          if (b[i] <= 0) { a[i] = 0; c[i] = 0; b[i] = 1; d[i] = A[k]; continue; }
          d[i] = fE * A[i * nth + jp] + fW * A[i * nth + jm] + src[k];
        }
        triSolve(a, b, c, d, x, nr, cp, dp);
        for (let i = 0; i < nr; i++) {
          const k = i * nth + j;
          const dd = x[i] - A[k];
          A[k] += relax * dd;
          const ad = Math.abs(dd); if (ad > maxd) maxd = ad;
          const av = Math.abs(A[k]); if (av > scale) scale = av;
        }
      }
      sweeps++;
      resid = maxd / scale;
      if (sw > 3 && resid < tol * 0.05) break;
    }
    // ---- B, then ν from the Froelich curve ----
    let dmax = 0;
    for (let i = 0; i < nr; i++) for (let j = 0; j < nth; j++) {
      const k = i * nth + j;
      const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
      const Br9 = (A[i * nth + jp] - A[i * nth + jm]) / (2 * rC[i] * dth);
      const iu = Math.min(i + 1, nr - 1), id = Math.max(i - 1, 0);
      const Bt9 = -(A[iu * nth + j] - A[id * nth + j]) / (rC[iu] - rC[id] || 1e-9);
      const B9 = Math.hypot(Br9, Bt9);
      Bmag[k] = B9;
      const mt = matOf(reg[k]);
      if (!mt) continue;
      const Bc = Math.min(B9, (mt.bsat || 2) * 0.995);
      const nuNew = Bc > 1e-6 ? Hof(Bc, mt) / Bc : 1 / (MU0 * (mt.muri || 1000));
      const rel = Math.abs(nuNew - nu[k]) / Math.max(nu[k], 1e-9);
      if (rel > dmax) dmax = rel;
      nu[k] = nu[k] * 0.35 + nuNew * 0.65;
    }
    if (dmax < tol) { conv = true; break; }
  }
  return { A, B: Bmag, nu, conv, sweeps, resid };
}

/* Air-gap quantities: B around the mid-gap, and Maxwell-stress torque averaged
   over every gap circle (single-circle stress is mesh-noisy). */
function gapQuantities(p, msh, A) {
  const { nth, dth, rC, gapIdx } = msh;
  const iMid = gapIdx[Math.floor(gapIdx.length / 2)];
  const Br9 = new Float64Array(nth), Bt9 = new Float64Array(nth);
  const rMid = rC[iMid];
  for (let j = 0; j < nth; j++) {
    const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
    Br9[j] = (A[iMid * nth + jp] - A[iMid * nth + jm]) / (2 * rMid * dth);
    Bt9[j] = -(A[(iMid + 1) * nth + j] - A[(iMid - 1) * nth + j]) / (rC[iMid + 1] - rC[iMid - 1]);
  }
  const L = p.stackL / 1000;
  let Tsum = 0, nT = 0;
  for (const i of gapIdx) {
    if (i <= 0 || i >= msh.nr - 1) continue;
    const r = rC[i], rm = r / 1000;
    let integ = 0;
    for (let j = 0; j < nth; j++) {
      const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
      const br = (A[i * nth + jp] - A[i * nth + jm]) / (2 * r * dth);
      const bt = -(A[(i + 1) * nth + j] - A[(i - 1) * nth + j]) / (rC[i + 1] - rC[i - 1]);
      integ += br * bt * dth;
    }
    Tsum += (L * rm * rm / MU0) * integ; nT++;
  }
  let sum2 = 0, peak = 0;
  for (let j = 0; j < nth; j++) { sum2 += Br9[j] * Br9[j]; peak = Math.max(peak, Math.abs(Br9[j])); }
  return { Br: Br9, Bt: Bt9, T: nT ? Tsum / nT : 0, Brms: Math.sqrt(sum2 / nth), Bpk: peak, rGap: rMid };
}

/* Spatial harmonic amplitude of the gap field at pole-pair order n. */
function gapHarmonic(Br9, n) {
  const N = Br9.length;
  let re = 0, im = 0;
  for (let j = 0; j < N; j++) {
    const th = ((j + 0.5) * 2 * Math.PI) / N;
    re += Br9[j] * Math.cos(n * th); im += Br9[j] * Math.sin(n * th);
  }
  return (2 / N) * Math.hypot(re, im);
}

/* ---- app-facing entry: solve, summarize, CROSS-CHECK the analytic core. Pure.
   opts: { nr, nth, cog (rotor steps, 0 = skip), quick } ---- */
function fieldStudy(p, r, opts) {
  const o = opts || {};
  if (p.motorType !== "pm" && p.motorType !== "brushed") return { err: "The field solver covers BLDC/PMSM and brushed PM designs." };
  if (!r || r.err.length) return { err: "Fix the design's errors before solving the field." };
  if (!(p.magT > 0) || !(r.airgap > 0)) return { err: "Needs a positive magnet thickness and airgap." };
  const nrH = Math.max(Math.round(o.nr || 56), 20), nth = Math.max(Math.round(o.nth || 288), 96);
  const msh = fieldMesh(p, nrH, nth);
  const BrT = r.BrT;
  const M0 = magPattern(p, msh, 0, BrT);
  const s0 = solveField(p, msh, M0, { nl: o.quick ? 8 : 16, sweeps: o.quick ? 60 : 110 });
  const g0 = gapQuantities(p, msh, s0.A);
  const pp = msh.poles / 2;
  const B1 = gapHarmonic(g0.Br, pp);
  // dominant spatial order — a correct solve peaks at the pole-pair number
  let domN = 1, domA = 0;
  for (let n = 1; n <= Math.min(msh.poles * 2, Math.floor(nth / 4)); n++) {
    const a9 = gapHarmonic(g0.Br, n);
    if (a9 > domA) { domA = a9; domN = n; }
  }
  let posArea = 0;
  for (let j = 0; j < nth; j++) if (g0.Br[j] > 0) posArea += g0.Br[j] * g0.rGap * msh.dth;
  const fluxPole = ((posArea / pp) / 1000) * (p.stackL / 1000);         // Wb per pole
  // NO COGGING TORQUE FROM THIS SOLVER — deliberately, and this is the interesting part.
  // Maxwell-stress cogging was implemented, then removed when its own mesh-convergence
  // study (36x216 -> 96x576 cells) showed the gap field converging to within ±2% while
  // the cogging ripple DIVERGED, 4.0e-2 -> 3.9e-1 N·m. A structured polar mesh staircases
  // the curved slot-opening and tooth-side boundaries; stress-tensor torque is a small
  // difference of large quantities and integrates that staircase noise, which grows with
  // refinement rather than vanishing. Everything this function does return passed the
  // same study. A real cogging capability needs conforming (body-fitted) elements or a
  // virtual-work / co-energy formulation, which is volume-integrated and far less
  // boundary-sensitive; until then the analytical cogging model is the app's source.
  return {
    msh, A: s0.A, B: s0.B, conv: s0.conv, sweeps: s0.sweeps, resid: s0.resid,
    gap: g0, B1, domN, fluxPole,
    cmp: {
      BgField: g0.Bpk, BgAnalytic: r.BgAvg,
      B1Field: B1, B1Analytic: r.B1,
      dB1: r.B1 > 0 ? (B1 - r.B1) / r.B1 : NaN,
    },
    nr: msh.nr, nth,
  };
}

/* ================= efficiency map / drive cycle =================
   Both sweep the SAME loss physics computeDesign uses — no second model. The
   pre-v60 EfficiencyMap view carried its own copy with a (n/n0)^1.5 iron-loss
   guess; these replace it so one change to the loss chain moves every screen.

   Torque axis is SHAFT torque (the curve is already drag-corrected), so
   eta = Pout / (Pout + Pcu·acFr + Pfe + Pwind) with each loss counted once —
   identical to the operating-point efficiency the results column reports. */

/* losses at an arbitrary (speed, shaft torque) for a computed design; pure. */
function lossesAt(p, r, n9, T9) {
  const w9 = (n9 * 2 * Math.PI) / 60;
  const brushedM = p.motorType === "brushed";
  // Signed torque: braking (T < 0) still draws current — and still heats the winding —
  // but is NOT useful shaft output. Regeneration back to the bus is not modeled, so a
  // braking sample counts its copper/iron loss with zero output (conservative, disclosed).
  const Pout = Math.max(T9, 0) * w9;
  // electrical frequency: PM/brushed commutation both follow n·poles/120
  const fe9 = Math.max((n9 * r.poles) / 120, 0);
  // drag first — shaft torque plus drag is what the winding must actually produce
  const Pw9 = 0.01 * Math.PI * 1.2 * Math.pow(w9, 3) * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000);
  const feT = (B9) => {
    const b9 = Math.min(B9, 2.4) / 1.5;
    return (1 - r.efFe) * Math.pow(b9, 1.8) * (fe9 / 60) + r.efFe * b9 * b9 * Math.pow(fe9 / 60, 2);
  };
  const Pfe9 = (r.mYoke * feT(r.By) + r.mTeeth * feT(r.Bt)) * r.stM.w;
  const Tdrag = w9 > 0 ? (Pfe9 + Pw9) / w9 : 0;
  // current follows the MAGNITUDE of electromagnetic torque; drag opposes motion, so it
  // adds when motoring and subtracts (the machine is already being slowed) when braking
  const Tem = T9 >= 0 ? T9 + Tdrag : Math.abs(T9) - Tdrag;
  const I9 = r.Kt > 0 ? Math.max(Tem, 0) / r.Kt : 0;
  // AC copper factor at THIS speed's frequency (Dowell, same form as the engine)
  let acF = 1;
  if (fe9 > 0 && r.dBare > 0) {
    const delta = Math.sqrt(RHO_CU / (Math.PI * fe9 * 4e-7 * Math.PI)) * 1000;
    const NlL = Math.ceil(Math.sqrt(Math.max(r.condPerSlot, 1)));
    acF = Math.min(1 + ((5 * NlL * NlL - 1) / 45) * Math.pow(r.dBare / delta, 4), 4);
  }
  const Pcu9 = brushedM && r.brush
    ? (I9 * I9 * r.brush.Ra + Math.max(p.brushV, 0) * I9) * acF
    : 3 * I9 * I9 * r.Rhot * acF;
  const Pin = Pout + Pcu9 + Pfe9 + Pw9;
  return { n: n9, T: T9, I: I9, Pout, Pcu: Pcu9, Pfe: Pfe9, Pwind: Pw9, Pin,
    eta: Pin > 0 && Pout > 0 ? Pout / Pin : 0 };
}

/* efficiency map over the drive envelope. opts: { nc, nr } grid resolution. */
function efficiencyMap(p, r, opts) {
  const o9 = opts || {};
  if (!(p.motorType === "pm" || p.motorType === "brushed")) return null;
  if (!r || r.err.length || !(r.Kt > 0) || !(r.noLoad > 0) || !r.curve || r.curve.length < 2) return null;
  const NC = Math.max(Math.round(o9.nc || 56), 8), NR = Math.max(Math.round(o9.nr || 40), 6);
  const cv = [...r.curve].sort((a9, b9) => a9.n - b9.n);
  const tAt = (n9) => {                                       // envelope torque at a speed
    if (n9 <= cv[0].n) return cv[0].T;
    for (let i9 = 1; i9 < cv.length; i9++) if (cv[i9].n >= n9) {
      const f9 = (n9 - cv[i9 - 1].n) / Math.max(cv[i9].n - cv[i9 - 1].n, 1e-9);
      return cv[i9 - 1].T + f9 * (cv[i9].T - cv[i9 - 1].T);
    }
    return 0;
  };
  const nMax = r.noLoad, tMax = Math.max(...cv.map((c9) => c9.T));
  if (!(nMax > 0) || !(tMax > 0)) return null;
  // grid of node values (NC+1 × NR+1) so contours can be traced by marching squares
  const grid = [], inEnv = [];
  for (let j9 = 0; j9 <= NR; j9++) {
    const rowE = [], rowIn = [];
    const T9 = (tMax * j9) / NR;
    for (let i9 = 0; i9 <= NC; i9++) {
      const n9 = (nMax * i9) / NC;
      const ok = n9 > 0 && T9 > 0 && T9 <= tAt(n9);
      rowIn.push(ok);
      rowE.push(ok ? lossesAt(p, r, n9, T9).eta : 0);
    }
    grid.push(rowE); inEnv.push(rowIn);
  }
  // peak-efficiency point and the per-speed best-efficiency locus (the "sweet spot" ridge)
  let best = null; const ridge = [];
  for (let i9 = 1; i9 <= NC; i9++) {
    const n9 = (nMax * i9) / NC;
    const tEnv = tAt(n9);
    if (!(tEnv > 0)) continue;
    let bp = null;
    for (let k9 = 1; k9 <= 40; k9++) {
      const T9 = (tEnv * k9) / 40;
      const L9 = lossesAt(p, r, n9, T9);
      if (!bp || L9.eta > bp.eta) bp = L9;
    }
    if (bp) { ridge.push({ n: bp.n, T: bp.T, eta: bp.eta }); if (!best || bp.eta > best.eta) best = bp; }
  }
  const op = r.op ? lossesAt(p, r, r.op.n, r.op.T) : null;
  // continuous-thermal envelope: torque the winding can hold indefinitely (from the
  // thermal model's Icont), drawn as a second line on the map
  const Tcont = r.therm && Number.isFinite(r.therm.Icont) ? r.Kt * r.therm.Icont : null;
  return { NC, NR, nMax, tMax, grid, inEnv, best, ridge, op, Tcont, tAt,
    envelope: Array.from({ length: NC + 1 }, (_, i9) => ({ n: (nMax * i9) / NC, T: tAt((nMax * i9) / NC) })) };
}

/* drive-cycle evaluation: samples [{t seconds, n rpm, T N·m}] → energy, RMS
   loading, and the winding temperature the cycle's mean copper loss implies
   through the design's own thermal resistance. Pure. */
function driveCycle(p, r, samples) {
  if (!Array.isArray(samples) || samples.length < 2) return { err: "A drive cycle needs at least two samples." };
  if (!(p.motorType === "pm" || p.motorType === "brushed")) return { err: "Drive-cycle evaluation covers BLDC/PMSM and brushed designs." };
  if (!r || r.err.length || !(r.Kt > 0)) return { err: "Fix the design's errors before running a cycle." };
  const pts = samples
    .filter((s9) => Number.isFinite(s9.t) && Number.isFinite(s9.n) && Number.isFinite(s9.T))
    .sort((a9, b9) => a9.t - b9.t);
  if (pts.length < 2) return { err: "No usable samples (need finite t, n, T)." };
  const env = r.curve && r.curve.length ? efficiencyMap(p, r, { nc: 8, nr: 4 }) : null;
  let Eout = 0, Ein = 0, Ecu = 0, Efe = 0, Ew = 0, I2t = 0, T2t = 0, tTot = 0, over = 0, nPk = 0, tPk = 0;
  const trace = [];
  for (let i9 = 1; i9 < pts.length; i9++) {
    const a9 = pts[i9 - 1], b9 = pts[i9];
    const dt = Math.max(b9.t - a9.t, 0);
    if (!(dt > 0)) continue;
    const nMid = (a9.n + b9.n) / 2, tMid = (a9.T + b9.T) / 2;   // midpoint rule
    const L9 = lossesAt(p, r, nMid, tMid);                      // signed: braking heats but does no useful work
    Eout += L9.Pout * dt; Ein += L9.Pin * dt;
    Ecu += L9.Pcu * dt; Efe += L9.Pfe * dt; Ew += L9.Pwind * dt;
    I2t += L9.I * L9.I * dt; T2t += tMid * tMid * dt; tTot += dt;
    nPk = Math.max(nPk, Math.abs(nMid)); tPk = Math.max(tPk, Math.abs(tMid));
    if (env && Math.abs(tMid) > env.tAt(Math.abs(nMid)) * 1.001) over += dt;
    trace.push({ t: b9.t, n: nMid, T: tMid, eta: L9.eta, Pcu: L9.Pcu, Pfe: L9.Pfe });
  }
  if (!(tTot > 0)) return { err: "Cycle has zero duration." };
  const Irms = Math.sqrt(I2t / tTot), Trms = Math.sqrt(T2t / tTot);
  const PcuMean = Ecu / tTot, PfeMean = Efe / tTot;
  // steady winding temperature this cycle implies, through the design's own Rth
  const Rth9 = r.therm && Number.isFinite(r.therm.Rth) ? r.therm.Rth : null;
  const Tcu = Rth9 !== null ? p.Tamb + PcuMean * Rth9 + PfeMean * Math.max(Rth9 * 0.5, 0) : null;
  return { dur: tTot, Eout, Ein, Ecu, Efe, Ew, etaCycle: Ein > 0 ? Eout / Ein : 0,
    Irms, Trms, PcuMean, PfeMean, Tcu, nPk, tPk, overT: over, trace,
    overFrac: over / tTot };
}

/* ================= presentation: CortexEdge theme ================= */
const PHASE = [
  { name: "A", c: "#EF4444" },
  { name: "B", c: "#F59E0B" },
  { name: "C", c: "#3B82F6" },
];
const STEEL = "#94A3B8", STEEL_DK = "#64748B", COPPER = "#3B82F6", INK = "#334155";
const PEACH = "#6366F1", DKINK = "#0F172A";           // indigo active-toggles, slate ink
const CREAM = "#FFFFFF", CREAM_DIM = "#64748B";       // white cards, cool-gray dim text
const PANEL = "#FFFFFF", LINE = "#E2E8F0";            // card bg + borders
const PAPER_LINE = "#E2E8F0", PAPER_DIM = "#64748B", AXIS = "#64748B";
const GRAY = "#6B7280", BG = "#F8FAFC", TBL = "#EFF6FF", TBLLINE = "#DBEAFE";

/* embedded so exported PNGs keep their text styling */
const SVGCSS = ".tick{font:9px monospace;fill:#64748B}.axis{font:10px monospace;fill:#0F172A}" +
  ".dim{font:10px monospace;fill:#64748B}.dimBig{font:600 12px monospace;fill:#92400E}" +
  ".svgLabel{font:600 15px sans-serif;fill:#fff}.wlbl{font:600 9px monospace;fill:#0F172A}" +
  ".wnum{font:7px monospace;fill:#64748B}";

function exportPng(id, name) {
  const svg = document.getElementById(id);
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const vb = svg.viewBox.baseVal, k = 3;
    const c = document.createElement("canvas");
    c.width = vb.width * k; c.height = vb.height * k;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u; a.download = name; a.click();
      URL.revokeObjectURL(u);
    });
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
}

const phCur = (th, ph) => Math.cos(th - (ph * 2 * Math.PI) / 3); // instantaneous phase current (pu)

/* ---- DXF export: stator lamination (OD circle + closed inner slot profile), mm units ---- */
function buildLamDxf(p, r) {
  const Ns = r.Ns, r0 = p.statorID / 2, r1 = r0 + p.tipH, r2 = r1 + Math.max(r.hs, 0);
  const rc = Math.min(Math.max(p.slotR, 0), Math.max(r.w2, 0) / 2, Math.max(r.hs, 0) / 2);
  const pts = [];
  const P = (a, x, y) => pts.push([y * Math.cos(a) - x * Math.sin(a), y * Math.sin(a) + x * Math.cos(a)]); // local (tangential x, radial y) → global
  const ho0 = Math.asin(Math.min(p.slotOpen / 2 / r0, 0.9));
  for (let i = 0; i < Ns; i++) {
    const a = (2 * Math.PI * i) / Ns;
    const so = p.slotOpen / 2, hw1 = r.w1 / 2, hw2 = r.w2 / 2;
    // slot excursion (CCW: -x side up, across the top, +x side down)
    P(a, -so, r0); P(a, -so, r1); P(a, -hw1, r1);
    if (rc > 0.05) {
      const sl = (hw2 - hw1) / (r2 - r1);
      P(a, -(hw2 - sl * rc), r2 - rc);
      for (let k = 1; k <= 5; k++) { const t = (Math.PI / 2) * (k / 5); P(a, -(hw2 - rc) - rc * Math.cos(t) + rc, r2 - rc + rc * Math.sin(t)); }
      P(a, -(hw2 - rc), r2); P(a, hw2 - rc, r2);
      for (let k = 1; k <= 5; k++) { const t = (Math.PI / 2) * (k / 5); P(a, (hw2 - rc) + rc * Math.sin(t), r2 - rc + rc * Math.cos(t)); }
      P(a, hw2 - sl * 0, r2 - rc);
    } else {
      P(a, -hw2, r2); P(a, hw2, r2);
    }
    P(a, hw1, r1); P(a, so, r1); P(a, so, r0);
    // bore arc (tooth-tip face) to the next slot opening
    const aN = (2 * Math.PI * (i + 1)) / Ns;
    const aFrom = a + ho0, aTo = aN - ho0;
    for (let k = 1; k <= 6; k++) {
      const aa = aFrom + ((aTo - aFrom) * k) / 6;
      pts.push([r0 * Math.cos(aa), r0 * Math.sin(aa)]);
    }
  }
  const L2 = [];
  const gp2 = (c, v) => { L2.push(String(c)); L2.push(String(v)); };
  gp2(0, "SECTION"); gp2(2, "HEADER"); gp2(9, "$INSUNITS"); gp2(70, 4); gp2(0, "ENDSEC");
  gp2(0, "SECTION"); gp2(2, "ENTITIES");
  gp2(0, "CIRCLE"); gp2(8, "LAM"); gp2(10, 0); gp2(20, 0); gp2(40, (p.statorOD / 2).toFixed(4));
  gp2(0, "LWPOLYLINE"); gp2(8, "LAM"); gp2(90, pts.length); gp2(70, 1);
  pts.forEach(([x, y]) => { gp2(10, x.toFixed(4)); gp2(20, y.toFixed(4)); });
  gp2(0, "ENDSEC"); gp2(0, "EOF");
  return L2.join("\n");
}

/* ---- DXF export: brushed armature lamination — slots open OUTWARD; shaft bore circle + closed outer profile ---- */
function buildArmDxf(p, r) {
  const Ns = r.Ns, r0 = p.rotorOD / 2, r1 = r0 - p.tipH, r2 = r1 - Math.max(r.hs, 0);
  const rc = Math.min(Math.max(p.slotR, 0), Math.max(Math.min(r.w1, r.w2), 0) / 2, Math.max(r.hs, 0) / 2);
  const pts = [];
  const P = (a, x, y) => pts.push([y * Math.cos(a) - x * Math.sin(a), y * Math.sin(a) + x * Math.cos(a)]); // local (tangential x, radial y) → global
  const ho0 = Math.asin(Math.min(p.slotOpen / 2 / r0, 0.9));
  for (let i = 0; i < Ns; i++) {
    const a = (2 * Math.PI * i) / Ns;
    const so = p.slotOpen / 2, hw1 = r.w1 / 2, hw2 = r.w2 / 2;
    const y0c = Math.sqrt(Math.max(r0 * r0 - so * so, 0));  // opening corners exactly on the armature surface
    // slot excursion inward (-x side down, across the bottom with fillets, +x side up)
    P(a, -so, y0c); P(a, -so, r1); P(a, -hw1, r1);
    if (rc > 0.05) {
      const sl = (hw1 - hw2) / Math.max(r1 - r2, 1e-6);   // wall half-width shrink per radial mm
      P(a, -(hw2 + sl * rc), r2 + rc);
      for (let k = 1; k <= 5; k++) { const t = (Math.PI / 2) * (k / 5); P(a, -(hw2 - rc) - rc * Math.cos(t), r2 + rc - rc * Math.sin(t)); }
      P(a, -(hw2 - rc), r2); P(a, hw2 - rc, r2);
      for (let k = 1; k <= 5; k++) { const t = (Math.PI / 2) * (k / 5); P(a, (hw2 - rc) + rc * Math.sin(t), r2 + rc - rc * Math.cos(t)); }
      P(a, hw2 + sl * rc, r2 + rc);
    } else {
      P(a, -hw2, r2); P(a, hw2, r2);
    }
    P(a, hw1, r1); P(a, so, r1); P(a, so, y0c);
    // armature surface arc (tooth-tip face) to the next slot opening
    const aN = (2 * Math.PI * (i + 1)) / Ns;
    const aFrom = a + ho0, aTo = aN - ho0;
    for (let k = 1; k <= 6; k++) {
      const aa = aFrom + ((aTo - aFrom) * k) / 6;
      pts.push([r0 * Math.cos(aa), r0 * Math.sin(aa)]);
    }
  }
  const L2 = [];
  const gp2 = (c, v) => { L2.push(String(c)); L2.push(String(v)); };
  gp2(0, "SECTION"); gp2(2, "HEADER"); gp2(9, "$INSUNITS"); gp2(70, 4); gp2(0, "ENDSEC");
  gp2(0, "SECTION"); gp2(2, "ENTITIES");
  gp2(0, "CIRCLE"); gp2(8, "ARM"); gp2(10, 0); gp2(20, 0); gp2(40, (p.shaftD / 2).toFixed(4)); // shaft bore
  gp2(0, "LWPOLYLINE"); gp2(8, "ARM"); gp2(90, pts.length); gp2(70, 1);
  pts.forEach(([x, y]) => { gp2(10, x.toFixed(4)); gp2(20, y.toFixed(4)); });
  gp2(0, "ENDSEC"); gp2(0, "EOF");
  return L2.join("\n");
}

/* ---- FEMM export (Lua): full 2D planar magnetostatic model of the PM machine, one file.
   Materials carry THIS tool's Froelich BH points and magnet data, so a FEMM solve validates
   the analytical circuit apples-to-apples. Copper regions are closed at the tooth-tip radius
   (wedge line) so slots, opening necks, and airgap mesh as separate regions. Phases follow
   the 60-degree belt rule; circuits ship at 0 A — set currents in FEMM for loaded solves. ---- */
function buildFemmLua(p, r) {
  const Ns = r.Ns, poles = p.poles;
  const r0 = p.statorID / 2, r1 = r0 + p.tipH, r2 = r1 + Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0);
  const rOD = p.statorOD / 2, rSh = p.shaftD / 2, rMo = p.rotorOD / 2, rMi = rMo - p.magT;
  const stM = STEELS[p.steel] || STEELS["M19 (29 ga)"];
  const rtM = STEELS[p.rotSteel || p.steel] || stM;
  const mag = MAGNETS[p.mag] || Object.values(MAGNETS)[0];
  const mu0 = 4e-7 * Math.PI;
  const BrT9 = (mag.Br || 1.2) * (1 + ((mag.aBr || 0) / 100) * ((p.magTemp || 20) - 20)); // Br at design magnet temp
  const HcAm = BrT9 / (mu0 * (mag.mur || 1.05));                   // A/m at p.magTemp
  const L = [];
  const P9 = (rr, a) => [ +(rr * Math.cos(a)).toFixed(4), +(rr * Math.sin(a)).toFixed(4) ];
  const node = (x, y) => L.push(`mi_addnode(${x},${y})`);
  const seg = (x1, y1, x2, y2) => L.push(`mi_addsegment(${x1},${y1},${x2},${y2})`);
  const arc = (x1, y1, x2, y2, deg) => L.push(`mi_addarc(${x1},${y1},${x2},${y2},${deg},2)`);
  L.push('-- MotrWorks FEMM export: ' + Ns + ' slots / ' + poles + ' poles, stack ' + p.stackL + ' mm, magnets at ' + (p.magTemp || 20) + ' C');
  L.push('-- Open in FEMM, run this script (femm console: dofile). Solve, then torque:');
  L.push('--   mo_groupselectblock(1)  mo_blockintegral(22)   -- rotor group steady torque, N·m');
  L.push('-- With all circuits at 0 A, the airgap flux should match the analytical model (ksat-corrected Bg).');
  L.push(`newdocument(0)`);
  L.push(`mi_probdef(0,"millimeters","planar",1e-8,${p.stackL},30)`);
  // materials: air, copper, steels with OUR Froelich BH, magnet with OUR Br/mur
  L.push(`mi_addmaterial("Air",1,1,0,0,0,0,0,1,0,0,0)`);
  L.push(`mi_addmaterial("Copper",1,1,0,0,58,0,0,1,0,0,0)`);
  L.push(`mi_addmaterial("StatorSteel",${stM.muri},${stM.muri},0,0,0,0,0,${stM.kst},0,0,0)`);
  L.push(`mi_addmaterial("RotorSteel",${rtM.muri},${rtM.muri},0,0,0,0,0,${rtM.kst},0,0,0)`);
  for (let B9 = 0.1; B9 <= 2.4001; B9 += 0.1) {
    L.push(`mi_addbhpoint("StatorSteel",${B9.toFixed(2)},${Hof(B9, stM).toFixed(1)})`);
    L.push(`mi_addbhpoint("RotorSteel",${B9.toFixed(2)},${Hof(B9, rtM).toFixed(1)})`);
  }
  L.push(`mi_addmaterial("Magnet",${mag.mur},${mag.mur},${HcAm.toFixed(0)},0,0.667,0,0,1,0,0,0)`);
  for (const ph of ["A", "B", "C"]) L.push(`mi_addcircprop("${ph}",0,1)`);
  L.push(`mi_addboundprop("A0",0,0,0,0,0,0,0,0,0)`);
  // outer boundary + bore + shaft as arc pairs
  const cir = (rr, prop) => {
    const [xa, ya] = P9(rr, 0), [xb, yb] = P9(rr, Math.PI);
    node(xa, ya); node(xb, yb);
    arc(xa, ya, xb, yb, 180); arc(xb, yb, xa, ya, 180);
    if (prop) { L.push(`mi_selectarcsegment(0,${rr})`); L.push(`mi_selectarcsegment(0,${-rr})`);
      L.push(`mi_setarcsegmentprop(2,"${prop}",0,0)`); L.push(`mi_clearselected()`); }
  };
  cir(rOD, "A0"); cir(r0, null); cir(rSh, null); cir(rMo, null); cir(rMi, null);
  // slots: copper trapezoid r1..r2 (closed at r1) + opening neck r0..r1
  const hwA = (rr) => Math.max(Math.PI / Ns - (p.toothW / 2) / rr, 0.008);
  const soA = (rr) => Math.max((p.slotOpen / 2) / rr, 0.004);
  for (let s9 = 0; s9 < Ns; s9++) {
    const a0 = (s9 * 2 * Math.PI) / Ns;
    const n1 = hwA(r1), n2 = hwA(r2), sA0 = soA(r0), sA1 = soA(r1);
    const c = [P9(r1, a0 - n1), P9(r2, a0 - n2), P9(r2, a0 + n2), P9(r1, a0 + n1)];
    c.forEach((q9) => node(q9[0], q9[1]));
    seg(c[0][0], c[0][1], c[1][0], c[1][1]); arc(c[1][0], c[1][1], c[2][0], c[2][1], (2 * n2 * 180) / Math.PI);
    seg(c[2][0], c[2][1], c[3][0], c[3][1]); seg(c[3][0], c[3][1], c[0][0], c[0][1]);
    const o = [P9(r0, a0 - sA0), P9(r1, a0 - sA1), P9(r1, a0 + sA1), P9(r0, a0 + sA0)];
    o.forEach((q9) => node(q9[0], q9[1]));
    seg(o[0][0], o[0][1], o[1][0], o[1][1]); seg(o[1][0], o[1][1], o[2][0], o[2][1]);
    seg(o[2][0], o[2][1], o[3][0], o[3][1]);
    // labels: copper w/ circuit + belt sign; opening neck air
    const belt = Math.floor(((((s9 + 0.5) * poles * 180) / Ns) % 360) / 60);
    const PH = ["A", "C", "B", "A", "C", "B"][belt], SGN = [1, -1, 1, -1, 1, -1][belt];
    const [lx, ly] = P9((r1 + r2) / 2, a0);
    L.push(`mi_addblocklabel(${lx},${ly})`); L.push(`mi_selectlabel(${lx},${ly})`);
    L.push(`mi_setblockprop("Copper",1,0,"${PH}",0,0,${SGN * Math.max(Math.round(r.condPerSlot || 1), 1)})`); L.push(`mi_clearselected()`);
    const [ox, oy] = P9((r0 + r1) / 2, a0);
    L.push(`mi_addblocklabel(${ox},${oy})`); L.push(`mi_selectlabel(${ox},${oy})`);
    L.push(`mi_setblockprop("Air",1,0,"<None>",0,0,0)`); L.push(`mi_clearselected()`);
  }
  // magnet pole boundaries + labels with alternating radial magnetization
  for (let k9 = 0; k9 < poles; k9++) {
    const ab = ((k9 - 0.5) * 2 * Math.PI) / poles;
    const [x1, y1] = P9(rMi, ab), [x2, y2] = P9(rMo, ab);
    node(x1, y1); node(x2, y2); seg(x1, y1, x2, y2);
    const ac = (k9 * 2 * Math.PI) / poles, dirDeg = ((ac * 180) / Math.PI + (k9 % 2 ? 180 : 0)) % 360;
    const [mx, my] = P9((rMi + rMo) / 2, ac);
    L.push(`mi_addblocklabel(${mx},${my})`); L.push(`mi_selectlabel(${mx},${my})`);
    L.push(`mi_setblockprop("Magnet",1,0,"<None>",${dirDeg.toFixed(2)},1,0)`); L.push(`mi_clearselected()`);
  }
  // bulk region labels: stator steel, rotor hub steel (group 1), shaft steel (group 1), airgap
  const midToothA = Math.PI / Ns;                                    // tooth-center angle
  const [sx, sy] = P9((r2 + rOD) / 2, midToothA);
  L.push(`mi_addblocklabel(${sx},${sy})`); L.push(`mi_selectlabel(${sx},${sy})`);
  L.push(`mi_setblockprop("StatorSteel",1,0,"<None>",0,0,0)`); L.push(`mi_clearselected()`);
  const [hx, hy] = P9((rSh + rMi) / 2, 0.3);
  L.push(`mi_addblocklabel(${hx},${hy})`); L.push(`mi_selectlabel(${hx},${hy})`);
  L.push(`mi_setblockprop("RotorSteel",1,1,"<None>",0,0,0)`); L.push(`mi_clearselected()`);
  L.push(`mi_addblocklabel(0,0)`); L.push(`mi_selectlabel(0,0)`);
  L.push(`mi_setblockprop("RotorSteel",1,1,"<None>",0,0,0)`); L.push(`mi_clearselected()`);
  const [gx, gy] = P9((rMo + r0) / 2, midToothA);
  L.push(`mi_addblocklabel(${gx},${gy})`); L.push(`mi_selectlabel(${gx},${gy})`);
  L.push(`mi_setblockprop("Air",1,0,"<None>",0,0,0)`); L.push(`mi_clearselected()`);
  L.push(`mi_zoomnatural()`);
  L.push(`mi_saveas("motrworks-${Ns}s${poles}p.fem")`);
  return L.join("\n") + "\n";
}

function downloadFemm(p, r) {
  const blob = new Blob([buildFemmLua(p, r)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `motrworks-${r.Ns}s${p.poles}p.lua`; a.click();
  URL.revokeObjectURL(url);
}

function downloadDxf(p, r) {
  const brushed = p.motorType === "brushed";
  const blob = new Blob([brushed ? buildArmDxf(p, r) : buildLamDxf(p, r)], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = brushed
    ? `armature-${r.Ns}s-${p.rotorOD}mm.dxf`
    : `lamination-${r.Ns}s-${p.statorOD}mm.dxf`; a.click();
  URL.revokeObjectURL(url);
}


/* ---- DXF lamination import: parse entities, infer center/OD/bore/rotor/slots ---- */
