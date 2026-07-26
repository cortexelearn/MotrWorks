/* MotrWorks module 05 — app shell: state, layout, wizard, cards */
/* ---- envelope synthesis: pure & gate-testable. One branch per machine type; every branch
   scores real computeDesign runs against the user's targets. Returns { p, msg } or { fail }. ---- */
function synthEnvelope(wiz, p, us) {
  const IN2 = 141.612;
  const od = Math.max(wiz.od, 12), stk = Math.max(wiz.stack, 5);
  const Tst = us === "in" ? wiz.tst / IN2 : wiz.tst;
  const Trt = us === "in" ? wiz.trt / IN2 : wiz.trt;
  const nl = Math.max(wiz.nl, 100), Vdc = Math.max(wiz.vdc, 5), Imax = Math.max(wiz.imax, 0.5);
  const half5 = (x) => Math.round(x * 2) / 2;                       // magnet wire comes in half gauges
  const awgOf = (dw, lo = 8, hi = 38) => Math.min(hi, Math.max(lo, half5(36 - (39 * Math.log(dw / 0.127)) / Math.log(92))));
  const tqW = (nm) => (us === "in" ? (nm * IN2).toFixed(nm * IN2 < 10 ? 2 : 1) + " oz·in" : nm.toFixed(2) + " N·m");
  // ---- ACIM branch: line-fed machine synthesized from supply frequency & speed ----
  if (wiz.arch === "acim") {
    const f2 = Math.max(wiz.freq, 20);
    const pol = Math.max(2, 2 * Math.round((120 * f2) / nl / 2));
    const q2 = od < 70 ? 1 : 2;
    const Ns2 = Math.min(3 * pol * q2, 48);
    const g2 = Math.max(0.25, od / 250);
    const ID2 = +(od * 0.62).toFixed(2), rot2 = +(ID2 - 2 * g2).toFixed(2);
    const Bg2 = 0.8, tauP2 = (Math.PI * ID2) / pol, tauS2 = (Math.PI * ID2) / Ns2;
    const yoke2 = +Math.max((Bg2 * tauP2) / (2 * 1.5 * 0.95), 1).toFixed(2);
    const tooth2 = +Math.max((Bg2 * tauS2) / (1.5 * 0.95), 0.8).toFixed(2);
    const Vph2 = wiz.vdc / Math.sqrt(3);
    const kw2 = 0.94, phiP = (2 * Bg2 * (rot2 / 1000) * (wiz.stack / 1000)) / pol;
    const Nser2 = (0.95 * Vph2) / (4.44 * f2 * kw2 * Math.max(phiP, 1e-6));
    const cpp2 = Ns2 / 3;
    const turns2 = Math.max(1, Math.round(Nser2 / cpp2));
    const Irate2 = Math.max((Trt * ((2 * Math.PI * nl * 0.97) / 60)) / (3 * Vph2 * 0.72), 0.3);
    const aCu = Irate2 / 6;
    const dW2 = Math.sqrt((4 * aCu) / Math.PI);
    const awg2 = awgOf(dW2, 8, 30);
    // rotor bars: ~0.8×Ns, dodging Ns, Ns±p, Ns±2p
    let Nb2 = Math.round(0.8 * Ns2);
    const badB = (n) => n === Ns2 || Math.abs(Ns2 - n) === pol || Math.abs(Ns2 - n) === 2 * pol;
    while (badB(Nb2)) Nb2 += 1;
    return { p: { ...p, motorType: "induction", conn: "wye", pattern: "lap", layers: 2, span: 0, paths: 1,
      slots: Ns2, poles: pol, statorOD: od, statorID: ID2, rotorOD: rot2, yoke: yoke2, toothW: tooth2,
      slotOpen: +Math.min(Math.max(od / 45, 1), 3).toFixed(1), tipH: +Math.min(Math.max(od / 90, 0.5), 2).toFixed(1),
      stackL: stk, liner: 0.2, slotR: 0, shaftD: +Math.max(od / 8, 3).toFixed(1),
      Vll: wiz.vdc, freq: f2, Bg: Bg2, turns: turns2, awg: awg2, strands: 1,
      rotorBars: Nb2, barA: Math.max(Math.round(od / 2), 15), ringA: Math.max(Math.round(od), 30),
      barMat: "Cast aluminum", loadMode: "I", Irate: +Irate2.toFixed(2), endMode: "auto",
      statorMat: "M19 (29 ga)", rotorMat: "M19 (29 ga)", Tcu: 100, Rext: 0, seq: "ABC" },
      msg: `ACIM: ${Ns2}s/${pol}p, ${turns2}t AWG ${awg2}, cage ${Nb2} bars (cast Al) on ${wiz.vdc} V / ${f2} Hz — sync ${Math.round((120 * f2) / pol)} rpm. Check the equivalent-circuit curve for breakdown & rated slip.` };
  }
  // ---- Brushed PM DC branch: enumerate pole/armature-slot builds, calibrate turns through the engine ----
  if (wiz.arch === "brushed") {
    const poleC = od < 30 ? [2] : od < 60 ? [2, 4] : od < 120 ? [4] : [4, 6];
    const SLOTS = { 2: [5, 7, 9, 11], 4: [11, 13, 15, 17, 19], 6: [19, 23, 25, 29] };
    let bestB = null, nB = 0; const allB = [];
    for (const pol of poleC) for (const Ns2 of SLOTS[pol]) {
      const g = Math.max(0.25, od / 200);
      for (const magT of [Math.max(od / 34, 1.4), Math.max(od / 24, 2)]) {
        const BgAvg2 = (0.9 * 1.269 * magT) / (magT + 1.1 * g);
        // housing return wall sized to carry the pole flux at ~1.9 T (solid 1018):
        // wall = BgAvg·(π·ID/pol)/(2·1.9) with ID = od − 2(wall + magT) → closed form
        const cW = (BgAvg2 * Math.PI) / (pol * 2 * 1.9);
        const ID = +((od - 2 * magT) / (1 + 2 * cW)).toFixed(2);    // magnet ring ID
        const rot = +(ID - 2 * g).toFixed(2);                       // armature OD
        if (rot < 8 || (Math.PI * rot) / Ns2 < 2.4) continue;       // armature tooth pitch manufacturable
        const tauS3 = (Math.PI * rot) / Ns2, tauP3 = (Math.PI * rot) / pol;
        const yoke = +Math.max((BgAvg2 * tauP3) / (2 * 1.55 * 0.95), 1).toFixed(2);
        const tipH = +Math.min(Math.max(rot / 60, 0.4), 1.5).toFixed(1);
        const shaftD9 = +Math.max(rot / 6, 2).toFixed(1);
        // armature slots taper inward — clamp the tooth so the slot-bottom width stays buildable
        const hs9 = (rot - shaftD9) / 2 - yoke - tipH;
        if (hs9 <= 1) continue;
        const d2b = rot - 2 * (tipH + hs9);
        const toothW = +Math.min(Math.max((BgAvg2 * tauS3) / (1.55 * 0.95), 0.8),
          Math.max((Math.PI * d2b) / Ns2 - 1.0, 0.8)).toFixed(2);
        const base = { ...p, motorType: "brushed", pattern: "lap", layers: 2, paths: 1, span: 0, conn: "wye",
          slots: Ns2, poles: pol, statorOD: od, statorID: ID, rotorOD: rot, yoke, toothW, tipH,
          slotOpen: +Math.min(Math.max(rot / 30, 0.8), 2.5).toFixed(1), stackL: stk, liner: 0.2, slotR: 0,
          shaftD: shaftD9, mag: "N45SH", magT: +magT.toFixed(1), poleArc: 85,
          Top: 60, brushV: 1.5, Vdc, Imax, loadMode: "I", Irate: 1, turns: 10, awg: 24, strands: 1,
          endMode: "auto", seq: "ABC", statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", Tcu: 100, Rext: 20 };
        const ref = computeDesign(base);
        if (ref.err.length || !(ref.noLoad > 0) || !(ref.Kt > 0)) continue;
        const tIdeal = (10 * ref.noLoad) / nl;                      // no-load ∝ 1/turns
        for (const turns of [...new Set([Math.max(1, Math.floor(tIdeal)), Math.max(1, Math.ceil(tIdeal))])]) {
          const KtT = (ref.Kt * turns) / 10;                        // Kt ∝ turns
          const Irate = Math.max(Trt > 0 ? Trt / KtT : Imax * 0.5, 0.2);
          let bw = null;
          for (let st = 1; st <= 3; st++) {
            const aB = Irate / pol / 6 / st;                        // lap: a = poles paths, J ≈ 6 A/mm²
            const awg0 = awgOf(Math.sqrt((4 * aB) / Math.PI));
            for (const dA of [0, 0.5, 1, 1.5, 2]) {                 // nudge finer in half gauges if it won't insert
              const awg = Math.min(awg0 + dA, 40);
              const cand = { ...base, turns, awg, strands: st, Irate: +Irate.toFixed(2) };
              const chk = computeDesign(cand);
              if (chk.err.length) continue;
              const f = chk.fillGross;
              const sc5 = !Number.isFinite(f) ? 99 : f > 0.42 ? 10 + f : 0.42 - f;
              if (!bw || sc5 < bw.sc5) bw = { cand, chk, sc5 };
            }
          }
          if (!bw) continue;
          nB++;
          const { cand, chk } = bw;
          const nlA = chk.noLoad, tstA = chk.peakT;                 // Kt·min(Imax, (V−Vb)/Ra)
          let sc = 2 * Math.abs(Math.log(Math.max(nlA, 1) / nl)) + 3 * Math.max(Math.log(Tst / Math.max(tstA, 1e-9)), 0);
          const f = chk.fillGross;
          sc += !Number.isFinite(f) ? 50 : f > 0.42 ? (f - 0.42) * 15 : f < 0.16 ? (0.16 - f) * 3 : 0;
          if (chk.Bt > chk.stM.Bmax) sc += 2 + (chk.Bt - chk.stM.Bmax);
          if (chk.By > chk.stM.Bmax) sc += 2;
          if (Ns2 % pol === 0) sc += 0.6;                           // simultaneous commutation = ripple
          let Tav = 0;
          for (const c5 of chk.curve) if (c5.n >= Math.max(wiz.nrt, 1)) { Tav = c5.T; break; }
          sc += 2 * Math.max(Math.log(Trt / Math.max(Tav, 1e-9)), 0);
          allB.push({ cand, chk, sc, Ns2, pol, nlA, tstA });
          if (!bestB || sc < bestB.sc) bestB = allB[allB.length - 1];
        }
      }
    }
    if (!bestB) return { fail: "⚠ No feasible brushed construction fits this envelope — grow OD/stack, raise the bus, or relax targets." };
    allB.sort((x9, y9) => x9.sc - y9.sc);
    const altsB = []; const seenB = new Set([bestB.Ns2 + "s" + bestB.pol + "p"]);
    for (const a5 of allB) {
      const key = a5.Ns2 + "s" + a5.pol + "p";
      if (seenB.has(key)) continue;
      seenB.add(key);
      altsB.push({ label: `${a5.Ns2}s/${a5.pol}p · ${a5.cand.turns}t AWG ${a5.cand.awg}×${a5.cand.strands}`,
        note: `NL ${Math.round(a5.nlA)} rpm · stall ${tqW(a5.tstA)} · fill ${(a5.chk.fillGross * 100).toFixed(0)}%`, p: a5.cand });
      if (altsB.length >= 5) break;
    }
    return { p: bestB.cand, alts: altsB,
      msg: `Brushed PM DC, best of ${nB} builds: ${bestB.Ns2}-slot/${bestB.pol}p lap armature, ${bestB.cand.turns}t AWG ${bestB.cand.awg}×${bestB.cand.strands} ` +
        `(fill ${(bestB.chk.fillGross * 100).toFixed(0)}%). No-load ≈ ${Math.round(bestB.nlA)} rpm (asked ${Math.round(nl)}); ` +
        `stall at the limit ≈ ${tqW(bestB.tstA)} (asked ${tqW(Tst)}). Brush drop 1.5 V assumed — tune in Machine & drive.` };
  }
  // ---- LATM branch: sectors from travel (stops inside the torque zero-crossings), turns/wire searched ----
  if (wiz.arch === "latm") {
    const trav = Math.max(wiz.travel, 5);
    const sectC = [2, 4, 6, 8].filter((s9) => trav / 2 < 0.75 * (180 / s9) && (Math.PI * od * 0.58) / s9 > 4);
    let bestL = null, nL = 0; const allL = [];
    for (const sect of (sectC.length ? sectC : [2])) {
      const coreD = Math.max(od / 12, 1.2);
      const wind = Math.max(od / 25, 1);
      const g = Math.max(0.2, od / 150);
      const ID = +(od - 2 * coreD).toFixed(2);
      for (const magT of [Math.max(od / 16, 2), Math.max(od / 12, 2.5)]) {
        const rot = +(ID - 2 * (wind + g)).toFixed(2);
        if (rot < 6 || rot - 2 * magT < 3) continue;
        const base = { ...p, motorType: "latm", slots: 12, poles: sect, latmSect: sect,
          latmSpan: Math.round(0.66 * (360 / sect)), latmWind: +wind.toFixed(1), latmTravel: trav,
          statorOD: od, statorID: ID, rotorOD: rot, stackL: stk, shaftD: +Math.max(rot / 5, 2).toFixed(1),
          yoke: +coreD.toFixed(1), toothW: 3, slotOpen: 1.5, tipH: 0.8, liner: 0.2, slotR: 0,
          pattern: "lap", layers: 2, span: 0, paths: 1, conn: "wye",
          mag: "Sm2Co17-26", magT: +magT.toFixed(1), poleArc: 85, Top: 70,
          Vdc, Imax, loadMode: "J", endMode: "auto", seq: "ABC",
          statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)", Tcu: 100, Rext: 0, strands: 1 };
        for (const turns of [15, 22, 33, 48, 70, 100, 150, 220, 320, 470, 680]) {
          // wire pass 1 from the drive limit, pass 2 from the achieved two-wire current
          let awg = awgOf(Math.sqrt((4 * (Imax / 6)) / Math.PI), 8, 40);
          let cand = { ...base, turns, awg }, chk = computeDesign(cand);
          if (chk.err.length || !chk.latm) continue;
          awg = awgOf(Math.sqrt((4 * (Math.max(chk.latm.Idrv, 0.05) / 6)) / Math.PI), 8, 40);
          cand = { ...base, turns, awg }; chk = computeDesign(cand);
          if (chk.err.length || !chk.latm || !(chk.latm.Tstop > 0)) continue;
          nL++;
          let sc = 3 * Math.abs(Math.log(chk.latm.Tstop / Math.max(Tst, 1e-9)));
          sc += chk.warn.length * 0.15;
          allL.push({ cand, chk, sc, sect });
          if (!bestL || sc < bestL.sc) bestL = allL[allL.length - 1];
        }
      }
    }
    if (!bestL) return { fail: "⚠ No LATM construction reaches this toggle torque in the envelope — grow OD/stack, raise the bus, or reduce travel." };
    const lt = bestL.chk.latm;
    allL.sort((x9, y9) => x9.sc - y9.sc);
    const altsL = []; const seenL = new Set([bestL.sect + "-" + bestL.cand.turns]);
    for (const a5 of allL) {
      const key = a5.sect + "-" + a5.cand.turns;
      if (seenL.has(key)) continue;
      seenL.add(key);
      altsL.push({ label: `${a5.sect} sect · ${a5.cand.turns}t AWG ${a5.cand.awg}`,
        note: `stops ${tqW(a5.chk.latm.Tstop)} · peak ${tqW(a5.chk.latm.Tpk)} · ${a5.chk.latm.Idrv.toFixed(2)} A`, p: a5.cand });
      if (altsL.length >= 5) break;
    }
    return { p: bestL.cand, alts: altsL,
      msg: `LATM, best of ${nL} builds: ${bestL.sect} sectors/${bestL.sect}p, ${bestL.cand.turns}t per sector AWG ${bestL.cand.awg}, ±${(trav / 2).toFixed(0)}° travel. ` +
        `Toggle at the stops ≈ ${tqW(lt.Tstop)} (asked ${tqW(Tst)}), peak ${tqW(lt.Tpk)}, two-wire drive ${lt.Idrv.toFixed(2)} A on ${Vdc} V.` };
  }
  // ---- Stepper branch: rotor teeth / pole pairs from step angle, turns calibrated to holding torque ----
  if (wiz.arch === "stepper") {
    const stA = Math.max(wiz.stepA, 0.45);
    const hyb = stA <= 3.6;
    const kE = Math.max(2, Math.round(90 / stA));
    const NsP = hyb ? 8 : (kE >= 5 ? 8 : 4);
    const sc9 = od / (hyb ? 41 : 35);                               // scale off the NEMA-17 / 35 mm PM references
    const g = hyb ? Math.max(0.04, +(0.05 * sc9).toFixed(3)) : Math.max(0.3, +(0.6 * sc9).toFixed(2));
    const ID = +((hyb ? 26 : 22) * sc9).toFixed(2), rot = +(ID - 2 * g).toFixed(2);
    const magT = hyb ? +Math.min(Math.max(3 * sc9, 1.5), 0.3 * stk).toFixed(1) : +Math.max(2.5 * sc9, 1.5).toFixed(1);
    const base = { ...p, motorType: "stepper", stpKind: hyb ? "hybrid" : "pm",
      stpNr: hyb ? kE : p.stpNr, stpPP: hyb ? p.stpPP : kE, stpWire: wiz.swire, stpOn: 2,
      slots: NsP, poles: 2, statorOD: od,
      statorID: ID, rotorOD: rot, yoke: +((hyb ? 2.6 : 1.7) * sc9).toFixed(1), toothW: +((hyb ? 3.6 : 2.5) * sc9).toFixed(1),
      slotOpen: +Math.max(1.5 * sc9, 1).toFixed(1), tipH: +Math.max(0.8 * sc9, 0.5).toFixed(1),
      stackL: stk, liner: 0.2, slotR: 0.3, shaftD: +Math.max(5 * sc9, 2).toFixed(1),
      pattern: "concentrated", layers: 2, span: 0, paths: 1, conn: "wye",
      mag: hyb ? "N35" : "Ferrite C8", magT, poleArc: 85, Top: 60,
      Vdc, Imax, loadMode: "J", endMode: "auto", seq: "ABC",
      statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", Tcu: 100, Rext: 0, strands: 1,
      awg: awgOf(Math.sqrt((4 * ((wiz.swire === "bip-par" ? Imax / 2 : Imax) / 6)) / Math.PI), 8, 40), turns: 20 };
    const ref = computeDesign(base);
    if (ref.err.length || !ref.step || !(ref.step.Th > 0))
      return { fail: "⚠ Stepper reference build fails in this envelope — grow OD/stack or reduce the step count." };
    const tIdeal = (20 * Tst) / ref.step.Th;                        // holding torque ∝ turns at fixed phase current
    let bestS = null;
    for (const turns of [...new Set([Math.max(1, Math.floor(tIdeal)), Math.max(1, Math.ceil(tIdeal))])]) {
      const cand = { ...base, turns };
      const chk = computeDesign(cand);
      if (chk.err.length || !chk.step) continue;
      const sc = Math.abs(Math.log(chk.step.Th / Math.max(Tst, 1e-9))) + chk.warn.length * 0.05;
      if (!bestS || sc < bestS.sc) bestS = { cand, chk, sc };
    }
    if (!bestS) return { fail: "⚠ No stepper winding fits this envelope — grow OD/stack or relax the torque target." };
    const st9 = bestS.chk.step;
    const lr = Vdc / Math.max(st9.Rs, 1e-6);
    return { p: bestS.cand,
      msg: `${st9.kind} stepper, ${stA}°/step (${st9.stepsRev} steps/rev): ${NsP} poles, ${bestS.cand.turns}t/pole AWG ${bestS.cand.awg}, ${wiz.swire === "bip-ser" ? "bipolar series" : wiz.swire === "bip-par" ? "bipolar parallel" : "unipolar"}. ` +
        `Holding (2-on) ≈ ${tqW(st9.Th)} (asked ${tqW(Tst)}) at ${Imax} A/phase, detent ${tqW(st9.detent)}. ` +
        (lr < Imax ? `⚠ V/R = ${lr.toFixed(2)} A < ${Imax} A — plan a chopper drive on a higher bus.` : `✓ ${Vdc} V pushes V/R = ${lr.toFixed(2)} A ≥ rated phase current.`) };
  }
  // ---- Brake branch: springs from holding torque, then a boss/pocket/turns/wire sweep for clean release ----
  if (wiz.arch === "brake") {
    const stroke = Math.max(wiz.stroke, 0.15);
    const bore = Math.max(wiz.bore, 6);
    const ro9 = +(0.45 * od).toFixed(1), ri9 = +(0.30 * od).toFixed(1);
    const re9 = (ro9 + ri9) / 2 / 1000;
    const Fspr = Math.max(Tst / (0.40 * re9 * 2), 10);              // μ 0.40, two faces
    const kSpr = Math.max(Math.round(Fspr / 5), 5);
    let bestK = null, alt = null; const allK = [];
    const bossC = [0.56, 0.62, 0.68].map((x) => Math.round(x * od));
    const pktC = [0.78, 0.83].map((x) => Math.round(x * od));
    const pktDC = [...new Set([Math.max(Math.round(stk - 8), 6), Math.max(Math.round(stk - 6), 6)])];
    for (const boss of bossC) for (const pktID of pktC) for (const pktD of pktDC) {
      if (pktID - boss < 6 || od - pktID < 4 || boss - bore < 5 || pktD >= stk - 1) continue;
      const sprEng9 = +(pktD + stroke).toFixed(2), sprFree9 = +(sprEng9 + Fspr / kSpr).toFixed(1);
      const base = { ...p, motorType: "brake", statorOD: od, stackL: stk, shaftD: Math.max(bore - 2, 3),
        brkBore: bore, brkRo: ro9, brkRi: ri9, brkSprFree: sprFree9, brkSprEng: sprEng9, brkK: kSpr, brkSpringN: od < 45 ? 4 : 6,
        brkStroke: stroke, brkArm: +Math.max(od / 10, 3).toFixed(1), brkFaces: 2, brkMu: 0.40, brkMuD: 0.32,
        brkMat: "Organic (resin-bonded)", brkBossOD: boss, brkPktID: pktID, brkPktD: pktD,
        brkBobID: +(boss + 2.2).toFixed(1), brkBobOD: pktID - 1, brkBobL: Math.max(pktD - 2.5, 3),
        Vdc, Imax: Math.max(Imax, 0.5), loadMode: "J", strands: 1, endMode: "auto", seq: "ABC",
        statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85,
        Tcu: 100, Rext: 0, conn: "wye", pattern: "concentrated", layers: 2, span: 0, paths: 1 };
      for (const turns of [220, 300, 400, 520, 680, 880, 1120, 1400])
        for (let awg = 24; awg <= 39.5; awg += 0.5) {
          const cand = { ...base, turns, awg };
          const chk = computeDesign(cand);
          if (chk.err.length || !chk.brake) continue;
          const b = chk.brake;
          if (!Number.isFinite(b.marginRel) || !Number.isFinite(b.Ipull)) continue;
          const score = b.marginRel - Math.abs(b.TcuB - 90) * 0.004;
          if (!chk.warn.length && b.marginRel >= 1.4 && b.TcuB <= 118 && b.clr >= 0.6 && b.Ipull <= 0.92 * b.Ib) {
            allK.push({ cand, b, score });
            if (!bestK || score > bestK.score) bestK = allK[allK.length - 1];
          } else if (b.marginRel >= 1.25 && b.TcuB <= 130 && b.clr >= 0.4 && b.Ipull <= b.Ib) {
            const sc2 = score - chk.warn.length * 0.1;              // relaxed fallback tier
            if (!alt || sc2 > alt.score) alt = { cand, b, score: sc2, warnN: chk.warn.length };
          }
        }
    }
    const pick = bestK || alt;
    allK.sort((x9, y9) => y9.score - x9.score);
    const altsK = []; const seenK = new Set(pick ? [pick.cand.brkBossOD + "-" + pick.cand.brkPktID + "-" + pick.cand.turns] : []);
    for (const a5 of allK) {
      const key = a5.cand.brkBossOD + "-" + a5.cand.brkPktID + "-" + a5.cand.turns;
      if (seenK.has(key)) continue;
      seenK.add(key);
      altsK.push({ label: `boss ${a5.cand.brkBossOD}/pkt ${a5.cand.brkPktID} · ${a5.cand.turns}t AWG ${a5.cand.awg}`,
        note: `margin ×${a5.b.marginRel.toFixed(2)} · ${Math.round(a5.b.TcuB)} °C · pull ${a5.b.Ipull.toFixed(2)} A`, p: a5.cand });
      if (altsK.length >= 5) break;
    }
    if (!pick) return { fail: "⚠ No brake construction releases against these springs in the envelope — grow OD/backiron length, raise the bus, or cut the torque/stroke." };
    const b = pick.b, q = pick.cand;
    return { p: q, alts: altsK,
      msg: `Brake: boss Ø${q.brkBossOD} / pocket Ø${q.brkPktID} × ${q.brkPktD} mm deep, ${q.turns}t AWG ${q.awg}, springs ${b.Fclamp.toFixed(0)} N (free ${q.brkSprFree} / engaged ${q.brkSprEng} mm). ` +
        `Hold ${tqW(b.Thold)} (asked ${tqW(Tst)}), release ×${b.marginRel.toFixed(2)}, pull-in ${b.Ipull.toFixed(2)} of ${b.Ib.toFixed(2)} A available, drop-out ${b.Idrop.toFixed(3)} A, coil ≈ ${Math.round(b.TcuB)} °C held released. ` +
        (bestK ? "✓ Warning-free point." : `⚠ Best available point carries ${pick.warnN} warning(s) — check the Brake card.`) };
  }
  // ---- BLDC branch: enumerate slot/pole & build scenarios, score each with the full engine ----
  const feCap = wiz.ctrl === "foc" ? 1400 : 900;
  const CANDS = wiz.shape === "trap"
    ? [[9, 6], [12, 4], [18, 6], [24, 4], [24, 8], [36, 4], [36, 6], [36, 12], [48, 16]]
    : [[9, 6], [9, 8], [12, 8], [12, 10], [12, 14], [15, 10], [18, 12], [18, 16], [24, 16], [24, 20], [36, 8], [36, 10], [36, 12], [48, 16]];
  const ctrlMap = wiz.ctrl === "foc" ? { ctrl: "foc", sense: "hall" } : { ctrl: "six", sense: wiz.ctrl === "hall" ? "hall" : "sless" };
  const arcW = wiz.shape === "trap" ? 95 : 85;
  const gcd2 = (a5, b5) => (b5 ? gcd2(b5, a5 % b5) : a5);
  const build = (Ns2, pol, split, magT) => {
    const g = Math.max(0.3, od / 180);
    const ID = +(od * split).toFixed(2), rot = +(ID - 2 * g).toFixed(2);
    const BgAvg2 = (0.9 * 1.269 * magT) / (magT + 1.1 * g);
    const B1w = (4 / Math.PI) * BgAvg2 * Math.sin(((arcW / 100) * Math.PI) / 2);
    const tauP = (Math.PI * ID) / pol, tauS = (Math.PI * ID) / Ns2;
    const yoke = +Math.max((BgAvg2 * tauP) / (2 * 1.55 * 0.95), 1).toFixed(2);
    const toothW = +Math.max((BgAvg2 * tauS) / (1.55 * 0.95), 0.8).toFixed(2);
    const tipH = +Math.min(Math.max(od / 90, 0.5), 2).toFixed(1);
    const slotOpen = +Math.min(Math.max(od / 45, 1), 3).toFixed(1);
    const pattern = Ns2 / (3 * pol) >= 1 ? "lap" : "concentrated";
    const kwG = pattern === "concentrated" ? 0.9 : wiz.shape === "trap" ? 0.98 : 0.93;
    const KeNL = (Vdc / Math.sqrt(6)) / ((nl * 2 * Math.PI) / 60);
    const KeST = Tst / (3 * Imax);
    const feasible = KeST <= KeNL * 1.001;
    const KeT = feasible ? KeNL : Math.sqrt(KeNL * KeST);
    const perTurn = 0.7066 * kwG * B1w * (rot / 1000) * (stk / 1000);
    const cpp = Ns2 / 3;
    const tIdeal = KeT / (perTurn * cpp);
    let turns = Math.max(1, Math.round(tIdeal)), bestE = 1e9;
    [Math.floor(tIdeal), Math.ceil(tIdeal)].map((t2) => Math.max(1, t2)).forEach((t2) => {
      const KeC = perTurn * cpp * t2;
      const nlC = ((Vdc / Math.sqrt(6)) / KeC) * (60 / (2 * Math.PI));
      let e2 = Math.abs(Math.log(nlC / nl));
      if (feasible && 3 * KeC * Imax < Tst * 0.98) e2 += 1;
      if (e2 < bestE) { bestE = e2; turns = t2; }
    });
    const KeAch = perTurn * cpp * turns;
    const Irate = Math.max(Trt / (3 * KeAch), 0.3);
    const hs2 = (od - ID) / 2 - yoke - tipH;
    const d1w = ID + 2 * tipH, d2w = ID + 2 * (tipH + Math.max(hs2, 0));
    const w1w = (Math.PI * d1w) / Ns2 - toothW, w2w = (Math.PI * d2w) / Ns2 - toothW;
    const areaW = Math.max(((w1w + w2w) / 2) * Math.max(hs2, 0) - (2 * Math.max(hs2, 0) + w1w + w2w) * 0.2, 1);
    let bw = null;
    for (let st = 1; st <= 4; st++) {
      const aB = Irate / 6 / st;
      const dw = Math.sqrt((4 * aB) / Math.PI);
      const awg = awgOf(dw, 8, 30);
      const dB = 0.127 * Math.pow(92, (36 - awg) / 39);
      const aI = (Math.PI / 4) * Math.pow(dB * 1.055 + 0.033, 2);
      const fill = (2 * turns * st * aI) / areaW;
      const sc5 = fill > 0.38 ? 10 + fill : 0.38 - fill;
      if (!bw || sc5 < bw.sc5) bw = { st, awg, sc5 };
    }
    return { ...p, motorType: "pm", ...ctrlMap, conn: "wye", pattern, layers: 2, span: 0, paths: 1,
      slots: Ns2, poles: pol, statorOD: od, statorID: ID, rotorOD: rot, yoke, toothW, slotOpen, tipH,
      stackL: stk, liner: 0.2, slotR: 0, shaftD: +Math.max(od / 8, 3).toFixed(1),
      mag: "N45SH", magT: +magT.toFixed(1), poleArc: arcW, Top: 60, Vdc, Imax, loadMode: "I", Irate: +Irate.toFixed(2),
      turns, awg: bw.awg, strands: bw.st, endMode: "auto", seq: "ABC",
      freq: Math.max(50, Math.round((nl * pol) / 120 / 50) * 50),
      statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", Tcu: 100, Rext: 20 };
  };
  let bestC = null; const all = [];
  for (const [Ns2, pol] of CANDS) {
    if ((nl * pol) / 120 > feCap) continue;
    if ((Math.PI * od * 0.6) / Ns2 < 3.2) continue;              // tooth pitch manufacturable
    if ((Math.PI * od * 0.6 * 0.85) / pol < 2.5) continue;       // magnet segment arc length
    for (const split of [0.54, 0.6, 0.66]) for (const magT of [Math.max(od / 34, 1.2), Math.min(Math.max(od / 24, 1.8), 5)]) {
      const cand = build(Ns2, pol, split, magT);
      const chk = computeDesign(cand);
      if (chk.err.length) continue;
      const nlA = chk.noLoad, tstA = chk.Kt * Imax;
      let sc = 2 * Math.abs(Math.log(Math.max(nlA, 1) / nl)) + 3 * Math.max(Math.log(Tst / Math.max(tstA, 1e-9)), 0)
        + 0.25 * Math.max(Math.log(Math.max(tstA, 1e-9) / Tst) - 0.5, 0);
      const f = chk.fillGross;
      sc += !Number.isFinite(f) ? 50 : f > 0.42 ? (f - 0.42) * 15 : f < 0.16 ? (0.16 - f) * 3 : 0;
      if (chk.Bt > chk.stM.Bmax) sc += 2 + (chk.Bt - chk.stM.Bmax);
      if (chk.By > chk.stM.Bmax) sc += 2;
      sc += (1 - chk.ksat) * 4;
      sc += 0.8 * (gcd2(Ns2, pol) / pol); // low LCM(Ns,p) = strong cogging
      const nrt2 = Math.max(wiz.nrt, 1);
      let Tav = 0;
      for (const c5 of chk.curve) if (c5.n >= nrt2) { Tav = c5.T; break; }
      sc += 2 * Math.max(Math.log(Trt / Math.max(Tav, 1e-9)), 0);
      all.push({ cand, chk, sc, Ns2, pol, split, magT: cand.magT, nlA, tstA });
      if (!bestC || sc < bestC.sc) bestC = all[all.length - 1];
    }
  }
  if (!bestC) return { fail: "⚠ No feasible slot/pole construction fits this envelope — grow OD/stack, raise the bus, or relax targets." };
  const dL = (mm) => (us === "in" ? (mm / INCH).toFixed(2) + " in" : Math.round(mm) + " mm");
  const sugg = [];
  if (bestC.chk.fillGross > 0.45) sugg.push(`Copper tight (fill ${(bestC.chk.fillGross * 100).toFixed(0)}%) — consider OD ~${dL(od * 1.12)} or stack ~${dL(stk * 1.2)}.`);
  if (bestC.chk.Bt > bestC.chk.stM.Bmax || bestC.chk.By > bestC.chk.stM.Bmax) sugg.push("Steel saturating — consider Hiperco 50.");
  const KeNL2 = (Vdc / Math.sqrt(6)) / ((nl * 2 * Math.PI) / 60);
  if (Tst / (3 * Imax) > KeNL2 * 1.001) sugg.push(`Stall + no-load conflict on this bus/amps — needs ~${Math.ceil((Tst / (3 * Imax)) * ((nl * 2 * Math.PI) / 60) * Math.sqrt(6))} V or ~${Math.ceil(Tst / (3 * KeNL2))} A for both.`);
  if (Math.abs(bestC.nlA / nl - 1) > 0.12) sugg.push(`Integer turns land no-load at ${Math.round(bestC.nlA)} rpm; ~${(Vdc * (nl / bestC.nlA)).toFixed(1)} V hits ${Math.round(nl)} exactly.`);
  const tq2 = (nm) => (us === "in" ? (nm * IN2).toFixed(1) + " oz·in" : nm.toFixed(2) + " N·m");
  all.sort((a5, b5) => a5.sc - b5.sc);
  const seen = new Set([bestC.Ns2 + "s" + bestC.pol + "p"]);
  const altTxt = [];
  for (const a5 of all) {
    const key = a5.Ns2 + "s" + a5.pol + "p";
    if (seen.has(key)) continue;
    seen.add(key); altTxt.push(key);
    if (altTxt.length >= 2) break;
  }
  const altsC = [];
  {
    const seenA = new Set([bestC.Ns2 + "s" + bestC.pol + "p"]);
    for (const a5 of all) {
      const key = a5.Ns2 + "s" + a5.pol + "p";
      if (seenA.has(key)) continue;
      seenA.add(key);
      altsC.push({ label: `${a5.Ns2}s/${a5.pol}p · ${a5.cand.turns}t AWG ${a5.cand.awg}×${a5.cand.strands}`,
        note: `NL ${Math.round(a5.nlA)} rpm · stall ${tqW(a5.tstA)} · fill ${(a5.chk.fillGross * 100).toFixed(0)}%`,
        p: a5.cand });
      if (altsC.length >= 5) break;
    }
  }
  return { p: bestC.cand, alts: altsC,
    msg: `Best of ${all.length} evaluated builds: ${bestC.Ns2}s/${bestC.pol}p ${bestC.cand.pattern === "lap" ? "lap" : "tooth-wound"}, ` +
      `split ${bestC.split}, magnet ${bestC.magT} mm, ${bestC.cand.turns}t AWG ${bestC.cand.awg}×${bestC.cand.strands} (fill ${(bestC.chk.fillGross * 100).toFixed(0)}%, ksat ${(bestC.chk.ksat * 100).toFixed(0)}%). ` +
      `Predicted no-load ≈ ${Math.round(bestC.nlA)} rpm (asked ${Math.round(nl)}); stall @ ${Imax} A ≈ ${tq2(bestC.tstA)} (asked ${tq2(Tst)}). ` +
      (altTxt.length ? `Runners-up: ${altTxt.join(", ")}. ` : "") +
      (sugg.length ? "⚠ " + sugg.join(" ") : "✓ Passes rotation, fill, saturation & rated-point checks.") };
}

/* ---- Winding-arbor tooling module: coil dimensions from the arbor, verified against the
   stator drawing alone — no rotor, no performance ---- */
const GEAR_PRESETS = {
  "1\u2033 \u00b7 4:1 \u00b7 1-stage \u00b7 3P":   { gbType: "Planetary", gbRatio: 4,   gbStages: 1, gbOD: 25.4,  nPlanets: 3 },
  "1.6\u2033 \u00b7 25:1 \u00b7 2-stage \u00b7 3P": { gbType: "Planetary", gbRatio: 25,  gbStages: 2, gbOD: 40.6,  nPlanets: 3 },
  "2.5\u2033 \u00b7 50:1 \u00b7 2-stage \u00b7 3P": { gbType: "Planetary", gbRatio: 50,  gbStages: 2, gbOD: 63.5,  nPlanets: 3 },
  "3.2\u2033 \u00b7 64:1 \u00b7 3-stage \u00b7 4P": { gbType: "Planetary", gbRatio: 64,  gbStages: 3, gbOD: 81.3,  nPlanets: 4 },
  "4\u2033 \u00b7 100:1 \u00b7 3-stage \u00b7 4P":  { gbType: "Planetary", gbRatio: 100, gbStages: 3, gbOD: 101.6, nPlanets: 4 },
  "\u00d82\u2033 \u00b7 HD size 14 \u00b7 50:1":   { gbType: "Harmonic",  gbRatio: 50,  gbStages: 1, gbOD: 50,    nPlanets: 3 },
  "\u00d82.75\u2033 \u00b7 HD size 20 \u00b7 100:1": { gbType: "Harmonic", gbRatio: 100, gbStages: 1, gbOD: 70,    nPlanets: 3 },
  "\u00d83.35\u2033 \u00b7 HD size 25 \u00b7 80:1":  { gbType: "Harmonic", gbRatio: 80,  gbStages: 1, gbOD: 85,    nPlanets: 3 },
  "0.75\u2033 \u00b7 spur 6:1 \u00b7 2-stage":     { gbType: "Spur",      gbRatio: 6,   gbStages: 2, gbOD: 19,    nPlanets: 3 },
  "1.2\u2033 \u00b7 spur 20:1 \u00b7 3-stage":     { gbType: "Spur",      gbRatio: 20,  gbStages: 3, gbOD: 30.5,  nPlanets: 3 },
  "1.5\u2033 \u00b7 spur 60:1 \u00b7 4-stage":     { gbType: "Spur",      gbRatio: 60,  gbStages: 4, gbOD: 38,    nPlanets: 3 },
};

function BobbinView({ p, s, us, switchType, exportDesign, importDesign, ioMsg, impPanel }) {
  const inv = p.wbMode === "inv";
  const sol = inv ? solveBobbin(p) : null;
  const pEff = inv ? { ...p, wbArborD: sol.Da, wbChanW: sol.chW, wbChanH: sol.chH, wbFlange: sol.flgEst, wbJump: sol.jumpEst } : p;
  const b = computeBobbin(pEff);
  const dl9 = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(2) + " mm");
  return (
    <>
      <div>
        <div className="card" style={{ borderTop: "3px solid #3B82F6" }}>
          <h2>Architecture</h2>
          <Pick label="Machine type" v={p.motorType} set={switchType}
            opts={[{ v: "pm", t: "BLDC" }, { v: "brushed", t: "Brushed" }, { v: "latm", t: "LATM" }, { v: "stepper", t: "Step" }, { v: "induction", t: "ACIM" }, { v: "brake", t: "Brake" }, { v: "actuator", t: "Actuator" }, { v: "bobbin", t: "Winding" }]} />
          <div className="note">Winding-arbor tooling: coil dimensions from the arbor & channel, wire and resistance per coil and per string, verified against only what the stator drawing says.</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Files</h2>
          <div className="iobar">
            <button className="btn" onClick={exportDesign}>Export .json</button>
            <label className="btn ghost">
              Import…
              <input type="file" accept=".json,application/json" onChange={importDesign} />
            </label>
          </div>
          {ioMsg && <div className="iomsg">{ioMsg}</div>}
          {impPanel}
          <div className="note">Same design-file format as the machine modules — the tool, wire, and stator-drawing fields all serialize, so a winding spec can travel with (or separately from) its motor.</div>
        </div>
        <AssumptionsCard p={p} />
        <div className="card" style={{ marginTop: 14 }}>
          <h2>{inv ? "Solve the tool" : "Winding arbor (tool)"}</h2>
          <Pick label="Driving mode" v={p.wbMode} set={s("wbMode")}
            opts={[{ v: "fwd", t: "Tool known → coil data" }, { v: "inv", t: "Coil spec → tool dims" }]} />
          {inv ? (
            <>
              <Num label="Target R line-line (20 °C, 0 = insertion rule)" unit="Ω" v={p.wbRt} set={s("wbRt")} step={0.05} min={0} />
              <Pick label="Connection" v={p.conn} set={s("conn")} opts={[{ v: "wye", t: "Wye" }, { v: "delta", t: "Delta" }]} />
              <Pick label="Winding style" v={p.wbStyle} set={s("wbStyle")} opts={[{ v: "tooth", t: "Tooth-wound" }, { v: "lap", t: "Lap (inserted)" }]} />
              {p.wbStyle === "lap" && <Num label="Coil throw" unit="slots" v={p.wbThrow} set={s("wbThrow")} min={1} />}
              <Num label="Coils per phase (string)" v={p.wbCoils} set={s("wbCoils")} min={1} max={48} />
              <div className="tbl" style={{ marginTop: 6 }}>
                <div className="kv"><span>Solved arbor Ø ({sol.basis})</span>
                  <b style={{ color: sol.Da < Math.max(sol.DaIns, sol.DaGeo) - 0.25 ? "#DC2626" : "#059669" }}>{dl9(sol.Da)}</b></div>
                <div className="kv"><span>Insertion needs (bore + 2·tip)</span><b>≥ {dl9(sol.DaIns)}</b></div>
                <div className="kv"><span>Stator geometry needs (2·stack + 2·heads)</span><b>Ø{dl9(sol.DaGeo)} · heads {dl9(sol.Lhead)}/end</b></div>
                <div className="kv"><span>Coil perimeter (as inserted)</span><b>{dl9(sol.perim)}</b></div>
                <div className="kv"><span>Solved channel W × flange H</span><b>{dl9(sol.chW)} × {dl9(sol.chH)}</b></div>
                <div className="kv"><span>Flange Ø / est. thickness</span><b>{dl9(b.flangeOD)} / {dl9(sol.flgEst)}</b></div>
                <div className="kv"><span>Est. inter-coil jumper (from lamination)</span><b>{dl9(sol.jumpEst)}</b></div>
                {sol.RcT > 0 && <div className="kv"><span>Per-coil R budget (after jumpers)</span><b>{fmt(sol.RcT, 3)} Ω</b></div>}
                {sol.throwArc > 0 && <div className="kv"><span>Coil span arc (throw {p.wbThrow} slots)</span><b>{dl9(sol.throwArc)}</b></div>}
                <div className="kv"><span>Lay (square bundle)</span><b>{sol.tpl} turns/layer · {sol.layers} layers · {dl9(sol.build)} build</b></div>
              </div>
              {sol.Da < Math.max(sol.DaIns, sol.DaGeo) - 0.25 && <div className="warn">
                Target resistance demands a smaller arbor than {sol.DaGeo > sol.DaIns ? "the stack + heads require" : "insertion allows"} —
                the coil would be too short to reach around the stack. Fewer turns, finer wire, more strands,
                or accept Ø{dl9(Math.max(sol.DaIns, sol.DaGeo))} and a higher L-L.</div>}
              <div className="note">Flange thickness and jumper allowance are estimated from the lamination and
                winding scheme (same-phase coils land every Ns/coils slots — the jumper spans that arc at the
                mean slot Ø, +25% lay slack); the L-L target converts through the connection and series string
                with jumper copper deducted.</div>
            </>
          ) : (
            <>
              <Num label="Arbor Ø (winding surface)" unit="mm" v={p.wbArborD} set={s("wbArborD")} step={0.5} min={1} />
              <Num label="Channel width" unit="mm" v={p.wbChanW} set={s("wbChanW")} step={0.5} min={0.5} />
              <Num label="Flange height (max build)" unit="mm" v={p.wbChanH} set={s("wbChanH")} step={0.5} min={0.5} />
              <Num label="Flange thickness" unit="mm" v={p.wbFlange} set={s("wbFlange")} step={0.2} min={0.3} />
              <Num label="Coils on the stick" v={p.wbCoils} set={s("wbCoils")} min={1} max={48} />
              <Num label="Inter-coil jumper allowance" unit="mm" v={p.wbJump} set={s("wbJump")} step={5} min={0} />
            </>
          )}
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Coil & wire</h2>
          <Num label="Turns per coil" v={p.turns} set={s("turns")} min={1} />
          <Num label="Magnet wire" unit="AWG" v={p.awg} set={s("awg")} min={8} max={40} step={0.5} />
          <Num label="Strands in hand" v={p.strands} set={s("strands")} min={1} max={12} />
          <Sel label="Insulation build" v={p.insBuild} set={s("insBuild")} opts={Object.keys(INS_BUILD)} />
          <Pick label="Wind style" v={p.wbLay} set={s("wbLay")}
            opts={[{ v: "wild", t: "Wild (scramble)" }, { v: "precise", t: "Precise lay" }]} />
          <Num label="Performance temp (copper)" unit="°C" v={p.Tcu} set={s("Tcu")} step={5} />
          <div className="note" style={{ marginTop: 4 }}>Wire tables and the L-L resistance target stay at 20 °C ambient
            per magnet-wire convention. This field only sets the copper temperature for the reported hot-side rows
            (R scales by the standard 0.393%/°C — well-characterized, as you'd expect).</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Stator drawing (verification only)</h2>
          <Num label="Lamination OD" unit="mm" v={p.statorOD} set={s("statorOD")} />
          <Num label="Bore Ø" unit="mm" v={p.statorID} set={s("statorID")} />
          <Num label="Slots" v={p.slots} set={s("slots")} min={3} />
          <Num label="Tooth width" unit="mm" v={p.toothW} set={s("toothW")} step={0.1} />
          <Num label="Yoke depth" unit="mm" v={p.yoke} set={s("yoke")} step={0.1} />
          <Num label="Tip height" unit="mm" v={p.tipH} set={s("tipH")} step={0.1} />
          <Num label="Slot opening" unit="mm" v={p.slotOpen} set={s("slotOpen")} step={0.1} />
          <Num label="Liner thickness" unit="mm" v={p.liner} set={s("liner")} step={0.05} />
          <Num label="Stack length" unit="mm" v={p.stackL} set={s("stackL")} />
          <Num label="Coil head per end (0 = auto from scheme)" unit="mm" v={p.wbHead} set={s("wbHead")} step={0.5} min={0} />
          <Num label="Slot bottom corner R" unit="mm" v={p.slotR} set={s("slotR")} step={0.1} min={0} />
          <Num label="Slot mouth corner R" unit="mm" v={p.wbRtip} set={s("wbRtip")} step={0.1} min={0} />
          <Pick label="Coil sides per slot" v={p.wbSides} set={s("wbSides")} opts={[{ v: 1, t: "Single layer" }, { v: 2, t: "Double layer" }]} />
        </div>
      </div>
      <div>
        <div className="card">
          <div className="cardhead">
            <h2>Lamination (from the drawing fields)</h2>
            <button className="btn mini ghost" onClick={() => exportPng("svg-lam", "lamination-preview.png")}>PNG ⤓</button>
          </div>
          <LamPreview p={p} us={us} />
          <div className="note">Drawn from the stator-drawing card alone — full lamination at true polar geometry,
            single slot dimensioned with the four internal corner radii. If this doesn't look like the print,
            the entered dims are off.</div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="cardhead">
            <h2>Inserted coil — stack & heads</h2>
            <button className="btn mini ghost" onClick={() => exportPng("svg-coilhead", "coil-heads.png")}>PNG ⤓</button>
          </div>
          <CoilHeadView p={p} b={b} us={us} />
          <div className="note">
            Plan view of one coil as inserted: straight legs run the stack in the slots, heads loop beyond each
            end ({(p.wbStyle || "tooth") === "lap" ? "diamond over the throw arc" : "around the tooth"}). Change
            the scheme, stack, or head override and the shape follows — with an override entered, the dashed
            outline shows the scheme's auto estimate for comparison. The coil perimeter this implies is what
            sizes the arbor in the inverse mode.
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="cardhead">
            <h2>Winding arbor</h2>
            <button className="btn mini ghost" onClick={() => exportPng("svg-arbor", "winding-arbor.png")}>PNG ⤓</button>
          </div>
          <ArborView p={pEff} b={b} us={us} />
          <div className="note">
            Sequential channels, one coil each. Copper drawn at the nested build; the strand bundle is treated
            as an effective Ø of wire × √strands — a lay-dependent first-order figure. Tool length includes a
            flange between and outside every channel.
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Coil results</h2>
          <div className="tbl">
            <div className="kv"><span>Wire (bare / insulated / bundle)</span><b>Ø{b.dBare.toFixed(3)} / {b.dIns.toFixed(3)} / {b.dEff.toFixed(3)} mm</b></div>
            <div className="kv"><span>Lay: turns per layer · layers</span><b>{b.tpl} · {b.layers}</b></div>
            <div className="kv"><span>Build (nested / crossover worst)</span>
              <b style={{ color: b.buildX > p.wbChanH ? "#DC2626" : "#059669" }}>{b.build.toFixed(2)} / {b.buildX.toFixed(2)} of {p.wbChanH} mm</b></div>
            <div className="kv"><span>Coil heads (per end) · stack fit</span>
              <b>{dl9(b.Lhead)} · {dl9(b.stackFit)} vs stack {dl9(p.stackL)}
                <span style={{ color: b.stackFit < p.stackL - 0.5 ? "#DC2626" : Math.abs(b.stackFit - p.stackL) < Math.max(6, 0.15 * p.stackL) ? "#059669" : "#B45309" }}> {b.stackFit < p.stackL - 0.5 ? "✗ short" : Math.abs(b.stackFit - p.stackL) < Math.max(6, 0.15 * p.stackL) ? "✓" : "loose"}</span></b></div>
            <div className="kv"><span>Coil ID / OD · channel capacity</span><b>{dl9(p.wbArborD)} / {dl9(b.coilOD)} · ~{b.capCh} turns</b></div>
            <div className="kv"><span>Mean turn · wire per coil</span><b>{dl9(b.MLT)} · {b.lenCoil.toFixed(2)} m</b></div>
            <div className="kv"><span>String: {p.wbCoils} coils + jumpers</span><b>{b.lenString.toFixed(2)} m · {(b.mCu * 1000).toFixed(0)} g Cu</b></div>
            <div className="kv"><span>R per coil (20 / {p.Tcu} °C)</span><b>{fmt(b.R20c, 3)} / {fmt(b.R20c * b.RhotF(p.Tcu), 3)} Ω</b></div>
            <div className="kv"><span>R string, series (20 / {p.Tcu} °C)</span><b>{fmt(b.R20s, 3)} / {fmt(b.R20s * b.RhotF(p.Tcu), 3)} Ω</b></div>
            {b.wild && (() => {
              const bP9 = computeBobbin({ ...pEff, wbLay: "precise" });
              const dOD9 = b.coilOD - bP9.coilOD, dR9 = bP9.R20c > 0 ? (b.R20c / bP9.R20c - 1) * 100 : 0;
              return <div className="kv"><span>Wild-wind cost vs precise lay</span>
                <b>+{dl9(dOD9)} coil Ø · +{dR9.toFixed(1)}% R · cap ×0.8</b></div>;
            })()}
            <div className="kv"><span>Magnet wire per phase (incl. jumpers)</span>
              <b>{us === "in" ? (b.mPhase * 2.20462).toFixed(3) + " lb" : b.mPhase.toFixed(3) + " kg"}</b></div>
            <div className="kv"><span>Magnet wire per motor (3 phases)</span>
              <b>{us === "in" ? (b.mPhase * 3 * 2.20462).toFixed(3) + " lb" : (b.mPhase * 3).toFixed(3) + " kg"}</b></div>
            {b.wild && <div className="note" style={{ marginTop: 4 }}>
              Wild wind modeled: the first layer lays clean on the arbor, then crossovers kill the row nesting
              (~1.0·wire Ø stacking + 8% bump vs 0.866 nested) and channel capacity derates ×0.8 — the coil OD,
              mean turn, resistance, and wire weight above all carry that penalty. Switch to Precise lay to see
              the ideal wind.</div>}
            {b.slot && Number.isFinite(b.slot.fill) && (
              <div className="kv"><span>Slot fill ({b.slot.sides} side{b.slot.sides > 1 ? "s" : ""}/slot, lined)</span>
                <b style={{ color: b.slot.fill > 0.42 ? "#DC2626" : b.slot.fill > 0.35 ? "#D97706" : "#059669" }}>{(b.slot.fill * 100).toFixed(0)}%</b></div>
            )}
          </div>
          {b.err.map((m9, i9) => <div className="err" key={"e" + i9}>{m9}</div>)}
          {b.warn.map((m9, i9) => <div className="warn" key={"w" + i9}>{m9}</div>)}
          <div className="note">
            Knowledge here stops at the stator drawing: fill, slot-opening feed, and channel capacity are
            verified; no rotor is assumed, so nothing performance-level (Ke, torque, speed) is claimed.
          </div>
        </div>
      </div>
      <div>
        <div className="card">
          <h2>Tooling notes</h2>
          <div className="tbl">
            <div className="kv"><span>Tool length ({p.wbCoils} channels)</span><b>{dl9(b.lenTool)}</b></div>
            <div className="kv"><span>Flange OD</span><b>{dl9(b.flangeOD)}</b></div>
            {b.slot && <div className="kv"><span>Slot opening vs bundle</span>
              <b style={{ color: b.dEff > p.slotOpen - 0.1 ? "#DC2626" : "#059669" }}>{p.slotOpen} vs {b.dEff.toFixed(2)} mm</b></div>}
          </div>
          <div className="note">
            Wind direction alternates per channel if coils insert A-B-A-B; the jumper allowance covers the
            inter-coil throw plus a service loop. Verify the coil OD clears your insertion tooling.
          </div>
        </div>
      </div>
    </>
  );
}

/* ---- Actuator module: composes the motor & brake designs open in their tabs through a gearhead ---- */
function ActuatorView({ p, s, us, switchType, typeMem, tqS, typeDefaults, exportActuator, importActuator, ioMsg, impPanel }) {
  const motorT = p.actMotor === "brushed" ? "brushed" : p.actMotor === "stepper" ? "stepper" : "pm";
  const motorP = typeMem.current[motorT]
    ? { ...typeMem.current[motorT], motorType: motorT }
    : { ...p, ...(typeDefaults[motorT] ? PRESETS[typeDefaults[motorT]] : {}), motorType: motorT };
  const mr = React.useMemo(() => computeDesign(motorP), [JSON.stringify(motorP)]);
  const brakeP = typeMem.current.brake
    ? { ...typeMem.current.brake, motorType: "brake" }
    : { ...p, ...(PRESETS[typeDefaults.brake] || {}), motorType: "brake" };
  const withBrk = p.actBrake === "yes";
  const br = React.useMemo(() => (withBrk ? computeDesign(brakeP) : null), [JSON.stringify(brakeP), withBrk]);
  const act = composeActuator(mr, br, { type: p.gbType, ratio: p.gbRatio, stages: p.gbStages, effOv: p.gbEff, brg: p.gbBrg });
  const gtAll = useMemo(() => {
    if (act.fail) return null;
    const env0 = actEnvelope(motorP, withBrk ? brakeP : null, act, withBrk, p.gbOD, p.gbLen);
    return designGearTrain(p, act, env0.gOD, env0.Lg);
  }, [p, act, motorP, brakeP, withBrk]);
  const gtLim = gtAll && Number.isFinite(gtAll.TmaxOut) ? { T: gtAll.TmaxOut, label: "tooth yield" } : null;
  const rTS = act.fail ? null : { curve: act.curve, noLoad: act.noLoad, op: act.op, TstallW: 0 };
  const rIT = act.fail ? null : { Kt: mr.Kt * act.N * act.eta, peakT: act.peakT, op: act.op, Iph: mr.Iph, kIT: mr.kIT };
  const pIT = { motorType: motorT === "stepper" ? "pm" : motorT, Imax: motorP.Imax }; // chart math is generic
  const srcTag = (t9) => (typeMem.current[t9] ? "from its tab (live)" : "tab not opened yet — using its default preset");
  return (
    <>
      <div>
        <div className="card" style={{ borderTop: "3px solid #3B82F6" }}>
          <h2>Architecture</h2>
          <Pick label="Machine type" v={p.motorType} set={switchType}
            opts={[{ v: "pm", t: "BLDC" }, { v: "brushed", t: "Brushed" }, { v: "latm", t: "LATM" }, { v: "stepper", t: "Step" }, { v: "induction", t: "ACIM" }, { v: "brake", t: "Brake" }, { v: "actuator", t: "Actuator" }, { v: "bobbin", t: "Winding" }]} />
          <div className="note">Composite actuator: the motor and brake designs open in their tabs, driven through a multi-stage gearhead, presented at the output shaft.</div>
          <div className="iobar" style={{ marginTop: 8 }}>
            <button className="btn" onClick={exportActuator}>Export actuator .json</button>
            <label className="btn ghost">
              Import…
              <input type="file" accept=".json,application/json" onChange={importActuator} />
            </label>
          </div>
          <div className="note" style={{ marginTop: 2 }}>Module-scoped file: gearing, composition, output shaft, mounting, finishes. Motor and brake designs travel in their own tabs' .json files.</div>
          {ioMsg && <div className="iomsg">{ioMsg}</div>}
          {impPanel}
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Composition</h2>
          <Pick label="Motor source" v={p.actMotor} set={s("actMotor")}
            opts={[{ v: "pm", t: "BLDC tab" }, { v: "brushed", t: "Brushed tab" }, { v: "stepper", t: "Stepper tab" }]} />
          <div className="note" style={{ marginTop: 2 }}>Motor: {srcTag(motorT)}.</div>
          <Pick label="Holding brake" v={p.actBrake} set={s("actBrake")}
            opts={[{ v: "yes", t: "Include (Brake tab)" }, { v: "no", t: "None" }]} />
          {withBrk && <div className="note" style={{ marginTop: 2 }}>Brake: {srcTag("brake")}.</div>}
          <Pick label="Gearhead" v={["Planetary", "Harmonic", "Spur"].includes(p.gbType) ? p.gbType : "Planetary"} set={s("gbType")}
            opts={[{ v: "Planetary", t: "Planetary" }, { v: "Harmonic", t: "Harmonic" }, { v: "Spur", t: "Spur cluster" }]} />
          <Num label="Overall ratio" unit=":1" v={p.gbRatio} set={s("gbRatio")} min={1} />
          <Num label="Stages" v={p.gbStages} set={s("gbStages")} min={1} max={4} />
          <Num label="Efficiency override (0 = auto)" unit="%" v={p.gbEff} set={s("gbEff")} min={0} max={100} />
          <Num label="Gearhead OD (0 = auto shell)" unit="mm" v={p.gbOD} set={s("gbOD")} min={0} />
          <Num label="Gearhead length (0 = auto shell)" unit="mm" v={p.gbLen} set={s("gbLen")} min={0} />
          <Sel label="Gear preset" v={"(pick)"} set={(v9) => {
            const g9 = GEAR_PRESETS[v9]; if (!g9) return;
            ["gbType", "gbRatio", "gbStages", "gbOD", "nPlanets"].forEach((k9) => s(k9)(g9[k9]));
          }} opts={["(pick)", ...Object.keys(GEAR_PRESETS)]} />
          <Sel label="AGMA quality" v={p.agmaQ} set={s("agmaQ")} opts={["Q7", "Q9", "Q11", "Q13"]} />
          <Sel label="Gear material / hardness" v={GEAR_MATS[p.gbMat] ? p.gbMat : GEAR_MAT_DEF} set={s("gbMat")} opts={Object.keys(GEAR_MATS)} />
          {(() => { const g8 = GEAR_MATS[p.gbMat] || GEAR_MATS[GEAR_MAT_DEF]; return (
            <>
              <div className="kv"><span>Tooth bending allowable</span><b>{g8.sig} MPa</b></div>
              <div className="hint" style={{ margin: "-2px 0 6px", fontSize: 11, opacity: 0.7 }}>
                {g8.note}. Sets the Lewis tooth-yield torque cap for spur/planetary stages; harmonic capacity is ratcheting-limited and unaffected.
              </div>
            </>
          ); })()}
          <Pick label="Pressure angle" v={p.presAng} set={s("presAng")} opts={[{ v: 20, t: "20°" }, { v: 25, t: "25°" }]} />
          {p.gbType === "Planetary" && <Num label="Planets per stage" v={p.nPlanets} set={s("nPlanets")} min={2} max={6} />}
          <Pick label="Output bearing" v={p.gbBrg} set={s("gbBrg")}
            opts={[{ v: "radial", t: "Radial" }, { v: "double", t: "2\u00d7 radial" }, { v: "acpair", t: "AC pair" }]} />
          <h2 style={{ marginTop: 12 }}>Output shaft</h2>
          <Pick label="Shaft style" v={p.oshType} set={s("oshType")}
            opts={[{ v: "round", t: "Round" }, { v: "key", t: "Keyed" }, { v: "dflat", t: "D-flat" }, { v: "pinion", t: "Pinion" }]} />
          <Num label="Shaft OD (0 = auto)" unit="mm" v={p.oshOD} set={s("oshOD")} min={0} />
          <Num label="Overall length from face (0 = auto)" unit="mm" v={p.oshLen} set={s("oshLen")} min={0} />
          {p.oshType !== "round" && <Num label="Feature length at tip (0 = auto 70%)" unit="mm" v={p.oshFeat} set={s("oshFeat")} min={0} />}
          {p.oshType === "pinion" && <Num label="Pinion tip Ø (0 = auto 1.35× shaft)" unit="mm" v={p.oshPinD} set={s("oshPinD")} min={0} />}
          <h2 style={{ marginTop: 12 }}>Mounting</h2>
          <Pick label="Mount style" v={p.mntStyle} set={s("mntStyle")}
            opts={[{ v: "face", t: "Face mount" }, { v: "flange", t: "Flange" }]} />
          <Sel label="Thread (tapped pattern)" v={p.mntThread} set={s("mntThread")} opts={Object.keys(MNT_THREADS)} />
          <Num label="Holes (evenly spaced)" v={p.mntN} set={s("mntN")} min={0} max={12} />
          <Num label="Bolt circle Ø (0 = auto)" unit="mm" v={p.mntBCD} set={s("mntBCD")} min={0} />
          <Num label="Piloting boss OD (0 = none)" unit="mm" v={p.mntPilotOD} set={s("mntPilotOD")} min={0} />
          <Num label="Piloting boss depth (0 = none)" unit="mm" v={p.mntPilotT} set={s("mntPilotT")} step={0.5} min={0} />
          <h2 style={{ marginTop: 12 }}>Finish (iso)</h2>
          <Sel label="Gearhead housing" v={p.finGb} set={s("finGb")} opts={Object.keys(ISO_FINISHES)} />
          <Sel label="Motor housing" v={p.finMot} set={s("finMot")} opts={Object.keys(ISO_FINISHES)} />
          {p.actBrake === "yes" && <Sel label="Brake housing" v={p.finBrk} set={s("finBrk")} opts={Object.keys(ISO_FINISHES)} />}
          {p.mntStyle === "flange" && (
            <>
              <Pick label="Flange direction" v={p.mntDir} set={s("mntDir")}
                opts={[{ v: "fwd", t: "Toward output" }, { v: "aft", t: "Away (boss fwd)" }]} />
              <Num label="Flange Ø (0 = auto)" unit="mm" v={p.mntFlgOD} set={s("mntFlgOD")} min={0} />
              {p.mntDir === "aft" && <Num label="Spacing from output face" unit="mm" v={p.mntGap} set={s("mntGap")} step={0.5} min={0} />}
              <Num label={p.mntDir === "aft" ? "Flange thickness" : "Flange projection from output face"} unit="mm" v={p.mntFlgT} set={s("mntFlgT")} step={0.5} min={1} />
              {p.mntDir === "aft" && <div className="note" style={{ marginTop: 2 }}>
                The gearhead OD ahead of the flange acts as the mounting boss — it registers in the mating bore,
                bolts pull from behind through the flange.</div>}
            </>
          )}
          <div className="note">
            Per-stage efficiency for miniature/precision gearheads (Maxon/Faulhaber-class catalog data):
            planetary 90%, spur 93%, harmonic 80% at rated load & warm — compounded per stage (η = η_stage^stages).
            Premium needle-bearing planetaries reach 95%+, and harmonic drops at partial load, cold, and the
            highest ratios — enter the datasheet value in the override where it matters. Ratio splits evenly
            across stages against each train's practical window.
          </div>
        </div>
        <AssumptionsCard p={p} />
      </div>
      <div>
        {!act.fail && (() => {
          const env9 = actEnvelope(motorP, withBrk ? brakeP : null, act, withBrk, p.gbOD, p.gbLen);
          const gt = designGearTrain(p, act, env9.gOD, env9.Lg);
          return <div className="card">
            <div className="cardhead">
              <h2>Gear train — synthesized</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-gearsec", "gear-section.png")}>PNG ⤓</button>
            </div>
            <GearSection g={gt} us={us} />
            <div className="cardhead" style={{ marginTop: 10 }}>
              <h2>Gearhead section — side</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-ghsec", "gearhead-section.png")}>PNG ⤓</button>
            </div>
            <GearheadSection gt={gt} brg={p.gbBrg}
              mnt={{ thread: p.mntThread, n: p.mntN, bcd: p.mntBCD, dir: p.mntDir }}
              oShD={p.oshOD > 0 ? p.oshOD : env9.oShD} us={us} />
            {gt.stages[0] && gt.stages[0].Zr && (() => {
              const s1 = gt.stages[0], m1 = s1.m;
              const row9 = (nm, Z, PD, tip, root) => (
                <div className="kv" key={nm}><span>{nm} \u00b7 {Z}t</span>
                  <b>PD {PD} \u00b7 tip \u00d8{tip.toFixed(2)} \u00b7 root \u00d8{root.toFixed(2)} \u00b7 m {m1} (DP {(25.4 / m1).toFixed(1)}) \u00b7 {gt.presAng}\u00b0 \u00b7 face {s1.F} \u00b7 {gt.agmaQ}</b></div>
              );
              return <div className="tbl" style={{ marginTop: 8 }}>
                <div className="kv"><span style={{ fontWeight: 600 }}>Drawing callouts (stage 1, mm)</span><b></b></div>
                {row9(`Sun${s1.shift ? " (shifted +x)" : ""}`, s1.Zs, s1.PDs, s1.PDs + 2 * m1, s1.PDs - 2.5 * m1)}
                {row9("Planet", s1.Zp, s1.PDp, s1.PDp + 2 * m1, s1.PDp - 2.5 * m1)}
                {row9("Ring (internal)", s1.Zr, s1.PDr, s1.PDr - 2 * m1, s1.PDr + 2.5 * m1)}
              </div>;
            })()}
            <div className="tbl" style={{ marginTop: 8 }}>
              {gt.stages.map((s9) => (
                <div className="kv" key={s9.i}><span>Stage {s9.i}{s9.Zr ? ` · Zs/Zp/Zr ${s9.Zs}/${s9.Zp}/${s9.Zr}` : s9.Z1 ? ` · Z ${s9.Z1}/${s9.Z2}` : ` · flex/circ ${s9.Zf}/${s9.Zc}`}</span>
                  <b>m {s9.m} · face {s9.F} mm{s9.a ? ` · a ${s9.a} · pins Ø${s9.pinBC}` : ""} · {s9.u.toFixed(2)}:1 · η {(s9.ef * 100).toFixed(1)}%</b></div>
              ))}
              <div className="kv"><span>Stages for {act.N}:1 (practical {gt.win[0]}–{gt.win[1]}:1/stage)</span>
                <b>{gt.stOk ? `${act.st} ✓` : <>{"recommend " + gt.recSt + " "}
                  <button className="btn mini" onClick={() => s("gbStages")(gt.recSt)}>apply</button></>}</b></div>
              <div className="kv"><span>Backlash at the output ({gt.agmaQ}: mesh + mech clearances est.)</span>
                <b>{gt.blGear.toFixed(1)}′ + {gt.blMech.toFixed(1)}′ = {gt.blOut.toFixed(1)} arcmin</b></div>
              <div className="kv"><span>Efficiency, forward / back-driving</span>
                <b>{(gt.effF * 100).toFixed(1)}% / {gt.selfLock ? "self-locking" : (gt.effB * 100).toFixed(1) + "%"}</b></div>
              <div className="kv"><span>Back-drive breakaway at the output (est.)</span><b>{gt.Tbd.toFixed(3)} N·m</b></div>
              <div className="kv"><span>Friction torque through the train (fwd, at peak output)</span>
                <b>{(act.peakT * (1 - gt.effF)).toFixed(2)} N·m of {act.peakT.toFixed(2)}</b></div>
              {Number.isFinite(gt.TmaxOut) && <div className="kv"><span>{gt.stages[0] && gt.stages[0].harmonic ? "Momentary peak (ratcheting limit, size class)" : `Tooth-yield torque cap (Lewis, stage ${gt.limStage})`}</span>
                <b style={{ color: act.peakT > gt.TmaxOut ? "#DC2626" : act.peakT > 0.6 * gt.TmaxOut ? "#D97706" : "#059669" }}>{gt.TmaxOut.toFixed(1)} N·m · margin ×{(gt.TmaxOut / Math.max(act.peakT, 1e-6)).toFixed(1)} vs peak</b></div>}
              {act.op && (() => {                                       /* A3: gear heat into the housing */
                const Pout = (act.op.T * act.op.n * 2 * Math.PI) / 60;
                const Pg = Pout * (1 / Math.max(gt.effF, 0.05) - 1);
                const A9 = Math.PI * (env9.gOD / 1000) * (env9.Lg / 1000) + (Math.PI / 2) * Math.pow(env9.gOD / 1000, 2);
                const dT = Pg / (12 * Math.max(A9, 1e-4));               /* natural convection h ~ 12 */
                return <>
                  <div className="kv"><span>Gear dissipation at the operating point</span>
                    <b>{Pg.toFixed(1)} W · housing ΔT ≈ {dT.toFixed(0)} °C (natural conv. est.)</b></div>
                  {dT > 40 && <div className="warn">Gearhead runs ≈ {dT.toFixed(0)} °C over ambient at this point — sealed-housing heat is NOT in the motor thermal model; derate continuous torque or add conduction to the mount.</div>}
                </>;
              })()}
              {gt.KvMax > 1.15 && <div className="note">Dynamic factor Kv up to {gt.KvMax.toFixed(2)} applied at input-stage pitch-line speed — higher AGMA quality reduces it.</div>}
              {gt.w.map((w9, i9) => <div className="warn" key={i9}>{w9}</div>)}
            </div>
            <div className="note">
              Synthesized from gearhead Ø, {gt.agmaQ}, {gt.presAng}° pressure angle, {gt.gbMat} ({gt.sigAllow} MPa allowable){gt.nP && gt.stages[0] && gt.stages[0].Zr ? `, ${gt.nP} planets (ring–sun assembly constraint enforced)` : ""}.
              Backlash: per-mesh allowance reflected through downstream ratios — the output stage dominates.
              Efficiency: mesh sliding (tooth-count dependent) + seal/churning drag; back-drive reverses the
              torque-proportional losses (η_b ≈ 2 − 1/η_f per stage). Tooth cap is Lewis bending at 380 MPa
              case-hardened allowable — first-order, verify critical designs against AGMA 2001 or the catalog.
            </div>
          </div>;
        })()}
        {!act.fail && (
          <div className="card">
            <div className="cardhead">
              <h2>Composite outline</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-actline", "actuator-outline.png")}>PNG ⤓</button>
            </div>
            <ActuatorOutline motorP={motorP} brakeP={withBrk ? brakeP : null} act={act} withBrk={withBrk} us={us} gbOD={p.gbOD} gbLen={p.gbLen} mnt={{ style: p.mntStyle, thread: p.mntThread, n: p.mntN, bcd: p.mntBCD, flgOD: p.mntFlgOD, flgT: p.mntFlgT, dir: p.mntDir, gap: p.mntGap, pilotOD: p.mntPilotOD, pilotT: p.mntPilotT, osh: { type: p.oshType, od: p.oshOD, len: p.oshLen, feat: p.oshFeat, pin: p.oshPinD } }} gt={gtAll} brg={p.gbBrg} />
            <div className="cardhead" style={{ marginTop: 12 }}>
              <h2>Isometric</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-actiso", "actuator-iso.png")}>PNG ⤓</button>
            </div>
            <ActuatorIso motorP={motorP} brakeP={withBrk ? brakeP : null} act={act} withBrk={withBrk} us={us} gbOD={p.gbOD} gbLen={p.gbLen} mnt={{ style: p.mntStyle, thread: p.mntThread, n: p.mntN, bcd: p.mntBCD, flgOD: p.mntFlgOD, flgT: p.mntFlgT, dir: p.mntDir, gap: p.mntGap, pilotOD: p.mntPilotOD, pilotT: p.mntPilotT, osh: { type: p.oshType, od: p.oshOD, len: p.oshLen, feat: p.oshFeat, pin: p.oshPinD } }} fin={{ gb: p.finGb, mot: p.finMot, brk: p.finBrk }} />
            <div className="note">
              Envelope outline at true relative scale. Gearhead: {p.gbOD > 0 || p.gbLen > 0 ? "specified envelope where entered, typical shell for the rest" : "representative shell"} — auto length built up from what
              the stages need (1.5×face + carrier per stage, real bearing width, faceplate; harmonic straight
              from the catalog size table), motor from stack + coil heads + endbells, brake from backiron + armature/disc pack.
              Verify against catalog drawings before packaging.
            </div>
          </div>
        )}
        <div className="card" style={{ marginTop: act.fail ? 0 : 14 }}>
          <h2>Composite performance (output shaft)</h2>
          {act.fail ? (
            <div className="warn">{act.fail}</div>
          ) : (
            <>
              <div className="tbl">
                <div className="kv"><span>Gear train</span><b>{act.type} · {act.st} stage{act.st > 1 ? "s" : ""} · {act.spr.toFixed(1)}:1 each = {act.N}:1</b></div>
                <div className="kv"><span>Efficiency η (per stage / total)</span><b>{(act.etaStage * 100).toFixed(0)}% / {(act.eta * 100).toFixed(0)}%{p.gbEff > 0 ? " (override)" : ""}</b></div>
                <div className="kv"><span>Output no-load</span><b>{fmt(act.noLoad, 0)} rpm</b></div>
                {act.op && <div className="kv"><span>Output rated point</span><b>{fmt(act.op.n, 0)} rpm · {tqS(act.op.T)} · {fmt(mr.op && mr.Kt > 0 ? mr.op.T / mr.Kt : NaN, 2)} A</b></div>}
                <div className="kv"><span>Output peak (drive-limited)</span><b>{tqS(act.peakT)}</b></div>
                {Number.isFinite(act.Tcont) && act.Tcont !== null && <div className="kv"><span>Output continuous (S1)</span><b>{tqS(act.Tcont)}</b></div>}
                <div className="kv"><span>Static holding (brake × ratio)</span>
                  <b>{act.hold !== null ? tqS(act.hold) : withBrk ? "—" : "no brake"}</b></div>
                <div className="kv"><span>Back-drive</span>
                  <b>{act.selfLock ? "self-locking (not backdrivable)" : "η_back ≈ " + (act.etaBack * 100).toFixed(0) + "%"}</b></div>
                <div className="kv"><span>Load inertia reflected to motor</span><b>÷ {(act.N * act.N).toFixed(0)}</b></div>
                <div className="kv"><span>Gearhead OD {p.gbOD > 0 ? "(specified)" : "(est, on this motor)"}</span>
                  <b>{(() => { const od9 = p.gbOD > 0 ? p.gbOD : motorP.statorOD * (act.type === "Harmonic" ? 1.0 : 1.1); return us === "in" ? (od9 / 25.4).toFixed(2) + " in" : Math.round(od9) + " mm"; })()}</b></div>
              </div>
              {act.warn.map((m9, i9) => <div className="warn" key={i9}>{m9}</div>)}
              <h2 style={{ marginTop: 14 }}>Output torque–speed</h2>
              <TorqueSpeedChart r={rTS} us={us} tLimit={gtLim} />
              <h2 style={{ marginTop: 14 }}>Motor current vs output torque</h2>
              <CurrentTorqueChart r={rIT} p={pIT} us={us} tLimit={gtLim} />
              <div className="note">
                Motor curve mapped through the train: speed ÷ N, torque × N·η; the current axis is motor phase
                current with the same saturation bend, so the drive limit reads directly. Holding torque passes
                the ratio without η — friction aids holding. Gearhead torque rating, backlash, and stiffness are
                not modeled — check the datasheet.
              </div>
            </>
          )}
        </div>
      </div>
      <div>
        <div className="card">
          <h2>Components</h2>
          <div className="tbl">
            <div className="kv"><span>Motor</span><b>{motorT === "pm" ? "BLDC/PMSM" : motorT === "stepper" ? (motorP.stpKind === "pm" ? "PM stepper" : "Hybrid stepper") : "Brushed DC"} · Ø{motorP.statorOD} × {motorP.stackL} mm</b></div>
            <div className="kv"><span>Kt / no-load</span><b>{fmt(mr.Kt, 4)} N·m/A · {fmt(mr.noLoad, 0)} rpm</b></div>
            {mr.op && <div className="kv"><span>Motor rated point</span><b>{fmt(mr.op.n, 0)} rpm · {tqS(mr.op.T)}</b></div>}
            {mr.err.length > 0 && <div className="kv"><span>Motor status</span><b style={{ color: "#DC2626" }}>{mr.err.length} error(s) in its tab</b></div>}
            {withBrk && br && (
              <>
                <div className="kv"><span>Brake</span><b>Ø{brakeP.statorOD} mm{br.brake ? ` · springs ${br.brake.Fclamp.toFixed(0)} N` : ""}</b></div>
                {br.brake && <div className="kv"><span>Brake hold / release margin</span><b>{tqS(br.brake.Thold)} · ×{fmt(br.brake.marginRel, 2)}</b></div>}
                {br.brake && <div className="kv"><span>Brake coil (released)</span><b>{fmt(br.brake.Ihold, 2)} A · {fmt(br.brake.Phold, 1)} W</b></div>}
                {br.err.length > 0 && <div className="kv"><span>Brake status</span><b style={{ color: "#DC2626" }}>{br.err.length} error(s) in its tab</b></div>}
              </>
            )}
          </div>
          <div className="note">
            Sources are the live designs in each tab — edit there, and this composite follows. The brake mounts
            on the motor shaft ahead of the gearhead.
          </div>
        </div>
      </div>
    </>
  );
}

export default function MotorDesigner() {
  const [p, setP] = useState({
    slots: 36, poles: 8, statorOD: 150, statorID: 90, rotorOD: 89,
    yoke: 12, toothW: 5.4, slotOpen: 2.5, tipH: 1.5, stackL: 80, liner: 0.25, slotR: 0,
    pattern: "lap", layers: 2, span: 0, turns: 2, awg: 14, strands: 2, paths: 1, insBuild: "Heavy", turnBasis: "coil",
    conn: "wye", vref: "ll", motorType: "pm", ctrl: "foc", sense: "hall",
    mag: "N45SH", magT: 4, poleArc: 85, Top: 60,
    endMode: "auto", headH: 15, bobShape: "race", bobD: 30, bobWall: 1, bobWin: 16,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", shaftD: 15,
    loadMode: "J", Irate: 5, bdRpm: 1800, Tcu: 100, Rext: 20,
    Tamb: 25, cooling: "Open air", TcuMax: 130, Tmin: -40, dutyPct: 100, cycleT: 10, brkEco: 100,
    mR: 0, mL: 0, mKe: 0, mNl: 0, mBpp: 0, mBrms: 0, mBf: 0, mBn: 0, calTn: 0, calTt: 0, calTs: 0,
    calOn: "no", calKR: 1, calKL: 1, calKKe: 1, calKKt: 1, calTd: 0,
    gbType: "Planetary", gbRatio: 10, gbStages: 1, gbEff: 0, gbOD: 0, gbLen: 0, actMotor: "pm", actBrake: "yes",
    agmaQ: "Q9", gbMat: "Carburized 8620/9310 (58\u201362 HRC)", presAng: 20, nPlanets: 3, gbBrg: "radial",
    oshType: "key", oshOD: 0, oshLen: 0, oshFeat: 0, oshPinD: 0,
    mntStyle: "face", mntThread: "4-40", mntN: 4, mntBCD: 0, mntFlgOD: 0, mntFlgT: 3, mntDir: "fwd", mntGap: 5, mntPilotOD: 0, mntPilotT: 0,
    finGb: "Matte steel", finMot: "Aluminum", finBrk: "Black anodized",
    wbArborD: 8, wbChanW: 6, wbChanH: 5, wbFlange: 1.2, wbCoils: 6, wbJump: 25, wbSides: 2, wbMode: "fwd", wbRt: 0, wbRtip: 0.8, wbLay: "wild", wbHead: 0,
    brushV: 1.5, latmWind: 2,
    brkSprFree: 23.3, brkSprEng: 18.3, brkMu: 0.40, brkMuD: 0.32, brkFaces: 2, brkStroke: 0.3,
    brkBore: 26, brkPole: 6, brkArm: 6, brkFeScale: 100, brkK: 40, brkSpringN: 6, brkRo: 27, brkRi: 18, brkMat: "Organic (resin-bonded)",
    brkPktID: 48, brkBossOD: 38, brkPktD: 18, brkBobID: 40.2, brkBobOD: 47, brkBobL: 15,
    stpNr: 50, stpKind: "hybrid", stpPP: 12, stpWire: "bip-ser", stpOn: 2, stpHubD: 0, stpThruD: 0, latmSect: 4, latmSpan: 60, latmTravel: 45,
    rotorBars: 28, barA: 60, ringA: 120, barMat: "Cast aluminum",
    Vll: 400, Vdc: 48, Imax: 40, freq: 50, J: 5.5, Bg: 0.85, seq: "ABC",
  });
  const [ioMsg, setIoMsg] = useState("");
  const [us, setUs] = useState("in");
  const lu = us === "in" ? "in" : "mm", au = us === "in" ? "in²" : "mm²";
  const lenS = (mm, dIn = 3, dMm = 2) => (Number.isFinite(mm) ? (us === "in" ? (mm / INCH).toFixed(dIn) : mm.toFixed(dMm)) : "—");
  const areaS = (mm2) => (Number.isFinite(mm2) ? (us === "in" ? (mm2 / 645.16).toFixed(4) : mm2.toFixed(1)) : "—");
  const tqS = (nm) => {
    if (!Number.isFinite(nm)) return "—";
    if (us !== "in") {
      if (Math.abs(nm) < 0.1) return (nm * 1000).toFixed(nm * 1000 < 10 ? 2 : 1) + " mN·m";
      return nm.toFixed(nm < 10 ? 2 : 1) + " N·m";
    }
    const oz = nm * 141.612;
    if (oz < 1) return oz.toFixed(3) + " oz·in";
    if (oz < 320) return oz.toFixed(oz < 10 ? 2 : 1) + " oz·in";
    return (nm * 8.8507).toFixed(2) + " lb·in";
  };
  const ktS = (kt) => (us === "in" ? (kt * 141.612).toFixed(2) + " oz·in/A" : kt.toFixed(3) + " N·m/A");
  const indS = (h) => (!Number.isFinite(h) ? "—" : h < 1e-3 ? (h * 1e6).toFixed(h * 1e6 < 100 ? 1 : 0) + " µH" : (h * 1e3).toFixed(2) + " mH");
  const keS = (ke) => (us === "in" ? (ke * 104.7198).toFixed(2) + " V/krpm" : ke.toFixed(4) + " V·s/rad");
  const [anim, setAnim] = useState({ on: false, th: 0 });
  const [dxf, setDxf] = useState(null);
  const [preset, setPreset] = useState("— choose a preset —");
  const [wizOpen, setWizOpen] = useState(true);
  const [wizTab, setWizTab] = useState("files");
  const [wiz, setWiz] = useState({ od: 57, stack: 40, vdc: 28, imax: 10, nl: 5000, tst: 60, trt: 30, nrt: 4000, arch: "pm", ctrl: "foc", shape: "sine", freq: 60, travel: 45, stepA: 1.8, swire: "bip-ser", stroke: 0.3, bore: 16 });
  const [wizMsg, setWizMsg] = useState("");
  const sw = (k) => (v) => setWiz((o) => ({ ...o, [k]: v }));
  const [wizAlts, setWizAlts] = useState([]);
  const [canRestore, setCanRestore] = useState(false);
  const envPrev = React.useRef(null);
  const generateEnvelope = () => {
    const r9 = synthEnvelope({ ...wiz, arch: wArch }, p, us);
    if (r9.fail) { setWizMsg(r9.fail); setWizAlts([]); return; }
    envPrev.current = p;                                     // one-level undo of the overwrite
    setCanRestore(true);
    setP(r9.p);
    setWizMsg(r9.msg);
    setWizAlts(r9.alts || []);
  };
  const applyAlt = (a9) => {
    envPrev.current = p;
    setCanRestore(true);
    setP(a9.p);
    setWizMsg(`Applied alternate: ${a9.label} — ${a9.note}`);
  };
  const captureCal = () => {
    const r0 = computeDesign({ ...p, calOn: "no" });
    if (r0.err.length) { setIoMsg("Fix design errors before capturing calibration."); return; }
    const termR = brM ? (r0.brush ? r0.brush.Ra : 0) : r0.Rll;
    const termL = brM ? (r0.brush ? r0.brush.La : 0) : r0.Lll;
    const kR = p.mR > 0 && termR > 0 ? p.mR / 1000 / termR : 1;
    const kL = p.mL > 0 && termL > 0 ? (p.mL / 1e6) / termL : 1;
    const kKe = p.mNl > 0 && r0.noLoad > 0 ? r0.noLoad / p.mNl : 1;
    let kKt = kKe;                                                  // no stall measured → torque tracks BEMF
    if (p.calTs > 0 && r0.peakT > 0) kKt = (us === "in" ? p.calTs / IN2C : p.calTs) / r0.peakT;
    let Td = 0;
    if (p.calTt > 0 && p.calTn > 0) {
      const r1 = computeDesign({ ...p, calOn: "yes", calKR: kR, calKL: kL, calKKe: kKe, calKKt: kKt, calTd: 0 });
      if (!r1.err.length && r1.curve.length) {
        const Tm = us === "in" ? p.calTt / IN2C : p.calTt;
        let Tp = 0;
        for (let i9 = 1; i9 < r1.curve.length; i9++) {
          const c0 = r1.curve[i9 - 1], c1 = r1.curve[i9];
          if ((c0.n - p.calTn) * (c1.n - p.calTn) <= 0 && c1.n !== c0.n) {
            Tp = c0.T + ((p.calTn - c0.n) / (c1.n - c0.n)) * (c1.T - c0.T); break;
          }
        }
        Td = Math.max(Tp - Tm, 0);
      }
    }
    setP((o) => ({ ...o, calOn: "yes", calKR: +kR.toFixed(4), calKL: +kL.toFixed(4),
      calKKe: +kKe.toFixed(4), calKKt: +kKt.toFixed(4), calTd: +Td.toFixed(5) }));
    setIoMsg("Calibration captured — the model now tracks the bench, and design tweaks predict the real motor's response.");
  };
  const restorePrev = () => {
    if (!envPrev.current) return;
    const cur = p;
    setP(envPrev.current);
    envPrev.current = cur;                                   // toggles between the two
    setWizMsg("Restored the previous design — press again to toggle back.");
  };
  const applyPreset = (name) => {
    setPreset(name);
    const pr = PRESETS[name];
    if (!pr) return;
    setP((o) => ({ ...o, ...pr }));
    setIoMsg("Loaded preset: " + name + ". All values are starting points — tune and verify.");
  };
  const [phaseSel, setPhaseSel] = useState("all");
  const bemfView = p.conn === "delta" ? "ll" : (p.vref === "ln" ? "ph" : "ll");
  useEffect(() => {
    if (!anim.on) return;
    const id = setInterval(() => setAnim((a) => ({ ...a, th: a.th + 0.09 })), 40);
    return () => clearInterval(id);
  }, [anim.on]);
  const s = (k) => (v) => setP((o) => ({ ...o, [k]: v }));
  // per-type parameter memory: every change is snapshotted under the active machine type,
  // so toggling BLDC → Brushed → BLDC restores each type's full table for this session
  const typeMem = React.useRef({});
  useEffect(() => { typeMem.current[p.motorType] = p; }, [p]);
  const BRUSHED_DEFAULT = "Brushed 24 V · 4-pole NdFeB · ~4.5 krpm";
  const TYPE_DEFAULTS = { brushed: BRUSHED_DEFAULT, latm: 'LATM 1.5" · 28 V · SmCo 4-pole · 45° toggle',
    induction: "ACIM 115 V · 400 Hz · 4-pole aero", stepper: "NEMA 17 · 1.8° hybrid · bipolar",
    brake: "Brake 24 V · 60 mm · spring-applied" };
  const switchType = (nt) => {
    if (nt === p.motorType) return;
    const saved = typeMem.current[nt];
    if (saved) { setP({ ...saved, motorType: nt }); setIoMsg(""); return; }
    if (TYPE_DEFAULTS[nt] && PRESETS[TYPE_DEFAULTS[nt]]) {
      setP((o) => ({ ...o, ...PRESETS[TYPE_DEFAULTS[nt]] }));
      setIoMsg("Loaded starting point: " + TYPE_DEFAULTS[nt] + " — see Start ▸ Presets for the others. Your previous machine's parameters are kept and restore when you toggle back.");
      return;
    }
    setP((o) => ({ ...o, motorType: nt }));
    setIoMsg("");
  };
  const r = useMemo(() => computeDesign(p), [p]);
  const rRaw = useMemo(
    () => (p.calOn === "yes" && (p.motorType === "pm" || p.motorType === "brushed")
      ? computeDesign({ ...p, calOn: "no" }) : null),
    [p]);
  const pm = p.motorType === "pm" || p.motorType === "brushed";
  const brM = p.motorType === "brushed";
  const latmM = p.motorType === "latm";
  const brkM = p.motorType === "brake", stpM = p.motorType === "stepper";
  const actM = p.motorType === "actuator", wbM = p.motorType === "bobbin";
  const IN2C = 141.612;
  // bench BEMF: derive Ke from what the scope/meter shows.
  // BLDC: RMS (or pk-pk/2√2 sine estimate) at speed 120·f/poles. Brushed: DC volts at rig speed.
  const mKeEff = (() => {
    if (brM) return p.mBrms > 0 && p.mBn > 0 ? p.mBrms / (p.mBn / 1000) : p.mKe;
    const rms9 = p.mBrms > 0 ? p.mBrms : p.mBpp > 0 ? p.mBpp / (2 * Math.SQRT2) : 0;
    const nB9 = p.mBf > 0 ? (120 * p.mBf) / Math.max(p.poles, 2) : 0;
    return rms9 > 0 && nB9 > 0 ? rms9 / (nB9 / 1000) : p.mKe;
  })();
  const mBn9 = brM ? p.mBn : p.mBf > 0 ? (120 * p.mBf) / Math.max(p.poles, 2) : 0;

  // envelope architecture follows the globally selected machine type
  const wArch = ({ pm: "pm", brushed: "brushed", latm: "latm", stepper: "stepper", brake: "brake", induction: "acim" })[p.motorType] || "pm";
  const special = latmM || brkM || stpM;

  const exportDesign = () => {
    const payload = { tool: "motrworks", version: 10, saved: new Date().toISOString(), units: us, design: p };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `motor-${p.slots}s${p.poles}p-${p.motorType}.json`;
    el.click();
    URL.revokeObjectURL(url);
    setIoMsg("Design exported.");
  };
  const finMigrate = (v9) => (v9 === "Iridescent alum" ? "Iridite (chem film)" : v9);
  // Actuator-scoped IO: the composite module owns only gearing/composition/output-shaft/mounting/finish
  // fields. The motor & brake tabs keep their own full-design import/export; importing a full design
  // file HERE applies only these fields, so a saved motor never gets dragged in through the actuator tab.
  const ACT_KEYS = ["actMotor", "actBrake", "gbType", "gbRatio", "gbStages", "gbEff", "gbOD", "gbLen", "gbBrg",
    "agmaQ", "gbMat", "presAng", "nPlanets", "oshType", "oshOD", "oshLen", "oshFeat", "oshPinD",
    "mntStyle", "mntThread", "mntN", "mntBCD", "mntFlgOD", "mntFlgT", "mntDir", "mntGap", "mntPilotOD", "mntPilotT",
    "finGb", "finMot", "finBrk"];
  const exportActuator = () => {
    const sub = {}; ACT_KEYS.forEach((k) => { if (k in p) sub[k] = p[k]; });
    const payload = { tool: "motrworks", scope: "actuator", version: 10, saved: new Date().toISOString(), units: us, actuator: sub };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `actuator-${String(p.gbType || "gb").toLowerCase()}-${p.gbRatio}to1.json`;
    el.click();
    URL.revokeObjectURL(url);
    setIoMsg("Actuator module exported — gearing, composition, output shaft, mounting, finishes.");
  };
  const importActuator = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        const raw = j && j.actuator ? j.actuator : j && j.design ? j.design : j; // scoped file, full design, or bare
        const src = {}; ACT_KEYS.forEach((k) => { if (raw && k in raw) src[k] = raw[k]; });
        const diffs = Object.keys(p).filter((k) => k in src && typeof src[k] === typeof p[k] && src[k] !== p[k])
          .map((k) => ({ k, from: p[k], to: src[k] }));
        if (!diffs.length) { setIoMsg(`${f.name}: no actuator-module fields differ from the current design.`); return; }
        setIoMsg("");
        setPendImp({ name: f.name + " → actuator fields only", src, units: j && j.units, diffs });
      } catch {
        setIoMsg("Could not read that file — expected JSON exported from this tool.");
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  };
  const [pendImp, setPendImp] = useState(null);
  // autosave + undo: guarded so restricted browsers (blocked localStorage) degrade silently
  const LSK = "motrworks-autosave-v1", LSK_OLD = "motrsynth-autosave-v1";
  const lsOK = useMemo(() => { try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); return true; } catch { return false; } }, []);
  const [restore, setRestore] = useState(null);
  const undoRef = React.useRef([]);
  const lastSnapRef = React.useRef(null);
  const skipPushRef = React.useRef(false);
  const [undoN, setUndoN] = useState(0);
  useEffect(() => {                                                   // offer restore once, on mount
    if (!lsOK) return;
    try {
      const j = JSON.parse(localStorage.getItem(LSK) || localStorage.getItem(LSK_OLD) || "null"); // pre-rebrand autosaves carry over
      if (j && j.design && j.ts) setRestore(j);
    } catch { /* corrupt save — ignore */ }
  }, [lsOK]);
  useEffect(() => {                                                   // debounced autosave + undo push
    const t = setTimeout(() => {
      if (lastSnapRef.current && !skipPushRef.current &&
          JSON.stringify(lastSnapRef.current.p) !== JSON.stringify(p)) {
        undoRef.current.push(lastSnapRef.current);
        if (undoRef.current.length > 25) undoRef.current.shift();
        setUndoN(undoRef.current.length);
      }
      skipPushRef.current = false;
      lastSnapRef.current = { p, us };
      if (lsOK) { try { localStorage.setItem(LSK, JSON.stringify({ v: 1, ts: Date.now(), us, design: p })); } catch { /* full */ } }
    }, 1200);
    return () => clearTimeout(t);
  }, [p, us, lsOK]);
  const doUndo = () => {
    const st = undoRef.current;
    if (!st.length) return;
    const prev = st.pop();
    setUndoN(st.length);
    skipPushRef.current = true;
    lastSnapRef.current = prev;
    setP(prev.p); setUs(prev.us);
  };
  const doRestore = () => {
    if (!restore) return;
    skipPushRef.current = true;
    setP((o) => {
      const n = { ...o };
      Object.keys(o).forEach((k) => { if (k in restore.design && typeof restore.design[k] === typeof o[k]) n[k] = restore.design[k]; });
      return n;
    });
    if (restore.us === "in" || restore.us === "mm") setUs(restore.us);
    setRestore(null);
    setIoMsg("Autosaved session restored.");
  };
  const applyImport = (src, fname, fileUnits) => {
    if (fileUnits === "in" || fileUnits === "mm") setUs(fileUnits);
    setPendImp(null);
    setP((o) => {
          const n = { ...o };
          let hits = 0;
          Object.keys(o).forEach((k) => {
            if (k in src && typeof src[k] === typeof o[k]) { n[k] = src[k]; hits++; }
          });
          ["finGb", "finMot", "finBrk"].forEach((k) => { n[k] = finMigrate(n[k]); });
          // legacy brake files: bobbin OD used to be the winding START (bore/barrel pair, ~1.6 mm apart).
          // Migrate to winding-window semantics: start = old OD, max finish = pocket − 1 mm.
          let migrated = false;
          if (n.motorType === "brake" && Number.isFinite(src.brkSpring) && src.brkSpring > 0 && !("brkSprFree" in src) && n.brkK > 0) {
            n.brkSprEng = +(n.brkPktD + Math.max(n.brkStroke, 0.05)).toFixed(2);
            n.brkSprFree = +(n.brkSprEng + src.brkSpring / n.brkK).toFixed(1);
            migrated = true;
          }
          if (n.motorType === "brake" && Number.isFinite(n.brkBobID) && Number.isFinite(n.brkBobOD) &&
              n.brkBobOD - n.brkBobID < 3 && n.brkPktID - n.brkBobOD > 3) {
            n.brkBobID = n.brkBobOD;
            n.brkBobOD = +(n.brkPktID - 1).toFixed(1);
            migrated = true;
          }
          setIoMsg(hits ? `Imported ${fname} (${hits} parameters).${migrated ? " Bobbin fields migrated to winding-window semantics (start unchanged, max = pocket − 1 mm)." : ""}` : "No recognizable parameters in that file.");
          return n;
        });
  };
  const importDesign = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        const src = j && j.design ? j.design : j; // accept bare or wrapped JSON
        const diffs = Object.keys(p).filter((k) =>
          k in src && typeof src[k] === typeof p[k] && src[k] !== p[k]
        ).map((k) => ({ k, from: p[k], to: src[k] }));
        if (!diffs.length) { setIoMsg(`${f.name} matches the current design — nothing would change.`); return; }
        setIoMsg("");
        setPendImp({ name: f.name, src, units: j && j.units, diffs });
      } catch {
        setIoMsg("Could not read that file — expected JSON exported from this tool.");
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  };
  const fmtDiffV = (x) => typeof x === "number" ? (Math.abs(x) >= 1000 ? Math.round(x) : +(+x).toPrecision(5)) : String(x);
  const impPanel = pendImp ? (
    <div className="iomsg" style={{ marginTop: 6 }}>
      <b>{pendImp.name}</b> changes {pendImp.diffs.length} field{pendImp.diffs.length > 1 ? "s" : ""}:
      <div style={{ maxHeight: 150, overflowY: "auto", margin: "4px 0" }}>
        {pendImp.diffs.slice(0, 14).map((d) => (
          <div key={d.k} style={{ fontSize: "0.92em" }}>
            {d.k}: {fmtDiffV(d.from)} → <b>{fmtDiffV(d.to)}</b></div>
        ))}
        {pendImp.diffs.length > 14 && <div>…and {pendImp.diffs.length - 14} more</div>}
      </div>
      <div className="iobar">
        <button className="btn" onClick={() => applyImport(pendImp.src, pendImp.name, pendImp.units)}>Apply</button>
        <button className="btn ghost" onClick={() => { setPendImp(null); setIoMsg("Import cancelled — design unchanged."); }}>Cancel</button>
      </div>
    </div>
  ) : null;
  const importDxf = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const a = analyzeLam(parseDxf(String(rd.result)));
      if (!a) { setIoMsg("Couldn't find usable geometry in that DXF."); return; }
      setDxf({ ...a, units: a.unitsGuess, name: f.name });
    };
    rd.readAsText(f);
    e.target.value = "";
  };
  const applyDxf = () => {
    if (!dxf) return;
    const u = dxf.units === "in" ? 25.4 : 1;
    const applied = [];
    setP((o) => {
      const n = { ...o };
      n.statorOD = +(2 * dxf.rMax * u).toFixed(3); applied.push("stator OD");
      if (dxf.bore) { n.statorID = +(2 * dxf.bore * u).toFixed(3); applied.push("bore"); }
      if (dxf.rotor) { n.rotorOD = +(2 * dxf.rotor * u).toFixed(3); applied.push("rotor OD"); }
      if (dxf.slots) { n.slots = dxf.slots; applied.push(dxf.slots + " slots"); }
      if (dxf.toothW) { n.toothW = +(dxf.toothW * u).toFixed(3); applied.push("tooth width"); }
      if (dxf.slotOpen) { n.slotOpen = +(dxf.slotOpen * u).toFixed(3); applied.push("slot opening"); }
      if (dxf.tipH) { n.tipH = +(dxf.tipH * u).toFixed(3); applied.push("tip height"); }
      if (dxf.slotTop && dxf.bore) {
        const yk = (dxf.rMax - dxf.slotTop) * u;
        if (yk > 0.3) { n.yoke = +yk.toFixed(3); applied.push("yoke"); }
      }
      return n;
    });
    setDxf(null);
    setIoMsg("Applied from DXF: " + applied.join(", ") + ". Verify tooth width, slot opening & tip height by hand — those aren't reliably inferable.");
  };

  return (
    <UnitCtx.Provider value={us}>
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box}
        .app{min-height:100vh;background:${BG};color:${DKINK};font-family:'Inter',sans-serif;padding:18px}
        header.hd{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:${GRAY};border-radius:12px;padding:12px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(15,23,42,.15)}
        .hd img.logo{height:36px;width:auto;display:block}
        .hd h1{font-size:1.3rem;margin:0;letter-spacing:.02em;color:#fff;font-weight:700}
        .hd h1 b{color:#FCD34D;font-weight:700}
        .hd .tool{color:#E5E7EB;font-weight:500;font-size:1.05rem}
        .eyebrow{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:${GRAY};margin:2px 2px 16px;font-weight:600}
        .grid{display:grid;grid-template-columns:290px 1fr 330px;gap:14px}
        @media(max-width:1020px){.grid{grid-template-columns:1fr}}
        .card{background:#fff;border:1px solid ${LINE};border-radius:12px;padding:14px;color:${DKINK};box-shadow:0 1px 2px rgba(15,23,42,.05)}
        .card h2{font-size:.85rem;margin:0 0 12px;color:${DKINK};font-weight:600;letter-spacing:.01em}
        .card h2::before{content:'◈ ';color:${COPPER}}
        .field{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}
        .fl{font-size:.76rem;color:${DKINK};font-weight:500} .fl em{font-style:normal;color:${CREAM_DIM};font-weight:400}
        input[type=number]{width:86px;padding:6px 8px;border:1px solid #CBD5E1;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:.8rem;background:${BG};color:${DKINK};text-align:right}
        select{padding:6px 8px;border:1px solid #CBD5E1;border-radius:8px;font:inherit;font-size:.76rem;background:${BG};color:${DKINK}}
        input:focus,select:focus{outline:2px solid ${COPPER};outline-offset:1px}
        .seg{display:flex;flex-wrap:wrap;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden}
        .seg button{font:inherit;font-size:.66rem;padding:6px 7px;border:0;background:${BG};color:${CREAM_DIM};cursor:pointer;font-weight:500;flex:1 1 auto;white-space:nowrap}
        .seg button.on{background:${PEACH};color:#fff;font-weight:600}
        .xsec{width:100%;max-width:440px;display:block;margin:0 auto}
        .chart{width:100%;max-width:360px;display:block;margin:0 auto}
        .tick{font:9px 'IBM Plex Mono';fill:${CREAM_DIM}} .axis{font:10px 'IBM Plex Mono';fill:${DKINK}}
        .spin{animation:dash 2.4s linear infinite}
        @keyframes dash{to{stroke-dashoffset:-44}}
        @media(prefers-reduced-motion:reduce){.spin{animation:none}}
        .svgLabel{font:600 15px 'Inter',sans-serif;fill:#fff}
        .dim{font:10px 'IBM Plex Mono';fill:${CREAM_DIM}} .dimBig{font:600 12px 'IBM Plex Mono';fill:#92400E}
        .slotSvg{width:100%;max-width:420px;display:block;margin:0 auto}
        .tbl{background:${TBL};border:1px solid ${TBLLINE};border-radius:10px;padding:6px 12px;margin-top:10px}
        .kv{display:flex;justify-content:space-between;font-size:.74rem;padding:5px 0;border-bottom:1px dashed ${TBLLINE};color:${CREAM_DIM}}
        .kv:last-child{border-bottom:0}
        .kv b{font-weight:600;text-align:right;color:${DKINK};font-family:'IBM Plex Mono',monospace}
        .big{font-size:1.6rem;font-weight:700;font-family:'IBM Plex Mono',monospace}
        .fillbar{height:14px;background:#F1F5F9;border:1px solid ${LINE};border-radius:7px;overflow:hidden;margin:6px 0}
        .fillbar i{display:block;height:100%}
        .warn{background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 10px;font-size:.72rem;margin:6px 0;color:#78350F}
        .errb{background:#FEF2F2;border-color:#FECACA;color:#7F1D1D}
        .chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(34px,1fr));gap:4px;margin-top:8px}
        .chip{border-radius:5px;padding:3px 0;text-align:center;font-size:.62rem;color:#fff;font-weight:600;line-height:1.25;font-family:'IBM Plex Mono',monospace}
        .legend{display:flex;gap:10px;font-size:.7rem;margin-top:8px;flex-wrap:wrap;color:${CREAM_DIM}}
        .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
        .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .note{font-size:.68rem;color:${CREAM_DIM};margin-top:8px;line-height:1.5}
        .iobar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .cardhead{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
        .cardhead h2{margin:0}
        .useg{margin-left:auto;border-color:#9CA3AF}
        .useg button{background:#4B5563;color:#D1D5DB}
        .useg button.on{background:#fff;color:#111827}
        .btn.mini{padding:4px 9px;font-size:.62rem}
        .btn{font:inherit;font-size:.72rem;font-weight:600;padding:8px 14px;border:1px solid ${COPPER};border-radius:8px;background:${COPPER};color:#fff;cursor:pointer}
        .btn.ghost{background:#fff;color:${COPPER}}
        .btn:focus{outline:2px solid ${PEACH};outline-offset:1px}
        .iomsg{font-size:.68rem;color:${CREAM_DIM};margin-top:6px}
        input[type=file]{display:none}
        footer.ft{margin-top:22px;padding-top:14px;border-top:1px solid ${LINE};font-size:.68rem;color:${GRAY};display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
        footer.ft a{color:${GRAY}}
      `}</style>

      <header className="hd">
        <img className="logo" src="https://cortexelearn.github.io/assets/logo.png" alt="CortexEdge" />
        <h1>Cortex<b>Edge</b> <span className="tool">· MotrWorks</span></h1>
        <button className="btn mini ghost" title="Undo last change (autosaved snapshots)" disabled={!undoN}
          style={{ marginRight: 8, opacity: undoN ? 1 : 0.4 }} onClick={doUndo}>↩ Undo{undoN ? ` (${undoN})` : ""}</button>
        <div className="seg useg">
          <button className={us === "in" ? "on" : ""} onClick={() => setUs("in")}>inch</button>
          <button className={us === "mm" ? "on" : ""} onClick={() => setUs("mm")}>mm</button>
        </div>
      </header>
      <p className="eyebrow">Engineering Tools · Three-Phase BLDC Motor Designer</p>
      {restore && (
        <div className="iomsg" style={{ margin: "6px 0 10px" }}>
          Autosaved session found from {new Date(restore.ts).toLocaleString()} —
          <span className="iobar" style={{ display: "inline-flex", marginLeft: 8 }}>
            <button className="btn mini" onClick={doRestore}>Restore</button>
            <button className="btn mini ghost" onClick={() => setRestore(null)}>Dismiss</button>
          </span>
        </div>
      )}

      <div className="grid">
        {actM ? <ActuatorView p={p} s={s} us={us} switchType={switchType} typeMem={typeMem} tqS={tqS} typeDefaults={TYPE_DEFAULTS} exportActuator={exportActuator} importActuator={importActuator} ioMsg={ioMsg} impPanel={impPanel} />
          : wbM ? <BobbinView p={p} s={s} us={us} switchType={switchType} exportDesign={exportDesign} importDesign={importDesign} ioMsg={ioMsg} impPanel={impPanel} /> : <>
        {/* ============ inputs ============ */}
        <div>
          <div className="card" style={{ borderTop: "3px solid #3B82F6" }}>
            <h2>Architecture</h2>
            <Pick label="Machine type" v={p.motorType} set={switchType}
              opts={[{ v: "pm", t: "BLDC" }, { v: "brushed", t: "Brushed" }, { v: "latm", t: "LATM" }, { v: "stepper", t: "Step" }, { v: "induction", t: "ACIM" }, { v: "brake", t: "Brake" }, { v: "actuator", t: "Actuator" }, { v: "bobbin", t: "Winding" }]} />
            <div className="note">
              {p.motorType === "pm" ? "3-phase PM synchronous: stationary slotted stator, rotating magnet rotor."
                : p.motorType === "brushed" ? "Brushed PM DC: magnet ring fixed to the housing ID; the slotted lamination, coils, and commutator rotate as the armature."
                : p.motorType === "latm" ? "Limited-angle torquer: toroidal sector windings on a slotless core, PM rotor, ±excursion output."
                : p.motorType === "stepper" ? "Stepper: hybrid fine-tooth (1.8°-class) or PM can-stack (7.5°+)."
                : p.motorType === "brake" ? "Power-off spring-applied brake: annular electromagnet vs springs, friction disc output."
                : p.motorType === "actuator" ? "Composite actuator: the motor and brake designs open in their tabs, driven through a multi-stage gearhead, presented at the output shaft."
                : p.motorType === "bobbin" ? "Winding-arbor tooling: coil dimensions from the arbor & channel, verified against the stator drawing alone."
                : "Line-fed squirrel-cage induction machine."}
              {" "}Each type keeps its own parameter set while this session is open — toggling away and back restores it.
            </div>
          </div>

          <div className="card">
            <div className="cardhead">
              <h2>Start</h2>
              <button className="btn mini ghost" onClick={() => setWizOpen(!wizOpen)}>{wizOpen ? "Collapse ▴" : "Expand ▾"}</button>
            </div>
            {wizOpen && (
              <>
                <div className="seg" style={{ marginBottom: 10 }}>
                  {[["files", "Files"], ["presets", "Presets"], ["env", "Envelope"]].map(([v, t]) => (
                    <button key={v} className={wizTab === v ? "on" : ""} onClick={() => setWizTab(v)}>{t}</button>
                  ))}
                </div>
                {wizTab === "files" && (
                  <>
                    <div className="iobar">
                      <button className="btn" onClick={exportDesign}>Export .json</button>
                      <label className="btn ghost">
                        Import…
                        <input type="file" accept=".json,application/json" onChange={importDesign} />
                      </label>
                    </div>
                    {ioMsg && <div className="iomsg">{ioMsg}</div>}
                    {impPanel}
                  </>
                )}
                {wizTab === "presets" && (
                  <>
                    <Sel label="Load preset" v={preset} set={applyPreset}
                      opts={["— choose a preset —", ...Object.keys(PRESETS).filter((k5) => (PRESETS[k5].motorType || "pm") === p.motorType)]} />
                    {ioMsg && <div className="iomsg">{ioMsg}</div>}
                    <div className="note">
                      {brkM
                        ? "Power-off spring-applied holding brakes: 28 V aero, 24 V industrial (60/90 mm), 12 V light duty — all sized warning-free with bobbin fit, release margin, and continuous-hold thermals. Only presets for the selected machine type are listed."
                        : stpM
                        ? "Hybrid NEMA frames (1.8°) and PM tin-can steppers (15–30°), bipolar and unipolar. Only presets for the selected machine type are listed."
                        : latmM
                        ? "Two-position toggle torquers on a 28 V bus: Hiperco toroid cores, SmCo/NdFeB rotors, sized 1\"–2.5\". Only presets for the selected machine type are listed."
                        : brM
                        ? "Brushed PM DC starting points, 12–28 V, ferrite through SmCo. Only presets for the selected machine type are listed."
                        : p.motorType === "induction"
                        ? "Line-fed squirrel-cage starting point. Only presets for the selected machine type are listed."
                        : "Complete BLDC starting points on MIL-STD-704-style 28 V / 270 V buses, sized to NEMA 17/23/34 and 1\"–4\" envelopes (mounting-face convention — verify your frame). Only presets for the selected machine type are listed."}
                    </div>
                  </>
                )}
                {wizTab === "env" && (
                  <>
                    <div className="kv"><span>Architecture</span>
                      <b>{({ pm: "BLDC / PMSM", brushed: "Brushed DC", latm: "LATM", stepper: "Stepper", brake: "Brake", acim: "ACIM" })[wArch]} — follows the selected machine type</b></div>
                    {wArch === "pm" && (
                      <>
                        <Pick label="Control" v={wiz.ctrl} set={sw("ctrl")}
                          opts={[{ v: "foc", t: "FOC" }, { v: "hall", t: "6-step Hall" }, { v: "sless", t: "6-step s'less" }]} />
                        <Pick label="BEMF shape (req.)" v={wiz.shape} set={sw("shape")}
                          opts={[{ v: "sine", t: "Sinusoidal" }, { v: "trap", t: "Trapezoidal" }]} />
                      </>
                    )}
                    {wArch === "acim" && <Num label="Supply frequency" unit="Hz" v={wiz.freq} set={sw("freq")} />}
                    {wArch === "stepper" && (
                      <>
                        <Pick label="Full step" v={wiz.stepA} set={sw("stepA")}
                          opts={[{ v: 0.9, t: "0.9°" }, { v: 1.8, t: "1.8°" }, { v: 7.5, t: "7.5°" }, { v: 15, t: "15°" }]} />
                        <Pick label="Wiring" v={wiz.swire} set={sw("swire")}
                          opts={[{ v: "bip-ser", t: "Bipolar ser." }, { v: "bip-par", t: "Bipolar par." }, { v: "uni", t: "Unipolar" }]} />
                      </>
                    )}
                    {wArch === "latm" && <Num label="Travel (total)" unit="°" v={wiz.travel} set={sw("travel")} step={5} />}
                    {wArch === "brake" && (
                      <>
                        <Num label="Armature stroke" unit="mm" v={wiz.stroke} set={sw("stroke")} step={0.05} />
                        <Num label="Through-bore (over hub)" unit="mm" v={wiz.bore} set={sw("bore")} />
                      </>
                    )}
                    <Num label={wArch === "brake" ? "Backiron OD" : wArch === "brushed" ? "Housing OD" : "Stator OD"} unit="mm" v={wiz.od} set={sw("od")} />
                    <Num label={wArch === "brake" ? "Backiron length" : "Stack length"} unit="mm" v={wiz.stack} set={sw("stack")} />
                    <Num label={wArch === "acim" ? "Line-line voltage" : "Bus voltage"} unit="V" v={wiz.vdc} set={sw("vdc")} />
                    {wArch !== "acim" && wArch !== "brake" &&
                      <Num label={wArch === "stepper" ? "Phase current" : wArch === "latm" ? "Drive current limit" : "Current budget"} unit="A" v={wiz.imax} set={sw("imax")} step={0.5} />}
                    {(wArch === "pm" || wArch === "acim" || wArch === "brushed") &&
                      <Num label="No-load speed" unit="rpm" v={wiz.nl} set={sw("nl")} step={100} />}
                    <Num label={wArch === "brake" ? "Holding torque" : wArch === "stepper" ? "Holding torque (2-on)" : wArch === "latm" ? "Toggle torque @ stops" : "Stall torque"}
                      unit={us === "in" ? "oz·in" : "N·m"} v={wiz.tst} set={sw("tst")} />
                    {(wArch === "pm" || wArch === "acim" || wArch === "brushed") && (
                      <>
                        <Num label="Rated torque" unit={us === "in" ? "oz·in" : "N·m"} v={wiz.trt} set={sw("trt")} />
                        <Num label="Rated speed" unit="rpm" v={wiz.nrt} set={sw("nrt")} step={100} />
                      </>
                    )}
                    <div className="iobar" style={{ marginTop: 8 }}>
                      <button className="btn" onClick={generateEnvelope}>Generate design</button>
                    </div>
                    {wizMsg && <div className="iomsg">{wizMsg}</div>}
                    {wizAlts.length > 0 && (
                      <div className="note" style={{ marginTop: 6 }}>
                        <b>Alternates</b> — tap to apply (current design is snapshotted first):
                        {wizAlts.map((a9, i9) => (
                          <div key={i9} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => applyAlt(a9)}>{a9.label}</button>
                            <span style={{ fontSize: 11 }}>{a9.note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {canRestore && (
                      <div className="iobar" style={{ marginTop: 6 }}>
                        <button className="btn" onClick={restorePrev}>Restore previous design</button>
                      </div>
                    )}
                    <div className="note">
                      {wArch === "pm" && `Synthesizes a complete starting design: topology from size & speed character, geometry from
                      flux targets, turns from Ke (balancing no-load vs stall), wire from the rated current at
                      J ≈ 6 A/mm². Targets that conflict on the given bus & amps are split down the middle and flagged.`}
                      {wArch === "acim" && `Line-fed machine synthesized from supply frequency & speed: poles from sync speed, turns
                      from the V/Hz flux balance, cage bar count dodging the slot harmonics.`}
                      {wArch === "brushed" && `Enumerates pole/armature-slot builds, sizes the magnet ring and housing return wall from
                      flux targets, calibrates turns against no-load vs stall through the full engine, and picks wire (half gauges
                      included) from the rated current at J ≈ 6 A/mm² over the lap paths.`}
                      {wArch === "latm" && `Sector count from travel — the stops must sit inside the torque zero-crossings — ring core
                      and magnet from flux targets, then turns and wire searched through the full engine to hit the toggle torque
                      within the two-wire drive limit.`}
                      {wArch === "stepper" && `Rotor teeth (hybrid) or pole pairs (PM) from the step angle, geometry scaled off a
                      NEMA-class reference build, turns calibrated to the holding-torque target at the phase current. Flags an
                      L/R-drive shortfall against the bus — normal for chopper-driven hybrids.`}
                      {wArch === "brake" && `Springs sized from the holding torque (μ 0.40, two faces), then a boss/pocket/turns/wire
                      sweep through the full engine for release margin ≥ ×1.4, pull-in ≤ 0.92× available bus current, ≥ 0.6 mm coil
                      clearance, and continuous held-released coil temperature — the same acceptance gates as the bench tuner.`}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          {!brkM && <div className="card" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>Lamination geometry</h2>
              <div className="iobar">
                {!brM && <label className="btn mini ghost">
                  Import DXF…
                  <input type="file" accept=".dxf" onChange={importDxf} />
                </label>}
                <button className="btn mini ghost" onClick={() => downloadDxf(p, r)}>{brM ? "Export armature DXF" : "Export DXF"}</button>
                {p.motorType === "pm" && <button className="btn mini ghost" title="2D magnetostatic model with this tool's BH and magnet data — open in FEMM and run" onClick={() => downloadFemm(p, r)}>Export FEMM</button>}
              </div>
            </div>
            {dxf && (
              <div className="tbl" style={{ marginBottom: 10 }}>
                <svg viewBox="-110 -110 220 220" style={{ width: "100%", maxWidth: 190, display: "block", margin: "4px auto" }}>
                  {dxf.prev.map((pt, i) => (
                    <circle key={i} cx={(pt[0] / dxf.rMax) * 100} cy={(-pt[1] / dxf.rMax) * 100} r="0.9" fill="#3B82F6" />
                  ))}
                  <circle cx="0" cy="0" r="100" fill="none" stroke="#0F172A" strokeWidth="0.8" strokeDasharray="3 2" />
                  {dxf.bore && <circle cx="0" cy="0" r={(dxf.bore / dxf.rMax) * 100} fill="none" stroke="#DC2626" strokeWidth="0.8" strokeDasharray="3 2" />}
                  {dxf.rotor && <circle cx="0" cy="0" r={(dxf.rotor / dxf.rMax) * 100} fill="none" stroke="#059669" strokeWidth="0.8" strokeDasharray="3 2" />}
                </svg>
                <div className="kv"><span>File</span><b>{dxf.name}</b></div>
                <div className="kv"><span>Stator OD</span><b>{(2 * dxf.rMax).toFixed(3)} {dxf.units}</b></div>
                <div className="kv"><span>Bore Ø</span><b>{dxf.bore ? (2 * dxf.bore).toFixed(3) + " " + dxf.units : "not found"}</b></div>
                <div className="kv"><span>Rotor OD</span><b>{dxf.rotor ? (2 * dxf.rotor).toFixed(3) + " " + dxf.units : "not found"}</b></div>
                <div className="kv"><span>Slots detected</span><b>{dxf.slots || "not found"}</b></div>
                <div className="kv"><span>Tooth width</span><b>{dxf.toothW ? dxf.toothW.toFixed(3) + " " + dxf.units : "manual"}</b></div>
                <div className="kv"><span>Slot opening</span><b>{dxf.slotOpen ? dxf.slotOpen.toFixed(3) + " " + dxf.units : "manual"}</b></div>
                <div className="kv"><span>Tooth-tip height</span><b>{dxf.tipH ? dxf.tipH.toFixed(3) + " " + dxf.units : "manual"}</b></div>
                <div className="field" style={{ marginTop: 8 }}>
                  <span className="fl">DXF units</span>
                  <div className="seg">
                    <button className={dxf.units === "in" ? "on" : ""} onClick={() => setDxf({ ...dxf, units: "in" })}>in</button>
                    <button className={dxf.units === "mm" ? "on" : ""} onClick={() => setDxf({ ...dxf, units: "mm" })}>mm</button>
                  </div>
                </div>
                <div className="iobar" style={{ marginTop: 6 }}>
                  <button className="btn mini" onClick={applyDxf}>Apply</button>
                  <button className="btn mini ghost" onClick={() => setDxf(null)}>Discard</button>
                </div>
              </div>
            )}
            {!latmM && <Num label={brM ? "Armature slots" : stpM ? "Stator poles" : "Slots"} v={p.slots} set={s("slots")} min={3} />}
            {!stpM && <Num label={brM ? "Field poles" : latmM ? "Rotor poles" : "Poles"} v={p.poles} set={s("poles")} step={2} min={2} />}
            <Num label={brM ? "Housing (can) OD" : latmM ? "Toroid core OD" : "Stator OD"} unit="mm" v={p.statorOD} set={s("statorOD")} />
            <Num label={brM ? "Magnet ring ID" : latmM ? "Toroid core ID" : "Stator bore ID"} unit="mm" v={p.statorID} set={s("statorID")} />
            <Num label={brM ? "Armature OD" : "Rotor OD"} unit="mm" v={p.rotorOD} set={s("rotorOD")} step={0.1} />
            {!latmM && <>
            <Num label={brM ? "Armature core depth" : "Back-iron (yoke)"} unit="mm" v={p.yoke} set={s("yoke")} step={0.5} />
            <Num label={stpM ? "Pole body width" : "Tooth width"} unit="mm" v={p.toothW} set={s("toothW")} step={0.1} />
            <Num label="Slot opening" unit="mm" v={p.slotOpen} set={s("slotOpen")} step={0.1} />
            <Num label="Tooth-tip height" unit="mm" v={p.tipH} set={s("tipH")} step={0.1} />
            <Num label="Slot bottom corner R" unit="mm" v={p.slotR} set={s("slotR")} step={0.1} min={0} />
            {(p.motorType === "pm" || p.motorType === "induction" || brM) &&
              <Num label="Slot mouth corner R" unit="mm" v={p.wbRtip} set={s("wbRtip")} step={0.1} min={0} />}
            </>}
            <Num label="Stack length" unit="mm" v={p.stackL} set={s("stackL")} />
            {!latmM && <Num label="Slot liner" unit="mm" v={p.liner} set={s("liner")} step={0.05} />}
            <Num label="Shaft Ø" unit="mm" v={p.shaftD} set={s("shaftD")} step={0.5} min={1} />
            <Sel label={brM ? "Armature lamination" : latmM ? "Toroid core (tape/lam)" : "Stator lamination"} v={p.statorMat} set={s("statorMat")} opts={Object.keys(STEELS).filter((k) => STEELS[k].lam)} />
            <Sel label={brM ? "Housing / flux return" : latmM ? "Rotor hub" : "Rotor hub / back-iron"} v={p.rotorMat} set={s("rotorMat")} opts={Object.keys(STEELS)} />
            {latmM && <div className="note">Slotless: the winding wraps toroidally around the ring between core OD
              and ID — slot fields are hidden and unused. Airgap = (core ID − rotor OD)/2, with the inner winding
              build subtracted magnetically. Hiperco 50 keeps the ring thin at high flux.</div>}
            {brM && <div className="note">Brushed construction: slots are on the rotating armature and open outward;
              the magnet ring sits on the housing ID. Airgap = (magnet ring ID − armature OD)/2; slot depth runs
              inward from the armature surface, leaving the core depth over the shaft.</div>}
          </div>}
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Winding</h2>
            {!latmM && !stpM && !brkM && <Pick label={brM ? "Armature winding" : "Pattern"} v={p.pattern} set={s("pattern")}
              opts={brM
                ? [{ v: "lap", t: "Lap" }, { v: "concentrated", t: "Wave" }]
                : [{ v: "lap", t: "Distributed lap" }, { v: "concentrated", t: "Tooth-wound" }]} />}
            {latmM || stpM || brkM ? null : brM ? (
              <Num label="Coil throw (0 = full pitch)" unit="slots" v={p.span} set={s("span")} min={0} />
            ) : p.pattern === "lap" && (
              <>
                <Pick label="Layers" v={p.layers} set={s("layers")} opts={[{ v: 1, t: "1" }, { v: 2, t: "2" }]} />
                <Num label="Coil span (0 = full)" unit="slots" v={p.span} set={s("span")} min={0} />
              </>
            )}
            {!latmM && <Num label={stpM ? "Turns per pole (per strand)" : brkM ? "Coil turns (total)" : brM && p.turnBasis === "slot" ? "Conductors per slot" : "Turns per coil"} v={p.turns} set={s("turns")} min={1} />}
            {brM && <Pick label="Turns basis" v={p.turnBasis || "coil"} set={s("turnBasis")} opts={[{ v: "coil", t: "Per coil" }, { v: "slot", t: "Cond./slot" }]} />}
            <Num label="Magnet wire" unit="AWG" v={p.awg} set={s("awg")} min={8} max={40} step={0.5} />
            <Sel label="Insulation build" v={p.insBuild} set={s("insBuild")} opts={Object.keys(INS_BUILD)} />
            <Num label="Strands in hand" v={p.strands} set={s("strands")} min={1} />
            {!latmM && !stpM && !brkM && <Num label={brM ? "Plex (winding multiplicity)" : "Parallel paths"} v={p.paths} set={s("paths")} min={1} />}
            {!brM && !latmM && !stpM && !brkM && <Pick label="Connection" v={p.conn} set={s("conn")} opts={[{ v: "wye", t: "Wye" }, { v: "delta", t: "Delta" }]} />}
            {brM && <div className="note">Commutated double-layer armature: one coil per slot, coils in series
              around the commutator. Parallel paths follow the winding — lap a = poles × plex
              ({r.poles * Math.max(p.paths, 1)}), wave a = 2 × plex ({2 * Math.max(p.paths, 1)}).</div>}
            {latmM && <div className="note">Wire spec only — turns per sector and sector layout are set in
              Machine & drive. All sectors are one series two-wire circuit.</div>}
            {brkM && r.brake && <div className="note">Bobbin wind at 85% efficiency: {p.turns} turns build
              {" "}{fmt(r.brake.hBuild, 2)} mm of layers → wound Ø{fmt(r.brake.coilOD, 1)} mm,
              {" "}{fmt(r.brake.clr, 2)} mm radial clearance to the Ø{p.brkPktID} mm pocket ID
              {" "}(≈ {Math.floor(r.brake.capT)} turns fit this bobbin at this wire).</div>}
            {stpM && <div className="note">Bifilar convention: turns and wire size are per pole per strand.
              Bipolar-series puts both strands in series (2× turns, 2× R), parallel halves R, unipolar drives one
              strand at a time — the classic √2 torque spread at equal dissipation.</div>}
          </div>
          {!latmM && !stpM && !brkM && <div className="card" style={{ marginTop: 14 }}>
            <h2>Coil build & end turns</h2>
            <Pick label="Model" v={p.endMode} set={s("endMode")}
              opts={[{ v: "auto", t: "Auto" }, { v: "head", t: "Coil head" }, { v: "bobbin", t: "Bobbin" }]} />
            {p.endMode === "head" && (
              <Num label="Coil head height / end" unit="mm" v={p.headH} set={s("headH")} step={1} min={0} />
            )}
            {p.endMode === "bobbin" && (
              <>
                <Pick label="Bobbin shape" v={p.bobShape} set={s("bobShape")}
                  opts={[{ v: "round", t: "Round Ø" }, { v: "race", t: "Tooth racetrack" }]} />
                {p.bobShape === "round"
                  ? <Num label="Bobbin core Ø" unit="mm" v={p.bobD} set={s("bobD")} step={1} min={2} />
                  : <Num label="Bobbin wall" unit="mm" v={p.bobWall} set={s("bobWall")} step={0.25} min={0} />}
                <Num label="Winding window height" unit="mm" v={p.bobWin} set={s("bobWin")} step={1} min={1} />
              </>
            )}
            <div className="tbl" style={{ marginTop: 10 }}>
              <div className="kv"><span>Mean length of turn</span><b>{lenS(r.MLTmm, 2, 0)} {lu}</b></div>
              {p.endMode !== "bobbin" && <div className="kv"><span>End turn / side</span><b>{lenS(r.endSide)} {lu}</b></div>}
              <div className="kv"><span>Equivalent coil Ø</span><b>{lenS(r.coilDia)} {lu}</b></div>
              {p.endMode === "bobbin" ? (
                <>
                  <div className="kv"><span>Winding build depth</span><b>{lenS(r.tb)} {lu}</b></div>
                  <div className="kv"><span>{p.bobShape === "round" ? "Coil OD" : "Envelope build / side"}</span><b>{lenS(r.coilOD)} {lu}</b></div>
                </>
              ) : (
                <div className="kv"><span>Suggested bobbin core Ø</span><b>{lenS(r.bobSuggest)} {lu}</b></div>
              )}
            </div>
            <div className="note">
              MLT feeds phase resistance directly. Bobbin build assumes 72% lay in the window;
              the suggested core Ø is the round bobbin that reproduces this turn length after the build is added.
            </div>
          </div>}
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Machine & drive</h2>

            {p.motorType === "brushed" && (
              <>
                <Num label="Supply voltage" unit="V" v={p.Vdc} set={s("Vdc")} />
                <Num label="Current limit" unit="A" v={p.Imax} set={s("Imax")} step={0.5} />
                <Num label="Brush drop (pair)" unit="V" v={p.brushV} set={s("brushV")} step={0.1} min={0} />
                <div className="note">No electronic commutation — the commutator and brushes switch the armature
                  coils mechanically. Speed follows (V − brush drop − I·Ra)/Ke on the supply directly.</div>
              </>
            )}
            {brkM && (
              <>
                <Num label="Supply voltage" unit="V" v={p.Vdc} set={s("Vdc")} />
                <Num label="Backiron OD" unit="mm" v={p.statorOD} set={s("statorOD")} />
                <Num label="Pocket ID" unit="mm" v={p.brkPktID} set={s("brkPktID")} />
                <Num label="Boss OD" unit="mm" v={p.brkBossOD} set={s("brkBossOD")} />
                <Num label="Through-hole diameter" unit="mm" v={p.brkBore} set={s("brkBore")} />
                <Num label="Backiron length" unit="mm" v={p.stackL} set={s("stackL")} />
                <Num label="Pocket depth" unit="mm" v={p.brkPktD} set={s("brkPktD")} />
                <Num label="Bobbin ID (winding start)" unit="mm" v={p.brkBobID} set={s("brkBobID")} step={0.2} />
                <Num label="Bobbin OD (max winding finish)" unit="mm" v={p.brkBobOD} set={s("brkBobOD")} step={0.2} />
                <Num label="Bobbin length (winding)" unit="mm" v={p.brkBobL} set={s("brkBobL")} step={0.5} />
                <Num label="Armature thickness" unit="mm" v={p.brkArm} set={s("brkArm")} step={0.5} />
                <Num label="Armature stroke (air gap)" unit="mm" v={p.brkStroke} set={s("brkStroke")} step={0.05} />
                <Num label="Back-iron magnetic derate" unit="%" v={p.brkFeScale ?? 100} set={s("brkFeScale")} min={0} max={100} step={5} />
                {r.brake && Number.isFinite(r.brake.murBody) && (
                  <div className="kv"><span>Back-iron µr effective / nominal</span>
                    <b>{r.brake.murBody.toFixed(0)} / {r.brake.murNom.toFixed(0)}{r.brake.feS < 99.9 ? ` · ${r.brake.feS.toFixed(0)}%` : " · full"}</b></div>
                )}
                <div className="hint" style={{ margin: "-2px 0 6px", fontSize: 11, opacity: 0.7 }}>
                  100% = full catalog steel; 0% = non-magnetic (µr 1). Models permeability lost to machining/cold work,
                  weld or plating heat, or wrong stock. Saturation B is composition-driven and is not scaled.
                </div>
                <Num label="Spring free height" unit="mm" v={p.brkSprFree} set={s("brkSprFree")} step={0.5} />
                <Num label="Spring height, brake engaged" unit="mm" v={p.brkSprEng} set={s("brkSprEng")} step={0.5} />
                {r.brake && <div className="kv"><span>Clamp force engaged / pulled-in · cavity</span>
                  <b>{fmt(r.brake.Fclamp, 0)} / {fmt(r.brake.Fcompr, 0)} N · {fmt(r.brake.sprCav, 1)} mm</b></div>}
                <Num label="Economizer hold voltage" unit="%" v={p.brkEco} set={s("brkEco")} step={5} min={10} max={100} />
                <Num label="Spring rate (total)" unit="N/mm" v={p.brkK} set={s("brkK")} step={5} />
                <Num label="Spring count" v={p.brkSpringN} set={s("brkSpringN")} min={3} max={12} />
                <Sel label="Backiron material" v={p.statorMat} set={s("statorMat")} opts={Object.keys(STEELS)} />
                <Sel label="Armature material" v={p.rotorMat} set={s("rotorMat")} opts={Object.keys(STEELS)} />
                <Sel label="Friction material" v={p.brkMat}
                  set={(v) => setP((o) => { const m = BRAKE_MATS[v]; return { ...o, brkMat: v, ...(m ? { brkMu: m.mus, brkMuD: m.mud } : {}) }; })}
                  opts={Object.keys(BRAKE_MATS)} />
                <Num label="Static friction µs" v={p.brkMu} set={s("brkMu")} step={0.02} />
                <Num label="Dynamic friction µd" v={p.brkMuD} set={s("brkMuD")} step={0.02} />
                <Num label="Lining OD" unit="mm" v={+(p.brkRo * 2).toFixed(2)} set={(x) => s("brkRo")(x / 2)} />
                <Num label="Lining ID" unit="mm" v={+(p.brkRi * 2).toFixed(2)} set={(x) => s("brkRi")(x / 2)} />
                <Num label="Friction faces" v={p.brkFaces} set={s("brkFaces")} min={1} max={2} />
                <div className="note">Material sets µ from catalog-typical dry values — edit µ directly for your
                  measured lining data. Housing/armature material comes from Magnetics ▸ stator steel.</div>
              </>
            )}
            {stpM && (
              <>
                <Num label="Supply voltage" unit="V" v={p.Vdc} set={s("Vdc")} />
                <Num label="Rated phase current" unit="A" v={p.Imax} set={s("Imax")} step={0.1} />
                <Pick label="Stepper type" v={p.stpKind} set={s("stpKind")}
                  opts={[{ v: "hybrid", t: "Hybrid (fine)" }, { v: "pm", t: "PM can-stack" }]} />
                {p.stpKind === "hybrid"
                  ? <Num label="Rotor teeth" v={p.stpNr} set={s("stpNr")} min={4} />
                  : <Num label="Rotor pole pairs" v={p.stpPP} set={s("stpPP")} min={2} max={24} />}
                <Pick label="Drive wiring" v={p.stpWire} set={s("stpWire")}
                  opts={[{ v: "bip-ser", t: "Bipolar series" }, { v: "bip-par", t: "Bipolar parallel" }, { v: "uni", t: "Unipolar" }]} />
                <Pick label="Energization" v={p.stpOn} set={s("stpOn")}
                  opts={[{ v: 1, t: "1-phase-on" }, { v: 2, t: "2-phase-on (full step)" }]} />
              </>
            )}
            {latmM && (
              <>
                <Num label="Supply voltage" unit="V" v={p.Vdc} set={s("Vdc")} />
                <Num label="Drive current limit" unit="A" v={p.Imax} set={s("Imax")} step={0.5} />
                <Num label="Winding sectors" v={p.latmSect} set={s("latmSect")} min={1} max={12} />
                <Num label="Sector span" unit="°" v={p.latmSpan} set={s("latmSpan")} min={10} max={180} />
                <Num label="Travel between stops" unit="°" v={p.latmTravel} set={s("latmTravel")} min={1} max={355} />
                <Num label="Turns / sector" v={p.turns} set={s("turns")} step={10} />
                <Num label="Winding radial build" unit="mm" v={p.latmWind} set={s("latmWind")} step={0.5} />
              </>
            )}
            {p.motorType === "pm" ? (
              <>
                <Pick label="Control scheme" v={p.ctrl} set={s("ctrl")}
                  opts={[{ v: "foc", t: "FOC (sinusoidal)" }, { v: "six", t: "Six-step" }]} />
                {p.ctrl === "six" && (
                  <Pick label="Commutation" v={p.sense} set={s("sense")}
                    opts={[{ v: "hall", t: "Hall sensors" }, { v: "sless", t: "Sensorless" }]} />
                )}
                <Num label="DC bus voltage" unit="V" v={p.Vdc} set={s("Vdc")} />
                <Num label="Drive current limit" unit="A" v={p.Imax} set={s("Imax")} />
                <Num label="Ref. elec. frequency" unit="Hz" v={p.freq} set={s("freq")} />
              </>
            ) : special || brM ? null : (
              <>
                <Num label="Line-line voltage" unit="V" v={p.Vll} set={s("Vll")} />
                <Num label="Supply frequency" unit="Hz" v={p.freq} set={s("freq")} />
                <Num label="Rotor bars" v={p.rotorBars} set={s("rotorBars")} min={4} />
                <Sel label="Bar / ring material" v={p.barMat} set={s("barMat")} opts={Object.keys(BARS)} />
                <Num label="Bar area" unit="mm²" v={p.barA} set={s("barA")} step={5} min={1} />
                <Num label="End-ring area" unit="mm²" v={p.ringA} set={s("ringA")} step={10} min={1} />
              </>
            )}
            <Num label="Winding temp" unit="°C" v={p.Tcu} set={s("Tcu")} step={10} />
            <Num label={brM || latmM || brkM ? "Drive + lead R" : "Drive + lead R / phase"} unit="mΩ" v={p.Rext} set={s("Rext")} step={5} min={0} />
            {(pm || p.motorType === "induction") && <Pick label="Rated loading by" v={p.loadMode} set={s("loadMode")}
              opts={[{ v: "J", t: "Current density" }, { v: "I", t: brM ? "Armature current" : "Phase current" }]} />}
            {(pm || p.motorType === "induction") && (p.loadMode === "I"
              ? <Num label={brM ? "Rated armature current" : "Rated phase current"} unit="A" v={p.Irate} set={s("Irate")} step={0.5} min={0} />
              : <Num label="Current density J" unit="A/mm²" v={p.J} set={s("J")} step={0.5} />)}
            {p.motorType === "induction" && <Num label="Airgap flux B̂g" unit="T" v={p.Bg} set={s("Bg")} step={0.05} />}
            {p.motorType === "pm" && p.conn === "wye" && (
              <Pick label="Voltage reference" v={p.vref} set={s("vref")}
                opts={[{ v: "ll", t: "Line-line" }, { v: "ln", t: "L-N (center tap)" }]} />
            )}
            {brM
              ? <Pick label="Supply polarity" v={p.seq} set={s("seq")} opts={[{ v: "ABC", t: "Normal" }, { v: "ACB", t: "Reversed" }]} />
              : !latmM && !stpM && !brkM
                ? <Pick label="Phase sequence" v={p.seq} set={s("seq")} opts={[{ v: "ABC", t: "A-B-C" }, { v: "ACB", t: "A-C-B" }]} />
                : null /* single-winding (LATM, brake) and 2-phase stepper drives have no 3-phase sequence */}
          </div>
          {(pm || latmM || stpM) && (
            <div className="card" style={{ marginTop: 14 }}>
              <h2>{brM ? "Field magnets (housing ID)" : latmM ? "Rotor magnets (arc segments)" : stpM ? (p.stpKind === "pm" ? "Rotor magnet ring" : "Rotor PM disc (axial)") : "Rotor magnets"}</h2>
              <Sel label="Grade" v={p.mag} set={s("mag")} opts={Object.keys(MAGNETS)} />
              <Num label="Magnet thickness" unit="mm" v={p.magT} set={s("magT")} step={0.5} min={0.5} />
              {stpM && <Num label="Shaft / hub OD (0 = auto 1.6× shaft)" unit="mm" v={p.stpHubD} set={s("stpHubD")} min={0} />}
              {stpM && <Num label="Through-hole Ø (0 = none)" unit="mm" v={p.stpThruD} set={s("stpThruD")} min={0} />}
              {!stpM && <Num label={latmM ? "Magnet arc (of pole pitch)" : "Pole-arc coverage"} unit="%" v={p.poleArc} set={s("poleArc")} step={5} min={40} max={100} />}
              {!stpM && <div className="kv"><span>Magnet arc / length @ rotor OD</span>
                <b>{((p.poleArc / 100) * (360 / Math.max(p.poles, 1))).toFixed(1)}° · {(() => { const mm9 = (p.poleArc / 100) * (Math.PI * p.rotorOD) / Math.max(p.poles, 1); return us === "in" ? (mm9 / 25.4).toFixed(3) + " in" : mm9.toFixed(1) + " mm"; })()}</b></div>}
              <Num label="Magnet temperature" unit="°C" v={p.Top} set={s("Top")} step={5} />
              <Num label="Cold-start temp" unit="°C" v={p.Tmin} set={s("Tmin")} step={5} min={-70} max={25} />
              <div className="tbl">
                <div className="kv"><span>Br @20 °C / @{p.Top} °C</span><b>{fmt(r.mag.Br)} / {fmt(r.BrT)} T</b></div>
                <div className="kv"><span>HcJ @{p.Top} °C</span><b>{fmt(r.HcJT, 0)} kA/m</b></div>
                <div className="kv"><span>BHmax / max temp</span><b>{r.mag.BH} kJ/m³ · {r.mag.Tmax} °C</b></div>
                {!stpM && <div className="kv"><span>Airgap B{latmM ? " (working gap)" : " (avg / fund. peak)"}</span>
                  <b>{latmM ? fmt(r.latm ? r.latm.Bg : 0) + " T" : fmt(r.BgAvg) + " / " + fmt(r.B1) + " T"}</b></div>}
                {!latmM && !stpM && <div className="kv"><span>Demag field @ {p.Imax} A{brM ? " (armature reaction)" : ""}</span><b>{fmt(r.Hdemag, 0)} kA/m</b></div>}
                {!brM && !latmM && !stpM && <div className="kv"><span>Sat. knockdown (no-load / @Imax)</span><b>{(r.ksat * 100).toFixed(1)}% / {(r.ksat * r.kIT * 100).toFixed(1)}%</b></div>}
                {r.satCurve && <div className="kv"><span>Flux retention vs current (MEC)</span>
                  <b>{r.satCurve.map((s9) => `${(s9.k * 100).toFixed(0)}%@${s9.f}·I`).join(" · ")}</b></div>}
            {!latmM && !stpM && <div className="kv"><span>Demag margin</span><b style={{ color: r.demagMargin < 0.3 ? "#DC2626" : "#059669" }}>{fmt(r.demagMargin * 100, 0)}%</b></div>}
              </div>
              <div className="note">
                Typical catalog values in the style of the Arnold Magnetics N-grade and RECOMA (SmCo) tables —
                verify against the specific datasheet before cutting steel. Flux model: leakage 0.9, Carter 1.05,
                {brM ? " arc magnets bonded to the housing ID (steel MMF drops not iterated in this mode)."
                  : latmM ? " slotless ring — the sector winding sits in the magnetic gap; no armature-reaction demag iteration in this mode."
                  : " surface-mounted magnets."}
              </div>
            </div>
          )}
          <AssumptionsCard p={p} />
        </div>

        {/* ============ visualization ============ */}
        <div>
          <div className="card paper">
            <div className="cardhead">
              <h2>Cross-section</h2>
              <div className="iobar">
                {!brkM && <button className="btn mini" onClick={() => setAnim((a) => ({ ...a, on: !a.on }))}>
                  {anim.on ? "⏸ Pause" : "▶ Play"}
                </button>}
                <button className="btn mini ghost" onClick={() => exportPng("svg-xsec", "stator-cross-section.png")}>PNG ⤓</button>
              </div>
            </div>
            {r.err.length ? r.err.map((e, i) => <div className="warn errb" key={i}>{e}</div>) : <CrossSection p={p} r={r} anim={anim} phaseSel={phaseSel} />}
            {brM ? (
              <>
                <div className="legend">
                  <span><i className="dot" style={{ background: "#E3B341" }} />conductors under N (⊗ in)</span>
                  <span><i className="dot" style={{ background: "#8FA8C9" }} />under S (⊙ return)</span>
                  <span><i className="dot" style={{ background: "#E3B341", opacity: 0.2 }} />dim = commutating (interpolar)</span>
                  <span><i className="dot" style={{ background: "#C14B3E" }} />N</span>
                  <span><i className="dot" style={{ background: "#4A76B8" }} />S</span>
                </div>
                <div className="note">
                  Housing can and {r.poles}-pole magnet ring are stationary; the slotted armature, its winding, and
                  the commutator ({r.brush ? r.brush.segs : r.Ns} bars) rotate. Brushes sit on the geometric neutral
                  axis: as each coil sweeps past it, its current reverses — that's why the conductor shading flips
                  there on ▶ Play. Rotation shown for {p.seq === "ABC" ? "normal" : "reversed"} supply polarity,
                  viewed from the commutator end.
                </div>
              </>
            ) : brkM ? (
              <div className="note">
                Face view of the pot-core backiron: outer rim and center boss are the pole faces, the wound coil
                (orange) sits on its bobbin in the pocket — dashed circles mark the pocket ID it must clear and the
                friction lining OD/ID (ghosted). Springs shown on their bolt circle. The axial view is the working
                drawing: dimensions, stroke, and ▶ Play for engage/release.
              </div>
            ) : stpM ? (
              <>
                <div className="legend">
                  <span><i className="dot" style={{ background: "#E8933A" }} />phase A coils</span>
                  <span><i className="dot" style={{ background: "#5B8DEF" }} />phase B coils</span>
                  <span><i className="dot" style={{ background: "#E8933A", opacity: 0.5 }} />dim = de-energized</span>
                </div>
                <div className="note">
                  One rotor cup shown — the second sits behind it, offset half a tooth pitch, with the PM disc
                  between (axial view). ▶ single-steps the rotor; the energized phase pair brightens in
                  sequence A+ B+ A− B−. The peach arc marks one full step.
                </div>
              </>
            ) : latmM ? (
              <div className="note">
                Toroidally wound sector coils on the ring core (⊗/⊙ = sector current direction, flips with drive
                polarity); the PM rotor toggles between the travel stops A/B. ▶ animates the toggle.
              </div>
            ) : (
              <>
                <div className="legend">
                  {PHASE.map((ph) => (<span key={ph.name}><i className="dot" style={{ background: ph.c }} />Phase {ph.name}</span>))}
                  <span><i className="dot" style={{ background: PHASE[0].c, opacity: 0.55 }} />faded = − side of the same phase's coil</span>
                </div>
                <div className="note">
                  Outer loops = coil end-turns (throw {r.span} slots) — filter with the phase buttons below, ▶ animates
                  the rotor and energization. There are only three phases: each coil fills two slots — solid where
                  current goes in (⊗), faded where the same conductor comes back (⊙). The wye neutral is a junction
                  inside the machine, not a slot conductor. Inner slot half = airgap-side layer; outer half = return layer.
                  Rotation shown for sequence {p.seq}{pm && p.ctrl === "six" ? ` · six-step, ${p.sense === "hall" ? "hall-commutated" : "sensorless (back-EMF)"}` : ""}, viewed from the drive end.
                </div>
              </>
            )}
          </div>

          {brM && <div className="card paper" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>Armature lamination (from the drawing fields)</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-armlam", "armature-lamination.png")}>PNG ⤓</button>
            </div>
            <ArmLamPreview p={p} us={us} />
            <div className="note">
              Verification view of the rotating armature lamination — slots on the OUTSIDE diameter: teeth
              radiate outward, openings at the armature surface, core (yoke) between the slot bottoms and the
              shaft. Single slot dimensioned airgap-up with the four internal corner radii. If this doesn't
              match the print, the entered dims are off.
            </div>
          </div>}
          {(p.motorType === "pm" || p.motorType === "induction") && <div className="card paper" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>Lamination (from the drawing fields)</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-lam", "lamination-preview.png")}>PNG ⤓</button>
            </div>
            <LamPreview p={p} us={us} />
            <div className="note">
              Verification view drawn from the lamination-geometry card alone — true polar lamination,
              single slot dimensioned with the four internal corner radii. If this doesn't match the print,
              the entered dims are off. The insertion map below shows where the winding lands in these slots.
            </div>
          </div>}
          {!latmM && !stpM && !brkM && <div className="card paper" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>{brM ? "Armature slot detail" : "Slot detail & insertion map"}</h2>
              <div className="iobar">
                <button className="btn mini ghost" onClick={() => exportPng("svg-slot", "slot-cross-section.png")}>Slot PNG ⤓</button>
                <button className="btn mini ghost" onClick={() => exportPng("svg-winding", "winding-diagram.png")}>Winding PNG ⤓</button>
              </div>
            </div>
            <div>
              <SlotDetail p={p} r={r} us={us} />
              <div className="fillbar" style={{ height: 8, marginTop: 10 }}>
                <i style={{ width: Math.min(r.fillGross * 100, 100) + "%", background: r.fillGross > 0.45 ? "#DC2626" : r.fillGross > 0.4 ? "#F59E0B" : "#10B981" }} />
              </div>
              <div className="tbl" style={{ marginTop: 6 }}>
                <div className="kv"><span>Fill — insulated / usable (strict)</span>
                  <b style={{ color: r.fillGross > 0.45 ? "#DC2626" : r.fillGross > 0.4 ? "#D97706" : "#059669" }}>
                    {Number.isFinite(r.fillGross) ? (r.fillGross * 100).toFixed(1) + "%" : "—"}</b></div>
                <div className="kv"><span>Fill — insulated / gross slot</span><b>{fmt(r.fillInsSlot * 100, 1)}%</b></div>
                <div className="kv"><span>Fill — bare Cu / gross slot (shop)</span><b>{fmt(r.fillCuSlot * 100, 1)}%</b></div>
                <div className="kv"><span>Slot depth</span><b>{lenS(r.hs)} {lu}</b></div>
                <div className="kv"><span>{brM ? "Width surface / bottom" : "Width bore / yoke"}</span><b>{lenS(r.w1)} / {lenS(r.w2)} {lu}</b></div>
                <div className="kv"><span>Slot area</span><b>{areaS(r.slotArea)} {au}</b></div>
                <div className="kv"><span>Usable (after liner)</span><b>{areaS(r.usableArea)} {au}</b></div>
                <div className="kv"><span>Wire bare / insulated</span><b>{lenS(r.dBare, 4, 3)} / {lenS(r.dIns, 4, 3)} {lu}</b></div>
                <div className="kv"><span>Conductors per slot</span><b>{r.condPerSlot}</b></div>
                <div className="kv"><span>Airgap</span><b>{lenS(r.airgap)} {lu}</b></div>
                {brM ? (
                  <>
                    <div className="kv"><span>Total armature conductors Z</span><b>{r.brush ? r.brush.Z : r.condPerSlot * r.Ns}</b></div>
                    <div className="kv"><span>Coil throw</span><b>{r.span} slots (pole pitch {(r.Ns / r.poles).toFixed(1)})</b></div>
                  </>
                ) : (
                  <>
                    <div className="kv"><span>q (slots/pole/phase)</span><b>{fmt(r.q)}</b></div>
                    <div className="kv"><span>Coil throw (span)</span><b>{r.span} slots · kw {fmt(r.kw, 3)}</b></div>
                  </>
                )}
              </div>
            </div>
            {!brM && (
              <>
                <div className="chips">
                  {r.topLayer.map((t, i) => (
                    <div key={i} className="chip" style={{ background: PHASE[t.phase].c, opacity: t.sign > 0 ? 1 : 0.6 }}>
                      {i + 1}<br />{PHASE[t.phase].name}{t.sign > 0 ? "+" : "−"}
                    </div>
                  ))}
                </div>
                <div className="note">Insertion map: airgap-layer phase and polarity per slot, slot 1 at 12 o'clock, counting clockwise.</div>
              </>
            )}
            {brM && r.brush && (
              <>
                <div className="chips">
                  {Array.from({ length: r.Ns }, (_, i) => (
                    <div key={i} className="chip" style={{ background: "#B87333", opacity: 0.9, fontSize: 9 }}>
                      {i + 1}<br />T{i + 1} B{((i - r.span) % r.Ns + r.Ns) % r.Ns + 1}
                    </div>
                  ))}
                </div>
                <div className="note">Insertion map per slot: T = which coil's top side sits in the airgap layer, B = which coil's
                  bottom side sits beneath it (coil n has its top side in slot n, bottom side {r.span} slots on).</div>
              </>
            )}
            <div className="iobar" style={{ marginTop: 12 }}>
              <button className="btn mini" onClick={() => setAnim((a) => ({ ...a, on: !a.on }))}>
                {anim.on ? "⏸ Pause" : "▶ Play"}
              </button>
              {!brM && <div className="seg">
                {["all", 0, 1, 2].map((v) => (
                  <button key={String(v)} className={phaseSel === v ? "on" : ""} onClick={() => setPhaseSel(v)}>
                    {v === "all" ? "All" : "Phase " + PHASE[v].name}
                  </button>
                ))}
              </div>}
            </div>
            {!brM && <WindingDiagram r={r} phaseSel={phaseSel} anim={anim} />}
            {brM && <BrushedWindingDiagram p={p} r={r} />}
            {brM && <div className="note">
              Closed commutated winding: every slot carries identical coils; two are highlighted, the rest run the
              same pattern shifted one slot. Coil sides land {r.span} slots apart and terminate on the commutator
              ({p.pattern === "wave" ? "≈ bars/(poles/2) apart for wave — both coil ends walk around the machine" :
              "adjacent bars for lap"}). The brushes tap the ring at the neutral axis, so which coils conduct is set
              by rotor position, not by phase.
            </div>}
            {!brM && <div className="note">
              Coil in/out per phase with series jumpers between coils. ▶ animates three-phase energization —
              brightness follows instantaneous current, and the cross-section above shows the resulting
              rotating field vector and rotor motion.
            </div>}
          </div>}
          <div className="card paper" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>Axial cutaway</h2>
              <div className="iobar">
                {brkM && <button className="btn mini" onClick={() => setAnim((a) => ({ ...a, on: !a.on }))}>
                  {anim.on ? "⏸ Pause" : "▶ Play"}
                </button>}
                <button className="btn mini ghost" onClick={() => exportPng("svg-axial", "axial-cutaway.png")}>PNG ⤓</button>
              </div>
            </div>
            <AxialCutaway p={p} r={r} us={us} anim={anim} />
            {brkM ? (
              <div className="note">
                Working drawing of the pot-core brake: Ø ladder on the right (OD, pocket ID, boss, through-hole),
                axial dims below (bobbin, pocket depth, backiron length), wound-coil Ø with its pocket clearance
                called out, and the engaged air gap. Friction architecture follows the face count: one face puts
                a static lining on the armature working the bare rotating disc; two faces bond lining to both
                sides of the rotating disc, pinched between the static pressure plate and the armature.
                ▶ Play toggles power — only the (non-rotating) armature slides, and the energized state overlays
                the flux path looping the coil: rim leg → working gap → armature → boss gap → back web.
              </div>
            ) : (
              <div className="note">
                Full 180° section through the shaft: lamination stack, winding band, end-turn overhang from the
                active coil-build model, rotor, magnets, and shaft — with stack, overall length, and the major
                diameters called out for a quick sanity check.
              </div>
            )}
          </div>
          {stpM && r.step && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Torque vs angle (one step)</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-tang", "step-torque-angle.png")}>PNG ⤓</button>
              </div>
              <StepperTorqueChart r={r} us={us} />
              <div className="note">
                Restoring curve of the energized phase about its detent position; pull-out is the peak one full
                step away. The blue curve is the same winding after one phase advance — its zero is the next
                detent, and the gap between curves at the handoff sets margin under load. Dashed: unpowered
                detent torque (4× electrical frequency, ≈{r.step.kind === "hybrid" ? "5" : "10"}% of 2-on holding — the
                cogging you feel spinning it by hand).
              </div>
            </div>
          )}
          {stpM && r.step && r.curve.length > 0 && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Pull-out torque vs speed</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-curve", "pullout-torque-speed.png")}>PNG ⤓</button>
              </div>
              <TorqueSpeedChart r={r} us={us} />
              <div className="kv"><span>Mid-band resonance (avoid sustained)</span><b>≈ {fmt(r.step.nRes, 1)} rpm ({fmt(r.step.f0, 0)} steps/s)</b></div>
              <div className="note">
                Quasi-static upper bound: pull-out anchors at 2-on holding torque, then achievable phase current
                rolls off as BEMF and phase impedance eat the {p.Vdc} V bus — chopper drive assumed above V/R.
                Real pull-out dips near the mid-band resonance and depends on load damping; derate accordingly.
              </div>
            </div>
          )}

          {latmM && r.latm && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Torque vs angle</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-tang", "torque-angle.png")}>PNG ⤓</button>
              </div>
              <TorqueAngleChart r={r} us={us} />
              <div className="note">
                Overlap model at the two-wire drive current ({fmt(r.latm.Idrv, 1)} A = V/Ra clamped by the limit):
                alternating pole field × alternating sector current sheet, fringing-smoothed. Shaded band = the
                commanded travel; ● = holding torque pressing each stop; red dashed = torque reversal — the hard
                electrical limit on travel. Flip the leads and the solid/dashed curves swap, driving the rotor to
                the other stop.
              </div>
            </div>
          )}

          {!special && <div className="card paper" style={{ marginTop: 14 }}>
            <div className="cardhead">
              <h2>Torque–speed curve</h2>
              <button className="btn mini ghost" onClick={() => exportPng("svg-curve", "torque-speed.png")}>PNG ⤓</button>
            </div>
            {!r.err.length && <TorqueSpeedChart r={r} us={us} ghost={rRaw && !rRaw.err.length ? rRaw : null} />}
            {rRaw && !rRaw.err.length && <div className="note" style={{ marginTop: 4 }}>
              Bench calibration active: solid = compensated (captured factors + fitted drag), dashed = the
              uncompensated analytical model. Tweak turns, wire, or geometry and both move — the gap between
              them is the frozen bench correction.</div>}
            <div className="tbl">
            <div className="kv"><span>No-load speed</span><b>{fmt(r.noLoad, 0)} rpm</b></div>
            {pm ? (
              <>
                <div className="kv"><span>Base speed (at {p.Imax} A)</span><b>{fmt(r.baseN, 0)} rpm</b></div>
                <div className="kv"><span>Peak torque ({brM ? "current-limited" : "drive-limited"})</span><b>{tqS(r.peakT)}</b></div>
                <div className="kv"><span>Kt / Ke</span><b>{ktS(r.Kt)} · {keS(brM ? r.Kt : r.Ke)}</b></div>
                {brM
                  ? <div className="kv"><span>V at armature (V − brush drop)</span><b>{fmt(r.VphAvail, 1)} V</b></div>
                  : <div className="kv"><span>Inverter Vphase avail.</span><b>{fmt(r.VphAvail, 0)} V rms</b></div>}
              </>
            ) : (
              <>
                <div className="kv"><span>Breakdown torque @ slip {r.acim ? (r.acim.sb * 100).toFixed(1) : "—"}%</span><b>{tqS(r.peakT)}</b></div>
                <div className="kv"><span>Rated slip (computed)</span><b>{r.acim ? (r.acim.sr * 100).toFixed(2) + "%" : "—"}</b></div>
                <div className="kv"><span>Locked-rotor torque / current</span><b>{r.acim ? tqS(r.acim.Tlr) + " · " + fmt(r.acim.Ilr, 1) + " A" : "—"}</b></div>
                <div className="kv"><span>Magnetizing (no-load) current</span><b>{r.acim ? fmt(r.acim.Im, 2) + " A" : "—"}</b></div>
                <div className="kv"><span>Running current (est)</span><b>{r.acim ? fmt(r.acim.Irun, 2) + " A" : "—"}</b></div>
                <div className="kv"><span>Rotor R referred R2'</span><b>{r.acim ? fmt(r.acim.R2p, 3) + " Ω" : "—"}</b></div>
                <div className="kv"><span>Sync speed</span><b>{fmt(r.nSync, 0)} rpm</b></div>
              </>
            )}
            </div>
            <div className="note">
              {brM
                ? "Classic brushed DC line: T = Kt·(V − brush drop − Kt·ω)/Ra, clamped at the current limit (flat region). Dashed = winding V/R capability with no current clamp. Brush drop shifts the whole line down; armature reaction and commutation limits at high speed are not modeled."
                : pm
                ? (p.conn === "wye" && p.vref === "ln"
                  ? "Center-tap (L-N) excitation: each phase limited to ±Vdc/2 about the tap and torque-per-amp halved — half the winding pair works at a time. Flat region = drive current limit."
                  : "Flat region = drive current limit; droop includes both IR and synchronous-reactance (ωLI) drop; the tail above the no-load marker is the FOC field-weakening region (absent for six-step). Dashed = winding V/R capability with no drive clamp.")
                : "Single-cage equivalent circuit: rotor resistance computed from bar count, bar & end-ring areas, and material; slip and breakdown fall out rather than being entered. Deep-bar effects (higher apparent R at start) not modeled."}
              {" "}Marker = thermally-rated operating point from J.
            </div>
          </div>}

          {pm && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Current vs torque</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-itcurve", "current-torque.png")}>PNG ⤓</button>
              </div>
              <CurrentTorqueChart r={r} p={p} us={us} ghost={rRaw && !rRaw.err.length ? rRaw : null} />
              <div className="note">
                {brM
                  ? "I = T / Kt — linear for the brushed model (armature-reaction flux knockdown not iterated). Solid to the current-limited stall point; faint continuation = winding V/R capability. Red dashed = current limit."
                  : "I = T / Kt with the saturation bend applied — the curve steepens toward Imax as steel MMF drops knock down flux (kIT). Solid to the drive-limited stall point; faint continuation = winding V/R capability. Red dashed = drive current limit."}
              </div>
            </div>
          )}

          {p.motorType === "pm" && r.op && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Efficiency map</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-effmap", "efficiency-map.png")}>PNG ⤓</button>
              </div>
              <EfficiencyMap r={r} p={p} us={us} />
              <div className="note">
                η over the torque-speed envelope: DC + AC copper (skin/proximity per strand lay), iron loss scaled
                ~f^1.5, and windage. Marker = rated point. Red &lt;70%, amber &lt;80%, yellow &lt;88%,
                green ≥93%. Magnet eddy loss not modeled.
              </div>
            </div>
          )}

          {pm && r.bemf && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Back-EMF waveform (backdriven)</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-bemf", "bemf-waveform.png")}>PNG ⤓</button>
              </div>
              <Num label="Backdrive speed" unit="rpm" v={p.bdRpm} set={s("bdRpm")} step={100} min={1} />
              <div className="field">
                <span className="fl">View</span>
                <div className="seg">
                  <button className={bemfView === "ll" ? "on" : ""} onClick={() => s("vref")("ll")}>Line-line</button>
                  <button className={bemfView === "ph" ? "on" : ""} onClick={() => s("vref")("ln")} disabled={p.conn === "delta"}>L-N (center tap)</button>
                </div>
              </div>
              <BemfScope r={r} view={bemfView} />
              <div className="tbl">
                {(() => {
                  const d = bemfView === "ph" ? r.bemf.ph : r.bemf.ll;
                  const thd = bemfView === "ph" ? r.bemf.thdPh : r.bemf.thdLL;
                  const lbl = bemfView === "ph" ? "L-N" : "L-L";
                  return (
                    <>
                      <div className="kv"><span>Waveform shape (THD)</span>
                        <b>{thd < 0.05 ? "near-sinusoidal" : thd < 0.15 ? "rounded trapezoid" : "trapezoidal"} · {(thd * 100).toFixed(1)}%</b></div>
                      <div className="kv"><span>Electrical frequency</span><b>{fmt(r.bemf.f, 1)} Hz</b></div>
                      <div className="kv"><span>V peak-peak ({lbl})</span><b>{fmt(d.Vpp, 1)} V</b></div>
                      <div className="kv"><span>V rms ({lbl})</span><b>{fmt(d.Vrms, 1)} V</b></div>
                    </>
                  );
                })()}
              </div>
              <div className="note">
                Synthesized from the pole-arc flux harmonics and per-harmonic winding factors — what a scope
                would show while backdriving at the set speed. Triplen harmonics (3rd, 9th) cancel in the
                line-line view on a wye machine, so the flat-topped "trapezoid" is most visible in the Phase
                view. Slotting ripple is not modeled.
              </div>
            </div>
          )}

          {pm && r.cog && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Cogging torque profile</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-cog", "cogging-profile.png")}>PNG ⤓</button>
              </div>
              <CogScope r={r} us={us} />
              <div className="tbl">
                <div className="kv"><span>Cycles per revolution (LCM)</span><b>{r.cog.Ncog}</b></div>
                <div className="kv"><span>Cogging period</span><b>{fmt(r.cog.perDeg)}° mech</b></div>
                <div className="kv"><span>Peak (±)</span><b>{tqS(r.cog.Tpk)}</b></div>
                <div className="kv"><span>Peak-peak</span><b>{tqS(r.cog.Tpp)}</b></div>
                <div className="kv"><span>Peak vs rated torque</span><b>{r.op && r.op.T > 0 ? ((r.cog.Tpk / r.op.T) * 100).toFixed(r.cog.Tpk / r.op.T < 0.01 ? 3 : r.cog.Tpk / r.op.T < 0.1 ? 2 : 1) + "%" : "—"}</b></div>
              </div>
              <div className="note">
                Edge-passing energy model: each magnet edge sweeping a slot opening. Period and waveform shape
                are geometrically exact (LCM of slots × poles); amplitude is a first-order estimate — treat it
                as order-of-magnitude and comparative between designs, not absolute. Skew, magnet shaping, and
                slot-opening steps (the usual cogging remedies) are not modeled and all reduce it.
              </div>
            </div>
          )}

        </div>

        {/* ============ results ============ */}
        <div>
                    <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Rated point</h2>
            <div className="tbl">
            {!latmM && !stpM && !brkM && <div className="kv"><span>Shaft speed</span><b>{fmt(r.nShaft, 0)} rpm</b></div>}
            <div className="kv"><span>{latmM ? "Toggle torque @ stops" : stpM ? "Holding torque" : brkM ? "Braking torque (static)" : "Torque"}</span><b>{tqS(r.op ? r.op.T : NaN)}</b></div>
            <div className="kv"><span>{latmM ? "Drive current (V/Ra)" : stpM ? "Rated phase current" : brkM ? "Coil current (V/R)" : "Rated current"}</span><b>{fmt(latmM && r.latm ? r.latm.Idrv : stpM ? p.Imax : brkM && r.brake ? r.brake.Ib : r.Iph)} A{brM || latmM || stpM || brkM ? " dc" : " rms"}</b></div>
            {pm && r.cog && (
              <>
                <div className="kv"><span>Cogging ripple (RMS)</span><b>−{tqS(r.cog.Trms)}</b></div>
                <div className="kv"><span>Net available torque</span><b>{tqS(Math.max((r.op ? r.op.T : 0) - r.cog.Trms, 0))}</b></div>
              </>
            )}
            {!brkM && !stpM && !latmM && <div className="kv"><span>Shaft power</span><b>{us === "in" ? (r.Pout / 745.7).toFixed(2) + " hp · " + fmt(r.Pout, 0) + " W" : fmt(r.Pout / 1000) + " kW"}</b></div>}
            {!latmM && !stpM && !brkM && <div className="kv"><span>Rotation ({brM ? (p.seq === "ABC" ? "normal" : "reversed") : p.seq})</span><b>{r.rotation}</b></div>}
            {!brM && !latmM && !stpM && !brkM && <div className="kv"><span>Winding factor kw</span><b>{fmt(r.kw, 3)}</b></div>}
            {!latmM && !stpM && !brkM && <div className="kv"><span>Linear loading A</span><b>{fmt(r.Arms / 1000, 1)} kA/m</b></div>}
            {brkM && r.brake && <div className="kv"><span>Coil dissipation (released)</span><b>{fmt(r.brake.Pb, 1)} W</b></div>}
            {stpM && r.step && <div className="kv"><span>Coil dissipation (holding)</span><b>{fmt((r.step.on2 ? 2 : 1) * p.Imax * p.Imax * r.step.Rs, 1)} W</b></div>}
            {latmM && r.latm && <div className="kv"><span>Coil dissipation (held on)</span><b>{fmt(r.latm.Idrv * r.latm.Idrv * r.latm.Ra, 1)} W</b></div>}
            </div>
          </div>

          {!latmM && !stpM && !brkM && <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Electrical</h2>
            <div className="tbl">
            {brM && r.brush ? (
              <>
                <div className="kv"><span>Armature conductors Z / paths a</span><b>{r.brush.Z} / {r.brush.A2}</b></div>
                <div className="kv"><span>Commutator bars</span><b>{r.brush.segs}</b></div>
                <div className="kv"><span>Ra terminal ({p.Tcu} °C + leads)</span><b>{fmt(r.brush.Ra, 3)} Ω</b></div>
                <div className="kv"><span>Ra @20 °C (winding only)</span><b>{fmt((r.brush.Ra - Math.max(p.Rext, 0) / 1000) / (1 + 0.00393 * (p.Tcu - 20)), 3)} Ω</b></div>
                <div className="kv"><span>La armature (est)</span><b>{indS(r.brush.La)}</b></div>
                <div className="kv"><span>Elec. time const La/Ra</span><b>{fmt((r.brush.La / Math.max(r.brush.Ra, 1e-6)) * 1000, 2)} ms</b></div>
                <div className="kv"><span>Rated armature current</span><b>{fmt(r.Iph)} A</b></div>
                <div className="kv"><span>Implied copper J (per path)</span><b>{fmt(r.Jimp, 1)} A/mm²</b></div>
                <div className="kv"><span>Stall current (V−Vb)/Ra</span><b>{fmt(r.VphAvail / Math.max(r.brush.Ra, 1e-6), 1)} A</b></div>
                <div className="kv"><span>Copper + brush loss</span><b>{fmt(r.Pcu, 0)} W ({fmt(Math.max(p.brushV, 0) * r.Iph, 1)} W brush)</b></div>
                <div className="kv"><span>Windage @ rated</span><b>{fmt(r.Pwind, 1)} W</b></div>
                <div className="kv"><span>η (Cu + brush + Fe est)</span><b>{fmt(r.eta * 100, 1)}%</b></div>
              </>
            ) : (
              <>
            <div className="kv"><span>Series turns / phase</span><b>{fmt(r.Nser, 0)}</b></div>
            <div className="kv"><span>R per phase (20 °C)</span><b>{fmt(r.Rphase, 3)} Ω</b></div>
            <div className="kv"><span>R line-line (20 °C)</span><b>{fmt(r.Rll, 3)} Ω</b></div>
            <div className="kv"><span>R operating ({p.Tcu} °C + ext)</span><b>{fmt(r.Rhot, 3)} Ω/ph</b></div>
            <div className="kv"><span>L / phase (rotor in)</span><b>{indS(r.Lph)}</b></div>
            <div className="kv"><span>L / phase (rotor out)</span><b>{indS(r.LphNR)}</b></div>
            <div className="kv"><span>L line-line, in / out</span><b>{indS(r.Lll)} / {indS(r.LllNR)}</b></div>
            <div className="kv"><span>Elec. time const L/R</span><b>{fmt((r.Lph / Math.max(r.Rhot, 1e-6)) * 1000, 2)} ms</b></div>
            <div className="kv"><span>Rated phase current</span><b>{fmt(r.Iph)} A</b></div>
            <div className="kv"><span>Implied copper J</span><b>{fmt(r.Jimp, 1)} A/mm²</b></div>
            <div className="kv"><span>Line current ({p.conn})</span><b>{fmt(r.Iline)} A</b></div>
            {!pm && <div className="kv"><span>DC stall bound Vph/R</span><b>{fmt(r.Istall, 0)} A</b></div>}
            <div className="kv"><span>Copper loss</span><b>{fmt(r.Pcu, 0)} W</b></div>
            <div className="kv"><span>AC copper factor @ rated fe</span><b>×{fmt(r.acFr, 2)}</b></div>
            <div className="kv"><span>Windage @ rated</span><b>{fmt(r.Pwind, 1)} W</b></div>
            <div className="kv"><span>η (Cu + Fe est)</span><b>{fmt(r.eta * 100, 1)}%</b></div>
            <div className="kv"><span>Back-EMF / phase @ B̂g</span><b>{fmt(r.Eph, 0)} V rms</b></div>
              </>
            )}
            </div>
            <div className="note">
              {brM
                ? "Terminal quantities as a meter sees them at the brushes: Ra = (ρ·half-MLT·Z)/a² plus lead resistance, temperature-corrected; La = first-order airgap + leakage estimate (varies with brush position and saturation). Brush drop is a separate series offset, not part of Ra."
                : <>Inductance = airgap magnetizing term + slot & end leakage. Rotor-out is what an LCR meter reads on
              the bare stator (leakage-dominated, flux crossing the open bore). Rotor-in on a surface-PM machine
              varies a few percent with rotor angle; unsaturated values shown.</>}
            </div>
          </div>}

          <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Thermal (steady-state est.)</h2>
            <Num label="Ambient" unit="°C" v={p.Tamb} set={s("Tamb")} step={5} />
            <Sel label="Cooling" v={p.cooling} set={s("cooling")} opts={["Sealed", "Open air", "Cold plate"]} />
            <Num label="Winding temp limit" unit="°C" v={p.TcuMax} set={s("TcuMax")} step={5} />
            <Num label="Duty cycle" unit="%" v={p.dutyPct} set={s("dutyPct")} step={5} min={5} max={100} />
            {p.dutyPct < 100 && <Num label="Cycle time" unit="s" v={p.cycleT} set={s("cycleT")} step={1} min={1} />}
            {r.therm && (
              <div className="tbl" style={{ marginTop: 8 }}>
                <div className="kv"><span>Steady Tcu @ rated point</span>
                  <b style={{ color: r.therm.Tcu > p.TcuMax ? "#DC2626" : "#059669" }}>{fmt(r.therm.Tcu, 0)} °C</b></div>
                <div className="kv"><span>Total Rth (Cu→amb)</span><b>{fmt(r.therm.Rth, 2)} K/W</b></div>
                <div className="kv"><span>Continuous current @ limit</span><b>{fmt(r.therm.Icont, 2)} A rms</b></div>
                <div className="kv"><span>Continuous (S1) torque</span><b>{tqS(r.therm.Tcont)}</b></div>
                <div className="kv"><span>Thermal τ winding / machine</span><b>{fmt(r.therm.tauW, 0)} s / {fmt(r.therm.tauM / 60, 1)} min</b></div>
                {Number.isFinite(r.therm.TcuDuty) && r.therm.TcuDuty !== null && r.therm.duty < 1 && (
                  <div className="kv"><span>Peak Tcu @ {p.dutyPct}% / {p.cycleT} s cycle</span>
                    <b style={{ color: r.therm.TcuDuty > p.TcuMax ? "#DC2626" : "#059669" }}>{fmt(r.therm.TcuDuty, 0)} °C</b></div>
                )}
              </div>
            )}
            <div className="note">
              {brM
                ? "Lumped network for the rotating armature: copper→lamination→airgap→housing→ambient — the gap hop dominates, which is why brushed motors thermally lag equivalent BLDCs. Brush contact loss is included in the copper node."
                : "Four-node lumped network: impregnated copper→lamination→housing→ambient, convection coefficient set by the cooling selection."} Duty below 100% uses a two-node transient (winding rides the pulse factor over an
              averaging housing — valid while the cycle is short against the machine τ). Altitude derating
              applies to the convection term. First-order: validate against a thermocouple before trusting margins.
            </div>
          </div>

          <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Bench calibration</h2>
            <div className="hint" style={{ margin: "-2px 0 6px", fontSize: 11, opacity: 0.7 }}>
              Enter R in mΩ and L in µH — a nameplate "M.H." is microhenries (µH), not milli (0.193 mH = 193 µH). Wrong-unit entries drive the cal factors far from 1.
            </div>
            <Num label={brM ? "Measured R terminal" : "Measured R line-line"} unit="mΩ" v={p.mR} set={s("mR")} step={10} min={0} />
            <Num label={brM ? "Measured L terminal" : "Measured L line-line"} unit="µH" v={p.mL} set={s("mL")} step={10} min={0} />
            {(pm && !brM) && (
              <>
                <Num label="Back-driven BEMF pk-pk (L-L)" unit="V" v={p.mBpp} set={s("mBpp")} step={0.1} min={0} />
                <Num label="Back-driven BEMF RMS (L-L)" unit="V" v={p.mBrms} set={s("mBrms")} step={0.1} min={0} />
                <Num label="BEMF frequency" unit="Hz" v={p.mBf} set={s("mBf")} step={1} min={0} />
              </>
            )}
            {brM && (
              <>
                <Num label="Back-driven BEMF (DC)" unit="V" v={p.mBrms} set={s("mBrms")} step={0.1} min={0} />
                <Num label="Back-drive speed" unit="rpm" v={p.mBn} set={s("mBn")} step={100} min={0} />
              </>
            )}
            {(pm || brM) && mKeEff > 0 && (
              <div className="tbl" style={{ marginTop: 4 }}>
                {mBn9 > 0 && <div className="kv"><span>{brM ? "Rig speed" : `Speed from f (${p.poles} poles)`}</span><b>{fmt(mBn9, 0)} rpm</b></div>}
                <div className="kv"><span>Measured Ke {brM ? "(terminal)" : "(L-L RMS)"} / implied Kt</span>
                  <b>{fmt(mKeEff, 2)} V/krpm · {(() => {
                    const KtM = (brM ? mKeEff : Math.sqrt(3) * mKeEff) / ((1000 * 2 * Math.PI) / 60);
                    return us === "in" ? (KtM * IN2C).toFixed(2) + " oz·in/A" : KtM.toFixed(4) + " N·m/A";
                  })()}{!brM ? " (FOC basis)" : ""}</b></div>
                {!brM && p.mBpp > 0 && p.mBrms > 0 && (
                  <div className="kv"><span>Waveform crest (pk-pk / RMS)</span>
                    <b>{fmt(p.mBpp / p.mBrms, 2)} — sine 2.83, trapezoidal lower</b></div>
                )}
                {!brM && p.mBpp > 0 && !(p.mBrms > 0) && (
                  <div className="kv"><span>RMS basis</span><b>pk-pk / 2√2 (sine estimate)</b></div>
                )}
              </div>
            )}
            {!latmM && !stpM && !brkM && <Num label="Measured no-load" unit="rpm" v={p.mNl} set={s("mNl")} step={100} min={0} />}
            {(pm || brM) && (
              <>
                <Num label="Measured rated torque" unit={us === "in" ? "oz·in" : "N·m"} v={p.calTt} set={s("calTt")} min={0} />
                <Num label="…at speed" unit="rpm" v={p.calTn} set={s("calTn")} step={100} min={0} />
                <Num label="Measured stall torque" unit={us === "in" ? "oz·in" : "N·m"} v={p.calTs} set={s("calTs")} min={0} />
                <div className="iobar" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={captureCal}>Capture factors</button>
                  <Pick label="" v={p.calOn} set={s("calOn")} opts={[{ v: "yes", t: "Active" }, { v: "no", t: "Off" }]} />
                </div>
                {p.calOn === "yes" && r.cal && (
                  <div className="tbl" style={{ marginTop: 6 }}>
                    <div className="kv"><span>Applied factors R · L</span><b>×{fmt(r.cal.kR, 3)} · ×{fmt(r.cal.kL, 3)}</b></div>
                    <div className="kv"><span>Ke (no-load) · Kt (stall)</span><b>×{fmt(r.cal.kKe, 3)} · ×{fmt(r.cal.kKt, 3)}
                      {Math.abs(r.cal.kKt - r.cal.kKe) > 0.02 ? ` (${((r.cal.kKt / r.cal.kKe - 1) * 100).toFixed(1)}% sat droop)` : ""}</b></div>
                    {r.cal.Td > 0 && <div className="kv"><span>Fitted drag (friction/windage)</span><b>−{tqS(r.cal.Td)}</b></div>}
                  </div>
                )}
              </>
            )}
            <div className="tbl" style={{ marginTop: 8 }}>
              {(() => {
                const rows = [];
                const add = (name, pred, meas, unit2) => {
                  if (!(meas > 0)) return;
                  const e = ((meas - pred) / pred) * 100;
                  rows.push(<div className="kv" key={name}><span>{name}: pred {fmt(pred, 1)} {unit2}</span>
                    <b style={{ color: Math.abs(e) > 15 ? "#DC2626" : Math.abs(e) > 7 ? "#D97706" : "#059669" }}>
                      meas {fmt(meas, 1)} · {e > 0 ? "+" : ""}{e.toFixed(1)}%</b></div>);
                };
                if (brkM && r.brake) {
                  add("R coil", r.brake.Rb * 1000, p.mR, "mΩ");
                  add("L coil (@ gap)", r.brake.Lb * 1e6, p.mL, "µH");
                } else if (stpM && r.step) {
                  add("R phase", r.step.Rs * 1000, p.mR, "mΩ");
                  add("L phase", r.step.Ls * 1e6, p.mL, "µH");
                } else if (latmM && r.latm) {
                  add("Ra term", r.latm.Ra * 1000, p.mR, "mΩ");
                  add("L term", r.latm.L * 1e6, p.mL, "µH");
                } else if (brM && r.brush) {
                  add("Ra term", r.brush.Ra * 1000, p.mR, "mΩ");
                  add("La term", r.brush.La * 1e6, p.mL, "µH");
                  add("Ke term", r.Kt * ((1000 * 2 * Math.PI) / 60), mKeEff, "V/krpm");
                  add("No-load", r.noLoad, p.mNl, "rpm");
                } else {
                  add("R L-L", r.Rll * 1000, p.mR, "mΩ");
                  add("L L-L", r.Lll * 1e6, p.mL, "µH");
                  add("Ke L-L", r.Ke * Math.sqrt(3) * ((1000 * 2 * Math.PI) / 60), mKeEff, "V/krpm");
                  add("No-load", r.noLoad, p.mNl, "rpm");
                }
                return rows.length ? rows : <div className="kv"><span>Enter measurements to compare</span><b>—</b></div>;
              })()}
            </div>
            <div className="note">
              Persisted in the design file. R error ⇒ end-turn/MLT model (or wire gauge); L error ⇒ leakage
              permeance; Ke/no-load error ⇒ magnet Br, temperature, or effective airgap. Green ≤7%, amber ≤15%.
              {(pm || brM) && ` BEMF is entered as raw scope/meter readings — pk-pk, RMS, frequency (speed derives from pole
              count; brushed takes DC volts at rig speed) — and Ke/Kt fall out; with both amplitudes the crest
              ratio flags waveform shape. Capture freezes the measured-vs-model factors against the as-built geometry and
              applies them multiplicatively through R, L, BEMF, torque (with stall-implied saturation droop),
              and a fitted drag from the rated point — so adding or removing a turn predicts how the REAL motor
              responds. Re-bench and re-capture after a physical change.`}
            </div>
          </div>

          {brkM && r.brake && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <h2>Brake output (power-off, spring-applied)</h2>
              <div className="tbl">
                <div className="kv"><span>Static holding torque</span><b>{tqS(r.brake.Thold)}</b></div>
                <div className="kv"><span>Dynamic (slipping) torque</span><b>{tqS(r.brake.Tdyn)}</b></div>
                <div className="kv"><span>Clamp force / springs at pulled-in</span><b>{fmt(r.brake.Fclamp, 0)} / {fmt(r.brake.Fcompr, 0)} N</b></div>
                <div className="kv"><span>Effective radius (wear / new)</span><b>{fmt(r.brake.re, 1)} / {fmt(r.brake.reUP, 1)} mm · {r.brake.faces} face{r.brake.faces > 1 ? "s" : ""}</b></div>
                <div className="kv"><span>Lining pressure / limit</span><b style={{ color: r.brake.padP > r.brake.pMax ? "#DC2626" : "#059669" }}>
                  {fmt(r.brake.padP, 2)}{Number.isFinite(r.brake.pMax) ? " / " + r.brake.pMax : ""} MPa</b></div>
                <div className="kv"><span>Magnet pull @ gap / seated</span><b>{fmt(r.brake.Fpull, 0)} / {fmt(r.brake.Fseat, 0)} N</b></div>
                <div className="kv"><span>Release margin (pull ÷ compressed springs)</span><b style={{ color: r.brake.marginRel < 1.3 ? "#DC2626" : "#059669" }}>×{fmt(r.brake.marginRel, 2)}</b></div>
                <div className="kv"><span>Ampere-turns / pole flux density</span><b>{fmt(r.brake.NI, 0)} At · {fmt(r.brake.Bin, 2)} / {fmt(r.brake.Bout, 2)} T</b></div>
                <div className="kv"><span>Wound coil Ø / pocket clearance</span><b style={{ color: r.brake.clr < 0.5 ? "#DC2626" : "#059669" }}>{fmt(r.brake.coilOD, 1)} mm · {fmt(r.brake.clr, 2)} mm</b></div>
                <div className="kv"><span>Back web / flux</span><b>{fmt(r.brake.tBack, 1)} mm · {fmt(r.brake.Bback, 2)} T</b></div>
                <div className="kv"><span>Armature ring B (seated)</span><b>{fmt(r.brake.Barm, 2)} T</b></div>
                <div className="kv"><span>Coil R (20 °C / at {p.Tcu} °C) · wire</span><b>{fmt(r.brake.Rcold, 1)} / {fmt(r.brake.Rb, 1)} Ω · {fmt(r.brake.wireLen, 0)} m</b></div>
                <div className="kv"><span>Coil I / P at pull-in (full bus)</span><b>{fmt(r.brake.Ib, 2)} A · {fmt(r.brake.Pb, 1)} W</b></div>
                {r.brake.eco < 1 && <div className="kv"><span>Hold I / P @ {p.brkEco}% economizer</span><b>{fmt(r.brake.Ihold, 2)} A · {fmt(r.brake.Phold, 1)} W</b></div>}
                <div className="kv"><span>Pull-in current (releases the brake)</span><b style={{ color: r.brake.Ipull > r.brake.Ib ? "#DC2626" : "#059669" }}>{Number.isFinite(r.brake.Ipull) ? fmt(r.brake.Ipull, 2) + " A (" + fmt((r.brake.Ipull / r.brake.Ib) * 100, 0) + "% of V/R)" : "unreachable — saturated"}</b></div>
                <div className="kv"><span>Drop-out current (re-engages)</span><b>{fmt(r.brake.Idrop, 2)} A · hold down to ≈ {fmt(r.brake.Idrop * r.brake.Rb * 1.5, 1)} V</b></div>
                <div className="kv"><span>Coil temperature (held released)</span><b style={{ color: r.brake.TcuB > p.TcuMax ? "#DC2626" : "#059669" }}>≈ {fmt(r.brake.TcuB, 0)} °C</b></div>
                <div className="kv"><span>Coil L @ gap / time const</span><b>{(r.brake.Lb * 1e3).toFixed(0)} mH · {fmt(r.brake.tau * 1000, 0)} ms</b></div>
                <div className="kv"><span>Min release voltage (×1.35 margin, est)</span><b>{fmt(r.brake.Vrel, 1)} V</b></div>
              </div>
              <div className="note">
                Pot-core electromagnet vs springs: pull must beat the springs at the FULL working gap (they compress
                a further stroke to release), computed as a series magnetic circuit over both annular pole rings with
                the iron path and saturation capped at the housing steel's limit. Torque uses the uniform-wear
                effective radius (service rating); the uniform-pressure value applies to a new lining only.
                Engage/release transient dynamics and lining wear life are not modeled.
              </div>
            </div>
          )}

          {stpM && r.step && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Pole coils & connections</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-winding", "stepper-winding.png")}>PNG ⤓</button>
              </div>
              <StepperWindingDiagram p={p} r={r} />
              <div className="chips">
                {Array.from({ length: Math.max(Math.round(p.slots), 4) }, (_, i) => {
                  const isA = i % 2 === 0, pos = Math.floor(i / 2) % 2 === 0;
                  return (
                    <div key={i} className="chip" style={{ background: isA ? "#E8933A" : "#5B8DEF", opacity: pos ? 1 : 0.6 }}>
                      {i + 1}<br />{isA ? "A" : "B"}{pos ? "+" : "−"}
                    </div>
                  );
                })}
              </div>
              <div className="note">Pole map: phase and wind sense around the stator, pole 1 at 12 o'clock, clockwise.
                Same-phase coils alternate direction so energized poles come up N-S-N-S; turns and wire gauge are
                per pole per strand ({r.step.wire === "uni" ? "one bifilar strand conducts at a time" :
                r.step.wire === "bip-par" ? "bifilar strands paralleled at the driver" : "bifilar strands in series"} ·
                {" "}{r.step.leads} leads).</div>
            </div>
          )}

          {stpM && r.step && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <h2>Stepper output (2-phase {r.step.kind})</h2>
              <div className="tbl">
                <div className="kv"><span>Full-step angle / steps·rev</span><b>{r.step.angle.toFixed(r.step.angle < 10 ? 2 : 1)}° · {r.step.stepsRev}</b></div>
                <div className="kv"><span>Holding torque ({r.step.on2 ? "2" : "1"}-phase-on)</span><b>{tqS(r.step.Th)}</b></div>
                <div className="kv"><span>Holding 1-on / 2-on</span><b>{tqS(r.step.Th1)} / {tqS(r.step.Th2)}</b></div>
                <div className="kv"><span>Detent torque, unpowered (est)</span><b>{tqS(r.step.detent)}</b></div>
                <div className="kv"><span>Kt per phase</span><b>{ktS(r.step.Kt)}</b></div>
                <div className="kv"><span>Wiring / leads</span><b>{r.step.wire === "bip-ser" ? "bipolar series" : r.step.wire === "bip-par" ? "bipolar parallel" : "unipolar"} · {r.step.leads} wires</b></div>
                <div className="kv"><span>R / L per phase</span><b>{fmt(r.step.Rs, 2)} Ω · {(r.step.Ls * 1e3).toFixed(2)} mH</b></div>
                <div className="kv"><span>Elec. time const</span><b>{fmt(r.step.tau * 1000, 2)} ms</b></div>
                {r.step.kind === "hybrid" && <div className="kv"><span>Stator teeth per pole / tooth pitch</span><b>{r.step.teethPP} · {r.step.tPitch.toFixed(2)} mm</b></div>}
                <div className="kv"><span>Aligned tooth flux (bias)</span><b>{fmt(r.step.BtBias, 2)} T</b></div>
                <div className="kv"><span>Stiffness @ detent</span><b>{us === "in"
                  ? (r.step.stiff * 141.612 * Math.PI / 180).toFixed(2) + " oz·in/deg"
                  : r.step.stiff.toFixed(2) + " N·m/rad"}</b></div>
                <div className="kv"><span>Rotor inertia / 1-step nat. freq</span><b>{(r.step.J * 1e7).toFixed(1)} g·cm² · {fmt(r.step.f0, 0)} Hz</b></div>
              </div>
              <div className="note">
                {r.step.kind === "hybrid"
                  ? "Hybrid: axially magnetized PM disc between two toothed cups offset half a tooth pitch; torque from the differential tooth-alignment linkage swing. Aligned teeth intentionally run near saturation."
                  : "PM stepper: magnet-arc rotor on salient poles — coarse steps, simple construction (real can-stacks use claw poles, approximated here)."}
                {" "}Mid-band resonance and microstep accuracy are not modeled; the single-step natural frequency
                marks where low-speed resonance trouble starts. Calibrate R/L against a datasheet before trusting margins.
              </div>
            </div>
          )}

          {latmM && r.latm && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <h2>LATM output (two-position toggle)</h2>
              <div className="tbl">
                <div className="kv"><span>Torque constant Kt (peak)</span><b>{ktS(r.latm.Kt)}</b></div>
                <div className="kv"><span>Drive current (V/Ra, ≤ limit)</span><b>{fmt(r.latm.Idrv, 2)} A</b></div>
                <div className="kv"><span>Peak torque (travel center)</span><b>{tqS(r.latm.Tpk)}</b></div>
                <div className="kv"><span>Toggle / holding torque @ stops</span>
                  <b style={{ color: r.latm.Tstop <= 0 ? "#DC2626" : r.latm.Tstop < 0.25 * r.latm.Tpk ? "#D97706" : "#059669" }}>{tqS(r.latm.Tstop)}</b></div>
                <div className="kv"><span>Travel between stops</span><b>{r.latm.travel.toFixed(0)}° mech</b></div>
                <div className="kv"><span>Torque-reversal angle (T = 0)</span><b>±{r.latm.zeroAng.toFixed(1)}°</b></div>
                <div className="kv"><span>Single-layer capacity (perfect lay)</span>
                  <b style={{ color: p.turns > r.latm.N1 ? "#D97706" : "#059669" }}>{r.latm.N1} turns · {r.latm.layersW} layer{r.latm.layersW > 1 ? "s" : ""} needed</b></div>
                <div className="kv"><span>Radial build (nested / crossover worst)</span>
                  <b style={{ color: r.latm.buildX > p.latmWind ? "#DC2626" : "#059669" }}>{fmt(r.latm.buildNest, 2)} / {fmt(r.latm.buildX, 2)} mm of {p.latmWind} mm wrap</b></div>
                <div className="kv"><span>Clearance to magnets at worst build</span>
                  <b style={{ color: r.latm.clrMag < 0.2 ? "#DC2626" : "#059669" }}>{fmt(r.latm.clrMag, 2)} mm</b></div>
                <div className="kv"><span>Magnetic stiffness @ stop</span><b>{us === "in"
                  ? (r.latm.stiff * 141.612 * Math.PI / 180).toFixed(2) + " oz·in/deg"
                  : (r.latm.stiff).toFixed(3) + " N·m/rad"}</b></div>
                <div className="kv"><span>Continuous-hold current (thermal)</span><b>{r.therm ? fmt(r.therm.Icont, 2) + " A" : "—"}</b></div>
                <div className="kv"><span>Coil R at terminals (20 °C / {p.Tcu} °C)</span><b>{fmt(r.latm.Ra20, 2)} / {fmt(r.latm.Ra, 2)} Ω</b></div>
                <div className="kv"><span>Inductance / time const</span><b>{(r.latm.L * 1e3).toFixed(2)} mH · {fmt(r.latm.tau * 1000, 2)} ms</b></div>
                <div className="kv"><span>Slotless gap flux B̂g</span><b>{fmt(r.latm.Bg, 2)} T</b></div>
              </div>
              <div className="note">
                Two-wire toggle: +polarity drives the rotor onto stop B and holds with the stop torque; flipping
                polarity mirrors the curve and drives to stop A. Unpowered there is no detent — the slotless core
                gives zero cogging, so position is held by the stops, friction, or the load. Stiffness is the
                energized magnetic spring rate against disturbances at the stop. Fringing softens the profile
                edges over ≈ (gap + winding build)/r; stops must sit inside the ±{r.latm.zeroAng.toFixed(0)}°
                torque reversal or the rotor cannot reach them.
              </div>
            </div>
          )}

          {/* gearbox plug-in moved to the Actuator machine type */}

          <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Magnetics & materials</h2>
            <div className="tbl">
              {latmM && r.latm && <div className="kv"><span>Ring core flux / limit</span>
                <b style={{ color: r.latm.Bring > r.stM.Bmax ? "#DC2626" : r.latm.Bring > 0.88 * r.stM.Bmax ? "#D97706" : "#059669" }}>
                  {fmt(r.latm.Bring)} / {r.stM.Bmax} T</b></div>}
              {!latmM && <div className="kv"><span>Tooth Bt / limit</span>
                <b style={{ color: r.Bt > r.stM.Bmax ? "#DC2626" : r.Bt > 0.88 * r.stM.Bmax ? "#D97706" : "#059669" }}>
                  {fmt(r.Bt)} / {r.stM.Bmax} T</b></div>}
              {!latmM && <div className="kv"><span>{brM ? "Armature core By" : "Stator yoke By"}</span>
                <b style={{ color: r.By > r.stM.Bmax ? "#DC2626" : r.By > 0.88 * r.stM.Bmax ? "#D97706" : "#059669" }}>
                  {fmt(r.By)} T</b></div>}
              {pm && <div className="kv"><span>{brM ? "Housing return" : "Rotor back-iron"} ({lenS(r.hyr)} {lu})</span>
                <b style={{ color: r.Byr > r.rtM.Bmax ? "#DC2626" : r.Byr > 0.88 * r.rtM.Bmax ? "#D97706" : "#059669" }}>
                  {fmt(r.Byr)} / {r.rtM.Bmax} T</b></div>}
              <div className="kv"><span>Stacking factor</span><b>{r.stM.kst}</b></div>
              <div className="kv"><span>Core mass</span><b>{fmt(r.coreMass, 2)} kg</b></div>
              <div className="kv"><span>Iron loss (est)</span><b>{fmt(r.Pfe, 0)} W</b></div>
            </div>
            <div className="note">
              Bt from slot-pitch/tooth-width flux concentration; yoke from half-pole flux. Linear model —
              values above ~88% of the material ceiling mean real flux will fall below prediction as the
              steel saturates. Iron loss is a Steinmetz-style scaling from 1.5 T / 60 Hz catalog specific loss.
            </div>
          </div>

          {(r.warn.length > 0) && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <h2>Checks</h2>
              {r.warn.map((m, i) => <div className="warn" key={i}>{m}</div>)}
            </div>
          )}
        </div>
        </>}
      </div>

      <footer className="ft">
        <span>CortexEdge · MotrWorks</span><span>·</span>
        <span>Ad-free</span><span>·</span>
        <span>No account required</span><span>·</span>
        <a href="mailto:CortexEdge@outlook.com">CortexEdge@outlook.com</a>
      </footer>
    </div>
    </UnitCtx.Provider>
  );
}
