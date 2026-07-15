/* MotrSynth module 01 — shared: materials, wire tables, magnets, presets, theme, DXF export */
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
  'Brake 28 V · 38 mm · aero holding': {
    slots: 12, poles: 4, statorOD: 38, statorID: 30, rotorOD: 24, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 18, liner: 0.2, slotR: 0, shaftD: 8,
    pattern: "concentrated", layers: 2, span: 0, turns: 900, awg: 34, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 28, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 16, brkPole: 6, brkArm: 4, brkStroke: 0.2, brkSpring: 70, brkK: 15, brkSpringN: 4,
    brkPktID: 33, brkBossOD: 22, brkPktD: 14, brkBobID: 24.2, brkBobOD: 32, brkBobL: 11.5,
    brkRo: 17, brkRi: 11, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },
  'Brake 24 V · 60 mm · spring-applied': {
    slots: 12, poles: 4, statorOD: 60, statorID: 40, rotorOD: 30, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 25, liner: 0.2, slotR: 0, shaftD: 10,
    pattern: "concentrated", layers: 2, span: 0, turns: 650, awg: 29, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 24, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 26, brkPole: 6, brkArm: 6, brkStroke: 0.3, brkSpring: 200, brkK: 40, brkSpringN: 6,
    brkPktID: 50, brkBossOD: 34, brkPktD: 18, brkBobID: 36.2, brkBobOD: 49, brkBobL: 15,
    brkRo: 27, brkRi: 18, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },  'Brake 24 V · 90 mm · 10 N·m class': {
    slots: 12, poles: 4, statorOD: 90, statorID: 70, rotorOD: 50, yoke: 6, toothW: 4, slotOpen: 2,
    tipH: 1, stackL: 32, liner: 0.2, slotR: 0, shaftD: 15,
    pattern: "concentrated", layers: 2, span: 0, turns: 450, awg: 26, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 24, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 34, brkPole: 6, brkArm: 8, brkStroke: 0.4, brkSpring: 380, brkK: 60, brkSpringN: 6,
    brkPktID: 74, brkBossOD: 54, brkPktD: 24, brkBobID: 56.2, brkBobOD: 73, brkBobL: 21.5,
    brkRo: 40, brkRi: 26, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
    statorMat: "1018 steel (solid)", rotorMat: "1018 steel (solid)", mag: "N35", magT: 3, poleArc: 85, Top: 60,
  },
  'Brake 12 V · 40 mm · light duty': {
    slots: 12, poles: 4, statorOD: 40, statorID: 32, rotorOD: 24, yoke: 5, toothW: 3, slotOpen: 1.5,
    tipH: 0.8, stackL: 16, liner: 0.2, slotR: 0, shaftD: 6,
    pattern: "concentrated", layers: 2, span: 0, turns: 420, awg: 30, strands: 1, paths: 1, conn: "wye",
    motorType: "brake", Vdc: 12, Imax: 1, freq: 100, J: 6, seq: "ABC", endMode: "auto", loadMode: "J", Rext: 0,
    brkBore: 13, brkPole: 6, brkArm: 4, brkStroke: 0.25, brkSpring: 75, brkK: 20, brkSpringN: 4,
    brkPktID: 34, brkBossOD: 22, brkPktD: 13, brkBobID: 24.2, brkBobOD: 33, brkBobL: 10.5,
    brkRo: 18, brkRi: 12, brkFaces: 2, brkMat: "Organic (resin-bonded)", brkMu: 0.40, brkMuD: 0.32,
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
  '4" high-temp · 270 V · Hiperco/SmCo': {
    slots: 36, poles: 12, statorOD: 102, statorID: 64, rotorOD: 63, yoke: 4.5, toothW: 3.0,
    slotOpen: 2.2, tipH: 1.2, stackL: 50, liner: 0.3, shaftD: 12,
    pattern: "lap", layers: 2, span: 0, turns: 12, awg: 21, strands: 1, paths: 1, conn: "wye",
    motorType: "pm", ctrl: "foc", mag: "Sm2Co17-32", magT: 4, poleArc: 85, Top: 200,
    Vdc: 270, Imax: 8, freq: 200, J: 5, seq: "ABC", endMode: "auto",
    statorMat: "Hiperco 50", rotorMat: "1018 steel (solid)",
  },
};

const awgBareDia = (awg) => 0.127 * Math.pow(92, (36 - awg) / 39); // mm
const INS_BUILD = { // enamel diameter growth approximations, mm
  "Single": (d) => d * 1.032 + 0.018,
  "Heavy":  (d) => d * 1.055 + 0.033,
  "Triple": (d) => d * 1.078 + 0.048,
};
const awgInsDia = (d, b) => (INS_BUILD[b] || INS_BUILD["Heavy"])(d);

