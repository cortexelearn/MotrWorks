import React, { useMemo, useState, useEffect, useContext, createContext } from "react";

const UnitCtx = createContext("in");
const INCH = 25.4;

/* ================= physics helpers ================= */
const RHO_CU = 1.724e-8; // ohm·m @20C

/* Typical sintered-magnet catalog values (mid-range Br; HcJ ~min).
   Mirrors Arnold Magnetics N-grade / RECOMA style tables — confirm against the datasheet.
   Br [T @20°C], HcJ [kA/m @20°C], BHmax [kJ/m³], aBr [%/°C], aHcJ [%/°C], Tmax [°C], mur */
const MAGNETS = {
  "N35":        { fam: "NdFeB",  Br: 1.19, HcJ: 955,  BH: 278, aBr: -0.12,  aHcJ: -0.60, Tmax: 80,  mur: 1.05 },
  "N42":        { fam: "NdFeB",  Br: 1.31, HcJ: 955,  BH: 326, aBr: -0.12,  aHcJ: -0.60, Tmax: 80,  mur: 1.05 },
  "N52":        { fam: "NdFeB",  Br: 1.44, HcJ: 875,  BH: 398, aBr: -0.12,  aHcJ: -0.60, Tmax: 65,  mur: 1.05 },
  "N42SH":      { fam: "NdFeB",  Br: 1.29, HcJ: 1590, BH: 318, aBr: -0.115, aHcJ: -0.55, Tmax: 150, mur: 1.05 },
  "N45SH":      { fam: "NdFeB",  Br: 1.33, HcJ: 1590, BH: 342, aBr: -0.115, aHcJ: -0.55, Tmax: 150, mur: 1.05 },
  "N48SH":      { fam: "NdFeB",  Br: 1.37, HcJ: 1590, BH: 366, aBr: -0.115, aHcJ: -0.55, Tmax: 150, mur: 1.05 },
  "N35UH":      { fam: "NdFeB",  Br: 1.18, HcJ: 1990, BH: 270, aBr: -0.11,  aHcJ: -0.55, Tmax: 180, mur: 1.05 },
  "N38EH":      { fam: "NdFeB",  Br: 1.22, HcJ: 2390, BH: 287, aBr: -0.11,  aHcJ: -0.50, Tmax: 200, mur: 1.05 },
  "SmCo5-20":   { fam: "SmCo",   Br: 0.90, HcJ: 1990, BH: 160, aBr: -0.045, aHcJ: -0.30, Tmax: 250, mur: 1.05 },
  "Sm2Co17-26": { fam: "SmCo",   Br: 1.04, HcJ: 1990, BH: 208, aBr: -0.035, aHcJ: -0.25, Tmax: 300, mur: 1.05 },
  "Sm2Co17-32": { fam: "SmCo",   Br: 1.15, HcJ: 1590, BH: 255, aBr: -0.035, aHcJ: -0.25, Tmax: 300, mur: 1.05 },
  "Ferrite C8": { fam: "Ferrite", Br: 0.39, HcJ: 260, BH: 30,  aBr: -0.18,  aHcJ: +0.30, Tmax: 250, mur: 1.10 },
};

/* Soft-magnetic core materials. Bmax = practical design ceiling [T],
   kst = stacking factor, w = specific loss @1.5T/60Hz [W/kg], rho [kg/m³]. */
/* ef = eddy fraction of the 1.5 T / 60 Hz specific loss: sets how loss scales with frequency
   (hysteresis ∝ f, eddy ∝ f²). Thin-gauge CoFe low, solid steels eddy-dominated. */
const STEELS = {
  "M19 (29 ga)":        { Bmax: 1.80, kst: 0.95, w: 2.6, rho: 7650, lam: true,  muri: 4000, bsat: 2.05, ef: 0.30 },
  "M15 (29 ga)":        { Bmax: 1.75, kst: 0.95, w: 2.2, rho: 7650, lam: true,  muri: 4000, bsat: 2.00, ef: 0.28 },
  "Hiperco 50":         { Bmax: 2.25, kst: 0.94, w: 2.1, rho: 8120, lam: true,  muri: 12000, bsat: 2.35, ef: 0.15 },
  "1018 steel (solid)": { Bmax: 2.00, kst: 1.00, w: 14,  rho: 7870, lam: false, muri: 800,  bsat: 2.05, ef: 0.85 },
  "416 SS (solid)":     { Bmax: 1.55, kst: 1.00, w: 18,  rho: 7750, lam: false, muri: 400,  bsat: 1.75, ef: 0.80 },
  "15-5 PH (H1025)":    { Bmax: 1.25, kst: 1.00, w: 22,  rho: 7780, lam: false, muri: 120,  bsat: 1.45, ef: 0.80 },
  "Non-magnetic":       { Bmax: 0.05, kst: 1.00, w: 0,   rho: 7900, lam: false, muri: 1,    bsat: 0.05, ef: 0 },
};

/* Froelich BH: H(B) with initial relative permeability muri and saturation asymptote bsat */
const Hof = (B, m) => {
  const a = m.bsat || 2, b = a / ((m.muri || 1000) * 4e-7 * Math.PI);
  return B >= a * 0.98 ? b * a * 50 : (b * B) / (a - B);
};

/* Squirrel-cage conductor resistivities @20 °C [Ω·m] */
/* Friction lining materials for spring-applied brakes: catalog-typical dry values.
   mus/mud = static/dynamic friction, pMax = allowable lining pressure (MPa), Tmax = lining limit (°C). */
const BRAKE_MATS = {
  "Organic (resin-bonded)":  { mus: 0.40, mud: 0.32, pMax: 1.0, Tmax: 250 },
  "Woven non-asbestos":      { mus: 0.45, mud: 0.38, pMax: 0.7, Tmax: 200 },
  "Sintered bronze":         { mus: 0.32, mud: 0.28, pMax: 2.0, Tmax: 400 },
  "Sintered iron":           { mus: 0.38, mud: 0.32, pMax: 2.5, Tmax: 550 },
  "Carbon\u2013carbon":       { mus: 0.28, mud: 0.25, pMax: 3.0, Tmax: 600 },
  "Custom \u00b5":            null,
};
const BARS = { "Cast aluminum": 3.2e-8, "Copper": 1.72e-8 };

/* Gear material / hardness condition → allowable bending stress (MPa) for the Lewis tooth-yield cap.
   Values follow AGMA 2001-D04 sat (Grade 1 unless noted) and classic Lewis allowables for the
   non-ferrous/plastic entries; hardness condition is part of the identity because sat is
   hardness-driven for through-hardened steels (≈ 0.533·HB + 88 MPa, Grade 1). */
const GEAR_MAT_DEF = "Carburized 8620/9310 (58\u201362 HRC)";
const GEAR_MATS = {
  "Carburized 8620/9310 (58\u201362 HRC)":      { sig: 380, note: "AGMA Gr.1 case-carburized \u2014 the default the tool has always assumed" },
  "Carburized 9310 VAR aero Gr.2 (58\u201364 HRC)": { sig: 450, note: "vacuum-arc-remelt aero quality, certified case depth/cleanliness" },
  "Induction-hardened 4340 (\u224850 HRC)":     { sig: 345, note: "tooth-flank hardened, tougher core" },
  "Nitrided 4140 / Nitralloy (50 HRC case)": { sig: 330, note: "thin hard case \u2014 fine pitches; no distortion from quench" },
  "Custom 455 SS aged H950 (\u224848 HRC)":    { sig: 330, note: "premium age-hardened martensitic SS \u2014 above 17-4's strength class with full corrosion resistance" },
  "17-4 PH H900 (44 HRC)":                    { sig: 300, note: "corrosion-resistant precipitation-hardened SS" },
  "Through-hardened 4140/4340 (38\u201342 HRC)": { sig: 285, note: "quench & temper, no case" },
  "416 SS hardened (\u224840 HRC)":            { sig: 270, note: "free-machining martensitic SS" },
  "Sintered PM steel FL-4405 HT":             { sig: 240, note: "typical MIM/PM miniature-gearhead planet stock" },
  "303/304 SS annealed":                      { sig: 165, note: "corrosion-driven choice \u2014 soft; expect the Lewis cap to govern" },
  "1018 / mild steel normalized":             { sig: 150, note: "unhardened prototype stock" },
  "Bronze / brass (SAE 660)":                 { sig: 80,  note: "wormwheel & bushing-grade non-ferrous" },
  "Aluminum 7075-T6":                         { sig: 65,  note: "light-duty only \u2014 poor fatigue in gear teeth" },
  "Acetal (Delrin)":                          { sig: 34,  note: "quiet light-duty plastic; derate further above 60 \u00b0C" },
};

/* Curated starting points. Envelope sizes follow NEMA-frame conventions
   (17 = 1.7", 23 = 2.3", 34 = 3.4" mounting face); buses are MIL-STD-704
   style 28 VDC and 270 VDC. Each is a complete, self-consistent design that
   passes the tool's own fill and saturation checks — tune from there. */
const PRESETS = {
  'Micro 1" · 28 V · ~30 krpm': {
    slots: 9, poles: 6, statorOD: 25.4, statorID: 14, rotorOD: 13, yoke: 2.2, toothW: 2.0,
    slotOpen: 1.2, tipH: 0.6, stackL: 20, liner: 0.15, shaftD: 4,
    pattern: "concentrated", layers: 2, span: 0, turns: 7, awg: 24, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 1.5, poleArc: 85, Top: 60,
    Vdc: 28, Imax: 5, freq: 1000, J: 8, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'NEMA 17 · 28 V · ~6 krpm': {
    slots: 12, poles: 14, statorOD: 42, statorID: 23, rotorOD: 22, yoke: 3.5, toothW: 3.0,
    slotOpen: 1.6, tipH: 0.8, stackL: 30, liner: 0.2, shaftD: 5,
    pattern: "concentrated", layers: 2, span: 0, turns: 9, awg: 22, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2, poleArc: 85, Top: 60,
    Vdc: 28, Imax: 6, freq: 400, J: 7, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'NEMA 23 · 28 V · ~3 krpm torquer': {
    slots: 12, poles: 10, statorOD: 57, statorID: 32, rotorOD: 31, yoke: 4.5, toothW: 4.2,
    slotOpen: 2.0, tipH: 1.0, stackL: 45, liner: 0.25, shaftD: 8,
    pattern: "concentrated", layers: 2, span: 0, turns: 8, awg: 19, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2.5, poleArc: 85, Top: 60,
    Vdc: 28, Imax: 10, freq: 300, J: 6.5, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'NEMA 34 · 270 V · ~10 krpm': {
    slots: 36, poles: 8, statorOD: 86, statorID: 52, rotorOD: 51, yoke: 6.5, toothW: 3.0,
    slotOpen: 2.0, tipH: 1.0, stackL: 60, liner: 0.25, shaftD: 10,
    pattern: "lap", layers: 2, span: 0, turns: 3, awg: 18, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 3, poleArc: 85, Top: 80,
    Vdc: 270, Imax: 10, freq: 500, J: 6, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  '4" direct-drive · 270 V · ~2.5 krpm': {
    slots: 36, poles: 12, statorOD: 102, statorID: 64, rotorOD: 63, yoke: 5.5, toothW: 3.7,
    slotOpen: 2.2, tipH: 1.2, stackL: 50, liner: 0.25, shaftD: 12,
    pattern: "lap", layers: 2, span: 0, turns: 12, awg: 21, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 3.5, poleArc: 85, Top: 80,
    Vdc: 270, Imax: 8, freq: 200, J: 6, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'NEMA 23 · 28 V · trapezoidal 6-step': {
    slots: 12, poles: 4, statorOD: 57, statorID: 30, rotorOD: 29, yoke: 7.6, toothW: 5.0,
    slotOpen: 2.0, tipH: 1.0, stackL: 45, liner: 0.25, slotR: 0.5, shaftD: 8,
    pattern: "lap", layers: 2, span: 0, turns: 8, awg: 22, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "six", sense: "hall", mag: "N45SH", magT: 2, poleArc: 95, Top: 60,
    Vdc: 28, Imax: 6, freq: 200, J: 6, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", loadMode: "J",
  },
  'NEMA 34 · 28 V · sinusoidal FOC': {
    slots: 12, poles: 10, statorOD: 86, statorID: 52, rotorOD: 51, yoke: 5.6, toothW: 9.2,
    slotOpen: 2.2, tipH: 1.0, stackL: 60, liner: 0.25, slotR: 0.5, shaftD: 12,
    pattern: "concentrated", layers: 2, span: 0, turns: 4, awg: 13, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", sense: "hall", mag: "N45SH", magT: 3, poleArc: 85, Top: 60,
    Vdc: 28, Imax: 25, freq: 250, J: 6, seq: "ABC", endMode: "auto",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", loadMode: "J",
  },
  'ACIM 115 V · 400 Hz · 4-pole aero': {
    slots: 24, poles: 4, statorOD: 86, statorID: 54, rotorOD: 53.4, yoke: 10.4, toothW: 3.5,
    slotOpen: 1.8, tipH: 1.0, stackL: 50, liner: 0.2, slotR: 0.3, shaftD: 10,
    pattern: "lap", layers: 2, span: 0, turns: 5, awg: 21, strands: 1, paths: 1, conn: "wye",
    motorType: "induction", Vll: 115, freq: 400, Bg: 0.7, J: 6, seq: "ABC", endMode: "auto",
    rotorBars: 19, barA: 25, ringA: 50, barMat: "Cast aluminum", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "M19 (29 ga)", Rext: 0,
  },
  'NEMA 17 · 1.8° hybrid · bipolar': {
    slots: 8, poles: 2, statorOD: 41, statorID: 26, rotorOD: 25.9, yoke: 2.6, toothW: 3.6,
    slotOpen: 2, tipH: 0.8, stackL: 33, liner: 0.2, slotR: 0.3, shaftD: 5,
    pattern: "concentrated", layers: 2, span: 0, turns: 36, awg: 26, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "hybrid", stpNr: 50, stpWire: "bip-ser", stpOn: 2,
    mag: "N35", magT: 3, poleArc: 85, Top: 60, Vdc: 24, Imax: 1.5, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'NEMA 23 · 1.8° hybrid · unipolar': {
    slots: 8, poles: 2, statorOD: 55, statorID: 39, rotorOD: 38.9, yoke: 3.6, toothW: 5.5,
    slotOpen: 2.2, tipH: 1, stackL: 45, liner: 0.25, slotR: 0.3, shaftD: 6.35,
    pattern: "concentrated", layers: 2, span: 0, turns: 31, awg: 25, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "hybrid", stpNr: 50, stpWire: "uni", stpOn: 2,
    mag: "N35", magT: 4, poleArc: 85, Top: 60, Vdc: 24, Imax: 3, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'PM stepper 15° · 12 V · 12-pole': {
    slots: 8, poles: 2, statorOD: 35, statorID: 22, rotorOD: 20.8, yoke: 1.7, toothW: 2.5,
    slotOpen: 1.5, tipH: 0.7, stackL: 15, liner: 0.15, slotR: 0.3, shaftD: 3,
    pattern: "concentrated", layers: 2, span: 0, turns: 112, awg: 32, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "pm", stpPP: 6, stpWire: "bip-ser", stpOn: 2,
    mag: "Ferrite C8", magT: 2.5, poleArc: 85, Top: 60, Vdc: 12, Imax: 0.3, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'PM stepper 30° · 12 V · 6-pole': {
    slots: 4, poles: 2, statorOD: 30, statorID: 19, rotorOD: 17.8, yoke: 2.5, toothW: 4,
    slotOpen: 1.5, tipH: 0.7, stackL: 12, liner: 0.15, slotR: 0.3, shaftD: 3,
    pattern: "concentrated", layers: 2, span: 0, turns: 220, awg: 36, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "pm", stpPP: 3, stpWire: "uni", stpOn: 2,
    mag: "Ferrite C8", magT: 2.2, poleArc: 85, Top: 60, Vdc: 12, Imax: 0.25, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // v59.5: NEMA 23 frame with a 100-tooth rotor (0.9° full step). Same 23HM-class frame and
  // winding as the 1.8° NEMA 23 above; tooth pitch π·38.9/100 = 1.22 mm stays above the tool's
  // ~1.2 mm manufacturability floor (a 0.9° NEMA 17 rotor does not — pitch 0.81 mm).
  'NEMA 23 · 0.9° hybrid · bipolar': {
    slots: 8, poles: 2, statorOD: 55, statorID: 39, rotorOD: 38.9, yoke: 3.6, toothW: 5.5,
    slotOpen: 2.2, tipH: 1, stackL: 45, liner: 0.25, slotR: 0.3, shaftD: 6.35,
    pattern: "concentrated", layers: 2, span: 0, turns: 20, awg: 23, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "hybrid", stpNr: 100, stpWire: "bip-ser", stpOn: 2,
    mag: "N35", magT: 3, poleArc: 85, Top: 60, Vdc: 24, Imax: 2.8, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // v59.5: 34-frame (86 mm) hybrid, 34HS-class proportions scaled from the NEMA 23 preset;
  // computes 6.4 N·m holding, inside the 4.5–8.5 N·m catalog band for 65 mm stacks.
  'NEMA 34 · 1.8° hybrid · bipolar': {
    slots: 8, poles: 2, statorOD: 86, statorID: 61, rotorOD: 60.9, yoke: 5.5, toothW: 8.5,
    slotOpen: 2.8, tipH: 1.4, stackL: 65, liner: 0.3, slotR: 0.3, shaftD: 14,
    pattern: "concentrated", layers: 2, span: 0, turns: 22, awg: 20, strands: 1, paths: 1, conn: "wye",
    motorType: "stepper", stpKind: "hybrid", stpNr: 50, stpWire: "bip-ser", stpOn: 2,
    mag: "N35", magT: 4, poleArc: 85, Top: 60, Vdc: 48, Imax: 6, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'Brake 28 V · 38 mm · aero holding': {
    slots: 12, poles: 4, statorOD: 38, statorID: 30, rotorOD: 24, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 18, liner: 0.2, slotR: 0, shaftD: 8,
    pattern: "concentrated", layers: 2, span: 0, turns: 900, awg: 34, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 28, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 16, brkArm: 4, brkStroke: 0.2, brkSprFree: 18.9, brkSprEng: 14.2, brkK: 15, brkSpringN: 4,
    brkPktID: 33, brkBossOD: 22, brkPktD: 14, brkBobID: 24.2, brkBobOD: 32, brkBobL: 11.5,
    brkRo: 17, brkRi: 11, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },
  'Brake 24 V · 60 mm · spring-applied': {
    slots: 12, poles: 4, statorOD: 60, statorID: 40, rotorOD: 30, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 25, liner: 0.2, slotR: 0, shaftD: 10,
    pattern: "concentrated", layers: 2, span: 0, turns: 650, awg: 29, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 24, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 26, brkArm: 6, brkStroke: 0.3, brkSprFree: 23.3, brkSprEng: 18.3, brkK: 40, brkSpringN: 6,
    brkPktID: 50, brkBossOD: 34, brkPktD: 18, brkBobID: 36.2, brkBobOD: 49, brkBobL: 15,
    brkRo: 27, brkRi: 18, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },  'Brake 24 V · 90 mm · 10 N·m class': {
    slots: 12, poles: 4, statorOD: 90, statorID: 70, rotorOD: 50, yoke: 6, toothW: 4, slotOpen: 2,
    tipH: 1, stackL: 32, liner: 0.2, slotR: 0, shaftD: 15,
    pattern: "concentrated", layers: 2, span: 0, turns: 450, awg: 26, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 24, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 34, brkArm: 9, brkStroke: 0.4, brkSprFree: 30.7, brkSprEng: 24.4, brkK: 60, brkSpringN: 6,
    brkPktID: 74, brkBossOD: 54, brkPktD: 24, brkBobID: 56.2, brkBobOD: 73, brkBobL: 21.5,
    brkRo: 40, brkRi: 26, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },
  'Brake 12 V · 40 mm · light duty': {
    slots: 12, poles: 4, statorOD: 40, statorID: 32, rotorOD: 24, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 16, liner: 0.2, slotR: 0, shaftD: 6,
    pattern: "concentrated", layers: 2, span: 0, turns: 420, awg: 30, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 12, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 13, brkArm: 4, brkStroke: 0.25, brkSprFree: 17.0, brkSprEng: 13.25, brkK: 20, brkSpringN: 4,
    brkPktID: 34, brkBossOD: 22, brkPktD: 13, brkBobID: 24.2, brkBobOD: 33, brkBobL: 10.5,
    brkRo: 18, brkRi: 12, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },
  // v59.5: the 60 mm magnet body rewound for a 270 V aerospace bus — fine wire (AWG 39) for
  // release authority (margin ∝ V·wire area), a 50% economizer holds the released coil at
  // ~65 °C where full voltage would cook it (hold power ∝ V²·area/turns). Same springs,
  // lining, and Thold as the 24 V unit; brk-preset-gate carries its bands.
  'Brake 270 V · 60 mm · aero bus': {
    slots: 12, poles: 4, statorOD: 60, statorID: 40, rotorOD: 30, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 25, liner: 0.2, slotR: 0, shaftD: 10,
    pattern: "concentrated", layers: 2, span: 0, turns: 4300, awg: 39, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 270, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0, brkEco: 50,
    brkBore: 26, brkArm: 6, brkStroke: 0.3, brkSprFree: 23.3, brkSprEng: 18.3, brkK: 40, brkSpringN: 6,
    brkPktID: 50, brkBossOD: 34, brkPktD: 18, brkBobID: 36.2, brkBobOD: 49, brkBobL: 15,
    brkRo: 27, brkRi: 18, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },

  'LATM 1.5" · 28 V · SmCo 4-pole · 45° toggle': {
    slots: 12, poles: 4, statorOD: 38, statorID: 28, rotorOD: 22, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 25, liner: 0.2, slotR: 0, shaftD: 5,
    pattern: "lap", layers: 2, span: 0, turns: 207, awg: 32, strands: 1, paths: 1, conn: "wye",
    motorType: "latm", mag: "Sm2Co17-26", magT: 3, poleArc: 85, Top: 70,
    latmSect: 4, latmSpan: 60, latmWind: 1.5, latmTravel: 45,
    Vdc: 28, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
  'LATM 1" · 28 V · SmCo 2-pole · 90° toggle': {
    slots: 12, poles: 2, statorOD: 25.4, statorID: 18, rotorOD: 13, yoke: 3, toothW: 2, slotOpen: 1,
    tipH: 0.6, stackL: 20, liner: 0.15, slotR: 0, shaftD: 3,
    pattern: "lap", layers: 2, span: 0, turns: 457, awg: 36, strands: 1, paths: 1, conn: "wye",
    motorType: "latm", mag: "Sm2Co17-26", magT: 2.2, poleArc: 85, Top: 70,
    latmSect: 2, latmSpan: 120, latmWind: 1.2, latmTravel: 90,
    Vdc: 28, Imax: 0.5, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
  'LATM 2.5" · 28 V · NdFeB 4-pole · 60° travel': {
    slots: 12, poles: 4, statorOD: 63.5, statorID: 48, rotorOD: 40, yoke: 7, toothW: 4, slotOpen: 2,
    tipH: 1, stackL: 30, liner: 0.25, slotR: 0, shaftD: 8,
    pattern: "lap", layers: 2, span: 0, turns: 210, awg: 28, strands: 1, paths: 1, conn: "wye",
    motorType: "latm", mag: "N45SH", magT: 3.5, poleArc: 85, Top: 80,
    latmSect: 4, latmSpan: 60, latmWind: 2, latmTravel: 60,
    Vdc: 28, Imax: 2, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
  // v59.5: sub-1" toggle LATM, scaled from the 1" 2-pole with the same slotless architecture.
  // 30° travel sits far inside the ±90° reversal; held-on winding runs ~103 °C at the 0.25 A
  // limit (latm-preset-gate invariants: Tstop/Tpk 98%, coil fits at 380/708 turns capacity).
  'LATM 0.75" · 28 V · SmCo 2-pole · 30° toggle': {
    slots: 12, poles: 2, statorOD: 19, statorID: 13.5, rotorOD: 9.5, yoke: 2.2, toothW: 1.5,
    slotOpen: 1, tipH: 0.5, stackL: 15, liner: 0.12, slotR: 0, shaftD: 2,
    pattern: "lap", layers: 2, span: 0, turns: 380, awg: 37, strands: 1, paths: 1, conn: "wye",
    motorType: "latm", mag: "Sm2Co17-26", magT: 1.8, poleArc: 85, Top: 70,
    latmSect: 2, latmSpan: 120, latmWind: 1.2, latmTravel: 30,
    Vdc: 28, Imax: 0.25, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
  'Brushed 12 V · 2-pole ferrite · ~7 krpm': {
    slots: 5, poles: 2, statorOD: 42, statorID: 26, rotorOD: 25, yoke: 3.6, toothW: 3.0,
    slotOpen: 1.8, tipH: 0.8, stackL: 30, liner: 0.15, slotR: 0.3, shaftD: 3.2,
    pattern: "lap", layers: 2, span: 2, turns: 27, awg: 24, strands: 1, paths: 1, conn: "wye",
    motorType: "brushed", mag: "Ferrite C8", magT: 4.5, poleArc: 85, Top: 60, brushV: 1.2,
    Vdc: 12, Imax: 10, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'Brushed 18 V · 2-pole ferrite · ~5.5 krpm': {
    slots: 5, poles: 2, statorOD: 50, statorID: 31, rotorOD: 30, yoke: 4.2, toothW: 3.5,
    slotOpen: 2.0, tipH: 0.9, stackL: 38, liner: 0.2, slotR: 0.3, shaftD: 5,
    pattern: "lap", layers: 2, span: 2, turns: 34, awg: 23, strands: 1, paths: 1, conn: "wye",
    motorType: "brushed", mag: "Ferrite C8", magT: 5.5, poleArc: 85, Top: 60, brushV: 1.4,
    Vdc: 18, Imax: 20, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'Brushed 24 V · 4-pole NdFeB · ~4.5 krpm': {
    slots: 5, poles: 4, statorOD: 45, statorID: 28.8, rotorOD: 28, yoke: 5.9, toothW: 9.5,
    slotOpen: 1.8, tipH: 0.8, stackL: 35, liner: 0.15, slotR: 0.3, shaftD: 5,
    pattern: "lap", layers: 2, span: 1, turns: 45, awg: 30, strands: 1, paths: 1, conn: "wye",
    motorType: "brushed", mag: "N35", magT: 2.5, poleArc: 85, Top: 60, brushV: 1.4,
    Vdc: 24, Imax: 6, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'Brushed 1.6" · 28 V · SmCo 4-pole': {
    slots: 5, poles: 4, statorOD: 40, statorID: 24.8, rotorOD: 24, yoke: 4.6, toothW: 7.6,
    slotOpen: 1.8, tipH: 0.8, stackL: 30, liner: 0.15, slotR: 0.3, shaftD: 4,
    pattern: "lap", layers: 2, span: 1, turns: 24, awg: 28, strands: 1, paths: 1, conn: "wye",
    motorType: "brushed", mag: "Sm2Co17-26", magT: 3, poleArc: 85, Top: 80, brushV: 1.4,
    Vdc: 28, Imax: 15, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  'ACIM 460 V · 60 Hz · 6-pole industrial': {
    slots: 36, poles: 6, statorOD: 150, statorID: 95, rotorOD: 94.4, yoke: 13.9, toothW: 4.65,
    slotOpen: 2.5, tipH: 1.5, stackL: 90, liner: 0.25, slotR: 0.5, shaftD: 24,
    pattern: "lap", layers: 2, span: 0, turns: 37, awg: 24, strands: 1, paths: 1, conn: "wye",
    motorType: "induction", Vll: 460, freq: 60, Bg: 0.8, J: 5, seq: "ABC", endMode: "auto",
    rotorBars: 29, barA: 40, ringA: 80, barMat: "Cast aluminum", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "M19 (29 ga)", Rext: 0,
  },
  // v59.5: 2-pole coverage (both prior ACIMs are 4/6-pole). 100 mm frame carries the deep
  // yoke a 2-pole flux path needs while keeping slot area insertable; 19 bars vs 24 slots
  // clears every cage/slot interaction check (Nb≠Ns, |Ns−Nb| ∉ {p, 2p}, Nb ≫ poles).
  'ACIM 230 V · 60 Hz · 2-pole blower': {
    slots: 24, poles: 2, statorOD: 100, statorID: 48, rotorOD: 47.4, yoke: 13.5, toothW: 3.2,
    slotOpen: 2, tipH: 1, stackL: 60, liner: 0.25, slotR: 0.5, shaftD: 16,
    pattern: "lap", layers: 2, span: 0, turns: 26, awg: 23, strands: 1, paths: 1, conn: "wye",
    motorType: "induction", Vll: 230, freq: 60, Bg: 0.68, J: 5, seq: "ABC", endMode: "auto",
    rotorBars: 19, barA: 45, ringA: 90, barMat: "Cast aluminum", loadMode: "J",
    statorMat: "M19 (29 ga)", rotorMat: "M19 (29 ga)", Rext: 0,
  },
  '4" high-temp · 270 V · Hiperco/SmCo': {
    slots: 36, poles: 12, statorOD: 102, statorID: 64, rotorOD: 63, yoke: 4.5, toothW: 3.0,
    slotOpen: 2.2, tipH: 1.2, stackL: 50, liner: 0.3, shaftD: 12,
    pattern: "lap", layers: 2, span: 0, turns: 12, awg: 21, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "Sm2Co17-32", magT: 4, poleArc: 85, Top: 200,
    Vdc: 270, Imax: 8, freq: 200, J: 5, seq: "ABC", endMode: "auto",
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
  // kw 0.945, GCD=2 so no unbalanced magnetic pull; cogging LCM 144 (2x a 9s8p). Best general-purpose FSCW.
  '2" · 18s16p · 28 V · low-cogging FSCW': {
    slots: 18, poles: 16, statorOD: 50.8, statorID: 30, rotorOD: 29, yoke: 3.6,
    toothW: 2.6, slotOpen: 1.5, tipH: 0.8, stackL: 25, liner: 0.2, shaftD: 6,
    pattern: "concentrated", layers: 2, span: 0, turns: 11, awg: 22, strands: 1,
    paths: 1, conn: "wye", motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2,
    poleArc: 82, Top: 60, Vdc: 28, Imax: 8, freq: 600, J: 7,
    seq: "ABC", endMode: "auto", statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // The most-published compact FSCW (q=0.375, kw 0.945). GCD=1 -> unbalanced magnetic pull; watch bearing life.
  '1.6" · 9s8p · 28 V · high-kw compact': {
    slots: 9, poles: 8, statorOD: 40, statorID: 23, rotorOD: 22, yoke: 3.2,
    toothW: 3.4, slotOpen: 1.5, tipH: 0.7, stackL: 20, liner: 0.2, shaftD: 5,
    pattern: "concentrated", layers: 2, span: 0, turns: 12, awg: 23, strands: 1,
    paths: 1, conn: "wye", motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2,
    poleArc: 82, Top: 60, Vdc: 28, Imax: 7, freq: 600, J: 7,
    seq: "ABC", endMode: "auto", statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // Bench-validated hardware: R L-L 0.480 ohm, L L-L 193 uH measured rotor-out. kw 0.951, cogging LCM 240.
  '1.6" · 15s16p · 28 V · Hiperco (bench-validated)': {
    slots: 15, poles: 16, statorOD: 40.7416, statorID: 23.3426, rotorOD: 22.4028, yoke: 3.8608,
    toothW: 1.651, slotOpen: 1.6, tipH: 0.5334, stackL: 7.112, liner: 0.2032, slotR: 2.159,
    shaftD: 8.0518, pattern: "concentrated", layers: 2, span: 0, turns: 14, awg: 27,
    strands: 2, paths: 1, conn: "wye", motorType: "pm", ctrl: "six", sense: "hall",
    mag: "N45SH", magT: 1.7272, poleArc: 72, Top: 60, Vdc: 20, Imax: 8,
    freq: 400, J: 7, seq: "ACB", endMode: "head", headH: 5.08, statorMat: "Hiperco 50",
    rotorMat: "416 SS (solid)", Tcu: 100,
  },
  // Large-frame FSCW: cogging LCM 264 and no UMP (GCD=2). Good for direct-drive gimbal/actuator.
  '3" · 24s22p · 270 V · low-ripple direct drive': {
    slots: 24, poles: 22, statorOD: 76.2, statorID: 48, rotorOD: 47, yoke: 4.5,
    toothW: 3.4, slotOpen: 1.8, tipH: 0.9, stackL: 35, liner: 0.25, shaftD: 10,
    pattern: "concentrated", layers: 2, span: 0, turns: 22, awg: 23, strands: 1,
    paths: 1, conn: "wye", motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2.5,
    poleArc: 82, Top: 60, Vdc: 270, Imax: 6, freq: 600, J: 6,
    seq: "ABC", endMode: "auto", statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // Distributed lap, short-pitched 5 of 6 slots — the classic chording that cancels 5th/7th EMF harmonics.
  'NEMA 23 · 24s4p · 28 V · chorded 5/6': {
    slots: 24, poles: 4, statorOD: 57, statorID: 32, rotorOD: 31, yoke: 4.5,
    toothW: 2.4, slotOpen: 1.6, tipH: 0.8, stackL: 45, liner: 0.25, shaftD: 8,
    pattern: "lap", layers: 2, span: 5, turns: 7, awg: 21, strands: 1,
    paths: 1, conn: "wye", motorType: "pm", ctrl: "foc", mag: "N45SH", magT: 2.5,
    poleArc: 85, Top: 60, Vdc: 28, Imax: 10, freq: 300, J: 6.5,
    seq: "ABC", endMode: "auto", statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // Bench-validated armature. Turns basis = conductors/slot (shop drawing convention).
  'Brushed 24 V · 12s2p · SmCo (bench-validated)': {
    slots: 12, poles: 2, statorOD: 32.004, statorID: 21.1328, rotorOD: 20.7518, yoke: 3.16484,
    toothW: 1.8542, slotOpen: 0.762, tipH: 0.762, stackL: 31.0134, liner: 0.1778, slotR: 0.4318,
    shaftD: 3.556, pattern: "lap", layers: 2, span: 6, turns: 21, turnBasis: "slot",
    awg: 28.5, strands: 1, paths: 1, conn: "wye", motorType: "brushed", mag: "N45SH",
    magT: 1.2954, poleArc: 64.45, Top: 60, Vdc: 24, Imax: 12, freq: 100,
    J: 6, seq: "ABC", endMode: "auto", headH: 15, brushV: 0.5, statorMat: "M15 (29 ga)",
    rotorMat: "1018 steel (solid)", Tcu: 25,
  },
  // Odd-slot 9-segment armature: lower cogging and smoother commutation than the 5-slot economy builds.
  'Brushed 24 V · 9s2p · smooth commutation': {
    slots: 9, poles: 2, statorOD: 45, statorID: 28, rotorOD: 27, yoke: 3.4,
    toothW: 3.6, slotOpen: 1.2, tipH: 0.8, stackL: 32, liner: 0.2, shaftD: 5,
    pattern: "lap", layers: 2, span: 4, turns: 30, turnBasis: "slot", awg: 25,
    strands: 1, paths: 1, conn: "wye", motorType: "brushed", mag: "N45SH", magT: 2,
    poleArc: 80, Top: 60, Vdc: 24, Imax: 8, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", brushV: 1.0, statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
  // Wave winding: A2 = 2 paths regardless of pole count -> higher voltage, lower current than lap.
  'Brushed 48 V · 13s4p wave · high-voltage': {
    slots: 13, poles: 4, statorOD: 63.5, statorID: 40, rotorOD: 39, yoke: 5.0,
    toothW: 3.0, slotOpen: 1.4, tipH: 0.9, stackL: 40, liner: 0.25, shaftD: 8,
    pattern: "wave", layers: 2, span: 0, turns: 26, turnBasis: "slot", awg: 24,
    strands: 1, paths: 1, conn: "wye", motorType: "brushed", mag: "N45SH", magT: 2.5,
    poleArc: 80, Top: 60, Vdc: 48, Imax: 8, freq: 100, J: 6,
    seq: "ABC", endMode: "auto", brushV: 1.5, statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)",
  },
};

const awgBareDia = (awg) => 0.127 * Math.pow(92, (36 - awg) / 39); // mm
const INS_BUILD = { // enamel diameter growth approximations, mm
  "Single": (d) => d * 1.032 + 0.018,
  "Heavy":  (d) => d * 1.055 + 0.033,
  "Triple": (d) => d * 1.078 + 0.048,
};
const awgInsDia = (d, b) => (INS_BUILD[b] || INS_BUILD["Heavy"])(d);

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
  const Qv = agmaQ9 === "Q7" ? 7 : agmaQ9 === "Q11" || agmaQ9 === "Q13" ? 11 : 9; // v60.6: Q13 is BACK in the picker as a real backlash grade (AGMA_J differs) — only this Kv form flattens above Q11, and that flattening is disclosed in the gear note
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
    // v60.5: only losses DOWNSTREAM of this tooth reduce the output torque its stress
    // allows — multiplying by the whole train eta charged upstream churn to a tooth that
    // never carries it (conservative, but wrong)
    const effDown = stages.slice(i9).reduce((a9, s8) => a9 * s8.ef, 1);
    const ToutCap = TinAllow * dsRatio * effDown;
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
  // v60.5: efficiency priority is (1) the user's override, (2) the synthesized train's
  // detailed mesh+churn efficiency (cfg.effDet, 0..1, passed after designGearTrain runs),
  // (3) the catalog per-stage table as a FALLBACK ONLY. The app previously mapped the
  // torque curve with the catalog table while the gear card displayed the detailed value —
  // two efficiencies for one gearhead on the same page.
  const ETA_STAGE = { Planetary: 0.90, Spur: 0.93, Harmonic: 0.80 };
  const etaStage = ETA_STAGE[type9];
  const etaDet = Number.isFinite(cfg.effDet) && cfg.effDet > 0 && cfg.effDet <= 1 ? cfg.effDet : null;
  const eta = cfg.effOv > 0 ? Math.min(cfg.effOv, 100) / 100 : (etaDet !== null ? etaDet : Math.pow(etaStage, st));
  const etaSrc = cfg.effOv > 0 ? "override" : (etaDet !== null ? "synthesized" : "catalog");
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
  // v60.6 (Grok): motor amps for an output torque now invert the motor's own saturation
  // law — the linear form silently under-read amps on a saturated PM source
  const iAtOut = (Tout) => {
    const Tm = Math.max(Tout / (N * eta), 0);
    return mr.satCurve && mr.satCurve.length && mr.Imax > 0 ? satInvertI({ Imax: mr.Imax }, mr, Tm) : Tm / mr.Kt;
  };
  const hold = br && br.brake && Number.isFinite(br.brake.Thold) ? br.brake.Thold * N : null; // static: ratio only (friction aids holding)
  if (br && br.err && br.err.length) w.push("The brake design in its tab has errors — holding torque not composed.");
  const etaBack = Math.max(2 - 1 / eta, 0);                          // first-order back-drive efficiency
  const selfLock = etaBack <= 0.02 || type9 === "Harmonic" && N >= 80;
  return { N, st, spr, eta, etaStage, etaSrc, type: type9, brg: cfg.brg || "radial", curve,
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
    // v60.5 (Codex): finiteness alone let turns = -9 through to a NEGATIVE resistance and
    // fill with zero errors. Physical quantities must be positive.
    const pos9 = ["statorOD", "stackL", "turns", "awg", "strands", "paths"]
      .concat(brkE ? [] : ["statorID", "rotorOD"])
      .concat(latmE || brkE ? [] : ["toothW", "yoke", "tipH", "slotOpen"]); // v60.6 (Grok): toothW=0 was a legal no-tooth machine
    const npos = pos9.filter((k9) => Number.isFinite(p[k9]) && p[k9] <= 0);
    if (npos.length) err.push("Non-positive input: " + npos.join(", ") + " — a machine cannot be built from zero or negative " + (npos.length > 1 ? "values" : npos[0]) + ".");
    if (Number.isFinite(p.awg) && (p.awg < 4 || p.awg > 46)) err.push("Wire gauge " + p.awg + " is outside the AWG 4-46 wire table.");
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
  let Iph = p.loadMode === "I" ? Math.max(p.Irate, 0) : Math.max(p.J, 0) * aBare * p.strands * pathsEff; // rms (brushed: armature terminal current; J clamped ≥ 0 like Irate)
  const Iph9J = Iph;                                     // the winding-J rating, kept for the ACIM dominance check (v60.6)
  let Jimp = Iph / (aBare * p.strands * pathsEff); // implied copper current density, A/mm² (ACIM re-derives at the circuit current below)
  let IlineOut = p.conn === "delta" ? Iph * Math.sqrt(3) : Iph;
  const Vph = p.conn === "wye" ? p.Vll / Math.sqrt(3) : p.Vll;
  const Istall = Rphase > 0 ? Vph / Rphase : 0;

  // ---- rotor magnet circuit (BLDC/PMSM) ----
  const mag = MAGNETS[p.mag] || MAGNETS["N42"];
  const dT = p.Top - 20;
  // v60.8: brScale is the tolerance-corner hook — a unitless Br multiplier (production
  // magnet lots run ±3-5%) that flows through the ENTIRE circuit (leakage, saturation,
  // Kt, demag) instead of a bolt-on percentage at the end. Default 1.
  const BrT = mag.Br * (Number.isFinite(p.brScale) && p.brScale > 0 ? p.brScale : 1) * (1 + (mag.aBr / 100) * dT);
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
  let BgEff = p.Bg, BgAvg = 0, B1 = 0, geSat = 0, ksat = 1, satAux = null, klOut = null;
  if (brushedM) {
    // housing-mounted magnet ring, same leakage/Carter first-order circuit as the PM
    // branch. Leakage stays the fixed disclosed 0.9 — the 2-D solver refuses brushed
    // (inside-out) topology, so there is no field referee to inform a better value.
    kcGap = carterK(tauS, airgap + p.magT / mag.mur, p.slotOpen);
    klOut = 0.9;
    BgAvg = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * kcGap * airgap) : 0;
    // v60.7: brushed gets the SAME nonlinear-steel iteration the PM branch has had since
    // v60 — armature tooth + armature core + housing-wall MMF drops fold back as an
    // equivalent added gap (Froelich Hof). The linear formula silently over-promised Bg
    // on saturated armatures; the PM/brushed asymmetry was a known first-order lie.
    if (BgAvg > 0) {
      const mu0B = 4e-7 * Math.PI;
      const Bg0B = BgAvg;
      const ltB = Math.max(hs + p.tipH, 0.5) / 1000;                 // armature tooth radial path
      const lysB = tauP / 2 / 1000;                                  // armature core path per pole
      // armature core section: on a 2-pole machine the return flux crosses the CENTER
      // disc, and the (magnetic steel) shaft carries its share of that section — core
      // depth alone chokes the model to a Bg no bench motor shows. Shaft contribution
      // scales as 2/poles (full radius for 2-pole, fading as flux stays near the rim).
      const yokeB = p.yoke + ((2 / poles) * p.shaftD) / 2;
      const hyrB = Math.max((p.statorOD - p.statorID) / 2 - p.magT, 0.5); // housing wall behind magnets
      const lyrB = (Math.PI * p.statorID) / poles / 2 / 1000;
      satAux = (Fext) => {
        // converge to tolerance — a fixed 14 damped steps under-relaxes deep collapses
        // (a choked housing can pull Bg 50%+) and left satOfI ratios > 1 from unequal
        // truncation between the Fext = 0 and loaded evaluations
        let Bg2 = Bg0B;
        for (let it2 = 0; it2 < 200; it2++) {
          const Bt2 = (Bg2 * tauS) / (p.toothW * stM.kst);
          const By2 = (Bg2 * tauP) / (2 * yokeB * stM.kst);
          const Byh2 = ((Bg2 * (Math.PI * p.statorID)) / poles) / (2 * hyrB * rtM.kst);
          const F = 2 * Hof(Bt2, stM) * ltB + Hof(By2, stM) * lysB + Hof(Byh2, rtM) * lyrB + Fext;
          const geMM = ((mu0B * F) / Math.max(Bg2, 1e-3)) * 1000;
          const BgN = (0.9 * BrT * p.magT) / (p.magT + mag.mur * (kcGap * airgap + geMM));
          const Bg3 = 0.5 * Bg2 + 0.5 * BgN;
          const done = Math.abs(Bg3 - Bg2) < 1e-6;
          Bg2 = Bg3;
          if (Fext === 0) geSat = geMM;
          if (done && it2 > 4) break;
        }
        return Bg2;
      };
      BgAvg = satAux(0);
      ksat = BgAvg / Bg0B;
    }
    B1 = (4 / Math.PI) * BgAvg * Math.sin(((p.poleArc / 100) * Math.PI) / 2);
    BgEff = B1;
    if (p.Top > mag.Tmax) w.push(`Operating temp ${p.Top} °C exceeds ${p.mag} max working temp (${mag.Tmax} °C) — irreversible loss risk.`);
  } else if (p.motorType === "pm") {
    // v60.7: magnet leakage. A geometry-based closed form (edge-arc leakage permeance vs
    // gap permeance, Qu/Lipo-style) was fitted against the in-app 2-D field solve across
    // all 13 PM presets and LOST to the fixed factor (mean |dB1| 20% vs 5%) — the
    // preset-to-preset residuals have heterogeneous causes (slotting on tiny-gap designs,
    // saturation split on big frames), not a single leakage law. The default therefore
    // stays the DISCLOSED 0.9, and the honest refinement is field-informed: the field
    // card derives the kl that reconciles this design's circuit to its own 2-D solve,
    // and adopting it is an explicit user action (p.klOv > 0), cleared by preset loads.
    const kLeak = p.klOv > 0 ? Math.min(Math.max(p.klOv, 0.5), 1.0) : 0.9;
    klOut = kLeak;
    kcGap = carterK(tauS, airgap + p.magT / mag.mur, p.slotOpen);
    BgAvg = airgap > 0
      ? (kLeak * BrT * p.magT) / (p.magT + mag.mur * kcGap * airgap)
      : 0;
    const kLeak9 = kLeak; // captured for the saturation iteration below
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
          // v60.7: uses the SAME leakage factor as the linear solution — the hardcoded
          // 0.9 here would have silently ignored an adopted field-informed kl
          const BgN = (kLeak9 * BrT * p.magT) / (p.magT + mag.mur * (kcGap * airgap + geMM));
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
  // back-iron (brushed: armature core over the shaft — v60.7: the magnetic shaft carries
  // its 2/poles share of the center-disc section, same basis as the saturation loop)
  const By = (Bavg * tauP) / (2 * (brushedM ? p.yoke + ((2 / poles) * p.shaftD) / 2 : p.yoke) * stM.kst);
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
  let Arms = brushedM
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

  // armature-loaded saturation knockdown. v60.5 (Grok HIGH): kIT was computed, displayed
  // ("Sat. knockdown @Imax"), and then NOT applied — peak torque, the T-n curve, the
  // efficiency map, and the drive cycle all stayed linear in Kt while the I-T chart bent
  // with its own ad-hoc quadratic. satOfI(I) is now the single source: electromagnetic
  // torque is Kt·I·satOfI(I) everywhere, and the dense satCurve below is what views and
  // lossesAt interpolate so every screen agrees on amps for a given N·m.
  let kIT = 1, satCurve = null, satOfI = (I9) => 1;
  if ((p.motorType === "pm" || brushedM) && satAux && BgAvg > 0 && p.Imax > 0) {
    // v60.7: brushed joins the saturation law. Its armature-reaction MMF per pole is the
    // peak of the triangular armature wave: F = Z·I_coil/(2·poles) with I_coil = I/paths.
    const FaOf = brushedM
      ? (I9) => (condPerSlot * Ns * Math.max(I9, 0)) / (pathsEff * 2 * poles)
      : (I9) => (1.35 * kw * Nser * Math.SQRT2 * I9) / (poles / 2);
    satOfI = (I9) => Math.min(satAux(FaOf(Math.max(I9, 0))) / BgAvg, 1);
    kIT = satOfI(p.Imax);
    satCurve = Array.from({ length: 25 }, (_, i9) => {
      const f9 = (1.5 * i9) / 24;
      return { f: f9, k: satOfI(f9 * p.Imax) };
    });
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
      const Ipk9 = Math.min(p.Imax, VphAvail / Rhot);
      peakT = Kt * Ipk9 * satOfI(Ipk9);                    // v60.5: saturation applies to torque, not just the card
      TstallW = Kt * (VphAvail / Rhot) * satOfI(VphAvail / Rhot); // winding V/R limit, no drive clamp
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
        const Ieff9 = Math.min(IqMax(wm), p.Imax);
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: Kt * Ieff9 * satOfI(Ieff9) });
      }
      // thermally-rated operating point at Iph (from J)
      const wOp = wOf(Iph);
      const Iop9 = Math.min(Iph, p.Imax);
      op = { n: (wOp * 60) / (2 * Math.PI), T: Kt * Iop9 * satOfI(Iop9) };
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
      // v60.5 (Codex CRITICAL): the inverse checked only the BODY saturation limit while
      // the forward model caps flux at min(body, armature). A thin armature could report
      // a finite pull-in current for a force the iron cannot carry — a brake specified as
      // releasable that physically cannot release. Same cap as pullAt, both limits.
      if (PhiN > Math.min(Bsat * Amin, BsatA * AarmMin)) return Infinity;
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
    const Rterm20 = Rcold - Math.max(p.Rext, 0) / 1000;               // copper-only 20 C terminal R (v60.5 Rll basis)
    const Bback = atGap.Phi / (2 * Math.PI * (rBoss / 1000) * (Math.max(tBack, 0.1) / 1000)); // web at the boss root
    brake = { Thold, Tdyn, re: re * 1000, reUP: reUP * 1000, faces, Fclamp, Fcompr, padP,
      pMax: matB ? matB.pMax : NaN, Tmax: matB ? matB.Tmax : NaN,
      Fpull: atGap.F, Fseat: atSeat.F, marginRel, marginHold, satLim: atGap.satLim,
      Bin: atGap.Bin, Bout: atGap.Bout, Barm: atSeat.Barm, Bback, NI, Rb, Ib, Pb, Ihold, Phold, eco, TcuB, RthB, Lb, tau: Lb / Math.max(Rb, 1e-6),
      Fclamp, Fcompr, sprL0, sprL1, sprCav,
      Vrel: Math.min(Vrel, 10 * p.Vdc), capT: capB, Ain: Ain * 1e6, Aout: Aout * 1e6,
      hBuild, coilOD, clr, tBack, Ipull, Idrop, Rcold, Rterm20, wireLen, feS: feS * 100, murBody, murNom: bodyM.mur || 700 };
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
    const Rs20 = (rStr / (1 + 0.00393 * (p.Tcu - 20))) * rF;          // copper-only 20 C per-phase terminal R (v60.5 Rll basis)
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
      Th, Th1, Th2, detent: Td, Kt: KtPh, Rs, Rs20, Ls, tau: tauS, rpmC: Math.max(rpmC2, 0), kE, hubD: hubD9, thruD: thruD9,
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
      // v60.7: brushed torque follows the same saturation law as PM — Kt·I·sat(I).
      // The armature-reaction MMF knockdown (satOfI, built from this machine's own
      // Hof loop) applied to PM only since v60.5; brushed stall torque was linear.
      const IpkB = Math.min(p.Imax, VphAvail / Ra);
      peakT = KtT9 * IpkB * satOfI(IpkB);
      const IstB = VphAvail / Ra;
      TstallW = KtT9 * IstB * satOfI(IstB);
      baseN = ((Math.max(VphAvail - p.Imax * Ra, 0) / Kt) * 60) / (2 * Math.PI);
      for (let i = 0; i <= 80; i++) {
        const wm = (wNL * i) / 80;
        const IwB = Math.min(Math.max((VphAvail - Kt * wm) / Ra, 0), p.Imax);
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: KtT9 * IwB * satOfI(IwB) });
      }
      const IopB = Math.min(Iph, p.Imax);
      op = { n: ((Math.max(VphAvail - Iph * Ra, 0) / Kt) * 60) / (2 * Math.PI), T: KtT9 * IopB * satOfI(IopB) };
    }
    // armature-reaction demag at the current limit: cross-field A·t per pole across magnet + gap
    if (airgap > 0 && p.magT > 0) {
      const Fa = (Z * (p.Imax / A2)) / (2 * poles);
      Hdemag = Fa / ((p.magT + airgap) / 1000) / 1000; // kA/m
      demagMargin = 1 - Hdemag / HcJmin;
      if (demagMargin < 0.3) w.push(`Demag margin ${(demagMargin * 100).toFixed(0)}% at ${p.Imax} A (armature reaction) — worst case at ${demagT} °C (HcJ ${HcJmin.toFixed(0)} kA/m). Thicken magnets or pick a higher-HcJ grade.`);
    }
    // v60.7: commutation reactance-voltage check. The commutated coil reverses its
    // current (di = 2·Ia/A2) inside the brush transit window (~1.5 segment pitches);
    // e_r = L_coil·di/dt with L_coil = La·A2²/C recovered from the terminal inductance
    // (C coils, A2 paths → La = C·L_coil/A2²). Classical no-interpole limit ≈ 2.5–3 V
    // before brush arcing dominates (small PM machines have no compensating winding).
    const Ccoils = Ns;                                              // double-layer: coils = bars = slots
    const erAt = (n9, Ia9) => Ccoils > 0 && n9 > 0
      ? ((La * A2 * A2) / Ccoils) * ((2 * Ia9) / A2) * ((n9 * Ccoils) / (1.5 * 60))
      : 0;
    let erMax = 0, nErMax = 0;
    for (const c9 of curve) {
      const Ia9 = KtT9 > 0 ? Math.min(Math.max((VphAvail - Kt * ((c9.n * 2 * Math.PI) / 60)) / Ra, 0), p.Imax) : 0;
      const e9 = erAt(c9.n, Ia9);
      if (e9 > erMax) { erMax = e9; nErMax = c9.n; }
    }
    const erOp = op ? erAt(op.n, Math.min(Iph, p.Imax)) : 0;
    if (erMax > 3) w.push(`Commutation reactance voltage peaks at ${erMax.toFixed(1)} V (~${Math.round(nErMax)} rpm) — well past the ~3 V arcing threshold for machines without interpoles: expect brush fire, EMI, and rapid wear. Fewer turns per coil, more segments, or a lower bus.`);
    else if (erMax > 2.5) w.push(`Commutation reactance voltage reaches ${erMax.toFixed(1)} V (~${Math.round(nErMax)} rpm) — at the classical ~2.5–3 V no-interpole limit; expect visible sparking at load.`);
    brush = { Ra, La, Vb: p.brushV, Z, A2, segs: Ns, Bg: BgAvg, er: erOp, erMax, nErMax }; // double-layer lap/wave: commutator bars = coils = slots
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
    const Ra20c = (RHO_CU * (MLTt / 1000) * Ntot) / (aBare * 1e-6 * Math.max(p.strands, 1)); // copper-only 20 C (v60.5 Rll basis)
    const Ra2 = Ra20c * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
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
    latm = { Kt, Tpk: tPk5, Tstop, stiff, travel, zeroAng, Ra: Ra2, Ra20: Ra20c, L: L4, tau: L4 / Math.max(Ra2, 1e-6),
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
    const Rring2 = Rseg / (2 * Math.pow(Math.sin((Math.PI * pp2) / Nb), 2));
    const referral = (4 * 3 * Math.pow(kw * Nser, 2)) / Nb;    // per-bar quantity → stator per-phase
    const R2p = (Rbar + Rring2) * referral;                    // DC (low-slip) referred rotor resistance
    const we2 = 2 * Math.PI * p.freq;
    const X1 = we2 * (Lslot + Lend), Xm2 = we2 * Lmag;
    const R1 = Rhot;
    // v60.7: deep-bar R2(s) + geometric rotor leakage replace the X2 = 0.8·X1 placeholder.
    // Bar depth: p.barH input, else estimated from bar area at a 3:1 depth/width aspect
    // (typical die-cast bar) — disclosed in-card. Rectangular-bar skin-effect factors at
    // slip frequency (Alger/Boldea): xi = h·sqrt(π·f·s·μ0/ρ),
    //   kr = xi(sinh2xi+sin2xi)/(cosh2xi−cos2xi)   (bar resistance rises at start)
    //   kx = (3/2xi)(sinh2xi−sin2xi)/(cosh2xi−cos2xi) (bar slot permeance falls)
    // kr applies to the BAR only (end ring carries no slot field); rotor leakage is the
    // rectangular-slot permeance h/3w on the bar plus a first-order 0.5 constant for
    // end-ring + differential + zigzag (disclosed).
    const hBar = p.barH > 0 ? p.barH : Math.sqrt(3 * Math.max(p.barA, 1e-6));
    const wBar = Math.max(p.barA / Math.max(hBar, 1e-6), 0.05);
    const mu0b = 4e-7 * Math.PI;
    const dbF = (s2) => {
      const xi = (hBar / 1000) * Math.sqrt((Math.PI * p.freq * Math.max(s2, 1e-4) * mu0b) / rhoBar);
      if (xi < 0.15) return { kr: 1, kx: 1, xi };
      const sh = Math.sinh(2 * xi), ch = Math.cosh(2 * xi), sn = Math.sin(2 * xi), cs = Math.cos(2 * xi);
      return { kr: (xi * (sh + sn)) / (ch - cs), kx: (3 / (2 * xi)) * ((sh - sn) / (ch - cs)), xi };
    };
    const R2pOf = (s2) => (Rbar * dbF(s2).kr + Rring2) * referral;
    const L2ref = mu0b * ((p.stackL * skewSlant) / 1000) * referral;
    const X2Of = (s2) => we2 * L2ref * ((hBar / (3 * wBar)) * dbF(s2).kx + 0.5);
    // v60.5 (Codex HIGH): the torque expression was a SERIES circuit that never used the
    // magnetizing branch it computed. Standard single-cage treatment: Thevenin-reduce the
    // stator (R1 + jX1 in series with the source, jXm in parallel) and drive the rotor
    // branch from Vth/Zth. All currents below come from the SAME circuit.
    const Dth = R1 * R1 + Math.pow(X1 + Xm2, 2);
    const Vth = Xm2 > 0 ? (Vph * Xm2) / Math.sqrt(Dth) : Vph;
    const Rth = Xm2 > 0 ? (R1 * Xm2 * Xm2) / Dth : R1;
    const Xth = Xm2 > 0 ? (Xm2 * (R1 * R1 + X1 * (X1 + Xm2))) / Dth : X1;
    const Tof = (s2) => {
      const R2s = R2pOf(s2), X2s = X2Of(s2);
      return (3 * Vth * Vth * (R2s / s2)) / (wSync * (Math.pow(Rth + R2s / s2, 2) + Math.pow(Xth + X2s, 2)));
    };
    // breakdown slip: with slip-dependent R2/X2 the closed form no longer holds —
    // log-space scan then a fine local refine (Tof is smooth and single-peaked)
    let sb2 = 0.05, Tb9 = 0;
    for (let i9 = 0; i9 <= 90; i9++) {
      const s9 = Math.exp(Math.log(0.002) + ((Math.log(1) - Math.log(0.002)) * i9) / 90);
      const T9 = Tof(s9); if (T9 > Tb9) { Tb9 = T9; sb2 = s9; }
    }
    for (let i9 = -20; i9 <= 20; i9++) {
      const s9 = sb2 * (1 + i9 / 100); if (s9 <= 0 || s9 > 1) continue;
      const T9 = Tof(s9); if (T9 > Tb9) { Tb9 = T9; sb2 = s9; }
    }
    // full-circuit stator current at slip s: Z = R1+jX1 + jXm || (R2(s)/s + jX2(s))
    const IstatAt = (s2) => {
      const a9 = R2pOf(s2) / s2, b9 = X2Of(s2);            // rotor branch
      if (!(Xm2 > 0)) return Vph / Math.hypot(R1 + a9, X1 + b9);
      // jXm || (a+jb) = Xm(-b·a + j(...)) — do it with explicit complex arithmetic
      const num = { re: -Xm2 * b9, im: Xm2 * a9 };         // jXm·(a+jb) = -Xm·b + j·Xm·a
      const den = { re: a9, im: b9 + Xm2 };
      const dmag = den.re * den.re + den.im * den.im;
      const zr = (num.re * den.re + num.im * den.im) / dmag;
      const zi = (num.im * den.re - num.re * den.im) / dmag;
      return Vph / Math.hypot(R1 + zr, X1 + zi);
    };
    peakT = Tb9;
    let sr2 = Math.min(sb2 * 0.5, 0.03);
    if (Trated < peakT * 0.98) {
      let lo = 1e-4, hi = sb2;
      for (let it = 0; it < 48; it++) { const mid = (lo + hi) / 2; if (Tof(mid) < Trated) lo = mid; else hi = mid; }
      sr2 = (lo + hi) / 2;
    } else {
      // gated on Xm2: the zero-Xm withdrawal below discards these torques, and a warning
      // describing numbers that are never published only misleads (v60.6c, Grok LOW)
      if (Xm2 > 0) w.push("Sizing torque exceeds computed breakdown torque — cage too resistive or leakage too high for this rating.");
      sr2 = sb2 * 0.7;
    }
    for (let i = 0; i <= 110; i++) {
      const s2 = 1 - (i / 110) * 0.998; // 1 → 0.002
      curve.push({ n: nSync * (1 - s2), T: Tof(s2) });
    }
    op = { n: nSync * (1 - sr2), T: Tof(sr2) };
    // rotor and magnetizing currents from the Thevenin/full circuit (one circuit, v60.5)
    const I2r = Vth / Math.hypot(Rth + R2pOf(sr2) / sr2, Xth + X2Of(sr2));
    const Im2 = Xm2 > 0 ? Vph / Math.hypot(R1, X1 + Xm2) : 0;   // magnetizing current with the rotor branch open (s->0)
    const dbLR = dbF(1);                                 // deep-bar state at locked rotor, for the card
    acim = {
      R2p, sr: sr2, sb: sb2, Tlr: Tof(1),
      Ilr: IstatAt(1),                                   // locked-rotor stator current, full circuit
      Im: Im2, Irun: IstatAt(sr2),                       // running stator current, full circuit
      X2run: X2Of(sr2), X2lr: X2Of(1), R2lr: R2pOf(1),   // v60.7 deep-bar circuit values
      hBar, wBar, barHAuto: !(p.barH > 0), xiLR: dbLR.xi, krLR: dbLR.kr, kxLR: dbLR.kx,
    };
    // v60.6 (Grok HIGH): the loss/thermal chain ran on the J-derived winding current while
    // the card printed the honest circuit current beside it (26 A next to a 9 W copper
    // loss computed at 2.5 A). For induction the OPERATING current IS the circuit current.
    Iph = acim.Irun;
    if (Im2 > 2 * Math.max(Iph9J, 1e-9))
      w.push(`Magnetizing current ${Im2.toFixed(1)} A dominates the winding rating (${Iph9J.toFixed(1)} A from J) — the magnetic circuit is starved; more turns, a smaller airgap, or a bigger core.`);
    if (Nb === Ns) w.push("Rotor bars = stator slots — severe locking and noise; change the bar count.");
    else if (Math.abs(Ns - Nb) === poles || Math.abs(Ns - Nb) === 2 * poles)
      w.push(`Bar count ${Nb} vs ${Ns} slots differs by ${Math.abs(Ns - Nb)} (= p or 2p) — synchronous torque cusps likely; shift the bar count.`);
    // v60.6b (Codex HIGH): a zero magnetizing branch means no modeled airgap power
    // transfer. The old path only WARNED and still published series-circuit torque — a
    // number beside a warning reads as a result. It is now an error and the induction
    // outputs are withdrawn (the intermediate math above stays finite by construction).
    if (!(Xm2 > 0)) {
      err.push("Magnetizing inductance computes to zero — no airgap coupling (check winding factor, airgap, and frequency); induction analysis is unavailable for this input.");
      curve = []; op = null; peakT = 0; acim = null; Iph = Iph9J;
    }
    // v60.6b (Grok HIGH): reassigning Iph to the circuit current moved Pcu/therm/eta,
    // but Iline/Jimp/Arms were computed from the J-rating before this branch ran — the
    // Electrical card printed 26 A phase beside 2.5 A line on a wye machine, and the
    // J-density cooling warnings judged the wrong current. Re-derive at the final Iph.
    IlineOut = p.conn === "delta" ? Iph * Math.sqrt(3) : Iph;
    Jimp = Iph / (aBare * p.strands * pathsEff);
    Arms = (6 * Nser * Iph) / (Math.PI * (p.statorID / 1000));
  }
  // v60.6b (Grok): the J-density warnings judge the FINAL operating density — at their
  // old site (declaration time) the ACIM circuit current did not exist yet
  if (Jimp > 10) w.push(`Copper current density ≈ ${Jimp.toFixed(1)} A/mm² — needs forced-air or liquid cooling (passive designs usually run 3–6).`);
  else if (Jimp > 7) w.push(`Copper current density ≈ ${Jimp.toFixed(1)} A/mm² — fine with good airflow, hot for a sealed housing.`);

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

  /* ---- v60.8 mass / rotor inertia / material bill (ACTIVE electromagnetic parts only:
     no housing, bearings, commutator, encoder, leads, or gearhead — the card says so).
     Magnet density by family; rotor inertia is the annulus sum ½m(ro²+ri²) per part.
     Stepper reuses its own hollow-aware Jr (step.J). Copper mass comes from therm.mCu
     (per-branch, already strand-correct) and is joined in the view. */
  let bom = null;
  {
    const RHO_MAG = { NdFeB: 7500, SmCo: 8300, Ferrite: 4900 };
    const Ls9 = p.stackL / 1000;
    if (p.motorType === "pm") {
      const rOm = p.rotorOD / 2000, rIm = Math.max(p.rotorOD / 2 - p.magT, 0) / 1000, rSh = p.shaftD / 2000;
      const mMag = (p.poleArc / 100) * Math.PI * (rOm * rOm - rIm * rIm) * Ls9 * (RHO_MAG[mag.fam] || 7500);
      const mHub = Math.PI * Math.max(rIm * rIm - rSh * rSh, 0) * Ls9 * rtM.rho * (rtM.kst || 1);
      const mShaftIn = Math.PI * rSh * rSh * Ls9 * 7850;    // shaft inside the stack only
      const Jr9 = 0.5 * mMag * (rOm * rOm + rIm * rIm) + 0.5 * mHub * (rIm * rIm + rSh * rSh) + 0.5 * mShaftIn * rSh * rSh;
      bom = { mMag, mHub, mShaftIn, Jr: Jr9, note: "shaft counted inside the stack only" };
    } else if (brushedM) {
      // armature: lamination annulus minus punched slots, slot copper at mean slot
      // radius, shaft inside the stack. End turns and commutator are NOT in Jr (they
      // add mass but sit at small/moderate radius — disclosed first-order).
      const rOa = p.rotorOD / 2000, rSh = p.shaftD / 2000;
      const slotV = (Ns * slotArea * p.stackL) / 1e9;       // m³ punched out
      const mLam = Math.max(Math.PI * (rOa * rOa - rSh * rSh) * Ls9 - slotV, 0) * stM.kst * stM.rho;
      const mCuSlot = 8960 * condPerSlot * Ns * aBare * 1e-6 * Ls9; // in-slot copper only
      const rSlotMean = Math.max(p.rotorOD / 2 - p.tipH - hs / 2, 1) / 1000;
      const mShaftIn = Math.PI * rSh * rSh * Ls9 * 7850;
      const Jr9 = 0.5 * mLam * (rOa * rOa + rSh * rSh) + mCuSlot * rSlotMean * rSlotMean + 0.5 * mShaftIn * rSh * rSh;
      bom = { mMag: (p.poleArc / 100) * Math.PI * (Math.pow(p.statorID / 2000, 2) - Math.pow(p.statorID / 2000 - p.magT / 1000, 2)) * Ls9 * (RHO_MAG[mag.fam] || 4900),
        mLam, mCuSlot, mShaftIn, Jr: Jr9, note: "end turns & commutator not in Jr" };
    } else if (stpE && step && Number.isFinite(step.J)) {
      bom = { mMag: 0, Jr: step.J, note: "hybrid rotor Jr from the stepper model; PM disc mass not itemized" };
    }
  }
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
  // v60.5: the AC (skin/proximity) factor applies to I2R copper only — the brush CONTACT
  // drop (brushV*I) has no skin effect and must not be scaled by it
  const PcuEff = brushedM && brush
    ? Iph * Iph * brush.Ra * acF9 + Math.max(p.brushV, 0) * Iph
    : Pcu * acF9;
  const eta = PoutN > 0 ? PoutN / (PoutN + PcuEff + Pfe + Pwind) : 0;

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
  // v60.9 thermal calibration: a bench-measured steady ΔT at a known loss scales the
  // WHOLE two-node network (the film-coefficient buckets are the weak link, but a single
  // measured point cannot split the nodes). Valid for the measured mount/cooling only —
  // the capture card discloses this. Active only with calibration ON.
  const kRth9 = p.calOn === "yes" && Number.isFinite(p.calKRth) && p.calKRth > 0 ? Math.min(Math.max(p.calKRth, 0.2), 5) : 1;
  const RthCu = (AslotW > 0 ? 1 / (400 * AslotW) : 99) * kRth9; // impregnated winding-to-iron
  const AoutH = Math.PI * (p.statorOD / 1000) * ((p.stackL * 1.6) / 1000) + 2 * Math.PI * Math.pow(p.statorOD / 2000, 2);
  const RthOut = (1 / (hOut * Math.max(AoutH, 1e-4))) * kRth9;
  let therm = null;
  if (p.motorType === "latm" && latm) {
    // stationary toroid: winding heat leaves through both ring faces over the covered arc
    const RextO = Math.max(p.Rext, 0) / 1000;
    const Ra20 = Math.max((latm.Ra - RextO) / (1 + 0.00393 * (p.Tcu - 20)), 1e-6);
    latm.RaTerm20 = Ra20 + RextO;   // terminal (incl. Rext) at ambient — v60.6: no longer clobbers the copper-only Ra20 that Rll publishes
    const kcov2 = Math.min((Math.max(p.latmSect, 1) * Math.max(p.latmSpan, 5)) / 360, 1);
    const AtorW = 2 * (Math.PI * ((p.statorID + p.statorOD) / 2 / 1000) * (p.stackL / 1000)) * kcov2; // ID + OD faces
    const RthCuT = (AtorW > 0 ? 1 / (400 * AtorW) : 99) * kRth9;
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
    therm = { Tcu: Tc, Rth: RthTot, RthCu: RthCuT, RthOut, Icont, Tcont: (() => { const Ic9 = Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont; return Kt * Ic9 * satOfI(Ic9); })(), mCu, tauW, tauM, TcuDuty, duty: duty9 };
    if (Tc > p.TcuMax) w.push(`Held-on winding temp ≈ ${Math.round(Tc)} °C exceeds the ${p.TcuMax} °C class at the ${latm.Idrv.toFixed(2)} A drive current — a toggle LATM energized continuously needs Idrv ≤ ~${Icont.toFixed(2)} A (current limit or higher-R winding), or pulse duty.`);
  } else if (brushedM && brush) {
    // rotating armature: winding heat crosses the airgap too — lump an extra series resistance
    const RextO = Math.max(p.Rext, 0) / 1000;
    const Ra20 = Math.max((brush.Ra - RextO) / (1 + 0.00393 * (p.Tcu - 20)), 1e-6);
    const Agap = Math.PI * (p.rotorOD / 1000) * (p.stackL / 1000);
    const RthGap = (1 / (60 * Math.max(Agap, 1e-4))) * kRth9;       // rotating-gap convection, first-order
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
    const mCu = 8960 * (MLT / 2) * brush.Z * aBare * 1e-6; // v60.5: Z already counts strands — the extra factor doubled duty-cycle copper mass
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
    therm = { Tcu: Tc, Rth: RthTot, RthCu: RthCu + RthGap, RthOut, Icont, Tcont: (() => { const Ic9 = Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont; return Kt * Ic9 * satOfI(Ic9); })(), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  } else if (brkE && brake) {
    // v60.5: the brake reported TWO thermal answers — its own pot-core network (TcuB/RthB,
    // gate-anchored, displayed on the brake card) AND a generic lamination-stack estimate
    // in therm (109 vs 71 C on the same design). therm now carries the brake's own network
    // so every surface reports one number.
    const RextO9 = Math.max(p.Rext, 0) / 1000;
    const RhMaxB = brake.Rterm20 * (1 + 0.00393 * (p.TcuMax - 20)) + RextO9;
    const PallowB = Math.max((p.TcuMax - p.Tamb) / Math.max(brake.RthB, 1e-6), 0);
    const IcontB = Math.sqrt(PallowB / Math.max(RhMaxB, 1e-6));
    const mCuB = 8960 * brake.wireLen * Math.max(p.strands, 1) * aBare * 1e-6;
    therm = { Tcu: brake.TcuB, Rth: brake.RthB, Icont: IcontB, Tcont: 0,
      mCu: mCuB, tauW: mCuB * CP_CU * brake.RthB, tauM: (mCuB * CP_CU + coreMass * CP_FE) * brake.RthB,
      TcuDuty: null, duty: duty9 };
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
    therm = { Tcu: Tc, Rth: RthCu + RthOut, RthCu, RthOut, Icont, Tcont: (() => { const Ic9 = Number.isFinite(p.Imax) ? Math.min(Icont, p.Imax) : Icont; return Kt * Ic9 * satOfI(Ic9); })(), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  }


  // v60.5: Rll/Rphase for the non-3-phase machines report the REAL coil the physics and
  // the UI use, at 20 C copper-only (same basis as the pm value). The pre-branch 3-phase
  // MLT number was a PHANTOM for latm/stepper/brake — a winding those machines do not
  // have — yet the datasheet and the golden anchors were certifying it (LATM: 118 Ohm
  // phantom vs ~43 Ohm real terminal R).
  let RllOut = Rll, RphOut = Rphase;
  if (latmE && latm) { RphOut = latm.Ra20; RllOut = latm.Ra20; }
  else if (stpE && step) { RphOut = step.Rs20; RllOut = step.Rs20; }
  else if (brkE && brake) { RphOut = brake.Rterm20; RllOut = brake.Rterm20; }

  return {
    err, warn: w, Ns, poles, airgap,
 hs, w1, w2, slotArea, usableArea,
    dBare, dIns, aBare, condPerSlot, fillGross, fillCu, fillInsSlot, fillCuSlot, q, span, kw, rcFil, ksat, kIT, satCurve, Imax: p.Imax,
    skewDeg, ksk, skewSlant, skewArc,
    Nser, MLT, Rphase: RphOut, Rll: RllOut, Iph, Iline: IlineOut, Istall, Vph, Arms,
    Trated, nSync, nShaft, Pout: PoutN, Pcu, eta, Eph, Ke, Kt, VphAvail,
    rotation, topLayer, botLayer, layers, curve, op, noLoad, peakT, baseN,
    mag, BrT, HcJT, HcJmin, demagT, kcGap, kl: klOut, BgAvg, B1, BgEff, Hdemag, demagMargin,
    cal: calAct ? { kR: cKR, kL: cKL, kKe: cKe, kKt: cKt, Td: cTd } : null,
    MLTmm, endSide, tb, coilOD, coilDia, bobSuggest, coilArc,
    stM, rtM, Bt, By, Byr, hyr, coreMass, mYoke, mTeeth, efFe, Bavg, TstallW, Jimp, bemf, Rhot, cog, bom,
    Lph, LphNR, Lll, LllNR, acim, therm, acFr, Pwind, Pfe, feOp, brush, latm, brake, step,
  };
}

/* ================= design exploration: sweeps and sensitivity =================
   computeDesign is pure and runs in microseconds, so sweeping it is nearly free —
   this is the same capability the commercial tools sell as "design exploration",
   and it needs no solver, no optimiser library, and no second physics model.

   Every metric below is READ from a computed design; none is recomputed here, so a
   sweep can never disagree with the results column. Designs that error inside the
   sweep are kept as holes (`err`) rather than dropped, because WHERE a design stops
   being buildable is usually the most useful thing on the chart. ============== */

const SWEEP_METRICS = [
  { k: "Kt",     lab: "Torque constant",      unit: "N·m/A", get: (r) => r.Kt },
  { k: "noLoad", lab: "No-load speed",        unit: "rpm",   get: (r) => r.noLoad },
  { k: "peakT",  lab: "Peak torque",          unit: "N·m",   get: (r) => r.peakT },
  { k: "eta",    lab: "Efficiency at rated",  unit: "%",     get: (r) => r.eta * 100 },
  { k: "Rll",    lab: "Resistance (winding, 20 °C)", unit: "Ω", get: (r) => r.Rll },
  { k: "Tcu",    lab: "Winding temp",         unit: "°C",    get: (r) => (r.therm ? r.therm.Tcu : NaN) },
  { k: "Icont",  lab: "Continuous current",   unit: "A",     get: (r) => (r.therm ? r.therm.Icont : NaN) },
  { k: "fill",   lab: "Slot fill",            unit: "%",     get: (r) => r.fillGross * 100 },
  { k: "Bt",     lab: "Tooth flux density",   unit: "T",     get: (r) => r.Bt },
  { k: "By",     lab: "Yoke flux density",    unit: "T",     get: (r) => r.By },
  { k: "cogTpp", lab: "Cogging (pk-pk)",      unit: "N·m",   get: (r) => (r.cog ? r.cog.Tpp : NaN) },
  { k: "demag",  lab: "Demag margin",         unit: "%",     get: (r) => r.demagMargin * 100 },
  { k: "mCu",    lab: "Copper mass",          unit: "kg",    get: (r) => (r.therm ? r.therm.mCu : NaN) },
];

/* Sweep one parameter. Returns points with every metric plus any errors, and the
   per-metric range so a view can normalise without recomputing. */
function sweepDesign(p, key, lo, hi, n9, metricKeys) {
  if (!key || !Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo)
    return { err: "Sweep needs a parameter and a low < high range." };
  if (!(key in p)) return { err: `"${key}" is not a parameter of this design.` };
  if (typeof p[key] !== "number") return { err: `"${key}" is not numeric — sweeps cover numeric inputs.` };
  const N = Math.min(Math.max(Math.round(n9) || 25, 3), 121);
  const mets = (metricKeys && metricKeys.length ? metricKeys : ["Kt", "peakT", "eta"])
    .map((k9) => SWEEP_METRICS.find((m9) => m9.k === k9)).filter(Boolean);
  const pts = [];
  for (let i9 = 0; i9 < N; i9++) {
    const v = lo + ((hi - lo) * i9) / (N - 1);
    const r9 = computeDesign({ ...p, [key]: v });
    const m = {};
    for (const mt of mets) {
      const x9 = mt.get(r9);
      m[mt.k] = Number.isFinite(x9) ? x9 : NaN;
    }
    pts.push({ v, m, err: r9.err.length ? r9.err[0] : null, warn: r9.warn.length });
  }
  const range = {};
  for (const mt of mets) {
    const vals = pts.filter((q) => !q.err).map((q) => q.m[mt.k]).filter(Number.isFinite);
    range[mt.k] = vals.length ? { lo: Math.min(...vals), hi: Math.max(...vals) } : null;
  }
  const cur = computeDesign(p);
  const curM = {};
  for (const mt of mets) curM[mt.k] = mt.get(cur);
  return { key, lo, hi, N, mets: mets.map((m9) => ({ k: m9.k, lab: m9.lab, unit: m9.unit })),
    pts, range, cur: { v: p[key], m: curM }, nErr: pts.filter((q) => q.err).length };
}

/* Tornado sensitivity: perturb each parameter ±pct and record what each metric does.
   Sorted by influence, so the top bar is the parameter worth arguing about. */
function sensitivity(p, keys, pct, metricKey) {
  const mt = SWEEP_METRICS.find((m9) => m9.k === metricKey) || SWEEP_METRICS[0];
  const d9 = Math.min(Math.max(Math.abs(pct) || 10, 0.5), 50) / 100;
  const base = computeDesign(p);
  const b9 = mt.get(base);
  if (!Number.isFinite(b9) || b9 === 0) return { err: `"${mt.lab}" is not a usable baseline for this design.` };
  const rows = [];
  for (const k9 of keys) {
    if (typeof p[k9] !== "number" || !Number.isFinite(p[k9]) || p[k9] === 0) continue;
    const vLo = p[k9] * (1 - d9), vHi = p[k9] * (1 + d9);
    const rLo = computeDesign({ ...p, [k9]: vLo });
    const rHi = computeDesign({ ...p, [k9]: vHi });
    const xLo = rLo.err.length ? NaN : mt.get(rLo);
    const xHi = rHi.err.length ? NaN : mt.get(rHi);
    const pLo = Number.isFinite(xLo) ? ((xLo - b9) / Math.abs(b9)) * 100 : NaN;
    const pHi = Number.isFinite(xHi) ? ((xHi - b9) / Math.abs(b9)) * 100 : NaN;
    const infl = Math.max(Number.isFinite(pLo) ? Math.abs(pLo) : 0, Number.isFinite(pHi) ? Math.abs(pHi) : 0);
    rows.push({ key: k9, base: p[k9], lo: vLo, hi: vHi, pLo, pHi, infl,
      errLo: rLo.err.length ? rLo.err[0] : null, errHi: rHi.err.length ? rHi.err[0] : null });
  }
  rows.sort((a9, b8) => b8.infl - a9.infl);
  return { metric: { k: mt.k, lab: mt.lab, unit: mt.unit }, pct: d9 * 100, baseVal: b9, rows };
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
  // v61: loaded solve — stator winding ampere-turns enter as an extra source in the
  // SAME discrete units as the magnet term (field-gate pins the absolute scale with a
  // torque-vs-circuit referee, which would expose any unit slip as a ×1000 error).
  if (o.srcJ && o.srcJ.length === N) for (let k9 = 0; k9 < N; k9++) src[k9] += o.srcJ[k9];
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
  // PM (inner-rotor) topology ONLY. `fieldMesh` builds magnets on the rotor surface and
  // slots opening inward from the stator bore; a brushed machine is inside-out — magnets
  // bonded to the housing ID, slots on the ROTATING ARMATURE opening outward — so meshing
  // it with this map solves a different machine. A cross-check over every preset exposed
  // exactly that: 4-pole brushed designs happened to land within ~7% of the circuit while
  // 2-pole ones were off by 33–40%, which is the signature of wrong geometry, not model
  // error. Brushed support needs an inverted mesh; until it exists this returns an error
  // rather than a confident wrong number.
  if (p.motorType === "brushed")
    return { err: "The field solver models inner-rotor PM topology; a brushed machine is inside-out (magnets on the housing, slots on the rotating armature). Brushed field solving needs an inverted mesh — not yet implemented." };
  if (p.motorType !== "pm") return { err: "The field solver covers BLDC/PMSM designs." };
  if (!r || r.err.length) return { err: "Fix the design's errors before solving the field." };
  if (!(p.magT > 0) || !(r.airgap > 0)) return { err: "Needs a positive magnet thickness and airgap." };
  const nrH = Math.max(Math.round(o.nr || 56), 20), nth = Math.max(Math.round(o.nth || 288), 96);
  const msh = fieldMesh(p, nrH, nth);
  const BrT = r.BrT;
  const M0 = magPattern(p, msh, 0, BrT);
  const nl0 = o.nl || (o.quick ? 10 : 26), sw0 = o.sweeps || (o.quick ? 60 : 130);
  const s0 = solveField(p, msh, M0, { nl: nl0, sweeps: sw0 });
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
  // ---- per-design mesh check. A gate can only prove convergence for the designs it
  // tests; a cross-check over all presets found a 24s4p machine whose B1 swung 1.13 ->
  // 0.63 under refinement while the tested presets held to 1-2%. So the solve verifies
  // ITSELF: re-solve ~1.4x finer and report how far the answer moved. Anything above a
  // few percent means this design's numbers are not converged and must not be quoted.
  let mesh = null;
  if (o.verify) {
    const m2 = fieldMesh(p, Math.round(nrH * 1.4), Math.round(nth * 1.4));
    const s2 = solveField(p, m2, magPattern(p, m2, 0, BrT), { nl: nl0, sweeps: sw0 });
    const g2 = gapQuantities(p, m2, s2.A);
    const B1b = gapHarmonic(g2.Br, pp);
    const dB1m = B1 > 0 ? Math.abs(B1b - B1) / B1 : NaN;
    const dBpk = g0.Bpk > 0 ? Math.abs(g2.Bpk - g0.Bpk) / g0.Bpk : NaN;
    mesh = { nr2: m2.nr, nth2: Math.round(nth * 1.4), B1b, Bpk2: g2.Bpk, dB1: dB1m, dBpk,
      ok: Number.isFinite(dB1m) && dB1m < 0.05 && Number.isFinite(dBpk) && dBpk < 0.05 };
  }
  return {
    msh, A: s0.A, B: s0.B, conv: s0.conv, sweeps: s0.sweeps, resid: s0.resid, mesh,
    gap: g0, B1, domN, fluxPole,
    cmp: {
      BgField: g0.Bpk, BgAnalytic: r.BgAvg,
      B1Field: B1, B1Analytic: r.B1,
      dB1: r.B1 > 0 ? (B1 - r.B1) / r.B1 : NaN,
    },
    nr: msh.nr, nth,
  };
}

/* ---- v61 loaded field study: same solver, same mesh, same self-verification — plus
   stator winding currents. The winding source spreads each layer's ampere-turns over
   that layer's own slot-copper cells, phases and signs straight from the engine's
   star-of-slots (the FEMM export's source). Torque comes from the same averaged
   Maxwell stress as gapQuantities — under LOAD the signal is motoring-scale, far above
   the staircase noise that disqualified cogging (and the mesh self-check still rules). */
function windingSrc(p, r, msh, iabc) {
  const { nr, nth, rC, drC, dth, reg, rTip, rSlotTop } = msh;
  const src = new Float64Array(nr * nth);
  if (!r.topLayer || !r.topLayer.length) return src;
  const two = r.layers === 2;
  const rMid = (rTip + rSlotTop) / 2;
  const slotPitch = (2 * Math.PI) / msh.Ns;
  const areaTop = new Float64Array(msh.Ns), areaBot = new Float64Array(msh.Ns);
  const cellSlot = new Int32Array(nr * nth); cellSlot.fill(-1);
  for (let i = 0; i < nr; i++) {
    const rr = rC[i];
    if (rr <= rTip || rr >= rSlotTop) continue;
    for (let j = 0; j < nth; j++) {
      const k = i * nth + j;
      if (reg[k] !== FR_AIR) continue;
      const th = (j + 0.5) * dth;
      // slots are CENTERED on s·slotPitch (teeth on the half-pitch) in this mesh and in
      // the FEMM export — floor() split every slot across two indices and smeared
      // adjacent phase currents (torque came out 3x low and angle-flat)
      const s9 = Math.round(th / slotPitch) % msh.Ns;
      cellSlot[k] = s9;
      const a9 = rr * dth * drC[i];
      if (!two || rr < rMid) areaTop[s9] += a9; else areaBot[s9] += a9;
    }
  }
  // SRC_SCALE matches the magnet term's discrete units: the magnet source is written as
  // M[A/m]·Δr[mm] = 1e3 × the physical circulation in amps, so ampere-turns enter ×1e3.
  const SRC_SCALE = 1e3;
  for (let i = 0; i < nr; i++) {
    const rr = rC[i];
    if (rr <= rTip || rr >= rSlotTop) continue;
    for (let j = 0; j < nth; j++) {
      const k = i * nth + j;
      const s9 = cellSlot[k];
      if (s9 < 0) continue;
      const top = !two || rr < rMid;
      const lay = top ? r.topLayer[s9] : r.botLayer[s9];
      const area = top ? areaTop[s9] : areaBot[s9];
      if (!lay || !(area > 0)) continue;
      // ampere-turns per layer: each of the `turns` conductors carries i/paths
      const At9 = (Math.max(Math.round(p.turns), 1) * lay.sign * iabc[lay.phase]) / Math.max(p.paths, 1);
      src[k] = (At9 * SRC_SCALE * (rr * dth * drC[i])) / area;
    }
  }
  return src;
}

/* Per-phase flux linkage from the solved vector potential: λ_ph = N·L·Σ(sign·⟨A⟩_layer)
   per path. Volume-integrated in A (smooth), so the dq torque built on it does NOT
   inherit the boundary-staircase noise that disqualified Maxwell-stress cogging. */
function phaseFlux(p, r, msh, A) {
  const { nr, nth, rC, drC, dth, reg, rTip, rSlotTop } = msh;
  const two = r.layers === 2;
  const rMid = (rTip + rSlotTop) / 2;
  const slotPitch = (2 * Math.PI) / msh.Ns;
  const sumA = [new Float64Array(msh.Ns), new Float64Array(msh.Ns)];
  const sumW = [new Float64Array(msh.Ns), new Float64Array(msh.Ns)];
  for (let i = 0; i < nr; i++) {
    const rr = rC[i];
    if (rr <= rTip || rr >= rSlotTop) continue;
    for (let j = 0; j < nth; j++) {
      const k = i * nth + j;
      if (reg[k] !== FR_AIR) continue;
      const th = (j + 0.5) * dth;
      const s9 = Math.round(th / slotPitch) % msh.Ns;
      const li = !two || rr < rMid ? 0 : 1;
      const w9 = rr * dth * drC[i];
      sumA[li][s9] += A[k] * w9; sumW[li][s9] += w9;
    }
  }
  const lam = [0, 0, 0];
  const N9 = Math.max(Math.round(p.turns), 1), lays = two ? 2 : 1;
  for (let s9 = 0; s9 < msh.Ns; s9++) {
    for (let li = 0; li < lays; li++) {
      if (!(sumW[li][s9] > 0)) continue;
      const lay = li === 0 ? r.topLayer[s9] : r.botLayer[s9];
      if (!lay) continue;
      lam[lay.phase] += lay.sign * N9 * (sumA[li][s9] / sumW[li][s9]);
    }
  }
  // solver A is in T·mm (= 1e-3 Wb/m); λ[Wb] = ΣA_SI · stack[m] / paths
  const kL = ((p.stackL / 1000) * 1e-3) / Math.max(p.paths, 1);
  return [lam[0] * kL, lam[1] * kL, lam[2] * kL];
}

/* Loaded study entry. opts: { I (rms phase amps, default rated), nr, nth, nAng, quick,
   verify }. Sweeps the electrical angle for peak torque (no dq transform assumptions),
   then reports torque vs the circuit's own Kt·I·sat(I) as a referee, the loaded gap
   field, and a spatial demagnetization map of the magnet ring at the design's
   worst-case magnet temperature (HcJmin already includes the cold-ferrite corner). */
function fieldStudyLoaded(p, r, opts) {
  const o = opts || {};
  if (p.motorType !== "pm") return { err: "The loaded field study covers BLDC/PMSM designs." };
  if (!r || r.err.length) return { err: "Fix the design's errors before solving the field." };
  if (!(p.magT > 0) || !(r.airgap > 0)) return { err: "Needs a positive magnet thickness and airgap." };
  const Irms = o.I > 0 ? o.I : Math.max(r.Iph, 0.1);
  const Ipk = Math.SQRT2 * Irms;                       // sinusoidal phase currents (FOC-style)
  const nrH = Math.max(Math.round(o.nr || 56), 20);
  // snap the angular grid to a slot multiple — a non-integer cells-per-slot count smears
  // the winding source unevenly from slot to slot (the 9s8p torque diverged 47% under
  // refinement from exactly this; snapped, it converges like the 12-slot machines)
  const NsQ = Math.max(3, Math.round(p.slots));
  const nth = NsQ * Math.max(Math.round(Math.max(Math.round(o.nth || 288), 96) / NsQ), 12);
  const msh = fieldMesh(p, nrH, nth);
  const M0 = magPattern(p, msh, 0, r.BrT);
  const nl0 = o.nl || (o.quick ? 10 : 26), sw0 = o.sweeps || (o.quick ? 60 : 130);
  const pp = msh.poles / 2;
  const nAng = Math.max(Math.round(o.nAng || 7), 3);
  const TdqOf = (A9, iabc9) => {
    // amplitude-invariant Clarke on λ and i, then T = (3/2)·p·(λα·iβ − λβ·iα)
    const lm = phaseFlux(p, r, msh, A9);
    const alI = (2 / 3) * (iabc9[0] - iabc9[1] / 2 - iabc9[2] / 2), beI = (iabc9[1] - iabc9[2]) / Math.sqrt(3);
    const alL = (2 / 3) * (lm[0] - lm[1] / 2 - lm[2] / 2), beL = (lm[1] - lm[2]) / Math.sqrt(3);
    return 1.5 * pp * (alL * beI - beL * alI);
  };
  let best = null, warm = null;
  for (let a9 = 0; a9 < nAng; a9++) {
    const thE = (Math.PI * a9) / nAng;                 // electrical angle sweep over half a cycle
    const iabc = [Ipk * Math.cos(thE), Ipk * Math.cos(thE - (2 * Math.PI) / 3), Ipk * Math.cos(thE + (2 * Math.PI) / 3)];
    const srcJ = windingSrc(p, r, msh, iabc);
    const s9 = solveField(p, msh, M0, { nl: nl0, sweeps: sw0, srcJ, warm });
    warm = s9.A;
    const g9 = gapQuantities(p, msh, s9.A);
    const Tdq9 = TdqOf(s9.A, iabc);
    if (!best || Math.abs(Tdq9) > Math.abs(best.T)) best = { T: Tdq9, Tstress: g9.T, thE, A: s9.A, B: s9.B, g: g9, conv: s9.conv, iabc };
  }
  const B1L = gapHarmonic(best.g.Br, pp);
  // ---- demagnetization map at the best-torque angle, magnet cells only:
  // H along the magnetization = (B_r − μ0·M)/(μ0·μr); demag when it opposes M.
  // Compared against HcJ at the design's WORST-CASE magnet temperature (r.HcJmin, kA/m).
  const magM = MAGNETS[p.mag] || MAGNETS["N42"];
  const HcJ = Math.max(r.HcJmin, 1) * 1000;            // A/m
  let worstMargin = Infinity, nMagCells = 0, nDemag = 0;
  const stripN = nth, strip = new Float64Array(stripN); strip.fill(Infinity);
  for (let i = 0; i < msh.nr; i++) {
    if (!msh.isMag[i]) continue;
    for (let j = 0; j < nth; j++) {
      const k = i * nth + j;
      const Mc = M0[k];
      if (Mc === 0) continue;                          // inter-pole gap
      nMagCells++;
      const jp = (j + 1) % nth, jm = (j - 1 + nth) % nth;
      const BrC = (best.A[i * nth + jp] - best.A[i * nth + jm]) / (2 * msh.rC[i] * msh.dth);
      const Hr = (BrC - MU0 * Mc) / (MU0 * (magM.mur || 1.05));
      const Hop = -Hr * Math.sign(Mc);                 // positive = opposing the magnetization
      const margin = 1 - Math.max(Hop, 0) / HcJ;
      if (margin < worstMargin) worstMargin = margin;
      if (margin < 0) nDemag++;
      if (margin < strip[j]) strip[j] = margin;
    }
  }
  // ---- mesh self-check on the LOADED quantities (torque and loaded B1) — the same
  // discipline that keeps cogging unpublished. Torque is only quotable if it holds.
  let mesh = null;
  if (o.verify !== false) {
    const m2 = fieldMesh(p, Math.round(nrH * 1.4), NsQ * Math.max(Math.round((nth * 1.4) / NsQ), 12));
    const src2 = windingSrc(p, r, m2, best.iabc);
    // Gauss-Seidel converges slower on the finer grid — give the verify pass a larger
    // sweep budget so the mesh check measures DISCRETIZATION, not solver truncation
    const s2 = solveField(p, m2, magPattern(p, m2, 0, r.BrT), { nl: nl0, sweeps: Math.round(sw0 * 1.8), srcJ: src2 });
    const g2 = gapQuantities(p, m2, s2.A);
    // the fine-mesh dq torque needs phaseFlux on m2's geometry
    const lm2 = (() => {
      const sv = phaseFlux(p, r, m2, s2.A);
      const alI = (2 / 3) * (best.iabc[0] - best.iabc[1] / 2 - best.iabc[2] / 2), beI = (best.iabc[1] - best.iabc[2]) / Math.sqrt(3);
      const alL = (2 / 3) * (sv[0] - sv[1] / 2 - sv[2] / 2), beL = (sv[1] - sv[2]) / Math.sqrt(3);
      return 1.5 * pp * (alL * beI - beL * alI);
    })();
    const dT = Math.abs(best.T) > 1e-9 ? Math.abs(lm2 - best.T) / Math.abs(best.T) : NaN;
    const B1b = gapHarmonic(g2.Br, pp);
    const dB1 = B1L > 0 ? Math.abs(B1b - B1L) / B1L : NaN;
    mesh = { dT, dB1, T2: lm2, Tstress2: g2.T, ok: Number.isFinite(dT) && dT < 0.05 && Number.isFinite(dB1) && dB1 < 0.05 };
  }
  // circuit referee: the analytic model's own torque at this current
  const satK = r.satCurve && r.satCurve.length && p.Imax > 0 ? satInterp(r.satCurve, Irms / p.Imax) : 1;
  const Tcir = r.Kt * Irms * satK;
  return {
    msh, A: best.A, B: best.B, conv: best.conv, mesh,
    Irms, thE: best.thE, gap: best.g, B1: B1L,
    Tem: mesh && !mesh.ok ? null : Math.abs(best.T),
    TemRaw: Math.abs(best.T),
    Tcir, dTcir: Tcir > 0 ? Math.abs(best.T) / Tcir - 1 : NaN,
    demag: { worstMargin, frac: nMagCells ? nDemag / nMagCells : NaN, nDemag, nMagCells, strip: Array.from(strip) },
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

/* saturation-aware current for a demanded electromagnetic torque (v60.5): solves
   Kt·I·sat(I) = T by bisection over the design's own satCurve, so every screen agrees
   on amps for a given N·m. satCurve is gridded in f = I/Imax. Machines without a
   saturation curve fall through to the linear T/Kt. */
function satInterp(sc, f9) {
  if (f9 <= sc[0].f) return sc[0].k;
  for (let i9 = 1; i9 < sc.length; i9++) {
    if (sc[i9].f >= f9) {
      const a9 = sc[i9 - 1], b9 = sc[i9];
      const u9 = (f9 - a9.f) / Math.max(b9.f - a9.f, 1e-12);
      return a9.k + u9 * (b9.k - a9.k);
    }
  }
  return sc[sc.length - 1].k;
}
function satInvertI(p, r, Tem) {
  if (!(r.Kt > 0)) return 0;
  if (!r.satCurve || !r.satCurve.length || !(p.Imax > 0)) return Tem / r.Kt;
  // v60.6b (Codex): bracket to the CURVE's sampled envelope (f = 0..1.5·Imax), not
  // 3·Tem/Kt — the old ceiling scaled with the demand itself, so for any end retention
  // ≥ 1/3 the Infinity guard could never fire and out-of-envelope demands returned huge
  // currents extrapolated far past where the magnetics were solved.
  const fEnd = r.satCurve[r.satCurve.length - 1].f;
  let lo = 0, hi = Math.max(fEnd * p.Imax, 1e-6);
  if (r.Kt * hi * satInterp(r.satCurve, fEnd) < Tem) return Infinity;
  for (let i9 = 0; i9 < 48; i9++) {
    const mid = (lo + hi) / 2;
    if (r.Kt * mid * satInterp(r.satCurve, mid / p.Imax) < Tem) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
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
  const I9 = r.Kt > 0 ? satInvertI(p, r, Math.max(Tem, 0)) : 0;
  // AC copper factor at THIS speed's frequency (Dowell, same form as the engine)
  let acF = 1;
  if (fe9 > 0 && r.dBare > 0) {
    const delta = Math.sqrt(RHO_CU / (Math.PI * fe9 * 4e-7 * Math.PI)) * 1000;
    const NlL = Math.ceil(Math.sqrt(Math.max(r.condPerSlot, 1)));
    acF = Math.min(1 + ((5 * NlL * NlL - 1) / 45) * Math.pow(r.dBare / delta, 4), 4);
  }
  const Pcu9 = brushedM && r.brush
    ? I9 * I9 * r.brush.Ra * acF + Math.max(p.brushV, 0) * I9   // v60.5: no skin effect on contact drop
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
  // v60.6b (Grok HIGH): read the thermal model's own Tcont — recomputing it here from
  // UNCLAMPED Icont put the map's S1 line 12.5× above the thermal card when the drive
  // limit sat below the winding's thermal capability. One physics model, one number.
  const Tcont = r.therm && Number.isFinite(r.therm.Tcont) ? r.therm.Tcont : null;
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
  let Eout = 0, Ein = 0, Ecu = 0, Efe = 0, Ew = 0, I2t = 0, T2t = 0, tTot = 0, over = 0, unreach = 0, nPk = 0, tPk = 0;
  const trace = [];
  for (let i9 = 1; i9 < pts.length; i9++) {
    const a9 = pts[i9 - 1], b9 = pts[i9];
    const dt = Math.max(b9.t - a9.t, 0);
    if (!(dt > 0)) continue;
    const nMid = (a9.n + b9.n) / 2, tMid = (a9.T + b9.T) / 2;   // midpoint rule
    const L9 = lossesAt(p, r, nMid, tMid);                      // signed: braking heats but does no useful work
    // v60.6 (Grok): satInvertI returns Infinity when the demanded torque exceeds the
    // saturation plateau — count that interval as over-envelope instead of poisoning
    // every energy integral with Infinity
    // v60.6b (Grok): unreachable intervals are tracked SEPARATELY from merely over-envelope
    // ones — the former charge no energy/copper (the model cannot say what they cost), the
    // latter integrate at the demanded torque; the UI banner discloses each on its own terms
    if (!Number.isFinite(L9.I)) { over += dt; unreach += dt; tTot += dt; T2t += tMid * tMid * dt; tPk = Math.max(tPk, Math.abs(tMid)); continue; }
    Eout += L9.Pout * dt; Ein += L9.Pin * dt;
    Ecu += L9.Pcu * dt; Efe += L9.Pfe * dt; Ew += L9.Pwind * dt;
    I2t += L9.I * L9.I * dt; T2t += tMid * tMid * dt; tTot += dt;
    nPk = Math.max(nPk, Math.abs(nMid)); tPk = Math.max(tPk, Math.abs(tMid));
    if (env && Math.abs(tMid) > env.tAt(Math.abs(nMid)) * 1.001) over += dt;
    trace.push({ t: b9.t, n: nMid, T: tMid, eta: L9.eta, Pcu: L9.Pcu, Pfe: L9.Pfe });
  }
  if (!(tTot > 0)) return { err: "Cycle has zero duration." };
  // v60.6c (Grok LOW): the banner promises unreachable intervals are EXCLUDED from the
  // I·rms and copper-loss figures — so they leave the averaging denominators too, not
  // just the integrals (over full tTot they diluted Irms by sqrt(reachable fraction))
  const tEff = Math.max(tTot - unreach, 1e-9);
  const Irms = Math.sqrt(I2t / tEff), Trms = Math.sqrt(T2t / tTot);
  const PcuMean = Ecu / tEff, PfeMean = Efe / tEff;
  // steady winding temperature this cycle implies, through the design's own Rth
  const Rth9 = r.therm && Number.isFinite(r.therm.Rth) ? r.therm.Rth : null;
  const Tcu = Rth9 !== null ? p.Tamb + PcuMean * Rth9 + PfeMean * Math.max(Rth9 * 0.5, 0) : null;
  return { dur: tTot, Eout, Ein, Ecu, Efe, Ew, etaCycle: Ein > 0 ? Eout / Ein : 0,
    Irms, Trms, PcuMean, PfeMean, Tcu, nPk, tPk, overT: over, trace,
    overFrac: over / tTot, unreachT: unreach, unreachFrac: unreach / tTot };
}

/* v60.9 one-shot overload: winding temperature vs time at a constant pulse current,
   from the design's own two-node ladder (copper node through RthCu at tauW over the
   machine node through RthOut at tauM). Copper heating only — iron loss during a
   stall/low-speed pulse is second-order and NOT added (disclosed in-card). Resistance
   is taken hot (at the Tcu rating), which is conservative early in the pulse. Pure. */
function pulseTemp(p, r, Ipulse) {
  if (!r || !r.therm || !(Ipulse > 0)) return { err: "Needs a computed design and a pulse current." };
  const th = r.therm;
  if (!(th.RthCu >= 0) || !(th.RthOut > 0) || !(th.tauW > 0)) return { err: "This machine type has no two-node pulse model." };
  const Pc = p.motorType === "brushed" && r.brush ? Ipulse * Ipulse * r.brush.Ra + Math.max(p.brushV, 0) * Ipulse
    : p.motorType === "latm" && r.latm ? Ipulse * Ipulse * r.latm.Ra
    : p.motorType === "stepper" && r.step ? (r.step.on2 ? 2 : 1) * Ipulse * Ipulse * r.step.Rs
    : 3 * Ipulse * Ipulse * r.Rhot;
  const Tof = (t9) => p.Tamb + Pc * (th.RthCu * (1 - Math.exp(-t9 / Math.max(th.tauW, 1e-6)))
    + th.RthOut * (1 - Math.exp(-t9 / Math.max(th.tauM, 1e-6))));
  const Tend = p.Tamb + Pc * (th.RthCu + th.RthOut);
  let tLimit = Infinity;
  if (Tend > p.TcuMax && Tof(0) < p.TcuMax) {
    let lo = 0, hi = Math.max(th.tauM * 8, 1);
    for (let i9 = 0; i9 < 60; i9++) { const m9 = (lo + hi) / 2; if (Tof(m9) < p.TcuMax) lo = m9; else hi = m9; }
    tLimit = (lo + hi) / 2;
  }
  const tMax = Number.isFinite(tLimit) ? Math.min(Math.max(tLimit * 1.5, th.tauW * 3), th.tauM * 4) : th.tauM * 4;
  const curve = Array.from({ length: 61 }, (_, i9) => { const t9 = (tMax * i9) / 60; return { t: t9, T: Tof(t9) }; });
  return { Pc, curve, tLimit, Tend, tMax };
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
      // v60.6 (Grok): TANGENT fillet for the sloped wall. The v60.5 center (hw2-rc, r2-rc)
      // assumed a vertical side, leaving a sl·rc jog (0.13 mm on a NEMA 23 trapezoid) where
      // the wall met the arc. The center now sits rc from the slot bottom and rc
      // perpendicular from the wall line, the sweep extends by atan(sl) so the arc starts
      // exactly on the wall (no extra wall vertex), and both sides sample mirrored angles.
      // Reduces bit-exactly to the v60.5 points when sl = 0.
      const sl = (hw2 - hw1) / Math.max(r2 - r1, 1e-6), q9 = Math.sqrt(1 + sl * sl), fW = Math.atan(sl);
      const rcT = Math.min(rc, Math.max(hw2, 0) / (sl + q9));
      const cxF = hw2 - sl * rcT - rcT * q9, cyF = r2 - rcT, sw = Math.PI / 2 + fW;
      for (let k = 0; k <= 5; k++) { const f9 = Math.PI + fW - (sw * k) / 5; P(a, -cxF + rcT * Math.cos(f9), cyF + rcT * Math.sin(f9)); }
      for (let k = 0; k <= 5; k++) { const f9 = Math.PI / 2 - (sw * k) / 5; P(a, cxF + rcT * Math.cos(f9), cyF + rcT * Math.sin(f9)); }
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
      // v60.6 (Grok): tangent fillet for the sloped wall — same construction as the stator
      // builder but flipped radially (slots open outward, bottom at r2 < r1). Reduces
      // bit-exactly to the v60.5 points when sl = 0.
      const sl = (hw1 - hw2) / Math.max(r1 - r2, 1e-6), q9 = Math.sqrt(1 + sl * sl), fW = Math.atan(sl);
      const rcT = Math.min(rc, Math.max(hw2, 0) / Math.max(q9 - sl, 0.1));
      const cxF = hw2 + sl * rcT - rcT * q9, cyF = r2 + rcT, sw = Math.PI / 2 - fW;
      for (let k = 0; k <= 5; k++) { const f9 = fW - Math.PI + (sw * k) / 5; P(a, -cxF + rcT * Math.cos(f9), cyF + rcT * Math.sin(f9)); }
      for (let k = 0; k <= 5; k++) { const f9 = -Math.PI / 2 + (sw * k) / 5; P(a, cxF + rcT * Math.cos(f9), cyF + rcT * Math.sin(f9)); }
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
   (wedge line) so slots, opening necks, and airgap mesh as separate regions. Winding comes
   from the SAME star-of-slots layers the engine computed (v60.5 — it was a 60° belt rule
   that disagreed with the engine on fractional-slot machines); circuits ship at 0 A. ---- */
function buildFemmLua(p, r) {
  // v60.5: the exporter used to read p.steel / p.rotSteel / p.magTemp — fields that DO NOT
  // EXIST in app state — so every export silently got M19 steel and 20 °C magnets, and it
  // used raw p.poles where the engine rounds to an even count. It now reads the same
  // symbols computeDesign used, so the exported model IS the displayed machine.
  const Ns = r.Ns, poles = r.poles;
  const r0 = p.statorID / 2, r1 = r0 + p.tipH, r2 = r1 + Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0);
  const rOD = p.statorOD / 2, rSh = p.shaftD / 2, rMo = p.rotorOD / 2, rMi = rMo - p.magT;
  const stM = STEELS[p.statorMat] || STEELS["M19 (29 ga)"];
  const rtM = STEELS[p.rotorMat] || STEELS["1018 steel (solid)"];
  const mag = MAGNETS[p.mag] || Object.values(MAGNETS)[0];
  const mu0 = 4e-7 * Math.PI;
  const magT9 = Number.isFinite(p.Top) ? p.Top : 20;
  const BrT9 = (mag.Br || 1.2) * (1 + ((mag.aBr || 0) / 100) * (magT9 - 20)); // Br at the design operating temp
  const HcAm = BrT9 / (mu0 * (mag.mur || 1.05));                   // A/m at Top
  const L = [];
  const P9 = (rr, a) => [ +(rr * Math.cos(a)).toFixed(4), +(rr * Math.sin(a)).toFixed(4) ];
  const node = (x, y) => L.push(`mi_addnode(${x},${y})`);
  const seg = (x1, y1, x2, y2) => L.push(`mi_addsegment(${x1},${y1},${x2},${y2})`);
  const arc = (x1, y1, x2, y2, deg) => L.push(`mi_addarc(${x1},${y1},${x2},${y2},${deg},2)`);
  L.push('-- MotrWorks FEMM export: ' + Ns + ' slots / ' + poles + ' poles, stack ' + p.stackL + ' mm, ' + p.statorMat + ' stator / ' + p.rotorMat + ' rotor, magnets at ' + magT9 + ' C');
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
  // slots: copper trapezoid r1..r2 split at mid-depth into the engine's two winding
  // layers (inner half = airgap-side topLayer, outer half = return botLayer), plus the
  // opening neck r0..r1. Each half carries its OWN phase, sign, and conductor count from
  // r.topLayer/r.botLayer — the same star-of-slots assignment every displayed number used.
  const hwA = (rr) => Math.max(Math.PI / Ns - (p.toothW / 2) / rr, 0.008);
  const soA = (rr) => Math.max((p.slotOpen / 2) / rr, 0.004);
  const rM9 = (r1 + r2) / 2;
  const twoLayer = r.layers === 2 && Array.isArray(r.botLayer) && r.botLayer.length === Ns;
  const PH_NAME = ["A", "B", "C"];
  // v60.6 (Codex): FEMM's turns argument is SERIES turns — strands are parallel copper,
  // not ampere-turns. condPerSlot includes strands (it is a fill quantity), so using it
  // overstated winding MMF by the strand count in loaded solves.
  const condLayer = Math.max(Math.round(p.turns), 1);
  const label9 = (rr, a0, matPH, sgnN) => {
    const [lx, ly] = P9(rr, a0);
    L.push(`mi_addblocklabel(${lx},${ly})`); L.push(`mi_selectlabel(${lx},${ly})`);
    L.push(matPH === null
      ? `mi_setblockprop("Air",1,0,"<None>",0,0,0)`
      : `mi_setblockprop("Copper",1,0,"${matPH}",0,0,${sgnN})`);
    L.push(`mi_clearselected()`);
  };
  for (let s9 = 0; s9 < Ns; s9++) {
    const a0 = (s9 * 2 * Math.PI) / Ns;
    const n1 = hwA(r1), n2 = hwA(r2), nM = hwA(rM9), sA0 = soA(r0), sA1 = soA(r1);
    const c1 = P9(r1, a0 - n1), c2 = P9(r2, a0 - n2), c3 = P9(r2, a0 + n2), c4 = P9(r1, a0 + n1);
    const m1 = P9(rM9, a0 - nM), m2 = P9(rM9, a0 + nM);
    [c1, c2, c3, c4].forEach((q9) => node(q9[0], q9[1]));
    if (twoLayer) { node(m1[0], m1[1]); node(m2[0], m2[1]); }
    if (twoLayer) {
      // side walls in two spans so the mid chord bounds two closed sub-regions
      seg(c1[0], c1[1], m1[0], m1[1]); seg(m1[0], m1[1], c2[0], c2[1]);
      seg(c4[0], c4[1], m2[0], m2[1]); seg(m2[0], m2[1], c3[0], c3[1]);
      seg(m1[0], m1[1], m2[0], m2[1]);                              // layer boundary
    } else {
      seg(c1[0], c1[1], c2[0], c2[1]); seg(c4[0], c4[1], c3[0], c3[1]);
    }
    arc(c2[0], c2[1], c3[0], c3[1], (2 * n2 * 180) / Math.PI);
    seg(c4[0], c4[1], c1[0], c1[1]);
    const o = [P9(r0, a0 - sA0), P9(r1, a0 - sA1), P9(r1, a0 + sA1), P9(r0, a0 + sA0)];
    o.forEach((q9) => node(q9[0], q9[1]));
    seg(o[0][0], o[0][1], o[1][0], o[1][1]); seg(o[1][0], o[1][1], o[2][0], o[2][1]);
    seg(o[2][0], o[2][1], o[3][0], o[3][1]);
    const top9 = r.topLayer && r.topLayer[s9];
    if (twoLayer) {
      const bot9 = r.botLayer[s9];
      label9((r1 + rM9) / 2, a0, top9 ? PH_NAME[top9.phase] : "A", (top9 ? top9.sign : 1) * condLayer);
      label9((rM9 + r2) / 2, a0, bot9 ? PH_NAME[bot9.phase] : "A", (bot9 ? bot9.sign : 1) * condLayer);
    } else {
      label9((r1 + r2) / 2, a0, top9 ? PH_NAME[top9.phase] : "A", (top9 ? top9.sign : 1) * condLayer);
    }
    label9((r0 + r1) / 2, a0, null, 0);                             // opening neck air
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
function parseDxf(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const seqs = [], circles = [];
  let insunits = 0;
  for (let j = 0; j < lines.length - 2; j++) {
    if (lines[j].trim() === "$INSUNITS") { insunits = parseInt(lines[j + 2]) || 0; break; }
  }
  let i = 0;
  const num = (v) => parseFloat(v);
  while (i < lines.length - 1) {
    const code = lines[i].trim(), val = (lines[i + 1] || "").trim();
    i += 2;
    if (code !== "0") continue;
    if (val === "CIRCLE" || val === "ARC") {
      let cx = 0, cy = 0, rr = 0, a0 = 0, a1 = 360;
      while (i < lines.length - 1) {
        const c = lines[i].trim(); if (c === "0") break;
        const v = lines[i + 1]; i += 2;
        if (c === "10") cx = num(v); else if (c === "20") cy = num(v);
        else if (c === "40") rr = num(v);
        else if (c === "50") a0 = num(v); else if (c === "51") a1 = num(v);
      }
      if (rr > 0) {
        circles.push({ cx, cy, r: rr, full: val === "CIRCLE" });
        let sw = val === "CIRCLE" ? 360 : a1 - a0;
        if (val === "CIRCLE") a0 = 0;
        if (sw < 0) sw += 360;
        const n = Math.max(12, Math.round(sw / 2));
        const arcSeq = [];
        for (let t = 0; t <= n; t++) {
          const a = ((a0 + (sw * t) / n) * Math.PI) / 180;
          arcSeq.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
        }
        seqs.push(arcSeq);
      }
    } else if (val === "LWPOLYLINE" || val === "POLYLINE" || val === "VERTEX" || val === "LINE" || val === "SPLINE") {
      // vertices with optional bulge (42) following each point
      let x = null, seq = [], bulges = [];
      while (i < lines.length - 1) {
        const c = lines[i].trim();
        if (c === "0") {
          const nv = (lines[i + 1] || "").trim();
          if (val === "POLYLINE" && (nv === "VERTEX")) { i += 2; continue; } // stitch classic polylines
          if (val === "POLYLINE" && nv === "SEQEND") { i += 2; break; }
          break;
        }
        const v = lines[i + 1]; i += 2;
        if (c === "10" || c === "11") x = num(v);
        else if ((c === "20" || c === "21") && x != null) { seq.push([x, num(v)]); bulges.push(0); x = null; }
        else if (c === "42" && seq.length) bulges[seq.length - 1] = num(v);
      }
      if (seq.length) { seq.bulges = bulges; seqs.push(seq); }
    }
  }
  // densify: expand bulge arcs and subdivide long straight segments
  const allR = [];
  seqs.forEach((q) => q.forEach((p2) => allR.push(Math.hypot(p2[0], p2[1]))));
  const scale = Math.max(...allR, 1);
  const maxSeg = scale / 220;
  const pts = [];
  seqs.forEach((q) => {
    const bl = q.bulges || [];
    for (let j2 = 0; j2 < q.length; j2++) {
      const A = q[j2]; pts.push(A);
      const B = q[j2 + 1]; if (!B) continue;
      const b = bl[j2] || 0;
      if (Math.abs(b) > 1e-6) {
        const th4 = 4 * Math.atan(b);           // included angle of the bulge arc
        const chord = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (chord > 1e-9) {
          const R = chord / (2 * Math.sin(Math.abs(th4) / 2));
          const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
          const d2 = Math.sqrt(Math.max(R * R - (chord / 2) ** 2, 0)) * Math.sign(b) * (Math.abs(th4) > Math.PI ? -1 : 1);
          const ux = -(B[1] - A[1]) / chord, uy = (B[0] - A[0]) / chord;
          const ccx = mx + ux * d2, ccy = my + uy * d2;
          const aA = Math.atan2(A[1] - ccy, A[0] - ccx);
          const n2 = Math.max(4, Math.ceil(Math.abs(th4) / 0.12));
          for (let t = 1; t < n2; t++) {
            const a = aA + (th4 * t) / n2;
            pts.push([ccx + R * Math.cos(a), ccy + R * Math.sin(a)]);
          }
        }
      } else {
        const L2 = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const n2 = Math.floor(L2 / maxSeg);
        for (let t = 1; t <= n2; t++) pts.push([A[0] + ((B[0] - A[0]) * t) / (n2 + 1), A[1] + ((B[1] - A[1]) * t) / (n2 + 1)]);
      }
    }
  });
  return { pts, circles, insunits };
}

function analyzeLam(parsed) {
  const { pts, circles, insunits } = parsed;
  if (pts.length < 20) return null;
  let cx, cy;
  const bigC = circles.filter((c) => c.full).sort((a, b) => b.r - a.r)[0];
  if (bigC) { cx = bigC.cx; cy = bigC.cy; }
  else {
    cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  }
  const rad = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const th = pts.map((p) => Math.atan2(p[1] - cy, p[0] - cx));
  const rMax = Math.max(...rad);
  if (!(rMax > 0)) return null;
  // occupied radial bands (clusters of points), tolerant of 1-bin holes
  const bins = 400, h = new Array(bins).fill(0);
  rad.forEach((r) => { if (r > 1e-9) h[Math.min(bins - 1, Math.floor((r / rMax) * (bins - 1)))]++; });
  const bands = [];
  let b0 = -1;
  for (let b = 0; b <= bins; b++) {
    const occ = b < bins && (h[b] > 0 || (h[b - 1] > 0 && h[b + 1] > 0));
    if (occ && b0 < 0) b0 = b;
    if (!occ && b0 >= 0) { bands.push({ lo: (b0 / bins) * rMax, hi: ((b - 1) / bins) * rMax, n: 0 }); b0 = -1; }
  }
  bands.forEach((bd) => rad.forEach((r) => { if (r >= bd.lo - 1e-9 && r <= bd.hi + 1e-9) bd.n++; }));
  // stator toothed profile = widest band below the OD; rotor = next band below with a clean gap
  const odBand = bands[bands.length - 1];
  const inner = bands.slice(0, -1).filter((bd) => bd.n > pts.length * 0.05);
  let bore = null, slotTop = null, rotor = null;
  if (inner.length) {
    const stat = inner.reduce((a, bd) => ((bd.hi - bd.lo) > (a.hi - a.lo) ? bd : a));
    const binW = rMax / bins;
    let mn = Infinity, mx = 0;
    rad.forEach((rr) => { if (rr >= stat.lo - binW && rr <= stat.hi + binW) { if (rr < mn) mn = rr; if (rr > mx) mx = rr; } });
    bore = mn; slotTop = mx;
    const below = inner.filter((bd) => bd.hi < bore && (bore - bd.hi) < bore * 0.25);
    if (below.length) rotor = below[below.length - 1].hi;
  } else if (odBand && odBand.hi - odBand.lo > rMax * 0.05) {
    bore = odBand.lo; slotTop = odBand.hi; // profile merged with OD band (no separate OD circle)
  }
  // exact-angle extraction: sorted point angles in a radius slice, gaps from consecutive diffs
  const sliceAngles = (r1c, r2c) => {
    const a = [];
    for (let j = 0; j < pts.length; j++) if (rad[j] >= r1c && rad[j] <= r2c) a.push(th[j]);
    return a.sort((x, y) => x - y);
  };
  const gapsOf = (as) => {
    const g = [];
    if (as.length < 8) return g;
    const d = [];
    for (let j = 1; j < as.length; j++) d.push(as[j] - as[j - 1]);
    d.push(as[0] + 2 * Math.PI - as[as.length - 1]);
    const sd = [...d].sort((x, y) => x - y);
    const med = sd[Math.floor(sd.length / 2)] || 1e-4;
    for (let j = 0; j < d.length; j++) {
      if (d[j] > Math.max(5 * med, 0.008)) {
        const a0 = as[j], a1 = j + 1 < as.length ? as[j + 1] : as[0] + 2 * Math.PI;
        g.push({ size: d[j], mid: (a0 + a1) / 2 });
      }
    }
    return g;
  };
  let slots = null, slotOpen = null, tipH = null, toothW = null;
  if (bore != null && slotTop != null && slotTop > bore) {
    const H = slotTop - bore;
    // tip slice: bore arcs interrupted only by the slot openings
    const tipGaps = gapsOf(sliceAngles(bore - H * 0.02, bore + H * 0.05));
    if (tipGaps.length >= 3 && tipGaps.length <= 120) {
      slots = tipGaps.length;
      const gs = tipGaps.map((g) => g.size).sort((x, y) => x - y);
      slotOpen = 2 * bore * Math.sin(gs[Math.floor(gs.length / 2)] / 2);
    }
    // tip height: radius where the slot gap first widens past the opening (null if no shelf exists)
    if (slotOpen) {
      const hSl = H / 24;
      const oc = tipGaps.map((x) => x.mid);
      const nearOpen = (mid, sz) => oc.some((c) => Math.abs(Math.atan2(Math.sin(c - mid), Math.cos(c - mid))) < Math.max(sz / 2 - 0.01, 0.005));
      let prevGm = slotOpen;
      for (let t = 2; t <= 17; t++) {
        const g = gapsOf(sliceAngles(bore + t * hSl - hSl / 2, bore + t * hSl + hSl / 2)).filter((x) => nearOpen(x.mid, x.size));
        if (g.length >= 3) {
          const gs = g.map((x) => 2 * (bore + t * hSl) * Math.sin(x.size / 2)).sort((x, y) => x - y);
          const gm = gs[Math.floor(gs.length / 2)];
          if (gm > slotOpen * 1.2 + 0.05) {
            // real shelf = abrupt widening; smooth growth = continuous wall taper, no shelf feature
            if (prevGm < slotOpen * 1.1 + 0.03) tipH = Math.max((t - 1) * hSl, hSl);
            break;
          }
          prevGm = gm;
        }
      }
    }
    // tooth width from exact wall-gap spans at mid slot height
    const rm = (bore + (tipH || H * 0.15) + slotTop) / 2;
    const midGaps = gapsOf(sliceAngles(rm - H * 0.07, rm + H * 0.07));
    if (slots && midGaps.length >= 3) {
      const centers = tipGaps.map((g) => g.mid);
      const teeth = midGaps.filter((g) => !centers.some((c) =>
        Math.abs(Math.atan2(Math.sin(c - g.mid), Math.cos(c - g.mid))) < g.size / 2 + 0.02));
      if (teeth.length >= 3) {
        const ts = teeth.map((g) => g.size).sort((x, y) => x - y);
        toothW = 2 * rm * Math.sin(ts[Math.floor(ts.length / 2)] / 2);
      }
    }
    // fallback slot count: angular spectrum with sub-harmonic preference
    if (!slots) {
      const selTh = sliceAngles(bore + H * 0.05, slotTop - H * 0.05);
      if (selTh.length > 24) {
        const mag = (k) => { let re = 0, im = 0; selTh.forEach((a) => { re += Math.cos(k * a); im += Math.sin(k * a); }); return Math.hypot(re, im) / selTh.length; };
        let bk = 0, bm = 0;
        for (let k = 3; k <= 120; k++) { const m = mag(k); if (m > bm) { bm = m; bk = k; } }
        if (bm > 0.1) { if (bk % 2 === 0 && mag(bk / 2) > 0.55 * bm) bk = bk / 2; slots = bk; }
      }
    }
  }
  const unitsGuess = insunits === 1 ? "in" : insunits === 4 ? "mm" : rMax < 15 ? "in" : "mm";
  const step = Math.max(1, Math.floor(pts.length / 900));
  const prev = pts.filter((_, j) => j % step === 0).map((p) => [p[0] - cx, p[1] - cy]);
  return { rMax, bore, rotor, slots, slotTop, slotOpen, tipH, toothW, unitsGuess, prev };
}



/* Brushed PM DC construction: stationary housing + magnet ring, rotating slotted armature,
   commutator & brushes at the center. Conductor shading = current direction set by the pole
   above it (solid = in ⊗, faded = return ⊙); shading flips as coils sweep past the brush axis. */
function BrushedSection({ p, r, anim }) {
  const S = 380, cx = S / 2, cy = S / 2;
  const k = (S * 0.44) / (p.statorOD / 2);
  const rHo = (p.statorOD / 2) * k;
  const rMagO = Math.min((p.statorID / 2 + p.magT) * k, rHo - 1.5);
  const rMagI = (p.statorID / 2) * k;
  const rArm = (p.rotorOD / 2) * k;
  const rTipA = Math.max((p.rotorOD / 2 - p.tipH) * k, 1);
  const rBot = Math.max((p.rotorOD / 2 - p.tipH - Math.max(r.hs, 0)) * k, (p.shaftD / 2) * k + 2);
  const rSh = Math.max((p.shaftD / 2) * k, 4);
  const rCom = Math.min(Math.max(rSh * 1.75, rSh + 7), rBot - 3);
  const dir = r.rotation === "CCW" ? -1 : 1;
  const mechA = anim && anim.on ? dir * anim.th * (2 / r.poles) : 0;
  const rotDeg = (mechA * 180) / Math.PI;
  const wrapA = (x) => { let y = x % (2 * Math.PI); if (y > Math.PI) y -= 2 * Math.PI; if (y < -Math.PI) y += 2 * Math.PI; return y; };
  const cov = Math.min(Math.max(p.poleArc / 100, 0.3), 1);
  const half = (Math.PI / r.poles) * cov;
  // field polarity at a global angle: 0 = N, 1 = S, -1 = interpolar gap (commutating zone)
  const polAt = (ang) => {
    const idx = Math.round(((ang + Math.PI / 2) * r.poles) / (2 * Math.PI));
    const c0 = (idx * 2 * Math.PI) / r.poles - Math.PI / 2;
    if (Math.abs(wrapA(ang - c0)) > half) return -1;
    return ((idx % r.poles) + r.poles) % 2;
  };
  const Pt = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;

  // stationary magnet arcs on the housing ID
  const magArcs = [];
  for (let m = 0; m < r.poles; m++) {
    const c0 = (m / r.poles) * 2 * Math.PI - Math.PI / 2;
    const a1 = c0 - half, a2 = c0 + half;
    magArcs.push(
      <g key={"m" + m}>
        <path d={`M ${Pt(rMagO, a1)} A ${rMagO} ${rMagO} 0 0 1 ${Pt(rMagO, a2)} L ${Pt(rMagI, a2)} A ${rMagI} ${rMagI} 0 0 0 ${Pt(rMagI, a1)} Z`}
          fill={m % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.8" />
        {r.poles <= 8 && (rMagO - rMagI) > 9 && (
          <text x={cx + ((rMagO + rMagI) / 2) * Math.cos(c0)} y={cy + ((rMagO + rMagI) / 2) * Math.sin(c0) + 3}
            textAnchor="middle" className="wlbl" style={{ fill: "#fff" }}>{m % 2 ? "S" : "N"}</text>
        )}
      </g>
    );
  }

  // rotating armature: slots opening outward, copper shaded by conductor current direction
  const slots = [];
  const Pc = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
  for (let i = 0; i < r.Ns; i++) {
    const a0 = (i / r.Ns) * 2 * Math.PI - Math.PI / 2;             // local (armature-frame) angle
    const pol = polAt(a0 + mechA);                                  // field over this slot right now
    const op = pol < 0 ? 0.18 : 1;                                  // commutating coils go dim
    const fill = pol === 1 ? "#8FA8C9" : "#E3B341";                 // ⊙ return under S / ⊗ in under N
    const hw1 = ((r.w1 / 2) * k) / rTipA, hw2 = ((r.w2 / 2) * k) / rBot;
    slots.push(
      <g key={i}>
        <polygon points={`${Pc(rBot, a0 - hw2)} ${Pc(rBot, a0 + hw2)} ${Pc(rTipA, a0 + hw1)} ${Pc(rTipA, a0 - hw1)}`}
          fill={fill} opacity={op} stroke={INK} strokeWidth="0.4" />
        <line x1={cx + rTipA * Math.cos(a0)} y1={cy + rTipA * Math.sin(a0)}
          x2={cx + rArm * Math.cos(a0)} y2={cy + rArm * Math.sin(a0)}
          stroke={INK} strokeWidth={Math.max((p.slotOpen * k) / 1.4, 1)} opacity="0.85" />
        {r.Ns <= 30 && <text x={cx + ((rBot + rCom) / 2) * Math.cos(a0)} y={cy + ((rBot + rCom) / 2) * Math.sin(a0) + 2.2}
          textAnchor="middle" className="wnum" style={{ fill: "#1E293B" }}>{i + 1}</text>}
      </g>
    );
  }

  // commutator: one bar per coil (= slots on a double-layer armature), rotates with the armature
  const comBars = [];
  for (let i = 0; i < r.Ns; i++) {
    const a1 = ((i + 0.06) / r.Ns) * 2 * Math.PI - Math.PI / 2;
    const a2 = ((i + 0.94) / r.Ns) * 2 * Math.PI - Math.PI / 2;
    comBars.push(<path key={"cb" + i}
      d={`M ${Pt(rCom, a1)} A ${rCom} ${rCom} 0 0 1 ${Pt(rCom, a2)} L ${Pt(rSh + 1.5, a2)} A ${rSh + 1.5} ${rSh + 1.5} 0 0 0 ${Pt(rSh + 1.5, a1)} Z`}
      fill={i % 2 ? "#B87333" : "#D08A4A"} stroke="#7C4A1E" strokeWidth="0.4" />);
  }

  // stationary brushes on the geometric neutral (interpolar) axis, riding the commutator
  const brushA = -Math.PI / 2 + Math.PI / r.poles;
  const brushes = [0, Math.PI].map((off, j) => {
    const a = brushA + off;
    const bw = Math.max(rCom * 0.32, 7), bl = Math.min(rBot - rCom - 1, 14);
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    const x0 = cx + rCom * ux, y0 = cy + rCom * uy;
    const pts = [
      [x0 + (bw / 2) * vx, y0 + (bw / 2) * vy], [x0 - (bw / 2) * vx, y0 - (bw / 2) * vy],
      [x0 - (bw / 2) * vx + bl * ux, y0 - (bw / 2) * vy + bl * uy], [x0 + (bw / 2) * vx + bl * ux, y0 + (bw / 2) * vy + bl * uy],
    ];
    return (
      <g key={"br" + j}>
        <polygon points={pts.map((q) => q.join(",")).join(" ")} fill="#3F3F46" stroke={INK} strokeWidth="0.8" />
        <text x={cx + (rCom + bl + 8) * ux} y={cy + (rCom + bl + 8) * uy + 3.5}
          textAnchor="middle" className="wlbl" style={{ fill: DKINK, fontSize: 11 }}>{j ? "−" : "+"}</text>
      </g>
    );
  });

  return (
    <svg id="svg-xsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} className="xsec">
      <style>{SVGCSS}</style>
      {/* housing can (flux return) */}
      <circle cx={cx} cy={cy} r={rHo} fill={STEEL} stroke={INK} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rMagO} fill={BG} />
      {magArcs}
      {/* rotating armature */}
      <g transform={`rotate(${rotDeg} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={rArm} fill="#C7CFD8" stroke={INK} strokeWidth="1" />
        {slots}
        <circle cx={cx} cy={cy} r={rBot} fill="#94A3B8" stroke={INK} strokeWidth="0.6" />
        {comBars}
        <circle cx={cx} cy={cy} r={rSh} fill="#5B6874" stroke={INK} />
        <circle cx={cx} cy={cy} r={rSh * 0.35} fill={CREAM} />
      </g>
      {brushes}
      <text x={cx} y={cy + rArm + (rMagI - rArm) / 2 + 3} textAnchor="middle" className="svgLabel"
        style={{ fill: DKINK, fontSize: 12 }}>{r.rotation}</text>
    </svg>
  );
}

/* LATM construction: slotless ring core wound toroidally in discrete sectors (copper striations,
   bare core in the gaps), PM rotor inside, two-wire leads. Travel arc marks the two stop positions;
   ▶ Play toggles the rotor between them with the drive polarity flipping at each reversal. */
function LatmSection({ p, r, anim }) {
  const S = 380, cx = S / 2, cy = S / 2;
  const k = (S * 0.42) / (p.statorOD / 2);
  const rCo = (p.statorOD / 2) * k, rCi = (p.statorID / 2) * k;
  // v60.5: draw the REAL copper build, not a 10 px cap — the engine's buildX (worst-case
  // crossover stack) governs the ID side, so a coil the numbers say touches the magnets
  // now LOOKS like it touches the magnets. Capping the drawing hid exactly the
  // interference this cross-section exists to show.
  const buildX9 = r && r.latm && Number.isFinite(r.latm.buildX) ? r.latm.buildX : 0;
  const twv = Math.max(p.latmWind, 0.5) * k;
  const twvIn = Math.max(p.latmWind, buildX9, 0.5) * k;
  const rWo = rCo + twv, rWi = Math.max(rCi - twvIn, 8); // winding wrap past both faces
  const rRot = (p.rotorOD / 2) * k, rSh = Math.max((p.shaftD / 2) * k, 4);
  const sect = Math.max(Math.round(p.latmSect), 1);
  const spanR = (Math.max(p.latmSpan, 5) * Math.PI) / 180;
  const Pt = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;

  // toggle animation: rotor eases between the two stops; polarity flips each reversal
  const trav = ((r.latm ? r.latm.travel : p.latmTravel) * Math.PI) / 180;
  const phase = anim && anim.on ? Math.sin(anim.th * 0.7) : 1;      // −1..+1, parked at stop B when idle
  const ease = Math.tanh(2.2 * phase) / Math.tanh(2.2);
  const rotA = (trav / 2) * ease;                                    // mech angle about the peak center
  const pol = phase >= 0 ? 1 : -1;                                   // drive polarity for this half-stroke
  const rotDeg = (rotA * 180) / Math.PI;

  // winding sectors: dense radial striations across the ring, bare core in the gaps
  const stri = [];
  for (let s5 = 0; s5 < sect; s5++) {
    const c0 = (s5 * 2 * Math.PI) / sect - Math.PI / 2;
    const nW = Math.max(Math.round((spanR * rCo) / 4.2), 6);         // striation count by arc length
    for (let j5 = 0; j5 <= nW; j5++) {
      const a = c0 - spanR / 2 + (spanR * j5) / nW;
      stri.push(<line key={`w${s5}-${j5}`} x1={cx + rWi * Math.cos(a)} y1={cy + rWi * Math.sin(a)}
        x2={cx + rWo * Math.cos(a)} y2={cy + rWo * Math.sin(a)} stroke="#B87333" strokeWidth="1.6" />);
    }
    // sector polarity marker: ⊗ / ⊙ current direction, flips with drive polarity
    const dirS = ((s5 % 2 === 0 ? 1 : -1) * pol) > 0;
    const mx = cx + ((rCi + rCo) / 2) * Math.cos(c0), my = cy + ((rCi + rCo) / 2) * Math.sin(c0);
    stri.push(<g key={`m${s5}`}>
      <circle cx={mx} cy={my} r="5.5" fill="#FFF" stroke="#7C4A1E" strokeWidth="1" />
      {dirS
        ? <g stroke="#7C4A1E" strokeWidth="1.2">
            <line x1={mx - 3} y1={my - 3} x2={mx + 3} y2={my + 3} />
            <line x1={mx - 3} y1={my + 3} x2={mx + 3} y2={my - 3} />
          </g>
        : <circle cx={mx} cy={my} r="1.8" fill="#7C4A1E" />}
    </g>);
  }

  // rotor magnet arcs
  const magArcs = [];
  const cov = Math.min(Math.max(p.poleArc / 100, 0.3), 1);
  for (let m5 = 0; m5 < r.poles; m5++) {
    const c0 = (m5 / r.poles) * 2 * Math.PI - Math.PI / 2;
    const half = (Math.PI / r.poles) * cov;
    const tM = Math.min(Math.max(p.magT * k, 3), rRot * 0.5);
    magArcs.push(<path key={"rm" + m5}
      d={`M ${Pt(rRot, c0 - half)} A ${rRot} ${rRot} 0 0 1 ${Pt(rRot, c0 + half)} L ${Pt(rRot - tM, c0 + half)} A ${rRot - tM} ${rRot - tM} 0 0 0 ${Pt(rRot - tM, c0 - half)} Z`}
      fill={m5 % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.8" />);
  }

  // PM gap flux + torque-zone concentration: arrows at each pole face crossing the
  // working gap (out = N red, in = S blue), riding the rotor; where a pole face overlaps
  // a sector whose current direction drives THIS half-stroke, the flux draws heavy and a
  // green band marks the torque zone - concentration visibly migrates as the rotor swings
  const flux = [];
  {
    const rG0 = rRot + 1, rG1 = Math.max(rCi - twv - 1, rRot + 6);   // across the working gap
    const wrap = (x5) => Math.atan2(Math.sin(x5), Math.cos(x5));
    const half = (Math.PI / r.poles) * cov;
    for (let m5 = 0; m5 < r.poles; m5++) {
      const thP = (m5 / r.poles) * 2 * Math.PI - Math.PI / 2 + rotA; // pole center, rotor frame -> static
      const polP = m5 % 2 === 0 ? 1 : -1;                            // even poles = N (red), flux outward
      // torque-zone overlap bands with each sector
      for (let s5 = 0; s5 < sect; s5++) {
        const c0s = (s5 * 2 * Math.PI) / sect - Math.PI / 2;
        const drive = polP * (s5 % 2 === 0 ? 1 : -1) > 0;            // force along this half-stroke
        if (!drive) continue;
        const dC = wrap(thP - c0s);
        const lo = Math.max(dC - half, -spanR / 2), hi = Math.min(dC + half, spanR / 2);
        if (hi - lo < 0.03) continue;
        const aL = c0s + lo, aH = c0s + hi, rB = (rG0 + rG1) / 2;
        flux.push(<path key={`tz${m5}-${s5}`} d={`M ${Pt(rB, aL)} A ${rB} ${rB} 0 ${hi - lo > Math.PI ? 1 : 0} 1 ${Pt(rB, aH)}`}
          fill="none" stroke="#059669" strokeWidth={rG1 - rG0} opacity="0.22" strokeLinecap="round" />);
      }
      // flux arrows across the pole face (5 per pole)
      for (let j5 = 0; j5 < 5; j5++) {
        const aF = thP - half * 0.8 + (half * 1.6 * j5) / 4;
        // heavy where an in-drive sector sits under this station
        let hot = false;
        for (let s5 = 0; s5 < sect; s5++) {
          const c0s = (s5 * 2 * Math.PI) / sect - Math.PI / 2;
          if (Math.abs(wrap(aF - c0s)) < spanR / 2 && polP * (s5 % 2 === 0 ? 1 : -1) > 0) { hot = true; break; }
        }
        const rA = polP > 0 ? rG0 : rG1, rBx = polP > 0 ? rG1 : rG0;  // N: outward, S: inward
        const x1f = cx + rA * Math.cos(aF), y1f = cy + rA * Math.sin(aF);
        const x2f = cx + rBx * Math.cos(aF), y2f = cy + rBx * Math.sin(aF);
        const ang = Math.atan2(y2f - y1f, x2f - x1f);
        const col = polP > 0 ? "#C14B3E" : "#4A76B8";
        flux.push(<g key={`fx${m5}-${j5}`} opacity={hot ? 0.95 : 0.4}>
          <line x1={x1f} y1={y1f} x2={x2f} y2={y2f} stroke={col} strokeWidth={hot ? 2.2 : 1.1} />
          <path d={`M ${x2f} ${y2f} L ${x2f - 4.5 * Math.cos(ang - 0.42)} ${y2f - 4.5 * Math.sin(ang - 0.42)} L ${x2f - 4.5 * Math.cos(ang + 0.42)} ${y2f - 4.5 * Math.sin(ang + 0.42)} Z`} fill={col} />
        </g>);
      }
    }
  }
  // travel arc between the two stops, drawn in the airgap
  const rTr = (rRot + rCi - twv) / 2 + 2;
  const aA = -Math.PI / 2 - trav / 2, aB = -Math.PI / 2 + trav / 2;
  const leadA = -Math.PI / 2 + Math.PI / sect;                       // leads exit between sectors
  return (
    <svg id="svg-xsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} className="xsec">
      <style>{SVGCSS}</style>
      {/* ring core + toroidal winding wrap */}
      <circle cx={cx} cy={cy} r={rCo} fill={STEEL} stroke={INK} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rCi} fill={BG} />
      {stri}
      {flux}
      <circle cx={cx} cy={cy} r={rCo} fill="none" stroke={INK} strokeWidth="0.7" opacity="0.5" />
      <circle cx={cx} cy={cy} r={rCi} fill="none" stroke={INK} strokeWidth="0.7" opacity="0.5" />
      {/* two-wire leads with live polarity */}
      <line x1={cx + rWo * Math.cos(leadA)} y1={cy + rWo * Math.sin(leadA)}
        x2={cx + (rWo + 16) * Math.cos(leadA - 0.05)} y2={cy + (rWo + 16) * Math.sin(leadA - 0.05)} stroke="#B91C1C" strokeWidth="2.2" />
      <line x1={cx + rWo * Math.cos(leadA + 0.09)} y1={cy + rWo * Math.sin(leadA + 0.09)}
        x2={cx + (rWo + 16) * Math.cos(leadA + 0.14)} y2={cy + (rWo + 16) * Math.sin(leadA + 0.14)} stroke="#1E293B" strokeWidth="2.2" />
      <text x={cx + (rWo + 24) * Math.cos(leadA - 0.05)} y={cy + (rWo + 24) * Math.sin(leadA - 0.05) + 3}
        textAnchor="middle" className="wlbl" style={{ fill: "#B91C1C", fontSize: 11 }}>{pol > 0 ? "+" : "−"}</text>
      <text x={cx + (rWo + 24) * Math.cos(leadA + 0.14)} y={cy + (rWo + 24) * Math.sin(leadA + 0.14) + 3}
        textAnchor="middle" className="wlbl" style={{ fill: "#1E293B", fontSize: 11 }}>{pol > 0 ? "−" : "+"}</text>
      {/* rotor */}
      <g transform={`rotate(${rotDeg} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={rRot} fill={STEEL_DK} stroke={INK} strokeWidth="1" />
        {magArcs}
        <circle cx={cx} cy={cy} r={rSh} fill="#5B6874" stroke={INK} />
        <circle cx={cx} cy={cy} r={rSh * 0.35} fill={CREAM} />
        <line x1={cx} y1={cy - rSh - 1} x2={cx} y2={cy - rRot * 0.92} stroke={CREAM} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* travel arc + stops */}
      <path d={`M ${Pt(rTr, aA)} A ${rTr} ${rTr} 0 ${trav > Math.PI ? 1 : 0} 1 ${Pt(rTr, aB)}`}
        fill="none" stroke={PEACH} strokeWidth="2" strokeDasharray="4 3" />
      {[["A", aA], ["B", aB]].map(([lb, a5]) => (
        <g key={lb}>
          <line x1={cx + (rTr - 5) * Math.cos(a5)} y1={cy + (rTr - 5) * Math.sin(a5)}
            x2={cx + (rTr + 5) * Math.cos(a5)} y2={cy + (rTr + 5) * Math.sin(a5)} stroke={PEACH} strokeWidth="2.5" />
          <text x={cx + (rTr - 13) * Math.cos(a5)} y={cy + (rTr - 13) * Math.sin(a5) + 3.5}
            textAnchor="middle" className="wlbl" style={{ fill: PEACH, fontSize: 11 }}>{lb}</text>
        </g>
      ))}
      <text x={cx} y={S - 10} textAnchor="middle" className="wnum">
        travel {(r.latm ? r.latm.travel : p.latmTravel).toFixed(0)}° · {sect} sectors × {p.latmSpan}° · ⊗/⊙ = conductor current per sector (one toroidal winding, flips with drive) · arrows = PM gap flux, heavy + green where it links a driving sector</text>
    </svg>
  );
}

/* Torque vs angle: the LATM's defining chart — both drive polarities over the toggle travel,
   stops marked with holding torque, zero-crossing = electrical travel limit. */
function TorqueAngleChart({ r, us }) {
  if (!r.latm || !r.latm.thArr) return null;
  const W = 340, H = 250, mL = 50, mB = 34, mT = 12, mR = 12;
  const lt = r.latm;
  const cu = us === "in"
    ? (lt.Tpk * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : (lt.Tpk < 0.5 ? { k: 1000, u: "mN·m" } : { k: 1, u: "N·m" });
  const thMax = Math.max(...lt.thArr.map(Math.abs), 1);
  const tMax = Math.max(lt.Tpk * cu.k, 1e-6) * 1.12;
  const X = (deg) => mL + ((W - mL - mR) * (deg + thMax)) / (2 * thMax);
  const Y = (t) => (mT + (H - mB - mT) / 2) - ((t * cu.k) / tMax) * ((H - mB - mT) / 2);
  const tr = (sgn) => lt.thArr.map((d, i) => `${i ? "L" : "M"}${X(d).toFixed(1)},${Y(sgn * lt.tArr[i]).toFixed(1)}`).join(" ");
  const sA = lt.travel / 2;
  return (
    <svg id="svg-tang" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {/* usable travel band */}
      <rect x={X(-sA)} y={mT} width={Math.max(X(sA) - X(-sA), 0)} height={H - mB - mT} fill={PEACH} opacity="0.08" />
      {[-1, -0.5, 0, 0.5, 1].map((f, i) => (
        <g key={"g" + i}>
          <line x1={mL} x2={W - mR} y1={Y((f * tMax) / cu.k)} y2={Y((f * tMax) / cu.k)} stroke={PAPER_LINE} strokeWidth={f === 0 ? 1.4 : 0.7} />
          <text x={mL - 5} y={Y((f * tMax) / cu.k) + 3} textAnchor="end" className="tick">{(f * tMax).toFixed(tMax < 5 ? 1 : 0)}</text>
        </g>
      ))}
      {[-1, -0.5, 0, 0.5, 1].map((f, i) => (
        <text key={"x" + i} x={X(f * thMax)} y={H - mB + 13} textAnchor="middle" className="tick">{(f * thMax).toFixed(0)}°</text>
      ))}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      {/* zero-torque angles (electrical limits) */}
      {[lt.zeroAng, -lt.zeroAng].map((z, i) => (
        <line key={"z" + i} x1={X(z)} x2={X(z)} y1={mT} y2={H - mB} stroke="#DC2626" strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
      ))}
      <text x={X(lt.zeroAng)} y={mT + 10} textAnchor="middle" className="tick" fill="#DC2626">T=0</text>
      {/* both polarities */}
      <path d={tr(1)} fill="none" stroke={COPPER} strokeWidth="2.4" />
      <path d={tr(-1)} fill="none" stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="5 4" opacity="0.6" />
      {/* stops with holding torque */}
      {[[sA, lt.Tstop], [-sA, -lt.Tstop]].map(([d, t], i) => (
        <g key={"s" + i}>
          <line x1={X(d)} x2={X(d)} y1={mT} y2={H - mB} stroke={PEACH} strokeWidth="1.6" />
          <circle cx={X(d)} cy={Y(t)} r="4.5" fill={DKINK} />
        </g>
      ))}
      <text x={X(sA) + 5} y={Y(lt.Tstop) - 7} className="tick" fontWeight="600">
        stop B · {(lt.Tstop * cu.k).toFixed(lt.Tstop * cu.k < 10 ? 2 : 1)} {cu.u}</text>
      <text x={X(-sA) - 5} y={Y(-lt.Tstop) + 14} textAnchor="end" className="tick" fontWeight="600">stop A</text>
      <text x={X(0) + 4} y={Y(lt.Tpk) - 5} className="tick">peak {(lt.Tpk * cu.k).toFixed(lt.Tpk * cu.k < 10 ? 2 : 1)} {cu.u}</text>
      <text x={mL + 6} y={H - mB - 6} className="tick" fill={COPPER}>+ polarity</text>
      <text x={mL + 6} y={mT + 12} className="tick" fill={STEEL_DK}>− polarity (dashed)</text>
      <text x={(W + mL) / 2} y={H - 5} textAnchor="middle" className="axis">rotor angle from travel center (mech deg)</text>
      <text x={12} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 12 ${(H - mB) / 2})`}>torque ({cu.u}) @ {r.latm.Idrv.toFixed(1)} A</text>
    </svg>
  );
}

/* Stepper construction. Hybrid: toothed rotor (one cup shown; the second sits behind, offset half a
   tooth pitch, with the PM disc between — see the axial view), 8 salient stator poles with face teeth
   and phase coils A/B. PM type: magnet-arc rotor like a BLDC. ▶ Play single-steps the rotor with the
   energized phase pair highlighted in sequence A+ B+ A− B−. */
function StepperSection({ p, r, anim }) {
  const S = 380, cx = S / 2, cy = S / 2;
  const st = r.step || {};
  const hyb = (p.stpKind || "hybrid") !== "pm";
  const k = (S * 0.44) / (p.statorOD / 2);
  const rOD = (p.statorOD / 2) * k, rBore = (p.statorID / 2) * k;
  const rYk = rOD - Math.max(p.yoke * k, 6);
  const rRot = (p.rotorOD / 2) * k, rSh = Math.max((p.shaftD / 2) * k, 4);
  const rHub = Math.max(((p.stpHubD > 0 ? p.stpHubD : 1.6 * p.shaftD) / 2) * k, rSh + 1.5);
  const rThru = Math.max(p.stpThruD || 0, 0) > 0 ? Math.max(((p.stpThruD) / 2) * k, 2) : 0;
  const NsP = Math.max(Math.round(p.slots), 4);
  const kE = st.kE || (hyb ? Math.max(Math.round(p.stpNr), 12) : Math.max(Math.round(p.stpPP), 2));
  const stepA = st.angle || 90 / kE;
  const Pt = (rad, a) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;

  // stepping animation: dwell + quick move per step; energized phase cycles A+ B+ A− B−
  let stepIdx = 0, frac = 1;
  if (anim && anim.on) {
    const tt = anim.th * 0.5;
    stepIdx = Math.floor(tt);
    frac = Math.min((tt - stepIdx) * 3, 1);                          // move in the first third, dwell after
    frac = 0.5 - 0.5 * Math.cos(Math.PI * frac);                     // eased
  }
  const rotDeg = (stepIdx + frac - 1) * stepA;
  const phSeq = ["A+", "B+", "A−", "B−"];
  const phLive = phSeq[((stepIdx % 4) + 4) % 4];

  // stator poles with coils; phases alternate A B A B … around the ring
  const poles = [], faceTeethN = hyb ? Math.max(st.teethPP || 3, 1) : 0;
  for (let i6 = 0; i6 < NsP; i6++) {
    const a0 = (i6 * 2 * Math.PI) / NsP - Math.PI / 2;
    const isA = i6 % 2 === 0;
    const lbl = (isA ? "A" : "B") + (Math.floor(i6 / 2) % 2 === 0 ? "" : "′");
    const live = anim && anim.on && phLive.startsWith(isA ? "A" : "B");
    const wBody = Math.max(p.toothW * k, 10);
    const ux = Math.cos(a0), uy = Math.sin(a0), vx = -uy, vy = ux;
    const faceHalf = ((Math.PI * rBore) / NsP) * 0.42;
    // pole body (radial rect) + face arc
    const b1 = [cx + rYk * ux + (wBody / 2) * vx, cy + rYk * uy + (wBody / 2) * vy];
    const b2 = [cx + rYk * ux - (wBody / 2) * vx, cy + rYk * uy - (wBody / 2) * vy];
    const b3 = [cx + (rBore + 3) * ux - (wBody / 2) * vx, cy + (rBore + 3) * uy - (wBody / 2) * vy];
    const b4 = [cx + (rBore + 3) * ux + (wBody / 2) * vx, cy + (rBore + 3) * uy + (wBody / 2) * vy];
    const aF = faceHalf / rBore;
    poles.push(
      <g key={"sp" + i6}>
        <polygon points={[b1, b2, b3, b4].map((q) => q.join(",")).join(" ")} fill={STEEL} stroke={INK} strokeWidth="0.9" />
        {/* wound coil: bundle bands hugging both pole-body flanks (section view of the winding),
            drawn in absolute coordinates so they stay between yoke and pole face at every angle */}
        {(() => {
          const rc1 = rBore + 7, rc2 = rYk - 2.5;                    // radial span: above the face, under the yoke
          const clrArc = ((2 * Math.PI * rc1) / NsP - wBody) / 2;    // circumferential room to the next pole
          const cw = Math.max(Math.min(9, clrArc - 2), 3);           // coil band thickness
          const fillC = live ? (isA ? "#E8933A" : "#5B8DEF") : isA ? "#E2B98B" : "#A9C3EF";
          const band = (sgn, kq) => (
            <polygon key={kq} points={[
              [cx + rc1 * ux + sgn * (wBody / 2 + 0.8) * vx, cy + rc1 * uy + sgn * (wBody / 2 + 0.8) * vy],
              [cx + rc2 * ux + sgn * (wBody / 2 + 0.8) * vx, cy + rc2 * uy + sgn * (wBody / 2 + 0.8) * vy],
              [cx + rc2 * ux + sgn * (wBody / 2 + 0.8 + cw) * vx, cy + rc2 * uy + sgn * (wBody / 2 + 0.8 + cw) * vy],
              [cx + rc1 * ux + sgn * (wBody / 2 + 0.8 + cw) * vx, cy + rc1 * uy + sgn * (wBody / 2 + 0.8 + cw) * vy],
            ].map((q) => q.join(",")).join(" ")} fill={fillC} stroke="#7C4A1E" strokeWidth="0.7" opacity={live ? 1 : 0.85} />
          );
          return <g>{band(1, "cbA")}{band(-1, "cbB")}
            {/* winding hatching: a few turn lines across each band */}
            {[0.25, 0.5, 0.75].map((f6, i7) => {
              const rr = rc1 + (rc2 - rc1) * f6;
              return <g key={"tl" + i7}>
                <line x1={cx + rr * ux + (wBody / 2 + 0.8) * vx} y1={cy + rr * uy + (wBody / 2 + 0.8) * vy}
                  x2={cx + rr * ux + (wBody / 2 + 0.8 + cw) * vx} y2={cy + rr * uy + (wBody / 2 + 0.8 + cw) * vy}
                  stroke="#7C4A1E" strokeWidth="0.45" opacity="0.55" />
                <line x1={cx + rr * ux - (wBody / 2 + 0.8) * vx} y1={cy + rr * uy - (wBody / 2 + 0.8) * vy}
                  x2={cx + rr * ux - (wBody / 2 + 0.8 + cw) * vx} y2={cy + rr * uy - (wBody / 2 + 0.8 + cw) * vy}
                  stroke="#7C4A1E" strokeWidth="0.45" opacity="0.55" />
              </g>;
            })}
          </g>;
        })()}
        {/* pole face arc with stator teeth (hybrid) */}
        <path d={`M ${Pt(rBore + 3.5, a0 - aF)} A ${rBore + 3.5} ${rBore + 3.5} 0 0 1 ${Pt(rBore + 3.5, a0 + aF)} L ${Pt(rBore, a0 + aF)} A ${rBore} ${rBore} 0 0 0 ${Pt(rBore, a0 - aF)} Z`}
          fill={STEEL} stroke={INK} strokeWidth="0.8" />
        {hyb && Array.from({ length: faceTeethN }, (_, tj) => {
          const at = a0 - aF + ((tj + 0.5) * 2 * aF) / faceTeethN;
          const tw6 = (aF * 2 * rBore) / faceTeethN * 0.5;
          return <path key={"ft" + tj}
            d={`M ${Pt(rBore, at - tw6 / 2 / rBore)} L ${Pt(rBore - 3, at - tw6 / 2 / rBore)} L ${Pt(rBore - 3, at + tw6 / 2 / rBore)} L ${Pt(rBore, at + tw6 / 2 / rBore)} Z`}
            fill={STEEL} stroke={INK} strokeWidth="0.6" />;
        })}
        <text x={cx + (rYk + (rOD - rYk) / 2 - 2) * ux} y={cy + (rYk + (rOD - rYk) / 2 - 2) * uy + 3}
          textAnchor="middle" className="wlbl" style={{ fill: isA ? "#B45309" : "#1D4ED8", fontSize: 10 }}>{lbl}</text>
      </g>
    );
  }

  // rotor: hybrid = toothed cup; PM = magnet arcs
  const rotorBits = [];
  if (hyb) {
    const nT = Math.min(kE, 120);
    const tDep = Math.max(Math.min(rRot * 0.09, 6), 2.5);
    let d6 = "";
    for (let j6 = 0; j6 < nT; j6++) {
      const a1 = (j6 / nT) * 2 * Math.PI, a2 = ((j6 + 0.42) / nT) * 2 * Math.PI, a3 = ((j6 + 0.5) / nT) * 2 * Math.PI, a4 = ((j6 + 0.92) / nT) * 2 * Math.PI;
      d6 += (j6 ? "L" : "M") + Pt(rRot, a1) + ` A ${rRot} ${rRot} 0 0 1 ` + Pt(rRot, a2) +
        " L " + Pt(rRot - tDep, a3) + ` A ${rRot - tDep} ${rRot - tDep} 0 0 1 ` + Pt(rRot - tDep, a4) + " L " + Pt(rRot, (j6 + 1) / nT * 2 * Math.PI);
    }
    rotorBits.push(<path key="cup" d={d6 + " Z"} fill={STEEL_DK} stroke={INK} strokeWidth="0.8" />);
    rotorBits.push(<circle key="hubl" cx={cx} cy={cy} r={rRot - tDep - 1} fill={STEEL_DK} stroke="none" />);
    rotorBits.push(<text key="cupn" x={cx} y={cy + rRot * 0.55} textAnchor="middle" className="wnum">cup 1 of 2 · N pole</text>);
  } else {
    rotorBits.push(<circle key="pmc" cx={cx} cy={cy} r={rRot} fill={STEEL_DK} stroke={INK} strokeWidth="1" />);
    const npol = 2 * kE, tM = Math.min(Math.max(p.magT * k, 3), rRot * 0.45);
    for (let m6 = 0; m6 < npol; m6++) {
      const c0 = (m6 / npol) * 2 * Math.PI - Math.PI / 2, half = (Math.PI / npol) * 0.9;
      rotorBits.push(<path key={"pm" + m6}
        d={`M ${Pt(rRot, c0 - half)} A ${rRot} ${rRot} 0 0 1 ${Pt(rRot, c0 + half)} L ${Pt(rRot - tM, c0 + half)} A ${rRot - tM} ${rRot - tM} 0 0 0 ${Pt(rRot - tM, c0 - half)} Z`}
        fill={m6 % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.6" />);
    }
  }

  // one-full-step arc marker in the gap
  const rMk = (rRot + rBore) / 2 + 1;
  const aS0 = -Math.PI / 2, aS1 = -Math.PI / 2 + (stepA * Math.PI) / 180;
  return (
    <svg id="svg-xsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} className="xsec">
      <style>{SVGCSS}</style>
      <circle cx={cx} cy={cy} r={rOD} fill={STEEL} stroke={INK} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rYk} fill={BG} />
      {poles}
      <g transform={`rotate(${rotDeg} ${cx} ${cy})`}>
        {rotorBits}
        <circle cx={cx} cy={cy} r={rHub} fill="#6B7885" stroke={INK} strokeWidth="0.9" />
        <circle cx={cx} cy={cy} r={rSh} fill="#5B6874" stroke={INK} />
        {rThru > 0
          ? <circle cx={cx} cy={cy} r={rThru} fill={BG} stroke={INK} strokeWidth="0.9" strokeDasharray="3 2" />
          : <circle cx={cx} cy={cy} r={rSh * 0.35} fill={CREAM} />}
        <line x1={cx} y1={cy - rSh - 1} x2={cx} y2={cy - rRot * 0.9} stroke={CREAM} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      {/* step marker */}
      <path d={`M ${Pt(rMk, aS0)} A ${rMk} ${rMk} 0 0 1 ${Pt(rMk, aS1)}`} fill="none" stroke={PEACH} strokeWidth="2.4" />
      {[aS0, aS1].map((a6, i6) => <line key={"mk" + i6} x1={cx + (rMk - 4) * Math.cos(a6)} y1={cy + (rMk - 4) * Math.sin(a6)}
        x2={cx + (rMk + 4) * Math.cos(a6)} y2={cy + (rMk + 4) * Math.sin(a6)} stroke={PEACH} strokeWidth="2" />)}
      <text x={cx + (rMk + 12) * Math.cos((aS0 + aS1) / 2)} y={cy + (rMk + 12) * Math.sin((aS0 + aS1) / 2) + 3}
        className="wlbl" style={{ fill: PEACH, fontSize: 10 }} textAnchor="middle">{stepA.toFixed(stepA < 10 ? 1 : 0)}°</text>
      {anim && anim.on && <text x={S - 14} y={20} textAnchor="end" className="wnum">energized: {phLive}</text>}
      <text x={cx} y={S - 8} textAnchor="middle" className="wnum">
        {hyb ? `${kE}-tooth rotor cup · ${NsP} poles × ${faceTeethN} face teeth · second cup offset ½ pitch (axial view)` :
          `${2 * kE}-pole PM rotor · ${NsP} salient poles · ${stepA.toFixed(0)}°/step`}</text>
    </svg>
  );
}

/* Stepper torque vs angle: restoring curve of the energized phase about its detent position, the next
   step's curve (handoff), and the unpowered detent torque. */
function StepperTorqueChart({ r, us }) {
  if (!r.step || !r.step.thArr) return null;
  const st = r.step;
  const W = 340, H = 250, mL = 50, mB = 34, mT = 12, mR = 12;
  const cu = us === "in"
    ? (st.Th * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : (st.Th < 0.5 ? { k: 1000, u: "mN·m" } : { k: 1, u: "N·m" });
  const thMax = Math.max(...st.thArr.map(Math.abs));
  const tMax = st.Th * cu.k * 1.12;
  const X = (d) => mL + ((W - mL - mR) * (d + thMax)) / (2 * thMax);
  const Y = (t) => (mT + (H - mB - mT) / 2) - ((t * cu.k) / tMax) * ((H - mB - mT) / 2);
  const path = (arr) => st.thArr.map((d, i) => `${i ? "L" : "M"}${X(d).toFixed(1)},${Y(arr[i]).toFixed(1)}`).join(" ");
  return (
    <svg id="svg-tang" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {[-1, -0.5, 0, 0.5, 1].map((f, i) => (
        <g key={"g" + i}>
          <line x1={mL} x2={W - mR} y1={Y((f * tMax) / cu.k)} y2={Y((f * tMax) / cu.k)} stroke={PAPER_LINE} strokeWidth={f === 0 ? 1.4 : 0.7} />
          <text x={mL - 5} y={Y((f * tMax) / cu.k) + 3} textAnchor="end" className="tick">{(f * tMax).toFixed(tMax < 5 ? 1 : 0)}</text>
        </g>
      ))}
      {/* step-position gridlines */}
      {[-2, -1, 0, 1, 2].map((n6) => (
        <g key={"sg" + n6}>
          <line x1={X(n6 * st.angle)} x2={X(n6 * st.angle)} y1={mT} y2={H - mB} stroke={PAPER_LINE} strokeWidth="0.8" strokeDasharray="3 3" />
          <text x={X(n6 * st.angle)} y={H - mB + 13} textAnchor="middle" className="tick">{n6 === 0 ? "0" : (n6 * st.angle).toFixed(st.angle < 10 ? 1 : 0) + "°"}</text>
        </g>
      ))}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      {/* curves: energized, next step (handoff), detent */}
      <path d={path(st.tArr)} fill="none" stroke="#C2410C" strokeWidth="2.4" />
      <path d={path(st.tNxt)} fill="none" stroke="#5B8DEF" strokeWidth="1.6" opacity="0.7" />
      <path d={path(st.tDet)} fill="none" stroke={STEEL_DK} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />
      {/* equilibrium + pull-out markers */}
      <circle cx={X(0)} cy={Y(0)} r="4.5" fill={DKINK} />
      <circle cx={X(st.angle)} cy={Y(0)} r="3.5" fill="none" stroke="#5B8DEF" strokeWidth="1.6" />
      <circle cx={X(-st.angle)} cy={Y(st.Th)} r="3.5" fill="#C2410C" />
      <text x={X(-st.angle)} y={Y(st.Th) - 8} textAnchor="middle" className="tick" fontWeight="600">
        pull-out {(st.Th * cu.k).toFixed(st.Th * cu.k < 10 ? 2 : 1)} {cu.u}</text>
      <text x={X(0) + 5} y={Y(0) + 14} className="tick" fontWeight="600">holds here</text>
      <text x={X(st.angle)} y={Y(0) - 8} textAnchor="middle" className="tick" fill="#5B8DEF">next step</text>
      <text x={mL + 6} y={mT + 12} className="tick" fill="#C2410C">energized ({st.on2 ? "2" : "1"}-phase-on)</text>
      <text x={mL + 6} y={mT + 24} className="tick" fill="#5B8DEF">after phase advance</text>
      <text x={mL + 6} y={mT + 36} className="tick" fill={STEEL_DK}>detent (unpowered, dashed)</text>
      <text x={(W + mL) / 2} y={H - 5} textAnchor="middle" className="axis">rotor angle from detent (mech deg)</text>
      <text x={12} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 12 ${(H - mB) / 2})`}>torque ({cu.u}) @ {""}rated I</text>
    </svg>
  );
}

/* Developed (unrolled) armature winding: slots along the top, commutator bars along the bottom.
   Each coil runs top-layer side up one slot, spans to its bottom-layer side, and lands on the
   commutator — adjacent bars for lap, ~C/(p/2) apart for wave. Two coils are highlighted. */
function BrushedWindingDiagram({ p, r }) {
  if (!r.brush) return null;
  const Ns = r.Ns, C = r.brush.segs, span = r.span, plex = Math.max(Math.round(p.paths), 1);
  const wave = p.pattern === "wave";
  const halfP = Math.max(Math.round(r.poles / 2), 1);
  // commutator pitch: lap = ±plex; wave = (C ± plex)/(p/2) (progressive if it divides, else retrogressive)
  let yc = plex;
  if (wave) {
    if ((C - plex) % halfP === 0) yc = (C - plex) / halfP;
    else if ((C + plex) % halfP === 0) yc = (C + plex) / halfP;
    else yc = Math.round((C - plex) / halfP);
  }
  const W = 360, H = 235, mL = 18, mR = 18;
  const pitch = (W - mL - mR) / Ns;
  const ySlot = 34, yApex = 78, yBarT = 168, yBar = 186, yBrush = 205;
  const xS = (i) => mL + (((i % Ns) + Ns) % Ns) * pitch + pitch / 2;
  const xU = (i) => mL + i * pitch + pitch / 2;                      // unwrapped x
  const coils = [];
  for (let i = 0; i < Ns; i++) {
    const hot = i === 0 || i === 1;
    const col = i === 0 ? "#C2410C" : i === 1 ? "#5B8DEF" : "#B9BFC9";
    const sw = hot ? 2.2 : 0.9, op = hot ? 1 : 0.5;
    const b1 = wave ? i + yc : i + plex;
    // one coil drawn unwrapped at offset 0 and −Ns·pitch (viewBox clips the rest)
    for (const off of [0, -Ns * pitch]) {
      if (off !== 0 && xU(i + span) + off < mL - pitch && xU(b1) + off < mL - pitch) continue;
      const xa = xU(i) + off, xb = xU(i + span) + off, xm = (xa + xb) / 2;
      coils.push(
        <g key={`c${i}-${off}`} opacity={op}>
          {/* top-layer side: bar → slot s0 → apex (solid) */}
          <polyline points={`${xU(i) + off},${yBarT} ${xa},${ySlot} ${xm},${yApex}`} fill="none"
            stroke={col} strokeWidth={sw} strokeLinecap="round" />
          {/* bottom-layer side: apex → slot s1 → end bar (dashed) */}
          <polyline points={`${xm},${yApex} ${xb},${ySlot} ${xU(b1) + off},${yBarT}`} fill="none"
            stroke={col} strokeWidth={sw} strokeDasharray="4 3" strokeLinecap="round" />
        </g>
      );
    }
  }
  // brushes: lap = one per pole, wave = 2; spaced C/poles bars
  const nBr = wave ? 2 : r.poles;
  const brushes = Array.from({ length: nBr }, (_, j) => {
    const xb = xS(Math.round((j * C) / nBr));
    return (
      <g key={"br" + j}>
        <rect x={xb - 6} y={yBrush - 8} width={12} height={14} fill="#3F3F46" stroke={INK} strokeWidth="0.8" rx={1.5} />
        <text x={xb} y={yBrush + 18} textAnchor="middle" className="wnum">{j % 2 ? "−" : "+"}</text>
      </g>
    );
  });
  return (
    <svg id="svg-winding" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <style>{SVGCSS}</style>
      <text x={mL} y={14} className="wnum">developed view · solid = top layer in slot · dashed = bottom layer &amp; bar leg · {p.pattern} {plex > 1 ? plex + "-plex" : "simplex"}</text>
      {/* slots */}
      {Array.from({ length: Ns }, (_, i) => (
        <g key={"sl" + i}>
          <rect x={xS(i) - Math.min(pitch * 0.28, 5)} y={ySlot - 12} width={Math.min(pitch * 0.56, 10)} height={12} fill="#C7CFD8" stroke={INK} strokeWidth="0.6" />
          {(Ns <= 16 || i % 2 === 0) && <text x={xS(i)} y={ySlot - 16} textAnchor="middle" className="wnum">{i + 1}</text>}
        </g>
      ))}
      {coils}
      {/* commutator bars */}
      {Array.from({ length: C }, (_, i) => (
        <g key={"bar" + i}>
          <rect x={xS(i) - Math.min(pitch * 0.34, 6)} y={yBarT} width={Math.min(pitch * 0.68, 12)} height={yBar - yBarT} fill="#E8B44C" stroke={INK} strokeWidth="0.7" />
          {(C <= 16 || i % 2 === 0) && <text x={xS(i)} y={yBar + 11} textAnchor="middle" className="wnum">{i + 1}</text>}
        </g>
      ))}
      {brushes}
      <text x={W - mR} y={yApex - 6} textAnchor="end" className="wnum">throw {span} slots</text>
      <text x={W - mR} y={yBar + 11} textAnchor="end" className="wnum">bar pitch {wave ? `${yc} (wave)` : `${plex} (lap)`}</text>
    </svg>
  );
}

/* Stepper pole coils & connections: each phase drawn as its series chain of pole coils (alternating
   polarity), the bifilar second strand shadowed beneath, and lead terminations per drive wiring. */
function StepperWindingDiagram({ p, r }) {
  if (!r.step) return null;
  const st = r.step;
  const NsP = Math.max(Math.round(p.slots), 4);
  const nPh = Math.max(Math.floor(NsP / 2), 1);                      // coils per phase
  const W = 360, H = 218, mL = 34, mR = 62;
  const rows = [{ ph: "A", y: 62, c1: "#B45309", c2: "#E8933A" }, { ph: "B", y: 152, c1: "#1D4ED8", c2: "#5B8DEF" }];
  const cw = Math.min((W - mL - mR) / nPh - 12, 34), gap = (W - mL - mR) / nPh;
  const coil = (x, y, col, dir) => (
    <g>
      <rect x={x - cw / 2} y={y - 13} width={cw} height={26} rx={3} fill="none" stroke={col} strokeWidth="1.1" opacity="0.35" />
      {Array.from({ length: 4 }, (_, t) => (
        <path key={t} d={`M ${x - cw / 2 + 3 + t * ((cw - 6) / 3.5)} ${y + 9} a 5 9 0 0 1 0 -18`}
          fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <text x={x} y={y + 24} textAnchor="middle" className="wnum">{dir ? "↻" : "↺"}</text>
    </g>
  );
  return (
    <svg id="svg-winding" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <style>{SVGCSS}</style>
      <text x={mL - 20} y={14} className="wnum">
        {NsP}-pole stator · {nPh} coils/phase in series · alternate coils wound reversed (↻/↺) → N-S-N-S at energization</text>
      {rows.map(({ ph, y, c1, c2 }, ri) => {
        const bits = [];
        // lead-in dot
        bits.push(<circle key="in" cx={mL - 12} cy={y} r={3.2} fill={c1} />);
        bits.push(<text key="inl" x={mL - 12} y={y - 8} textAnchor="middle" className="wlbl" style={{ fill: c1, fontSize: 10 }}>{ph}</text>);
        bits.push(<line key="inw" x1={mL - 9} y1={y} x2={mL + gap / 2 - cw / 2} y2={y} stroke={c1} strokeWidth="1.6" />);
        bits.push(<line key="inw2" x1={mL - 9} y1={y + 3.5} x2={mL + gap / 2 - cw / 2} y2={y + 3.5} stroke={c2} strokeWidth="1" opacity="0.55" />);
        for (let i = 0; i < nPh; i++) {
          const x = mL + gap * i + gap / 2;
          const poleNum = 2 * i + ri + 1;                            // poles alternate A B A B …
          bits.push(<g key={"c" + i}>{coil(x, y, c1, i % 2 === 0)}</g>);
          bits.push(<text key={"pn" + i} x={x} y={y - 18} textAnchor="middle" className="wnum">P{poleNum} · {i % 2 === 0 ? "N" : "S"}</text>);
          if (i < nPh - 1) {
            bits.push(<line key={"j" + i} x1={x + cw / 2} y1={y} x2={x + gap - cw / 2} y2={y} stroke={c1} strokeWidth="1.6" />);
            bits.push(<line key={"j2" + i} x1={x + cw / 2} y1={y + 3.5} x2={x + gap - cw / 2} y2={y + 3.5} stroke={c2} strokeWidth="1" opacity="0.55" />);
          }
        }
        // termination per wiring mode
        const xe = mL + gap * nPh - gap / 2 + cw / 2, xt = W - mR + 14;
        bits.push(<line key="ow" x1={xe} y1={y} x2={xt} y2={y} stroke={c1} strokeWidth="1.6" />);
        bits.push(<line key="ow2" x1={xe} y1={y + 3.5} x2={xt} y2={y + 3.5} stroke={c2} strokeWidth="1" opacity="0.55" />);
        if (st.wire === "bip-ser") {
          // strands joined end-to-start: one loopback jumper, 2 leads out
          bits.push(<path key="ser" d={`M ${xt} ${y + 3.5} h 8 v ${-14} h ${-(xt - (mL - 9) + 8)} v ${10.5}`} fill="none" stroke={c2} strokeWidth="1" opacity="0.55" />);
          bits.push(<circle key="oe" cx={xt + 8} cy={y} r={3.2} fill={c1} />);
          bits.push(<text key="oel" x={xt + 13} y={y + 3} className="wlbl" style={{ fill: c1, fontSize: 10 }}>{ph}′</text>);
        } else if (st.wire === "bip-par") {
          bits.push(<line key="pj1" x1={xt} y1={y} x2={xt} y2={y + 3.5} stroke={c1} strokeWidth="1.4" />);
          bits.push(<line key="pj2" x1={mL - 9} y1={y} x2={mL - 9} y2={y + 3.5} stroke={c1} strokeWidth="1.4" />);
          bits.push(<circle key="oe" cx={xt + 4} cy={y + 1.7} r={3.2} fill={c1} />);
          bits.push(<text key="oel" x={xt + 9} y={y + 5} className="wlbl" style={{ fill: c1, fontSize: 10 }}>{ph}′</text>);
        } else {
          // unipolar: strand ends joined = center tap out
          bits.push(<line key="ct" x1={xt} y1={y} x2={xt} y2={y + 3.5} stroke={c1} strokeWidth="1.4" />);
          bits.push(<circle key="oe" cx={xt + 4} cy={y + 1.7} r={3.2} fill="#3F3F46" />);
          bits.push(<text key="oel" x={xt + 9} y={y + 5} className="wlbl" style={{ fill: "#3F3F46", fontSize: 10 }}>COM</text>);
          bits.push(<circle key="oe2" cx={mL - 22} cy={y + 3.5} r={3.2} fill={c2} />);
          bits.push(<text key="oel2" x={mL - 22} y={y + 16} textAnchor="middle" className="wlbl" style={{ fill: c2, fontSize: 10 }}>{ph}′</text>);
          bits.push(<line key="uw" x1={mL - 19} y1={y + 3.5} x2={mL - 9} y2={y + 3.5} stroke={c2} strokeWidth="1" opacity="0.8" />);
        }
        return <g key={ph}>{bits}</g>;
      })}
      <text x={mL - 20} y={H - 6} className="wnum">
        {st.wire === "bip-ser" ? "bipolar series: strand 2 loops back in series with strand 1 — 4-lead (or 6 with taps unused)"
          : st.wire === "bip-par" ? "bipolar parallel: both strands tied at each end — 8-lead motor, paralleled at the driver"
          : "unipolar: strand ends tied to a common center tap; driver grounds one half at a time — 5/6-lead"}
        {" "}· thin line = bifilar strand 2</text>
    </svg>
  );
}

/* Spring-applied brake, face view: pot-core backiron (outer rim + center boss pole faces), the
   bobbin-wound coil in the pocket with its clearance to the pocket ID, springs on the bolt circle,
   and the friction lining annulus ghosted for radius sizing. */
function BrakeSection({ p, r }) {
  const S = 380, cx = S / 2, cy = S / 2;
  const b = r.brake || {};
  const k = (S * 0.44) / (p.statorOD / 2);
  const rOD = (p.statorOD / 2) * k;
  const rPkt = (Math.max(p.brkPktID, 4) / 2) * k;
  const rBoss = (Math.max(p.brkBossOD, 2) / 2) * k;
  const rThru = (Math.max(p.brkBore, p.shaftD + 2) / 2) * k;
  const rBob = (p.brkBobID / 2) * k;
  const rCoil = ((b.coilOD || p.brkBobID + 2) / 2) * k;
  const rSh = Math.max((p.shaftD / 2) * k, 4);
  const roL = Math.max(p.brkRo, 2) * k, riL = Math.max(p.brkRi, 1) * k;
  const nSpr = Math.max(Math.round(p.brkSpringN || 6), 3);
  const rSpr = (rBoss + rPkt) / 2;
  const springs = Array.from({ length: nSpr }, (_, i) => {
    const a = (i / nSpr) * 2 * Math.PI - Math.PI / 2 + Math.PI / nSpr;
    return (
      <g key={"spr" + i}>
        <circle cx={cx + rSpr * Math.cos(a)} cy={cy + rSpr * Math.sin(a)} r={Math.min((rPkt - rBoss) * 0.28, 9)}
          fill="#F8FAFC" stroke={INK} strokeWidth="1" />
        <circle cx={cx + rSpr * Math.cos(a)} cy={cy + rSpr * Math.sin(a)} r={Math.min((rPkt - rBoss) * 0.16, 5.4)}
          fill="none" stroke="#8B8F98" strokeWidth="1.4" strokeDasharray="2.5 2" />
      </g>
    );
  });
  return (
    <svg id="svg-xsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} className="xsec">
      <style>{SVGCSS}</style>
      {/* backiron: outer rim, pocket, center boss */}
      <circle cx={cx} cy={cy} r={rOD} fill={STEEL} stroke={INK} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rPkt} fill={BG} stroke={INK} strokeWidth="0.9" />
      {/* wound coil on its bobbin: annulus from bobbin OD out to the wound diameter */}
      <circle cx={cx} cy={cy} r={rCoil} fill="#E8933A" stroke="#7C4A1E" strokeWidth="0.9" />
      <circle cx={cx} cy={cy} r={rBob} fill={BG} stroke="#7C4A1E" strokeWidth="0.9" />
      {/* pocket ID the coil must clear */}
      <circle cx={cx} cy={cy} r={rPkt} fill="none" stroke="#B91C1C" strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
      <circle cx={cx} cy={cy} r={rBoss} fill={STEEL} stroke={INK} strokeWidth="0.9" />
      <circle cx={cx} cy={cy} r={rThru} fill={BG} stroke={INK} strokeWidth="0.9" />
      {springs}
      {/* friction lining annulus ghosted */}
      <path d={`M ${cx + roL} ${cy} A ${roL} ${roL} 0 1 1 ${cx - roL} ${cy} A ${roL} ${roL} 0 1 1 ${cx + roL} ${cy} Z
                M ${cx + riL} ${cy} A ${riL} ${riL} 0 1 0 ${cx - riL} ${cy} A ${riL} ${riL} 0 1 0 ${cx + riL} ${cy} Z`}
        fill="#3F3F46" opacity="0.22" fillRule="evenodd" />
      <circle cx={cx} cy={cy} r={roL} fill="none" stroke="#3F3F46" strokeWidth="1.2" strokeDasharray="5 3" />
      <circle cx={cx} cy={cy} r={riL} fill="none" stroke="#3F3F46" strokeWidth="1.2" strokeDasharray="5 3" />
      <circle cx={cx} cy={cy} r={rSh} fill="#5B6874" stroke={INK} />
      <circle cx={cx} cy={cy} r={rSh * 0.35} fill={CREAM} />
      <text x={cx} y={cy - (rPkt + rOD) / 2 + 3.5} textAnchor="middle" className="wnum">rim</text>
      <text x={cx} y={cy - (rBob + rCoil) / 2 + 3.5} textAnchor="middle" className="wlbl" style={{ fill: "#7C4A1E", fontSize: 10 }}>coil {p.turns} t · Ø{(b.coilOD || 0).toFixed(1)}</text>
      <text x={cx} y={cy - (rThru + rBoss) / 2 + 3.5} textAnchor="middle" className="wnum" style={{ fontSize: 8 }}>boss</text>
      <text x={cx} y={S - 8} textAnchor="middle" className="wnum">
        face view · dashed red = pocket ID Ø{p.brkPktID} (coil clearance {Number.isFinite(b.clr) ? b.clr.toFixed(2) : "—"} mm) · {nSpr} springs · lining r̄ₑ {Number.isFinite(b.re) ? b.re.toFixed(1) : "—"} mm</text>
    </svg>
  );
}

function CrossSection({ p, r, anim, phaseSel }) {
  if (p.motorType === "brushed") return <BrushedSection p={p} r={r} anim={anim} />;
  if (p.motorType === "latm") return <LatmSection p={p} r={r} anim={anim} />;
  if (p.motorType === "stepper") return <StepperSection p={p} r={r} anim={anim} />;
  if (p.motorType === "brake") return <BrakeSection p={p} r={r} />;
  const S = 380, cx = S / 2, cy = S / 2;
  const k = (S * 0.355) / (p.statorOD / 2);
  const rOD = (p.statorOD / 2) * k, rID = (p.statorID / 2) * k;
  const rRot = (p.rotorOD / 2) * k, rTip = rID + p.tipH * k, rSlotTop = rTip + Math.max(r.hs, 0) * k;

  const slots = [];
  for (let i = 0; i < r.Ns; i++) {
    const a0 = (i / r.Ns) * 2 * Math.PI - Math.PI / 2;
    const hw1 = ((r.w1 / 2) * k) / rTip, hw2 = ((r.w2 / 2) * k) / rSlotTop;
    const P = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const rMid = (rTip + rSlotTop) / 2, hwm = (hw1 + hw2) / 2;
    const top = r.topLayer[i], bot = r.layers === 2 ? r.botLayer[i] : r.topLayer[i];
    const opT = anim && anim.on ? 0.15 + 0.85 * Math.abs(phCur(anim.th, top.phase)) : (top.sign > 0 ? 1 : 0.55);
    const opB = anim && anim.on ? 0.15 + 0.85 * Math.abs(phCur(anim.th, bot.phase)) : (bot.sign > 0 ? 1 : 0.55);
    slots.push(
      <g key={i}>
        <polygon points={`${P(rTip, a0 - hw1)} ${P(rTip, a0 + hw1)} ${P(rMid, a0 + hwm)} ${P(rMid, a0 - hwm)}`}
          fill={PHASE[top.phase].c} opacity={opT} />
        <polygon points={`${P(rMid, a0 - hwm)} ${P(rMid, a0 + hwm)} ${P(rSlotTop, a0 + hw2)} ${P(rSlotTop, a0 - hw2)}`}
          fill={PHASE[bot.phase].c} opacity={opB} />
        <line x1={cx + rID * Math.cos(a0)} y1={cy + rID * Math.sin(a0)}
          x2={cx + rTip * Math.cos(a0)} y2={cy + rTip * Math.sin(a0)}
          stroke={INK} strokeWidth={Math.max((p.slotOpen * k) / 1.4, 1)} opacity="0.85" />
        <text x={cx + ((rSlotTop + rOD) / 2) * Math.cos(a0)} y={cy + ((rSlotTop + rOD) / 2) * Math.sin(a0) + 2.5}
          textAnchor="middle" className="wnum" style={{ fill: "#1E293B" }}>{i + 1}</text>
      </g>
    );
  }

  // coil end-turns viewed axially: arcs from in-slot to out-slot, bulging past the OD
  const coilArcs = [];
  const Pp = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  for (let i = 0; i < r.Ns; i++) {
    if (r.layers === 1 && i % 2 === 1) continue;
    const t = r.topLayer[i];
    if (phaseSel !== undefined && phaseSel !== "all" && phaseSel !== t.phase) continue;
    const aIn = (i / r.Ns) * 2 * Math.PI - Math.PI / 2;
    const aOut = ((i + r.span) / r.Ns) * 2 * Math.PI - Math.PI / 2;
    const aMid = (aIn + aOut) / 2;
    const spanAng = (r.span / r.Ns) * 2 * Math.PI;
    const rB = rOD + 3, rCtl = rOD + 12 + Math.min(spanAng, Math.PI) * (S * 0.115);
    const op = anim && anim.on ? 0.15 + 0.85 * Math.abs(phCur(anim.th, t.phase)) : (t.sign > 0 ? 0.95 : 0.45);
    coilArcs.push(
      <g key={"ca" + i} opacity={op}>
        <path d={`M ${Pp(rB, aIn)} Q ${Pp(rCtl, aMid)} ${Pp(rB, aOut)}`}
          fill="none" stroke={PHASE[t.phase].c} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx={cx + rB * Math.cos(aIn)} cy={cy + rB * Math.sin(aIn)} r="2" fill={PHASE[t.phase].c} />
      </g>
    );
  }

  const dir = r.rotation === "CCW" ? -1 : 1;
  const mechA = anim && anim.on ? dir * anim.th * (2 / r.poles) : 0;
  const rotDeg = (mechA * 180) / Math.PI;
  const fA = mechA - Math.PI / 2;

  // squirrel-cage bar slots (ACIM): keyhole bars just under the rotor surface, colored by bar material
  const cageBars = [];
  if (p.motorType === "induction") {
    const Nb = Math.max(4, Math.round(p.rotorBars));
    const barCol = (p.barMat || "").toLowerCase().includes("copper") ? "#B87333" : "#C7CDD4";
    const rShC = Math.max((p.shaftD / 2) * k, 4);
    const dep = Math.min(rRot * 0.32, Math.max(rRot - rShC - 8, 6)); // bar body depth
    const wB = Math.min(((2 * Math.PI * rRot) / Nb) * 0.42, 9);      // bar body width
    const wN = Math.max(wB * 0.28, 1.4);                             // closing-slit neck width
    for (let b5 = 0; b5 < Nb; b5++) {
      const aDeg = (b5 / Nb) * 360;
      cageBars.push(
        <g key={"cb" + b5} transform={`rotate(${aDeg} ${cx} ${cy})`}>
          {/* neck to the surface (near-closed rotor slot) */}
          <rect x={cx - wN / 2} y={cy - rRot + 0.6} width={wN} height={3.2} fill={barCol} stroke={INK} strokeWidth="0.5" />
          {/* bar body: rounded slug */}
          <rect x={cx - wB / 2} y={cy - rRot + 3.2} width={wB} height={dep} rx={wB / 2}
            fill={barCol} stroke={INK} strokeWidth="0.7" />
        </g>
      );
    }
  }

  // rotor magnet arcs (BLDC): alternating N/S segments at the rotor surface
  const magArcs = [];
  if (p.motorType === "pm" && r.poles) {
    const tM = Math.min(Math.max(p.magT * k, 3), rRot * 0.5);
    const cov = Math.min(Math.max(p.poleArc / 100, 0.3), 1);
    for (let m = 0; m < r.poles; m++) {
      const c0 = (m / r.poles) * 2 * Math.PI - Math.PI / 2;
      const half = ((Math.PI / r.poles) * cov);
      const a1 = c0 - half, a2 = c0 + half;
      const Pt = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
      magArcs.push(
        <path key={"m" + m}
          d={`M ${Pt(rRot, a1)} A ${rRot} ${rRot} 0 0 1 ${Pt(rRot, a2)} L ${Pt(rRot - tM, a2)} A ${rRot - tM} ${rRot - tM} 0 0 0 ${Pt(rRot - tM, a1)} Z`}
          fill={m % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.8" />
      );
    }
  }

  return (
    <svg id="svg-xsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} className="xsec">
      <style>{SVGCSS}</style>
      <g>
      {coilArcs}
      <circle cx={cx} cy={cy} r={rOD} fill={STEEL} stroke={INK} strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={rSlotTop} fill="#C7CFD8" />
      {slots}
      <circle cx={cx} cy={cy} r={rID} fill={BG} />
      </g>
      <g transform={`rotate(${rotDeg} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={rRot} fill={STEEL_DK} stroke={INK} strokeWidth="1" />
        {cageBars}
        {magArcs}
        <circle cx={cx} cy={cy} r={Math.max((p.shaftD / 2) * k, 4)} fill="#5B6874" stroke={INK} />
        <circle cx={cx} cy={cy} r={Math.max((p.shaftD / 2) * k, 4) * 0.35} fill={CREAM} />
      </g>
      {anim && anim.on && (
        <line x1={cx} y1={cy} x2={cx + rID * 0.82 * Math.cos(fA)} y2={cy + rID * 0.82 * Math.sin(fA)}
          stroke={COPPER} strokeWidth="4" markerEnd="url(#ah)" opacity="0.9" />
      )}
      <defs>
        <marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill={COPPER} />
        </marker>
      </defs>
      <text x={cx} y={cy + rRot * 0.62} textAnchor="middle" className="svgLabel">{r.rotation}</text>
    </svg>
  );
}

/* ---- Actuator composite outline: gearhead > motor > brake on one axial section ---- */
/* ---- winding arbor side view: channels wound sequentially, build vs flange, tool dims ---- */
/* ---- lamination preview for the winding module: true 2D lamination + slot detail zoom,
   drawn from the stator drawing fields alone (no rotor, no magnets) ---- */
/* ---- armature lamination preview (brushed): slots on the OUTSIDE diameter — teeth radiate
   outward, openings at the armature surface, yoke between slot bottoms and the shaft ---- */
/* ---- inserted-coil view: plan of one coil showing the stack legs and the head loops,
   per the winding scheme — the tooling counterpart of the BLDC end-turn presentation ---- */
function CoilHeadView({ p, b, us }) {
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(2) + "\u2033" : mm.toFixed(1) + " mm");
  const Ns = Math.max(Math.round(p.slots), 3);
  const hs = Math.max((p.statorOD - p.statorID) / 2 - p.yoke - p.tipH, 0);
  const dm = p.statorID + 2 * (p.tipH + hs / 2);
  const lap = (p.wbStyle || "tooth") === "lap";
  const span = lap ? (Math.max(p.wbThrow, 1) * Math.PI * dm) / Ns : (Math.PI * dm) / Ns; // leg separation (chord straightened)
  const stk = Number.isFinite(p.stackL) ? Math.max(p.stackL, 1) : 1;
  const bw = Math.max(b.tpl * b.dEff, b.dEff);                       // bundle width as wound
  const Lh = b.Lhead, LhA = b.LheadAuto;
  const W = 430, H = 250, cx9 = W / 2, cy9 = 118;
  const k = Math.min((H - 105) / (stk + 2 * Lh), (W - 170) / (span + bw + 30));
  const sp2 = (span * k) / 2, st2 = (stk * k) / 2, bwp = Math.max(bw * k, 3), lhp = Lh * k;
  const rt = (dy, lh9, dash) => {
    // racetrack centerline: legs at ±sp2, heads bulging lh9 beyond the stack ends
    const ry = lh9, rx = sp2;
    return <path key={"rt" + dy + dash} d={
      `M ${cx9 - sp2} ${cy9 - st2} L ${cx9 - sp2} ${cy9 + st2}` +
      ` A ${rx} ${ry} 0 0 0 ${cx9 + sp2} ${cy9 + st2}` +
      ` L ${cx9 + sp2} ${cy9 - st2}` +
      ` A ${rx} ${ry} 0 0 0 ${cx9 - sp2} ${cy9 - st2} Z`}
      fill={dash ? "none" : "none"} stroke={dash ? STEEL_DK : "#7C4A1E"}
      strokeWidth={dash ? 1.4 : bwp} strokeDasharray={dash ? "6 4" : "none"}
      opacity={dash ? 0.8 : 0.92} strokeLinejoin="round" />;
  };
  return (
    <svg id="svg-coilhead" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <text x={cx9} y={14} textAnchor="middle" className="dim">
        {`inserted coil, plan view \u00b7 ${lap ? `lap, throw ${Math.max(p.wbThrow, 1)} slots` : "tooth-wound"} \u00b7 legs in the slots, heads beyond the stack`}</text>
      {/* stack extents */}
      <rect x={cx9 - sp2 - bwp / 2 - 14} y={cy9 - st2} width={2 * sp2 + bwp + 28} height={2 * st2}
        fill={STEEL} opacity="0.28" stroke="#64748B" strokeWidth="0.6" strokeDasharray="3 3" />
      <text x={cx9} y={cy9 + 4} textAnchor="middle" className="wnum">stack</text>
      {rt(0, lhp, false)}
      {Math.abs(Lh - LhA) > 0.15 && rt(0, LhA * k, true)}
      {/* dims: stack, head per end, overall */}
      <line x1={cx9 + sp2 + bwp / 2 + 26} y1={cy9 - st2} x2={cx9 + sp2 + bwp / 2 + 26} y2={cy9 + st2} stroke="#64748B" strokeWidth="0.9" />
      <text x={cx9 + sp2 + bwp / 2 + 30} y={cy9 + 3} className="dim">{`stack ${dl(stk)}`}</text>
      <line x1={cx9 + sp2 + bwp / 2 + 46} y1={cy9 - st2 - lhp - bwp / 2} x2={cx9 + sp2 + bwp / 2 + 46} y2={cy9 + st2 + lhp + bwp / 2} stroke="#64748B" strokeWidth="0.9" />
      <text x={cx9 + sp2 + bwp / 2 + 50} y={cy9 - st2 - lhp + 8} className="dim">{`overall ${dl(stk + 2 * Lh + bw)}`}</text>
      <line x1={cx9 - sp2} y1={cy9 - st2 - lhp - bwp / 2 - 8} x2={cx9 - sp2} y2={cy9 - st2} stroke="#7C4A1E" strokeWidth="0.7" strokeDasharray="2 2" />
      <text x={cx9 - sp2 - 4} y={cy9 - st2 - lhp / 2} textAnchor="end" className="dim" style={{ fill: "#7C4A1E" }}>{`head ${dl(Lh)}${p.wbHead > 0 ? "" : " (auto)"}`}</text>
      <line x1={cx9 - sp2} y1={cy9 + st2 + 14} x2={cx9 + sp2} y2={cy9 + st2 + 14} stroke="#64748B" strokeWidth="0.8" transform={`translate(0 ${lhp + bwp / 2 + 6})`} />
      <text x={cx9} y={cy9 + st2 + lhp + bwp / 2 + 17} textAnchor="middle" className="dim">{`span ${dl(span)}`}</text>
      {Math.abs(Lh - LhA) > 0.15 && <text x={cx9} y={H - 6} textAnchor="middle" className="dim">
        {`dashed = scheme auto head (${dl(LhA)}/end) vs entered ${dl(Lh)}`}</text>}
    </svg>
  );
}

function ArmLamPreview({ p, us }) {
  const Ns = Math.max(Math.round(p.slots), 3);
  const hs = (p.rotorOD - p.shaftD) / 2 - p.yoke - p.tipH;
  if (!(hs > 0.3)) return <div className="warn">No armature slot depth from these dims — reduce core depth / tip or grow the OD.</div>;
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(2) + " mm");
  const W = 440, H = 260;
  // ---- left: full armature lamination ----
  const cx = 118, cy = 132, k = 108 / (p.rotorOD / 2);
  const r0 = (p.rotorOD / 2) * k;                                     // armature surface
  const r1 = (p.rotorOD / 2 - p.tipH) * k;                            // under the tips
  const r2 = r1 - hs * k;                                             // slot bottom
  const rSh = (p.shaftD / 2) * k;
  const Pt = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  const hwA = (rr) => Math.max(Math.PI / Ns - ((p.toothW / 2) * k) / rr, 0.008);
  const soA = (rr) => Math.max(((p.slotOpen / 2) * k) / rr, 0.004);
  const slots = [];
  for (let i9 = 0; i9 < Ns; i9++) {
    const a0 = (i9 * 2 * Math.PI) / Ns - Math.PI / 2;
    const sA = soA(r0), n1 = hwA(r1), n2 = hwA(r2);
    slots.push(<path key={"s" + i9} d={
      `M ${Pt(r0, a0 - sA)} L ${Pt(r1, a0 - sA)} L ${Pt(r1, a0 - n1)} L ${Pt(r2, a0 - n2)}` +
      ` A ${r2} ${r2} 0 0 1 ${Pt(r2, a0 + n2)} L ${Pt(r1, a0 + n1)} L ${Pt(r1, a0 + sA)} L ${Pt(r0, a0 + sA)}` +
      ` A ${r0} ${r0} 0 0 0 ${Pt(r0, a0 - sA)} Z`} fill={BG} stroke="#64748B" strokeWidth="0.5" />);
  }
  // ---- right: one-slot zoom, mouth (airgap) at the TOP, tapering to the narrower bottom ----
  const dOu = p.rotorOD - 2 * p.tipH, dIn = dOu - 2 * hs;
  const wO = (Math.PI * dOu) / Ns - p.toothW;                         // wide end, under the tips
  const wI = (Math.PI * dIn) / Ns - p.toothW;                         // narrow end, at the slot bottom
  const zx = 330, zH = 150, kz = Math.min(zH / hs, 70 / Math.max(wO, wI));
  const yTop = 66, yBot = yTop + hs * kz;                             // tip shelf → slot bottom
  const rB = Math.min(Math.max(p.slotR || 0, 0), Math.min(wO, wI) / 2, hs / 2);   // bottom pair
  const rT = Math.min(Math.max(p.wbRtip || 0, 0), Math.min(wO, wI) / 2, hs / 2);  // mouth pair
  const rBp = rB * kz, rTp = rT * kz;
  const slope = ((wO - wI) / 2) / hs;                                 // narrowing downward
  const wHalfAt = (y9) => (wO / 2 - ((y9 - yTop) / kz) * slope) * kz;
  const dRound =
    `M ${(zx - (p.slotOpen / 2) * kz).toFixed(1)} ${(yTop - p.tipH * kz).toFixed(1)}` +
    ` L ${(zx - (p.slotOpen / 2) * kz).toFixed(1)} ${yTop.toFixed(1)}` +
    ` L ${(zx - (wO / 2) * kz + rTp).toFixed(1)} ${yTop.toFixed(1)}` +
    ` A ${rTp.toFixed(1)} ${rTp.toFixed(1)} 0 0 0 ${(zx - wHalfAt(yTop + rTp)).toFixed(1)} ${(yTop + rTp).toFixed(1)}` +
    ` L ${(zx - wHalfAt(yBot - rBp)).toFixed(1)} ${(yBot - rBp).toFixed(1)}` +
    ` A ${rBp.toFixed(1)} ${rBp.toFixed(1)} 0 0 0 ${(zx - (wI / 2) * kz + rBp).toFixed(1)} ${yBot.toFixed(1)}` +
    ` L ${(zx + (wI / 2) * kz - rBp).toFixed(1)} ${yBot.toFixed(1)}` +
    ` A ${rBp.toFixed(1)} ${rBp.toFixed(1)} 0 0 0 ${(zx + wHalfAt(yBot - rBp)).toFixed(1)} ${(yBot - rBp).toFixed(1)}` +
    ` L ${(zx + wHalfAt(yTop + rTp)).toFixed(1)} ${(yTop + rTp).toFixed(1)}` +
    ` A ${rTp.toFixed(1)} ${rTp.toFixed(1)} 0 0 0 ${(zx + (wO / 2) * kz - rTp).toFixed(1)} ${yTop.toFixed(1)}` +
    ` L ${(zx + (p.slotOpen / 2) * kz).toFixed(1)} ${yTop.toFixed(1)}` +
    ` L ${(zx + (p.slotOpen / 2) * kz).toFixed(1)} ${(yTop - p.tipH * kz).toFixed(1)}` +
    ` Z`;
  return (
    <svg id="svg-armlam" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <circle cx={cx} cy={cy} r={r0} fill={STEEL} stroke={INK} strokeWidth="1.4" />
      {slots}
      <circle cx={cx} cy={cy} r={rSh} fill={BG} stroke={INK} strokeWidth="0.9" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="wnum">{Ns} slots</text>
      <text x={cx} y={H - 8} textAnchor="middle" className="dim">
        {`armature \u00d8${dl(p.rotorOD)} \u00b7 shaft \u00d8${dl(p.shaftD)}${Number.isFinite(p.stackL) ? ` \u00b7 stack ${dl(p.stackL)}` : ""}`}</text>
      {/* slot zoom: airgap up */}
      <text x={zx} y={yTop - p.tipH * kz - 24} textAnchor="middle" className="dim">slot detail (airgap up)</text>
      <text x={zx} y={yTop - p.tipH * kz - 12} textAnchor="middle" className="dim">{`opening ${dl(p.slotOpen)} \u00b7 tip ${dl(p.tipH)}`}</text>
      <path d={dRound} fill={BG} stroke={INK} strokeWidth="1" />
      <line x1={zx - (wO / 2) * kz} y1={yTop - 6} x2={zx + (wO / 2) * kz} y2={yTop - 6} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx + (wO / 2) * kz + 6} y={yTop - 3} className="dim">{`w\u2092 ${dl(wO)}`}</text>
      <line x1={zx - (wI / 2) * kz} y1={yBot + 8} x2={zx + (wI / 2) * kz} y2={yBot + 8} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx} y={yBot + 19} textAnchor="middle" className="dim">{`w\u1d62 ${dl(wI)}`}</text>
      <line x1={zx + (wO / 2) * kz + 14} y1={yTop} x2={zx + (wO / 2) * kz + 14} y2={yBot} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx + (wO / 2) * kz + 18} y={(yTop + yBot) / 2 + 3} className="dim">{`hs ${dl(hs)}`}</text>
      {rB > 0.01 && <g>
        <line x1={zx + (wI / 2) * kz - rBp * 0.6} y1={yBot - rBp * 0.6} x2={zx + (wI / 2) * kz + 22} y2={yBot + 16} stroke="#7C4A1E" strokeWidth="0.6" />
        <text x={zx + (wI / 2) * kz + 24} y={yBot + 19} className="dim" style={{ fill: "#7C4A1E" }}>{`R ${dl(rB)}`}</text>
      </g>}
      {rT > 0.01 && <g>
        <line x1={zx + (wO / 2) * kz - rTp * 0.6} y1={yTop + rTp * 0.6} x2={zx + (wO / 2) * kz + 22} y2={yTop - 14} stroke="#7C4A1E" strokeWidth="0.6" />
        <text x={zx + (wO / 2) * kz + 24} y={yTop - 16} className="dim" style={{ fill: "#7C4A1E" }}>{`R ${dl(rT)}`}</text>
      </g>}
    </svg>
  );
}

function LamPreview({ p, us }) {
  const Ns = Math.max(Math.round(p.slots), 3);
  const hs = (p.statorOD - p.statorID) / 2 - p.yoke - p.tipH;
  if (!(hs > 0.3)) return <div className="warn">No slot depth from these lamination dims — check OD / bore / yoke / tip.</div>;
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(2) + " mm");
  const W = 440, H = 260;
  // ---- left: full lamination, polar truth ----
  const cx = 118, cy = 132, k = 108 / (p.statorOD / 2);
  const r0 = (p.statorID / 2) * k, r1 = (p.statorID / 2 + p.tipH) * k, r2 = r1 + hs * k, rOD = (p.statorOD / 2) * k;
  const Pt = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  const hwA = (rr) => Math.max(Math.PI / Ns - ((p.toothW / 2) * k) / rr, 0.008); // slot angular half-width at radius
  const soA = (rr) => Math.max(((p.slotOpen / 2) * k) / rr, 0.004);
  const slots = [];
  for (let i9 = 0; i9 < Ns; i9++) {
    const a0 = (i9 * 2 * Math.PI) / Ns - Math.PI / 2;
    const sA = soA(r0), n1 = hwA(r1), n2 = hwA(r2);
    slots.push(<path key={"s" + i9} d={
      `M ${Pt(r0, a0 - sA)} L ${Pt(r1, a0 - sA)} L ${Pt(r1, a0 - n1)} L ${Pt(r2, a0 - n2)}` +
      ` A ${r2} ${r2} 0 0 1 ${Pt(r2, a0 + n2)} L ${Pt(r1, a0 + n1)} L ${Pt(r1, a0 + sA)} L ${Pt(r0, a0 + sA)}` +
      ` A ${r0} ${r0} 0 0 0 ${Pt(r0, a0 - sA)} Z`} fill={BG} stroke="#64748B" strokeWidth="0.5" />);
  }
  // ---- right: one-slot zoom, trapezoid with dims ----
  const d1m = p.statorID + 2 * p.tipH, d2m = d1m + 2 * hs;
  const w1 = (Math.PI * d1m) / Ns - p.toothW, w2 = (Math.PI * d2m) / Ns - p.toothW;
  const zx = 330, zTop = 52, zH = 150, kz = Math.min(zH / hs, 70 / Math.max(w2, w1));
  const yB = zTop + hs * kz;                                          // slot mouth (airgap side) at the bottom
  const zP = (wHalf, y9) => `${(zx + wHalf * kz).toFixed(1)},${y9.toFixed(1)}`;
  // the four internal slot corners: bottom pair (w2, at the yoke) and mouth pair (w1, at the tip shelf)
  const rB = Math.min(Math.max(p.slotR || 0, 0), Math.min(w1, w2) / 2, hs / 2);
  const rT = Math.min(Math.max(p.wbRtip || 0, 0), Math.min(w1, w2) / 2, hs / 2);
  const rBp = rB * kz, rTp = rT * kz;
  const slope = ((w2 - w1) / 2) / hs;                                 // wall x-shift per unit depth
  const wHalfAt = (y9) => (w1 / 2 + ((yB - y9) / kz) * slope) * kz;   // px half-width at pixel y
  const dRound = (() => {
    // clockwise from bottom-left of the top edge, arcs at the four internal corners
    const xTL = zx - (w2 / 2) * kz, xTR = zx + (w2 / 2) * kz;
    const yT1 = zTop + rBp, xT1 = zx - wHalfAt(zTop + rBp) * 0 - (w2 / 2) * kz + 0; // wall points via wHalfAt
    const pW = (sgn, y9) => `${(zx + sgn * wHalfAt(y9)).toFixed(1)} ${y9.toFixed(1)}`;
    return `M ${(xTL + rBp).toFixed(1)} ${zTop}` +
      ` L ${(xTR - rBp).toFixed(1)} ${zTop}` +
      ` A ${rBp.toFixed(1)} ${rBp.toFixed(1)} 0 0 1 ${pW(1, zTop + rBp)}` +
      ` L ${pW(1, yB - rTp)}` +
      ` A ${rTp.toFixed(1)} ${rTp.toFixed(1)} 0 0 1 ${(zx + (w1 / 2) * kz - rTp).toFixed(1)} ${yB.toFixed(1)}` +
      ` L ${(zx + (p.slotOpen / 2) * kz).toFixed(1)} ${yB.toFixed(1)}` +
      ` L ${(zx + (p.slotOpen / 2) * kz).toFixed(1)} ${(yB + p.tipH * kz).toFixed(1)}` +
      ` L ${(zx - (p.slotOpen / 2) * kz).toFixed(1)} ${(yB + p.tipH * kz).toFixed(1)}` +
      ` L ${(zx - (p.slotOpen / 2) * kz).toFixed(1)} ${yB.toFixed(1)}` +
      ` L ${(zx - (w1 / 2) * kz + rTp).toFixed(1)} ${yB.toFixed(1)}` +
      ` A ${rTp.toFixed(1)} ${rTp.toFixed(1)} 0 0 1 ${pW(-1, yB - rTp)}` +
      ` L ${pW(-1, zTop + rBp)}` +
      ` A ${rBp.toFixed(1)} ${rBp.toFixed(1)} 0 0 1 ${(xTL + rBp).toFixed(1)} ${zTop}` +
      ` Z`;
  })();
  return (
    <svg id="svg-lam" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <circle cx={cx} cy={cy} r={rOD} fill={STEEL} stroke={INK} strokeWidth="1.4" />
      {slots}
      <circle cx={cx} cy={cy} r={r0} fill={BG} stroke={INK} strokeWidth="0.9" />
      <text x={cx} y={cy + 4} textAnchor="middle" className="wnum">{Ns} slots</text>
      <text x={cx} y={H - 8} textAnchor="middle" className="dim">{`\u00d8${dl(p.statorOD)} \u00b7 bore \u00d8${dl(p.statorID)}${Number.isFinite(p.stackL) ? ` \u00b7 stack ${dl(p.stackL)}` : ""}`}</text>
      {/* slot zoom */}
      <text x={zx} y={zTop - 26} textAnchor="middle" className="dim">slot detail</text>
      <path d={dRound} fill={BG} stroke={INK} strokeWidth="1" />
      {/* corner radius callouts: bottom pair and mouth pair */}
      {rB > 0.01 && <g>
        <line x1={zx + (w2 / 2) * kz - rBp} y1={zTop + rBp} x2={zx + (w2 / 2) * kz + 16} y2={zTop + rBp - 14} stroke="#7C4A1E" strokeWidth="0.6" />
        <text x={zx + (w2 / 2) * kz + 18} y={zTop + rBp - 16} className="dim" style={{ fill: "#7C4A1E" }}>{`R ${dl(rB)}`}</text>
      </g>}
      {rT > 0.01 && <g>
        <line x1={zx + (w1 / 2) * kz - rTp * 0.6} y1={yB - rTp * 0.6} x2={zx + (w1 / 2) * kz + 20} y2={yB + 10} stroke="#7C4A1E" strokeWidth="0.6" />
        <text x={zx + (w1 / 2) * kz + 22} y={yB + 13} className="dim" style={{ fill: "#7C4A1E" }}>{`R ${dl(rT)}`}</text>
      </g>}
      {p.liner > 0 && <polygon points={`${zP(-w2 / 2 + p.liner * kz / kz * 0, zTop + 1.5)} ${zP(w2 / 2 - 0, zTop + 1.5)} ${zP(w1 / 2 - 0, yB - 1.5)} ${zP(-w1 / 2 + 0, yB - 1.5)}`}
        fill="none" stroke="#8B7A55" strokeWidth={Math.max(p.liner * kz, 0.8)} opacity="0.5" />}
      <line x1={zx - (w2 / 2) * kz} y1={zTop - 8} x2={zx + (w2 / 2) * kz} y2={zTop - 8} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx} y={zTop - 12} textAnchor="middle" className="dim">{`w\u2082 ${dl(w2)}`}</text>
      <line x1={zx - (w1 / 2) * kz} y1={yB + 8} x2={zx + (w1 / 2) * kz} y2={yB + 8} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx} y={yB + 19} textAnchor="middle" className="dim">{`w\u2081 ${dl(w1)}`}</text>
      <line x1={zx + (w2 / 2) * kz + 12} y1={zTop} x2={zx + (w2 / 2) * kz + 12} y2={yB} stroke="#64748B" strokeWidth="0.8" />
      <text x={zx + (w2 / 2) * kz + 16} y={(zTop + yB) / 2 + 3} className="dim">{`hs ${dl(hs)}`}</text>
      <text x={zx} y={yB + p.tipH * kz + 14} textAnchor="middle" className="dim">{`opening ${dl(p.slotOpen)} \u00b7 tip ${dl(p.tipH)}`}</text>
    </svg>
  );
}

function ArborView({ p, b, us }) {
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(1) + " mm");
  const W = 430, H = 240, yC = 108, mL = 46;
  const nC = Math.max(Math.round(p.wbCoils) || 1, 1);
  const flg = Math.max(p.wbFlange, 0.3), chW = Math.max(p.wbChanW, 0.5), chH = Math.max(p.wbChanH, 0.2);
  const arbor = Math.max(p.wbArborD, 1);
  const Ltool = b.lenTool + 16;                                      // + drive stub each end
  const k = Math.min((W - mL - 30) / Ltool, (H - 108) / b.flangeOD);
  const X0 = mL + 8 * k, R9 = (d9) => (d9 / 2) * k;
  const flrects = [], coils = [], divs = [];
  for (let i9 = 0; i9 <= nC; i9++) {
    const xf = X0 + (i9 * (chW + flg)) * k;
    flrects.push(<rect key={"f" + i9} x={xf} y={yC - R9(b.flangeOD)} width={flg * k} height={2 * R9(b.flangeOD)} rx={1}
      fill="#F1EDE4" stroke="#334155" strokeWidth="0.9" />);
    if (i9 < nC) {
      const xc = xf + flg * k;
      const bh = Math.min(b.build, chH);
      coils.push(<g key={"c" + i9}>
        <rect x={xc} y={yC - R9(arbor) - bh * k} width={chW * k} height={bh * k} fill="#C87F3D" stroke="#7C4A1E" strokeWidth="0.7" />
        <rect x={xc} y={yC + R9(arbor)} width={chW * k} height={bh * k} fill="#C87F3D" stroke="#7C4A1E" strokeWidth="0.7" />
        {[0.3, 0.6].map((f6, j9) => <g key={j9}>
          <line x1={xc} y1={yC - R9(arbor) - bh * k * f6} x2={xc + chW * k} y2={yC - R9(arbor) - bh * k * f6} stroke="#7C4A1E" strokeWidth="0.4" opacity="0.5" />
          <line x1={xc} y1={yC + R9(arbor) + bh * k * f6} x2={xc + chW * k} y2={yC + R9(arbor) + bh * k * f6} stroke="#7C4A1E" strokeWidth="0.4" opacity="0.5" />
        </g>)}
      </g>);
      if (b.buildX > chH) divs.push(<text key={"ov" + i9} x={xc + (chW * k) / 2} y={yC - R9(b.flangeOD) - 3}
        textAnchor="middle" className="dim" style={{ fill: "#DC2626" }}>{i9 === 0 ? "overtops flange" : "!"}</text>);
    }
  }
  const yD = yC + R9(b.flangeOD) + 14;
  return (
    <svg id="svg-arbor" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <text x={W / 2} y={13} textAnchor="middle" className="dim">
        {`winding arbor — ${nC} channel${nC > 1 ? "s" : ""} wound sequentially · ${p.turns}t of AWG ${p.awg}×${p.strands} each`}</text>
      <line x1={14} y1={yC} x2={W - 10} y2={yC} stroke="#94A3B8" strokeWidth="0.7" strokeDasharray="9 3 2 3" />
      {/* drive stubs + arbor core */}
      <rect x={X0 - 8 * k} y={yC - R9(arbor * 0.6)} width={8 * k} height={2 * R9(arbor * 0.6)} fill="#3F3F46" stroke="#1F2937" strokeWidth="0.8" />
      <rect x={X0 + b.lenTool * k} y={yC - R9(arbor * 0.6)} width={8 * k} height={2 * R9(arbor * 0.6)} fill="#3F3F46" stroke="#1F2937" strokeWidth="0.8" />
      <rect x={X0} y={yC - R9(arbor)} width={b.lenTool * k} height={2 * R9(arbor)} fill="#FBF8F1" stroke="#334155" strokeWidth="0.9" />
      {coils}{flrects}{divs}
      {/* dims: arbor Ø, coil OD, flange OD on the right; channel & tool length below */}
      <text x={X0 + b.lenTool * k + 8 * k + 4} y={yC - R9(arbor) - 3} className="dim">{`arbor \u00d8${dl(arbor)}`}</text>
      <text x={X0 + b.lenTool * k + 8 * k + 4} y={yC - R9(b.coilOD) - 3} className="dim" style={{ fill: "#7C4A1E" }}>{`coil \u00d8${dl(b.coilOD)}`}</text>
      <text x={X0 + b.lenTool * k + 8 * k + 4} y={yC - R9(b.flangeOD) - 3} className="dim">{`flange \u00d8${dl(b.flangeOD)}`}</text>
      <g>
        <line x1={X0 + flg * k} y1={yD} x2={X0 + (flg + chW) * k} y2={yD} stroke="#64748B" strokeWidth="0.8" />
        <text x={X0 + (flg + chW / 2) * k} y={yD - 3} textAnchor="middle" className="dim">{`chan ${dl(chW)}`}</text>
        <line x1={X0} y1={yD + 15} x2={X0 + b.lenTool * k} y2={yD + 15} stroke="#64748B" strokeWidth="0.8" />
        <text x={X0 + (b.lenTool / 2) * k} y={yD + 12} textAnchor="middle" className="dim">{`tool ${dl(b.lenTool)} · ${nC}× coils`}</text>
      </g>
    </svg>
  );
}

/* component envelopes (mm), first-order typical proportions — shared by the 2D outline
   and the isometric view so the two can never disagree */
function actEnvelope(motorP, brakeP, act, withBrk, gbOD, gbLen) {
  const modOD = motorP.statorOD, stk = motorP.stackL;
  const ovh = motorP.headH > 0 ? motorP.headH : Math.max(0.16 * modOD, 5); // coil head axial overhang / side
  const Lm = stk + 2 * (ovh + 3);                                          // stack + heads + endbells
  const gODa = act.type === "Harmonic"
    ? HARMONIC_SIZES[harmonicSizeUp(modOD)].od                             // drop-in catalog size
    : modOD * 1.1;
  const gOD = gbOD > 0 ? gbOD : gODa;                                      // specified envelope wins
  const Lg = gbLen > 0 ? gbLen : gearheadAutoLen(act.type, act.st, gOD, act.brg); // built up from stage needs
  const hasB = withBrk && brakeP;
  const bOD = hasB ? brakeP.statorOD : 0;
  const Lb = hasB ? brakeP.stackL + (brakeP.brkArm || 4) + 4 : 0;          // backiron + armature/disc pack
  const shD = Math.max(motorP.shaftD || 5, 3);
  const oShD = Math.max(gOD * 0.16, shD);
  return { modOD, stk, ovh, Lm, gOD, Lg, hasB, bOD, Lb, shD, oShD, Ltot: Lg + Lm + Lb };
}

/* axial partition of the gearhead (mm): output bearing block first, then one slot per
   stage sized in proportion to that stage's synthesized need (kF·face + carrier/web —
   the same weights gearheadAutoLen builds the auto length from). The section views,
   the outline/iso stage grooves, and the dimension brackets all draw from THIS, so the
   external dividers always land on the internal gear sets. slots[i] is stage i+1's
   axial length; xs[i] is its output-side edge measured from the output face (stage 1
   sits nearest the motor). Harmonic units are one component set: slots = [usable]. */
function gearAxial(gt, gLen) {
  const brgL = (gt.brgF || 0.22) * gt.gOD;
  const usable = Math.max(gLen - brgL, 2);
  if (!gt.stages.length || gt.stages[0].harmonic) return { brgL, slots: [usable], xs: [brgL] };
  const kF = gt.stages[0].Z1 ? 1.35 : 1.5;
  const wts = Array.from({ length: gt.st }, (_, i9) => {
    const s9 = gt.stages[Math.min(i9, gt.stages.length - 1)];
    return kF * Math.max(s9.F || 1, 1) + 3.7;
  });
  const sum = wts.reduce((a9, b9) => a9 + b9, 0);
  const slots = wts.map((w9) => (usable * w9) / sum);
  const xs = slots.map((_, i9) => brgL + slots.slice(i9 + 1).reduce((a9, b9) => a9 + b9, 0));
  return { brgL, slots, xs };
}

const ISO_FINISHES = {
  "Polished steel":   { h: ["#F5F8FB", "#C6D0DB", "#57636F"], sp: 0.34 },
  "Matte steel":      { h: ["#DDE3EA", "#AEB9C5", "#66707C"], sp: 0.10 },
  "Aluminum":         { h: ["#EFF2F5", "#C9CED4", "#79818A"], sp: 0.22 },
  "Iridite (chem film)": { h: ["#EBDCA4", "#C9AF62", "#8A7434"], sp: 0.18 },
  "Black anodized":   { h: ["#4B5058", "#2E3138", "#0F1115"], sp: 0.14 },
};

const MNT_THREADS = { "2-56": 2.18, "4-40": 2.85, "6-32": 3.5, "8-32": 4.17, "10-32": 4.83, "1/4-20": 6.35,
  "M2": 2, "M2.5": 2.5, "M3": 3, "M4": 4, "M5": 5 };

/* ---- assumptions ledger: every ACTIVE estimate in one place, with its rule, so a tooling
   rule can never be mistaken for a measurement. Pure function of the parameter set. ---- */
function activeAssumptions(p) {
  const A = [];
  const t9 = p.motorType;
  if (t9 === "pm" || t9 === "brushed" || t9 === "induction") {
    if (!(p.headH > 0)) A.push({ t: "Coil head axial overhang", r: "auto: max(0.16·stator OD, 5 mm) per side — enter a measured head height to override" });
    if (p.calOn !== "yes") A.push({ t: "No bench calibration active", r: "curves are the pure analytical model; capture kR/kL/kKe/kKt + drag on the bench to compensate" });
    A.push({ t: "Iron loss model", r: "two-term (hysteresis + eddy) fit to lamination data at the electrical frequency; PWM harmonic loss not modeled" });
    if (t9 === "pm") A.push({ t: "Saturation under load (kIT)", r: "applies the full q-axis armature MMF to the d-axis magnet circuit — conservative cross-saturation mixing; validate with a loaded FEMM solve" });
    if (t9 === "pm") A.push({ t: "Magnet leakage factor", r: (p.klOv > 0 ? `field-informed kl = ${(+p.klOv).toFixed(3)}, adopted from this design's own 2-D solve (revert on the field card)` : "fixed 0.9 first-order default — run the field solve and adopt the design-specific value it derives") });
  }
  if (t9 === "bobbin") {
    if (!(p.wbHead > 0)) A.push({ t: "Coil head per end", r: (p.wbStyle || "tooth") === "lap" ? "auto: 1.25 × throw arc at mean slot Ø (diamond head)" : "auto: tooth width + 0.8·mean slot width + 3 mm bends" });
    if (p.wbMode === "inv") {
      A.push({ t: "Inter-coil jumper", r: "estimated: π·(mean slot Ø)/coils × 1.25 lay slack — same-phase coils land every Ns/coils slots" });
      A.push({ t: "Flange thickness", r: "estimated: clamp(0.25 × channel width, 0.8–3 mm) for stiffness" });
    }
    if ((p.wbLay || "wild") !== "precise") A.push({ t: "Wild-wind constants", r: "rows stack at ~1.0·wire Ø after layer 1, +8% bump, capacity ×0.8 — first-order tooling rules, tune to weighed coils" });
    A.push({ t: "Insertion fill limit", r: "~42% of slot area (double-layer basis) as the usually-insertable ceiling" });
  }
  if (t9 === "actuator") {
    if (!(p.gbOD > 0) || !(p.gbLen > 0)) A.push({ t: "Gearhead envelope", r: "typical shell: OD ≈ 1.1·motor (1.0 harmonic); length from per-stage proportions (0.42·OD planetary, 0.34 spur, 0.55 harmonic + bearing block)" });
    if (!(p.gbEff > 0)) A.push({ t: "Gearhead efficiency", r: "synthesized from the designed train (per-mesh loss + churn, compounded across stages) — the gear card labels the source; catalog values (planetary 90%, spur 93%, harmonic 80% per stage) are the fallback only when no train can be synthesized. Premium units differ; enter the datasheet value to override" });
    A.push({ t: "Brake pack length", r: "backiron + armature/disc + 4 mm hardware when the brake is composed in" });
  }
  return A;
}

function AssumptionsCard({ p }) {
  const A = activeAssumptions(p);
  if (!A.length) return null;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Assumptions in effect ({A.length})</summary>
        <div className="tbl" style={{ marginTop: 8 }}>
          {A.map((x, i9) => (
            <div className="kv" key={i9} style={{ alignItems: "baseline" }}>
              <span style={{ minWidth: "38%" }}>{x.t}</span><b style={{ fontWeight: 400, fontSize: "0.93em" }}>{x.r}</b>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 6 }}>
          Everything above is a first-order rule, not a measurement — override fields exist where it matters.
          Entered values never appear here.
        </div>
      </details>
    </div>
  );
}

/* ---- gearhead side cross-section: the drawing view - axial half-section through the
   gearhead only, at true scale. Shows per-stage spacing with dimensions, ring bands in
   the housing wall, carriers, the output bearing at size with its diameters called out,
   and the mounting tapped holes entering the face they engage. ---- */
function GearheadSection({ gt, brg, mnt, oShD, us }) {
  if (!gt || !gt.stages || !gt.stages.length) return null;
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(1) + " mm");
  const gOD = gt.gOD, gLen = gt.gLen;
  const W = 430, H = 268;
  const k = Math.min((W - 120) / gLen, (H - 118) / gOD);
  const x0 = 58, yC = 108;                                        // output face at x0, motor to the right
  const R = (d9) => (d9 / 2) * k;
  const ax = gearAxial(gt, gLen);
  const brgL = ax.brgL;
  const s1 = gt.stages[0];
  const planetary = !!s1.Zr;
  const ringOut = planetary ? R(s1.PDr) + 2.5 * s1.m * k : R(gOD) - 5;
  const wallIn = Math.min(ringOut + 2, R(gOD) - 2);
  const els = [];
  // housing walls (sectioned - diagonal hatch)
  for (const sgn of [-1, 1]) {
    const yA = yC + sgn * wallIn, yB = yC + sgn * R(gOD);
    els.push(<rect key={'hw' + sgn} x={x0} y={Math.min(yA, yB)} width={gLen * k} height={Math.abs(yB - yA)} fill="#AEB8C4" stroke="#334155" strokeWidth="1" />);
    for (let hx = 0; hx < gLen * k - 4; hx += 7)
      els.push(<line key={'ht' + sgn + hx} x1={x0 + hx} y1={Math.max(yA, yB) - 1} x2={x0 + hx + Math.abs(yB - yA) - 2} y2={Math.min(yA, yB) + 1} stroke="#64748B" strokeWidth="0.45" opacity="0.6" />);
  }
  // output face plate
  const faceT = Math.max(0.07 * gOD, 2) * k;
  els.push(<rect key="fp" x={x0 - faceT} y={yC - R(gOD)} width={faceT} height={2 * R(gOD)} fill="#C2CAD4" stroke="#334155" strokeWidth="1" />);
  // output shaft: through the bearing block into the output stage's carrier —
  // it does NOT run the length of the train (each stage has its own sun)
  const shL9 = brgL + (s1.harmonic ? 2 : (ax.slots[gt.st - 1] || 2) * 0.55);
  els.push(<rect key="sh" x={x0 - faceT} y={yC - R(oShD)} width={shL9 * k + faceT} height={2 * R(oShD)} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" opacity="0.55" />);
  // stages: stage 1 nearest the MOTOR (right), each in its own proportional slot
  for (let i9 = 0; i9 < gt.st; i9++) {
    const s9 = gt.stages[Math.min(i9, gt.stages.length - 1)];
    const xs = ax.xs[i9], slotL = ax.slots[i9];
    const F9 = Math.min(s9.F || slotL * 0.6, slotL * 0.72);
    const xg = x0 + (xs + (slotL - F9) / 2) * k, wg = F9 * k;
    if (planetary) {
      const rS = R(s9.PDs), rPo = (s9.a + s9.PDp / 2) * k, rPi = (s9.a - s9.PDp / 2) * k;
      const rR9 = R(s9.PDr);
      for (const sgn of [-1, 1]) {
        els.push(<rect key={'rb' + i9 + sgn} x={xg - 1} y={sgn > 0 ? yC + rR9 : yC - rR9 - 2.5 * s9.m * k} width={wg + 2} height={2.5 * s9.m * k} fill="#64748B" />);
        els.push(<rect key={'pl' + i9 + sgn} x={xg} y={sgn > 0 ? yC + rPi : yC - rPo} width={wg} height={rPo - rPi} fill="#B4BDC9" stroke="#334155" strokeWidth="0.9" />);
        els.push(<circle key={'pn' + i9 + sgn} cx={xg + wg / 2} cy={yC + sgn * (rPo + rPi) / 2} r={Math.min(2.2, wg * 0.2)} fill="#475569" />);
      }
      els.push(<rect key={'sn' + i9} x={xg} y={yC - rS} width={wg} height={2 * rS} fill="#C9AF62" stroke="#334155" strokeWidth="0.9" />);
      const crW = Math.min(0.16 * slotL, 2.5) * k;
      els.push(<rect key={'cr' + i9} x={xg - crW - 1} y={yC - rPo * 0.92} width={crW} height={2 * rPo * 0.92} fill="#8B7355" stroke="#334155" strokeWidth="0.8" opacity="0.9" />);
      els.push(<text key={'sl' + i9} x={xg + wg / 2} y={yC - rPo - 6} textAnchor="middle" className="dim">S{i9 + 1}</text>);
    } else if (s1.Z1) {                                             // spur: gears on their CLUSTER axes
      const r1 = R(s9.PD1), r2 = R(s9.PD2);
      const yP = yC + (s9.yAx || 0) * k;                            // this stage's pinion axis
      const yG = yP + (s9.a || 0) * k;                              // driven gear one center distance over
      els.push(<line key={'ax' + i9} x1={xg - 6} y1={yP} x2={xg + wg + 6} y2={yP} stroke="#94A3B8" strokeWidth="0.5" strokeDasharray="6 2 2 2" />);
      els.push(<rect key={'g1' + i9} x={xg} y={yP - r1} width={wg} height={2 * r1} fill="#C9AF62" stroke="#334155" strokeWidth="0.9" />);
      els.push(<rect key={'g2' + i9} x={xg} y={yG - r2} width={wg} height={2 * r2} fill="#B4BDC9" stroke="#334155" strokeWidth="0.9" opacity="0.92" />);
      els.push(<text key={'sl' + i9} x={xg + wg / 2} y={Math.min(yP - r1, yG - r2) - 5} textAnchor="middle" className="dim">S{i9 + 1}</text>);
    }
  }
  if (s1.harmonic) {                                                // harmonic: cup flexspline + wave generator + spline block
    const hs9 = { od: s1.hsOD || gOD, len: s1.hsLen || gLen * 0.6 };
    const xh0 = x0 + brgL * k, hL = Math.min(hs9.len, gLen - brgL - 2) * k;
    const rSp = R(0.86 * hs9.od), rFx = R(0.80 * hs9.od), rWg = R(0.60 * hs9.od);
    // circular spline block, grounded at the housing (toothed zone at the input end)
    for (const sgn of [-1, 1]) {
      els.push(<rect key={'cs' + sgn} x={xh0 + hL * 0.55} y={sgn > 0 ? yC + rFx : yC - rSp} width={hL * 0.4} height={rSp - rFx} fill="#64748B" stroke="#334155" strokeWidth="0.8" />);
      // flexspline cup wall: thin, toothed under the spline, running to the output diaphragm
      els.push(<rect key={'fx' + sgn} x={xh0 + 2} y={sgn > 0 ? yC + rFx - 2.2 : yC - rFx} width={hL * 0.93} height={2.2} fill="#B4BDC9" stroke="#334155" strokeWidth="0.7" />);
    }
    // output diaphragm + boss (cup closed end at the output side)
    els.push(<rect key="fd" x={xh0} y={yC - rFx} width={3} height={2 * rFx} fill="#B4BDC9" stroke="#334155" strokeWidth="0.8" />);
    // wave generator: elliptical hub section + bearing balls at the input end
    els.push(<ellipse key="wg" cx={xh0 + hL * 0.78} cy={yC} rx={hL * 0.16} ry={rWg} fill="#C9AF62" stroke="#334155" strokeWidth="0.9" />);
    for (const sgn of [-1, 1]) els.push(<circle key={'wb' + sgn} cx={xh0 + hL * 0.78} cy={yC + sgn * (rFx - 5)} r={3} fill="#B7C0CB" stroke="#475569" strokeWidth="0.6" />);
    els.push(<text key="hl" x={xh0 + hL / 2} y={yC - rSp - 6} textAnchor="middle" className="dim">{`size ${s1.size} \u00b7 cup ${dl(hs9.len)}`}</text>);
  }
  // output bearing at size, diameters called out
  const brOD9 = 0.46 * gOD, brID9 = Math.max(oShD * 1.2, 0.16 * gOD);
  const rows = brg === 'double' || brg === 'acpair' ? 2 : 1;
  const rowL = Math.min((brgL * 0.82) / rows, brOD9 * 0.36);
  for (let r9 = 0; r9 < rows; r9++) {
    const xb = x0 + (brgL * 0.5 - (rows * rowL) / 2 + r9 * rowL + rowL * 0.07) * k, wb = rowL * 0.86 * k;
    for (const sgn of [-1, 1]) {
      const yT = yC + sgn * R(brID9), yB2 = yC + sgn * R(brOD9);
      els.push(<rect key={'br' + r9 + sgn} x={xb} y={Math.min(yT, yB2)} width={wb} height={Math.abs(yB2 - yT)} fill="#E8ECF1" stroke="#334155" strokeWidth="0.9" />);
      els.push(<circle key={'bl' + r9 + sgn} cx={xb + wb / 2} cy={(yT + yB2) / 2} r={Math.min(Math.abs(yB2 - yT) * 0.32, wb * 0.42)} fill="#B7C0CB" stroke="#475569" strokeWidth="0.7" />);
      if (brg === 'acpair') els.push(<line key={'ac' + r9 + sgn} x1={xb + (r9 ? wb : 0)} y1={Math.min(yT, yB2)} x2={xb + (r9 ? 0 : wb)} y2={Math.max(yT, yB2)} stroke="#475569" strokeWidth="0.7" opacity="0.75" />);
    }
  }
  els.push(<text key="bod" x={x0 + brgL * k + 5} y={yC - R(brOD9) - 3} className="dim">{`brg \u00d8${dl(brOD9)}`}</text>);
  els.push(<text key="bid" x={x0 + brgL * k + 5} y={yC - R(brID9) + 9} className="dim">{`bore \u00d8${dl(brID9)}`}</text>);
  if (rows === 2) els.push(<text key="b2" x={x0 + (brgL / 2) * k} y={yC + R(brOD9) + 12} textAnchor="middle" className="dim">{brg === 'acpair' ? '\u00d72 AC back-to-back' : '\u00d72 stacked'}</text>);
  // mounting tapped holes entering the face they engage
  const m9 = mnt || {};
  const holeD = (MNT_THREADS[m9.thread] || 3);
  const bcd = m9.bcd > 0 ? m9.bcd : gOD * 0.72;
  const nB = Math.max(Math.round(m9.n) || 0, 0);
  if (nB > 0 && R(bcd) < R(gOD) - 1) {
    const dep = Math.min(1.5 * holeD, gLen * 0.45) * k;
    const aft = m9.dir === 'aft';
    const xh = aft ? x0 + gLen * k - dep : x0 - faceT;             // engage rear face when aft-mounted
    for (const sgn of [-1, 1]) {
      const yh = yC + sgn * R(bcd);
      els.push(<rect key={'th' + sgn} x={xh} y={yh - (holeD / 2) * k} width={dep + (aft ? 0 : faceT * 0.0)} height={holeD * k} fill="#F8FAFC" stroke="#334155" strokeWidth="0.8" strokeDasharray="3 2" />);
      for (let tx = 2; tx < dep - 1; tx += 3.2) {
        els.push(<line key={'tt' + sgn + tx} x1={xh + tx} y1={yh - (holeD / 2) * k - 1.5} x2={xh + tx} y2={yh - (holeD / 2) * k} stroke="#334155" strokeWidth="0.5" />);
        els.push(<line key={'tb' + sgn + tx} x1={xh + tx} y1={yh + (holeD / 2) * k} x2={xh + tx} y2={yh + (holeD / 2) * k + 1.5} stroke="#334155" strokeWidth="0.5" />);
      }
      els.push(<line key={'tc' + sgn} x1={xh - 3} y1={yh} x2={xh + dep + 3} y2={yh} stroke="#94A3B8" strokeWidth="0.5" strokeDasharray="6 2 2 2" />);
    }
    els.push(<text key="tl" x={x0 - faceT - 3} y={yC - R(bcd) - 7} textAnchor="start" className="dim">{`${nB}\u00d7 ${m9.thread} ${aft ? 'aft' : 'fwd'} \u2913 ${dl(1.5 * holeD)} deep`}</text>);
  }
  // dimension brackets: bearing block + each stage slot, on alternating rows so
  // narrow proportional slots can't overlap their neighbours' labels
  const yD0 = yC + R(gOD) + 22;
  const dim9 = (xa, L9, lab, key, row9) => {
    const yD = yD0 + (row9 || 0) * 13;
    els.push(<g key={key}>
      <line x1={x0 + xa * k} y1={yD} x2={x0 + (xa + L9) * k} y2={yD} stroke="#64748B" strokeWidth="0.8" />
      <line x1={x0 + xa * k} y1={yD - 3} x2={x0 + xa * k} y2={yD + 3} stroke="#64748B" strokeWidth="0.8" />
      <line x1={x0 + (xa + L9) * k} y1={yD - 3} x2={x0 + (xa + L9) * k} y2={yD + 3} stroke="#64748B" strokeWidth="0.8" />
      <text x={x0 + (xa + L9 / 2) * k} y={yD - 4} textAnchor="middle" className="dim">{lab}</text>
    </g>);
  };
  dim9(0, brgL, `brg ${dl(brgL)}`, 'db', 0);
  if (s1.harmonic) dim9(brgL, Math.max(gLen - brgL, 1), `component set ${dl(Math.max(gLen - brgL, 1))}`, 'dh', 1);
  else for (let i9 = 0; i9 < gt.st; i9++) dim9(ax.xs[i9], ax.slots[i9], `${dl(ax.slots[i9])}`, 'ds' + i9, ((gt.st - 1 - i9) % 2) ? 0 : 1);
  const stLabels = [];
  for (let i9 = 0; i9 < gt.st; i9++) stLabels.push('S' + (gt.st - i9));
  return (
    <svg id="svg-ghsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <line x1={x0 - faceT - 14} y1={yC} x2={x0 + gLen * k + 14} y2={yC} stroke="#94A3B8" strokeWidth="0.7" strokeDasharray="9 3 2 3" />
      {els}
      <text x={x0 + (gLen * k) / 2} y={H - 16} textAnchor="middle" className="dim">
        {`output \u25c2 ${stLabels.join(' \u25c2 ')} \u25c2 motor`}
      </text>
      <text x={x0 + (gLen * k) / 2} y={H - 5} textAnchor="middle" className="dim">
        {`ring grounded in housing \u00b7 bearing ${brg === 'acpair' ? 'AC pair' : brg === 'double' ? '2\u00d7 radial' : 'radial'}`}
      </text>
    </svg>
  );
}

/* ---- gear stage cross-section: planetary ring/planets/sun (teeth as pitch-circle ticks,
   carrier pins), spur pair, or harmonic wave-generator schematic — stage 1, to scale ---- */
function GearSection({ g, us }) {
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(3) + "\u2033" : mm.toFixed(1) + " mm");
  const s = g.stages[0];
  if (!s) return null;
  const W = 430, H = 250, cx = 150, cy = 128;
  const k = 104 / (g.gOD / 2);
  const teeth = (cx9, cy9, PD, Z, rot = 0) => {
    const r = (PD / 2) * k, out = [];
    const n = Math.min(Z, 64), step9 = (2 * Math.PI) / n;
    for (let t9 = 0; t9 < n; t9++) {
      const a9 = t9 * step9 + rot;
      out.push(<line key={t9} x1={cx9 + (r - 2.2) * Math.cos(a9)} y1={cy9 + (r - 2.2) * Math.sin(a9)}
        x2={cx9 + (r + 2.2) * Math.cos(a9)} y2={cy9 + (r + 2.2) * Math.sin(a9)} stroke={INK} strokeWidth="0.7" />);
    }
    return out;
  };
  let body = null, cap = "";
  if (s.Zr) {                                                        // planetary
    const rC = ((s.PDs + s.PDp) / 2) * k;                            // carrier radius = center distance a
    const planets = Array.from({ length: g.nP }, (_, i9) => {
      const a9 = (i9 * 2 * Math.PI) / g.nP - Math.PI / 2;
      const px = cx + rC * Math.cos(a9), py = cy + rC * Math.sin(a9);
      return <g key={i9}>
        <circle cx={px} cy={py} r={(s.PDp / 2) * k} fill="#DCE3EC" stroke={INK} strokeWidth="1" />
        {teeth(px, py, s.PDp, s.Zp, a9)}
        <circle cx={px} cy={py} r={Math.max((s.PDp / 2) * k * 0.22, 2.5)} fill="#8A97A8" stroke={INK} strokeWidth="0.7" />
      </g>;
    });
    body = <g>
      <circle cx={cx} cy={cy} r={(g.gOD / 2) * k} fill={STEEL} stroke={INK} strokeWidth="1.4" />
      <circle cx={cx} cy={cy} r={(s.PDr / 2) * k + 3} fill={BG} stroke={INK} strokeWidth="0.9" />
      {teeth(cx, cy, s.PDr, s.Zr)}
      <circle cx={cx} cy={cy} r={(s.PDr / 2) * k} fill="none" stroke="#64748B" strokeWidth="0.5" strokeDasharray="4 3" />
      <circle cx={cx} cy={cy} r={rC} fill="none" stroke="#7C4A1E" strokeWidth="0.6" strokeDasharray="2 3" />
      {Array.from({ length: g.nP }, (_, i9) => {
        const a9 = (i9 * 2 * Math.PI) / g.nP - Math.PI / 2;
        return <line key={"ca" + i9} x1={cx} y1={cy} x2={cx + rC * Math.cos(a9)} y2={cy + rC * Math.sin(a9)}
          stroke="#7C4A1E" strokeWidth="2.4" opacity="0.35" strokeLinecap="round" />;
      })}
      {planets}
      <circle cx={cx} cy={cy} r={(s.PDs / 2) * k} fill="#C9AF62" stroke={INK} strokeWidth="1" />
      {teeth(cx, cy, s.PDs, s.Zs)}
    </g>;
    cap = `sun ${s.Zs}t drives \u2192 carrier out \u00b7 ring ${s.Zr}t grounded \u00b7 ${g.nP}\u00d7 planet ${s.Zp}t \u00b7 a ${dl(s.a)} \u00b7 m ${s.m}${s.shift ? " \u00b7 sun shifted" : ""}`;
  } else if (s.Z1) {                                                 // spur cluster ladder
    const kL = Math.min(104 / (g.gOD / 2), 168 / Math.max(g.stages.reduce((a9, t9) => a9 + t9.a, 0) + s.PD2, 1));
    const yBase = cy + 78;
    const rows9 = [];
    let yA = yBase;
    g.stages.forEach((t9, i9) => {
      const r1 = (t9.PD1 / 2) * kL, r2 = (t9.PD2 / 2) * kL;
      const yG = yA - t9.a * kL;                                     // gear axis one center distance up
      rows9.push(<g key={i9}>
        <circle cx={cx} cy={yA} r={r1} fill="#C9AF62" stroke={INK} strokeWidth="1" />
        {teeth(cx, yA, t9.PD1 * kL / k, t9.Z1)}
        <circle cx={cx} cy={yG} r={r2} fill="#DCE3EC" stroke={INK} strokeWidth="1" />
        {teeth(cx, yG, t9.PD2 * kL / k, t9.Z2)}
        <circle cx={cx} cy={yA} r={2} fill={INK} /><circle cx={cx} cy={yG} r={2} fill={INK} />
        <line x1={cx + r2 + 8} y1={yA} x2={cx + r2 + 8} y2={yG} stroke="#64748B" strokeWidth="0.7" />
        <line x1={cx + r2 + 5} y1={yA} x2={cx + r2 + 11} y2={yA} stroke="#64748B" strokeWidth="0.7" />
        <line x1={cx + r2 + 5} y1={yG} x2={cx + r2 + 11} y2={yG} stroke="#64748B" strokeWidth="0.7" />
        <text x={cx + r2 + 13} y={(yA + yG) / 2 + 3} className="dim">{`a ${dl(t9.a)}`}</text>
      </g>);
      yA = yG;                                                       // next pinion is coaxial with this gear
    });
    body = <g>{rows9}</g>;
    cap = `cluster ladder \u00b7 ${g.st}\u00d7 ${s.Z1}/${s.Z2}t \u00b7 m ${s.m} \u00b7 axes climb one center distance per stage`;
  } else {                                                            // harmonic: real component set
    const rC = (g.gOD / 2) * k * 0.88, rF = rC * 0.90, rWa = rF * 0.86, rWb = rF * 0.64;
    const tt9 = [];                                                  // teeth on both splines
    for (let t9 = 0; t9 < 56; t9++) {
      const a9 = (t9 * 2 * Math.PI) / 56;
      tt9.push(<line key={'c' + t9} x1={cx + (rC - 2) * Math.cos(a9)} y1={cy + (rC - 2) * Math.sin(a9)}
        x2={cx + (rC + 2) * Math.cos(a9)} y2={cy + (rC + 2) * Math.sin(a9)} stroke={INK} strokeWidth="0.6" />);
      const rE = (rWa * Math.abs(Math.cos(a9)) + rWb * Math.abs(Math.sin(a9)));  // flex follows the ellipse
      const rFl = Math.max(rE + 3, rF * 0.7);
      tt9.push(<line key={'f' + t9} x1={cx + (rFl - 2) * Math.cos(a9)} y1={cy + (rFl - 2) * Math.sin(a9)}
        x2={cx + (rFl + 2) * Math.cos(a9)} y2={cy + (rFl + 2) * Math.sin(a9)} stroke="#475569" strokeWidth="0.55" />);
    }
    const balls9 = Array.from({ length: 14 }, (_, b9) => {
      const a9 = (b9 * 2 * Math.PI) / 14;
      const rE = ((rWa - 4) * (rWb - 4)) / Math.sqrt(Math.pow((rWb - 4) * Math.cos(a9), 2) + Math.pow((rWa - 4) * Math.sin(a9), 2));
      return <circle key={b9} cx={cx + rE * Math.cos(a9)} cy={cy + rE * Math.sin(a9)} r={2.6} fill="#B7C0CB" stroke="#475569" strokeWidth="0.5" />;
    });
    body = <g>
      <circle cx={cx} cy={cy} r={(g.gOD / 2) * k} fill={STEEL} stroke={INK} strokeWidth="1.4" />
      <circle cx={cx} cy={cy} r={rC + 3} fill={BG} stroke={INK} strokeWidth="0.9" />
      {tt9}
      <ellipse cx={cx} cy={cy} rx={rWa} ry={rWb} fill="#E8ECF1" stroke={INK} strokeWidth="1" />
      {balls9}
      <ellipse cx={cx} cy={cy} rx={rWa - 8} ry={rWb - 8} fill="#C9AF62" stroke={INK} strokeWidth="1" />
      <line x1={cx - rWa - 6} y1={cy} x2={cx - rC - 4} y2={cy} stroke="#DC2626" strokeWidth="1.2" opacity="0.7" />
      <line x1={cx + rC + 4} y1={cy} x2={cx + rWa + 6} y2={cy} stroke="#DC2626" strokeWidth="1.2" opacity="0.7" />
    </g>;
    cap = `size ${s.size || "?"} \u00b7 circ spline ${s.Zc}t grounded \u00b7 flexspline ${s.Zf}t \u00b7 wave gen drives \u00b7 ${s.u}:1 \u00b7 mesh at the major axis (red)`;
  }
  return (
    <svg id="svg-gearsec" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {body}
      <text x={cx} y={H - 8} textAnchor="middle" className="dim">{cap}</text>
      {/* right column: per-stage mini table */}
      <text x={300} y={30} className="dim" style={{ fontWeight: 600 }}>stages</text>
      {g.stages.map((t9, i9) => (
        <text key={i9} x={300} y={46 + i9 * 14} className="dim">
          {t9.Zr ? `${t9.i}: ${t9.Zs}/${t9.Zp}/${t9.Zr} \u00b7 ${t9.u.toFixed(2)}:1` :
           t9.Z1 ? `${t9.i}: ${t9.Z1}/${t9.Z2} \u00b7 ${t9.u.toFixed(2)}:1` :
           `${t9.i}: ${t9.Zf}/${t9.Zc} \u00b7 ${t9.u.toFixed(0)}:1`}
        </text>
      ))}
      <text x={300} y={46 + g.stages.length * 14 + 8} className="dim">{`\u03a3 ${g.Ntot.toFixed(2)}:1`}</text>
    </svg>
  );
}

/* ---- isometric (oblique) render of the composite actuator: shaded cylinders with machined
   detail — flanges, bolt circles, parting lines, keyed shaft, specular + ground shadow —
   scaled to the same envelope as the 2D outline, output toward the viewer ---- */
function ActuatorIso({ motorP, brakeP, act, withBrk, us, gbOD, gbLen, mnt, fin, gt }) {
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(2) + "\u2033" : Math.round(mm) + " mm");
  const env = actEnvelope(motorP, brakeP, act, withBrk, gbOD, gbLen);
  const { modOD, Lm, gOD, Lg, hasB, bOD, Lb, oShD, Ltot } = env;
  const stub = Math.max(0.18 * gOD, 8);
  const W = 430, H = 270, yC = 128;
  const q = 0.36;
  const maxOD = Math.max(gOD, modOD, bOD || 1);
  const k = Math.min((W - 140) / (Ltot + stub + q * maxOD), (H - 104) / maxOD);
  const X0 = 70;
  const R9 = (od) => (od / 2) * k;
  let uid = 0;
  const facePt = (x0, r, t) => [x0 + r * q * Math.cos(t), yC + r * Math.sin(t)];
  const cyl = (x, L, od, hue, opts = {}) => {
    const r = R9(od), rx = r * q, x0 = X0 + x * k, x1 = X0 + (x + L) * k;
    const gid = "gAct" + (uid++), fid = "fAct" + (uid++);
    const kids = [];
    kids.push(<defs key="d">
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={hue[0]} /><stop offset="42%" stopColor={hue[1]} />
        <stop offset="88%" stopColor={hue[2]} /><stop offset="100%" stopColor={hue[1]} />
      </linearGradient>
      <radialGradient id={fid} cx="38%" cy="36%" r="80%">
        <stop offset="0%" stopColor={hue[0]} /><stop offset="70%" stopColor={hue[1]} />
        <stop offset="100%" stopColor={hue[2]} />
      </radialGradient>
    </defs>);
    kids.push(<ellipse key="far" cx={x1} cy={yC} rx={rx} ry={r} fill={hue[2]} stroke="#1F2937" strokeWidth="0.8" />);
    kids.push(<path key="body" d={`M ${x0} ${yC - r} L ${x1} ${yC - r} A ${rx} ${r} 0 0 1 ${x1} ${yC + r} L ${x0} ${yC + r} Z`}
      fill={`url(#${gid})`} />);
    // specular strip along the top third
    kids.push(<path key="spec" d={`M ${x0} ${yC - r * 0.72} L ${x1} ${yC - r * 0.72} A ${rx * 0.72} ${r * 0.5} 0 0 1 ${x1} ${yC - r * 0.28} L ${x0} ${yC - r * 0.28} Z`}
      fill="#FFFFFF" opacity={opts.spec != null ? opts.spec : 0.16} />);
    kids.push(<line key="te" x1={x0} y1={yC - r} x2={x1} y2={yC - r} stroke="#1F2937" strokeWidth="0.8" />);
    kids.push(<line key="be" x1={x0} y1={yC + r} x2={x1} y2={yC + r} stroke="#1F2937" strokeWidth="0.8" />);
    // parting lines (endbell joints etc.)
    (opts.parts || []).forEach((f9, i9) => {
      const xp = x0 + (x1 - x0) * f9;
      kids.push(<path key={"pl" + i9} d={`M ${xp} ${yC - r} A ${rx} ${r} 0 0 1 ${xp} ${yC + r}`}
        fill="none" stroke="#00000055" strokeWidth="0.8" />);
      kids.push(<path key={"plh" + i9} d={`M ${xp + 1.2} ${yC - r} A ${rx} ${r} 0 0 1 ${xp + 1.2} ${yC + r}`}
        fill="none" stroke="#FFFFFF44" strokeWidth="0.6" />);
    });
    // stage divider grooves
    (opts.grooves || []).forEach((xd, i9) => {
      kids.push(<path key={"gr" + i9} d={`M ${xd} ${yC - r} A ${rx} ${r} 0 0 1 ${xd} ${yC + r}`}
        fill="none" stroke="#00000066" strokeWidth="1.1" />);
    });
    // near face with radial shading + chamfer ring
    kids.push(<ellipse key="face" cx={x0} cy={yC} rx={rx} ry={r} fill={`url(#${fid})`} stroke="#1F2937" strokeWidth="1" />);
    kids.push(<ellipse key="cham" cx={x0} cy={yC} rx={rx * 0.94} ry={r * 0.94} fill="none" stroke="#FFFFFF55" strokeWidth="0.8" />);
    if (opts.bolts && opts.bolts.n > 0) {
      const rB = R9(opts.bolts.bcdMM), hR = R9(opts.bolts.dMM);
      for (let b9 = 0; b9 < opts.bolts.n; b9++) {
        const t = (b9 * 2 * Math.PI) / opts.bolts.n + 0.5;
        const [bx, by] = facePt(x0, rB, t);
        kids.push(<ellipse key={"bt" + b9} cx={bx} cy={by} rx={Math.max(hR * q, 1)} ry={Math.max(hR, 1.4)} fill="#3A4350" stroke="#1F2937" strokeWidth="0.5" />);
        kids.push(<ellipse key={"bth" + b9} cx={bx - hR * q * 0.25} cy={by - hR * 0.25} rx={Math.max(hR * q * 0.55, 0.6)} ry={Math.max(hR * 0.55, 0.8)} fill="#8B95A3" />);
      }
    }
    if (opts.pilot) {
      kids.push(<ellipse key="pi" cx={x0} cy={yC} rx={rx * opts.pilot} ry={r * opts.pilot} fill={hue[2]} stroke="#1F2937" strokeWidth="0.7" />);
      kids.push(<ellipse key="pi2" cx={x0} cy={yC} rx={rx * opts.pilot * 0.86} ry={r * opts.pilot * 0.86} fill={hue[1]} stroke="#00000033" strokeWidth="0.5" />);
    }
    if (opts.label) {
      const lx = (x0 + x1) / 2 + rx * 0.4;
      kids.push(<text key="lb" x={lx} y={yC - r - 8} textAnchor="middle" className="dim">{opts.label}</text>);
      kids.push(<line key="ll" x1={lx} y1={yC - r - 5} x2={lx} y2={yC - r * 0.6} stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="2 2" />);
    }
    return <g key={gid + "w"}>{kids}</g>;
  };
  const xm = Lg, xb = Lg + Lm;
  const m9 = mnt || {};
  const flanged = m9.style === "flange";
  const aft = flanged && m9.dir === "aft";                           // flange set back; the OD ahead of it is a mounting boss
  const flgOD = flanged ? (m9.flgOD > 0 ? m9.flgOD : gOD * 1.15) : 0;
  const flgT = flanged ? Math.max(m9.flgT || 3, 1) : 0;
  const gap9 = aft ? Math.max(m9.gap || 0, 0) : 0;
  const holeD = MNT_THREADS[m9.thread] || 3;
  const faceOD = flanged ? flgOD : gOD;
  const bcdAuto = aft ? (gOD + flgOD) / 2 : faceOD * (flanged ? 0.8 : 0.72);
  const bcdRaw = m9.bcd > 0 ? m9.bcd : bcdAuto;
  const bcd = aft ? Math.min(Math.max(bcdRaw, gOD + holeD + 1), flgOD - holeD - 1)
    : Math.min(bcdRaw, faceOD - holeD - 1);
  const bolts = m9.n > 0 ? { n: Math.round(m9.n), bcdMM: bcd, dMM: holeD } : null;
  const fwdT = flanged && !aft ? flgT : 0;                           // only a forward flange adds length
  const o9 = mnt && mnt.osh ? mnt.osh : {};
  const shOD = o9.od > 0 ? o9.od : oShD;
  const shLen = o9.len > 0 ? o9.len : stub;
  const featL = o9.feat > 0 ? Math.min(o9.feat, shLen) : 0.7 * shLen;
  const pinD = o9.pin > 0 ? o9.pin : 1.35 * shOD;                   // pinion tip runs LARGER than the shaft
  const pilOD = Math.max(m9.pilotOD || 0, 0), pilT = Math.max(m9.pilotT || 0, 0);
  const hasPilot = pilOD > oShD + 0.5 && pilT > 0.2;                 // projecting piloting boss at the shaft exit
  const f9 = fin || {};
  const FG = ISO_FINISHES[f9.gb] || ISO_FINISHES["Matte steel"];
  const FM = ISO_FINISHES[f9.mot] || ISO_FINISHES["Aluminum"];
  const FB = ISO_FINISHES[f9.brk] || ISO_FINISHES["Black anodized"];
  const shx0 = X0 - (shLen + fwdT + (hasPilot ? pilT : 0)) * k, shR = R9(shOD);
  return (
    <svg id="svg-actiso" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <text x={W / 2} y={14} textAnchor="middle" className="dim">
        {`isometric \u00b7 output toward viewer \u00b7 ${act.type.toLowerCase()} ${act.st}-stage ${act.N}:1 \u203a motor${hasB ? " \u203a brake" : ""} \u00b7 true relative scale`}</text>
      {/* ground shadow */}
      <ellipse cx={X0 + ((Ltot - stub) / 2) * k} cy={yC + R9(maxOD) + 12} rx={(Ltot + stub) * k * 0.55}
        ry={7} fill="#0F172A" opacity="0.10" />
      {/* rear→front */}
      {hasB && cyl(xb, Lb, bOD, FB.h, {
        parts: [0.82], spec: FB.sp, label: `brake \u00d8${dl(bOD)} \u00d7 ${dl(Lb)}` })}
      {hasB && (() => { // lead wires out the brake top
        const wx = X0 + (xb + Lb * 0.7) * k, wy = yC - R9(bOD);
        return <g key="leads">
          <path d={`M ${wx} ${wy} C ${wx + 6} ${wy - 14}, ${wx + 18} ${wy - 12}, ${wx + 24} ${wy - 20}`} fill="none" stroke="#B91C1C" strokeWidth="1.6" strokeLinecap="round" />
          <path d={`M ${wx + 3} ${wy} C ${wx + 9} ${wy - 12}, ${wx + 21} ${wy - 9}, ${wx + 27} ${wy - 16}`} fill="none" stroke="#1D4ED8" strokeWidth="1.6" strokeLinecap="round" />
        </g>;
      })()}
      {cyl(xm, Lm, modOD, FM.h, {
        parts: [0.1, 0.9], spec: FM.sp, label: `motor \u00d8${dl(modOD)} \u00d7 ${dl(Lm)}` })}
      {(() => {
        // stage-divider grooves at the REAL internal stage boundaries (shared
        // gearAxial partition) so they line up with the section views; the old
        // even split remains only as a fallback when no train is synthesized
        const grooveXs = gt && gt.stages && gt.stages.length && !gt.stages[0].harmonic
          ? gearAxial(gt, Lg).xs.slice(0, -1).map((xb9) => X0 + xb9 * k)
          : Array.from({ length: act.st - 1 }, (_, i9) => X0 + (Lg * 0.22 + ((Lg * 0.78) / act.st) * (i9 + 1)) * k);
        const hueG = FG.h, hueF = FG.h, spG = FG.sp;
        if (aft) {
          const xF = gap9, xR = gap9 + flgT;                         // flange span within the gearhead length
          return <g key="gaft">
            {cyl(xR, Math.max(Lg - xR, 1), gOD, hueG, {
              grooves: grooveXs.filter((xd) => xd > X0 + xR * k + 2), spec: spG,
              label: `gearhead \u00d8${dl(gOD)} \u00d7 ${dl(Lg)}` })}
            {cyl(xF, flgT, flgOD, hueF, { bolts, spec: spG })}
            {cyl(0, Math.max(gap9, 0.5), gOD, hueG, { spec: spG, pilot: hasPilot ? null : 0.3 })}
          </g>;
        }
        return <g key="gfwd">
          {cyl(0, Lg, gOD, hueG, { grooves: grooveXs, spec: spG, label: `gearhead \u00d8${dl(gOD)} \u00d7 ${dl(Lg)}`,
            bolts: !flanged ? bolts : null, pilot: !flanged && !hasPilot ? 0.3 : null })}
          {flanged && cyl(-flgT, flgT, flgOD, hueF, { bolts, spec: spG, pilot: hasPilot ? null : 0.3 })}
        </g>;
      })()}
      {/* keyed output shaft */}
      {hasPilot && cyl(-fwdT - pilT, pilT, pilOD, FG.h, { spec: FG.sp })}
      {cyl(-fwdT - (hasPilot ? pilT : 0) - shLen + ((o9.type || "key") === "pinion" ? featL : 0),
        shLen - ((o9.type || "key") === "pinion" ? featL : 0), shOD, ["#C6CBD2", "#9AA2AC", "#565D66"], {})}
      {(() => {
        const sR = R9(shOD), sx0 = X0 - (fwdT + (hasPilot ? pilT : 0) + shLen) * k;
        const fw = featL * k, style9 = o9.type || "key";
        if (style9 === "key") return <rect x={sx0 + 2} y={yC - sR - 0.5} width={Math.max(fw, 6)} height={Math.max(sR * 0.34, 2)}
          fill="#3A4350" stroke="#1F2937" strokeWidth="0.5" rx="1" />;
        if (style9 === "dflat") return <g>
          <rect x={sx0 + 1} y={yC - sR} width={Math.max(fw, 6)} height={sR * 0.30} fill="#7E858E" stroke="#1F2937" strokeWidth="0.5" />
          <line x1={sx0 + 1} y1={yC - sR + sR * 0.30} x2={sx0 + 1 + Math.max(fw, 6)} y2={yC - sR + sR * 0.30} stroke="#1F2937" strokeWidth="0.9" />
        </g>;
        if (style9 === "pinion") {
          const fw9 = Math.max(featL * k, 8);
          const pR = R9(pinD), px0 = X0 - (fwdT + (hasPilot ? pilT : 0) + shLen) * k;
          const nT9 = 15;                                          // visible flank lines, front half
          return <g>
            {cyl(-fwdT - (hasPilot ? pilT : 0) - shLen, featL, pinD, ["#CDD2D8", "#9BA3AD", "#4F565F"], {})}
            {Array.from({ length: nT9 }, (_, t9) => {
              const th9 = ((t9 + 0.5) * Math.PI) / nT9;             // circumferential position
              const yl = yC - pR * Math.cos(th9);
              const edge9 = Math.abs(Math.cos(th9));                // near silhouette = denser/darker
              return <line key={t9} x1={px0} y1={yl} x2={px0 + fw9} y2={yl}
                stroke="#2A3138" strokeWidth={0.5 + 0.25 * edge9} opacity={0.45 + 0.4 * edge9} />;
            })}
            {Array.from({ length: nT9 }, (_, t9) => {
              const a9 = (t9 * 2 * Math.PI) / nT9;
              return <line key={"ef" + t9} x1={px0 + 0.36 * pR * Math.cos(a9) * 0.78} y1={yC + pR * Math.sin(a9) * 0.78}
                x2={px0 + 0.36 * pR * Math.cos(a9)} y2={yC + pR * Math.sin(a9)} stroke="#3A4148" strokeWidth="0.6" />;
            })}
            <ellipse cx={px0} cy={yC} rx={Math.max(0.36 * pR * 0.22, 1)} ry={Math.max(pR * 0.22, 1.6)} fill="#3A4148" />
          </g>;
        }
        return null;
      })()}
      <text x={W / 2} y={H - 20} textAnchor="middle" className="dim">
        {`overall ${dl(Ltot)} + ${dl(shLen + fwdT + (hasPilot ? pilT : 0))} ${(o9.type || "key")} shaft \u00d8${dl(shOD)}${(o9.type || "key") === "pinion" ? ` \u00b7 pinion \u00d8${dl(pinD)} \u00d7 ${dl(featL)}` : ""}${flanged && !aft ? ` & flange` : ""}`}</text>
      <text x={W / 2} y={H - 8} textAnchor="middle" className="dim">
        {(hasPilot ? `pilot \u00d8${dl(pilOD)} \u00d7 ${dl(pilT)}` : "") +
          (aft ? `${hasPilot ? " \u00b7 " : ""}flange \u00d8${dl(flgOD)} \u00d7 ${dl(flgT)} at ${dl(gap9)} aft of face (boss \u00d8${dl(gOD)})` : "") +
          (bolts ? `${hasPilot || aft ? " \u00b7 " : ""}${bolts.n}\u00d7 ${m9.thread} on \u00d8${dl(bolts.bcdMM)} BC` : "")}</text>
    </svg>
  );
}

function ActuatorOutline({ motorP, brakeP, act, withBrk, us, gbOD, gbLen, mnt, gt, brg }) {
  const pil2 = mnt && mnt.pilotOD > 0 && mnt.pilotT > 0.2 ? { od: mnt.pilotOD, t: mnt.pilotT } : null;
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(2) + "\u2033" : Math.round(mm) + " mm");
  const { modOD, stk, ovh, Lm, gOD, Lg, hasB, bOD, Lb, shD, oShD, Ltot } =
    actEnvelope(motorP, brakeP, act, withBrk, gbOD, gbLen);
  const stub = 12;
  const W = 430, H = 250, yC = 118, mLx = 56;
  const k = Math.min((W - mLx - 44) / (Ltot + stub), (H - 96) / Math.max(gOD, modOD, bOD || 1));
  const X0 = mLx + stub * k;
  const R = (od) => (od / 2) * k;
  const blk = (x, L, od, fill, key) => (
    <rect key={key} x={X0 + x * k} y={yC - R(od)} width={L * k} height={2 * R(od)} fill={fill} stroke="#334155" strokeWidth="1" />
  );
  const dimSeg = (x, L, label, row) => {
    const y9 = yC + R(Math.max(gOD, modOD, bOD || 1)) + 14 + row * 15;
    return (
      <g key={"d" + label}>
        <line x1={X0 + x * k} y1={y9} x2={X0 + (x + L) * k} y2={y9} stroke="#64748B" strokeWidth="0.8" />
        <line x1={X0 + x * k} y1={y9 - 3} x2={X0 + x * k} y2={y9 + 3} stroke="#64748B" strokeWidth="0.8" />
        <line x1={X0 + (x + L) * k} y1={y9 - 3} x2={X0 + (x + L) * k} y2={y9 + 3} stroke="#64748B" strokeWidth="0.8" />
        <text x={X0 + (x + L / 2) * k} y={y9 - 3} textAnchor="middle" className="dim">{label}</text>
      </g>
    );
  };
  const odLbl = (x, od, txt) => (
    <g key={"o" + txt}>
      <line x1={X0 + x * k} y1={yC - R(od)} x2={X0 + x * k} y2={yC - R(od) - 8} stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="2 2" />
      <text x={X0 + x * k} y={yC - R(od) - 11} textAnchor="middle" className="dim">{txt}</text>
    </g>
  );
  const xm = Lg, xb = Lg + Lm;                                             // block start coordinates (mm)
  return (
    <svg id="svg-actline" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <text x={W / 2} y={14} textAnchor="middle" className="dim">
        {`output \u2039 ${act.type.toLowerCase()} ${act.st}-stage ${act.N}:1 \u203a motor${hasB ? " \u203a brake" : ""} — typical proportions`}</text>
      {/* centerline + shafts: with a synthesized train the output shaft stops in the
          output stage's carrier and the motor shaft stops at the input-stage sun —
          a multi-stage train has no through shaft. Fallback: the old single bar. */}
      <line x1={16} y1={yC} x2={W - 12} y2={yC} stroke="#94A3B8" strokeWidth="0.7" strokeDasharray="9 3 2 3" />
      {/* gearhead housing + ring band FIRST so the shafts and cutaway internals paint
          on top of it (they were silently buried when the housing was drawn last) */}
      {blk(0, Lg, gOD, "#B9C2CE", "g")}
      <rect x={X0} y={yC - R(gOD)} width={Lg * k} height={5} fill="#8A97A8" />
      <rect x={X0} y={yC + R(gOD) - 5} width={Lg * k} height={5} fill="#8A97A8" />
      {gt && gt.stages && gt.stages.length > 0 ? (() => {
        const axS = gearAxial(gt, Lg);
        const harm = !!gt.stages[0].harmonic;
        const outL = axS.brgL + (harm ? 2 : (axS.slots[gt.st - 1] || 2) * 0.55);
        const inX = harm ? axS.brgL + (Lg - axS.brgL) * 0.65 : (axS.xs[0] || axS.brgL) + 0.4 * (axS.slots[0] || 2);
        return <g>
          <rect x={X0} y={yC - (shD / 2) * k} width={outL * k} height={shD * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" />
          <rect x={X0 + inX * k} y={yC - (shD / 2) * k} width={(Ltot - inX) * k} height={shD * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" />
        </g>;
      })() : (
        <rect x={X0} y={yC - (shD / 2) * k} width={(Ltot) * k} height={shD * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" />
      )}
      {gt && gt.stages && gt.stages.length > 0 && (() => {
        // cutaway internals inside the gearhead block: per-stage gear sets, carriers,
        // ring bands, and the output bearing occupying its block (drawn at true scale)
        const ax9 = gearAxial(gt, Lg);                            // shared partition — grooves use it too
        const brgL = ax9.brgL;                                    // bearing block at the output end
        const els9 = [];
        const planetary = !!gt.stages[0].Zr;
        for (let i9 = 0; i9 < gt.st; i9++) {
          const s9 = gt.stages[Math.min(i9, gt.stages.length - 1)];
          const xs = ax9.xs[i9], slotL = ax9.slots[i9];           // stage 1 nearest the motor
          const F9 = Math.min(s9.F || slotL * 0.6, slotL * 0.72);
          const xg = X0 + (xs + (slotL - F9) / 2) * k, wg = F9 * k;
          if (planetary) {
            const rS = (s9.PDs / 2) * k, rPo = ((s9.a + s9.PDp / 2)) * k, rPi = ((s9.a - s9.PDp / 2)) * k, rR = (s9.PDr / 2) * k;
            // ring band (grounded in the housing)
            els9.push(<rect key={'rg' + i9} x={xg} y={yC - rR - 3} width={wg} height={3} fill="#64748B" />);
            els9.push(<rect key={'rg2' + i9} x={xg} y={yC + rR} width={wg} height={3} fill="#64748B" />);
            // planets (section through top & bottom planets)
            els9.push(<rect key={'pt' + i9} x={xg} y={yC - rPo} width={wg} height={rPo - rPi} fill="#B4BDC9" stroke="#334155" strokeWidth="0.8" />);
            els9.push(<rect key={'pb' + i9} x={xg} y={yC + rPi} width={wg} height={rPo - rPi} fill="#B4BDC9" stroke="#334155" strokeWidth="0.8" />);
            // planet pins
            els9.push(<line key={'pp' + i9} x1={xg + wg / 2} y1={yC - (rPo + rPi) / 2} x2={xg + wg / 2} y2={yC + (rPo + rPi) / 2} stroke="#475569" strokeWidth="1.6" opacity="0.55" />);
            // sun
            els9.push(<rect key={'sn' + i9} x={xg} y={yC - rS} width={wg} height={2 * rS} fill="#C9AF62" stroke="#334155" strokeWidth="0.8" />);
            // carrier plate on the output side of the stage
            const xc = X0 + (xs + (slotL - F9) / 2 - Math.min(0.16 * slotL, 2.5)) * k;
            els9.push(<rect key={'cr' + i9} x={xc} y={yC - rPo * 0.92} width={Math.min(0.16 * slotL, 2.5) * k} height={2 * rPo * 0.92} fill="#8B7355" stroke="#334155" strokeWidth="0.7" opacity="0.85" />);
          } else if (gt.stages[0].Z1) {                            // spur: pairs on their ladder axes
            const r1 = (s9.PD1 / 2) * k, r2 = (s9.PD2 / 2) * k;
            const yP = yC + (s9.yAx || 0) * k, yG2 = yP + (s9.a || 0) * k;
            els9.push(<rect key={'g1' + i9} x={xg} y={yP - r1} width={wg} height={2 * r1} fill="#C9AF62" stroke="#334155" strokeWidth="0.8" />);
            els9.push(<rect key={'g2' + i9} x={xg} y={yG2 - r2} width={wg} height={2 * r2} fill="#B4BDC9" stroke="#334155" strokeWidth="0.8" opacity="0.9" />);
          } else if (gt.stages[0].harmonic) {                       // harmonic: cup + wave gen schematic
            const s0h = gt.stages[0];
            const rSp = ((0.86 * (s0h.hsOD || gOD)) / 2) * k, rFx = ((0.80 * (s0h.hsOD || gOD)) / 2) * k;
            const xh = X0 + brgL * k, hL2 = Math.max((Lg - brgL) * k - 2, 6);
            for (const sgn of [-1, 1]) {
              els9.push(<rect key={'cs' + sgn} x={xh + hL2 * 0.55} y={sgn > 0 ? yC + rFx : yC - rSp} width={hL2 * 0.4} height={rSp - rFx} fill="#64748B" />);
              els9.push(<rect key={'fx' + sgn} x={xh + 2} y={sgn > 0 ? yC + rFx - 1.6 : yC - rFx} width={hL2 * 0.92} height={1.6} fill="#B4BDC9" stroke="#334155" strokeWidth="0.5" />);
            }
            els9.push(<ellipse key="wg" cx={xh + hL2 * 0.76} cy={yC} rx={hL2 * 0.14} ry={rFx * 0.72} fill="#C9AF62" stroke="#334155" strokeWidth="0.7" />);
            break;                                                  // single component set
          }
        }
        // output bearing filling its block
        const brOD9 = 0.46 * gOD, brID9 = Math.max(oShD * 1.2, 0.16 * gOD);
        const rows = brg === 'double' || brg === 'acpair' ? 2 : 1;
        const rowL = Math.min((brgL * 0.8) / rows, brOD9 * 0.35);
        for (let r9 = 0; r9 < rows; r9++) {
          const xb = X0 + (brgL * 0.5 - (rows * rowL) / 2 + r9 * rowL + rowL * 0.08) * k, wb = rowL * 0.84 * k;
          for (const sgn of [-1, 1]) {
            const yT = yC + sgn * (brID9 / 2) * k, yB2 = yC + sgn * (brOD9 / 2) * k;
            els9.push(<rect key={'br' + r9 + sgn} x={xb} y={Math.min(yT, yB2)} width={wb} height={Math.abs(yB2 - yT)} fill="#E8ECF1" stroke="#334155" strokeWidth="0.8" />);
            els9.push(<circle key={'bb' + r9 + sgn} cx={xb + wb / 2} cy={(yT + yB2) / 2} r={Math.min(Math.abs(yB2 - yT) * 0.32, wb * 0.4)} fill="#B7C0CB" stroke="#475569" strokeWidth="0.6" />);
            if (brg === 'acpair') els9.push(<line key={'ac' + r9 + sgn} x1={xb + (r9 ? wb : 0)} y1={Math.min(yT, yB2)} x2={xb + (r9 ? 0 : wb)} y2={Math.max(yT, yB2)} stroke="#475569" strokeWidth="0.6" opacity="0.7" />);
          }
        }
        return <g>{els9}</g>;
      })()}
      {/* flange (when specified) then the output shaft stub */}
      {mnt && mnt.style === "flange" && (() => {
        const fOD = mnt.flgOD > 0 ? mnt.flgOD : gOD * 1.15, fT = Math.max(mnt.flgT || 3, 1);
        const aft2 = mnt.dir === "aft", gp2 = aft2 ? Math.max(mnt.gap || 0, 0) : 0;
        const xF = aft2 ? X0 + gp2 * k : X0 - fT * k;
        return <rect x={xF} y={yC - (fOD / 2) * k} width={fT * k} height={fOD * k} fill="#B9C2CE" stroke="#334155" strokeWidth="1" />;
      })()}
      {(() => {
        const fT2 = mnt && mnt.style === "flange" && mnt.dir !== "aft" ? Math.max(mnt.flgT || 3, 1) : 0;
        return <g>
          {pil2 && <rect x={X0 - (fT2 + pil2.t) * k} y={yC - (pil2.od / 2) * k} width={pil2.t * k} height={pil2.od * k} fill="#AEB8C4" stroke="#334155" strokeWidth="0.9" />}
          {(() => {
            const o2 = mnt && mnt.osh ? mnt.osh : {};
            const sOD2 = o2.od > 0 ? o2.od : oShD, sL2 = o2.len > 0 ? o2.len : stub;
            const fL2 = (o2.feat > 0 ? Math.min(o2.feat, sL2) : 0.7 * sL2) * k;
            const sx2 = X0 - (sL2 + fT2 + (pil2 ? pil2.t : 0)) * k, sy2 = yC - (sOD2 / 2) * k;
            return <g>
              <rect x={sx2 + (o2.type === "pinion" ? fL2 : 0)} y={sy2} width={sL2 * k - (o2.type === "pinion" ? fL2 : 0)} height={sOD2 * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.9" />
              {(o2.type || "key") === "key" && <rect x={sx2 + 1} y={sy2 - 1.6} width={fL2} height={1.6} fill="#3A4350" />}
              {o2.type === "dflat" && <line x1={sx2 + 1} y1={sy2 + sOD2 * k * 0.18} x2={sx2 + 1 + fL2} y2={sy2 + sOD2 * k * 0.18} stroke="#334155" strokeWidth="1.1" />}
              {o2.type === "pinion" && (() => {
                const pD2 = (o2.pin > 0 ? o2.pin : 1.35 * sOD2) * k, pR2 = pD2 / 2;
                const py2 = yC - pR2, nT2 = 11;
                return <g>
                  <rect x={sx2} y={py2} width={fL2} height={pD2} fill="#9AA5B1" stroke="#334155" strokeWidth="0.9" />
                  {Array.from({ length: nT2 }, (_, t2) => {
                    const th2 = ((t2 + 0.5) * Math.PI) / nT2;
                    const yl2 = yC - pR2 * Math.cos(th2);
                    const e2 = Math.abs(Math.cos(th2));
                    return <line key={t2} x1={sx2} y1={yl2} x2={sx2 + fL2} y2={yl2} stroke="#334155" strokeWidth={0.45 + 0.25 * e2} opacity={0.4 + 0.45 * e2} />;
                  })}
                  <line x1={sx2 + fL2} y1={py2} x2={sx2 + fL2} y2={py2 + pD2} stroke="#334155" strokeWidth="0.9" />
                </g>;
              })()}
            </g>;
          })()}
        </g>;
      })()}
      {/* stage dividers + label over the internals */}
      {(gt && gt.stages && gt.stages.length > 0 && !gt.stages[0].harmonic
        ? gearAxial(gt, Lg).xs.slice(0, -1)
        : Array.from({ length: act.st - 1 }, (_, i9) => Lg * 0.22 + ((Lg * 0.78) / act.st) * (i9 + 1))
      ).map((xb9, i9) => {
        const xd = X0 + xb9 * k;
        return <line key={"st" + i9} x1={xd} y1={yC - R(gOD) + 5} x2={xd} y2={yC + R(gOD) - 5} stroke="#64748B" strokeWidth="0.8" strokeDasharray="4 3" />;
      })}
      <text x={X0 + (Lg / 2) * k} y={yC - R(gOD) * 0.45} textAnchor="middle" className="wnum">{act.type.toLowerCase()}</text>
      {/* motor internals: BLDC = stator coils + heads; brushed = housing magnets,
         wound armature on the shaft, commutator + brush at the rear (inside-out anatomy) */}
      {blk(xm, Lm, modOD, "#C7CFDA", "m")}
      {motorP.motorType === "brushed" ? (() => {
        const xs9 = X0 + (xm + (Lm - stk) / 2) * k, ws9 = stk * k;
        const rMag = R(modOD * 0.92), tMag = Math.max(R(modOD) * 0.10, 3);
        const rArm = R(modOD * 0.62);
        const comW = Math.max(ovh * 0.55, 2) * k, xc9 = xs9 + ws9 + 2;
        return <g>
          {/* stationary magnet arcs bonded to the housing ID */}
          <rect x={xs9 - ovh * k * 0.4} y={yC - rMag} width={ws9 + ovh * k * 0.8} height={tMag} fill="#B0413E" stroke="#334155" strokeWidth="0.6" />
          <rect x={xs9 - ovh * k * 0.4} y={yC + rMag - tMag} width={ws9 + ovh * k * 0.8} height={tMag} fill="#3E5FB0" stroke="#334155" strokeWidth="0.6" />
          {/* armature: lam stack on the shaft with the winding band + end turns */}
          <rect x={xs9} y={yC - rArm} width={ws9} height={2 * rArm} fill="#9AA7B8" stroke="#334155" strokeWidth="0.7" />
          <rect x={xs9} y={yC - rArm * 0.88} width={ws9} height={2 * rArm * 0.88} fill="#C87F3D" opacity="0.55" />
          <rect x={xs9 - ovh * k * 0.7} y={yC - rArm * 0.8} width={ovh * k * 0.7} height={2 * rArm * 0.8} fill="#C87F3D" opacity="0.9" />
          <rect x={xs9 + ws9} y={yC - rArm * 0.8} width={ovh * k * 0.7} height={2 * rArm * 0.8} fill="#C87F3D" opacity="0.9" />
          {/* commutator + brush at the rear */}
          <rect x={xc9 + ovh * k * 0.7} y={yC - R(modOD * 0.26)} width={comW} height={2 * R(modOD * 0.26)} fill="#B06A38" stroke="#334155" strokeWidth="0.6" />
          <rect x={xc9 + ovh * k * 0.7 + comW * 0.15} y={yC - R(modOD * 0.44)} width={comW * 0.7} height={R(modOD * 0.16)} fill="#3A4350" stroke="#1F2937" strokeWidth="0.5" />
        </g>;
      })() : motorP.motorType === "stepper" ? (() => {
        // hybrid/PM stepper anatomy: stator stack with short end turns, rotor as two
        // toothed cup sections with the axial magnet sandwiched between (hybrid) or a
        // PM ring rotor (can-stack PM)
        const xs9 = X0 + (xm + (Lm - stk) / 2) * k, ws9 = stk * k;
        const rSt = R(modOD * 0.94), rRt = R(modOD * 0.55);
        const ovhS = Math.min(ovh, 0.5 * ovh + 2);                 // stepper heads are short
        const hyb = motorP.stpKind !== "pm";
        const magW = Math.max(ws9 * 0.1, 2), cupW = (ws9 - magW) / 2;
        return <g>
          <rect x={xs9} y={yC - rSt} width={ws9} height={2 * rSt} fill="#9AA7B8" stroke="#334155" strokeWidth="0.7" />
          <rect x={xs9 - ovhS * k * 0.7} y={yC - rSt * 0.82} width={ovhS * k * 0.7} height={2 * rSt * 0.82} fill="#C87F3D" opacity="0.9" />
          <rect x={xs9 + ws9} y={yC - rSt * 0.82} width={ovhS * k * 0.7} height={2 * rSt * 0.82} fill="#C87F3D" opacity="0.9" />
          {hyb ? <g>
            <rect x={xs9} y={yC - rRt} width={cupW} height={2 * rRt} fill="#B4BDC9" stroke="#334155" strokeWidth="0.7" />
            <rect x={xs9 + cupW} y={yC - rRt * 0.7} width={magW} height={2 * rRt * 0.7} fill="#3E5FB0" stroke="#334155" strokeWidth="0.5" />
            <rect x={xs9 + cupW + magW} y={yC - rRt} width={cupW} height={2 * rRt} fill="#B4BDC9" stroke="#334155" strokeWidth="0.7" />
            {Array.from({ length: 5 }, (_, t9) => <line key={"tt" + t9}
              x1={xs9 + 1 + (t9 * (cupW - 2)) / 4} y1={yC - rRt} x2={xs9 + 1 + (t9 * (cupW - 2)) / 4} y2={yC - rRt + 3} stroke="#334155" strokeWidth="0.5" />)}
            {Array.from({ length: 5 }, (_, t9) => <line key={"tb" + t9}
              x1={xs9 + cupW + magW + 1 + (t9 * (cupW - 2)) / 4} y1={yC + rRt - 3} x2={xs9 + cupW + magW + 1 + (t9 * (cupW - 2)) / 4} y2={yC + rRt} stroke="#334155" strokeWidth="0.5" />)}
          </g> : <g>
            <rect x={xs9} y={yC - rRt} width={ws9} height={2 * rRt} fill="#B4BDC9" stroke="#334155" strokeWidth="0.7" />
            <rect x={xs9} y={yC - rRt} width={ws9} height={3} fill="#B0413E" opacity="0.85" />
            <rect x={xs9} y={yC + rRt - 3} width={ws9} height={3} fill="#3E5FB0" opacity="0.85" />
          </g>}
        </g>;
      })() : (<g>
        <rect x={X0 + (xm + (Lm - stk) / 2) * k} y={yC - R(modOD * 0.94)} width={stk * k} height={2 * R(modOD * 0.94)} fill="#9AA7B8" stroke="#334155" strokeWidth="0.7" />
        <rect x={X0 + (xm + (Lm - stk) / 2 - ovh) * k} y={yC - R(modOD * 0.8)} width={ovh * k} height={2 * R(modOD * 0.8)} fill="#C87F3D" opacity="0.9" />
        <rect x={X0 + (xm + (Lm + stk) / 2) * k} y={yC - R(modOD * 0.8)} width={ovh * k} height={2 * R(modOD * 0.8)} fill="#C87F3D" opacity="0.9" />
      </g>)}
      <text x={X0 + (xm + Lm / 2) * k} y={yC - R(modOD) * 0.45} textAnchor="middle" className="wnum">
        {motorP.motorType === "brushed" ? "brushed DC"
          : motorP.motorType === "stepper" ? (motorP.stpKind === "pm" ? "PM stepper" : "hybrid stepper")
          : "BLDC"}</text>
      {/* brake: real pot-core half-section from the Brake tab's own dimensions —
          backiron (rim + boss + web) with the coil seated in its pocket, springs,
          sliding armature, then the lined friction disc on its hub. Same anatomy
          as the Brake tab's AxialCutaway, compressed to the outline scale. */}
      {hasB && (() => {
        const rOD9 = R(bOD);
        const rPkt = R(Math.max(brakeP.brkPktID || bOD * 0.8, 4));
        const rBoss = R(Math.max(brakeP.brkBossOD || bOD * 0.3, 2));
        const rThru = R(Math.max(brakeP.brkBore || 8, 4));
        const rBob = R(Math.max(brakeP.brkBobID || bOD * 0.62, 4));
        const rFlg = Math.min(R(Math.max(brakeP.brkBobOD || bOD * 0.72, 5)), rPkt - 1);
        const rRo = Math.min(R(2 * Math.max(brakeP.brkRo || bOD * 0.42, 2)), rOD9 * 0.97);
        const rRi = R(2 * Math.max(brakeP.brkRi || bOD * 0.28, 1));
        const rHub = Math.max(rRi * 0.8, rThru + 1.5);
        const stkB = brakeP.stackL, tArm = Math.max(brakeP.brkArm || 4, 2), faces = brakeP.brkFaces >= 2;
        const pktD = Math.min(Math.max(brakeP.brkPktD || stkB * 0.7, 2), stkB - 1);
        const xB0 = X0 + xb * k, wStk = stkB * k;                 // backiron block
        const xA0 = xB0 + wStk, wArm = tArm * k;                  // armature slides on the pocket side
        const xD0 = xA0 + wArm, wD = Math.max(2.2 * k, 2);        // lined disc outboard
        const band = (x9, w9, ri9, ro9, fill9, key9) => <g key={key9}>
          <rect x={x9} y={yC - ro9} width={w9} height={ro9 - ri9} fill={fill9} stroke="#334155" strokeWidth="0.6" />
          <rect x={x9} y={yC + ri9} width={w9} height={ro9 - ri9} fill={fill9} stroke="#334155" strokeWidth="0.6" />
        </g>;
        const wPkt = pktD * k, xPkt = xB0 + wStk - wPkt;          // pocket opens toward the armature
        const wCoil = Math.min(Math.max((brakeP.brkBobL || pktD * 0.8) * k, 3), wPkt - 1);
        const rSpr = (rBoss + rPkt) / 2;
        const zz = (y9, key9) => {
          const n8 = 3, pts = [];
          for (let j8 = 0; j8 <= n8 * 2; j8++) pts.push(`${xA0 - wPkt * 0.55 + ((wPkt * 0.55 + wArm * 0.4) * j8) / (n8 * 2)},${y9 + (j8 % 2 ? -2 : 2)}`);
          return <polyline key={key9} points={pts.join(" ")} fill="none" stroke="#52525B" strokeWidth="1.1" />;
        };
        return <g>
          {/* backiron rim, boss, and back web */}
          {band(xB0, wStk, rPkt, rOD9, "#94A3B8", "bkRim")}
          {band(xB0, wStk, rThru, rBoss, "#94A3B8", "bkBoss")}
          {band(xB0, wStk - wPkt, rBoss, rPkt, "#94A3B8", "bkWeb")}
          {/* coil seated at the pocket bottom */}
          {band(xPkt + (wPkt - wCoil) / 2, wCoil, rBob, rFlg, "#E8933A", "bkCoil")}
          {/* springs armature ↔ web, at the spring circle */}
          {zz(yC - rSpr, "bkSprT")}
          {zz(yC + rSpr, "bkSprB")}
          {/* armature (annular, clears the hub) */}
          {band(xA0, wArm, rHub + 1, rOD9 * 0.96, "#7C9885", "bkArm")}
          {/* friction disc on its hub: lining bonded both sides (2-face) or bare disc + lining on the armature */}
          {faces ? <g>
            {band(xD0 + wD * 0.28, wD * 0.44, rHub, rRo, "#8A97A8", "bkDisc")}
            {band(xD0, wD * 0.28, rRi, rRo, "#3F3F46", "bkLinA")}
            {band(xD0 + wD * 0.72, wD * 0.28, rRi, rRo, "#3F3F46", "bkLinB")}
          </g> : <g>
            {band(xD0, wD, rHub, rRo, "#8A97A8", "bkDisc")}
            {band(xA0 + wArm - 1.4, 1.4, rRi, rRo, "#3F3F46", "bkLin")}
          </g>}
          <rect key="bkHub" x={xD0 - wArm * 0.4} y={yC - rHub} width={wD + wArm * 0.8} height={2 * rHub} fill="#B5C9A5" stroke="#334155" strokeWidth="0.6" />
          <rect key="bkFrame" x={xB0} y={yC - rOD9} width={Lb * k} height={2 * rOD9} fill="none" stroke="#334155" strokeWidth="1" />
          <text x={X0 + (xb + Lb / 2) * k} y={yC - rOD9 - 22} textAnchor="middle" className="wnum">brake</text>
          <line x1={X0 + (xb + Lb / 2) * k} y1={yC - rOD9 - 18} x2={X0 + (xb + Lb / 2) * k} y2={yC - rOD9 + 2} stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="2 2" />
        </g>;
      })()}
      {/* Ø labels above, lengths below */}
      {odLbl(Lg * 0.5, gOD, `\u00d8${dl(gOD)}`)}
      {odLbl(xm + Lm * 0.5, modOD, `\u00d8${dl(modOD)}`)}
      {hasB && odLbl(xb + Lb * 0.72, bOD, `\u00d8${dl(bOD)}`)}
      {dimSeg(0, Lg, dl(Lg), 0)}
      {dimSeg(xm, Lm, dl(Lm), 0)}
      {hasB && dimSeg(xb, Lb, dl(Lb), 0)}
      {dimSeg(0, Ltot, `overall ${dl(Ltot)}`, 1)}
    </svg>
  );
}

function TorqueSpeedChart({ r, us, ghost, tLimit }) {
  const W = 330, H = 240, mL = 50, mB = 36, mT = 14, mR = 14;
  if (!r.curve.length) return null;
  const gC = ghost && ghost.curve && ghost.curve.length ? ghost.curve : null;
  const tMaxNm = Math.max(...r.curve.map((c) => c.T), r.op ? r.op.T : 0,
    gC ? Math.max(...gC.map((c) => c.T)) : 0, tLimit && Number.isFinite(tLimit.T) ? tLimit.T * 1.04 : 0, 0.1);
  const cu = us === "in"
    ? (tMaxNm * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : { k: 1, u: "N·m" };
  const nMax = Math.max(...r.curve.map((c) => c.n), r.noLoad || 0,
    gC ? Math.max(...gC.map((c) => c.n), ghost.noLoad || 0) : 0, 1) * 1.05;
  const tMax = tMaxNm * cu.k * 1.07;
  const X = (tNm) => mL + ((W - mL - mR) * (tNm * cu.k)) / tMax;
  const Y = (n) => H - mB - ((H - mB - mT) * n) / nMax;
  const path = r.curve.map((c, i) => `${i ? "L" : "M"}${X(c.T).toFixed(1)},${Y(c.n).toFixed(1)}`).join(" ");
  const stall = r.curve[0]; // ω = 0 point: drive-limited stall (PM) or locked-rotor (ACIM)
  const tTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tMax);
  const nTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * nMax);
  return (
    <svg id="svg-curve" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {nTicks.map((n, i) => (
        <g key={"n" + i}>
          <line x1={mL} x2={W - mR} y1={Y(n)} y2={Y(n)} stroke={PAPER_LINE} />
          <text x={mL - 5} y={Y(n) + 3} textAnchor="end" className="tick">{Math.round(n)}</text>
        </g>
      ))}
      {tTicks.map((t, i) => (
        <text key={"t" + i} x={mL + ((W - mL - mR) * t) / tMax} y={H - mB + 13} textAnchor="middle" className="tick">
          {t < 10 ? t.toFixed(1) : Math.round(t)}
        </text>
      ))}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      {tLimit && Number.isFinite(tLimit.T) && tLimit.T * cu.k < tMax && <g>
        <line x1={X(tLimit.T)} y1={mT} x2={X(tLimit.T)} y2={H - mB} stroke="#DC2626" strokeWidth="1.3" strokeDasharray="5 4" opacity="0.85" />
        <text x={X(tLimit.T) - 4} y={mT + 10} textAnchor="end" className="tick" style={{ fill: "#DC2626" }}>{tLimit.label}</text>
      </g>}
      {gC && <path d={gC.map((c, i) => `${i ? "L" : "M"}${X(c.T).toFixed(1)},${Y(c.n).toFixed(1)}`).join(" ")}
        fill="none" stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" opacity="0.8" />}
      <path d={path} fill="none" stroke={COPPER} strokeWidth="2.5" />
      {gC && <g>
        <line x1={W - mR - 96} y1={mT + 6} x2={W - mR - 78} y2={mT + 6} stroke={COPPER} strokeWidth="2.5" />
        <text x={W - mR - 74} y={mT + 9} className="tick">compensated</text>
        <line x1={W - mR - 96} y1={mT + 18} x2={W - mR - 78} y2={mT + 18} stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" />
        <text x={W - mR - 74} y={mT + 21} className="tick">analytical</text>
      </g>}
      {/* winding V/R limit (unclamped) — PM only */}
      {r.TstallW > 0 && (() => {
        const tAxNm = tMax / cu.k;
        const clip = r.TstallW > tAxNm;
        const tEnd = clip ? tAxNm : r.TstallW;
        const nEnd = clip ? r.noLoad * (1 - tAxNm / r.TstallW) : 0;
        return (
          <g opacity="0.45">
            <line x1={X(0)} y1={Y(r.noLoad)} x2={X(tEnd)} y2={Y(nEnd)} stroke={STEEL_DK} strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={X(tEnd) - 4} y={Y(nEnd) - 6} textAnchor="end" className="tick">V/R winding limit →</text>
          </g>
        );
      })()}
      {/* no-load: T = 0 */}
      <g>
        <circle cx={X(0)} cy={Y(r.noLoad)} r="4" fill="#059669" />
        <text x={X(0) + 7} y={Y(r.noLoad) - 6} className="tick" fontWeight="600">no-load {Math.round(r.noLoad)} rpm</text>
      </g>
      {/* stall / locked rotor: n = 0 */}
      <g>
        <circle cx={X(stall.T)} cy={Y(stall.n)} r="4" fill="#DC2626" />
        <text x={X(stall.T) - 7} y={Y(stall.n) - 8} textAnchor="end" className="tick" fontWeight="600">
          stall {(stall.T * cu.k).toFixed(stall.T * cu.k < 10 ? 1 : 0)} {cu.u}
        </text>
      </g>
      {r.op && (
        <g>
          <circle cx={X(r.op.T)} cy={Y(r.op.n)} r="4.5" fill={DKINK} />
          <text x={X(r.op.T) - 7} y={Y(r.op.n) + 14} textAnchor="end" className="tick" fontWeight="600">
            rated {(r.op.T * cu.k).toFixed(r.op.T * cu.k < 10 ? 1 : 0)} {cu.u} @ {Math.round(r.op.n)} rpm
          </text>
        </g>
      )}
      <text x={(W + mL) / 2} y={H - 5} textAnchor="middle" className="axis">torque ({cu.u})</text>
      <text x={13} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 13 ${(H - mB) / 2})`}>speed (rpm)</text>
    </svg>
  );
}


/* ---- sweep plot: several metrics on one canvas, each normalised to its own range
   so shapes can be compared even though the units can't. Invalid designs are drawn
   as a hatched band, because where a design STOPS being buildable is usually the
   most useful feature of the curve. ---- */
const SWEEP_COLS = ["#2563EB", "#B45309", "#059669", "#7C3AED", "#DC2626", "#0891B2"];
function SweepChart({ sw, us, lenKeys }) {
  if (!sw || sw.err || !sw.pts || sw.pts.length < 2) return null;
  const W = 430, H = 250, mL = 44, mB = 42, mT = 16, mR = 96;
  const PW = W - mL - mR, PH = H - mB - mT;
  const isLen = lenKeys && lenKeys.indexOf(sw.key) >= 0;
  const xv = (v) => (isLen && us === "in" ? v / 25.4 : v);
  const X = (v) => mL + (PW * (v - sw.lo)) / Math.max(sw.hi - sw.lo, 1e-9);
  const els = [];
  // invalid regions first, under everything
  let runStart = null;
  for (let i = 0; i <= sw.pts.length; i++) {
    const bad = i < sw.pts.length && !!sw.pts[i].err;
    if (bad && runStart === null) runStart = i;
    if (!bad && runStart !== null) {
      const x0 = X(sw.pts[runStart].v), x1 = X(sw.pts[i - 1].v);
      els.push(<rect key={"bad" + runStart} x={x0} y={mT} width={Math.max(x1 - x0, 1.5)} height={PH}
        fill="#DC2626" opacity="0.10" />);
      runStart = null;
    }
  }
  sw.mets.forEach((mt, mi) => {
    const rg = sw.range[mt.k];
    if (!rg) return;
    const span = Math.max(rg.hi - rg.lo, 1e-12);
    const Y = (y9) => mT + PH - (PH * (y9 - rg.lo)) / span;
    let d = "", pen = false;
    for (const q of sw.pts) {
      const y9 = q.m[mt.k];
      if (q.err || !Number.isFinite(y9)) { pen = false; continue; }
      d += `${pen ? "L" : "M"} ${X(q.v).toFixed(1)} ${Y(y9).toFixed(1)} `;
      pen = true;
    }
    if (d) els.push(<path key={"m" + mt.k} d={d.trim()} fill="none" stroke={SWEEP_COLS[mi % SWEEP_COLS.length]} strokeWidth="1.6" />);
    // legend with the value at the current design point
    const cv = sw.cur.m[mt.k];
    els.push(
      <g key={"lg" + mt.k}>
        <line x1={W - mR + 6} y1={mT + 10 + mi * 26} x2={W - mR + 20} y2={mT + 10 + mi * 26}
          stroke={SWEEP_COLS[mi % SWEEP_COLS.length]} strokeWidth="2" />
        <text x={W - mR + 24} y={mT + 13 + mi * 26} className="dim">{mt.lab}</text>
        <text x={W - mR + 24} y={mT + 23 + mi * 26} className="dim" style={{ opacity: 0.75 }}>
          {`${Number.isFinite(cv) ? (Math.abs(cv) < 1 ? cv.toFixed(4) : cv.toFixed(2)) : "—"} ${mt.unit}`}</text>
      </g>);
  });
  return (
    <svg id="svg-sweep" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {els}
      <line x1={X(sw.cur.v)} y1={mT} x2={X(sw.cur.v)} y2={mT + PH} stroke="#0F172A" strokeWidth="1" strokeDasharray="4 3" />
      <text x={X(sw.cur.v)} y={mT - 4} textAnchor="middle" className="dim">now</text>
      <line x1={mL} y1={mT + PH} x2={W - mR} y2={mT + PH} stroke={AXIS} />
      <line x1={mL} y1={mT} x2={mL} y2={mT + PH} stroke={AXIS} />
      {[0, 0.5, 1].map((f9) => (
        <text key={"x" + f9} x={mL + PW * f9} y={mT + PH + 13} textAnchor="middle" className="tick">
          {xv(sw.lo + (sw.hi - sw.lo) * f9).toFixed(2)}</text>
      ))}
      <text x={mL + PW / 2} y={H - 16} textAnchor="middle" className="axis">
        {`${sw.key}${isLen ? (us === "in" ? " (in)" : " (mm)") : ""}`}</text>
      <text x={mL + PW / 2} y={H - 4} textAnchor="middle" className="dim">
        {`each curve normalised to its own range${sw.nErr ? ` · ${sw.nErr} of ${sw.N} points do not compute (shaded)` : ""}`}</text>
    </svg>
  );
}

/* ---- tornado: which inputs actually move the number you care about ---- */
function TornadoChart({ sn }) {
  if (!sn || sn.err || !sn.rows || !sn.rows.length) return null;
  const rows = sn.rows.slice(0, 12);
  const W = 430, rowH = 20, mT = 30, mL = 96, mR = 20;
  const H = mT + rows.length * rowH + 26;
  const PW = W - mL - mR, cx = mL + PW / 2;
  const span = Math.max(...rows.map((r9) => Math.max(Number.isFinite(r9.pLo) ? Math.abs(r9.pLo) : 0,
    Number.isFinite(r9.pHi) ? Math.abs(r9.pHi) : 0)), 1e-6) * 1.12;
  const X = (pct) => cx + (PW / 2) * (pct / span);
  return (
    <svg id="svg-tornado" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <text x={W / 2} y={12} textAnchor="middle" className="dim">
        {`${sn.metric.lab} response to ±${sn.pct.toFixed(0)}% on each input`}</text>
      <line x1={cx} y1={mT - 6} x2={cx} y2={mT + rows.length * rowH + 2} stroke="#0F172A" strokeWidth="0.9" />
      {rows.map((r9, i9) => {
        const y9 = mT + i9 * rowH + rowH / 2;
        const bars = [];
        if (Number.isFinite(r9.pLo)) bars.push(
          <rect key="lo" x={Math.min(cx, X(r9.pLo))} y={y9 - 6} width={Math.abs(X(r9.pLo) - cx)} height={12}
            fill="#2563EB" opacity="0.8" />);
        if (Number.isFinite(r9.pHi)) bars.push(
          <rect key="hi" x={Math.min(cx, X(r9.pHi))} y={y9 - 6} width={Math.abs(X(r9.pHi) - cx)} height={12}
            fill="#B45309" opacity="0.8" />);
        const bad = r9.errLo || r9.errHi;
        return (
          <g key={r9.key}>
            {bars}
            <text x={mL - 6} y={y9 + 3} textAnchor="end" className="dim">{r9.key}</text>
            <text x={W - 4} y={y9 + 3} textAnchor="end" className="dim" style={{ opacity: 0.8 }}>
              {bad ? "invalid" : `${Number.isFinite(r9.pHi) ? (r9.pHi >= 0 ? "+" : "") + r9.pHi.toFixed(1) : "—"}%`}</text>
          </g>
        );
      })}
      <text x={mL} y={H - 6} className="dim" style={{ fill: "#2563EB" }}>−{sn.pct.toFixed(0)}% input</text>
      <text x={W - mR} y={H - 6} textAnchor="end" className="dim" style={{ fill: "#B45309" }}>+{sn.pct.toFixed(0)}% input</text>
    </svg>
  );
}

/* ---- field plot: flux lines (contours of the vector potential) over |B| shading,
   straight from the solver's own grid. Flux lines ARE iso-A contours in 2-D, so no
   streamline integration is needed — marching squares on the (r,θ) grid, mapped to
   cartesian. Shading is downsampled from the solve mesh to keep the SVG light. ---- */
function bCol(b9, bsat) {
  const f9 = Math.max(0, Math.min(b9 / Math.max(bsat, 0.5), 1.15));
  const stops = [[0, [248, 250, 252]], [0.35, [186, 214, 240]], [0.6, [120, 190, 160]],
    [0.8, [235, 205, 90]], [0.95, [232, 132, 58]], [1.1, [200, 40, 40]]];
  if (f9 <= 0) return `rgb(${stops[0][1].join(",")})`;
  for (let i9 = 1; i9 < stops.length; i9++) {
    if (f9 <= stops[i9][0]) {
      const t9 = (f9 - stops[i9 - 1][0]) / (stops[i9][0] - stops[i9 - 1][0]);
      const c9 = [0, 1, 2].map((k9) => Math.round(stops[i9 - 1][1][k9] + t9 * (stops[i9][1][k9] - stops[i9 - 1][1][k9])));
      return `rgb(${c9.join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

function FieldPlot({ F, p, us, showB, showLines }) {
  if (!F || F.err || !F.msh) return null;
  const msh = F.msh, { nr, nth, rC, rf, dth } = msh;
  const W = 430, H = 430, cx = W / 2, cy = H / 2;
  const k = (Math.min(W, H) / 2 - 16) / msh.rOD;                  // mm -> px
  const PX = (r9, th9) => [cx + r9 * k * Math.cos(th9), cy - r9 * k * Math.sin(th9)];
  const stM = STEELS[p.statorMat] || STEELS["M19 (29 ga)"];
  const bsat = stM.bsat || 2.05;
  const els = [];
  // ---- |B| shading, downsampled (max ~40 x 120 quads keeps the SVG manageable) ----
  if (showB !== false) {
    const si = Math.max(1, Math.ceil(nr / 40)), sj = Math.max(1, Math.ceil(nth / 120));
    for (let i = 0; i < nr; i += si) {
      const i2 = Math.min(i + si, nr);
      const ra = rf[i], rb = rf[i2];
      for (let j = 0; j < nth; j += sj) {
        const j2 = j + sj;
        let acc = 0, n9 = 0;
        for (let ii = i; ii < i2; ii++) for (let jj = j; jj < j2; jj++) { acc += F.B[ii * nth + (jj % nth)]; n9++; }
        const b9 = acc / Math.max(n9, 1);
        const t0 = j * dth, t1 = Math.min(j2, nth) * dth;
        const [x0, y0] = PX(ra, t0), [x1, y1] = PX(rb, t0), [x2, y2] = PX(rb, t1), [x3, y3] = PX(ra, t1);
        els.push(<path key={`b${i}-${j}`} d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${(rb * k).toFixed(1)} ${(rb * k).toFixed(1)} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${(ra * k).toFixed(1)} ${(ra * k).toFixed(1)} 0 0 1 ${x0.toFixed(1)} ${y0.toFixed(1)} Z`}
          fill={bCol(b9, bsat)} stroke="none" shapeRendering="crispEdges" />);
      }
    }
  }
  // ---- flux lines: iso-contours of A by marching squares on the solve grid ----
  if (showLines !== false) {
    let aMin = Infinity, aMax = -Infinity;
    for (let i = 0; i < nr; i++) for (let j = 0; j < nth; j++) {
      const v = F.A[i * nth + j];
      if (v < aMin) aMin = v; if (v > aMax) aMax = v;
    }
    const NL = 26;
    for (let L = 1; L < NL; L++) {
      const lv = aMin + ((aMax - aMin) * L) / NL;
      const segs = [];
      for (let i = 0; i < nr - 1; i++) {
        for (let j = 0; j < nth; j++) {
          const jp = (j + 1) % nth;
          const v = [F.A[i * nth + j], F.A[i * nth + jp], F.A[(i + 1) * nth + jp], F.A[(i + 1) * nth + j]];
          const P = [[rC[i], (j + 0.5) * dth], [rC[i], (jp + 0.5) * dth],
            [rC[i + 1], (jp + 0.5) * dth], [rC[i + 1], (j + 0.5) * dth]];
          const cr = [];
          for (let e = 0; e < 4; e++) {
            const a9 = v[e], b9 = v[(e + 1) % 4];
            if ((a9 - lv) * (b9 - lv) < 0) {
              const f9 = (lv - a9) / (b9 - a9);
              const pa = P[e], pb = P[(e + 1) % 4];
              let dth9 = pb[1] - pa[1];
              if (dth9 > Math.PI) dth9 -= 2 * Math.PI;
              if (dth9 < -Math.PI) dth9 += 2 * Math.PI;
              cr.push(PX(pa[0] + f9 * (pb[0] - pa[0]), pa[1] + f9 * dth9));
            }
          }
          if (cr.length === 2)
            segs.push(`M ${cr[0][0].toFixed(1)} ${cr[0][1].toFixed(1)} L ${cr[1][0].toFixed(1)} ${cr[1][1].toFixed(1)}`);
        }
      }
      if (segs.length) els.push(<path key={`f${L}`} d={segs.join(" ")} fill="none" stroke="#0F172A" strokeWidth="0.7" opacity="0.6" />);
    }
  }
  // ---- geometry outlines so the drawing reads as a machine, not a heatmap ----
  const ring = (r9, sw, col) => <circle key={"r" + r9 + col} cx={cx} cy={cy} r={r9 * k} fill="none" stroke={col} strokeWidth={sw} />;
  els.push(ring(msh.rOD, 1.2, "#334155"));
  els.push(ring(msh.rBore, 0.9, "#334155"));
  els.push(ring(msh.rRot, 0.9, "#334155"));
  els.push(ring(msh.rMagIn, 0.7, "#64748B"));
  els.push(ring(msh.rSh, 0.7, "#64748B"));
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(2) + "″" : mm.toFixed(1) + " mm");
  return (
    <svg id="svg-field" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {els}
      <text x={8} y={14} className="dim">{`|B| shading to ${bsat.toFixed(2)} T sat · ${F.nr}x${F.nth} cells`}</text>
      <text x={W - 8} y={14} textAnchor="end" className="dim">{`gap Ø${dl(2 * msh.rGap)} · peak ${F.gap.Bpk.toFixed(2)} T`}</text>
      <text x={W - 8} y={H - 6} textAnchor="end" className="dim">{F.conv ? "converged" : `residual ${F.resid.toExponential(1)}`}</text>
      <text x={8} y={H - 6} className="dim">flux lines = iso-A contours</text>
    </svg>
  );
}

/* gap-field waveform from the solve, with its fundamental for comparison */
function GapWaveform({ F, us }) {
  if (!F || F.err || !F.gap) return null;
  const W = 430, H = 190, mL = 46, mB = 34, mT = 16, mR = 14;
  const PW = W - mL - mR, PH = H - mB - mT;
  const B = F.gap.Br, n = B.length;
  const bMax = Math.max(...B.map(Math.abs)) * 1.15 || 1;
  const X = (j) => mL + (PW * j) / (n - 1);
  const Y = (b) => mT + PH / 2 - (PH / 2) * (b / bMax);
  const path = Array.from(B, (b, j) => `${j ? "L" : "M"} ${X(j).toFixed(1)} ${Y(b).toFixed(1)}`).join(" ");
  // fundamental reconstructed from its OWN Fourier coefficients — amplitude and phase —
  // so the dashed sine lies on the solved wave instead of being phase-guessed
  const pp = F.msh.poles / 2;
  let fre = 0, fim = 0;
  for (let j = 0; j < n; j++) {
    const th = ((j + 0.5) * 2 * Math.PI) / n;
    fre += B[j] * Math.cos(pp * th); fim += B[j] * Math.sin(pp * th);
  }
  fre *= 2 / n; fim *= 2 / n;
  const fPath = Array.from({ length: n }, (_, j) => {
    const th = ((j + 0.5) * 2 * Math.PI) / n;
    return `${j ? "L" : "M"} ${X(j).toFixed(1)} ${Y(fre * Math.cos(pp * th) + fim * Math.sin(pp * th)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg id="svg-gapwave" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <line x1={mL} y1={mT + PH / 2} x2={W - mR} y2={mT + PH / 2} stroke={AXIS} strokeWidth="0.7" />
      <path d={fPath} fill="none" stroke="#B45309" strokeWidth="1.1" strokeDasharray="5 3" />
      <path d={path} fill="none" stroke="#2563EB" strokeWidth="1.4" />
      <line x1={mL} y1={mT} x2={mL} y2={mT + PH} stroke={AXIS} />
      <text x={mL - 5} y={mT + 6} textAnchor="end" className="tick">{bMax.toFixed(2)}</text>
      <text x={mL - 5} y={mT + PH} textAnchor="end" className="tick">{(-bMax).toFixed(2)}</text>
      <text x={mL + PW / 2} y={H - 5} textAnchor="middle" className="axis">rotor position (one revolution)</text>
      <text x={13} y={mT + PH / 2} textAnchor="middle" transform={`rotate(-90 13 ${mT + PH / 2})`} className="axis">B radial (T)</text>
      <text x={mL + 4} y={H - 19} className="dim" style={{ fill: "#2563EB" }}>solved</text>
      <text x={mL + 48} y={H - 19} className="dim" style={{ fill: "#B45309" }}>{`fundamental ${F.B1.toFixed(3)} T`}</text>
    </svg>
  );
}

/* ---- efficiency map: contoured, from the ENGINE's efficiencyMap() — the same loss
   chain the results column reports. Pre-v60 this view carried its own duplicate
   loss model (with a (n/n0)^1.5 iron-loss guess); it no longer computes physics. ---- */
const EFF_LEVELS = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.88, 0.9, 0.92, 0.94, 0.95, 0.96];
function effCol(e9) {                                     // perceptual-ish ramp, dark = poor
  if (!(e9 > 0)) return "#0F172A";
  const stops = [[0.40, [30, 41, 59]], [0.60, [67, 56, 122]], [0.75, [37, 99, 160]],
    [0.85, [16, 150, 129]], [0.92, [132, 190, 60]], [0.97, [250, 214, 80]]];
  if (e9 <= stops[0][0]) return `rgb(${stops[0][1].join(",")})`;
  for (let i9 = 1; i9 < stops.length; i9++) {
    if (e9 <= stops[i9][0]) {
      const f9 = (e9 - stops[i9 - 1][0]) / (stops[i9][0] - stops[i9 - 1][0]);
      const c9 = [0, 1, 2].map((k9) => Math.round(stops[i9 - 1][1][k9] + f9 * (stops[i9][1][k9] - stops[i9 - 1][1][k9])));
      return `rgb(${c9.join(",")})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(",")})`;
}

function EfficiencyMap({ r, p, us, emap }) {
  const M = emap;
  if (!M) return null;
  const W = 430, H = 300, mL = 52, mB = 42, mT = 16, mR = 66;
  const PW = W - mL - mR, PH = H - mB - mT;
  const X = (n9) => mL + (PW * n9) / M.nMax;
  const Y = (T9) => H - mB - (PH * T9) / M.tMax;
  const cu = us === "in"
    ? (M.tMax * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : { k: 1, u: "N·m" };
  const cells = [];
  const cw = PW / M.NC + 0.6, ch = PH / M.NR + 0.6;
  for (let j9 = 0; j9 < M.NR; j9++) for (let i9 = 0; i9 < M.NC; i9++) {
    // a cell paints only where all four corners sit inside the drive envelope
    if (!(M.inEnv[j9][i9] && M.inEnv[j9 + 1][i9] && M.inEnv[j9][i9 + 1] && M.inEnv[j9 + 1][i9 + 1])) continue;
    const e9 = (M.grid[j9][i9] + M.grid[j9 + 1][i9] + M.grid[j9][i9 + 1] + M.grid[j9 + 1][i9 + 1]) / 4;
    cells.push(<rect key={`c${i9}-${j9}`} x={mL + (PW * i9) / M.NC} y={H - mB - (PH * (j9 + 1)) / M.NR}
      width={cw} height={ch} fill={effCol(e9)} shapeRendering="crispEdges" />);
  }
  // iso-efficiency contours by marching squares over the node grid
  const conts = [];
  for (const lv of EFF_LEVELS) {
    const segs = [];
    for (let j9 = 0; j9 < M.NR; j9++) for (let i9 = 0; i9 < M.NC; i9++) {
      if (!(M.inEnv[j9][i9] && M.inEnv[j9 + 1][i9] && M.inEnv[j9][i9 + 1] && M.inEnv[j9 + 1][i9 + 1])) continue;
      const x0 = mL + (PW * i9) / M.NC, x1 = mL + (PW * (i9 + 1)) / M.NC;
      const y0 = H - mB - (PH * j9) / M.NR, y1 = H - mB - (PH * (j9 + 1)) / M.NR;
      const v = [M.grid[j9][i9], M.grid[j9][i9 + 1], M.grid[j9 + 1][i9 + 1], M.grid[j9 + 1][i9]]; // CCW from bottom-left
      const P = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const cross = [];
      for (let e9 = 0; e9 < 4; e9++) {
        const a9 = v[e9], b9 = v[(e9 + 1) % 4];
        if ((a9 - lv) * (b9 - lv) < 0) {
          const f9 = (lv - a9) / (b9 - a9);
          const pa = P[e9], pb = P[(e9 + 1) % 4];
          cross.push([pa[0] + f9 * (pb[0] - pa[0]), pa[1] + f9 * (pb[1] - pa[1])]);
        }
      }
      if (cross.length === 2) segs.push(`M ${cross[0][0].toFixed(1)} ${cross[0][1].toFixed(1)} L ${cross[1][0].toFixed(1)} ${cross[1][1].toFixed(1)}`);
    }
    if (segs.length) conts.push(<path key={"lv" + lv} d={segs.join(" ")} fill="none"
      stroke="#FFFFFF" strokeWidth={lv === 0.9 || lv === 0.8 ? 1.1 : 0.6} opacity={lv === 0.9 || lv === 0.8 ? 0.85 : 0.5} />);
  }
  const envPath = M.envelope.filter((e9) => e9.T > 0).map((e9, i9) => `${i9 ? "L" : "M"} ${X(e9.n).toFixed(1)} ${Y(e9.T).toFixed(1)}`).join(" ");
  const ridgePath = M.ridge.length > 1 ? M.ridge.map((e9, i9) => `${i9 ? "L" : "M"} ${X(e9.n).toFixed(1)} ${Y(e9.T).toFixed(1)}`).join(" ") : "";
  const legend = [];
  for (let i9 = 0; i9 < 24; i9++) {
    const e9 = 0.4 + (0.58 * i9) / 23;
    legend.push(<rect key={"lg" + i9} x={W - mR + 12} y={H - mB - (PH * (i9 + 1)) / 24} width={12} height={PH / 24 + 0.6} fill={effCol(e9)} shapeRendering="crispEdges" />);
  }
  return (
    <svg id="svg-effmap" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <rect x={mL} y={mT} width={PW} height={PH} fill="#0F172A" opacity="0.06" />
      {cells}
      {conts}
      {envPath && <path d={envPath} fill="none" stroke="#0F172A" strokeWidth="1.4" />}
      {ridgePath && <path d={ridgePath} fill="none" stroke="#FFFFFF" strokeWidth="1.3" strokeDasharray="5 3" opacity="0.9" />}
      {Number.isFinite(M.Tcont) && M.Tcont > 0 && M.Tcont < M.tMax && (
        <g>
          <line x1={mL} y1={Y(M.Tcont)} x2={W - mR} y2={Y(M.Tcont)} stroke="#DC2626" strokeWidth="1.1" strokeDasharray="7 3" />
          <text x={W - mR - 3} y={Y(M.Tcont) - 3} textAnchor="end" className="dim" style={{ fill: "#DC2626" }}>S1 continuous</text>
        </g>
      )}
      {/* markers: labels flip to the left of their dot near the right edge so they
          never run under the legend, and clamp off the top/bottom rails */}
      {M.best && (() => {
        const bx = X(M.best.n), by = Math.min(Math.max(Y(M.best.T), mT + 10), H - mB - 4);
        const flip = bx > mL + PW * 0.62;
        return <g>
          <circle cx={bx} cy={Y(M.best.T)} r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
          <text x={bx + (flip ? -7 : 7)} y={by - 6} textAnchor={flip ? "end" : "start"} className="dim" style={{ fill: "#FFFFFF" }}>
            {`peak ${(M.best.eta * 100).toFixed(1)}%`}</text>
        </g>;
      })()}
      {M.op && M.op.T > 0 && (() => {
        const ox = X(M.op.n), oy = Math.min(Math.max(Y(M.op.T), mT + 14), H - mB - 6);
        const flip = ox > mL + PW * 0.62;
        return <g>
          <circle cx={ox} cy={Y(M.op.T)} r="4" fill="#111827" stroke="#FFFFFF" strokeWidth="1.2" />
          <text x={ox + (flip ? -7 : 7)} y={oy + 11} textAnchor={flip ? "end" : "start"} className="dim">
            {`rated ${(M.op.eta * 100).toFixed(1)}%`}</text>
        </g>;
      })()}
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      {[0, 0.25, 0.5, 0.75, 1].map((f9) => (
        <text key={"x" + f9} x={mL + PW * f9} y={H - mB + 13} textAnchor="middle" className="tick">{Math.round(M.nMax * f9)}</text>
      ))}
      {[0, 0.5, 1].map((f9) => (
        <text key={"y" + f9} x={mL - 5} y={H - mB - PH * f9 + 3} textAnchor="end" className="tick">{(M.tMax * cu.k * f9).toFixed(M.tMax * cu.k < 20 ? 2 : 0)}</text>
      ))}
      <text x={mL + PW / 2} y={H - 6} textAnchor="middle" className="axis">speed (rpm)</text>
      <text x={13} y={mT + PH / 2} textAnchor="middle" transform={`rotate(-90 13 ${mT + PH / 2})`} className="axis">shaft torque ({cu.u})</text>
      {legend}
      <text x={W - mR + 26} y={H - mB - PH - 4} className="tick">98%</text>
      <text x={W - mR + 26} y={H - mB + 3} className="tick">40%</text>
      <text x={W - mR + 12} y={mT - 5} className="dim">η</text>
    </svg>
  );
}

/* ---- drive-cycle result strip: speed/torque trace with per-sample efficiency ---- */
function DriveCycleChart({ dc, us }) {
  if (!dc || dc.err || !dc.trace || dc.trace.length < 2) return null;
  const W = 430, H = 190, mL = 48, mB = 34, mT = 14, mR = 46;
  const PW = W - mL - mR, PH = H - mB - mT;
  const tEnd = dc.trace[dc.trace.length - 1].t || 1;
  const nMax = Math.max(...dc.trace.map((s9) => Math.abs(s9.n)), 1);
  const tqMax = Math.max(...dc.trace.map((s9) => Math.abs(s9.T)), 1e-6);
  const cu = us === "in" ? (tqMax * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" }) : { k: 1, u: "N·m" };
  const X = (t9) => mL + (PW * t9) / tEnd;
  const Yn = (n9) => H - mB - (PH * Math.abs(n9)) / nMax;
  const Yt = (T9) => H - mB - (PH * Math.abs(T9)) / tqMax;
  const pathOf = (fy) => dc.trace.map((s9, i9) => `${i9 ? "L" : "M"} ${X(s9.t).toFixed(1)} ${fy(s9).toFixed(1)}`).join(" ");
  return (
    <svg id="svg-dcycle" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {dc.trace.map((s9, i9) => i9 === 0 ? null : (
        <rect key={"e" + i9} x={X(dc.trace[i9 - 1].t)} y={mT} width={Math.max(X(s9.t) - X(dc.trace[i9 - 1].t), 0.6)} height={PH}
          fill={effCol(s9.eta)} opacity="0.34" shapeRendering="crispEdges" />
      ))}
      <path d={pathOf((s9) => Yn(s9.n))} fill="none" stroke="#2563EB" strokeWidth="1.5" />
      <path d={pathOf((s9) => Yt(s9.T))} fill="none" stroke="#B45309" strokeWidth="1.5" />
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      {[0, 0.5, 1].map((f9) => <text key={"x" + f9} x={mL + PW * f9} y={H - mB + 13} textAnchor="middle" className="tick">{(tEnd * f9).toFixed(0)}</text>)}
      <text x={mL - 5} y={mT + 8} textAnchor="end" className="tick" style={{ fill: "#2563EB" }}>{Math.round(nMax)}</text>
      <text x={W - mR + 4} y={mT + 8} className="tick" style={{ fill: "#B45309" }}>{(tqMax * cu.k).toFixed(1)}</text>
      <text x={mL + PW / 2} y={H - 4} textAnchor="middle" className="axis">cycle time (s)</text>
      <text x={mL} y={mT - 4} className="dim" style={{ fill: "#2563EB" }}>speed (rpm)</text>
      <text x={W - mR + 4} y={H - mB - 2} className="dim" style={{ fill: "#B45309" }}>{cu.u}</text>
      <text x={mL + PW / 2} y={mT - 4} textAnchor="middle" className="dim">band shade = efficiency</text>
    </svg>
  );
}


function CurrentTorqueChart({ r, p, us, ghost, tLimit }) {
  if (!(r.Kt > 0) || (p.motorType !== "pm" && p.motorType !== "brushed")) return null;
  const W = 330, H = 220, mL = 46, mB = 36, mT = 14, mR = 14;
  const gR = ghost && ghost.Kt > 0 ? ghost : null;
  const cuMaxNm = Math.max(r.peakT, r.op ? r.op.T : 0, gR ? gR.peakT : 0, tLimit && Number.isFinite(tLimit.T) ? tLimit.T * 1.04 : 0, 1e-3);
  const cu = us === "in"
    ? (cuMaxNm * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : { k: 1, u: "N·m" };
  const tAxNm = cuMaxNm * 1.18;                       // room to show the faint continuation
  const iMax = Math.max(p.Imax, r.Iph) * 1.18;
  const X = (tNm) => mL + ((W - mL - mR) * tNm) / tAxNm;
  const Y = (i) => H - mB - ((H - mB - mT) * i) / iMax;
  // v60.5: the bend is the ENGINE's own saturation curve (satCurve, gridded in I/Imax) —
  // this chart previously used an ad-hoc quadratic that disagreed with every other screen
  const satAt = (I) => {
    const sc = r.satCurve;
    if (!sc || !sc.length || !(p.Imax > 0)) return 1;
    const f = I / p.Imax;
    if (f <= sc[0].f) return sc[0].k;
    for (let i2 = 1; i2 < sc.length; i2++) {
      if (sc[i2].f >= f) {
        const a2 = sc[i2 - 1], b2 = sc[i2];
        return a2.k + ((f - a2.f) / Math.max(b2.f - a2.f, 1e-12)) * (b2.k - a2.k);
      }
    }
    return sc[sc.length - 1].k;
  };
  const iAt = (tNm) => { let lo = 0, hi = iMax * 1.6; for (let k2 = 0; k2 < 42; k2++) { const m2 = (lo + hi) / 2; if (r.Kt * m2 * satAt(m2) < tNm) lo = m2; else hi = m2; } return (lo + hi) / 2; };
  // v60.6 (Grok): the traces are POLYLINES through the saturation inversion, not chords —
  // a chord between the correct endpoints still put the rated marker off the line
  const pl = (t0, t1, iF) => Array.from({ length: 25 }, (_, k2) => { const t9 = t0 + ((t1 - t0) * k2) / 24; return `${X(t9)},${Y(iF(t9))}`; }).join(" ");
  const iTicks = [0, 0.5, 1].map((f) => f * iMax);
  const tTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tAxNm);
  return (
    <svg id="svg-itcurve" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {iTicks.map((iv, i) => (
        <g key={"i" + i}>
          <line x1={mL} x2={W - mR} y1={Y(iv)} y2={Y(iv)} stroke={PAPER_LINE} />
          <text x={mL - 5} y={Y(iv) + 3} textAnchor="end" className="tick">{iv.toFixed(iv < 10 ? 1 : 0)}</text>
        </g>
      ))}
      {tTicks.map((t, i) => (
        <text key={"t" + i} x={X(t)} y={H - mB + 13} textAnchor="middle" className="tick">
          {(t * cu.k) < 10 ? (t * cu.k).toFixed(1) : Math.round(t * cu.k)}
        </text>
      ))}
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      {/* drive current limit */}
      <g opacity="0.5">
        <line x1={mL} y1={Y(p.Imax)} x2={W - mR} y2={Y(p.Imax)} stroke="#DC2626" strokeWidth="1.3" strokeDasharray="5 4" />
        <text x={W - mR - 3} y={Y(p.Imax) - 5} textAnchor="end" className="tick">drive limit {p.Imax} A</text>
      </g>
      {tLimit && Number.isFinite(tLimit.T) && <g>
        <line x1={X(tLimit.T)} y1={mT} x2={X(tLimit.T)} y2={H - mB} stroke="#DC2626" strokeWidth="1.3" strokeDasharray="5 4" opacity="0.85" />
        <text x={X(tLimit.T) - 4} y={mT + 10} textAnchor="end" className="tick" style={{ fill: "#DC2626" }}>{tLimit.label}</text>
      </g>}
      {/* analytical ghost: same solver on the uncompensated constants — v60.6 (Codex):
          uses the ghost's OWN satCurve through the same interpolation as the main trace
          (the deleted ad-hoc quadratic had survived here) */}
      {gR && (() => {
        const satG = (I) => {
          const sc = gR.satCurve;
          if (!sc || !sc.length || !(p.Imax > 0)) return 1;
          const f = I / p.Imax;
          if (f <= sc[0].f) return sc[0].k;
          for (let i2 = 1; i2 < sc.length; i2++) {
            if (sc[i2].f >= f) {
              const a2 = sc[i2 - 1], b2 = sc[i2];
              return a2.k + ((f - a2.f) / Math.max(b2.f - a2.f, 1e-12)) * (b2.k - a2.k);
            }
          }
          return sc[sc.length - 1].k;
        };
        const iAtG = (tNm) => { let lo = 0, hi = iMax * 1.6; for (let k2 = 0; k2 < 42; k2++) { const m2 = (lo + hi) / 2; if (gR.Kt * m2 * satG(m2) < tNm) lo = m2; else hi = m2; } return (lo + hi) / 2; };
        return <g>
          <polyline points={pl(0, gR.peakT, iAtG)} fill="none" stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" opacity="0.8" />
          <line x1={W - mR - 96} y1={mT + 6} x2={W - mR - 78} y2={mT + 6} stroke={COPPER} strokeWidth="2.5" />
          <text x={W - mR - 74} y={mT + 9} className="tick">compensated</text>
          <line x1={W - mR - 96} y1={mT + 18} x2={W - mR - 78} y2={mT + 18} stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" />
          <text x={W - mR - 74} y={mT + 21} className="tick">analytical</text>
        </g>;
      })()}
      {/* I = T / Kt: solid to the drive-limited stall, faint beyond */}
      <polyline points={pl(0, r.peakT, iAt)} fill="none" stroke={COPPER} strokeWidth="2.5" />
      <polyline points={pl(r.peakT, Math.min(tAxNm, r.TstallW || tAxNm), iAt)} fill="none"
        stroke={STEEL_DK} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.45" />
      {r.op && (
        <g>
          <circle cx={X(r.op.T)} cy={Y(iAt(r.op.T))} r="4.5" fill={DKINK} />
          <text x={X(r.op.T) + 7} y={Y(iAt(r.op.T)) + 2} className="tick" fontWeight="600">
            rated {r.Iph.toFixed(1)} A @ {(r.op.T * cu.k).toFixed(r.op.T * cu.k < 10 ? 1 : 0)} {cu.u}
          </text>
        </g>
      )}
      <circle cx={X(r.peakT)} cy={Y(iAt(r.peakT))} r="4" fill="#DC2626" />
      <text x={(W + mL) / 2} y={H - 5} textAnchor="middle" className="axis">torque ({cu.u})</text>
      <text x={11} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 11 ${(H - mB) / 2})`}>phase current (A rms)</text>
    </svg>
  );
}

function BemfScope({ r, view }) {
  if (!r.bemf) return null;
  const dat = view === "ph" ? r.bemf.ph : r.bemf.ll;
  const labels = view === "ph" ? ["A-N", "B-N", "C-N"] : ["A-B", "B-C", "C-A"];
  const W = 340, H = 240, mL = 40, mB = 26, mT = 10, mR = 10;
  const all = dat.tr.flat();
  const vMax = Math.max(...all.map(Math.abs), 0.1) * 1.12;
  const N = dat.tr[0].length;
  const X = (i) => mL + ((W - mL - mR) * i) / (N - 1);
  const Y = (v) => (mT + (H - mB - mT) / 2) - (v / vMax) * ((H - mB - mT) / 2);
  const trace = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const gridV = [-1, -0.5, 0, 0.5, 1].map((f) => f * vMax);
  return (
    <svg id="svg-bemf" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <rect x={mL} y={mT} width={W - mL - mR} height={H - mB - mT} fill="#0B1220" stroke="#1E293B" />
      {gridV.map((v, i) => (
        <g key={"g" + i}>
          <line x1={mL} x2={W - mR} y1={Y(v)} y2={Y(v)} stroke="#1E293B" strokeWidth={v === 0 ? 1.4 : 0.7} />
          <text x={mL - 4} y={Y(v) + 3} textAnchor="end" className="tick">{Math.round(v)}</text>
        </g>
      ))}
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={"x" + i} x1={mL + (W - mL - mR) * f} x2={mL + (W - mL - mR) * f} y1={mT} y2={H - mB} stroke="#1E293B" strokeWidth="0.7" />
      ))}
      <path d={trace(dat.tr[0])} fill="none" stroke="#F59E0B" strokeWidth="1.8" />
      <path d={trace(dat.tr[1])} fill="none" stroke="#34D399" strokeWidth="1.8" />
      <path d={trace(dat.tr[2])} fill="none" stroke="#60A5FA" strokeWidth="1.8" />
      <text x={mL + 6} y={mT + 12} className="tick" fill="#F59E0B">{labels[0]}</text>
      <text x={mL + 32} y={mT + 12} className="tick" fill="#34D399">{labels[1]}</text>
      <text x={mL + 58} y={mT + 12} className="tick" fill="#60A5FA">{labels[2]}</text>
      <text x={(W + mL) / 2} y={H - 6} textAnchor="middle" className="axis">2 electrical cycles</text>
      <text x={11} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 11 ${(H - mB) / 2})`}>{view === "ph" ? "V (line-neutral)" : "V (line-line)"}</text>
    </svg>
  );
}

function CogScope({ r, us }) {
  if (!r.cog) return null;
  const W = 340, H = 220, mL = 46, mB = 28, mT = 10, mR = 10;
  const cu = us === "in"
    ? (r.cog.Tpk * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : (r.cog.Tpk < 0.5 ? { k: 1000, u: "mN·m" } : { k: 1, u: "N·m" });
  const vMax = Math.max(r.cog.Tpk * cu.k, 1e-6) * 1.15;
  const N = r.cog.tArr.length;
  const X = (i) => mL + ((W - mL - mR) * i) / (N - 1);
  const Y = (v) => (mT + (H - mB - mT) / 2) - ((v * cu.k) / vMax) * ((H - mB - mT) / 2);
  const path = r.cog.tArr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const dMax = r.cog.thArr[N - 1];
  return (
    <svg id="svg-cog" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      <rect x={mL} y={mT} width={W - mL - mR} height={H - mB - mT} fill="#0B1220" stroke="#1E293B" />
      {[-1, -0.5, 0, 0.5, 1].map((f, i) => (
        <g key={"g" + i}>
          <line x1={mL} x2={W - mR} y1={Y(f * vMax / cu.k)} y2={Y(f * vMax / cu.k)} stroke="#1E293B" strokeWidth={f === 0 ? 1.4 : 0.7} />
          <text x={mL - 4} y={Y(f * vMax / cu.k) + 3} textAnchor="end" className="tick">{(f * vMax).toFixed(vMax < 0.5 ? 3 : vMax < 5 ? 2 : vMax < 20 ? 1 : 0)}</text>
        </g>
      ))}
      {[0.25, 0.5, 0.75].map((f, i) => (
        <line key={"x" + i} x1={mL + (W - mL - mR) * f} x2={mL + (W - mL - mR) * f} y1={mT} y2={H - mB} stroke="#1E293B" strokeWidth="0.7" />
      ))}
      {[0, 0.5, 1].map((f, i) => (
        <text key={"d" + i} x={mL + (W - mL - mR) * f} y={H - mB + 12} textAnchor="middle" className="tick">{(f * dMax).toFixed(1)}°</text>
      ))}
      <path d={path} fill="none" stroke="#F472B6" strokeWidth="1.8" />
      <text x={(W + mL) / 2} y={H - 4} textAnchor="middle" className="axis">mechanical rotation (deg)</text>
      <text x={11} y={(H - mB) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 11 ${(H - mB) / 2})`}>cogging torque ({cu.u})</text>
    </svg>
  );
}

/* Brushed armature slot sector: slots open OUTWARD toward the housing-mounted magnet ring above.
   Same window convention as SlotDetail — motor center below the canvas, ±1.5 slot pitches. */
function BrushedSlotDetail({ p, r, us }) {
  const L = (mm, d = 3) => (us === "in" ? (mm / INCH).toFixed(d) : mm.toFixed(2));
  if (!(r.hs > 0) || !(r.w1 > 0.2) || !(r.w2 > 0.2))
    return <div className="warn errb">Armature slot geometry invalid — no room between the armature surface, core and shaft. Reduce core depth/tooth-tip or grow the armature OD.</div>;
  const W = 360, H = 290, Ns = r.Ns;
  const r0 = p.rotorOD / 2, r1 = r0 - p.tipH, r2 = r1 - r.hs;          // armature surface / tip bottom / slot bottom
  const rMi = p.statorID / 2, rMo = rMi + p.magT, rHo = p.statorOD / 2; // magnet ID / magnet OD / housing OD
  const rc = r.rcFil || 0, pitch = (2 * Math.PI) / Ns;
  const hwSurf = (Math.PI / Ns) - p.toothW / 2 / (p.rotorOD / 2);      // slot angular half-width at the surface
  const dAng = Math.min(1.5 * pitch, 1.0);                             // clamp: sector projection breaks past ~±57°
  const slotsShown = pitch + hwSurf < dAng ? [-pitch, 0, pitch] : [0]; // neighbors only if they fit the window
  const rIn = Math.max(r2 - Math.min(5, r2 * 0.3), p.shaftD / 2, 1);
  const k = Math.min((W - 84) / (2 * rHo * Math.sin(dAng)), (H - 66) / (rHo - rIn * Math.cos(dAng)));
  const Cx = W / 2, Cy = 26 + rHo * k;
  const P = (rad, a) => `${(Cx + rad * k * Math.sin(a)).toFixed(2)} ${(Cy - rad * k * Math.cos(a)).toFixed(2)}`;
  const arc = (rad, a0, a1) => `A ${(rad * k).toFixed(2)} ${(rad * k).toFixed(2)} 0 0 ${a1 > a0 ? 1 : 0} ${P(rad, a1)}`;
  const hwA = (y) => (Math.PI / Ns) - p.toothW / 2 / y;
  const soA = (y) => p.slotOpen / 2 / y;

  // copper region: wide at the tip shelf (r1, top), narrow with fillets at the slot bottom (r2)
  const slotPath = (sA) => {
    const h1 = hwA(r1), h2 = hwA(r2);
    if (rc * k < 1.5)
      return `M ${P(r1, sA - h1)} ${arc(r1, sA - h1, sA + h1)} L ${P(r2, sA + h2)} ${arc(r2, sA + h2, sA - h2)} Z`;
    const rcA2 = rc / r2, hMid = hwA(r2 + rc);
    return `M ${P(r1, sA - h1)} ${arc(r1, sA - h1, sA + h1)} L ${P(r2 + rc, sA + hMid)} ` +
      `Q ${P(r2, sA + h2)} ${P(r2, sA + h2 - rcA2)} ${arc(r2, sA + h2 - rcA2, sA - h2 + rcA2)} ` +
      `Q ${P(r2, sA - h2)} ${P(r2 + rc, sA - hMid)} Z`;
  };
  const notchPath = (sA) => {
    const a0 = soA(r0), a1 = soA(r1);
    return `M ${P(r1, sA - a1)} ${arc(r1, sA - a1, sA + a1)} L ${P(r0, sA + a0)} ${arc(r0, sA + a0, sA - a0)} Z`;
  };
  // wire strands packed from the slot bottom upward
  const strands = [];
  let drawn = 0;
  const canDraw = r.condPerSlot > 0 && r.condPerSlot <= 400 && r.dIns * k > 0.9;
  if (canDraw) {
    const rw = r.dIns, pos = [];
    let y = r2 + p.liner + rw / 2 + (rc > 0 ? rc * 0.3 : 0), row = 0;
    while (y < r1 - p.liner - rw / 2 && pos.length < r.condPerSlot) {
      const half = (hwA(y) * y) - p.liner - rw / 2;
      const nfit = Math.max(0, Math.floor((2 * half) / rw));
      const off = row % 2 ? rw / 2 : 0;
      for (let c = 0; c < nfit && pos.length < r.condPerSlot; c++) {
        const x = -half + rw / 2 + c * rw + off;
        if (x <= half) pos.push([x, y]);
      }
      y += rw * 0.87; row++;
    }
    drawn = pos.length;
    slotsShown.forEach((sA, si) => {
      pos.forEach(([x, yy], i2) => {
        const a = sA + x / yy;
        strands.push(<circle key={si + "-" + i2} cx={Cx + yy * k * Math.sin(a)} cy={Cy - yy * k * Math.cos(a)}
          r={(r.dIns * k) / 2 - 0.3} fill="#E3B341" stroke="#94701C" strokeWidth="0.7" />);
      });
    });
  }
  // magnet segments + housing above the airgap
  const mags = [];
  const arcHalf = ((p.poleArc / 100) * Math.PI) / r.poles;
  for (let m = -r.poles; m <= r.poles; m++) {
    const c = (2 * Math.PI * m) / r.poles;
    const a0 = Math.max(c - arcHalf, -dAng), a1 = Math.min(c + arcHalf, dAng);
    if (a1 <= a0) continue;
    mags.push(<path key={"m" + m}
      d={`M ${P(rMo, a0)} ${arc(rMo, a0, a1)} L ${P(rMi, a1)} ${arc(rMi, a1, a0)} Z`}
      fill={((m % 2) + 2) % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.8" />);
  }
  const dimA = dAng * 0.88;
  return (
    <svg id="svg-slot" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="slotSvg">
      <style>{SVGCSS}</style>
      {/* housing can + magnet ring */}
      <path d={`M ${P(rHo, -dAng)} ${arc(rHo, -dAng, dAng)} L ${P(rMo, dAng)} ${arc(rMo, dAng, -dAng)} Z`}
        fill={STEEL} stroke={INK} strokeWidth="1" />
      {mags}
      {/* armature sector */}
      <path d={`M ${P(r0, -dAng)} ${arc(r0, -dAng, dAng)} L ${P(rIn, dAng)} ${arc(rIn, dAng, -dAng)} Z`}
        fill={STEEL_DK} stroke={INK} strokeWidth="1" />
      <path d={`M ${P(r2, -dAng)} ${arc(r2, -dAng, dAng)}`} fill="none" stroke={INK} strokeWidth="0.6" opacity="0.35" />
      {slotsShown.map((sA) => <path key={"s" + sA} d={slotPath(sA)} fill="#F1E8D8" stroke={INK} strokeWidth="1" />)}
      {slotsShown.map((sA) => <path key={"o" + sA} d={notchPath(sA)} fill={BG} stroke={INK} strokeWidth="0.8" />)}
      {strands}
      {/* dimensions */}
      <line x1={Cx + rMo * k * Math.sin(dimA)} y1={Cy - rMo * k * Math.cos(dimA)}
        x2={Cx + rHo * k * Math.sin(dimA)} y2={Cy - rHo * k * Math.cos(dimA)} stroke={AXIS} strokeWidth="1.2" />
      <text x={Cx + (rHo + 2) * k * Math.sin(dimA) + 4} y={Cy - ((rMo + rHo) / 2) * k * Math.cos(dimA)} className="dim">can {L((rHo - rMo))}</text>
      <line x1={Cx + rMi * k * Math.sin(dimA)} y1={Cy - rMi * k * Math.cos(dimA)}
        x2={Cx + rMo * k * Math.sin(dimA)} y2={Cy - rMo * k * Math.cos(dimA)} stroke={AXIS} strokeWidth="1.2" />
      <text x={Cx + (rMo + 4) * k * Math.sin(dimA) + 4} y={Cy - ((rMi + rMo) / 2) * k * Math.cos(dimA) + 10} className="dim">mag {L(p.magT)}</text>
      <line x1={Cx + r2 * k * Math.sin(-dimA)} y1={Cy - r2 * k * Math.cos(-dimA)}
        x2={Cx + r1 * k * Math.sin(-dimA)} y2={Cy - r1 * k * Math.cos(-dimA)} stroke={AXIS} strokeWidth="1.2" />
      <text x={Cx + (r1 + 2) * k * Math.sin(-dimA) - 4} y={Cy - ((r1 + r2) / 2) * k * Math.cos(-dimA)} textAnchor="end" className="dim">{L(r.hs)}</text>
      <text x={Cx + ((r1 + r2) / 2) * k * Math.sin(pitch / 2)} y={Cy - ((r1 + r2) / 2) * k * Math.cos(pitch / 2) + 3}
        textAnchor="middle" className="dim" transform={`rotate(${(pitch / 2) * 57.3} ${Cx + ((r1 + r2) / 2) * k * Math.sin(pitch / 2)} ${Cy - ((r1 + r2) / 2) * k * Math.cos(pitch / 2)})`}>
        {L(p.toothW)}</text>
      <text x={Cx} y={Cy - r0 * k + 14} textAnchor="middle" className="dim">open {L(p.slotOpen)}</text>
      <text x={Cx + rMi * k * Math.sin(-dimA) - 6} y={Cy - ((r0 + rMi) / 2) * k * Math.cos(-dimA) + 2} textAnchor="end" className="dim">gap {L(r.airgap)}</text>
      {rc > 0.05 && <text x={Cx} y={Cy - (r2 + rc) * k - 3} textAnchor="middle" className="dim">R {L(rc)}</text>}
      <text x={10} y={14} className="wnum">armature sector · {r.condPerSlot} conductors/slot
        {!canDraw ? " (strands not drawn at this scale)" : drawn < r.condPerSlot ? ` · only ${drawn} fit — slot overfull` : ""}</text>
      <text x={Cx} y={H - 8} textAnchor="middle" className="wnum">field magnets on housing ID · N (red) / S (blue) · armature core below</text>
    </svg>
  );
}

/* ---------- Cut Inspection (v61) ---------- */
/* True-scale conductor cut, productized from the P7 rendering-challenge winner. EVERY
   quantity is read from computeDesign's outputs (topLayer/botLayer, span, dIns/dBare,
   w1/w2/hs, fill, Bt/By vs the steel ceiling) — nothing is re-derived, so this view can
   never disagree with the results column. Each COIL gets its own shade of its phase's
   hue, and both of a coil's sides (in-slot + return slot, `span` apart) share that
   shade, so the winding throw reads directly off the cut; the legend table beside the
   drawing lists every coil with its slots. */
function CutInspection({ p, r, us }) {
  const [phSel, setPhSel] = React.useState(-1);            // -1 = all phases
  if (p.motorType !== "pm" || !r.topLayer || !r.topLayer.length || r.err.length) return null;
  const S = 620, cx = 310, cy = 310;
  const k = (S * 0.47) / (p.statorOD / 2);                 // px per mm
  const mm = (v) => v * k;
  const rOD = mm(p.statorOD / 2), rBore = mm(p.statorID / 2);
  const rTip = rBore + mm(p.tipH), rSlotTop = rTip + mm(Math.max(r.hs, 0));
  const rRot = mm(p.rotorOD / 2), rMagIn = rRot - mm(p.magT), rSh = Math.max(mm(p.shaftD / 2), 4);
  const Ns = r.Ns, poles = r.poles, two = r.layers === 2;
  const aOf = (i) => (i / Ns) * 2 * Math.PI - Math.PI / 2;
  // ---- per-coil identity & shade: coil i enters slot i (airgap-side layer) and returns
  // in slot (i+span)%Ns (outer layer). Shades ramp light→dark around each phase.
  const PH_HUE = [33, 217, 152];
  const phCount = [0, 0, 0];
  const coils = r.topLayer.map((t9, i9) => {
    const ci = phCount[t9.phase]++;
    return { i: i9, phase: t9.phase, sign: t9.sign, inS: i9, outS: (i9 + r.span) % Ns, ci };
  });
  const shade = (c9) => `hsl(${PH_HUE[c9.phase]} ${72 - (c9.ci % 2) * 14}% ${40 + (28 * c9.ci) / Math.max(phCount[c9.phase] - 1, 1)}%)`;
  const coilOfBottom = (j9) => coils[(j9 - r.span + Ns * 64) % Ns];
  // ---- steel status tint (in-place saturation flag) ----
  const btBad = r.Bt > r.stM.Bmax, btWarm = r.Bt > 0.88 * r.stM.Bmax;
  const steelC = btBad ? "#DEA3A3" : btWarm ? "#CBB597" : "#AAB4C0";
  // ---- slot punch polygons + conductor packing ----
  const dIns = r.dIns, dBare = r.dBare, liner = Math.max(p.liner, 0);
  const perSide = Math.max(Math.round(p.turns), 1) * Math.max(Math.round(p.strands), 1);
  const slotEls = [], wireEls = [];
  let overflowTot = 0;
  const wAt = (rr) => r.w1 + ((r.w2 - r.w1) * (rr - p.statorID / 2 - p.tipH)) / Math.max(r.hs, 1e-6); // mm, at radius rr (mm)
  for (let i9 = 0; i9 < Ns; i9++) {
    const a0 = aOf(i9);
    const P9 = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`;
    const hw1 = mm(r.w1 / 2) / rTip, hw2 = mm(r.w2 / 2) / rSlotTop, hwo = Math.max(mm(p.slotOpen / 2), 0.6) / rBore;
    slotEls.push(
      <g key={"s" + i9}>
        <polygon points={`${P9(rTip, a0 - hw1)} ${P9(rTip, a0 + hw1)} ${P9(rSlotTop, a0 + hw2)} ${P9(rSlotTop, a0 - hw2)}`} fill="#F1F5F9" stroke="#8492A0" strokeWidth="0.7" />
        <polygon points={`${P9(rBore, a0 - hwo)} ${P9(rBore, a0 + hwo)} ${P9(rTip, a0 + hwo * 0.7)} ${P9(rTip, a0 - hwo * 0.7)}`} fill="#F1F5F9" stroke="#8492A0" strokeWidth="0.5" />
        <text x={cx + ((rSlotTop + rOD) / 2) * Math.cos(a0)} y={cy + ((rSlotTop + rOD) / 2) * Math.sin(a0) + 2.5} textAnchor="middle" className="wnum" style={{ fill: "#334155" }}>{i9 + 1}</text>
      </g>
    );
    // pack each layer's conductors: hex rows walking outward through the layer's radial band
    const bands = two
      ? [[p.statorID / 2 + p.tipH, p.statorID / 2 + p.tipH + r.hs / 2, r.topLayer[i9], coils[i9]],
         [p.statorID / 2 + p.tipH + r.hs / 2, p.statorID / 2 + p.tipH + r.hs, r.botLayer[i9], coilOfBottom(i9)]]
      : [[p.statorID / 2 + p.tipH, p.statorID / 2 + p.tipH + r.hs, r.topLayer[i9], coils[i9]]];
    for (const [rInB, rOutB, lay, coil] of bands) {
      if (!lay || !coil) continue;
      const col = shade(coil);
      const dimmed = phSel >= 0 && lay.phase !== phSel;
      let placed = 0, row = 0;
      let rr = rInB + liner + dIns / 2;
      while (placed < perSide && rr <= rOutB - dIns / 2 + 1e-9) {
        // hex lay: the 0.866·Ø row pitch is only tangent when alternate rows sit at a
        // HALF-PITCH offset. Odd rows take one fewer conductor and stay centered — a
        // centered n and a centered n−1 array at the same pitch are automatically half a
        // pitch apart, so every circle is exactly tangent (the first cut re-centered
        // equal-count rows and drew 13%-overlapped copper). Slots too narrow for two
        // abreast degenerate to a single-file column at FULL-diameter pitch — staggering
        // a one-wide column just deletes every other row.
        const wRow0 = wAt(rr) - 2 * liner;
        const nEven = Math.max(Math.floor((wRow0 - dIns) / dIns) + 1, 0);
        const single = nEven <= 1;
        const nRow = single ? nEven : row % 2 === 1 ? nEven - 1 : nEven;
        for (let c9 = 0; c9 < nRow && placed < perSide; c9++) {
          const xoff = (c9 - (nRow - 1) / 2) * dIns;
          if (Math.abs(xoff) > wRow0 / 2 - dIns / 2 + 1e-9) continue;
          const ang = a0 + Math.atan2(xoff, rr);
          const rp = mm(rr);
          wireEls.push(
            <g key={`w${i9}-${coil.i}-${placed}`} opacity={dimmed ? 0.1 : 1}>
              <circle cx={cx + rp * Math.cos(ang)} cy={cy + rp * Math.sin(ang)} r={Math.max(mm(dIns / 2), 0.8)} fill={col} stroke="#1E293B" strokeWidth="0.35">
                <title>{`slot ${i9 + 1} · coil ${PHASE[coil.phase].name}${coil.ci + 1}${lay.sign > 0 ? "+" : "−"} · wire ${placed + 1}/${perSide} · Ø${dBare.toFixed(3)}/${dIns.toFixed(3)} mm`}</title>
              </circle>
              {mm(dBare / 2) > 1.6 && <circle cx={cx + rp * Math.cos(ang)} cy={cy + rp * Math.sin(ang)} r={mm(dBare / 2) * 0.82} fill="none" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.5" />}
            </g>
          );
          placed++;
        }
        row++; rr += dIns * (single ? 1 : 0.866);   // single-file column: full-Ø pitch
      }
      if (placed < perSide) {
        overflowTot += perSide - placed;
        const angF = a0, rpF = mm(rOutB) - 4;
        wireEls.push(<circle key={`of${i9}-${coil.i}`} cx={cx + rpF * Math.cos(angF)} cy={cy + rpF * Math.sin(angF)} r="4" fill="#DC2626">
          <title>{`slot ${i9 + 1}: ${perSide - placed} of ${perSide} conductors do not pack in this layer at Ø${dIns.toFixed(3)} mm`}</title></circle>);
      }
    }
  }
  // ---- rotor: hub, magnets, N/S labels ----
  const magEls = [];
  const polePitch = (2 * Math.PI) / poles, arcHalf = ((p.poleArc / 100) * polePitch) / 2;
  for (let m9 = 0; m9 < poles; m9++) {
    const ac = m9 * polePitch - Math.PI / 2 + polePitch / 2;
    const a1 = ac - arcHalf, a2 = ac + arcHalf;
    const north = m9 % 2 === 0;
    const path = `M ${cx + rMagIn * Math.cos(a1)} ${cy + rMagIn * Math.sin(a1)} A ${rMagIn} ${rMagIn} 0 0 1 ${cx + rMagIn * Math.cos(a2)} ${cy + rMagIn * Math.sin(a2)} L ${cx + rRot * Math.cos(a2)} ${cy + rRot * Math.sin(a2)} A ${rRot} ${rRot} 0 0 0 ${cx + rRot * Math.cos(a1)} ${cy + rRot * Math.sin(a1)} Z`;
    magEls.push(<path key={"m" + m9} d={path} fill={north ? "#C9564A" : "#4A76B8"} stroke="#334155" strokeWidth="0.6" />);
    if (m9 < 2) magEls.push(<text key={"ml" + m9} x={cx + ((rMagIn + rRot) / 2) * Math.cos(ac)} y={cy + ((rMagIn + rRot) / 2) * Math.sin(ac) + 2.5} textAnchor="middle" style={{ font: "600 8px monospace", fill: "#fff" }}>{north ? "N" : "S"}</text>);
  }
  const L9 = (v, d) => (us === "in" ? (v / 25.4).toFixed(d === undefined ? 3 : d) + '"' : v.toFixed(2) + " mm");
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <svg id="svg-cutinspect" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${S} ${S}`} style={{ flex: "1 1 380px", minWidth: 320 }}>
        <style>{SVGCSS}</style>
        {/* stator steel with in-place saturation tint */}
        <circle cx={cx} cy={cy} r={rOD} fill={steelC} stroke="#334155" strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r={rBore} fill="#FFFFFF" />
        {slotEls}
        {/* airgap: true scale, dashed mid-gap circle */}
        <circle cx={cx} cy={cy} r={(rRot + rBore) / 2} fill="none" stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="3 3" />
        {/* rotor */}
        <circle cx={cx} cy={cy} r={rMagIn} fill="#8A94A2" stroke="#334155" strokeWidth="0.8" />
        {magEls}
        <circle cx={cx} cy={cy} r={rSh} fill="#5B6572" stroke="#334155" strokeWidth="0.8" />
        {wireEls}
        <text x={8} y={S - 10} className="dim">airgap {L9(r.airgap)} · bore Ø{L9(p.statorID, 2)} · OD Ø{L9(p.statorOD, 2)}{btBad ? " · TEETH PAST " + r.stM.Bmax + " T" : btWarm ? " · teeth near limit" : ""}</text>
      </svg>
      <div style={{ flex: "0 1 250px", minWidth: 220 }}>
        <div className="iobar" style={{ marginBottom: 6 }}>
          {[-1, 0, 1, 2].map((v9) => (
            <button key={v9} className={"btn mini" + (phSel === v9 ? "" : " ghost")} onClick={() => setPhSel(v9)}>
              {v9 < 0 ? "All" : "Phase " + PHASE[v9].name}</button>
          ))}
        </div>
        <div className="kv"><span>Fill (insulated / gross slot)</span><b>{(r.fillGross * 100).toFixed(1)}%</b></div>
        <div className="kv"><span>Fill (bare Cu / gross slot)</span><b>{(r.fillCu * 100).toFixed(1)}%</b></div>
        <div className="kv"><span>Conductors per slot{two ? " (2 coil sides)" : ""}</span><b>{perSide * (two ? 2 : 1)}</b></div>
        <div className="kv"><span>Wire Ø bare / insulated</span><b>{r.dBare.toFixed(3)} / {r.dIns.toFixed(3)} mm</b></div>
        {overflowTot > 0
          ? <div className="warn">{overflowTot} conductors do not pack at true scale (red dots) — the fill number admits what the drawing shows.</div>
          : <div className="kv"><span>Pack check (hex lay, true Ø)</span><b style={{ color: "#059669" }}>all conductors placed</b></div>}
        <div className="tbl" style={{ marginTop: 8, maxHeight: 330, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead><tr>
              {["", "Coil", "In", "Out", "Sense"].map((h9, hi) => <th key={hi} style={{ textAlign: "left", padding: "2px 6px", borderBottom: "1px solid #CBD5E1", position: "sticky", top: 0, background: "#fff" }}>{h9}</th>)}
            </tr></thead>
            <tbody>
              {coils.map((c9) => (
                <tr key={c9.i} style={{ opacity: phSel >= 0 && c9.phase !== phSel ? 0.3 : 1 }}>
                  <td style={{ padding: "1px 6px" }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: shade(c9), border: "1px solid #334155" }} /></td>
                  <td style={{ padding: "1px 6px", fontFamily: "monospace" }}>{PHASE[c9.phase].name}{c9.ci + 1}</td>
                  <td style={{ padding: "1px 6px" }}>{c9.inS + 1}</td>
                  <td style={{ padding: "1px 6px" }}>{c9.outS + 1}</td>
                  <td style={{ padding: "1px 6px" }}>{c9.sign > 0 ? "+" : "−"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note" style={{ marginTop: 6 }}>
          Each coil keeps ONE shade across both of its slots (throw {r.span}) — matching
          colors are the same physical coil. Hover any wire for its identity. Steel tint
          flags tooth flux vs the {r.stM.Bmax} T ceiling in place.
        </div>
      </div>
    </div>
  );
}

function SlotDetail({ p, r, us }) {
  if (p.motorType === "brushed") return <BrushedSlotDetail p={p} r={r} us={us} />;
  const L = (mm, d = 3) => (us === "in" ? (mm / INCH).toFixed(d) : mm.toFixed(2));
  if (!(r.hs > 0) || !(r.w1 > 0.2))
    return <div className="warn errb">Slot geometry invalid — no room between bore, yoke and tooth tips. Reduce yoke/tooth or grow the OD.</div>;
  const W = 360, H = 290, Ns = r.Ns;
  const r0 = p.statorID / 2, r1 = r0 + p.tipH, r2 = r1 + r.hs, r3 = r2 + p.yoke, rRt = p.rotorOD / 2;
  const rc = r.rcFil || 0, pitch = (2 * Math.PI) / Ns;
  const dAng = 1.5 * pitch;                                   // ±1.5 slot pitches: center slot + neighbors
  const magT9 = p.motorType === "pm" ? Math.max(p.magT || 0, 0) : 0;   // induction rotor has no magnet band
  const rIn = Math.max(rRt - magT9 - Math.min(5, rRt * 0.3), 1);
  const k = Math.min((W - 84) / (2 * r3 * Math.sin(dAng)), (H - 66) / (r3 - rIn * Math.cos(dAng)));
  const Cx = W / 2, Cy = 26 + r3 * k;                          // motor center below the canvas
  const P = (rad, a) => `${(Cx + rad * k * Math.sin(a)).toFixed(2)} ${(Cy - rad * k * Math.cos(a)).toFixed(2)}`;
  const arc = (rad, a0, a1) => `A ${(rad * k).toFixed(2)} ${(rad * k).toFixed(2)} 0 0 ${a1 > a0 ? 1 : 0} ${P(rad, a1)}`;
  const hwA = (y) => (Math.PI / Ns) - p.toothW / 2 / y;        // slot angular half-width at radius y
  const soA = (y) => p.slotOpen / 2 / y;                       // opening angular half-width

  // one slot's copper region (tip shelf → walls → filleted yoke-side corners)
  const slotPath = (sA) => {
    const h1 = hwA(r1), h2 = hwA(r2);
    if (rc * k < 1.5)
      return `M ${P(r1, sA - h1)} ${arc(r1, sA - h1, sA + h1)} L ${P(r2, sA + h2)} ${arc(r2, sA + h2, sA - h2)} Z`;
    const rcA2 = rc / r2, hMid = hwA(r2 - rc);
    return `M ${P(r1, sA - h1)} ${arc(r1, sA - h1, sA + h1)} L ${P(r2 - rc, sA + hMid)} ` +
      `Q ${P(r2, sA + h2)} ${P(r2, sA + h2 - rcA2)} ${arc(r2, sA + h2 - rcA2, sA - h2 + rcA2)} ` +
      `Q ${P(r2, sA - h2)} ${P(r2 - rc, sA - hMid)} Z`;
  };
  const notchPath = (sA) => {
    const a0 = soA(r0), a1 = soA(r1);
    return `M ${P(r0, sA - a0)} ${arc(r0, sA - a0, sA + a0)} L ${P(r1, sA + a1)} ${arc(r1, sA + a1, sA - a1)} Z`;
  };
  // wire strands packed in the slot (hex lay), mapped through polar per slot
  const strands = [];
  let drawn = 0;
  const canDraw = r.condPerSlot > 0 && r.condPerSlot <= 400 && r.dIns * k > 0.9;
  if (canDraw) {
    const rw = r.dIns, pos = [];
    let y = r1 + p.liner + rw / 2, row = 0;
    while (y < r2 - p.liner - rw / 2 - (rc > 0 ? rc * 0.3 : 0) && pos.length < r.condPerSlot) {
      const half = (hwA(y) * y) - p.liner - rw / 2;
      const nfit = Math.max(0, Math.floor((2 * half) / rw));
      const off = row % 2 ? rw / 2 : 0;
      for (let c = 0; c < nfit && pos.length < r.condPerSlot; c++) {
        const x = -half + rw / 2 + c * rw + off;
        if (x <= half) pos.push([x, y]);
      }
      y += rw * 0.87; row++;
    }
    drawn = pos.length;
    [-pitch, 0, pitch].forEach((sA, si) => {
      pos.forEach(([x, yy], i2) => {
        const a = sA + x / yy;
        strands.push(<circle key={si + "-" + i2} cx={Cx + yy * k * Math.sin(a)} cy={Cy - yy * k * Math.cos(a)}
          r={(r.dIns * k) / 2 - 0.3} fill="#E3B341" stroke="#94701C" strokeWidth="0.7" />);
      });
    });
  }
  // rotor magnets intersecting the window
  const mags = [];
  if (p.motorType === "pm") {
    const arcHalf = ((p.poleArc / 100) * Math.PI) / r.poles;
    for (let m = -r.poles; m <= r.poles; m++) {
      const c = (2 * Math.PI * m) / r.poles;
      const a0 = Math.max(c - arcHalf, -dAng), a1 = Math.min(c + arcHalf, dAng);
      if (a1 <= a0) continue;
      mags.push(<path key={"m" + m}
        d={`M ${P(rRt, a0)} ${arc(rRt, a0, a1)} L ${P(rRt - p.magT, a1)} ${arc(rRt - p.magT, a1, a0)} Z`}
        fill={((m % 2) + 2) % 2 ? "#4A76B8" : "#C14B3E"} stroke={INK} strokeWidth="0.8" />);
    }
  }
  const dimA = dAng * 0.88;
  return (
    <svg id="svg-slot" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="slotSvg">
      <style>{SVGCSS}</style>
      {/* rotor core + magnets + airgap */}
      <path d={`M ${P(rRt, -dAng)} ${arc(rRt, -dAng, dAng)} L ${P(rIn, dAng)} ${arc(rIn, dAng, -dAng)} Z`}
        fill={STEEL_DK} stroke={INK} strokeWidth="0.8" />
      {mags}
      {/* stator sector */}
      <path d={`M ${P(r3, -dAng)} ${arc(r3, -dAng, dAng)} L ${P(r0, dAng)} ${arc(r0, dAng, -dAng)} Z`}
        fill={STEEL} stroke={INK} strokeWidth="1" />
      <path d={`M ${P(r2, -dAng)} ${arc(r2, -dAng, dAng)}`} fill="none" stroke={INK} strokeWidth="0.6" opacity="0.35" />
      {[-pitch, 0, pitch].map((sA) => <path key={"s" + sA} d={slotPath(sA)} fill="#F1E8D8" stroke={INK} strokeWidth="1" />)}
      {[-pitch, 0, pitch].map((sA) => <path key={"o" + sA} d={notchPath(sA)} fill={BG} stroke={INK} strokeWidth="0.8" />)}
      {strands}
      {/* dimensions */}
      <line x1={Cx + r2 * k * Math.sin(dimA)} y1={Cy - r2 * k * Math.cos(dimA)}
        x2={Cx + r3 * k * Math.sin(dimA)} y2={Cy - r3 * k * Math.cos(dimA)} stroke={AXIS} strokeWidth="1.2" />
      <text x={Cx + (r3 + 2) * k * Math.sin(dimA) + 4} y={Cy - ((r2 + r3) / 2) * k * Math.cos(dimA)} className="dim">yoke {L(p.yoke)}</text>
      <line x1={Cx + r1 * k * Math.sin(-dimA)} y1={Cy - r1 * k * Math.cos(-dimA)}
        x2={Cx + r2 * k * Math.sin(-dimA)} y2={Cy - r2 * k * Math.cos(-dimA)} stroke={AXIS} strokeWidth="1.2" />
      <text x={Cx + (r2 + 2) * k * Math.sin(-dimA) - 4} y={Cy - ((r1 + r2) / 2) * k * Math.cos(-dimA)} textAnchor="end" className="dim">{L(r.hs)}</text>
      <text x={Cx + ((r1 + r2) / 2) * k * Math.sin(pitch / 2)} y={Cy - ((r1 + r2) / 2) * k * Math.cos(pitch / 2) + 3}
        textAnchor="middle" className="dim" transform={`rotate(${(pitch / 2) * 57.3} ${Cx + ((r1 + r2) / 2) * k * Math.sin(pitch / 2)} ${Cy - ((r1 + r2) / 2) * k * Math.cos(pitch / 2)})`}>
        {L(p.toothW)}</text>
      <text x={Cx} y={Cy - r0 * k + 14} textAnchor="middle" className="dim">open {L(p.slotOpen)}</text>
      <text x={Cx + rRt * k * Math.sin(dimA) + 6} y={Cy - ((r0 + rRt) / 2) * k * Math.cos(dimA) + 2} className="dim">gap {L(r.airgap)}</text>
      {rc > 0.05 && <text x={Cx} y={Cy - (r2 - rc) * k + 2} textAnchor="middle" className="dim">R {L(rc)}</text>}
      <text x={10} y={14} className="wnum">lamination sector · {r.condPerSlot} conductors/slot
        {!canDraw ? " (strands not drawn at this scale)" : drawn < r.condPerSlot ? ` · only ${drawn} fit — slot overfull` : ""}</text>
      <text x={Cx} y={H - 8} textAnchor="middle" className="wnum">rotor · magnets N (red) / S (blue)</text>
    </svg>
  );
}
function WindingDiagram({ r, phaseSel, anim }) {
  const Ns = r.Ns, W = 760, H = 258, x0 = 34, pitch = (W - 68) / Ns, yAx = 132;
  const X = (i) => x0 + (((i % Ns) + Ns) % Ns) * pitch + pitch / 2;
  const Xu = (i) => x0 + i * pitch + pitch / 2; // unwrapped

  const coils = [];
  for (let k = 0; k < Ns; k++) {
    if (r.layers === 1 && k % 2 === 1) continue;
    const t = r.topLayer[k];
    coils.push({ in: k, out: (k + r.span) % Ns, outU: k + r.span, phase: t.phase, sign: t.sign });
  }
  const byPhase = [0, 1, 2].map((ph) => coils.filter((c) => c.phase === ph).sort((a, b) => a.in - b.in));

  const els = [];
  [0, 1, 2].forEach((ph) => {
    if (phaseSel !== "all" && phaseSel !== ph) return;
    const col = PHASE[ph].c;
    const op = anim.on ? 0.2 + 0.8 * Math.abs(phCur(anim.th, ph)) : 1;
    const list = byPhase[ph];
    list.forEach((c, idx) => {
      const arches = [[Xu(c.in), Xu(c.outU)]];
      if (c.outU >= Ns) arches.push([Xu(c.in) - Ns * pitch, X(c.out)]); // wrapped copy
      arches.forEach(([xa, xb], ai) => {
        const h = 46 + (c.in % 3) * 7;
        els.push(<path key={`c${ph}-${idx}-${ai}`} d={`M ${xa} ${yAx} Q ${(xa + xb) / 2} ${yAx - h} ${xb} ${yAx}`}
          fill="none" stroke={col} strokeWidth="2" opacity={op * (c.sign > 0 ? 1 : 0.5)} />);
      });
      // in-stroke (solid, arrow down = into slot) / out-stroke (dashed, up)
      els.push(<line key={`i${ph}-${idx}`} x1={X(c.in)} y1={yAx} x2={X(c.in)} y2={yAx + 24}
        stroke={col} strokeWidth="2.4" opacity={op} markerEnd="url(#win)" />);
      els.push(<line key={`o${ph}-${idx}`} x1={X(c.out)} y1={yAx + 24} x2={X(c.out)} y2={yAx}
        stroke={col} strokeWidth="2" strokeDasharray="3 2.5" opacity={op} markerEnd="url(#wout)" />);
      // jumper to next coil of this phase
      if (idx < list.length - 1) {
        const xa = X(c.out), xb = X(list[idx + 1].in);
        els.push(<path key={`j${ph}-${idx}`} d={`M ${xa} ${yAx + 24} Q ${(xa + xb) / 2} ${yAx + 66} ${xb} ${yAx + 24}`}
          fill="none" stroke={col} strokeWidth="1.3" strokeDasharray="1.5 3" opacity={op * 0.9} />);
      }
    });
    if (list.length) {
      const first = list[0], last = list[list.length - 1];
      els.push(<g key={`li${ph}`}>
        <circle cx={X(first.in)} cy={yAx + 30} r="4" fill={col} />
        <text x={X(first.in)} y={yAx + 44} textAnchor="middle" className="wlbl" fill={col}>{PHASE[ph].name} IN</text>
      </g>);
      els.push(<g key={`lo${ph}`}>
        <rect x={X(last.out) - 3.5} y={yAx + 26.5} width="7" height="7" fill="none" stroke={col} strokeWidth="1.6" />
        <text x={X(last.out)} y={yAx + 44} textAnchor="middle" className="wlbl" fill={col}>{PHASE[ph].name} OUT</text>
      </g>);
    }
  });

  return (
    <svg id="svg-winding" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <style>{SVGCSS}</style>
      <defs>
        <marker id="win" markerWidth="6" markerHeight="6" refX="3" refY="4.5" orient="auto">
          <path d="M0,0 L6,0 L3,5.5 Z" fill="context-stroke" />
        </marker>
        <marker id="wout" markerWidth="6" markerHeight="6" refX="3" refY="1.5" orient="auto">
          <path d="M0,6 L6,6 L3,0.5 Z" fill="context-stroke" />
        </marker>
      </defs>
      <line x1={x0 - 8} y1={yAx} x2={W - x0 + 8} y2={yAx} stroke="#94A3B8" strokeWidth="1" />
      {Array.from({ length: Ns }, (_, i) => (
        <g key={"t" + i}>
          <line x1={X(i)} y1={yAx - 4} x2={X(i)} y2={yAx + 4} stroke="#94A3B8" strokeWidth="1" />
          <text x={X(i)} y={yAx - 8} textAnchor="middle" className="wnum">{i + 1}</text>
        </g>
      ))}
      {els}
      <text x={x0 - 8} y={H - 8} className="wnum">solid ▼ = coil in (top layer) · dashed ▲ = coil out (return layer) · dotted arc = series jumper</text>
    </svg>
  );
}

/* ---- axial full section: 180-degree slice through the shaft centerline ---- */
function AxialCutaway({ p, r, us, anim }) {
  const W = 400, H = 330;
  const L = (mm, d = 3) => (us === "in" ? (mm / INCH).toFixed(d) : mm.toFixed(1));
  const un = us === "in" ? "in" : "mm";
  let hEnd;
  if (p.motorType === "latm") hEnd = Math.max(p.latmWind, r && r.latm && Number.isFinite(r.latm.buildX) ? r.latm.buildX : 0, 0.5); // toroid wrap: as-built thickness, same basis as the cross-section
  else if (p.endMode === "head") hEnd = p.headH;
  else if (p.endMode === "bobbin") hEnd = p.bobWall + r.tb;
  else hEnd = 0.5 * Math.sqrt(Math.max((r.endSide - 5) ** 2 - r.coilArc ** 2, 0)) + 4;
  hEnd = Math.max(hEnd, 2);
  const brushed = p.motorType === "brushed", latmA = p.motorType === "latm";
  const stpA = p.motorType === "stepper", stpHyb = stpA && (p.stpKind || "hybrid") !== "pm";
  const brkA = p.motorType === "brake";
  const OAL = p.stackL + 2 * hEnd;
  const rOD = p.statorOD / 2, rBore = p.statorID / 2, rRot = p.rotorOD / 2;
  // winding band: stator slots (bore + tips outward) or armature slots (surface + tips inward)
  const rTip = brushed ? rRot - p.tipH - Math.max(r.hs, 0) : rBore + p.tipH;
  const rSlotTop = brushed ? rRot - p.tipH : rTip + Math.max(r.hs, 0);
  const rShaft = Math.max(p.shaftD / 2, 2);
  const k = Math.min((W - 150) / (OAL + (brushed ? 26 : 0)), (H - 120) / (2 * rOD));
  const yC = H / 2 + 4, xC = W / 2 - 8;
  const xs = xC - (p.stackL / 2) * k, xe = xC + (p.stackL / 2) * k, he = hEnd * k;
  const Y = (rad) => yC - rad * k;

  const band = (r1, r2, fill, key) => ( // mirrored stator band
    <g key={key}>
      <rect x={xs} y={Y(r2)} width={xe - xs} height={(r2 - r1) * k} fill={fill} stroke="#334155" strokeWidth="1" />
      <rect x={xs} y={yC + r1 * k} width={xe - xs} height={(r2 - r1) * k} fill={fill} stroke="#334155" strokeWidth="1" />
    </g>
  );
  const ends = (x) => (
    <g key={"e" + x}>
      <rect x={x} y={Y(rSlotTop)} width={he} height={(rSlotTop - rTip) * k} rx={Math.min(he / 2, 7)} fill="#D9A05B" stroke="#92400E" strokeWidth="1" />
      <rect x={x} y={yC + rTip * k} width={he} height={(rSlotTop - rTip) * k} rx={Math.min(he / 2, 7)} fill="#D9A05B" stroke="#92400E" strokeWidth="1" />
    </g>
  );
  const vdim = (x, r1, r2, label, anchor) => (
    <g key={"v" + x + label}>
      <line x1={x} y1={Y(r2)} x2={x} y2={yC + r2 * k} stroke="#64748B" strokeWidth="1" />
      <line x1={x - 3} y1={Y(r2)} x2={x + 3} y2={Y(r2)} stroke="#64748B" strokeWidth="1" />
      <line x1={x - 3} y1={yC + r2 * k} x2={x + 3} y2={yC + r2 * k} stroke="#64748B" strokeWidth="1" />
      <text x={x + (anchor === "end" ? -5 : 5)} y={yC + 3} textAnchor={anchor} className="dim">{label}</text>
    </g>
  );

  return (
    <svg id="svg-axial" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 420, display: "block", margin: "0 auto" }}>
      <style>{SVGCSS}</style>
      {/* shaft through the full section */}
      <rect x={xs - he - 22} y={Y(rShaft)} width={xe - xs + 2 * he + 44 + (brushed ? 20 : 0)} height={2 * rShaft * k} fill="#475569" stroke="#334155" strokeWidth="0.8" />
      {brkA ? (
        <g>
          {/* Working drawing of the spring-applied brake: mounting wall right, pot-core backiron with
              bobbin-wound coil seated at the pocket bottom, springs, sliding (non-rotating) armature.
              1 face: static lining on the armature works the bare rotating disc. 2 faces: lining bonded to
              both sides of the rotating disc, pinched between the static pressure plate and the armature.
              ▶ toggles power: OFF = springs clamp; ON = armature pulled in — flux loops shown. */}
          {(() => {
            const rODm = p.statorOD / 2, rPktm = Math.max(p.brkPktID, 4) / 2;
            const rBossm = Math.max(p.brkBossOD, 2) / 2, rThrum = Math.max(p.brkBore, p.shaftD + 2) / 2;
            const roLm = Math.max(p.brkRo, 2), riLm = Math.max(p.brkRi, 1);
            const tArm = Math.max(p.brkArm * k, 4);
            const strk = Math.max(p.brkStroke * k, 3);
            const pktDpx = Math.max(p.brkPktD * k, 8);
            const bobLpx = Math.max(p.brkBobL * k, 6);
            const on = anim && anim.on ? Math.floor(anim.th * 0.35) % 2 === 1 : false;
            const dx = on ? strk : 0;
            const tD = 5, tPP = 6;
            const xWall = W - 158;                                     // pinned: room for the Ø ladder
            const xBody0 = xWall - Math.max(p.stackL * k, 24);         // backiron front face
            const xArm0 = xBody0 - strk - tArm;                        // armature ENGAGED position (left face)
            const xArm = xArm0 + dx;                                   // slides right when energized
            const xDisc = xArm0 - tD, xPP = xDisc - tPP;               // disc & pressure plate FIXED
            const dl = (mm) => us === "in" ? (mm / 25.4).toFixed(3) + '\u2033' : mm.toFixed(1);
            const bandV = (x0, x1, rInMM, rOutMM, fill, key) => (
              <g key={key}>
                <rect x={x0} y={Y(rOutMM)} width={x1 - x0} height={(rOutMM - rInMM) * k} fill={fill} stroke="#334155" strokeWidth="0.8" />
                <rect x={x0} y={yC + rInMM * k} width={x1 - x0} height={(rOutMM - rInMM) * k} fill={fill} stroke="#334155" strokeWidth="0.8" />
              </g>
            );
            const zig = (x0, x1, yMid, key) => {
              const n8 = 5, pts = [];
              for (let j8 = 0; j8 <= n8 * 2; j8++) pts.push(`${x0 + ((x1 - x0) * j8) / (n8 * 2)},${yMid + (j8 % 2 ? -4 : 4)}`);
              return <polyline key={key} points={pts.join(" ")} fill="none" stroke="#52525B" strokeWidth="1.6" />;
            };
            const dimH = (x0, x1, y, label, key) => (
              <g key={key}>
                <line x1={x0} y1={y} x2={x1} y2={y} stroke="#64748B" strokeWidth="0.8" />
                <line x1={x0} y1={y - 3} x2={x0} y2={y + 3} stroke="#64748B" strokeWidth="0.8" />
                <line x1={x1} y1={y - 3} x2={x1} y2={y + 3} stroke="#64748B" strokeWidth="0.8" />
                <text x={(x0 + x1) / 2} y={y - 3} textAnchor="middle" className="dim">{label}</text>
              </g>
            );
            const rSprM = (rBossm + rPktm) / 2;
            const xPkt0 = xBody0, xPkt1 = xBody0 + pktDpx;             // pocket opens toward the armature
            const xBob1 = xPkt1 - 1, xBob0 = Math.max(xBob1 - bobLpx, xPkt0 + 1); // bobbin seats at the pocket bottom
            const rBobm = p.brkBobID / 2, rCoilm = ((r.brake && r.brake.coilOD) || p.brkBobID + 2) / 2;
            const rFlgm = Math.min(p.brkBobOD / 2, rPktm - 0.3);       // flange to the max-finish Ø, inside the pocket
            return (
              <g>
                {/* mounting wall + hatch */}
                <rect x={xWall} y={Y(rODm + 6)} width={10} height={(rODm + 6) * 2 * k} fill="#CBD5E1" stroke="#334155" />
                {Array.from({ length: 9 }, (_, j) => (
                  <line key={"h" + j} x1={xWall} y1={Y(rODm + 6) + j * ((rODm + 6) * 2 * k / 8)} x2={xWall + 10}
                    y2={Y(rODm + 6) + j * ((rODm + 6) * 2 * k / 8) - 8} stroke="#94A3B8" strokeWidth="0.8" />
                ))}
                {/* backiron: rim leg, boss leg, back web */}
                {bandV(xBody0, xWall, rPktm, rODm, "#94A3B8", "rim")}
                {bandV(xBody0, xWall, rThrum, rBossm, "#94A3B8", "boss")}
                {bandV(xPkt1, xWall, rBossm, rPktm, "#94A3B8", "web")}
                {/* bobbin flanges + wound coil in the pocket */}
                {bandV(xBob0 - 1.5, xBob0, rBobm - 1, rFlgm, "#D9D2C5", "bfl0")}
                {bandV(xBob1, xBob1 + 1.5, rBobm - 1, rFlgm, "#D9D2C5", "bfl1")}
                {bandV(xBob0, xBob1, rBobm, rCoilm, "#E8933A", "coil")}
                {/* springs from armature to the back web */}
                {zig(xArm + tArm, xPkt1, Y(rSprM), "sprT")}
                {zig(xArm + tArm, xPkt1, yC + rSprM * k, "sprB")}
                {/* armature (only moving, non-rotating part): annular, clears the hub */}
                {(() => {
                  const rHubm = Math.max(riLm * 0.8, rThrum + 1.5);   // hub OD — the disk splines onto it
                  return (
                    <g>
                      {bandV(xArm, xArm + tArm, rHubm + 0.8, rODm, "#7C9885", "arm")}
                      {/* friction architecture: 1 face = static lining on the armature working a bare disk;
                          2 faces (SEPAC style) = lined rotating friction disk on the hub, pinched between the
                          outboard static pressure plate (on standoffs to the magnet body) and the armature */}
                      {p.brkFaces >= 2 ? (
                        <g>
                          {bandV(xDisc + 1.4, xDisc + tD - 1.4, rHubm, roLm, "#8A97A8", "discCore")}
                          {bandV(xDisc, xDisc + 1.4, riLm, roLm, "#3F3F46", "linA")}
                          {bandV(xDisc + tD - 1.4, xDisc + tD, riLm, roLm, "#3F3F46", "linB")}
                          {bandV(xPP, xDisc, rHubm + 0.8, rODm * 0.98, "#5B7B9A", "pp")}
                          {/* standoffs: pressure plate fixed back to the magnet body through armature clearance */}
                          <rect x={xPP} y={Y(rODm * 0.9) - 1.6} width={xBody0 - xPP} height={3.2} fill="#52525B" stroke="#334155" strokeWidth="0.5" />
                          <rect x={xPP} y={yC + rODm * 0.9 * k - 1.6} width={xBody0 - xPP} height={3.2} fill="#52525B" stroke="#334155" strokeWidth="0.5" />
                        </g>
                      ) : (
                        <g>
                          {bandV(xDisc, xDisc + tD, rHubm, roLm, "#8A97A8", "discSteel")}
                          {bandV(xArm - 1.6, xArm, riLm, roLm, "#3F3F46", "linArm")}
                        </g>
                      )}
                      {/* hub on the shaft: the friction disk rides its spline */}
                      {bandV((p.brkFaces >= 2 ? xPP : xDisc) - 7, xDisc + tD + 5, Math.max((p.shaftD / 2) + 0.3, 1.5), rHubm, "#B5C9A5", "hub")}
                    </g>
                  );
                })()}
                <rect x={xPP - 26} y={yC - Math.max((p.shaftD / 2) * k, 3.5)} width={xWall + 20 - (xPP - 26)}
                  height={Math.max((p.shaftD / 2) * k, 3.5) * 2} fill="#9AA3AE" stroke="#334155" />
                {/* separation: engaged = armature face on disc; released = gap opens armature↔disc */}
                {on && <g>
                  <line x1={xDisc + tD} y1={yC - roLm * k * 0.7} x2={xArm} y2={yC - roLm * k * 0.7} stroke="#059669" strokeWidth="1.6" />
                  <text x={(xDisc + tD + xArm) / 2} y={yC - roLm * k * 0.7 - 4} textAnchor="middle" className="dim">disc free</text>
                  {/* flux path: rim leg → working gap → armature → boss gap → boss → back web, looping the coil */}
                  {(() => {
                    const xA9 = xArm + tArm / 2, xW9 = (xPkt1 + xWall - 4) / 2;
                    const loop = (rIn9, rOut9, half, kq) => {
                      const y1 = half * (rOut9 * k), y2 = half * (rIn9 * k);
                      return <path key={kq} d={`M ${xA9} ${yC + y1} L ${xW9} ${yC + y1} L ${xW9} ${yC + y2} L ${xA9} ${yC + y2} Z`}
                        fill="none" stroke="#2563EB" strokeWidth="1.1" strokeDasharray="5 3" opacity="0.75" strokeLinejoin="round" />;
                    };
                    const rRim1 = (rPktm * 0.35 + rODm * 0.65), rRim2 = (rPktm * 0.7 + rODm * 0.3);
                    const rBos1 = (rThrum * 0.3 + rBossm * 0.7), rBos2 = (rThrum * 0.65 + rBossm * 0.35);
                    return <g>
                      {loop(rBos1, rRim1, -1, "fxU1")}{loop(rBos2, rRim2, -1, "fxU2")}
                      {loop(rBos1, rRim1, 1, "fxL1")}{loop(rBos2, rRim2, 1, "fxL2")}
                      <text x={(xA9 + xW9) / 2} y={Y((rBossm + rPktm) / 2) + 4} textAnchor="middle"
                        style={{ fontSize: 9, fill: "#2563EB", fontStyle: "italic" }}>Φ</text>
                    </g>;
                  })()}
                </g>}
                {!on && <g>
                  <line x1={xArm + tArm} y1={Y(rODm) - 8} x2={xBody0} y2={Y(rODm) - 8} stroke={PEACH} strokeWidth="1.6" />
                  <text x={(xArm + tArm + xBody0) / 2} y={Y(rODm) - 12} textAnchor="middle" className="dim">gap {dl(p.brkStroke)}</text>
                </g>}
                {/* dimensions: staggered Ø ladder right of the wall, stacked axial dims below */}
                {(() => {
                  const vd = (x9, rMM, label, key, below, right) => (
                    <g key={key}>
                      <line x1={x9} y1={yC - rMM * k} x2={x9} y2={yC + rMM * k} stroke="#64748B" strokeWidth="0.9" />
                      <line x1={x9 - 4} y1={yC - rMM * k} x2={x9 + 4} y2={yC - rMM * k} stroke="#64748B" strokeWidth="0.9" />
                      <line x1={x9 - 4} y1={yC + rMM * k} x2={x9 + 4} y2={yC + rMM * k} stroke="#64748B" strokeWidth="0.9" />
                      <line x1={xWall + 10} y1={yC - rMM * k} x2={x9} y2={yC - rMM * k} stroke="#94A3B8" strokeWidth="0.5" strokeDasharray="2 2" />
                      <text x={right ? x9 + 5 : x9 - 3} y={below ? yC + rMM * k + 11 : yC - rMM * k - 4}
                        textAnchor={right ? "start" : "end"} className="dim">{label}</text>
                    </g>
                  );
                  const xd0 = xWall + 26;
                  return (
                    <g>
                      {vd(xd0, rODm, `\u00d8${dl(p.statorOD)} OD`, "vOD", false, true)}
                      {vd(xd0 + 32, rPktm, `\u00d8${dl(p.brkPktID)} pocket ID`, "vPk", true, true)}
                      {vd(xd0 + 64, rBossm, `\u00d8${dl(p.brkBossOD)} boss`, "vBs", false, false)}
                      {vd(xd0 + 96, rThrum, `\u00d8${dl(p.brkBore)} thru`, "vTh", true, false)}
                      {dimH(xBob0, xBob1, yC + rODm * k + 16, `bobbin ${dl(p.brkBobL)}`, "dBo")}
                      {dimH(xPkt0, xPkt1, yC + rODm * k + 32, `pocket ${dl(p.brkPktD)}`, "dPk")}
                      {dimH(xBody0, xWall, yC + rODm * k + 48, `backiron L ${dl(p.stackL)} ${us === "in" ? "in" : "mm"}`, "dL")}
                    </g>
                  );
                })()}
                {/* wound coil callout: fixed top-left slot (clear of the drawing), leader to the coil */}
                <line x1={96} y1={57} x2={(xBob0 + xBob1) / 2} y2={Y(rCoilm) + 2} stroke="#7C4A1E" strokeWidth="0.6" strokeDasharray="3 2" />
                <text x={14} y={50} className="dim" style={{ fill: "#7C4A1E" }}>{`coil \u00d8${dl((r.brake && r.brake.coilOD) || 0)}`}</text>
                <text x={14} y={61} className="dim" style={{ fill: "#7C4A1E" }}>{`clr ${r.brake ? r.brake.clr.toFixed(2) : "\u2014"} mm in pocket`}</text>
                {/* component labels: staggered, collision-free */}
                {p.brkFaces >= 2 && <text x={xPP + tPP / 2 + 3} y={yC} textAnchor="middle" className="wnum"
                  transform={`rotate(-90 ${xPP + tPP / 2 + 3} ${yC})`}>pressure plate</text>}
                <text x={xDisc + tD / 2} y={yC + roLm * k + 11} textAnchor="middle" className="wnum">disc</text>
                <text x={xArm + tArm / 2} y={yC + 4} textAnchor="middle" className="wnum"
                  transform={`rotate(-90 ${xArm + tArm / 2} ${yC + 4})`}>armature</text>
                <text x={14} y={34} className="wlbl" style={{ fill: on ? "#059669" : "#B91C1C", fontSize: 11 }}>
                  {on ? "POWER ON — armature pulled in (released)" : "POWER OFF — springs clamp the disc (engaged)"}</text>
              </g>
            );
          })()}
        </g>
      ) : stpHyb ? (
        <g>
          {/* hybrid stepper rotor: two toothed cups with the axially magnetized PM disc between,
              cups offset by half a tooth pitch (offset shown by staggered serration) */}
          {(() => {
            const Lcup = Math.max((p.stackL - p.magT) / 2, 2) * k;
            const xm0 = xs + Lcup, xm1 = xm0 + Math.max(p.magT * k, 3);
            const tDep = Math.max(Math.min(rRot * k * 0.08, 5), 2.5);
            const serr = (x0, x1, phase) => {
              const n7 = Math.max(Math.round((x1 - x0) / 7), 3), out = [];
              for (let j7 = 0; j7 < n7; j7++) {
                const xx = x0 + ((j7 + (phase ? 0.5 : 0)) * (x1 - x0)) / n7;
                const ww = ((x1 - x0) / n7) * 0.55;
                if (xx + ww > x1) continue;
                out.push(<rect key={"t" + x0 + "-" + j7} x={xx} y={Y(rRot)} width={ww} height={tDep} fill="#64748B" stroke="#334155" strokeWidth="0.6" />);
                out.push(<rect key={"b" + x0 + "-" + j7} x={xx} y={yC + rRot * k - tDep} width={ww} height={tDep} fill="#64748B" stroke="#334155" strokeWidth="0.6" />);
              }
              return out;
            };
            return (
              <g>
                {/* cup bodies (tooth roots) */}
                <rect x={xs} y={Y(rRot) + tDep} width={xm0 - xs} height={2 * rRot * k - 2 * tDep} fill="#64748B" stroke="#334155" strokeWidth="1" />
                <rect x={xm1} y={Y(rRot) + tDep} width={xe - xm1} height={2 * rRot * k - 2 * tDep} fill="#64748B" stroke="#334155" strokeWidth="1" />
                {/* teeth on each cup — second cup staggered half a pitch */}
                {serr(xs, xm0, false)}
                {serr(xm1, xe, true)}
                {/* axially magnetized PM disc */}
                <rect x={xm0} y={Y(rRot * 0.8)} width={xm1 - xm0} height={2 * rRot * 0.8 * k} fill="#C14B3E" stroke="#334155" strokeWidth="0.8" />
                <text x={(xm0 + xm1) / 2} y={Y(rRot * 0.8) - 4} textAnchor="middle" className="dim">PM</text>
                <text x={(xs + xm0) / 2} y={yC + 4} textAnchor="middle" className="dim">N cup</text>
                <text x={(xm1 + xe) / 2} y={yC + 4} textAnchor="middle" className="dim">S cup</text>
              </g>
            );
          })()}
          {/* stator bands over the rotor: reuse the generic layout */}
          {band(rBore, rTip, "#94A3B8", "tipS")}
          {band(rTip, rSlotTop, "#E8C9A0", "windS")}
          {band(rSlotTop, rOD, "#94A3B8", "yokeS")}
          {ends(xs - he, xs, "el")}
          {ends(xe, xe + he, "er")}
        </g>
      ) : latmA ? (
        <g>
          {/* slotless ring core with the toroidal winding wrapped over ID, OD and both ends */}
          {(() => {
            const twm = Math.max(p.latmWind, r && r.latm && Number.isFinite(r.latm.buildX) ? r.latm.buildX : 0, 0.5);
            const wrap = (r1, r2, x0, x1, key) => (
              <g key={key}>
                <rect x={x0} y={Y(r2)} width={x1 - x0} height={(r2 - r1) * k} fill="#D9A05B" stroke="#92400E" strokeWidth="0.8" />
                <rect x={x0} y={yC + r1 * k} width={x1 - x0} height={(r2 - r1) * k} fill="#D9A05B" stroke="#92400E" strokeWidth="0.8" />
              </g>
            );
            return (
              <g>
                {/* end wraps span the full core height including face wraps */}
                {wrap(rBore - twm, rOD + twm, xs - he, xs, "wl")}
                {wrap(rBore - twm, rOD + twm, xe, xe + he, "wr")}
                {/* core band */}
                {band(rBore, rOD, "#94A3B8", "core")}
                {/* face wraps along the stack */}
                {wrap(rOD, rOD + twm, xs, xe, "wo")}
                {wrap(rBore - twm, rBore, xs, xe, "wi")}
              </g>
            );
          })()}
          {/* PM rotor */}
          <rect x={xs} y={Y(rRot)} width={xe - xs} height={2 * rRot * k} fill="#64748B" stroke="#334155" strokeWidth="1" />
          <rect x={xs} y={Y(rRot)} width={xe - xs} height={Math.max(p.magT * k, 2)} fill="#C14B3E" stroke="#334155" strokeWidth="0.8" />
          <rect x={xs} y={yC + rRot * k - Math.max(p.magT * k, 2)} width={xe - xs} height={Math.max(p.magT * k, 2)} fill="#4A76B8" stroke="#334155" strokeWidth="0.8" />
        </g>
      ) : brushed ? (
        <g>
          {/* housing can, longer than the stack, with the magnet ring on its ID */}
          {(() => {
            const xh0 = xs - he - 8, xh1 = xe + he + 8;
            const tM = Math.max(p.magT * k, 2);
            return (
              <g>
                <rect x={xh0} y={Y(rOD)} width={xh1 - xh0} height={(rOD - rBore - p.magT) * k} fill="#94A3B8" stroke="#334155" strokeWidth="1" />
                <rect x={xh0} y={yC + (rBore + p.magT) * k} width={xh1 - xh0} height={(rOD - rBore - p.magT) * k} fill="#94A3B8" stroke="#334155" strokeWidth="1" />
                <rect x={xs} y={Y(rBore + p.magT)} width={xe - xs} height={tM} fill="#C14B3E" stroke="#334155" strokeWidth="0.8" />
                <rect x={xs} y={yC + rBore * k} width={xe - xs} height={tM} fill="#4A76B8" stroke="#334155" strokeWidth="0.8" />
              </g>
            );
          })()}
          {/* rotating armature: core, winding band, tooth tips */}
          {band(rShaft, rTip, "#64748B", "core")}
          {band(rTip, rSlotTop, "#E8C9A0", "wind")}
          {band(rSlotTop, rRot, "#94A3B8", "tip")}
          {ends(xs - he)}
          {ends(xe)}
          {/* commutator on the shaft extension + brush */}
          {(() => {
            const xc0 = xe + he + 6, wC = 14, rC = Math.max(rShaft * 1.7, rShaft + 3.5);
            return (
              <g>
                <rect x={xc0} y={Y(rC)} width={wC} height={2 * rC * k} fill="#D08A4A" stroke="#7C4A1E" strokeWidth="0.8" />
                {[1, 2, 3].map((j) => <line key={j} x1={xc0} x2={xc0 + wC} y1={Y(rC) + (2 * rC * k * j) / 4} y2={Y(rC) + (2 * rC * k * j) / 4} stroke="#7C4A1E" strokeWidth="0.5" />)}
                <rect x={xc0 + 3} y={Y(rC) - 7} width={wC - 6} height={6} fill="#3F3F46" stroke="#334155" strokeWidth="0.7" />
                <text x={xc0 + wC / 2} y={Y(rC) - 11} textAnchor="middle" className="dim">brush</text>
              </g>
            );
          })()}
        </g>
      ) : (
        <g>
          {/* rotor core (full slice) + magnets top and bottom */}
          <rect x={xs} y={Y(rRot)} width={xe - xs} height={2 * rRot * k} fill="#64748B" stroke="#334155" strokeWidth="1" />
          {p.motorType === "induction" && (() => {
            const barCol = (p.barMat || "").toLowerCase().includes("copper") ? "#B87333" : "#C7CDD4";
            const tBar = Math.max(rRot * 0.16 * k, 3);               // bar band depth (display)
            const wRing = Math.min(Math.max(he * 0.7, 5), 14);       // end-ring axial width
            return (
              <g>
                {/* cage bars along the stack, both halves */}
                <rect x={xs} y={Y(rRot) + 1} width={xe - xs} height={tBar} fill={barCol} stroke="#334155" strokeWidth="0.7" />
                <rect x={xs} y={yC + rRot * k - 1 - tBar} width={xe - xs} height={tBar} fill={barCol} stroke="#334155" strokeWidth="0.7" />
                {/* shorting end rings beyond the stack */}
                {[[xs - wRing, "l"], [xe, "r"]].map(([x0, kk]) => (
                  <g key={"er" + kk}>
                    <rect x={x0} y={Y(rRot) + 1} width={wRing} height={tBar * 1.8} fill={barCol} stroke="#334155" strokeWidth="0.8" />
                    <rect x={x0} y={yC + rRot * k - 1 - tBar * 1.8} width={wRing} height={tBar * 1.8} fill={barCol} stroke="#334155" strokeWidth="0.8" />
                  </g>
                ))}
              </g>
            );
          })()}
          {(p.motorType === "pm" || (p.motorType === "stepper" && p.stpKind === "pm")) && (
            <g>
              <rect x={xs} y={Y(rRot)} width={xe - xs} height={Math.max(p.magT * k, 2)} fill="#C14B3E" stroke="#334155" strokeWidth="0.8" />
              <rect x={xs} y={yC + rRot * k - Math.max(p.magT * k, 2)} width={xe - xs} height={Math.max(p.magT * k, 2)} fill="#4A76B8" stroke="#334155" strokeWidth="0.8" />
            </g>
          )}
          {/* stator bands: winding region + yoke, both halves */}
          {band(rBore, rTip, "#94A3B8", "tip")}
          {band(rTip, rSlotTop, "#E8C9A0", "wind")}
          {band(rSlotTop, rOD, "#94A3B8", "yoke")}
          {ends(xs - he)}
          {ends(xe)}
        </g>
      )}
      {/* centerline */}
      <line x1={12} y1={yC} x2={W - 12} y2={yC} stroke="#64748B" strokeWidth="0.8" strokeDasharray="9 3 2 3" />
      {/* dimensions (machine types with a lamination stack; the brake draws its own set) */}
      {!brkA && <g>
      <line x1={xs} y1={Y(rOD) - 13} x2={xe} y2={Y(rOD) - 13} stroke="#64748B" strokeWidth="1" />
      <text x={xC} y={Y(rOD) - 18} textAnchor="middle" className="dim">stack {L(p.stackL)}</text>
      <line x1={xs - he} y1={yC + rOD * k + 16} x2={xe + he} y2={yC + rOD * k + 16} stroke="#64748B" strokeWidth="1" />
      <text x={xC} y={yC + rOD * k + 29} textAnchor="middle" className="dim">OAL {L(OAL)} {un}</text>
      {vdim(xe + he + (brushed ? 34 : 16), 0, rOD, "Ø " + L(p.statorOD), "start")}
      {vdim(xs - he - 16, 0, rRot, "Ø " + L(p.rotorOD), "end")}
      </g>}
      {!latmA && !brkA && <g>
        <line x1={xe} y1={Y(rSlotTop) - 7} x2={xe + he} y2={Y(rSlotTop) - 7} stroke="#92400E" strokeWidth="1" />
        <text x={xe + he / 2} y={Y(rSlotTop) - 11} textAnchor="middle" className="dim">{L(hEnd)}</text>
      </g>}
      <text x={14} y={16} className="wnum">{brkA
        ? "working section · pot-core electromagnet vs springs; ▶ Play toggles power to engage/release"
        : stpHyb
        ? "full section · PM disc between two toothed cups offset ½ tooth pitch; stator + windings around"
        : latmA
        ? "full section · toroidally wound ring core (static), PM rotor toggles between stops"
        : brushed
        ? "full section · housing can + magnet ring (static), slotted armature + commutator rotate"
        : "full section through centerline · magnets N (red) / S (blue)"}</text>
    </svg>
  );
}

/* ---- small controls ---- */
function Num({ label, unit, v, set, step = 1, min, max }) {
  const us = useContext(UnitCtx);
  const dim = unit === "mm" && us === "in";
  const cv = (x) => +(x / INCH).toFixed(4);
  return (
    <label className="field">
      <span className="fl">{label}{unit ? <em> {dim ? "in" : unit}</em> : null}</span>
      <input type="number" value={dim ? cv(v) : v} step={dim ? cv(step) || 0.001 : step}
        min={dim && min != null ? cv(min) : min} max={dim && max != null ? cv(max) : max}
        onChange={(e) => { const x = parseFloat(e.target.value) || 0; set(dim ? x * INCH : x); }} />
    </label>
  );
}
function Pick({ label, v, set, opts }) {
  return (
    <label className="field">
      <span className="fl">{label}</span>
      <div className="seg">
        {opts.map((o) => (
          <button key={o.v} className={v === o.v ? "on" : ""} onClick={() => set(o.v)}>{o.t}</button>
        ))}
      </div>
    </label>
  );
}
function Sel({ label, v, set, opts }) {
  return (
    <label className="field">
      <span className="fl">{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
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
              {sol.err && sol.err.map((e9, i9) => <div className="warn errb" key={"se" + i9}>{e9}</div>)}
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
                <div className="kv"><span>Real R at solved arbor (L-L / coil, 20 °C{sol.kRw !== 1 ? ", cal" : ""})</span>
                  <b style={{ color: sol.RcT > 0 && sol.RllReal > p.wbRt * 1.005 ? "#B45309" : undefined }}>
                    {fmt(sol.RllReal, 3)} / {fmt(sol.RcReal, 3)} Ω{sol.RcT > 0 ? ` · ${sol.RllReal > p.wbRt * 1.005 ? "+" : ""}${fmt((sol.RllReal / Math.max(p.wbRt, 1e-9) - 1) * 100, 1)}% vs target` : ""}</b></div>
                {sol.RcT > 0 && <div className="kv"><span>Arbor candidates — target R · geometry · insertion</span>
                  <b>{[["R", sol.DaR], ["geo", sol.DaGeo], ["ins", sol.DaIns]].map(([t9, v9], i9) => (
                    <span key={t9}>{i9 > 0 ? " · " : ""}<span style={Math.abs(v9 - sol.Da) < 0.03 ? { textDecoration: "underline" } : { opacity: 0.6 }}>{dl9(v9)}</span></span>
                  ))} — largest governs</b></div>}
                {sol.throwArc > 0 && <div className="kv"><span>Coil span arc (throw {p.wbThrow} slots)</span><b>{dl9(sol.throwArc)}</b></div>}
                <div className="kv"><span>Lay ({sol.perStrand ? "per-strand, wild hand wind" : "square bundle"})</span>
                  <b>{sol.perStrand ? `${sol.tplW} wires/layer · ${sol.LwW} layers` : `${sol.tpl} turns/layer · ${sol.layers} layers`} · {dl9(sol.build)} build</b></div>
              </div>
              {sol.reachShort && <div className="warn">
                Entered coil head {dl9(sol.LheadEnt)}/end can't cross the throw-{p.wbThrow} span ({dl9(sol.spanArc)}) —
                head RAISED to the {dl9(sol.Lhead)} reach floor, and the solved arbor / real R above include it.
                Scheme auto suggests {dl9(sol.headAuto)}/end (1.25×span); clear the override (0) for throw-driven heads.</div>}
              {sol.RcT > 0 && sol.DaR > 0 && sol.Da > sol.DaR + 0.005 && <div className="warn">
                Target R would allow Ø{dl9(sol.DaR)}, but {sol.DaGeo >= sol.DaIns ? "stack + heads need" : "insertion needs"} Ø{dl9(sol.Da)} —
                the larger governs, and real R runs {fmt((sol.RllReal / Math.max(p.wbRt, 1e-9) - 1) * 100, 1)}% above target (row above).
                Shorter heads / smaller throw, fewer turns, or finer wire recover the target.</div>}
              <div className="note" style={{ marginTop: 4 }}>A coil-head override pins head length — throw then only sets the span drawing and the
                reach check. With head = 0 (auto), throw drives the heads and therefore the solved arbor and real R.</div>
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
          <Num label="Stack skew end-to-end (0 = straight)" unit="°" v={p.skew} set={s("skew")} step={0.5} min={0} />
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
            Sequential channels, one coil each. Copper drawn at the nested build; {b.perStrand
              ? "wild multi-strand is modeled per-strand (hand-fed wires settle individually, bench-validated) rather than as round bundles"
              : "the strand bundle is treated as an effective Ø of wire × √strands — a lay-dependent first-order figure"}. Tool length includes a
            flange between and outside every channel.
          </div>
        </div>
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Coil results</h2>
          <div className="tbl">
            <div className="kv"><span>Wire (bare / insulated / bundle)</span><b>Ø{b.dBare.toFixed(3)} / {b.dIns.toFixed(3)} / {b.dEff.toFixed(3)} mm</b></div>
            <div className="kv"><span>Lay: {b.perStrand ? "wires per layer · layers (per-strand)" : "turns per layer · layers"}</span><b>{b.perStrand ? `${b.tplW} · ${b.LwW}` : `${b.tpl} · ${b.layers}`}</b></div>
            <div className="kv"><span>Build (nested / crossover worst)</span>
              <b style={{ color: b.buildX > p.wbChanH ? "#DC2626" : "#059669" }}>{b.build.toFixed(2)} / {b.buildX.toFixed(2)} of {p.wbChanH} mm</b></div>
            <div className="kv"><span>Coil heads (per end) · stack fit</span>
              <b>{dl9(b.Lhead)} · {dl9(b.stackFit)} vs {p.skew > 0 ? "skew diagonal" : "stack"} {dl9(b.stkReq)}
                <span style={{ color: b.stackFit < b.stkReq - 0.5 ? "#DC2626" : Math.abs(b.stackFit - b.stkReq) < Math.max(6, 0.15 * b.stkReq) ? "#059669" : "#B45309" }}> {b.stackFit < b.stkReq - 0.5 ? "✗ short" : Math.abs(b.stackFit - b.stkReq) < Math.max(6, 0.15 * b.stkReq) ? "✓" : "loose"}</span></b></div>
            <div className="kv"><span>Coil ID / OD · channel capacity</span><b>{dl9(p.wbArborD)} / {dl9(b.coilOD)} · ~{b.capCh} turns</b></div>
            <div className="kv"><span>Mean turn · wire per coil</span><b>{dl9(b.MLT)} · {b.lenCoil.toFixed(2)} m</b></div>
            <div className="kv"><span>String: {p.wbCoils} coils + jumpers</span><b>{b.lenString.toFixed(2)} m · {(b.mCu * 1000).toFixed(0)} g Cu</b></div>
            <div className="kv"><span>R per coil (20 / {p.Tcu} °C)</span><b>{fmt(b.R20c, 3)} / {fmt(b.R20c * b.RhotF(p.Tcu), 3)} Ω</b></div>
            <div className="kv"><span>R string, series (20 / {p.Tcu} °C)</span><b>{fmt(b.R20s, 3)} / {fmt(b.R20s * b.RhotF(p.Tcu), 3)} Ω</b></div>
            {b.kRw !== 1 && <div className="kv"><span>R compensated · bench cal ×{fmt(b.kRw, 4)}</span>
              <b>{fmt(b.R20cC, 3)} coil / {fmt(b.R20sC, 3)} string @ 20 °C</b></div>}
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
              {b.perStrand
                ? "Wild multi-strand modeled per-strand: hand-fed strands settle individually into near-hex packing (0.866 nest ×1.04 scramble) — bench-validated against a wound 4-coil stick; the round-bundle model overstated build and R. "
                : "Wild wind modeled: the first layer lays clean on the arbor, then crossovers kill the row nesting (~1.0·wire Ø stacking + 8% bump vs 0.866 nested) and channel capacity derates ×0.8. "}
              With a known tool, R is set by the arbor — coil-head edits redistribute the fixed perimeter between legs and heads (watch stack fit); to size a tool from heads and target R, use Coil spec → tool dims.</div>}
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
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Bench calibration</h2>
          <Num label="Measured string R (coils + jumpers)" unit="Ω" v={p.wbMR} set={s("wbMR")} step={0.01} min={0} />
          <Num label="Measured at (copper temp)" unit="°C" v={p.wbMRTemp} set={s("wbMRTemp")} step={1} />
          {p.wbMR > 0 && (
            <div className="tbl" style={{ marginTop: 6 }}>
              <div className="kv"><span>Predicted at {p.wbMRTemp} °C · measured</span><b>{fmt(b.predAtMeasT, 3)} · {fmt(p.wbMR, 3)} Ω</b></div>
              <div className="kv"><span>Wind factor (measured / predicted)</span>
                <b style={{ color: Math.abs(b.kRw - 1) > 0.1 ? "#DC2626" : "#059669" }}>×{fmt(b.kRw, 4)} ({b.kRw >= 1 ? "+" : ""}{fmt((b.kRw - 1) * 100, 1)}%)</b></div>
            </div>
          )}
          <div className="note">
            0 = off. The factor captures your shop's actual lay vs the model on THIS tool; it compensates the
            R rows above and scales the Coil-spec solve so target-R arbors track your real coils. Enter the
            string reading straight off the meter with its copper temperature — the 0.393%/°C correction is applied.
            {p.wbMR > 0 && Math.abs(b.kRw - 1) > 0.1 ? " A factor this far from 1.0 usually means a units or temperature mismatch, not a real wind difference." : ""}
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
  // v60.6 (Grok): the "tab not opened yet" fallback merged the starting preset over the
  // CURRENT design — the same contamination class the preset fix closed (a dirty PM's
  // TcuMax/Rext leaked into the composed brake). Defaults + preset, like everywhere else.
  const motorP = typeMem.current[motorT]
    ? { ...typeMem.current[motorT], motorType: motorT }
    : { ...DEFAULT_P, ...(typeDefaults[motorT] ? PRESETS[typeDefaults[motorT]] : {}), motorType: motorT };
  const mr = React.useMemo(() => computeDesign(motorP), [JSON.stringify(motorP)]);
  const brakeP = typeMem.current.brake
    ? { ...typeMem.current.brake, motorType: "brake" }
    : { ...DEFAULT_P, ...(PRESETS[typeDefaults.brake] || {}), motorType: "brake" };
  const withBrk = p.actBrake === "yes";
  const br = React.useMemo(() => (withBrk ? computeDesign(brakeP) : null), [JSON.stringify(brakeP), withBrk]);
  // v60.5: ONE efficiency for one gearhead. Composition runs twice: a first pass fixes
  // N/stages so the train can be synthesized, then the final composition carries the
  // synthesized train's detailed efficiency (unless the user override is set) — the
  // torque curve, peak, and the gear card can no longer disagree.
  const cfg0 = { type: p.gbType, ratio: p.gbRatio, stages: p.gbStages, effOv: p.gbEff, brg: p.gbBrg };
  const act0 = composeActuator(mr, br, cfg0);
  const gtEnv = useMemo(() => {
    if (act0.fail) return null;
    const env0 = actEnvelope(motorP, withBrk ? brakeP : null, act0, withBrk, p.gbOD, p.gbLen);
    return { env: env0, gt: designGearTrain(p, act0, env0.gOD, env0.Lg) };
  }, [p, act0, motorP, brakeP, withBrk]);
  const gtAll = gtEnv ? gtEnv.gt : null;
  const act = gtAll && !(p.gbEff > 0)
    ? composeActuator(mr, br, { ...cfg0, effDet: gtAll.effF })
    : act0;
  const gtLim = gtAll && Number.isFinite(gtAll.TmaxOut) ? { T: gtAll.TmaxOut, label: "tooth yield" } : null;
  const rTS = act.fail ? null : { curve: act.curve, noLoad: act.noLoad, op: act.op, TstallW: 0 };
  // v60.6 (Grok): the composed I-T chart needs the MOTOR saturation curve — without it the
  // peak marker sat at Ipk*kIT instead of the drive limit
  const rIT = act.fail ? null : { Kt: mr.Kt * act.N * act.eta, peakT: act.peakT, op: act.op, Iph: mr.Iph, kIT: mr.kIT, satCurve: mr.satCurve };
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
        {!act.fail && gtEnv && (() => {
          const env9 = gtEnv.env;                      // one computation — the cards can never disagree
          const gt = gtEnv.gt;
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
                {/* v60.6 (Codex): use the SAME eta the curve uses, and the output-equivalent
                    loss form T_out·(1/η − 1) — the old line mixed the synthesized effF with a
                    curve built on a different eta, and (1−η) understates referred loss */}
                <b>{(act.peakT * (1 / Math.max(act.eta, 0.05) - 1)).toFixed(2)} N·m of {act.peakT.toFixed(2)}</b></div>
              {Number.isFinite(gt.TmaxOut) && <div className="kv"><span>{gt.stages[0] && gt.stages[0].harmonic ? "Momentary peak (ratcheting limit, size class)" : `Tooth-yield torque cap (Lewis, stage ${gt.limStage})`}</span>
                <b style={{ color: act.peakT > gt.TmaxOut ? "#DC2626" : act.peakT > 0.6 * gt.TmaxOut ? "#D97706" : "#059669" }}>{gt.TmaxOut.toFixed(1)} N·m · margin ×{(gt.TmaxOut / Math.max(act.peakT, 1e-6)).toFixed(1)} vs peak</b></div>}
              {act.op && (() => {                                       /* A3: gear heat into the housing */
                const Pout = (act.op.T * act.op.n * 2 * Math.PI) / 60;
                const Pg = Pout * (1 / Math.max(act.eta, 0.05) - 1);   // v60.6: heat follows the eta the curve used
                const A9 = Math.PI * (env9.gOD / 1000) * (env9.Lg / 1000) + (Math.PI / 2) * Math.pow(env9.gOD / 1000, 2);
                const dT = Pg / (12 * Math.max(A9, 1e-4));               /* natural convection h ~ 12 */
                return <>
                  <div className="kv"><span>Gear dissipation at the operating point</span>
                    <b>{Pg.toFixed(1)} W · housing ΔT ≈ {dT.toFixed(0)} °C (natural conv. est.)</b></div>
                  {dT > 40 && <div className="warn">Gearhead runs ≈ {dT.toFixed(0)} °C over ambient at this point — sealed-housing heat is NOT in the motor thermal model; derate continuous torque or add conduction to the mount.</div>}
                </>;
              })()}
              {gt.KvMax > 1.15 && <div className="note">Dynamic factor Kv up to {gt.KvMax.toFixed(2)} applied at input-stage pitch-line speed — higher AGMA quality reduces it up to Q11 (this Kv form is capped there; Q13 tightens backlash only).</div>}
              {gt.w.map((w9, i9) => <div className="warn" key={i9}>{w9}</div>)}
            </div>
            <div className="note">
              Synthesized from gearhead Ø, {gt.agmaQ}, {gt.presAng}° pressure angle, {gt.gbMat} ({gt.sigAllow} MPa allowable){gt.nP && gt.stages[0] && gt.stages[0].Zr ? `, ${gt.nP} planets (ring–sun assembly constraint enforced)` : ""}.
              Backlash: per-mesh allowance reflected through downstream ratios — the output stage dominates.
              Efficiency: mesh sliding (tooth-count dependent) + seal/churning drag; back-drive reverses the
              torque-proportional losses (η_b ≈ 2 − 1/η_f per stage). Tooth cap is Lewis bending at the
              selected material's {gt.sigAllow} MPa allowable ({gt.gbMat}) — first-order, verify critical
              designs against AGMA 2001 or the catalog.
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
            <ActuatorIso motorP={motorP} brakeP={withBrk ? brakeP : null} act={act} withBrk={withBrk} us={us} gbOD={p.gbOD} gbLen={p.gbLen} mnt={{ style: p.mntStyle, thread: p.mntThread, n: p.mntN, bcd: p.mntBCD, flgOD: p.mntFlgOD, flgT: p.mntFlgT, dir: p.mntDir, gap: p.mntGap, pilotOD: p.mntPilotOD, pilotT: p.mntPilotT, osh: { type: p.oshType, od: p.oshOD, len: p.oshLen, feat: p.oshFeat, pin: p.oshPinD } }} fin={{ gb: p.finGb, mot: p.finMot, brk: p.finBrk }} gt={gtAll} />
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
                <div className="kv"><span>Efficiency η (per stage / total)</span>
                  <b>{(Math.pow(act.eta, 1 / Math.max(act.st, 1)) * 100).toFixed(1)}% / {(act.eta * 100).toFixed(1)}%
                    {act.etaSrc === "override" ? " (override)" : act.etaSrc === "synthesized" ? " (synthesized train)" : " (catalog fallback)"}</b></div>
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

/* ---- the canonical default parameter set. Extracted to module scope (v60.5) because
   presets must apply onto THESE defaults, not onto whatever design was loaded before:
   the old `{...current, ...preset}` merge let every key a preset omits leak through —
   an active bench calibration scaled the "loaded preset" ×1.25, a stale slotR carved
   fillets into a preset that has none, a stale loadMode moved its rated point. Same
   contamination applied to the first visit of a machine type. Gates already used the
   defaults+preset semantic (tools/_base.json); the app now matches it. ---- */
const DEFAULT_P = {
    slots: 36, poles: 8, statorOD: 150, statorID: 90, rotorOD: 89,
    yoke: 12, toothW: 5.4, slotOpen: 2.5, tipH: 1.5, stackL: 80, liner: 0.25, slotR: 0, skew: 0,
    pattern: "lap", layers: 2, span: 0, turns: 2, awg: 14, strands: 2, paths: 1, insBuild: "Heavy", turnBasis: "coil",
    conn: "wye", vref: "ll", motorType: "pm", ctrl: "foc", sense: "hall",
    mag: "N45SH", magT: 4, poleArc: 85, Top: 60,
    endMode: "auto", headH: 15, bobShape: "race", bobD: 30, bobWall: 1, bobWin: 16,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", shaftD: 15,
    loadMode: "J", Irate: 5, bdRpm: 1800, Tcu: 100, Rext: 20,
    Tamb: 25, cooling: "Open air", TcuMax: 130, Tmin: -40, dutyPct: 100, cycleT: 10, brkEco: 100,
    mR: 0, mL: 0, mKe: 0, mNl: 0, mBpp: 0, mBrms: 0, mBf: 0, mBn: 0, calTn: 0, calTt: 0, calTs: 0,
    calOn: "no", calKR: 1, calKL: 1, calKKe: 1, calKKt: 1, calTd: 0, calV: 2, klOv: 0,
    costCu: 0, costFe: 0, costMag: 0, brScale: 1, tolGap: 0.05, tolMag: 0.1, tolBr: 3,
    calKRth: 1, mDT: 0, mPw: 0, pulseI: 0, msJl: 0, msN: 1, msAng: 90, msT: 0.2, msDwell: 0.3,
    gbType: "Planetary", gbRatio: 10, gbStages: 1, gbEff: 0, gbOD: 0, gbLen: 0, actMotor: "pm", actBrake: "yes",
    agmaQ: "Q9", gbMat: "Carburized 8620/9310 (58\u201362 HRC)", presAng: 20, nPlanets: 3, gbBrg: "radial",
    oshType: "key", oshOD: 0, oshLen: 0, oshFeat: 0, oshPinD: 0,
    mntStyle: "face", mntThread: "4-40", mntN: 4, mntBCD: 0, mntFlgOD: 0, mntFlgT: 3, mntDir: "fwd", mntGap: 5, mntPilotOD: 0, mntPilotT: 0,
    finGb: "Matte steel", finMot: "Aluminum", finBrk: "Black anodized",
    wbArborD: 8, wbChanW: 6, wbChanH: 5, wbFlange: 1.2, wbCoils: 6, wbJump: 25, wbSides: 2, wbMode: "fwd", wbRt: 0, wbRtip: 0.8, wbLay: "wild", wbHead: 0, wbMR: 0, wbMRTemp: 23,
    brushV: 1.5, latmWind: 2,
    brkSprFree: 23.3, brkSprEng: 18.3, brkMu: 0.40, brkMuD: 0.32, brkFaces: 2, brkStroke: 0.3,
    brkBore: 26, brkPole: 6, brkArm: 6, brkFeScale: 100, brkK: 40, brkSpringN: 6, brkRo: 27, brkRi: 18, brkMat: "Organic (resin-bonded)",
    brkPktID: 48, brkBossOD: 38, brkPktD: 18, brkBobID: 40.2, brkBobOD: 47, brkBobL: 15,
    stpNr: 50, stpKind: "hybrid", stpPP: 12, stpWire: "bip-ser", stpOn: 2, stpHubD: 0, stpThruD: 0, latmSect: 4, latmSpan: 60, latmTravel: 45,
    rotorBars: 28, barA: 60, ringA: 120, barMat: "Cast aluminum", barH: 0,
    Vll: 400, Vdc: 48, Imax: 40, freq: 50, J: 5.5, Bg: 0.85, seq: "ABC",
};

export default function MotorDesigner() {
  const [p, setP] = useState(DEFAULT_P);
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
    // v60.9: thermal capture — a measured steady ΔT at a known loss scales the whole
    // 2-node network; valid for THIS mount and cooling only (the applied-factors table
    // says so). Clamped 0.2–5 like the engine.
    let kRth = 1;
    if (p.mDT > 0 && p.mPw > 0 && r0.therm && r0.therm.Rth > 0)
      kRth = Math.min(Math.max((p.mDT / p.mPw) / r0.therm.Rth, 0.2), 5);
    setP((o) => ({ ...o, calOn: "yes", calV: 2, calKR: +kR.toFixed(4), calKL: +kL.toFixed(4),
      calKKe: +kKe.toFixed(4), calKKt: +kKt.toFixed(4), calTd: +Td.toFixed(5), calKRth: +kRth.toFixed(4) }));
    setIoMsg("Calibration captured — the model now tracks the bench, and design tweaks predict the real motor's response." + (kRth !== 1 ? " Thermal Rth scaled ×" + kRth.toFixed(3) + " (valid for this mount/cooling)." : ""));
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
    // v60.5: presets apply onto the DEFAULTS, not the current design — every key a preset
    // omits used to leak through from whatever was loaded before (active bench calibration
    // scaled Kt ×1.25 silently; a stale slotR carved fillets into a preset that has none).
    // This is the same defaults+preset semantic the gates have always used.
    const hadCal = p.calOn === "yes";
    setP({ ...DEFAULT_P, ...pr });
    setIoMsg("Loaded preset: " + name + ". All values are starting points — tune and verify."
      + (hadCal && pr.calOn !== "yes" ? " Bench calibration was cleared (it belonged to the previous design)." : ""));
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
      // first visit of a type: defaults + its starting preset (v60.5 — merging over the
      // previous machine's state leaked its stray keys into the new type)
      setP({ ...DEFAULT_P, ...PRESETS[TYPE_DEFAULTS[nt]] });
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
  // efficiency map + drive cycle (engine-computed; null for machine types without a curve)
  const emap = useMemo(() => efficiencyMap(p, r, {}), [p, r]);
  // field solve is ON DEMAND — it is a ~0.2-1 s nonlinear solve, not something to run
  // on every keystroke. `fieldOf` records the parameters it was solved for so the card
  // can say plainly when the design has moved on since.
  // design exploration: sweep one input, and rank which inputs move a chosen metric
  const [swKey, setSwKey] = useState("magT");
  const [swSpan, setSwSpan] = useState(40);
  const [swMets, setSwMets] = useState(["Kt", "peakT", "eta"]);
  const [snMetric, setSnMetric] = useState("Kt");
  const [snPct, setSnPct] = useState(10);
  const SW_LEN_KEYS = ["statorOD", "statorID", "rotorOD", "yoke", "toothW", "slotOpen", "tipH", "stackL", "liner", "magT", "shaftD"];
  const SW_KEYS = [...SW_LEN_KEYS, "turns", "awg", "strands", "poleArc", "Top", "Vdc", "Imax", "J", "skew", "slots", "poles"];
  const sweep = useMemo(() => {
    if (typeof p[swKey] !== "number" || !Number.isFinite(p[swKey]) || p[swKey] === 0) return null;
    const f9 = Math.min(Math.max(swSpan, 5), 90) / 100;
    return sweepDesign(p, swKey, p[swKey] * (1 - f9), p[swKey] * (1 + f9), 41, swMets);
  }, [p, swKey, swSpan, swMets]);
  const tornado = useMemo(() => sensitivity(p, SW_KEYS, snPct, snMetric), [p, snPct, snMetric]);
  // datasheet header facts — derived, never entered, so a printed sheet always matches
  // the design that produced it
  const TYPE_NAME = { pm: "BLDC / PMSM", brushed: "Brushed PM DC", latm: "Limited-angle torquer",
    stepper: "Stepper", induction: "Squirrel-cage ACIM", brake: "Spring-applied brake",
    actuator: "Actuator assembly", bobbin: "Winding tooling" };
  const sheetTitle = `${TYPE_NAME[p.motorType] || p.motorType} · Ø${lenS(p.statorOD)} ${lu} × ${lenS(p.stackL)} ${lu}`;
  const sheetSub = `MotrWorks design sheet · ${p.slots} slots / ${p.poles} poles · ${p.mag}${p.skew > 0 ? ` · ${p.skew}° skew` : ""}`
    + ` · ${p.statorMat} stator${p.calOn === "yes" ? " · BENCH CALIBRATED" : " · analytical model"}`;
  const sheetFacts = r.err.length ? [["Status", `${r.err.length} error(s) — sheet is not valid`]] : [
    ["Kt", `${fmt(r.Kt, 4)} N·m/A`],
    ["Ke", keS(r.Ke)],
    [p.motorType === "latm" || p.motorType === "brake" ? "R coil (20 °C)"
      : p.motorType === "stepper" ? "R phase (20 °C)" : "R L-L", `${fmt(r.Rll, 4)} Ω`],
    ["L L-L", `${fmt(r.Lll * 1000, 3)} mH`],
    ["No-load", `${fmt(r.noLoad, 0)} rpm`],
    ["Peak torque", tqS(r.peakT)],
    ...(r.op ? [["Rated", `${fmt(r.op.n, 0)} rpm · ${tqS(r.op.T)}`]] : []),
    ...(emap && emap.best ? [["Peak η", `${(emap.best.eta * 100).toFixed(1)}%`]] : []),
    ...(r.therm ? [["Winding", `${Math.round(r.therm.Tcu)} °C`]] : []),
    ["Fill", `${fmt(r.fillGross * 100, 0)}%`],
  ];
  const [field, setField] = useState(null);
  const [fieldOf, setFieldOf] = useState(null);
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldRes, setFieldRes] = useState("normal");
  const fieldStale = field && fieldOf !== JSON.stringify(p);
  const runField = () => {
    setFieldBusy(true);
    // yield a frame so the button can show its working state before the solve blocks
    setTimeout(() => {
      // Normal/Fine verify themselves against a ~1.4x finer mesh (roughly doubles the
      // time and is worth it): a gate can only prove convergence for the designs it
      // tested, and at least one preset needed more iteration than the tested ones.
      const cfg = fieldRes === "fine" ? { nr: 76, nth: 432, verify: true }
        : fieldRes === "fast" ? { nr: 36, nth: 216, quick: true } : { nr: 56, nth: 288, verify: true };
      const t0 = Date.now();
      const F = fieldStudy(p, r, cfg);
      setField(F && !F.err ? { ...F, ms: Date.now() - t0 } : F);
      setFieldOf(JSON.stringify(p));
      setFieldBusy(false);
    }, 30);
  };
  // v61: loaded field study (winding currents + demag map) — separate opt-in state
  const [fieldL, setFieldL] = useState(null);
  const [fieldLBusy, setFieldLBusy] = useState(false);
  const [fieldLI, setFieldLI] = useState(0);           // 0 = rated
  const fieldLStale = fieldL && fieldL.of !== JSON.stringify(p);
  const runFieldL = () => {
    setFieldLBusy(true);
    setTimeout(() => {
      const t0 = Date.now();
      const F = fieldStudyLoaded(p, r, { I: fieldLI > 0 ? fieldLI : 0, nAng: 9 });
      setFieldL(F && !F.err ? { ...F, ms: Date.now() - t0, of: JSON.stringify(p) } : F);
      setFieldLBusy(false);
    }, 30);
  };
  const [cycle, setCycle] = useState(null);
  const [cycMsg, setCycMsg] = useState("");
  const dcyc = useMemo(() => (cycle ? driveCycle(p, r, cycle) : null), [p, r, cycle]);
  const importCycle = (e9) => {
    const f9 = e9.target.files && e9.target.files[0];
    e9.target.value = "";
    if (!f9) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const rows = String(rd.result).split(/\r?\n/).map((L9) => L9.trim()).filter(Boolean);
        const out = [];
        for (const L9 of rows) {
          const c9 = L9.split(/[,;\t]/).map((x9) => parseFloat(x9));
          if (c9.length < 3 || !Number.isFinite(c9[0]) || !Number.isFinite(c9[1]) || !Number.isFinite(c9[2])) continue; // header/blank
          out.push({ t: c9[0], n: c9[1], T: c9[2] });
        }
        if (out.length < 2) { setCycle(null); setCycMsg(`Could not read ${f9.name} — expected rows of time_s, speed_rpm, torque_Nm.`); return; }
        setCycle(out);
        setCycMsg(`${f9.name}: ${out.length} samples over ${(out[out.length - 1].t - out[0].t).toFixed(1)} s.`);
      } catch { setCycle(null); setCycMsg("Could not parse that file."); }
    };
    rd.onerror = () => { setCycle(null); setCycMsg("Could not read that file."); };
    rd.readAsText(f9);
  };
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
  /* ---- design library: named snapshots kept locally, with a live comparison of the
     shortlist against the current design. Same guarded-localStorage posture as the
     autosave — nothing leaves the machine, and a blocked store degrades to "off"
     rather than throwing. Entries hold the parameter set only; every number shown is
     recomputed from the engine, so a stored design can never carry stale results. ---- */
  const LIBK = "motrworks-library-v1";
  const [lib, setLib] = useState([]);
  const [libSel, setLibSel] = useState([]);
  const [libName, setLibName] = useState("");
  const [libMsg, setLibMsg] = useState("");
  useEffect(() => {
    if (!lsOK) return;
    try {
      const j = JSON.parse(localStorage.getItem(LIBK) || "[]");
      if (Array.isArray(j)) setLib(j.filter((e9) => e9 && e9.name && e9.design));
    } catch { /* corrupt library — start empty rather than block the app */ }
  }, [lsOK]);
  const libWrite = (next) => {
    setLib(next);
    if (!lsOK) { setLibMsg("Local storage is blocked — the library is session-only."); return; }
    try { localStorage.setItem(LIBK, JSON.stringify(next)); }
    catch { setLibMsg("Could not save — local storage is full."); }
  };
  const libSave = () => {
    const nm = (libName || "").trim() || `${p.motorType} ${p.slots}s${p.poles}p ${Math.round(p.statorOD)}mm`;
    const entry = { name: nm, ts: Date.now(), design: { ...p } };
    const next = [entry, ...lib.filter((e9) => e9.name !== nm)].slice(0, 40);
    libWrite(next);
    setLibName("");
    setLibMsg(`Saved “${nm}”.`);
  };
  // v60.6 (Grok): calibration schema v2. Pre-v60.5 captures folded magnetic saturation
  // into calKKt; the engine now applies sat(I) itself, so replaying an old capture knocks
  // torque down twice. Any stored design with calOn but no calV >= 2 gets its calibration
  // cleared with a recapture notice instead of silently double-applying.
  const CAL_CLEAR = { calOn: "no", calKR: 1, calKL: 1, calKKe: 1, calKKt: 1, calTd: 0, calKRth: 1, calV: 2 };
  const legacyCal = (src) => !!src && src.calOn === "yes" && !(src.calV >= 2);
  const libLoad = (e9) => {
    // v60.6 (Codex): load onto DEFAULTS, not the current design — a library entry saved
    // before a field existed would otherwise inherit the current design's value for it
    // (the same contamination class the preset fix closed)
    const merged = { ...DEFAULT_P };
    for (const k9 of Object.keys(merged)) if (k9 in e9.design && typeof e9.design[k9] === typeof merged[k9]) merged[k9] = e9.design[k9];
    if (legacyCal(e9.design)) { Object.assign(merged, CAL_CLEAR); setLibMsg(`Loaded with calibration cleared (captured before the saturation model changed) - recapture from the bench numbers.`); setP(merged); return; }
    setP(merged);
    setLibMsg(`Loaded “${e9.name}”.`);
  };
  const libDel = (nm) => { libWrite(lib.filter((e9) => e9.name !== nm)); setLibMsg(`Removed “${nm}”.`); };
  const libRows = useMemo(() => libSel.map((nm) => {
    const e9 = lib.find((x9) => x9.name === nm);
    if (!e9) return null;
    const rr = computeDesign({ ...DEFAULT_P, ...e9.design, ...(legacyCal(e9.design) ? CAL_CLEAR : {}) }); // v60.6: compare on defaults, not the dirty current state; legacy cal cleared
    return { name: nm, r: rr };
  }).filter(Boolean), [libSel, lib, p]);
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
    const legacy9 = legacyCal(restore.design);
    setP((o) => {
      const n = { ...o };
      Object.keys(o).forEach((k) => { if (k in restore.design && typeof restore.design[k] === typeof o[k]) n[k] = restore.design[k]; });
      if (legacy9) Object.assign(n, CAL_CLEAR);
      return n;
    });
    if (restore.us === "in" || restore.us === "mm") setUs(restore.us);
    setRestore(null);
    setIoMsg("Autosaved session restored." + (legacy9 ? " Calibration was cleared (captured before the saturation model changed) — recapture from the bench numbers." : ""));
  };
  const applyImport = (src, fname, fileUnits) => {
    if (fileUnits === "in" || fileUnits === "mm") setUs(fileUnits);
    setPendImp(null);
    setP((o) => {
          // v60.6 (Grok): a file that switches machine type starts from DEFAULTS — merging a
          // stepper file over a dirty PM design leaked every key the file didn't carry.
          // Same-type imports stay a partial merge so legacy files remain loadable.
          const base9 = typeof src.motorType === "string" && src.motorType !== o.motorType ? DEFAULT_P : o;
          const n = { ...base9 };
          let hits = 0;
          Object.keys(n).forEach((k) => {
            if (k in src && typeof src[k] === typeof n[k]) { n[k] = src[k]; hits++; }
          });
          const legacy9 = legacyCal(src);
          if (legacy9) Object.assign(n, CAL_CLEAR);
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
          setIoMsg(hits ? `Imported ${fname} (${hits} parameters).${migrated ? " Bobbin fields migrated to winding-window semantics (start unchanged, max = pocket − 1 mm)." : ""}${legacy9 ? " Calibration was cleared (captured before the saturation model changed) — recapture from the bench numbers." : ""}` : "No recognizable parameters in that file.");
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
        /* ---- datasheet: the on-screen tool IS the document, printed. The input
           column, controls, and file pickers drop out; the results column and the
           right-hand summary stack into one measure, cards never split across a
           page, and a title block (screen-hidden) leads. ---- */
        .sheetHdr{display:none}
        @media print{
          @page{margin:14mm}
          .app{padding:0;background:#fff}
          header.hd,.tabs,.iobar,.wiz,button,input[type=file],label.btn,details{display:none !important}
          .grid{display:block}
          .grid > div:first-child{display:none}
          .sheetHdr{display:block;margin:0 0 10px;border-bottom:2px solid ${DKINK};padding-bottom:8px}
          .sheetHdr h1{font-size:1.25rem;margin:0 0 2px;color:${DKINK}}
          .sheetHdr .sub{font-size:.78rem;color:${CREAM_DIM}}
          .sheetHdr .kvs{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:6px;font-size:.74rem}
          .sheetHdr .kvs b{font-family:'IBM Plex Mono',monospace}
          .card{break-inside:avoid;page-break-inside:avoid;box-shadow:none;border:1px solid #CBD5E1;margin-bottom:10px}
          .chart{max-width:520px}
          .note,.hint{color:#475569}
          .warn{border:1px solid #CBD5E1;background:#fff}
        }
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

      {/* datasheet title block — hidden on screen, leads the printed sheet */}
      <div className="sheetHdr">
        <h1>{sheetTitle}</h1>
        <div className="sub">{sheetSub}</div>
        <div className="kvs">
          {sheetFacts.map((f9) => <span key={f9[0]}>{f9[0]} <b>{f9[1]}</b></span>)}
        </div>
      </div>

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
                      <button className="btn ghost" onClick={() => window.print()}>Datasheet ⎙</button>
                    </div>
                    <div className="note" style={{ marginTop: 2 }}>
                      The datasheet is this page printed: a title block with the derived constants,
                      then the drawings, curves and checks — inputs, controls and file pickers drop
                      out, and cards are kept whole across page breaks. Print to PDF to share it.
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
            {!latmM && !stpM && !brkM && <Num label="Stack skew end-to-end (0 = straight)" unit="°" v={p.skew} set={s("skew")} step={0.5} min={0} />}
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
                <Num label="Bar depth (0 = auto 3:1)" unit="mm" v={p.barH} set={s("barH")} step={0.5} min={0} />
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

          {/* v61: Cut Inspection — true-scale conductor cut with per-coil shades + legend */}
          {pm && !r.err.length && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Cut inspection (true-scale conductors)</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-cutinspect", "cut-inspection.png")}>PNG ⤓</button>
              </div>
              <CutInspection p={p} r={r} us={us} />
            </div>
          )}

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
                {r.acim && Number.isFinite(r.acim.xiLR) && (
                  <div className="kv"><span>Deep-bar at start (bar {fmt(r.acim.hBar, 1)}×{fmt(r.acim.wBar, 1)} mm{r.acim.barHAuto ? ", est. 3:1" : ""})</span>
                    <b>ξ {fmt(r.acim.xiLR, 2)} · R×{fmt(r.acim.krLR, 2)} · X×{fmt(r.acim.kxLR, 2)}</b></div>
                )}
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
                : "Single-cage Thevenin equivalent circuit: rotor resistance computed from bar count, bar & end-ring areas, and material; slip and breakdown fall out rather than being entered. v60.7: rotor leakage X2 comes from the bar's rectangular-slot permeance (h/3w, bar depth entered or estimated at 3:1 aspect) plus a first-order 0.5 constant for end-ring/differential/zigzag, and deep-bar skin effect scales bar R (up) and bar permeance (down) with slip — locked-rotor torque and current now see the crowded bar. The 0.5 leakage floor and the auto bar aspect are first-order disclosed estimates."}
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

          <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Design library</h2>
            <div className="iobar">
              <input type="text" value={libName} placeholder="name this design"
                onChange={(e9) => setLibName(e9.target.value)}
                style={{ flex: "1 1 150px", minWidth: 120, padding: "6px 8px", border: "1px solid #CBD5E1",
                  borderRadius: 8, font: "inherit", fontSize: ".78rem" }} />
              <button className="btn" onClick={libSave}>Save current</button>
            </div>
            {libMsg && <div className="iomsg">{libMsg}</div>}
            {!lib.length && <div className="note" style={{ marginTop: 6 }}>
              Nothing saved yet. Saved designs are kept on this machine only, and store the
              parameters — every number in the comparison is recomputed by the engine, so an
              entry can never show stale results.
            </div>}
            {lib.length > 0 && (
              <div className="tbl" style={{ marginTop: 8 }}>
                {lib.map((e9) => (
                  <div className="kv" key={e9.name}>
                    <span>
                      <input type="checkbox" checked={libSel.indexOf(e9.name) >= 0}
                        onChange={() => setLibSel((s9) => (s9.indexOf(e9.name) >= 0 ? s9.filter((x9) => x9 !== e9.name) : [...s9, e9.name].slice(0, 4)))}
                        style={{ marginRight: 6 }} />
                      {e9.name}
                    </span>
                    <b>
                      <button className="btn mini ghost" onClick={() => libLoad(e9)}>Load</button>{" "}
                      <button className="btn mini ghost" onClick={() => libDel(e9.name)}>✕</button>
                    </b>
                  </div>
                ))}
              </div>
            )}
            {libRows.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Comparison (checked vs current)</h2>
                <div className="tbl" style={{ overflowX: "auto" }}>
                  {[["Kt", (x9) => fmt(x9.Kt, 4), "N·m/A"],
                    ["No-load", (x9) => fmt(x9.noLoad, 0), "rpm"],
                    ["Peak torque", (x9) => tqS(x9.peakT), ""],
                    ["Efficiency", (x9) => fmt(x9.eta * 100, 1), "%"],
                    ["R winding 20 °C", (x9) => fmt(x9.Rll, 4), "Ω"],
                    ["Winding temp", (x9) => (x9.therm ? Math.round(x9.therm.Tcu) : "—"), "°C"],
                    ["Slot fill", (x9) => fmt(x9.fillGross * 100, 0), "%"]].map(([lab, f9, u9]) => (
                    <div className="kv" key={lab} style={{ alignItems: "baseline" }}>
                      <span>{lab}{u9 ? ` (${u9})` : ""}</span>
                      <b style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span style={{ opacity: 0.65 }}>{f9(r)} now</span>
                        {libRows.map((row) => <span key={row.name}>{row.r.err.length ? "err" : f9(row.r)}</span>)}
                      </b>
                    </div>
                  ))}
                  <div className="kv"><span style={{ opacity: 0.7 }}>columns</span>
                    <b style={{ fontWeight: 400, opacity: 0.7 }}>now · {libRows.map((x9) => x9.name).join(" · ")}</b></div>
                </div>
              </>
            )}
          </div>

          {/* v60.8: mass / rotor inertia / material bill — active EM parts only */}
          {!r.err.length && r.bom && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <h2>Mass, inertia & material bill</h2>
              {Number.isFinite(r.bom.mMag) && r.bom.mMag > 0 && <div className="kv"><span>Magnet mass</span><b>{fmt(r.bom.mMag * 1000, 1)} g{p.costMag > 0 ? ` · $${fmt(r.bom.mMag * p.costMag, 2)}` : ""}</b></div>}
              <div className="kv"><span>Core (lamination) mass</span><b>{fmt(r.coreMass * 1000, 0)} g{p.costFe > 0 ? ` · $${fmt(r.coreMass * p.costFe, 2)}` : ""}</b></div>
              {r.therm && Number.isFinite(r.therm.mCu) && <div className="kv"><span>Winding copper mass</span><b>{fmt(r.therm.mCu * 1000, 0)} g{p.costCu > 0 ? ` · $${fmt(r.therm.mCu * p.costCu, 2)}` : ""}</b></div>}
              <div className="kv"><span>Active mass total</span>
                <b>{fmt(((r.bom.mMag || 0) + r.coreMass + (r.therm && Number.isFinite(r.therm.mCu) ? r.therm.mCu : 0) + (r.bom.mHub || 0) + (r.bom.mShaftIn || 0) + (r.bom.mLam || 0)) * 1000, 0)} g
                {(p.costCu > 0 || p.costFe > 0 || p.costMag > 0) ? ` · $${fmt((r.bom.mMag || 0) * Math.max(p.costMag, 0) + (r.coreMass + (r.bom.mHub || 0) + (r.bom.mLam || 0) + (r.bom.mShaftIn || 0)) * Math.max(p.costFe, 0) + (r.therm && Number.isFinite(r.therm.mCu) ? r.therm.mCu : 0) * Math.max(p.costCu, 0), 2)} material` : ""}</b></div>
              {Number.isFinite(r.bom.Jr) && <div className="kv"><span>Rotor inertia Jr</span><b>{(r.bom.Jr * 1e7).toFixed(2)} g·cm² ({r.bom.Jr.toExponential(2)} kg·m²)</b></div>}
              <div className="iobar" style={{ marginTop: 6 }}>
                <Num label="Cu $/kg (0 = hide)" v={p.costCu} set={s("costCu")} step={1} min={0} />
                <Num label="Steel $/kg" v={p.costFe} set={s("costFe")} step={0.5} min={0} />
                <Num label="Magnet $/kg" v={p.costMag} set={s("costMag")} step={5} min={0} />
              </div>
              <div className="note">Active electromagnetic parts only — no housing, bearings, commutator, encoder, leads, or gearhead. {r.bom.note ? `(${r.bom.note}.)` : ""} Costs are user-entered material $/kg, not a sourcing quote.</div>
            </div>
          )}

          {/* v60.8: controller / application-note block — pass-through of quantities the
              results column already certifies, in drive-vendor units, copyable. */}
          {!r.err.length && (pm || brM) && (() => {
            const gcd9 = (a9, b9) => (b9 ? gcd9(b9, a9 % b9) : a9);
            const lcm9 = (a9, b9) => (a9 * b9) / Math.max(gcd9(a9, b9), 1);
            const cogPer = r.Ns > 0 && r.poles > 0 ? 360 / lcm9(r.Ns, r.poles) : 0;
            const RllHot = r.Rphase > 0 ? r.Rhot * (r.Rll / r.Rphase) : r.Rhot;
            const rows = pm ? [
              ["Kt (torque constant)", `${fmt(r.Kt, 4)} N·m/A`],
              ["Ke L-L RMS", `${fmt(r.Ke * Math.sqrt(3) * ((1000 * 2 * Math.PI) / 60), 2)} V/krpm`],
              [`R L-L 20 °C / at ${p.Tcu} °C`, `${fmt(r.Rll, 3)} / ${fmt(RllHot, 3)} Ω`],
              ["L L-L (rotor in / rotor out)", `${fmt(r.Lll * 1000, 3)} / ${fmt(r.LphNR * 2 * 1000, 3)} mH`],
              ["Pole count / pole pairs", `${r.poles} / ${r.poles / 2}`],
              ["Electrical frequency @ rated", `${fmt((r.nShaft * r.poles) / 120, 1)} Hz`],
              ["Drive / continuous current", `${fmt(p.Imax, 1)} / ${r.therm ? fmt(r.therm.Icont, 2) : "—"} A`],
              ["Thermal time const (winding / machine)", r.therm ? `${fmt(r.therm.tauW, 0)} / ${fmt(r.therm.tauM, 0)} s` : "—"],
              ["Rotor inertia Jr", r.bom && Number.isFinite(r.bom.Jr) ? `${(r.bom.Jr * 1e7).toFixed(2)} g·cm²` : "—"],
              ["Cogging period", `${fmt(cogPer, 2)}° mech (${lcm9(r.Ns, r.poles)} cogs/rev)`],
            ] : [
              ["Kt = Ke", `${fmt(r.Kt, 4)} N·m/A · ${fmt(r.Kt * ((1000 * 2 * Math.PI) / 60), 2)} V/krpm`],
              ["Ra terminal 20 °C / at " + p.Tcu + " °C", r.brush ? `${fmt((r.brush.Ra - Math.max(p.Rext, 0) / 1000) / (1 + 0.00393 * (p.Tcu - 20)), 3)} / ${fmt(r.brush.Ra, 3)} Ω` : "—"],
              ["La armature", r.brush ? `${fmt(r.brush.La * 1000, 3)} mH` : "—"],
              ["Commutator bars / brush drop", r.brush ? `${r.brush.segs} / ${p.brushV} V` : "—"],
              ["Drive / continuous current", `${fmt(p.Imax, 1)} / ${r.therm ? fmt(r.therm.Icont, 2) : "—"} A`],
              ["Thermal time const (winding / machine)", r.therm ? `${fmt(r.therm.tauW, 0)} / ${fmt(r.therm.tauM, 0)} s` : "—"],
              ["Rotor inertia Jr", r.bom && Number.isFinite(r.bom.Jr) ? `${(r.bom.Jr * 1e7).toFixed(2)} g·cm²` : "—"],
            ];
            const copyTxt = () => {
              const t9 = rows.map((q9) => `${q9[0]}\t${q9[1]}`).join("\n");
              try { navigator.clipboard.writeText(t9); setIoMsg("Controller block copied to the clipboard."); }
              catch (e9) { setIoMsg("Clipboard unavailable — select and copy the rows directly."); }
            };
            return (
              <div className="card paper" style={{ marginTop: 14 }}>
                <div className="cardhead">
                  <h2>Controller block (application note)</h2>
                  <button className="btn mini ghost" onClick={copyTxt}>Copy ⧉</button>
                </div>
                {rows.map((q9) => <div className="kv" key={q9[0]}><span>{q9[0]}</span><b>{q9[1]}</b></div>)}
                <div className="note">Every number above is the results column's own value in drive-vendor units — nothing is re-derived. No Ld≠Lq saliency and no current-loop gains: this machine model is surface-PM {pm ? "(use rotor-out L for bare-stator LCR checks)" : ""} and loop tuning is drive-side work.</div>
              </div>
            );
          })()}

          {/* v60.8: shop traveler — the winding the engine actually computed, as the
              bench holds it. Identity with the engine by construction (reads r only). */}
          {!r.err.length && (pm || brM) && r.layers === 2 && r.topLayer && r.botLayer && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Shop traveler — coil schedule</h2>
                <button className="btn mini ghost" onClick={() => window.print()}>Print ⎙</button>
              </div>
              <div className="kv"><span>Wire</span><b>AWG {p.awg} × {p.strands} strand{p.strands > 1 ? "s" : ""} · {p.turns} turns/coil · {p.paths} path{p.paths > 1 ? "s" : ""}{pm ? ` · ${p.conn}` : ` · ${p.pattern}`}</b></div>
              <div className="kv"><span>Inspect-to resistance (20 °C{pm ? ", L-L" : ", terminal"})</span><b>{fmt(pm ? r.Rll : (r.brush ? (r.brush.Ra - Math.max(p.Rext, 0) / 1000) / (1 + 0.00393 * (p.Tcu - 20)) : 0), 3)} Ω ± winding tolerance</b></div>
              <div className="kv"><span>Slot fill (gross)</span><b>{fmt(r.fillGross * 100, 1)}%</b></div>
              <div className="tbl" style={{ overflowX: "auto", marginTop: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>
                    {["Coil", "Phase", "In slot (top)", "Out slot (bottom)", "Turns", "Sense"].map((h9) => <th key={h9} style={{ textAlign: "left", padding: "3px 8px", borderBottom: "1px solid #CBD5E1" }}>{h9}</th>)}
                  </tr></thead>
                  <tbody>
                    {(() => { const phCount = [0, 0, 0]; return r.topLayer.map((t9, i9) => {
                      const outS = ((i9 + r.span) % r.Ns) + 1;
                      const phN = ["A", "B", "C"][t9.phase];
                      phCount[t9.phase] += 1;
                      return (
                        <tr key={i9}>
                          <td style={{ padding: "2px 8px" }}>{phN}{phCount[t9.phase]}</td>
                          <td style={{ padding: "2px 8px" }}>{phN}{t9.sign > 0 ? "+" : "−"}</td>
                          <td style={{ padding: "2px 8px" }}>{i9 + 1}</td>
                          <td style={{ padding: "2px 8px" }}>{outS}</td>
                          <td style={{ padding: "2px 8px" }}>{p.turns}</td>
                          <td style={{ padding: "2px 8px" }}>{t9.sign > 0 ? "CW" : "CCW"}</td>
                        </tr>
                      );
                    }); })()}
                  </tbody>
                </table>
              </div>
              {pm && (
                <div className="kv" style={{ marginTop: 6 }}><span>Magnet purchase line</span>
                  <b>{r.poles} pcs · {p.mag} · {fmt(p.magT, 1)} mm thick · {p.poleArc}% arc · stack {p.stackL} mm{r.bom && r.bom.mMag > 0 ? ` · ${fmt(r.bom.mMag * 1000, 1)} g total` : ""}</b></div>
              )}
              <div className="note">Coil schedule from the engine's own star-of-slots layers (same source as the FEMM export — gate-verified). Same-phase coils connect in series per path; sense alternates with the printed sign. This is an instruction from the model, not a measured first article.</div>
            </div>
          )}

          {/* v60.8: tolerance corners — simultaneous worst-case material/geometry, the
              production question a one-at-a-time tornado cannot answer. */}
          {!r.err.length && (pm || brM) && (() => {
            const adv = computeDesign({ ...p, rotorOD: p.rotorOD - 2 * Math.max(p.tolGap, 0), magT: Math.max(p.magT - Math.max(p.tolMag, 0), 0.2), brScale: 1 - Math.max(p.tolBr, 0) / 100 });
            const fav = computeDesign({ ...p, rotorOD: p.rotorOD + 2 * Math.max(p.tolGap, 0), magT: p.magT + Math.max(p.tolMag, 0), brScale: 1 + Math.max(p.tolBr, 0) / 100 });
            const row9 = (lab, f9, d9) => (
              <div className="kv" key={lab}><span>{lab}</span>
                <b style={{ display: "flex", gap: 12, justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "#B45309" }}>{adv.err.length ? "err" : f9(adv)}</span>
                  <span>{f9(r)}</span>
                  <span style={{ color: "#059669" }}>{fav.err.length ? "err" : f9(fav)}</span>
                </b></div>
            );
            return (
              <div className="card paper" style={{ marginTop: 14 }}>
                <h2>Tolerance corners (adverse · nominal · favorable)</h2>
                <div className="iobar">
                  <Num label="Airgap tol ±" unit="mm" v={p.tolGap} set={s("tolGap")} step={0.01} min={0} />
                  <Num label="Magnet thickness tol ±" unit="mm" v={p.tolMag} set={s("tolMag")} step={0.05} min={0} />
                  <Num label="Br lot tol ±" unit="%" v={p.tolBr} set={s("tolBr")} step={0.5} min={0} />
                </div>
                {row9("Kt (N·m/A)", (x9) => fmt(x9.Kt, 4))}
                {row9("No-load (rpm)", (x9) => fmt(x9.noLoad, 0))}
                {row9("Peak torque", (x9) => tqS(x9.peakT))}
                {row9("Continuous (S1) torque", (x9) => (x9.therm && Number.isFinite(x9.therm.Tcont) ? tqS(x9.therm.Tcont) : "—"))}
                {row9("Demag margin (%)", (x9) => fmt(x9.demagMargin * 100, 0))}
                <div className="note">Adverse = airgap +tol, magnet −tol, Br −tol% simultaneously (favorable is the mirror), each solved through the full engine — leakage, saturation, and demag move together. Enter YOUR process tolerances; the defaults are not a capability claim. Wire-Ø/turn-count tolerance not yet included (resistance corners come with the winding-truth work).</div>
              </div>
            );
          })()}

          {/* v60.9: one-shot overload T(t) — the intermittent-duty question answered
              from the design's own two-node thermal ladder. */}
          {!r.err.length && r.therm && Number.isFinite(r.therm.RthCu) && !brkM && !actM && (() => {
            const Ip9 = p.pulseI > 0 ? p.pulseI : 2 * p.Imax;
            const pt = pulseTemp(p, r, Ip9);
            if (pt.err) return null;
            const W9 = 460, H9 = 130, mL9 = 40, mB9 = 18;
            const tM9 = pt.tMax, TM9 = Math.max(pt.Tend, p.TcuMax * 1.05, p.Tamb + 10);
            const X9 = (t9) => mL9 + ((W9 - mL9 - 8) * t9) / tM9;
            const Y9 = (T9) => H9 - mB9 - ((H9 - mB9 - 8) * (T9 - p.Tamb)) / (TM9 - p.Tamb);
            return (
              <div className="card paper" style={{ marginTop: 14 }}>
                <h2>Overload pulse — winding T(t)</h2>
                <div className="iobar">
                  <Num label={`Pulse current (0 = 2×drive limit)`} unit="A" v={p.pulseI} set={s("pulseI")} step={0.5} min={0} />
                </div>
                <div className="kv"><span>Pulse copper loss at {fmt(Ip9, 1)} A (hot R)</span><b>{fmt(pt.Pc, 1)} W</b></div>
                <div className="kv"><span>Time to the {p.TcuMax} °C class limit</span>
                  <b style={{ color: Number.isFinite(pt.tLimit) && pt.tLimit < 10 ? "#DC2626" : undefined }}>
                    {Number.isFinite(pt.tLimit) ? `${fmt(pt.tLimit, pt.tLimit < 10 ? 2 : 1)} s` : "never (settles below the limit)"}</b></div>
                <svg viewBox={`0 0 ${W9} ${H9}`} style={{ width: "100%", marginTop: 6 }}>
                  <line x1={mL9} y1={Y9(p.TcuMax)} x2={W9 - 8} y2={Y9(p.TcuMax)} stroke="#DC2626" strokeDasharray="5 4" strokeWidth="1.2" />
                  <text x={W9 - 10} y={Y9(p.TcuMax) - 4} textAnchor="end" style={{ font: "9px monospace", fill: "#DC2626" }}>{p.TcuMax} °C</text>
                  <polyline fill="none" stroke="#3B82F6" strokeWidth="2" points={pt.curve.map((c9) => `${X9(c9.t)},${Y9(Math.min(c9.T, TM9))}`).join(" ")} />
                  {Number.isFinite(pt.tLimit) && pt.tLimit <= tM9 && <circle cx={X9(pt.tLimit)} cy={Y9(p.TcuMax)} r="4" fill="#DC2626" />}
                  <line x1={mL9} y1={H9 - mB9} x2={W9 - 8} y2={H9 - mB9} stroke="#64748B" />
                  <line x1={mL9} y1={8} x2={mL9} y2={H9 - mB9} stroke="#64748B" />
                  <text x={(W9 + mL9) / 2} y={H9 - 4} textAnchor="middle" style={{ font: "9px monospace", fill: "#64748B" }}>seconds (to {fmt(tM9, 0)} s)</text>
                  <text x={mL9 - 4} y={Y9(p.Tamb) + 3} textAnchor="end" style={{ font: "9px monospace", fill: "#64748B" }}>{p.Tamb}°</text>
                </svg>
                <div className="note">Two-node ladder (winding τ {fmt(r.therm.tauW, 0)} s over machine τ {fmt(r.therm.tauM, 0)} s), copper heating only at hot resistance — stall-pulse iron loss is second-order and excluded. Valid for single pulses from thermal equilibrium; repeated pulses live in the duty-cycle model above.</div>
              </div>
            );
          })()}

          {/* v60.9: mission / servo matching — point-to-point move against a reflected
              load, evaluated by the SAME drive-cycle chain as the CSV evaluator. */}
          {!r.err.length && (pm || brM) && r.bom && Number.isFinite(r.bom.Jr) && (() => {
            const Jl9 = Math.max(p.msJl, 0) * 1e-7;                  // g·cm² → kg·m²
            const N9 = Math.max(p.msN, 0.1), th9 = (Math.max(p.msAng, 1) * Math.PI) / 180;
            const T9 = Math.max(p.msT, 0.01), dw9 = Math.max(p.msDwell, 0);
            const Jm9 = r.bom.Jr + Jl9 / (N9 * N9);
            const alM = ((4 * th9) / (T9 * T9)) * N9;                // motor-side accel, triangle profile
            const Tacc = Jm9 * alM;
            const npk = (((2 * th9) / T9) * N9 * 60) / (2 * Math.PI);
            const KS = 12, samp = [{ t: 0, n: 0, T: Tacc }];
            for (let i9 = 1; i9 <= KS; i9++) samp.push({ t: (T9 / 2) * (i9 / KS), n: npk * (i9 / KS), T: Tacc });
            for (let i9 = 1; i9 <= KS; i9++) samp.push({ t: T9 / 2 + (T9 / 2) * (i9 / KS), n: npk * (1 - i9 / KS), T: -Tacc });
            samp.push({ t: T9 + Math.max(dw9, 0.001), n: 0, T: 0 });
            const dc9 = driveCycle(p, r, samp);
            return (
              <div className="card paper" style={{ marginTop: 14 }}>
                <h2>Mission check — point-to-point move</h2>
                <div className="iobar">
                  <Num label="Load inertia (at output)" unit="g·cm²" v={p.msJl} set={s("msJl")} step={10} min={0} />
                  <Num label="Ratio to output" unit=":1" v={p.msN} set={s("msN")} step={1} min={0.1} />
                  <Num label="Move angle (output)" unit="°" v={p.msAng} set={s("msAng")} step={15} min={1} />
                  <Num label="Move time" unit="s" v={p.msT} set={s("msT")} step={0.05} min={0.01} />
                  <Num label="Dwell" unit="s" v={p.msDwell} set={s("msDwell")} step={0.1} min={0} />
                </div>
                <div className="kv"><span>Accel torque at the motor (triangle profile)</span>
                  <b style={{ color: Tacc > r.peakT ? "#DC2626" : Tacc > 0.8 * r.peakT ? "#B45309" : undefined }}>
                    {tqS(Tacc)} of {tqS(r.peakT)} peak ({fmt((Tacc / Math.max(r.peakT, 1e-9)) * 100, 0)}%)</b></div>
                <div className="kv"><span>Peak motor speed during the move</span><b>{fmt(npk, 0)} rpm{npk > r.noLoad ? " — EXCEEDS no-load, move is not achievable" : ""}</b></div>
                {dc9 && !dc9.err && (
                  <>
                    <div className="kv"><span>Cycle RMS current vs continuous</span>
                      <b style={{ color: r.therm && dc9.Irms > r.therm.Icont ? "#DC2626" : undefined }}>
                        {fmt(dc9.Irms, 2)} A vs {r.therm ? fmt(r.therm.Icont, 2) : "—"} A</b></div>
                    <div className="kv"><span>Implied steady winding temp at this duty</span>
                      <b style={{ color: dc9.Tcu > p.TcuMax ? "#DC2626" : undefined }}>{dc9.Tcu !== null ? `${Math.round(dc9.Tcu)} °C vs ${p.TcuMax} °C class` : "—"}</b></div>
                    <div className="kv"><span>Energy in / out per cycle</span><b>{fmt(dc9.Ein, 2)} / {fmt(dc9.Eout, 2)} J</b></div>
                    {dc9.overFrac > 0.001 && <div className="warn">{fmt(dc9.overFrac * 100, 1)}% of the move sits above the drive envelope — slower move, bigger motor, or a different ratio.</div>}
                  </>
                )}
                <div className="note">T_accel = (Jr + J_load/N²)·α with α = 4θ/T² (triangle); reflected friction is NOT modeled — add it to the load torque when it matters. Evaluated through the same drive-cycle/loss chain as the CSV evaluator (motor frame).</div>
              </div>
            );
          })()}

          {!r.err.length && !brkM && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Design exploration</h2>
                {sweep && !sweep.err && <button className="btn mini ghost" onClick={() => exportPng("svg-sweep", "sweep.png")}>PNG ⤓</button>}
              </div>
              <Sel label="Sweep parameter" v={swKey} set={setSwKey} opts={SW_KEYS.filter((k9) => typeof p[k9] === "number")} />
              <Num label="Range around the current value" unit="±%" v={swSpan} set={setSwSpan} step={5} min={5} max={90} />
              <div className="field"><span className="fl">Metrics</span>
                <div className="seg" style={{ flexWrap: "wrap" }}>
                  {["Kt", "peakT", "eta", "noLoad", "Rll", "Tcu", "fill", "Bt", "cogTpp"].map((k9) => (
                    <button key={k9} className={swMets.indexOf(k9) >= 0 ? "on" : ""}
                      onClick={() => setSwMets((m9) => (m9.indexOf(k9) >= 0 ? m9.filter((x9) => x9 !== k9) : [...m9, k9].slice(0, 6)))}>
                      {k9}</button>
                  ))}
                </div>
              </div>
              {sweep && sweep.err && <div className="warn">{sweep.err}</div>}
              {sweep && !sweep.err && <SweepChart sw={sweep} us={us} lenKeys={SW_LEN_KEYS} />}
              <div className="note">
                41 full solves of the real engine across the range — every metric is read from a
                computed design, so a sweep can never disagree with the results column. Shaded bands
                are values that do not produce a buildable design.
              </div>
              <div className="cardhead" style={{ marginTop: 12 }}>
                <h2>What moves it</h2>
                {tornado && !tornado.err && <button className="btn mini ghost" onClick={() => exportPng("svg-tornado", "sensitivity.png")}>PNG ⤓</button>}
              </div>
              <Sel label="Metric" v={snMetric} set={setSnMetric}
                opts={["Kt", "peakT", "eta", "noLoad", "Rll", "Tcu", "Icont", "fill", "Bt", "By", "demag"]} />
              <Num label="Perturbation" unit="±%" v={snPct} set={setSnPct} step={5} min={1} max={50} />
              {tornado && tornado.err && <div className="warn">{tornado.err}</div>}
              {tornado && !tornado.err && <TornadoChart sn={tornado} />}
              <div className="note">
                Each input perturbed on its own, ranked by how far it moves the metric — the top bar
                is the parameter worth arguing about. Inputs whose perturbation breaks the design read
                "invalid" rather than being silently dropped.
              </div>
            </div>
          )}

          {pm && !r.err.length && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Field solution (2-D magnetostatic)</h2>
                {field && !field.err && <button className="btn mini ghost" onClick={() => exportPng("svg-field", "field-plot.png")}>PNG ⤓</button>}
              </div>
              <div className="iobar">
                <button className="btn" onClick={runField} disabled={fieldBusy}>
                  {fieldBusy ? "Solving…" : field ? "Re-solve" : "Solve field"}</button>
                <Pick label="" v={fieldRes} set={setFieldRes}
                  opts={[{ v: "fast", t: "Fast" }, { v: "normal", t: "Normal" }, { v: "fine", t: "Fine" }]} />
              </div>
              <div className="note" style={{ marginTop: 2 }}>
                Nonlinear vector-potential solve on a graded polar mesh, magnets as equivalent
                magnetization currents, the same Froelich BH curve the analytical core uses. Runs
                on demand — it is a real solve, not a formula.
              </div>
              {field && field.err && <div className="warn errb">{field.err}</div>}
              {field && !field.err && (
                <>
                  {fieldStale && <div className="warn">The design has changed since this solve — re-solve to match the numbers above.</div>}
                  <FieldPlot F={field} p={p} us={us} />
                  <h2 style={{ marginTop: 12 }}>Air-gap flux density</h2>
                  <GapWaveform F={field} us={us} />
                  <div className="tbl" style={{ marginTop: 8 }}>
                    <div className="kv"><span>Peak / fundamental gap flux density</span>
                      <b>{field.gap.Bpk.toFixed(3)} / {field.B1.toFixed(3)} T</b></div>
                    <div className="kv"><span>vs the magnetic-circuit model (fundamental)</span>
                      <b style={{ color: Math.abs(field.cmp.dB1) < 0.1 ? "#059669" : Math.abs(field.cmp.dB1) < 0.25 ? "#B45309" : "#DC2626" }}>
                        {r.B1.toFixed(3)} T analytic · {(field.cmp.dB1 * 100).toFixed(1)}% difference</b></div>
                    {/* v60.7: field-informed leakage — the kl that reconciles THIS design's circuit
                        to its own 2-D solve. Adoption is explicit and visible; preset loads clear it
                        (klOv lives in DEFAULT_P). A geometry closed form was tried and lost to the
                        field referee across all PM presets — see the engine comment. */}
                    {r.kl > 0 && field.B1 > 0 && r.B1 > 0 && (() => {
                      const klEst = Math.min(Math.max(r.kl * (field.B1 / r.B1), 0.5), 1.0);
                      const adopt = () => {
                        // iterate: the saturation loop is nonlinear in kl, so one-shot
                        // scaling under-corrects — three passes land within a fraction of a %
                        let k9 = klEst;
                        for (let i9 = 0; i9 < 3; i9++) {
                          const rT = computeDesign({ ...p, klOv: k9 });
                          if (!(rT.B1 > 0)) break;
                          k9 = Math.min(Math.max(k9 * (field.B1 / rT.B1), 0.5), 1.0);
                        }
                        setP((o) => ({ ...o, klOv: +k9.toFixed(4) }));
                      };
                      return (
                        <div className="kv"><span>Field-informed leakage kl (active: {r.kl.toFixed(3)}{p.klOv > 0 ? " · adopted" : " · default 0.9"})</span>
                          <b style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                            {klEst.toFixed(3)}
                            {p.klOv > 0
                              ? <button className="btn mini ghost" onClick={() => setP((o) => ({ ...o, klOv: 0 }))}>Revert to 0.9</button>
                              : <button className="btn mini" onClick={adopt}>Adopt</button>}
                          </b></div>
                      );
                    })()}
                    <div className="kv"><span>Flux per pole (solved)</span><b>{(field.fluxPole * 1000).toFixed(3)} mWb</b></div>
                    <div className="kv"><span>Peak flux density in iron</span>
                      <b>{Math.max(...field.B).toFixed(2)} T</b></div>
                    <div className="kv"><span>Mesh · solve</span>
                      <b>{field.nr}×{field.nth} cells · {field.ms} ms · {field.conv ? "converged" : `residual ${field.resid.toExponential(1)}`}</b></div>
                    {field.mesh && <div className="kv"><span>Mesh check (re-solved {field.mesh.nr2}×{field.mesh.nth2})</span>
                      <b style={{ color: field.mesh.ok ? "#059669" : "#DC2626" }}>
                        {field.mesh.ok ? "converged — " : "NOT converged — "}
                        fundamental moves {(field.mesh.dB1 * 100).toFixed(1)}%, peak {(field.mesh.dBpk * 100).toFixed(1)}%</b></div>}
                  </div>
                  {field.mesh && !field.mesh.ok && <div className="warn errb">
                    This design's field numbers are NOT mesh-independent — they moved more than 5%
                    when re-solved on a finer mesh, so do not quote them. Try Fine, or treat the
                    analytical model as the source for this geometry.
                  </div>}
                  <div className="note">
                    The comparison row is the point of this card: where the field solve and the
                    magnetic circuit agree, the fast model is trustworthy for sweeps; where they
                    diverge, the circuit is missing something (thick magnets starving the back iron
                    is the usual culprit — the circuit keeps predicting more flux, the field says
                    the iron ran out). <b>Cogging torque is deliberately not reported here:</b> it
                    failed its own mesh-convergence study on this structured mesh, so the analytical
                    cogging model above remains the source. Magnetostatic and no-load: no eddy
                    currents, no hysteresis, no stator current.
                  </div>
                </>
              )}

              {/* v61: LOADED solve — winding currents in, torque + demag map out. */}
              <div className="cardhead" style={{ marginTop: 14 }}>
                <h2>Loaded solve — torque & demag map</h2>
              </div>
              <div className="iobar">
                <button className="btn" onClick={runFieldL} disabled={fieldLBusy}>
                  {fieldLBusy ? "Solving 9 angles…" : fieldL ? "Re-solve loaded" : "Solve loaded"}</button>
                <Num label="Phase current (0 = rated)" unit="A rms" v={fieldLI} set={setFieldLI} step={0.5} min={0} />
              </div>
              {fieldL && fieldL.err && <div className="warn errb">{fieldL.err}</div>}
              {fieldL && !fieldL.err && (
                <>
                  {fieldLStale && <div className="warn">The design has changed since this loaded solve — re-solve to match.</div>}
                  <div className="tbl" style={{ marginTop: 8 }}>
                    <div className="kv"><span>Electromagnetic torque (dq flux-linkage, best of 9 angles)</span>
                      <b>{fieldL.Tem !== null ? tqS(fieldL.Tem) : "withheld — not mesh-converged"} @ {fmt(fieldL.Irms, 2)} A</b></div>
                    <div className="kv"><span>vs the circuit's Kt·I·sat(I)</span>
                      <b style={{ color: Math.abs(fieldL.dTcir) < 0.15 ? "#059669" : Math.abs(fieldL.dTcir) < 0.3 ? "#B45309" : "#DC2626" }}>
                        {tqS(fieldL.Tcir)} · {(fieldL.dTcir * 100).toFixed(1)}% difference</b></div>
                    <div className="kv"><span>Loaded gap fundamental (vs no-load circuit)</span>
                      <b>{fieldL.B1.toFixed(3)} T vs {r.B1.toFixed(3)} T</b></div>
                    <div className="kv"><span>Demagnetization at {r.demagT} °C worst-case (HcJ {fmt(r.HcJmin, 0)} kA/m)</span>
                      <b style={{ color: fieldL.demag.worstMargin < 0 ? "#DC2626" : fieldL.demag.worstMargin < 0.2 ? "#B45309" : "#059669" }}>
                        worst margin {(fieldL.demag.worstMargin * 100).toFixed(0)}%{fieldL.demag.nDemag > 0 ? ` · ${(fieldL.demag.frac * 100).toFixed(1)}% of magnet cells PAST the knee` : " · no cell past the knee"}</b></div>
                    {fieldL.mesh && <div className="kv"><span>Mesh check (loaded torque / loaded B1)</span>
                      <b style={{ color: fieldL.mesh.ok ? "#059669" : "#DC2626" }}>
                        {fieldL.mesh.ok ? "converged" : "NOT converged"} — ΔT {(fieldL.mesh.dT * 100).toFixed(1)}%, ΔB1 {(fieldL.mesh.dB1 * 100).toFixed(1)}%</b></div>}
                    <div className="kv"><span>Solve</span><b>{fieldL.nr}×{fieldL.nth} cells × 9 angles + verify · {fieldL.ms} ms · MMF angle {(fieldL.thE * 180 / Math.PI).toFixed(0)}°e</b></div>
                  </div>
                  {/* demag strip: worst margin per gap angle — where on the circumference the knee is nearest */}
                  <svg viewBox="0 0 460 46" style={{ width: "100%", marginTop: 6 }}>
                    {fieldL.demag.strip.filter((_, i9) => i9 % 2 === 0).map((m9, i9, arr9) => {
                      const w9 = 452 / arr9.length;
                      const c9 = !Number.isFinite(m9) ? "#E2E8F0" : m9 < 0 ? "#DC2626" : m9 < 0.2 ? "#F59E0B" : m9 < 0.5 ? "#84CC16" : "#059669";
                      return <rect key={i9} x={4 + i9 * w9} y={6} width={Math.max(w9 - 0.5, 0.5)} height={22} fill={c9} />;
                    })}
                    <text x={4} y={42} style={{ font: "9px monospace", fill: "#64748B" }}>0°</text>
                    <text x={456} y={42} textAnchor="end" style={{ font: "9px monospace", fill: "#64748B" }}>360° — worst demag margin per mechanical angle (green ≥50% · lime ≥20% · amber &lt;20% · red past knee)</text>
                  </svg>
                  <div className="note">
                    Same solver, same mesh discipline: winding ampere-turns from the engine's own
                    star-of-slots layers (i/paths per conductor), sinusoidal phase currents, the
                    electrical angle swept for peak torque. Torque is the volume-integrated dq
                    flux-linkage form — the boundary-staircase noise that disqualified cogging does
                    not apply — and it is withheld unless its own two-mesh check passes. The demag
                    map compares the local opposing H in every magnet cell against HcJ at the
                    design's worst-case magnet temperature (cold for ferrite, hot for NdFeB).
                    2-D: end effects and PWM ripple current are not in this number.
                  </div>
                </>
              )}
            </div>
          )}

          {emap && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Efficiency map</h2>
                <button className="btn mini ghost" onClick={() => exportPng("svg-effmap", "efficiency-map.png")}>PNG ⤓</button>
              </div>
              <EfficiencyMap r={r} p={p} us={us} emap={emap} />
              <div className="tbl" style={{ marginTop: 8 }}>
                {emap.best && <div className="kv"><span>Peak efficiency</span>
                  <b>{(emap.best.eta * 100).toFixed(1)}% at {Math.round(emap.best.n)} rpm · {tqS(emap.best.T)}</b></div>}
                {emap.op && <div className="kv"><span>At the rated point</span>
                  <b>{(emap.op.eta * 100).toFixed(1)}% · Cu {emap.op.Pcu.toFixed(1)} W · Fe {emap.op.Pfe.toFixed(1)} W · windage {emap.op.Pwind.toFixed(2)} W</b></div>}
                {Number.isFinite(emap.Tcont) && <div className="kv"><span>S1 continuous torque (thermal)</span><b>{tqS(emap.Tcont)}</b></div>}
              </div>
              <div className="note">
                η over the drive envelope from the SAME loss chain as the results column — DC + AC copper
                (Dowell, re-evaluated at each speed's electrical frequency), two-term Steinmetz iron loss at
                that frequency, and windage; shaft torque on the axis, so drag is charged as input, not output.
                White contours are iso-efficiency (heavier at 80/90%); dashed white is the best-efficiency
                locus per speed; black is the drive envelope. Magnet eddy loss and PWM harmonic loss are not modeled.
              </div>
            </div>
          )}

          {emap && (
            <div className="card paper" style={{ marginTop: 14 }}>
              <div className="cardhead">
                <h2>Drive cycle</h2>
                {dcyc && !dcyc.err && <button className="btn mini ghost" onClick={() => exportPng("svg-dcycle", "drive-cycle.png")}>PNG ⤓</button>}
              </div>
              <div className="iobar">
                <label className="btn ghost">
                  Load cycle CSV…
                  <input type="file" accept=".csv,text/csv" onChange={importCycle} />
                </label>
                {dcyc && <button className="btn mini ghost" onClick={() => { setCycle(null); setCycMsg(""); }}>Clear</button>}
              </div>
              <div className="note" style={{ marginTop: 2 }}>
                CSV columns <code>time_s, speed_rpm, torque_Nm</code> (a header row is detected and skipped).
                Everything is parsed locally — the file never leaves this machine.
              </div>
              {cycMsg && <div className="iomsg">{cycMsg}</div>}
              {dcyc && dcyc.err && <div className="warn errb">{dcyc.err}</div>}
              {dcyc && !dcyc.err && (
                <>
                  <DriveCycleChart dc={dcyc} us={us} />
                  <div className="tbl" style={{ marginTop: 8 }}>
                    <div className="kv"><span>Cycle duration · energy out / in</span>
                      <b>{dcyc.dur.toFixed(1)} s · {(dcyc.Eout / 3600).toFixed(2)} / {(dcyc.Ein / 3600).toFixed(2)} W·h</b></div>
                    <div className="kv"><span>Cycle-average efficiency</span><b>{(dcyc.etaCycle * 100).toFixed(1)}%</b></div>
                    <div className="kv"><span>Loss split (Cu / Fe / windage)</span>
                      <b>{(dcyc.Ecu / 3600).toFixed(3)} / {(dcyc.Efe / 3600).toFixed(3)} / {(dcyc.Ew / 3600).toFixed(3)} W·h</b></div>
                    <div className="kv"><span>RMS current · RMS torque · peaks</span>
                      <b>{dcyc.Irms.toFixed(2)} A · {tqS(dcyc.Trms)} · {Math.round(dcyc.nPk)} rpm / {tqS(dcyc.tPk)}</b></div>
                    {Number.isFinite(dcyc.Tcu) && <div className="kv"><span>Implied winding temp (cycle-mean loss)</span>
                      <b style={{ color: dcyc.Tcu > p.TcuMax ? "#DC2626" : dcyc.Tcu > 0.85 * p.TcuMax ? "#B45309" : "#059669" }}>
                        {Math.round(dcyc.Tcu)} °C vs {p.TcuMax} °C class</b></div>}
                  </div>
                  {dcyc.overFrac > 0.001 && <div className="warn">
                    {(dcyc.overFrac * 100).toFixed(1)}% of the cycle sits ABOVE the drive envelope — those points
                    are not achievable with this motor and bus{dcyc.unreachFrac > 0.001
                      ? `; ${(dcyc.unreachFrac * 100).toFixed(1)}% demands torque beyond the saturation plateau and is EXCLUDED from the energy, copper-loss, and I·rms figures (the model cannot price it) — the remainder is integrated at the demanded torque`
                      : "; the numbers above assume the demanded torque anyway"}.
                  </div>}
                  <div className="note">
                    Midpoint integration over the samples, per-sample losses from the same chain as the map.
                    The implied winding temperature applies the design's own thermal resistance to the cycle-mean
                    copper loss, with iron loss coupled at half weight (a first-order split — iron heats the
                    stack, not the winding directly) — a steady-state estimate valid when the cycle is short
                    against the machine's thermal time constant ({r.therm && Number.isFinite(r.therm.tauM) ? Math.round(r.therm.tauM / 60) : "—"} min).
                  </div>
                </>
              )}
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
            {!brM && !latmM && !stpM && !brkM && <div className="kv"><span>Winding factor kw{r.skewDeg > 0 ? " (incl. skew)" : ""}</span><b>{fmt(r.kw, 3)}</b></div>}
            {!latmM && !stpM && !brkM && r.skewDeg > 0 && <div className="kv"><span>Stack skew {r.skewDeg}° ({fmt(r.skewArc, 1)} mm arc)</span>
              <b>k_sk {fmt(r.ksk, 4)} · slot path ×{fmt(r.skewSlant, 4)}{r.cog && Number.isFinite(r.cog.kskCog) ? ` · cogging ×${fmt(r.cog.kskCog, 3)}` : ""}</b></div>}
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
                {Number.isFinite(r.brush.erMax) && (
                  <div className="kv"><span>Commutation reactance voltage (rated / worst on curve)</span>
                    <b style={{ color: r.brush.erMax > 3 ? "#DC2626" : r.brush.erMax > 2.5 ? "#B45309" : undefined }}>
                      {fmt(r.brush.er, 2)} / {fmt(r.brush.erMax, 2)} V{r.brush.erMax > 0 ? ` @ ~${Math.round(r.brush.nErMax)} rpm` : ""} (arc limit ~3 V)</b></div>
                )}
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
                <Num label="Measured steady ΔT (winding − ambient)" unit="°C" v={p.mDT} set={s("mDT")} step={1} min={0} />
                <Num label="…at total loss" unit="W" v={p.mPw} set={s("mPw")} step={0.5} min={0} />
                <div className="iobar" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={captureCal}>Capture factors</button>
                  <Pick label="" v={p.calOn} set={s("calOn")} opts={[{ v: "yes", t: "Active" }, { v: "no", t: "Off" }]} />
                </div>
                {p.calOn === "yes" && r.cal && (
                  <div className="tbl" style={{ marginTop: 6 }}>
                    <div className="kv"><span>Applied factors R · L</span><b>×{fmt(r.cal.kR, 3)} · ×{fmt(r.cal.kL, 3)}</b></div>
                    {p.calKRth !== 1 && <div className="kv"><span>Thermal Rth (this mount/cooling only)</span><b>×{fmt(p.calKRth, 3)}</b></div>}
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
                <div className="kv"><span>Coil R at terminals (20 °C / {p.Tcu} °C)</span><b>{fmt(r.latm.RaTerm20, 2)} / {fmt(r.latm.Ra, 2)} Ω</b></div>
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
