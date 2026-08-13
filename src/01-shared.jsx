/* MotrWorks module 01 — shared: materials, wire tables, magnets, presets, theme, DXF export */
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
    pattern: "concentrated", layers: 2, span: 0, turns: 31, awg: 25, strands: 1, paths: 1, conn: "wye",
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