function computeDesign(p) {
  const w = []; // warnings
  const err = [];

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
  const airgap = (p.statorID - p.rotorOD) / 2;
  if (airgap <= 0) err.push(brushedM
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

  // ---- wire ----
  const dBare = awgBareDia(p.awg);
  const dIns = awgInsDia(dBare, p.insBuild);
  const aBare = (Math.PI / 4) * dBare * dBare; // mm²
  const aIns = (Math.PI / 4) * dIns * dIns;

  const layers = brushedM || p.pattern === "concentrated" ? 2 : p.layers; // brushed armature: double-layer (2 coil sides per slot)
  const condPerSlot = layers * p.turns * p.strands;
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
  for (let i = 0; i < Ns; i++) {
    const th = i * gamma;
    let best = 0, bp = 0, bs = 1;
    for (let ph = 0; ph < 3; ph++) {
      const c = Math.cos(th - axes[ph]);
      if (Math.abs(c) > best) { best = Math.abs(c); bp = ph; bs = c >= 0 ? 1 : -1; }
    }
    topLayer.push({ phase: bp, sign: bs });
  }
  const botLayer = topLayer.map((_, i) => {
    const src = topLayer[(i - span + Ns * 10) % Ns];
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

  // ---- coil build / end-turn model → MLT (mm) ----
  const nCoilCond = p.turns * p.strands;           // conductors in one coil bundle
  const winH = Math.max(p.bobWin, dIns);           // winding window height
  const tb = (nCoilCond * aIns) / (0.72 * winH);   // radial build depth @72% lay
  let MLTmm = 0, endSide = 0, coilOD = 0;
  if (p.endMode === "bobbin") {
    if (p.bobShape === "round") {
      MLTmm = Math.PI * (p.bobD + tb);
      coilOD = p.bobD + 2 * tb;
    } else { // racetrack bobbin around the tooth
      const ca = p.stackL + 2 * p.bobWall, cb = p.toothW + 2 * p.bobWall;
      MLTmm = 2 * (ca + cb) + Math.PI * tb;
      coilOD = tb; // envelope build per side
    }
    const slotHalf = (Math.max(w1, 0) + Math.max(w2, 0)) / 4;
    if (tb > slotHalf && p.pattern === "concentrated")
      w.push(`Coil build ${tb.toFixed(1)} mm exceeds the ~${slotHalf.toFixed(1)} mm half-slot width — won't seat in the slot.`);
  } else if (p.endMode === "head") {
    endSide = Math.sqrt(coilArc * coilArc + 4 * p.headH * p.headH) + 5; // rise + throw + nose
    MLTmm = 2 * p.stackL + 2 * endSide;
  } else { // auto
    endSide = 1.35 * coilArc + 10;
    MLTmm = 2 * (p.stackL + endSide);
  }
  const MLT = MLTmm / 1000; // m per turn
  const coilDia = MLTmm / Math.PI;                            // equivalent round-coil Ø
  const bobSuggest = Math.max(coilDia - tb, 0);               // core Ø that yields this MLT
  const Rphase =
    (RHO_CU * MLT * coilsPerPhase * p.turns * 1e6) / (aBare * p.strands * a * a); // ohm
  const Rll = p.conn === "wye" ? 2 * Rphase : (2 / 3) * Rphase;
  // operating resistance: copper at winding temp + drive FETs / leads per phase
  const Rhot = Rphase * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;

  // ---- inductance estimates (computed after kw/Nser are known; filled below) ----

  // ---- electrical operating point: from current density J, or from a specified rated current ----
  // brushed: armature current divides over A2 parallel paths (lap = poles × plex, wave = 2 × plex)
  const pathsEff = brushedM ? (p.pattern === "lap" ? poles * a : 2 * a) : a;
  const Iph = p.loadMode === "I" ? Math.max(p.Irate, 0) : p.J * aBare * p.strands * pathsEff; // rms (brushed: armature terminal current)
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
  const Ke = wSync > 0 ? Eph / wSync : 0; // V_rms per mech rad/s

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
  const bAvgSlot = (Math.max(w1, 0) + Math.max(w2, 0)) / 2;
  const lamSlot = bAvgSlot > 0 ? Math.max(hs, 0) / (3 * bAvgSlot) + p.tipH / Math.max(p.slotOpen, 0.1) : 1.5;
  const Lslot = ((4 * 3) / Ns) * MU0 * (p.stackL / 1000) * lamSlot * Nser * Nser;
  const Lend = 0.3 * Lslot; // end-winding leakage, rule-of-thumb fraction
  const Lph = Lmag + Lslot + Lend;                 // rotor installed
  const LmagNR = (3 / Math.PI) * MU0 * ((D * L) / (p.statorID / 2000)) * Math.pow(kw * Nser, 2) / (poles * poles);
  const LphNR = LmagNR + Lslot + Lend;             // rotor removed: flux must cross the open bore
  const Lll = p.conn === "wye" ? 2 * Lph : (2 / 3) * Lph;
  const LllNR = p.conn === "wye" ? 2 * LphNR : (2 / 3) * LphNR;

  // armature-loaded saturation knockdown at the drive current limit
  let kIT = 1;
  if (p.motorType === "pm" && satAux && BgAvg > 0) {
    const FaMax = (1.35 * kw * Nser * Math.SQRT2 * p.Imax) / (poles / 2);
    kIT = Math.min(satAux(FaMax) / BgAvg, 1);
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
      for (let wm = wNL; wm <= wNL * 1.6; wm += wNL / 40) { if (IqMax(wm) > p.Imax * 0.01) wEnd = wm; else break; }
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
    const bodyM = STEELS[p.statorMat] || { Bmax: 1.6, mur: 700 };
    const Bsat = Math.min(bodyM.Bmax || 1.6, 2.1);
    // iron path as equivalent extra gap: down the boss, across the back web, up the rim, through the armature
    const lFe = (2 * pktD + (rOD - rThru) + p.brkArm) / 1000;
    const gFe = lFe / Math.max(bodyM.mur || 700, 100);
    const pullAt = (g) => {
      const Rtot = (g / (mu0b * Ain)) + (g / (mu0b * Aout)) + (gFe / (mu0b * Amin));
      let Phi = NI / Rtot;
      Phi = Math.min(Phi, Bsat * Amin);                               // saturation cap
      const F = (Phi * Phi / (2 * mu0b)) * (1 / Ain + 1 / Aout);
      return { F, Phi, Bin: Phi / Ain, Bout: Phi / Aout, satLim: Phi >= Bsat * Amin * 0.999 };
    };
    const atGap = pullAt(g0), atSeat = pullAt(gRes);
    const Fclamp = Math.max(p.brkSpring, 1);
    const Fcompr = Fclamp + Math.max(p.brkK, 0) * Math.max(p.brkStroke, 0.05);
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
    const Vrel = Math.sqrt(Math.max(1.35 * Fcompr / atGap.F, 0)) * p.Vdc;
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
      Bin: atGap.Bin, Bout: atGap.Bout, Bback, NI, Rb, Ib, Pb, Ihold, Phold, eco, TcuB, RthB, Lb, tau: Lb / Math.max(Rb, 1e-6),
      Vrel: Math.min(Vrel, 10 * p.Vdc), capT: capB, Ain: Ain * 1e6, Aout: Aout * 1e6,
      hBuild, coilOD, clr, tBack, Ipull, Idrop, Rcold, wireLen };
    op = { n: 0, T: Thold }; peakT = Thold; noLoad = 0;
    if (p.brkRi >= p.brkRo) err.push("Friction lining ID must be smaller than its OD.");
    if (!(rThru < rBoss - 0.5)) err.push("Boss OD must exceed the through-hole by a usable pole width.");
    if (!(rBoss < rPkt - 1)) err.push("Pocket ID must exceed the boss OD — no room for a coil pocket.");
    if (!(rPkt < rOD - 0.5)) err.push("Backiron OD must exceed the pocket ID by a usable rim width.");
    if (tBack <= 0.5) err.push(`Pocket depth ${pktD} mm leaves ${tBack.toFixed(1)} mm of back web — the pocket breaks through the backiron.`);
    if (clr <= 0) err.push(`Wound coil Ø${coilOD.toFixed(1)} mm interferes with the pocket ID Ø${p.brkPktID} mm — fewer turns, finer wire, longer bobbin, or a bigger pocket.`);
    else if (clr < 0.5) w.push(`Wound coil Ø${coilOD.toFixed(1)} mm leaves only ${clr.toFixed(2)} mm radial clearance to the pocket ID — under the 0.5 mm assembly minimum.`);
    if (p.brkBobID < p.brkBossOD + 0.2) w.push(`Winding-start \u00d8 ${p.brkBobID} mm won't clear the ${p.brkBossOD} mm boss — the barrel needs ≥ 0.2 mm over it.`);
    if (p.brkBobOD < p.brkBobID + 1) w.push("Winding window under 0.5 mm radial between the start and max-finish \u00d8 — no room for wire.");
    if (Number.isFinite(coilOD) && coilOD > p.brkBobOD + 0.05) w.push(`Wound coil \u00d8${coilOD.toFixed(1)} overruns the ${p.brkBobOD} mm bobbin flange — fewer turns, finer wire, or a taller flange.`);
    if (bobL + 2 > pktD) w.push(`Bobbin ${bobL} mm + flanges won't seat in the ${pktD} mm pocket depth.`);
    if (Ntot > capB) w.push(`Coil won't fit: ${Ntot} turns vs ≈ ${Math.floor(capB)} at this wire on a ${bobL} mm bobbin before the pocket ID (85% winding efficiency).`);
    if (Number.isFinite(brake.Ipull) && brake.Ipull > Ib) w.push(`Pull-in needs ${brake.Ipull.toFixed(2)} A but the bus only pushes ${Ib.toFixed(2)} A — the brake will not release at ${p.Vdc} V.`);
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
      const Bg6 = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * 1.05 * airgap) : 0;
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
      : ((Math.PI * (p.rotorOD / 1000) * (p.stackL / 1000)) / NsP) / Math.max((1.05 * airgap + p.magT / mag.mur) / 1000, 1e-5) / (kE * 2));
    const tauS = Ls / Math.max(Rs, 1e-6);
    const rpmC2 = (Math.max(p.Vdc - p.Imax * Rs, 0) / Math.max(KtPh * kE, 1e-9)) * (60 / (2 * Math.PI)); // ω where bemf eats bus
    const Jr = 0.5 * 7800 * Math.PI * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000) * 0.9; // rotor inertia, kg·m²
    const stiffS = Th * kE;                                          // N·m/rad at equilibrium
    const f0 = (1 / (2 * Math.PI)) * Math.sqrt(stiffS / Math.max(Jr, 1e-9)); // single-step natural freq
    step = { angle: stepA, stepsRev: 4 * kE, kind: hyb ? "hybrid" : "PM", wire, leads,
      Th, Th1, Th2, detent: Td, Kt: KtPh, Rs, Ls, tau: tauS, rpmC: Math.max(rpmC2, 0), kE,
      teethPP, tPitch, BtBias, stiff: stiffS, f0, J: Jr, on2, thArr: thArr6, tArr: tArr6, tNxt: tNxt6, tDet: tDet6 };
    op = { n: 0, T: Th }; peakT = Th; noLoad = 0;
    Kt = KtPh;
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
    Kt = (poles * Z * PhiP) / (2 * Math.PI * A2);                   // = Ke in SI
    const Ra = ((RHO_CU * ((MLT / 2) * Z)) / (A2 * A2 * aBare * 1e-6)) * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
    // armature inductance seen at the brushes: airgap term (magnets ≈ air) + slot-leakage adder
    const geB = Math.max((airgap * kcGap + p.magT / mag.mur) / 1000, 1e-5);
    const NeffA = Z / (2 * A2);
    const La = 1.3 * (2 / Math.PI) * (4e-7 * Math.PI) * ((D * L) / geB) * ((NeffA * NeffA) / (poles * poles));
    VphAvail = Math.max(p.Vdc - Math.max(p.brushV, 0), 0);
    if (Kt > 0 && Ra > 0) {
      const wNL = VphAvail / Kt;
      noLoad = (wNL * 60) / (2 * Math.PI);
      peakT = Kt * Math.min(p.Imax, VphAvail / Ra);
      TstallW = Kt * (VphAvail / Ra);
      baseN = ((Math.max(VphAvail - p.Imax * Ra, 0) / Kt) * 60) / (2 * Math.PI);
      for (let i = 0; i <= 80; i++) {
        const wm = (wNL * i) / 80;
        curve.push({ n: (wm * 60) / (2 * Math.PI), T: Kt * Math.min(Math.max((VphAvail - Kt * wm) / Ra, 0), p.Imax) });
      }
      op = { n: ((Math.max(VphAvail - Iph * Ra, 0) / Kt) * 60) / (2 * Math.PI), T: Kt * Math.min(Iph, p.Imax) };
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
    const Bg4 = airgap > 0 ? (0.9 * BrT * p.magT) / (p.magT + mag.mur * 1.05 * (airgap + tw)) : 0;
    const sect = Math.max(Math.round(p.latmSect), 1);
    const spanR = (Math.max(p.latmSpan, 5) * Math.PI) / 180;
    const Ntot = p.turns * sect;                                    // turns/sector × sectors
    const rR = p.rotorOD / 2000, Lz = p.stackL / 1000;
    const coreD = Math.max((p.statorOD - p.statorID) / 2, 0.5);     // ring radial depth from OD/ID
    const MLTt = 2 * (p.stackL + 2 * coreD + 3 * tw);               // toroidal turn length, mm
    const Ra2 = ((RHO_CU * (MLTt / 1000) * Ntot) / (aBare * 1e-6 * Math.max(p.strands, 1))) * (1 + 0.00393 * (p.Tcu - 20)) + Math.max(p.Rext, 0) / 1000;
    const L4 = ((4e-7 * Math.PI) / Math.PI) * (((p.rotorOD / 1000) * (p.stackL / 1000)) / Math.max((1.05 * airgap + tw + p.magT / mag.mur) / 1000, 1e-5)) * ((Ntot * Ntot) / (poles * poles));
    const Idrv = Math.min(p.Imax, Ra2 > 0 ? p.Vdc / Ra2 : p.Imax);  // two-wire: supply/Ra, clamped by the drive limit
    // ---- torque vs angle: circular cross-correlation of the alternating pole field (fringing-
    //      smoothed square) with the alternating sector current sheet; trapezoid shape falls out ----
    const NPH = 720;
    const wrapPi = (x) => { let y = x % (2 * Math.PI); if (y > Math.PI) y -= 2 * Math.PI; if (y < -Math.PI) y += 2 * Math.PI; return y; };
    const arcHalf = ((p.poleArc / 100) * Math.PI) / poles;          // mech half pole-arc
    const sigF = Math.max((1.05 * airgap + tw + p.magT / mag.mur) / Math.max(p.rotorOD / 2, 1), 0.01); // fringing angle, rad
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
    const Rbar = (rhoBar * (p.stackL / 1000)) / Math.max(p.barA * 1e-6, 1e-9);
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
  const feTerm = (B) => {
    const b = Math.min(B, 2.4) / 1.5;
    return (1 - efFe) * Math.pow(b, 1.8) * (fe / 60) + efFe * b * b * Math.pow(fe / 60, 2);
  };
  const Pfe = latmE || brkE ? 0 : (mYoke * feTerm(By) + mTeeth * feTerm(Bt)) * stM.w;
  const eta = Pout > 0 ? Pout / (Pout + Pcu + Pfe) : 0;

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
      return 4.44 * fBd * kwH(k) * Nser * ((2 * bk * D * L) / poles); // rms, per phase
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
    const gp = (airgap * 1.05 + p.magT / mag.mur) / 1000; // effective magnetic gap, m
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
    const Tpk = Math.max(...tArr.map(Math.abs));
    const Trms = Math.sqrt(tArr.reduce((a4, v) => a4 + v * v, 0) / tArr.length);
    cog = { Ncog, perDeg, thArr, tArr, Tpk, Trms, Tpp: Math.max(...tArr) - Math.min(...tArr) };
  }

  if (p.motorType === "induction" && Eph > Vph) w.push("Back-EMF exceeds supply phase voltage — lower turns, B̂g, or frequency.");
  if (q < 0.25) w.push("Slots per pole per phase is very low (q = " + q.toFixed(2) + ").");

  // ---- AC copper (skin/proximity) and windage at the rated point ----
  const feOp = op && p.motorType === "pm" ? (op.n * poles) / 120 : p.freq;
  let acFr = 1;
  if (feOp > 0 && dBare > 0) {
    const delta = Math.sqrt(RHO_CU / (Math.PI * feOp * 4e-7 * Math.PI)) * 1000; // skin depth, mm
    const xi = dBare / delta;
    const NlL = Math.ceil(Math.sqrt(Math.max(condPerSlot, 1)));
    acFr = Math.min(1 + ((5 * NlL * NlL - 1) / 45) * Math.pow(xi, 4), 4);
  }
  const Pwind = op ? 0.01 * Math.PI * 1.2 * Math.pow((op.n * 2 * Math.PI) / 60, 3) * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000) : 0;

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
    therm = { Tcu: Tc, Rth: RthTot, Icont, Tcont: Kt * Math.min(Icont, p.Imax), mCu, tauW, tauM, TcuDuty, duty: duty9 };
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
    therm = { Tcu: Tc, Rth: RthTot, Icont, Tcont: Kt * Math.min(Icont, p.Imax), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  } else {
    let Tc = p.Tamb + 40;
    for (let it3 = 0; it3 < 10; it3++) {
      const Rh3 = Rphase * (1 + 0.00393 * (Tc - 20)) + Math.max(p.Rext, 0) / 1000;
      const Pc3 = 3 * Iph * Iph * Rh3;
      Tc = p.Tamb + Pc3 * (RthCu + RthOut) + Pfe * RthOut;
    }
    const RhMax = Rphase * (1 + 0.00393 * (p.TcuMax - 20)) + Math.max(p.Rext, 0) / 1000;
    const PcuAllow = Math.max((p.TcuMax - p.Tamb - Pfe * RthOut) / (RthCu + RthOut), 0);
    const Icont = Math.sqrt(PcuAllow / (3 * Math.max(RhMax, 1e-6)));
    const mCu = 8960 * 3 * MLT * coilsPerPhase * Math.max(p.turns, 1) * Math.max(p.strands, 1) * aBare * 1e-6;
    const tauW = mCu * CP_CU * RthCu, tauM = (mCu * CP_CU + coreMass * CP_FE) * RthOut;
    let TcuDuty = null;
    if (duty9 < 1) {
      const pf = pulseF(tauW);
      let Td = p.Tamb + 30;
      for (let it4 = 0; it4 < 8; it4++) {
        const Rh4 = Rphase * (1 + 0.00393 * (Td - 20)) + Math.max(p.Rext, 0) / 1000;
        const Pc4 = 3 * Iph * Iph * Rh4;
        Td = p.Tamb + (Pc4 + Pfe) * duty9 * RthOut + Pc4 * RthCu * pf;
      }
      TcuDuty = Td;
    }
    therm = { Tcu: Tc, Rth: RthCu + RthOut, Icont, Tcont: Kt * Math.min(Icont, p.Imax), mCu, tauW, tauM, TcuDuty, duty: duty9 };
  }


  return {
    err, warn: w, Ns, poles, airgap, hs, w1, w2, slotArea, usableArea,
    dBare, dIns, aBare, condPerSlot, fillGross, fillCu, fillInsSlot, fillCuSlot, q, span, kw, rcFil, ksat, kIT,
    Nser, MLT, Rphase, Rll, Iph, Iline: IlineOut, Istall, Vph, Arms,
    Trated, nSync, nShaft, Pout, Pcu, eta, Eph, Ke, Kt, VphAvail,
    rotation, topLayer, botLayer, layers, curve, op, noLoad, peakT, baseN,
    mag, BrT, HcJT, HcJmin, demagT, kcGap, BgAvg, B1, BgEff, Hdemag, demagMargin,
    MLTmm, endSide, tb, coilOD, coilDia, bobSuggest, coilArc,
    stM, rtM, Bt, By, Byr, hyr, coreMass, Bavg, TstallW, Jimp, bemf, Rhot, cog,
    Lph, LphNR, Lll, LllNR, acim, therm, acFr, Pwind, Pfe, feOp, brush, latm, brake, step,
  };
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
  const twv = Math.max(p.latmWind, 0.5) * k;
  const rWo = rCo + Math.min(twv, 10), rWi = Math.max(rCi - Math.min(twv, 10), 8); // winding wrap past both faces
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
        travel {(r.latm ? r.latm.travel : p.latmTravel).toFixed(0)}° · {sect} sectors × {p.latmSpan}° · ⊗/⊙ = sector current, flips with polarity</text>
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
        <circle cx={cx} cy={cy} r={rSh} fill="#5B6874" stroke={INK} />
        <circle cx={cx} cy={cy} r={rSh * 0.35} fill={CREAM} />
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

