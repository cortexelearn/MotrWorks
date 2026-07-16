/* MotrSynth module 04 — views: charts, drawings, SVG components, input controls */

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

/* ---- Actuator composite outline: gearhead > motor > brake on one axial section ---- */
function ActuatorOutline({ motorP, brakeP, act, withBrk, us, gbOD, gbLen }) {
  const dl = (mm) => (us === "in" ? (mm / 25.4).toFixed(2) + "\u2033" : Math.round(mm) + " mm");
  // component envelopes (mm) — first-order typical proportions, disclosed below
  const modOD = motorP.statorOD, stk = motorP.stackL;
  const ovh = motorP.headH > 0 ? motorP.headH : Math.max(0.16 * modOD, 5); // coil head axial overhang / side
  const Lm = stk + 2 * (ovh + 3);                                          // stack + heads + endbells
  const gODa = modOD * (act.type === "Harmonic" ? 1.0 : 1.1);
  const gOD = gbOD > 0 ? gbOD : gODa;                                      // specified envelope wins
  const perStage = act.type === "Harmonic" ? 0.55 : act.type === "Planetary" ? 0.42 : 0.34;
  const Lg = gbLen > 0 ? gbLen : gODa * (perStage * act.st + 0.22);        // stages + output bearing block
  const hasB = withBrk && brakeP;
  const bOD = hasB ? brakeP.statorOD : 0;
  const Lb = hasB ? brakeP.stackL + (brakeP.brkArm || 4) + 4 : 0;          // backiron + armature/disc pack
  const shD = Math.max(motorP.shaftD || 5, 3);
  const oShD = Math.max(gOD * 0.16, shD);
  const Ltot = Lg + Lm + Lb, stub = 12;
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
      {/* centerline + through shaft */}
      <line x1={16} y1={yC} x2={W - 12} y2={yC} stroke="#94A3B8" strokeWidth="0.7" strokeDasharray="9 3 2 3" />
      <rect x={X0} y={yC - (shD / 2) * k} width={(Ltot) * k} height={shD * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" />
      {/* output shaft stub */}
      <rect x={X0 - stub * k} y={yC - (oShD / 2) * k} width={stub * k} height={oShD * k} fill="#8A97A8" stroke="#334155" strokeWidth="0.9" />
      {/* gearhead: housing, stage dividers, ring band */}
      {blk(0, Lg, gOD, "#B9C2CE", "g")}
      <rect x={X0} y={yC - R(gOD)} width={Lg * k} height={5} fill="#8A97A8" />
      <rect x={X0} y={yC + R(gOD) - 5} width={Lg * k} height={5} fill="#8A97A8" />
      {Array.from({ length: act.st - 1 }, (_, i9) => {
        const xd = X0 + (Lg * 0.22 + ((Lg * 0.78) / act.st) * (i9 + 1)) * k;
        return <line key={"st" + i9} x1={xd} y1={yC - R(gOD) + 5} x2={xd} y2={yC + R(gOD) - 5} stroke="#64748B" strokeWidth="0.8" strokeDasharray="4 3" />;
      })}
      <text x={X0 + (Lg / 2) * k} y={yC - R(gOD) * 0.45} textAnchor="middle" className="wnum">{act.type.toLowerCase()}</text>
      {/* motor: housing, lam stack, copper coil heads */}
      {blk(xm, Lm, modOD, "#C7CFDA", "m")}
      <rect x={X0 + (xm + (Lm - stk) / 2) * k} y={yC - R(modOD * 0.94)} width={stk * k} height={2 * R(modOD * 0.94)} fill="#9AA7B8" stroke="#334155" strokeWidth="0.7" />
      <rect x={X0 + (xm + (Lm - stk) / 2 - ovh) * k} y={yC - R(modOD * 0.8)} width={ovh * k} height={2 * R(modOD * 0.8)} fill="#C87F3D" opacity="0.9" />
      <rect x={X0 + (xm + (Lm + stk) / 2) * k} y={yC - R(modOD * 0.8)} width={ovh * k} height={2 * R(modOD * 0.8)} fill="#C87F3D" opacity="0.9" />
      <text x={X0 + (xm + Lm / 2) * k} y={yC - R(modOD) * 0.45} textAnchor="middle" className="wnum">
        {motorP.motorType === "brushed" ? "brushed DC" : "BLDC"}</text>
      {/* brake: backiron, armature + disc pack */}
      {hasB && (
        <g>
          {blk(xb, brakeP.stackL, bOD, "#B9C2CE", "b")}
          <rect x={X0 + (xb + brakeP.stackL) * k} y={yC - R(bOD * 0.96)} width={Math.max((brakeP.brkArm || 4) * k, 2.5)} height={2 * R(bOD * 0.96)} fill="#8A97A8" stroke="#334155" strokeWidth="0.7" />
          <rect x={X0 + (xb + brakeP.stackL + (brakeP.brkArm || 4)) * k} y={yC - R(bOD * 0.9)} width={Math.max(3 * k, 2)} height={2 * R(bOD * 0.9)} fill="#7B8494" stroke="#334155" strokeWidth="0.7" />
          <text x={X0 + (xb + Lb / 2) * k} y={yC - R(bOD) - 22} textAnchor="middle" className="wnum">brake</text>
          <line x1={X0 + (xb + Lb / 2) * k} y1={yC - R(bOD) - 18} x2={X0 + (xb + Lb / 2) * k} y2={yC - R(bOD) + 2} stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="2 2" />
        </g>
      )}
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

