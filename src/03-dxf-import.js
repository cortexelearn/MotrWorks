/* MotrWorks module 03 — DXF import: parser + lamination geometry analyzer */
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


