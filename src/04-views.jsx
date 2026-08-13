/* MotrWorks module 04 — views: charts, drawings, SVG components, input controls */

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
    if (!(p.gbEff > 0)) A.push({ t: "Per-stage efficiency", r: "miniature-class catalog values: planetary 90%, spur 93%, harmonic 80% — compounded per stage; premium units differ, enter the datasheet value" });
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
      {tLimit && Number.isFinite(tLimit.T) && <g>
        <line x1={X(tLimit.T)} y1={mT} x2={X(tLimit.T)} y2={H - mB} stroke="#DC2626" strokeWidth="1.3" strokeDasharray="5 4" opacity="0.85" />
        <text x={X(tLimit.T) - 4} y={mT + 10} textAnchor="end" className="tick" style={{ fill: "#DC2626" }}>{tLimit.label}</text>
      </g>}
      {/* analytical ghost: same solver on the uncompensated constants */}
      {gR && (() => {
        const bendG = (I) => I * (1 - (1 - (gR.kIT || 1)) * Math.pow(Math.min(I / Math.max(p.Imax, 1e-6), 1.5), 2));
        const iAtG = (tNm) => { let lo = 0, hi = iMax * 1.6; for (let k2 = 0; k2 < 42; k2++) { const m2 = (lo + hi) / 2; if (gR.Kt * bendG(m2) < tNm) lo = m2; else hi = m2; } return (lo + hi) / 2; };
        return <g>
          <line x1={X(0)} y1={Y(0)} x2={X(gR.peakT)} y2={Y(iAtG(gR.peakT))} stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" opacity="0.8" />
          <line x1={W - mR - 96} y1={mT + 6} x2={W - mR - 78} y2={mT + 6} stroke={COPPER} strokeWidth="2.5" />
          <text x={W - mR - 74} y={mT + 9} className="tick">compensated</text>
          <line x1={W - mR - 96} y1={mT + 18} x2={W - mR - 78} y2={mT + 18} stroke={STEEL_DK} strokeWidth="1.6" strokeDasharray="6 4" />
          <text x={W - mR - 74} y={mT + 21} className="tick">analytical</text>
        </g>;
      })()}
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