function TorqueSpeedChart({ r, us }) {
  const W = 330, H = 240, mL = 50, mB = 36, mT = 14, mR = 14;
  if (!r.curve.length) return null;
  const tMaxNm = Math.max(...r.curve.map((c) => c.T), r.op ? r.op.T : 0, 0.1);
  const cu = us === "in"
    ? (tMaxNm * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : { k: 1, u: "N·m" };
  const nMax = Math.max(...r.curve.map((c) => c.n), r.noLoad || 0, 1) * 1.05;
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
      <path d={path} fill="none" stroke={COPPER} strokeWidth="2.5" />
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


function EfficiencyMap({ r, p, us }) {
  if (p.motorType !== "pm" || !(r.Kt > 0) || !(r.noLoad > 0) || !r.curve.length) return null;
  const W = 340, H = 240, mL = 44, mB = 34, mT = 12, mR = 12;
  const cv = [...r.curve].sort((a, b) => a.n - b.n);
  const tAt = (n) => {
    if (n <= cv[0].n) return cv[0].T;
    for (let i = 1; i < cv.length; i++) if (cv[i].n >= n) {
      const f = (n - cv[i - 1].n) / Math.max(cv[i].n - cv[i - 1].n, 1e-9);
      return cv[i - 1].T + f * (cv[i].T - cv[i - 1].T);
    }
    return 0;
  };
  const nMax = r.noLoad, tMax = Math.max(...cv.map((c) => c.T));
  const NC = 14, NR = 10;
  const col = (e) => (e < 0.7 ? "#DC2626" : e < 0.8 ? "#F59E0B" : e < 0.88 ? "#FDE047" : e < 0.93 ? "#86EFAC" : "#10B981");
  const cells = [];
  for (let i = 0; i < NC; i++) for (let j = 0; j < NR; j++) {
    const n = (nMax * (i + 0.5)) / NC, T = (tMax * (j + 0.5)) / NR;
    if (T > tAt(n) || T <= 0 || n <= 0) continue;
    const I = T / r.Kt;
    const fe = (n * r.poles) / 120;
    const delta = Math.sqrt(1.724e-8 / (Math.PI * Math.max(fe, 1) * 4e-7 * Math.PI)) * 1000;
    const NlL = Math.ceil(Math.sqrt(Math.max(r.condPerSlot, 1)));
    const Fr = Math.min(1 + ((5 * NlL * NlL - 1) / 45) * Math.pow(r.dBare / delta, 4), 4);
    const Pcu = 3 * I * I * r.Rhot * Fr;
    const Pfe2 = r.Pfe * Math.pow(n / Math.max(r.nShaft, 1), 1.5);
    const Pw2 = 0.01 * Math.PI * 1.2 * Math.pow((n * 2 * Math.PI) / 60, 3) * Math.pow(p.rotorOD / 2000, 4) * (p.stackL / 1000);
    const Pout = (T * n * 2 * Math.PI) / 60;
    const eta = Pout / Math.max(Pout + Pcu + Pfe2 + Pw2, 1e-6);
    cells.push(<rect key={i + "-" + j} x={mL + ((W - mL - mR) * i) / NC} y={H - mB - ((H - mB - mT) * (j + 1)) / NR}
      width={(W - mL - mR) / NC - 1} height={(H - mB - mT) / NR - 1} fill={col(eta)} opacity="0.85" />);
  }
  const tqU = us === "in" ? 141.612 : 1;
  return (
    <svg id="svg-effmap" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} className="chart">
      <style>{SVGCSS}</style>
      {cells}
      <line x1={mL} y1={H - mB} x2={W - mR} y2={H - mB} stroke={AXIS} />
      <line x1={mL} y1={mT} x2={mL} y2={H - mB} stroke={AXIS} />
      {[0, 0.5, 1].map((f) => <text key={"x" + f} x={mL + (W - mL - mR) * f} y={H - mB + 14} textAnchor="middle" className="tick">{Math.round(nMax * f)}</text>)}
      {[0, 0.5, 1].map((f) => <text key={"y" + f} x={mL - 5} y={H - mB - (H - mB - mT) * f + 3} textAnchor="end" className="tick">{(tMax * tqU * f).toFixed(0)}</text>)}
      <text x={(W + mL) / 2} y={H - 4} textAnchor="middle" className="axis">speed (rpm)</text>
      <text x={12} y={(H - mB) / 2} textAnchor="middle" transform={`rotate(-90 12 ${(H - mB) / 2})`} className="axis">torque ({us === "in" ? "oz·in" : "N·m"})</text>
      {r.op && <circle cx={mL + ((W - mL - mR) * r.op.n) / nMax} cy={H - mB - ((H - mB - mT) * r.op.T) / tMax} r="4" fill="#111827" />}
    </svg>
  );
}

function CurrentTorqueChart({ r, p, us }) {
  if (!(r.Kt > 0) || (p.motorType !== "pm" && p.motorType !== "brushed")) return null;
  const W = 330, H = 220, mL = 46, mB = 36, mT = 14, mR = 14;
  const cuMaxNm = Math.max(r.peakT, r.op ? r.op.T : 0, 1e-3);
  const cu = us === "in"
    ? (cuMaxNm * 141.612 < 320 ? { k: 141.612, u: "oz·in" } : { k: 8.8507, u: "lb·in" })
    : { k: 1, u: "N·m" };
  const tAxNm = cuMaxNm * 1.18;                       // room to show the faint continuation
  const iMax = Math.max(p.Imax, r.Iph) * 1.18;
  const X = (tNm) => mL + ((W - mL - mR) * tNm) / tAxNm;
  const Y = (i) => H - mB - ((H - mB - mT) * i) / iMax;
  const bend = (I) => I * (1 - (1 - (r.kIT || 1)) * Math.pow(Math.min(I / Math.max(p.Imax, 1e-6), 1.5), 2));
  const iAt = (tNm) => { let lo = 0, hi = iMax * 1.6; for (let k2 = 0; k2 < 42; k2++) { const m2 = (lo + hi) / 2; if (r.Kt * bend(m2) < tNm) lo = m2; else hi = m2; } return (lo + hi) / 2; };
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
      {/* I = T / Kt: solid to the drive-limited stall, faint beyond */}
      <line x1={X(0)} y1={Y(0)} x2={X(r.peakT)} y2={Y(iAt(r.peakT))} stroke={COPPER} strokeWidth="2.5" />
      <line x1={X(r.peakT)} y1={Y(iAt(r.peakT))} x2={X(Math.min(tAxNm, r.TstallW || tAxNm))}
        y2={Y(iAt(Math.min(tAxNm, r.TstallW || tAxNm)))} stroke={STEEL_DK} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.45" />
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

function SlotDetail({ p, r, us }) {
  if (p.motorType === "brushed") return <BrushedSlotDetail p={p} r={r} us={us} />;
  const L = (mm, d = 3) => (us === "in" ? (mm / INCH).toFixed(d) : mm.toFixed(2));
  if (!(r.hs > 0) || !(r.w1 > 0.2))
    return <div className="warn errb">Slot geometry invalid — no room between bore, yoke and tooth tips. Reduce yoke/tooth or grow the OD.</div>;
  const W = 360, H = 290, Ns = r.Ns;
  const r0 = p.statorID / 2, r1 = r0 + p.tipH, r2 = r1 + r.hs, r3 = r2 + p.yoke, rRt = p.rotorOD / 2;
  const rc = r.rcFil || 0, pitch = (2 * Math.PI) / Ns;
  const dAng = 1.5 * pitch;                                   // ±1.5 slot pitches: center slot + neighbors
  const rIn = Math.max(rRt - Math.max(p.magT, 0) - Math.min(5, rRt * 0.3), 1);
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
  if (p.motorType === "latm") hEnd = Math.max(p.latmWind, 0.5);      // toroid wrap thickness past each end
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
              bobbin-wound coil in the pocket, springs, sliding armature, friction disc on a splined hub,
              pressure plate. Disc/hub/pressure plate are axially anchored; only the armature slides.
              ▶ toggles power: OFF = springs clamp; ON = armature pulled in, SEPARATING from the disc. */}
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
            const xBob0 = xPkt0 + 1.5, xBob1 = Math.min(xBob0 + bobLpx, xPkt1 - 1);
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
                {/* armature (only moving part) */}
                {bandV(xArm, xArm + tArm, rThrum, rODm, "#7C9885", "arm")}
                {/* friction disc + hub + pressure plate: FIXED */}
                {bandV(xDisc, xDisc + tD, riLm, roLm, "#3F3F46", "disc")}
                {bandV(xPP, xDisc, rThrum * 0.8, rODm, "#5B7B9A", "pp")}
                <rect x={xPP - 6} y={Y(riLm)} width={(xDisc + tD - xPP) + 12} height={riLm * 2 * k} fill="#B5C9A5" stroke="#334155" strokeWidth="0.9" />
                <rect x={xPP - 26} y={yC - Math.max((p.shaftD / 2) * k, 3.5)} width={xWall + 20 - (xPP - 26)}
                  height={Math.max((p.shaftD / 2) * k, 3.5) * 2} fill="#9AA3AE" stroke="#334155" />
                {/* separation: engaged = armature face on disc; released = gap opens armature↔disc */}
                {on && <g>
                  <line x1={xDisc + tD} y1={yC - roLm * k * 0.7} x2={xArm} y2={yC - roLm * k * 0.7} stroke="#059669" strokeWidth="1.6" />
                  <text x={(xDisc + tD + xArm) / 2} y={yC - roLm * k * 0.7 - 4} textAnchor="middle" className="dim">disc free</text>
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
                <text x={xPP + tPP / 2 + 3} y={yC} textAnchor="middle" className="wnum"
                  transform={`rotate(-90 ${xPP + tPP / 2 + 3} ${yC})`}>pressure plate</text>
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
            const twm = Math.max(p.latmWind, 0.5);
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
      const base = { ...p, motorType: "brake", statorOD: od, stackL: stk, shaftD: Math.max(bore - 2, 3),
        brkBore: bore, brkRo: ro9, brkRi: ri9, brkSpring: Math.round(Fspr), brkK: kSpr, brkSpringN: od < 45 ? 4 : 6,
        brkStroke: stroke, brkArm: +Math.max(od / 10, 3).toFixed(1), brkFaces: 2, brkMu: 0.40, brkMuD: 0.32,
        brkMat: "Organic (resin-bonded)", brkBossOD: boss, brkPktID: pktID, brkPktD: pktD,
        brkBobID: +(boss + 2.2).toFixed(1), brkBobOD: pktID - 1, brkBobL: Math.max(pktD - 2.5, 3),
        brkPole: 6, Vdc, Imax: Math.max(Imax, 0.5), loadMode: "J", strands: 1, endMode: "auto", seq: "ABC",
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
      msg: `Brake: boss Ø${q.brkBossOD} / pocket Ø${q.brkPktID} × ${q.brkPktD} mm deep, ${q.turns}t AWG ${q.awg}, springs ${q.brkSpring} N. ` +
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

export default function MotorDesigner() {
  const [p, setP] = useState({
    slots: 36, poles: 8, statorOD: 150, statorID: 90, rotorOD: 89,
    yoke: 12, toothW: 5.4, slotOpen: 2.5, tipH: 1.5, stackL: 80, liner: 0.25, slotR: 0,
    pattern: "lap", layers: 2, span: 0, turns: 2, awg: 14, strands: 2, paths: 1, insBuild: "Heavy",
    conn: "wye", vref: "ll", motorType: "pm", ctrl: "foc", sense: "hall",
    mag: "N45SH", magT: 4, poleArc: 85, Top: 60,
    endMode: "auto", headH: 15, bobShape: "race", bobD: 30, bobWall: 1, bobWin: 16,
    statorMat: "M19 (29 ga)", rotorMat: "1018 steel (solid)", shaftD: 15,
    loadMode: "J", Irate: 5, bdRpm: 1800, Tcu: 100, Rext: 20,
    Tamb: 25, cooling: "Open air", TcuMax: 130, Tmin: -40, dutyPct: 100, cycleT: 10, brkEco: 100,
    mR: 0, mL: 0, mKe: 0, mNl: 0,
    gbType: "None", gbRatio: 10, gbStages: 1, gbEff: 0,
    brushV: 1.5, latmWind: 2,
    brkSpring: 200, brkRf: 20, brkMu: 0.40, brkMuD: 0.32, brkFaces: 2, brkStroke: 0.3,
    brkBore: 26, brkPole: 6, brkArm: 6, brkK: 40, brkSpringN: 6, brkRo: 27, brkRi: 18, brkMat: "Organic (resin-bonded)",
    brkPktID: 48, brkBossOD: 38, brkPktD: 18, brkBobID: 40.2, brkBobOD: 47, brkBobL: 15,
    stpNr: 50, stpKind: "hybrid", stpPP: 12, stpWire: "bip-ser", stpOn: 2, latmSect: 4, latmSpan: 60, latmTravel: 45,
    rotorBars: 28, barA: 60, ringA: 120, barMat: "Cast aluminum",
    Vll: 400, Vdc: 48, Imax: 40, freq: 50, slip: 3, sb: 18, J: 5.5, Bg: 0.85, seq: "ABC",
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
    if (saved) { setP({ ...saved, motorType: nt }); return; }
    if (TYPE_DEFAULTS[nt] && PRESETS[TYPE_DEFAULTS[nt]]) {
      setP((o) => ({ ...o, ...PRESETS[TYPE_DEFAULTS[nt]] }));
      setIoMsg("Loaded starting point: " + TYPE_DEFAULTS[nt] + " — see Start ▸ Presets for the others. Your previous machine's parameters are kept and restore when you toggle back.");
      return;
    }
    setP((o) => ({ ...o, motorType: nt }));
  };
  const r = useMemo(() => computeDesign(p), [p]);
  const pm = p.motorType === "pm" || p.motorType === "brushed";
  const brM = p.motorType === "brushed";
  const latmM = p.motorType === "latm";
  const brkM = p.motorType === "brake", stpM = p.motorType === "stepper";
  // envelope architecture follows the globally selected machine type
  const wArch = ({ pm: "pm", brushed: "brushed", latm: "latm", stepper: "stepper", brake: "brake", induction: "acim" })[p.motorType] || "pm";
  const special = latmM || brkM || stpM;

  const exportDesign = () => {
    const payload = { tool: "motrsynth", version: 10, saved: new Date().toISOString(), units: us, design: p };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `motor-${p.slots}s${p.poles}p-${p.motorType}.json`;
    el.click();
    URL.revokeObjectURL(url);
    setIoMsg("Design exported.");
  };
  const importDesign = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (j && (j.units === "in" || j.units === "mm")) setUs(j.units);
        const src = j && j.design ? j.design : j; // accept bare or wrapped JSON
        setP((o) => {
          const n = { ...o };
          let hits = 0;
          Object.keys(o).forEach((k) => {
            if (k in src && typeof src[k] === typeof o[k]) { n[k] = src[k]; hits++; }
          });
          // legacy brake files: bobbin OD used to be the winding START (bore/barrel pair, ~1.6 mm apart).
          // Migrate to winding-window semantics: start = old OD, max finish = pocket − 1 mm.
          let migrated = false;
          if (n.motorType === "brake" && Number.isFinite(n.brkBobID) && Number.isFinite(n.brkBobOD) &&
              n.brkBobOD - n.brkBobID < 3 && n.brkPktID - n.brkBobOD > 3) {
            n.brkBobID = n.brkBobOD;
            n.brkBobOD = +(n.brkPktID - 1).toFixed(1);
            migrated = true;
          }
          setIoMsg(hits ? `Imported ${f.name} (${hits} parameters).${migrated ? " Bobbin fields migrated to winding-window semantics (start unchanged, max = pocket − 1 mm)." : ""}` : "No recognizable parameters in that file.");
          return n;
        });
      } catch {
        setIoMsg("Could not read that file — expected JSON exported from this tool.");
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  };
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
        .seg{display:flex;border:1px solid #CBD5E1;border-radius:8px;overflow:hidden}
        .seg button{font:inherit;font-size:.7rem;padding:6px 9px;border:0;background:${BG};color:${CREAM_DIM};cursor:pointer;font-weight:500}
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
        <h1>Cortex<b>Edge</b> <span className="tool">· MotrSynth</span></h1>
        <div className="seg useg">
          <button className={us === "in" ? "on" : ""} onClick={() => setUs("in")}>inch</button>
          <button className={us === "mm" ? "on" : ""} onClick={() => setUs("mm")}>mm</button>
        </div>
      </header>
      <p className="eyebrow">Engineering Tools · Three-Phase BLDC Motor Designer</p>

      <div className="grid">
        {/* ============ inputs ============ */}
        <div>
          <div className="card" style={{ borderTop: "3px solid #3B82F6" }}>
            <h2>Architecture</h2>
            <Pick label="Machine type" v={p.motorType} set={switchType}
              opts={[{ v: "pm", t: "BLDC" }, { v: "brushed", t: "Brushed" }, { v: "latm", t: "LATM" }, { v: "stepper", t: "Step" }, { v: "induction", t: "ACIM" }, { v: "brake", t: "Brake" }]} />
            <div className="note">
              {p.motorType === "pm" ? "3-phase PM synchronous: stationary slotted stator, rotating magnet rotor."
                : p.motorType === "brushed" ? "Brushed PM DC: magnet ring fixed to the housing ID; the slotted lamination, coils, and commutator rotate as the armature."
                : p.motorType === "latm" ? "Limited-angle torquer: toroidal sector windings on a slotless core, PM rotor, ±excursion output."
                : p.motorType === "stepper" ? "Stepper: hybrid fine-tooth (1.8°-class) or PM can-stack (7.5°+)."
                : p.motorType === "brake" ? "Power-off spring-applied brake: annular electromagnet vs springs, friction disc output."
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
            <Num label="Slot corner radius" unit="mm" v={p.slotR} set={s("slotR")} step={0.1} min={0} />
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
            {!latmM && <Num label={stpM ? "Turns per pole (per strand)" : brkM ? "Coil turns (total)" : "Turns per coil"} v={p.turns} set={s("turns")} min={1} />}
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
                <Num label="Spring clamp force (engaged)" unit="N" v={p.brkSpring} set={s("brkSpring")} step={10} />
                <Num label="Economizer hold voltage" unit="%" v={p.brkEco} set={s("brkEco")} step={5} min={10} max={100} />
                <Num label="Spring rate (total)" unit="N/mm" v={p.brkK} set={s("brkK")} step={5} />
                <Num label="Spring count" v={p.brkSpringN} set={s("brkSpringN")} min={3} max={12} />
                <Sel label="Friction material" v={p.brkMat}
                  set={(v) => setP((o) => { const m = BRAKE_MATS[v]; return { ...o, brkMat: v, ...(m ? { brkMu: m.mus, brkMuD: m.mud } : {}) }; })}
                  opts={Object.keys(BRAKE_MATS)} />
                <Num label="Static friction µs" v={p.brkMu} set={s("brkMu")} step={0.02} />
                <Num label="Dynamic friction µd" v={p.brkMuD} set={s("brkMuD")} step={0.02} />
                <Num label="Lining OD" unit="mm" v={p.brkRo} set={s("brkRo")} />
                <Num label="Lining ID" unit="mm" v={p.brkRi} set={s("brkRi")} />
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
                <Num label="Winding temp" unit="°C" v={p.Tcu} set={s("Tcu")} step={5} />
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
            <Num label={brM ? "Lead / harness R" : "Drive + lead R / phase"} unit="mΩ" v={p.Rext} set={s("Rext")} step={5} min={0} />
            <Pick label="Rated loading by" v={p.loadMode} set={s("loadMode")}
              opts={[{ v: "J", t: "Current density" }, { v: "I", t: brM ? "Armature current" : "Phase current" }]} />
            {p.loadMode === "I"
              ? <Num label={brM ? "Rated armature current" : "Rated phase current"} unit="A" v={p.Irate} set={s("Irate")} step={0.5} min={0} />
              : <Num label="Current density J" unit="A/mm²" v={p.J} set={s("J")} step={0.5} />}
            {!pm && <Num label="Airgap flux B̂g" unit="T" v={p.Bg} set={s("Bg")} step={0.05} />}
            {p.motorType === "pm" && p.conn === "wye" && (
              <Pick label="Voltage reference" v={p.vref} set={s("vref")}
                opts={[{ v: "ll", t: "Line-line" }, { v: "ln", t: "L-N (center tap)" }]} />
            )}
            {brM
              ? <Pick label="Supply polarity" v={p.seq} set={s("seq")} opts={[{ v: "ABC", t: "Normal" }, { v: "ACB", t: "Reversed" }]} />
              : <Pick label="Phase sequence" v={p.seq} set={s("seq")} opts={[{ v: "ABC", t: "A-B-C" }, { v: "ACB", t: "A-C-B" }]} />}
          </div>
          {pm && (
            <div className="card" style={{ marginTop: 14 }}>
              <h2>{brM ? "Field magnets (housing ID)" : "Rotor magnets"}</h2>
              <Sel label="Grade" v={p.mag} set={s("mag")} opts={Object.keys(MAGNETS)} />
              <Num label="Magnet thickness" unit="mm" v={p.magT} set={s("magT")} step={0.5} min={0.5} />
              <Num label="Pole-arc coverage" unit="%" v={p.poleArc} set={s("poleArc")} step={5} min={40} max={100} />
              <Num label="Magnet temperature" unit="°C" v={p.Top} set={s("Top")} step={5} />
              <Num label="Cold-start temp" unit="°C" v={p.Tmin} set={s("Tmin")} step={5} min={-70} max={25} />
              <div className="tbl">
                <div className="kv"><span>Br @20 °C / @{p.Top} °C</span><b>{fmt(r.mag.Br)} / {fmt(r.BrT)} T</b></div>
                <div className="kv"><span>HcJ @{p.Top} °C</span><b>{fmt(r.HcJT, 0)} kA/m</b></div>
                <div className="kv"><span>BHmax / max temp</span><b>{r.mag.BH} kJ/m³ · {r.mag.Tmax} °C</b></div>
                <div className="kv"><span>Airgap B (avg / fund. peak)</span><b>{fmt(r.BgAvg)} / {fmt(r.B1)} T</b></div>
                <div className="kv"><span>Demag field @ {p.Imax} A{brM ? " (armature reaction)" : ""}</span><b>{fmt(r.Hdemag, 0)} kA/m</b></div>
                {!brM && <div className="kv"><span>Sat. knockdown (no-load / @Imax)</span><b>{(r.ksat * 100).toFixed(1)}% / {(r.ksat * r.kIT * 100).toFixed(1)}%</b></div>}
            <div className="kv"><span>Demag margin</span><b style={{ color: r.demagMargin < 0.3 ? "#DC2626" : "#059669" }}>{fmt(r.demagMargin * 100, 0)}%</b></div>
              </div>
              <div className="note">
                Typical catalog values in the style of the Arnold Magnetics N-grade and RECOMA (SmCo) tables —
                verify against the specific datasheet before cutting steel. Flux model: leakage 0.9, Carter 1.05,
                {brM ? " arc magnets bonded to the housing ID (steel MMF drops not iterated in this mode)."
                  : " surface-mounted magnets."}
              </div>
            </div>
          )}
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
                called out, and the engaged air gap. ▶ Play toggles power — only the armature moves; the disc,
                hub, and pressure plate stay put, so release visibly separates the pads.
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
            {!r.err.length && <TorqueSpeedChart r={r} us={us} />}
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
              <CurrentTorqueChart r={r} p={p} us={us} />
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
            <Num label={brM ? "Measured R terminal" : "Measured R line-line"} unit="mΩ" v={p.mR} set={s("mR")} step={10} min={0} />
            <Num label={brM ? "Measured L terminal" : "Measured L line-line"} unit="µH" v={p.mL} set={s("mL")} step={10} min={0} />
            {!latmM && !stpM && !brkM && <Num label={brM ? "Measured Ke terminal" : "Measured Ke line-line"} unit="V/krpm" v={p.mKe} set={s("mKe")} step={0.1} min={0} />}
            {!latmM && !stpM && !brkM && <Num label="Measured no-load" unit="rpm" v={p.mNl} set={s("mNl")} step={100} min={0} />}
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
                  add("Ke term", r.Kt * ((1000 * 2 * Math.PI) / 60), p.mKe, "V/krpm");
                  add("No-load", r.noLoad, p.mNl, "rpm");
                } else {
                  add("R L-L", r.Rll * 1000, p.mR, "mΩ");
                  add("L L-L", r.Lll * 1e6, p.mL, "µH");
                  add("Ke L-L", r.Ke * Math.sqrt(3) * ((1000 * 2 * Math.PI) / 60), p.mKe, "V/krpm");
                  add("No-load", r.noLoad, p.mNl, "rpm");
                }
                return rows.length ? rows : <div className="kv"><span>Enter measurements to compare</span><b>—</b></div>;
              })()}
            </div>
            <div className="note">
              Persisted in the design file. R error ⇒ end-turn/MLT model (or wire gauge); L error ⇒ leakage
              permeance; Ke/no-load error ⇒ magnet Br, temperature, or effective airgap. Green ≤7%, amber ≤15%.
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
                <div className="kv"><span>Coil resistance (hot)</span><b>{fmt(r.latm.Ra, 2)} Ω</b></div>
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

          {!special && <div className="card paper" style={{ marginTop: 14 }}>
            <h2>Gearbox / actuator</h2>
            <Pick label="Type" v={p.gbType} set={s("gbType")}
              opts={[{ v: "None", t: "None" }, { v: "Spur", t: "Spur" }, { v: "Planetary", t: "Planet." }, { v: "Harmonic", t: "Harmonic" }, { v: "Worm", t: "Worm" }]} />
            {p.gbType !== "None" && (
              <>
                <Num label="Overall ratio" unit=":1" v={p.gbRatio} set={s("gbRatio")} min={1} />
                <Num label="Stages" v={p.gbStages} set={s("gbStages")} min={1} max={4} />
                <Num label="Efficiency override (0 = auto)" unit="%" v={p.gbEff} set={s("gbEff")} min={0} max={100} />
                {(() => {
                  const N = Math.max(p.gbRatio, 1);
                  const effAuto = p.gbType === "Harmonic" ? 0.85
                    : p.gbType === "Worm" ? Math.max(0.9 - (0.05 * N) / 10, 0.4)
                    : Math.pow(0.97, Math.max(p.gbStages, 1));
                  const eff = p.gbEff > 0 ? p.gbEff / 100 : effAuto;
                  const spr = Math.pow(N, 1 / Math.max(p.gbStages, 1));
                  return (
                    <>
                      <div className="tbl" style={{ marginTop: 8 }}>
                        <div className="kv"><span>Efficiency η {p.gbEff > 0 ? "" : "(auto)"}</span><b>{(eff * 100).toFixed(0)}%</b></div>
                        <div className="kv"><span>Output no-load</span><b>{fmt(r.noLoad / N, 0)} rpm</b></div>
                        <div className="kv"><span>Output rated point</span><b>{r.op ? fmt(r.op.n / N, 0) + " rpm · " + tqS(r.op.T * N * eff) : "—"}</b></div>
                        <div className="kv"><span>Output peak (drive-limited)</span><b>{tqS(r.peakT * N * eff)}</b></div>
                        <div className="kv"><span>Output continuous (S1)</span><b>{r.therm ? tqS(r.therm.Tcont * N * eff) : "—"}</b></div>
                        <div className="kv"><span>Load inertia reflected to motor</span><b>÷ {(N * N).toFixed(0)}</b></div>
                        <div className="kv"><span>Ratio per stage</span><b>{spr.toFixed(1)}:1</b></div>
                        {p.gbType === "Planetary" && (() => {
                          const Zs = 15, Zr = Math.round(Zs * (spr - 1)), Zp = Math.floor((Zr - Zs) / 2);
                          const ok = (Zr - Zs) % 2 === 0 && (Zs + Zr) % 3 === 0;
                          return <div className="kv"><span>Teeth / stage (sun/planet/ring)</span>
                            <b>{Zs}/{Zp}/{Zr}{ok ? "" : " ⚠ adjust for 3-planet assembly"}</b></div>;
                        })()}
                        {p.gbType === "Harmonic" && (
                          <div className="kv"><span>Flexspline / circular teeth</span><b>{Math.round(2 * N)}/{Math.round(2 * N) + 2}</b></div>
                        )}
                        <div className="kv"><span>Gearhead OD (est)</span><b>{us === "in" ? ((p.statorOD * (p.gbType === "Harmonic" ? 1.0 : 1.1)) / 25.4).toFixed(2) + " in" : Math.round(p.statorOD * (p.gbType === "Harmonic" ? 1.0 : 1.1)) + " mm"}</b></div>
                      </div>
                      {p.gbType !== "Harmonic" && p.gbType !== "Worm" && spr > 7 && (
                        <div className="warn">Stage ratio {spr.toFixed(1)}:1 is high for a {p.gbType.toLowerCase()} train — add a stage (practical ≤ 6–7:1).</div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
            <div className="note">
              Transmission applied to the continuous-rotation output: torque × N·η, speed ÷ N, load inertia ÷ N².
              Backlash, stiffness, and the gearhead's own torque rating are not modeled — check its datasheet limits.
            </div>
          </div>}

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
      </div>

      <footer className="ft">
        <span>CortexEdge · MotrSynth</span><span>·</span>
        <span>Ad-free</span><span>·</span>
        <span>No account required</span><span>·</span>
        <a href="mailto:CortexEdge@outlook.com">CortexEdge@outlook.com</a>
      </footer>
    </div>
    </UnitCtx.Provider>
  );
}
