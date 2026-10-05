/* RunLock "Try it": a rope of loops with real physics, in 3D.
   The rope is two strands that share particles in the joins and run apart in the loops, so every loop is a
   real hole. Position based dynamics (Müller), rope-rope collisions with Coulomb friction in position space
   (Brown, Latombe, Montgomery 2004; Kubiak et al. 2007; Macklin, Müller). Nothing about the locks is scripted:
   what you push through a loop is held by contact, and a loop closes on what runs through it when the rope is
   loaded, because its two strands straighten under tension.
   Scene: the rope hangs from a clamp on a wall with two hooks and a ring, like in the films. Units: millimetres.
   z is up, the floor is z = 0, the wall is at y = WALL, the viewer is at negative y. */
import * as THREE from './three.module.min.js';

const host = document.getElementById('rope');
if (host) init(host);

function init(host) {
  const stage = host.querySelector('.tstage');
  const msg = host.querySelector('.tmsg'), capMsg = host.querySelector('.tcap-msg');
  const reset = host.querySelector('.treset'), capReset = host.querySelector('.tcap-reset'), capShow = host.querySelector('.tcap-show'), fsb = host.querySelector('.tfull'), showBtn = host.querySelector('.tshow');

  /* ---------- rope geometry ---------- */
  const SEG = 10, CELLS = 10, LOOPN = 4, TAILN = 2, RS = 2.8, RJ = 3.8, EYE = [12, 18, 18, 12];   /* segment length, loops, strand particles per loop, radii, eye width */
  const GRAV = -9810, ITERS = 2, DT = 1 / 60, DAMP = 0.985, VMAX = 1500, VSMOOTH = 0.35, MAXSTEP = 3;
  let SUB = 12, DIST_SWEEPS = 4;                                        /* lowered on slow devices */
  const C_BEND = 1e-4, C_EYE = 4e-5, C_HELD = 6e-6, MU_ROPE = 1.0, MU_FLOOR = 0.6, MU_WALL = 0.5, MU_PEG = 0.7;
  const WALL = 150, LIFT = 16, THRU = 150, OPEN = 2.0, HOLD_CHORD = 36, STICK = 0.01, KCAP = 0.02, STICK_FAR = 0.03, KCAP_FAR = 0.08, NEAR = 450, BITE = 0.3, PINCH = 0.1;   /* friction per iteration, mm: STICK swallows the creep gravity gives per substep, KCAP keeps a pull from ever jamming; FAR = away from the hand; PINCH: a closed loop grips what runs through it, BITE: it grips a fold hard */
  const clamp = { x: -150, z: 550 };
  /* the rope hangs from the clamp; its colour can be any of the five RunLock colours. (A second, free rope can be added here: { cells, free: { x0, y0, x1, y1 }, colour }) */
  const COLOURS = { orange: 0xff6b1a, yellow: 0xf2ff55, blue: 0x2f74c0, white: 0xffffff, black: 0x303032 };
  const ROPES = [{ cells: CELLS, clamp, colour: 'orange' }];
  /* things to attach to: two hooks (pegs out of the wall with a knob) and a ring on a bracket, in front of the wall */
  const pegs = [{ x: 130, z: 400, r: 8, len: 40, knob: 10 }, { x: 215, z: 205, r: 7, len: 36, knob: 9 }];   /* the knobs are small enough for an opened loop to pass over */
  const rings = [{ x: -40, y: 88, z: 215, R: 27, r: 5, stub: 6 }];
  const HOOK_F0 = 0.06, HOOK_VISC = 0.08, HAND_TOL = 0.8, HAND_MEAN = 0.35;   /* hook friction per substep: static floor (mm) and viscous fraction */

  /* particles */
  let P = [], PP = [], W = [], RAD = [];              /* position, previous position, inverse mass, radius */
  let segs = [];                                      /* [i, j, rest, radius, chain, order] */
  let bends = [];                                     /* [i, j, rest] soft */
  let eyes = [];                                      /* [a, b, rest] soft spreader */
  let cellOf = [];                                    /* particle -> cell */
  let joinP = [];                                     /* join particle flags */
  let loops = [];                                     /* per cell: { parts: particles of the loop, eyes: eye indices } */
  let arc = [];                                       /* distance along the rope from the clamp, for the no-stretch pass */
  let slip = [], onPeg = [], segLoop = [], bite = [];  /* bite: a closed loop with a fold of rope through it grips it (the RunLock lock) */
  let segOf = [];
  let ropeOf = [], roots = [], tips = [], endLoop = [], loopRope = [], ropeColour = [];
  let strand = [], eyeW = [];                         /* per particle: +1 on strand A, -1 on strand B, 0 at a join; and the eye width there */
  function build() {
    P = []; PP = []; W = []; RAD = []; segs = []; bends = []; eyes = []; cellOf = []; joinP = []; loops = []; arc = []; slip = []; onPeg = []; ropeOf = []; roots = []; tips = []; endLoop = []; loopRope = []; strand = []; eyeW = [];
    ropeColour = ROPES.map(r => r.colour);
    let cellBase = 0;
    ROPES.forEach((R, ri) => {
      const N = R.cells, AOFF = ri * 100000;   /* arc offset: parts of different ropes are never "near" each other along the rope */
      const add = (radius, cell, isJoin) => { P.push(new THREE.Vector3()); PP.push(new THREE.Vector3()); W.push(1); RAD.push(radius); cellOf.push(cell); joinP.push(!!isJoin); slip.push(0); onPeg.push(0); ropeOf.push(ri); strand.push(0); eyeW.push(0); return P.length - 1; };
      let J = [], K = [], A = [], B = [];
      for (let c = 0; c < N; c++) {
        const base = AOFF + c * (3 + LOOPN) * SEG, cell = cellBase + c;
        J[c] = add(RJ, cell, true); arc[J[c]] = base; const m = add(RJ, cell, true); arc[m] = base + SEG; K[c] = add(RJ, cell, true); arc[K[c]] = base + 2 * SEG;
        segs.push([J[c], m, SEG, RJ, 'j' + cell, 0]); segs.push([m, K[c], SEG, RJ, 'j' + cell, 1]);
        A[c] = []; B[c] = []; for (let i = 0; i < LOOPN; i++) { A[c].push(add(RS, cell)); arc[A[c][i]] = base + (3 + i) * SEG; strand[A[c][i]] = 1; eyeW[A[c][i]] = EYE[i]; B[c].push(add(RS, cell)); arc[B[c][i]] = base + (3 + i) * SEG; strand[B[c][i]] = -1; eyeW[B[c][i]] = EYE[i]; }
      }
      const tb = AOFF + N * (3 + LOOPN) * SEG, tails = [], tailCell = cellBase + N; for (let t = 0; t <= TAILN; t++) { tails.push(add(RJ, tailCell, true)); arc[tails[t]] = tb + t * SEG; }
      J[N] = tails[0];
      for (let t = 0; t < TAILN; t++) segs.push([tails[t], tails[t + 1], SEG, RJ, 'j' + tailCell, t]);
      for (let c = 0; c < N; c++) {
        const a = [K[c], ...A[c], J[c + 1]], b = [K[c], ...B[c], J[c + 1]], cell = cellBase + c;
        for (let i = 0; i <= LOOPN; i++) { segs.push([a[i], a[i + 1], SEG, RS, 'a' + cell, i]); segs.push([b[i], b[i + 1], SEG, RS, 'b' + cell, i]); }
        const L = { parts: [K[c], ...A[c], ...B[c], J[c + 1]], eyes: [] };
        for (let i = 0; i < LOOPN; i++) { L.eyes.push(eyes.length); eyes.push([A[c][i], B[c][i], EYE[i]]); }
        loops.push(L); endLoop.push(c === N - 1); loopRope.push(ri);
      }
      /* bending along each strand path: join -> strand -> join ... */
      const chainA = [], chainB = [];
      for (let c = 0; c < N; c++) { chainA.push(J[c], J[c] + 1, K[c], ...A[c]); chainB.push(J[c], J[c] + 1, K[c], ...B[c]); }
      chainA.push(...tails); chainB.push(...tails);
      for (const ch of [chainA, chainB]) for (let i = 0; i + 2 < ch.length; i++) bends.push([ch[i], ch[i + 2], 2 * SEG]);
      /* lay the rope: hanging from the clamp with the rest on the floor, or loose on the floor */
      let at;
      if (R.clamp) { const drop = R.clamp.z - RJ - 2;
        at = (s) => s < drop ? { x: R.clamp.x, y: 0, z: R.clamp.z - s, n: { x: 1, y: 0, z: 0 } }
          : { x: R.clamp.x + (s - drop) * Math.cos(0.12), y: -6 - (s - drop) * Math.sin(0.12), z: RJ, n: { x: 0.12, y: 0.99, z: 0 } }; }
      else { const f = R.free, dx = f.x1 - f.x0, dy = f.y1 - f.y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
        at = (s) => ({ x: f.x0 + ux * s, y: f.y0 + uy * s, z: RJ, n: { x: -uy, y: ux, z: 0 } }); }
      let s = 0; const place = (p, off) => { const q = at(s); P[p].set(q.x + q.n.x * off, q.y + q.n.y * off, q.z + q.n.z * off); PP[p].copy(P[p]); };
      for (let c = 0; c < N; c++) {
        place(J[c], 0); s += SEG; place(J[c] + 1, 0); s += SEG; place(K[c], 0); s += SEG;
        for (let i = 0; i < LOOPN; i++) { place(A[c][i], EYE[i] / 2); place(B[c][i], -EYE[i] / 2); s += SEG; }
      }
      for (let t = 0; t <= TAILN; t++) { place(tails[t], 0); s += SEG; }
      roots.push(J[0]); tips.push(tails[TAILN]);
      /* the first join is held in the clamp */
      if (R.clamp) { W[J[0]] = 0; P[J[0]].set(R.clamp.x, 0, R.clamp.z - 14); PP[J[0]].copy(P[J[0]]); }
      cellBase += N + 1;
    });
    for (let i = 0; i < P.length; i++) { if (W[i] && P[i].z < RAD[i]) P[i].z = RAD[i]; PP[i].copy(P[i]); }
    /* solve each rope in order from its clamp outwards (and back on alternate sweeps): tension then travels the length in one sweep */
    segs.sort((a, b) => Math.min(arc[a[0]], arc[a[1]]) - Math.min(arc[b[0]], arc[b[1]]));
    segOf = P.map(() => []); segs.forEach((sg, si) => { segOf[sg[0]].push(si); segOf[sg[1]].push(si); }); braked = P.map(() => -1);
    segLoop = segs.map(sg => sg[3] === RS ? +sg[4].slice(1) : -1); bite = loops.map(() => 0); closing.length = 0;
  }

  /* ---------- solver ---------- */
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
  let dts = DT / SUB;
  function distConstraint(i, j, rest, compliance, maxStep) {
    const wi = W[i], wj = W[j], ws = wi + wj; if (!ws) return;
    tmp.subVectors(P[j], P[i]); const d = tmp.length() || 1e-6; const C = d - rest;
    const alpha = compliance / (dts * dts); let s = C / (ws + alpha); if (maxStep && Math.abs(s) > maxStep) s = Math.sign(s) * maxStep;   /* a gentle spreader never buzzes against a taut rope */
    tmp.multiplyScalar(1 / d);
    P[i].addScaledVector(tmp, s * wi); P[j].addScaledVector(tmp, -s * wj);
  }
  /* loops in the air turn to face the viewer, like a flat cord held in the hand; on the floor they lie as they fall */
  function faceViewer(a, b) {
    const h = Math.min(P[a].z, P[b].z) - 14; if (h <= 0) return; const k = Math.min(1, h / 40) * 0.12;
    const wa = W[a], wb = W[b], ws = wa + wb; if (!ws) return;
    const dy = (P[b].y - P[a].y) * k; P[a].y += dy * wa / ws; P[b].y -= dy * wb / ws;
  }
  /* closest points between segments p1p2 and q1q2 */
  function segSeg(p1, p2, q1, q2) {
    const d1 = tmp.subVectors(p2, p1), d2 = tmp2.subVectors(q2, q1), r = tmp3.subVectors(p1, q1);
    const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r); let s, t;
    if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
    else if (a <= 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else { const c = d1.dot(r); if (e <= 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else { const b = d1.dot(d2), den = a * e - b * b; s = den !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); } } }
    return [s, t];
  }
  /* spatial hash of segments */
  const CELL = 40, RB = 2 * RJ + 0.6 + 1; let hash = new Map(), bad = false;   /* boxes grown by the contact radius: parts are paired before they touch, not after */
  function hkey(x, y, z) { return ((x * 92837111) ^ (y * 689287499) ^ (z * 283923481)) | 0; }
  function buildHash() { hash.clear();
    for (let si = 0; si < segs.length; si++) { const s = segs[si], a = P[s[0]], b = P[s[1]];
      const x0 = Math.floor((Math.min(a.x, b.x) - RB) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + RB) / CELL), y0 = Math.floor((Math.min(a.y, b.y) - RB) / CELL), y1 = Math.floor((Math.max(a.y, b.y) + RB) / CELL), z0 = Math.floor((Math.min(a.z, b.z) - RB) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + RB) / CELL);
      if (!(x1 - x0 < 8 && y1 - y0 < 8 && z1 - z0 < 8)) { bad = true; continue; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = hkey(x, y, z); let l = hash.get(k); if (!l) { l = []; hash.set(k, l); } l.push(si); } } }
  const contacts = [];   /* [si, sj, s, t, nx, ny, nz, pen] */
  function neighbours(si, sj) { const a = segs[si], b = segs[sj]; return a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]; }
  const ca = new THREE.Vector3(), cb = new THREE.Vector3(), nrm = new THREE.Vector3();
  const seen = new Set(); let sideOld = new Map(), sideNew = new Map();   /* per close pair: which side of each other they were on last substep (packed normal) */
  const qn = v => Math.round((v + 1) * 511.5) & 1023, uq = q => q / 511.5 - 1;
  function packN(n) { return (qn(n.x) << 20) | (qn(n.y) << 10) | qn(n.z); }
  function ropeRope() {
    contacts.length = 0; seen.clear(); const sw = sideOld; sideOld = sideNew; sideNew = sw; sideNew.clear();
    for (const list of hash.values()) {
      for (let u = 0; u < list.length; u++) for (let v = u + 1; v < list.length; v++) {
        const si = list[u], sj = list[v]; const key = si < sj ? si * 4096 + sj : sj * 4096 + si; if (seen.has(key)) continue; seen.add(key);
        if (neighbours(si, sj)) continue;
        const A = segs[si], B = segs[sj], r = A[3] + B[3] + 0.6;   /* a little margin: parts never quite touch, and never slip through */
        const [s, t] = segSeg(P[A[0]], P[A[1]], P[B[0]], P[B[1]]);
        ca.copy(P[A[0]]).lerp(P[A[1]], s); cb.copy(P[B[0]]).lerp(P[B[1]], t);
        nrm.subVectors(cb, ca); const d = nrm.length(); if (d >= r + 3 || d < 1e-6) continue;
        nrm.multiplyScalar(1 / d); let pen = r - d;
        /* the rope cannot pass through itself: if two parts that were close are now on the other side of each other, crossing in their middles,
           they went through each other this substep (a hard pull), and are put back on the side they came from */
        const old = sideOld.get(key);
        if (old !== undefined && d < r && s > 0.03 && s < 0.97 && t > 0.03 && t < 0.97 && uq((old >> 20) & 1023) * nrm.x + uq((old >> 10) & 1023) * nrm.y + uq(old & 1023) * nrm.z < -0.2) {
          nrm.set(uq((old >> 20) & 1023), uq((old >> 10) & 1023), uq(old & 1023)).normalize(); pen = r + d; dbg.flips++; }
        sideNew.set(key, packN(nrm)); if (pen <= 0) continue;
        const wa0 = W[A[0]] * (1 - s), wa1 = W[A[1]] * s, wb0 = W[B[0]] * (1 - t), wb1 = W[B[1]] * t;
        const wsum = wa0 * (1 - s) + wa1 * s + wb0 * (1 - t) + wb1 * t; if (!wsum) continue;
        const k = pen / wsum;
        P[A[0]].addScaledVector(nrm, -k * wa0); P[A[1]].addScaledVector(nrm, -k * wa1);
        P[B[0]].addScaledVector(nrm, k * wb0); P[B[1]].addScaledVector(nrm, k * wb1);
        contacts.push([si, sj, s, t, nrm.x, nrm.y, nrm.z, pen]);
      }
    }
  }
  /* Coulomb friction between rope parts: tangential slip this step is removed up to mu * penetration */
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), rel = new THREE.Vector3();
  function ropeFriction(mu) {
    for (const c of contacts) { const A = segs[c[0]], B = segs[c[1]], s = c[2], t = c[3], pen = c[7];
      nrm.set(c[4], c[5], c[6]);
      va.copy(P[A[0]]).sub(PP[A[0]]).multiplyScalar(1 - s).addScaledVector(tmp.copy(P[A[1]]).sub(PP[A[1]]), s);
      vb.copy(P[B[0]]).sub(PP[B[0]]).multiplyScalar(1 - t).addScaledVector(tmp.copy(P[B[1]]).sub(PP[B[1]]), t);
      rel.subVectors(va, vb); rel.addScaledVector(nrm, -rel.dot(nrm));
      const m = rel.length(); if (m < 1e-6) continue;
      /* Coulomb friction in position space, with a floor so resting contacts do not creep and a cap so a pull always wins (Brown et al.):
         near the hand the rope runs freely over what it touches; away from the hand contacts hold, so what you leave threaded stays threaded */
      const near = grab >= 0 && (Math.abs(arc[A[0]] - arc[grab]) < NEAR || Math.abs(arc[B[0]] - arc[grab]) < NEAR);
      const inHand = grab >= 0 && (Math.abs(arc[A[0]] - arc[grab]) < 70 || Math.abs(arc[B[0]] - arc[grab]) < 70);
      const bit = inHand ? 0 : Math.max(segLoop[c[0]] >= 0 ? bite[segLoop[c[0]]] : 0, segLoop[c[1]] >= 0 ? bite[segLoop[c[1]]] : 0);
      const lim = bit === 2 ? BITE : bit === 1 ? PINCH : near ? Math.min(KCAP, Math.max(mu * pen, STICK)) : Math.min(KCAP_FAR, Math.max(mu * pen, STICK_FAR)); if (m > lim) rel.multiplyScalar(lim / m);
      const wa = W[A[0]] * (1 - s) * (1 - s) + W[A[1]] * s * s, wb = W[B[0]] * (1 - t) * (1 - t) + W[B[1]] * t * t, ws = wa + wb; if (!ws) continue;
      rel.multiplyScalar(1 / ws);
      P[A[0]].addScaledVector(rel, -W[A[0]] * (1 - s)); P[A[1]].addScaledVector(rel, -W[A[1]] * s);
      P[B[0]].addScaledVector(rel, W[B[0]] * (1 - t)); P[B[1]].addScaledVector(rel, W[B[1]] * t);
    }
  }
  /* friction against a fixed surface with normal n after a push-out of pen */
  function surfFriction(i, nx, ny, nz, pen, mu) {
    const p = P[i], q = PP[i]; let dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z; const dn = dx * nx + dy * ny + dz * nz;
    dx -= dn * nx; dy -= dn * ny; dz -= dn * nz; const m = Math.hypot(dx, dy, dz); if (m < 1e-6) return;
    const f = Math.min(1, Math.min(KCAP, Math.max(mu * pen, STICK)) / m); p.x -= dx * f; p.y -= dy * f; p.z -= dz * f;
  }
  /* a point against a ring (torus with its axis along y) and the stub that holds it to the wall */
  function ringPush(g, p, r, i) {
    let dx = p.x - g.x, dz = p.z - g.z; let rh = Math.hypot(dx, dz); if (rh < 1e-6) { dx = 1; dz = 0; rh = 1; }
    const cx = g.x + dx / rh * g.R, cz = g.z + dz / rh * g.R;   /* nearest point on the ring's centre line */
    let ex = p.x - cx, ey = p.y - g.y, ez = p.z - cz; const d = Math.hypot(ex, ey, ez), rr = g.r + r;
    if (d < rr) { const pen = rr - d, n = d || 1; ex /= n; ey /= n; ez /= n; p.x += ex * pen; p.y += ey * pen; p.z += ez * pen; if (i >= 0) { surfFriction(i, ex, ey, ez, pen, MU_PEG); onPeg[i] = 1; } }
    /* the stub from the wall to the top of the ring */
    if (p.y > g.y) { const sx = p.x - g.x, sz = p.z - (g.z + g.R), sh = Math.hypot(sx, sz), sr = g.stub + r;
      if (sh < sr) { const pen = sr - sh, n = sh || 1; p.x += sx / n * pen; p.z += sz / n * pen; if (i >= 0) surfFriction(i, sx / n, 0, sz / n, pen, MU_PEG); } }
  }
  function obstacles() {
    for (let i = 0; i < P.length; i++) { if (!W[i]) continue; const p = P[i], r = RAD[i];
      /* floor */
      if (p.z < r) { const pen = r - p.z; p.z = r; surfFriction(i, 0, 0, 1, pen, MU_FLOOR); }
      /* wall */
      if (p.y > WALL - r) { const pen = p.y - (WALL - r); p.y = WALL - r; surfFriction(i, 0, -1, 0, pen, MU_WALL); }
      /* hooks: a peg out of the wall with a knob on the end */
      for (const g of pegs) {
        const dx = p.x - g.x, dz = p.z - g.z, dh = Math.hypot(dx, dz);
        if (p.y > -g.len && dh < g.r + r + 1.5) onPeg[i] = 1;
        if (p.y > -g.len && dh < g.r + r) { const pen = g.r + r - dh; const nx = dx / (dh || 1), nz = dz / (dh || 1); p.x += nx * pen; p.z += nz * pen; surfFriction(i, nx, 0, nz, pen, MU_PEG); }
        const dy = p.y + g.len, d = Math.hypot(dx, dy, dz); if (d < g.knob + r) { const pen = g.knob + r - d, nx = dx / (d || 1), ny = dy / (d || 1), nz = dz / (d || 1); p.x += nx * pen; p.y += ny * pen; p.z += nz * pen; surfFriction(i, nx, ny, nz, pen, MU_PEG); }
      }
      for (const g of rings) ringPush(g, p, r, i);
    }
    /* segments against the pegs too, so a taut rope cannot cut through a hook between two particles */
    for (const g of pegs) for (const sg of segs) { const a = P[sg[0]], b = P[sg[1]], r = sg[3] + g.r;
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz; let t = l2 > 1e-9 ? ((g.x - a.x) * dx + (g.z - a.z) * dz) / l2 : 0; t = Math.max(0.05, Math.min(0.95, t));
      const cx = a.x + dx * t, cz = a.z + dz * t, cy = a.y + (b.y - a.y) * t; if (cy < -g.len) continue;
      const ex = cx - g.x, ez = cz - g.z, d = Math.hypot(ex, ez); if (d >= r || d < 1e-6) continue;
      const pen = r - d, nx = ex / d, nz = ez / d, wa = W[sg[0]] * (1 - t), wb = W[sg[1]] * t, ws = wa * (1 - t) + wb * t; if (!ws) continue;
      const k = pen / ws; a.x += nx * k * wa; a.z += nz * k * wa; b.x += nx * k * wb; b.z += nz * k * wb; }
    /* and against the ring: the middle of each segment near the ring is pushed out of its tube */
    for (const g of rings) for (const sg of segs) { const a = P[sg[0]], b = P[sg[1]];
      if (Math.abs(a.y - g.y) > 40 || Math.hypot(a.x - g.x, a.z - g.z) > g.R + 30) continue;
      const wa = W[sg[0]], wb = W[sg[1]]; if (!wa && !wb) continue;
      for (const t of [0.35, 0.65]) { tmp3.copy(a).lerp(b, t); const bx = tmp3.x, by = tmp3.y, bz = tmp3.z; ringPush(g, tmp3, sg[3], -1);
        const mx = tmp3.x - bx, my = tmp3.y - by, mz = tmp3.z - bz; if (!mx && !my && !mz) continue;
        const ws = wa * (1 - t) + wb * t; const ka = wa * (1 - t) / ws, kb = wb * t / ws;
        a.x += mx * ka; a.y += my * ka; a.z += mz * ka; b.x += mx * kb; b.y += my * kb; b.z += mz * kb; } }
    for (let i = 0; i < P.length; i++) { if (!W[i]) continue; const p = P[i], r = RAD[i];
      /* the clamp body: a box, pushed out of by whichever face is nearest */
      if (i > 1) { const px = 16 + r - Math.abs(p.x - clamp.x), pz = p.z - (clamp.z - 18 - r), py = p.y - (-14 - r);
        if (px > 0 && pz > 0 && py > 0 && p.y < 20 && p.z < clamp.z + 18 + r) { if (pz <= px && pz <= py) p.z -= pz; else if (px <= py) p.x += (p.x >= clamp.x ? px : -px); else p.y -= py; } }
      /* stay in front of the wall and off the far edges */
      if (p.y < -220) p.y = -220; p.x = Math.max(-560, Math.min(560, p.x));
    }
  }
  const dbg = { maxd: 0, rel: 0, flips: 0 }; let braked = [], handMoving = false;
  let grab = -1, target = new THREE.Vector3(), grabW = 0, heldA = -1, heldB = -1, heldLoop = -1;
  /* no stretch: nothing can be further from the clamp, or from the hand, than the rope between them (long range attachment, Kim, Müller) */
  function noStretch(anchor, maxStep) { const a = P[anchor], la = arc[anchor], r = ropeOf[anchor];
    for (let i = 0; i < P.length; i++) { if (!W[i] || i === anchor || ropeOf[i] !== r) continue; const L = Math.abs(arc[i] - la); tmp.subVectors(P[i], a); const d = tmp.length();
      if (d > L + 0.01) { const m = Math.min(d - L, maxStep); P[i].addScaledVector(tmp, -m / d); } } }   /* small steps: never jumps across another part of the rope */
  /* the other hand takes the loop by its two ends, holds them still and brings them a little together, so the loop opens into a hole;
     the opening and the closing again are eased over a few frames, so the loop breathes rather than snaps */
  const heldEnds = { a: -1, b: -1, mid: new THREE.Vector3(), dir: new THREE.Vector3(), chord: 0 };
  const OPEN_T = 14, CLOSE_T = 12, OPEN_HANG = [27, 32, 32, 27], CHORD_HANG = 32; let openT = 0, holdOpen = OPEN, holdChord = HOLD_CHORD; const closing = [];   /* loops easing shut after they were let go: [cell, t, how far open]. To go over a hook's knob a loop is opened into a round hole */
  const ease = t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  function setOpen(c, k, o) { const L = loops[c]; o = o || OPEN; for (let i = 0; i < L.eyes.length; i++) eyes[L.eyes[i]][2] = EYE[i] + ((Array.isArray(o) ? o[i] : EYE[i] * o) - EYE[i]) * k; }
  function holdLoop(c) { if (heldLoop === c) return; freeLoop(); if (c < 0 || c >= loops.length) return; const L = loops[c]; heldLoop = c; heldA = L.eyes[0]; heldB = L.eyes[L.eyes.length - 1] + 1;
    for (const i of L.parts) if (W[i] && i !== grab && joinP[i]) W[i] = 0; const cl = closing.findIndex(q => q[0] === c); openT = cl >= 0 ? OPEN_T * (1 - closing[cl][1] / CLOSE_T) : 0; if (cl >= 0) closing.splice(cl, 1); setOpen(c, ease(openT / OPEN_T), holdOpen);
    const a = L.parts[0], b = L.parts[L.parts.length - 1]; heldEnds.a = a; heldEnds.b = b; heldEnds.mid.addVectors(P[a], P[b]).multiplyScalar(0.5); heldEnds.dir.subVectors(P[b], P[a]); heldEnds.chord = heldEnds.dir.length() || 1; heldEnds.dir.y = 0; if (heldEnds.dir.lengthSq() < 1) heldEnds.dir.set(1, 0, 0); heldEnds.dir.normalize(); }   /* the held loop faces the viewer: its chord lies in the plane of the wall */
  function holdEnds() { if (heldLoop < 0 || W[heldEnds.a] || W[heldEnds.b]) return; heldEnds.chord += Math.max(-0.6, Math.min(0.6, holdChord - heldEnds.chord));   /* the ends are brought to the chord that gives a round, open hole */
    P[heldEnds.a].copy(heldEnds.mid).addScaledVector(heldEnds.dir, -heldEnds.chord / 2); P[heldEnds.b].copy(heldEnds.mid).addScaledVector(heldEnds.dir, heldEnds.chord / 2); }
  function freeLoop() { if (heldLoop < 0) return; const L = loops[heldLoop]; for (const i of L.parts) if (i > 0 && i !== grab && joinP[i]) W[i] = 1; closing.push([heldLoop, CLOSE_T * (1 - Math.min(1, openT / OPEN_T)), holdOpen]); heldLoop = -1; heldA = heldB = -1; }
  function breathe() { if (heldLoop >= 0 && openT < OPEN_T) { openT++; setOpen(heldLoop, ease(openT / OPEN_T), holdOpen); }
    for (let k = closing.length - 1; k >= 0; k--) { const q = closing[k]; q[1]++; if (q[1] >= CLOSE_T) { setOpen(q[0], 0); closing.splice(k, 1); } else setOpen(q[0], 1 - ease(q[1] / CLOSE_T), q[2]); } }
  /* the hand moves the rope as fast as the rope can follow: as the rope behind the hand goes taut the hand slows down and stops (the pointer runs ahead) */
  function pullGrabbed(maxStep) { const p = P[grab]; tmp.subVectors(target, p); const d = tmp.length(); if (d < 1e-6) return;
    let sum = 0, near = 0; for (const sg of segs) { const st = P[sg[0]].distanceTo(P[sg[1]]) - sg[2]; if (st > 0) sum += st; if (st > near && Math.abs(arc[sg[0]] - arc[grab]) < 60) near = st; }
    const strain = Math.max(sum / segs.length / HAND_MEAN, near / HAND_TOL); const f = Math.max(0, Math.min(1, (1.25 - strain) / 0.65)); if (f <= 0) return;
    const m = Math.min(d * 0.5, maxStep * f); p.addScaledVector(tmp, m / d);
    /* and never further from the clamp than the rope is long: the hand cannot stretch the rope */
    const r = ropeOf[grab]; if (ROPES[r].clamp) { const root = P[roots[r]]; tmp.subVectors(p, root); const dc = tmp.length(), L = arc[grab] - arc[roots[r]] - 1; if (dc > L) p.copy(root).addScaledVector(tmp, L / dc); } }
  function step() {
    dts = DT / SUB; const vcap = VMAX * dts;
    for (let s = 0; s < SUB; s++) {
      for (let i = 0; i < P.length; i++) { if (!W[i]) continue;
        const v = tmp.subVectors(P[i], PP[i]).multiplyScalar(DAMP); const vl = v.length(); if (vl > vcap) v.multiplyScalar(vcap / vl);
        PP[i].copy(P[i]); P[i].add(v); P[i].z += GRAV * dts * dts; }
      for (let i = 0; i < P.length; i++) { if (slip[i] > 0) slip[i]--; braked[i] = -1; }
      if (grab >= 0) pullGrabbed(2.5); holdEnds();
      buildHash();
      for (let it = 0; it < ITERS; it++) {
        for (let r = 0; r < ROPES.length; r++) if (ROPES[r].clamp) noStretch(roots[r], 0.6);
        for (let sw = 0; sw < DIST_SWEEPS; sw++) { if (sw & 1) { for (let q = segs.length - 1; q >= 0; q--) { const c = segs[q]; distConstraint(c[0], c[1], c[2], 0); } } else { for (const c of segs) distConstraint(c[0], c[1], c[2], 0); } }
        for (const b of bends) distConstraint(b[0], b[1], b[2], C_BEND);
        for (let k = 0; k < eyes.length; k++) { const e = eyes[k]; const held = k >= heldA && k < heldB; distConstraint(e[0], e[1], e[2], held ? C_HELD : C_EYE, held ? 0 : 0.12); faceViewer(e[0], e[1]); }
        ropeRope(); ropeFriction(MU_ROPE);
        obstacles();
      }
      if (grab >= 0) pullGrabbed(2.5);
      /* nothing moves further in one substep than the rope is thick: a hard yank stretches the rope a moment instead of throwing a part through another */
      for (let i = 0; i < P.length; i++) { if (!W[i] || i === grab) continue; tmp.subVectors(P[i], PP[i]); const m = tmp.length(); if (m > MAXSTEP) P[i].copy(PP[i]).addScaledVector(tmp, MAXSTEP / m); }
      /* the rope does not buzz: neighbouring particles share their velocity a little (damps zigzag vibration, keeps swinging and sliding) */
      for (const sg of segs) { const i = sg[0], j = sg[1]; if (!W[i] || !W[j]) continue;
        tmp.subVectors(P[j], PP[j]).sub(tmp2.subVectors(P[i], PP[i])).multiplyScalar(0.5 * VSMOOTH); P[i].add(tmp); P[j].sub(tmp); }
      for (const e of eyes) { const i = e[0], j = e[1]; if (!W[i] || !W[j]) continue;   /* the two strands of a loop move together too */
        tmp.subVectors(P[j], PP[j]).sub(tmp2.subVectors(P[i], PP[i])).multiplyScalar(0.5 * VSMOOTH); P[i].add(tmp); P[j].sub(tmp); }
      for (let i = 0; i < P.length; i++) { const q = P[i]; if (!(Math.abs(q.x) < 3000 && Math.abs(q.y) < 3000 && Math.abs(q.z) < 3000)) { bad = true; dbg.badAt = { i, s, x: q.x, y: q.y, z: q.z, frame }; q.copy(PP[i]); } }
      /* friction on the hooks acts on the length of rope that wraps it, not on single particles: a small static floor so it holds at rest, and viscous drag so it does not run */
      for (let i = 0; i < P.length; i++) { if (!onPeg[i]) continue; onPeg[i] = 0;
        for (let j = Math.max(0, i - 12); j <= Math.min(P.length - 1, i + 12); j++) { if (!W[j] || j === grab || braked[j] === s + 1) continue; braked[j] = s + 1;
          const f0 = handMoving ? HOOK_F0 * 0.25 : HOOK_F0;   /* at rest the hook holds; when a hand pulls, the rope runs over it */
          tmp.subVectors(P[j], PP[j]); const m = tmp.length(); if (m <= f0) P[j].copy(PP[j]); else P[j].addScaledVector(tmp, -(f0 + (m - f0) * HOOK_VISC) / m); } }
    }
  }

  /* ---------- rendering ---------- */
  const lite = /[?&]lite\b/.test(location.search);   /* test rigs without a GPU */
  const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: false });
  renderer.setPixelRatio(lite ? 1 : Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = !lite; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xe9e3da);
  stage.insertBefore(renderer.domElement, stage.firstChild); renderer.domElement.style.display = 'block'; renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.touchAction = 'none';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 10, 6000);
  const light = new THREE.DirectionalLight(0xfff4e6, 2.0); light.position.set(-350, -700, 900); light.target.position.set(0, 0, 250); scene.add(light.target); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
  const sc = light.shadow.camera; sc.left = -700; sc.right = 700; sc.top = 600; sc.bottom = -600; sc.near = 200; sc.far = 2400; light.shadow.bias = -0.0003; light.shadow.radius = 3;
  scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.7)); scene.add(new THREE.HemisphereLight(0xfff8ee, 0xa89f92, 0.6));
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(600, -500, 300); scene.add(fill);
  /* the wall: plaster with a soft fall-off towards the floor; the floor: darker near the wall (the shadow the light cannot draw) */
  function gradTex(w, h, fn) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); fn(g, w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
  const wallTex = gradTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#e7e0d4'); gr.addColorStop(0.45, '#f3eee5'); gr.addColorStop(1, '#faf7f1'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const wallM = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 })); wallM.rotation.x = Math.PI / 2; wallM.position.set(0, WALL, 700 - 0.01); wallM.receiveShadow = true; scene.add(wallM);
  const floorTex = gradTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b8ad9c'); gr.addColorStop(0.12, '#c9bfae'); gr.addColorStop(1, '#d6ccbc'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const floorM = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 })); floorM.rotation.z = Math.PI; floorM.position.set(0, WALL - 600, 0); floorM.receiveShadow = true; scene.add(floorM);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2400, 10, 14), new THREE.MeshStandardMaterial({ color: 0xd9d2c6, roughness: 0.9 })); skirt.position.set(0, WALL - 5, 7); skirt.receiveShadow = true; scene.add(skirt);
  const metal = new THREE.MeshStandardMaterial({ color: 0x55524e, metalness: 0.7, roughness: 0.32 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3835, roughness: 0.7, metalness: 0.2 });
  const hookMeshes = [];
  for (const g of pegs) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(g.r, g.r, WALL + g.len, 24), metal); cyl.position.set(g.x, (WALL - g.len) / 2, g.z); cyl.castShadow = true; scene.add(cyl);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(g.knob, 28, 20), metal); knob.position.set(g.x, -g.len, g.z); knob.castShadow = true; scene.add(knob); hookMeshes.push(knob);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(g.r + 13, g.r + 13, 4, 28), plateMat); plate.position.set(g.x, WALL - 2, g.z); plate.castShadow = true; scene.add(plate);
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x5c5955, metalness: 0.75, roughness: 0.3, emissive: 0x000000 });
  const ringMeshes = [];
  for (const g of rings) {
    const tor = new THREE.Mesh(new THREE.TorusGeometry(g.R, g.r, 14, 56), ringMat); tor.rotation.x = Math.PI / 2; tor.position.set(g.x, g.y, g.z); tor.castShadow = true; scene.add(tor); ringMeshes.push(tor);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(g.stub, g.stub, WALL - g.y + 2, 20), metal); stub.position.set(g.x, (WALL + g.y) / 2, g.z + g.R); stub.castShadow = true; scene.add(stub);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 4, 28), plateMat); plate.position.set(g.x, WALL - 2, g.z + g.R); plate.castShadow = true; scene.add(plate);
  }
  const clampM = new THREE.Mesh(new THREE.BoxGeometry(32, 34, 36), new THREE.MeshStandardMaterial({ color: 0x3a3835, roughness: 0.6, metalness: 0.3 })); clampM.position.set(clamp.x, 3, clamp.z); clampM.castShadow = true; scene.add(clampM);
  const clampArm = new THREE.Mesh(new THREE.BoxGeometry(14, WALL, 14), metal); clampArm.position.set(clamp.x, WALL / 2 + 6, clamp.z + 8); clampArm.castShadow = true; scene.add(clampArm);
  /* rope: instanced cylinders for segments and spheres for particles. The cylinders wear a braided texture: one segment is one repeat,
     so the braid runs continuously along the rope; the spheres fill the joints in the base colour */
  function braidTex(base, dark, light) {
    const w = 64, h = 64, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    const img = g.createImageData(w, h), d = img.data, B = hex(base), D = hex(dark), L = hex(light);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      /* the lay of a braided rope: diagonal strands, two round, two along one segment, each strand rounded (light in the middle, a groove at the edge) */
      const u = x / w, v = y / h; const s = (u * 2 + v * 2) % 1, k = Math.abs(s - 0.5) * 2;   /* 0 mid-strand, 1 at the groove */
      const round = Math.sqrt(Math.max(0, 1 - k * k)), groove = Math.max(0, k - 0.82) / 0.18;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) { const val = B[c] + (L[c] - B[c]) * 0.55 * round * round + (D[c] - B[c]) * (0.25 * (1 - round) + 0.6 * groove); d[o + c] = Math.max(0, Math.min(255, val)); } d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = lite ? 1 : 4; return t;
  }
  function hex(s) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  /* the texture is neutral: each rope's colour is an instance colour that multiplies it, so any rope can be any colour */
  const ropeTex = braidTex('#d8d8d8', '#5a5a5a', '#ffffff'), ropeBump = braidTex('#808080', '#101010', '#f0f0f0');
  const matA = new THREE.MeshStandardMaterial({ map: ropeTex, bumpMap: ropeBump, bumpScale: 0.5, roughness: 0.68 }), matJ = new THREE.MeshStandardMaterial({ map: ropeTex, bumpMap: ropeBump, bumpScale: 0.5, roughness: 0.7, color: 0xf2ebe4 });
  const sphA = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.68 }), sphJ = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.7 });
  let segMeshS, segMeshJ, sphS, sphJm; const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const colEnd = new THREE.Color(0x2a2522), white = new THREE.Color(0xffffff), cTmp = new THREE.Color();   /* instance colours multiply the material */
  const baseCol = r => cTmp.set(COLOURS[ropeColour[r]] || 0xff6b1a);
  const tinted = (r, k) => { const c = baseCol(r).clone(); if (k) c.lerp(white, k); return c; };   /* k: how much the loop glows */
  let paintKey = '';
  function buildMeshes() {
    [segMeshS, segMeshJ, sphS, sphJm].forEach(m => { if (m) { scene.remove(m); m.geometry.dispose(); } });
    const nS = segs.filter(s => s[3] === RS).length, nJ = segs.length - nS;
    segMeshS = new THREE.InstancedMesh(new THREE.CylinderGeometry(RS, RS, 1, 14, 1, true), matA, nS); segMeshJ = new THREE.InstancedMesh(new THREE.CylinderGeometry(RJ, RJ, 1, 16, 1, true), matJ, nJ);
    const pS = P.filter((p, i) => RAD[i] === RS).length, pJ = P.length - pS;
    sphS = new THREE.InstancedMesh(new THREE.SphereGeometry(RS, 12, 10), sphA, pS); sphJm = new THREE.InstancedMesh(new THREE.SphereGeometry(RJ, 14, 12), sphJ, pJ);
    [segMeshS, segMeshJ, sphS, sphJm].forEach(m => { m.castShadow = true; m.receiveShadow = false; scene.add(m); });
    paintKey = ''; paint();
  }
  /* the loop the hand is near glows a little, the loop the other hand holds open glows more, and the end of the rope is dark (melted, like the real one) */
  function paint() {
    const key = heldLoop + ':' + nearLoop + ':' + pushEye + ':' + ropeColour.join(); if (key === paintKey) return; paintKey = key;
    const cols = ropeColour.map((c, r) => ({ n: tinted(r, 0), near: tinted(r, 0.32), lit: tinted(r, 0.55) }));
    const lc = (c, r) => c === heldLoop ? cols[r].lit : c === nearLoop ? cols[r].near : cols[r].n;
    const isEnd = i => tips.some(t => i >= t - 1 && i <= t);
    let iS = 0, pS = 0, iJ = 0, pJ = 0;
    for (const s of segs) { const r = ropeOf[s[0]]; if (s[3] === RS) segMeshS.setColorAt(iS++, cellOf[s[0]] === cellOf[s[1]] ? lc(cellOf[s[0]], r) : cols[r].n); else segMeshJ.setColorAt(iJ++, tips.includes(s[1]) ? colEnd : cols[r].n); }
    for (let i = 0; i < P.length; i++) { const r = ropeOf[i]; if (RAD[i] === RS) sphS.setColorAt(pS++, lc(cellOf[i], r)); else sphJm.setColorAt(pJ++, isEnd(i) ? colEnd : cols[r].n); }
    segMeshS.instanceColor.needsUpdate = true; sphS.instanceColor.needsUpdate = true; segMeshJ.instanceColor.needsUpdate = true; sphJm.instanceColor.needsUpdate = true;
    const rn = nearLoop - loops.length, rp = pushEye - loops.length, hn = rn - rings.length, hp = rp - rings.length;
    ringMeshes.forEach((m, k) => { m.material = k === rp ? ringLit : k === rn ? ringNear : ringMat; });
    hookMeshes.forEach((m, k) => { m.material = k === hp ? hookLit : k === hn ? hookNear : metal; });
  }
  const ringNear = ringMat.clone(); ringNear.emissive.set(0x5a3a10); const ringLit = ringMat.clone(); ringLit.emissive.set(0x9a5a12);
  const hookNear = metal.clone(); hookNear.emissive.set(0x5a3a10); const hookLit = metal.clone(); hookLit.emissive.set(0x9a5a12);
  function draw() {
    paint(); let iS = 0, iJ = 0;
    for (const s of segs) { const a = P[s[0]], b = P[s[1]]; dir.subVectors(b, a); const len = dir.length() || 1e-3;
      dummy.position.copy(a).lerp(b, 0.5); dummy.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len)); dummy.scale.set(1, len, 1); dummy.updateMatrix();
      if (s[3] === RS) segMeshS.setMatrixAt(iS++, dummy.matrix); else segMeshJ.setMatrixAt(iJ++, dummy.matrix); }
    let pS = 0, pJ = 0; dummy.quaternion.identity(); dummy.scale.set(1, 1, 1);
    for (let i = 0; i < P.length; i++) { dummy.position.copy(P[i]); dummy.updateMatrix(); if (RAD[i] === RS) sphS.setMatrixAt(pS++, dummy.matrix); else sphJm.setMatrixAt(pJ++, dummy.matrix); }
    segMeshS.instanceMatrix.needsUpdate = true; segMeshJ.instanceMatrix.needsUpdate = true; sphS.instanceMatrix.needsUpdate = true; sphJm.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function resize() {
    const w = renderer.domElement.clientWidth || stage.clientWidth, h = renderer.domElement.clientHeight || w * 0.62; renderer.setSize(w, h, false); camera.aspect = w / h;
    /* frame the wall from the front, a little above: z 0..600 always visible */
    const portrait = h > w * 1.05; camera.fov = portrait ? 44 : 34;
    camDist = 335 / Math.tan(camera.fov / 2 * Math.PI / 180); placeCamera(); camera.updateProjectionMatrix();
  }
  /* the view can be turned a little (right-drag, or two fingers) to see a lock from the side */
  let camDist = 1000, yaw = 0, pitch = 0; const EL0 = Math.atan(0.2);
  function placeCamera() { const el = EL0 + pitch, R = camDist * Math.sqrt(1.04);
    camera.position.set(Math.sin(yaw) * Math.cos(el) * R, -Math.cos(yaw) * Math.cos(el) * R, 285 + Math.sin(el) * R); camera.up.set(0, 0, 1); camera.lookAt(0, 0, 285); }
  function orbitBy(dx, dy) { yaw = Math.max(-0.7, Math.min(0.7, yaw + dx * 0.005)); pitch = Math.max(-0.12, Math.min(0.4, pitch + dy * 0.004)); placeCamera(); }

  /* ---------- interaction ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let touch = false, still = 0, lastPtr = null, pushDir = 0, pushEye = -1, pushT = 0, pushed = false, handFrames = 0, nearLoop = -1, liftTo = 0, pushPtr = null, pushY = 0;
  function toNdc(e) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top - (touch ? 34 : 0)) / r.height) * 2 + 1); }
  function planeAt(y) { plane.constant = -y; ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit) ? hit : null; }
  /* lifting: what you take hold of comes towards you, out of the plane of the rope, unless it is already behind (then it stays behind) */
  function liftY(y) { return y > 6 ? Math.max(y, 12) : y < -40 ? -LIFT : Math.max(-LIFT, y - LIFT); }
  let lastRope = 0;
  function grabParticle(i) { grab = i; lastRope = ropeOf[i]; grabW = W[i]; W[i] = 0.02; target.copy(P[i]); liftTo = liftY(P[i].y); still = 0; lastPtr = null; pushDir = 0; pushEye = -1; pushPtr = null; pushed = false; nearLoop = -1; }
  function cancelPush() { if (pushEye < 0) return; pushEye = -1; pushDir = 0; pushPtr = null; freeLoop(); if (grab >= 0) liftTo = liftY(P[grab].y); }
  function setTarget(x, z) {
    if (pushEye >= 0) { /* while the loop is held, the hand belongs to the push: the pointer only decides whether you have moved away and given it up */
      if (!pushPtr) pushPtr = { x, z }; const off = Math.hypot(x - pushPtr.x, z - pushPtr.z);
      if (off > (touch ? 12 : 6) && !pushed) { cancelPush(); lastPtr = { x, z }; target.x = x; target.z = Math.max(RAD[grab], z); still = 0; handFrames = 6; }
      else if (off > (touch ? 12 : 6)) { lastPtr = { x, z }; target.x = x; target.z = Math.max(RAD[grab], z); pushEye = -1; freeLoop(); handFrames = 6; }
      return; }
    const moved = lastPtr ? Math.hypot(x - lastPtr.x, z - lastPtr.z) : 0; lastPtr = { x, z };
    target.x = x; target.z = Math.max(RAD[grab], z); if (moved > 0.8) handFrames = 6;
    if (moved > (touch ? 4 : 1.5)) still = 0; }   /* a finger trembles more than a mouse */
  function release() { if (grab < 0) return; freeLoop(); W[grab] = grabW; grab = -1; pushDir = 0; pushEye = -1; nearLoop = -1; renderer.domElement.classList.remove('grab'); }
  const ptrs = new Map(); let orbit = null;
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', e => {
    if (demo) stopDemo();
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.button === 2 || ptrs.size === 2) { if (grab >= 0) { release(); hint(null); } orbit = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    touch = e.pointerType === 'touch'; toNdc(e); ray.setFromCamera(ndc, camera);
    let bi = -1, bd = 1e9; const rp = ray.ray;
    for (let i = 0; i < P.length; i++) { if (!W[i]) continue; const d = rp.distanceToPoint(P[i]); if (d < bd) { bd = d; bi = i; } }
    if (bd > (touch ? 24 : 14)) return;
    grabParticle(bi); hint(HINT_GRAB);
    renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.classList.add('grab'); e.preventDefault();
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (orbit) { let x = e.clientX, y = e.clientY; if (ptrs.size >= 2) { x = 0; y = 0; for (const q of ptrs.values()) { x += q.x / ptrs.size; y += q.y / ptrs.size; } }
      orbitBy(x - orbit.x, y - orbit.y); orbit = { x, y }; return; }
    if (grab < 0 || demo) return; toNdc(e); const p = planeAt(pushEye >= 0 ? pushY : target.y); if (!p) return;   /* during a push the hand moves in depth; a still finger must still read as still */
    setTarget(p.x, p.z); e.preventDefault();
  });
  const endPtr = e => { ptrs.delete(e.pointerId); if (orbit && ptrs.size < 2) orbit = ptrs.size === 1 && e.pointerType === 'touch' ? null : null; if (!demo && grab >= 0) { release(); hint(null); } };
  renderer.domElement.addEventListener('pointerup', endPtr);
  renderer.domElement.addEventListener('pointercancel', endPtr);
  renderer.domElement.addEventListener('lostpointercapture', () => { if (!demo && grab >= 0 && ptrs.size === 0) { release(); hint(null); } });

  /* holding still over a loop, or over the ring, pushes the held part through it: the other hand holds the loop open, the hand moves in depth.
     Targets are the loops of the rope (0 .. loops.length-1) and then the rings */
  function loopCentre(c) { const L = loops[c], e1 = eyes[L.eyes[1]], e2 = eyes[L.eyes[2]]; return tmp2.set(P[e1[0]].x + P[e1[1]].x + P[e2[0]].x + P[e2[1]].x, P[e1[0]].y + P[e1[1]].y + P[e2[0]].y + P[e2[1]].y, P[e1[0]].z + P[e1[1]].z + P[e2[0]].z + P[e2[1]].z).multiplyScalar(0.25); }
  function kind(c) { return c < loops.length ? 'loop' : c < loops.length + rings.length ? 'ring' : 'hook'; }
  function isRing(c) { return kind(c) === 'ring'; }
  function hookOf(c) { return pegs[c - loops.length - rings.length]; }
  function tCentre(c) { const k = kind(c); if (k === 'ring') { const g = rings[c - loops.length]; return tmp2.set(g.x, g.y, g.z); } if (k === 'hook') { const g = hookOf(c); return tmp2.set(g.x, -g.len, g.z); } return loopCentre(c); }
  /* a part cannot go through its own loop, or one it is attached to within a few centimetres */
  function ownLoop(i, c) { if (kind(c) !== 'loop') return false; const L = loops[c]; return cellOf[i] === c || Math.abs(arc[i] - arc[L.parts[0]]) < 30 || Math.abs(arc[i] - arc[L.parts[L.parts.length - 1]]) < 30; }
  /* what the held part can be put through (a loop of the rope, the ring), or, when a loop is held, what it can be hung on (a hook) */
  function nearestTarget(maxD) { let best = -1, bd = 1e9;
    const test = (c, p) => { if (ownLoop(grab, c)) return; const q = tCentre(c); const d = Math.hypot(q.x - p.x, q.z - p.z, 0.35 * (q.y - p.y)); if (d < bd) { bd = d; best = c; } };
    for (let c = 0; c < loops.length; c++) if (!endLoop[c]) test(c, P[grab]);   /* not the last loop of a rope: it is the end itself */
    for (let k = 0; k < rings.length; k++) test(loops.length + k, P[grab]);
    if (RAD[grab] === RS) { const q = loopCentre(cellOf[grab]).clone(); for (let k = 0; k < pegs.length; k++) test(loops.length + rings.length + k, q); }   /* holding a loop: the hook is measured from the loop's centre */
    return bd <= maxD ? best : -1; }
  /* the push: the hand goes out to the side of the hole (never across it), round to the far side, in front of the hole, and then through.
     Each leg is eased; the waypoints follow the loop, which may sway. Frames per leg, and how far in front of the loop the part is brought */
  const LEG = 12, SIDE = 26, RING_FEED = 90; let legFrom = new THREE.Vector3(), wp = [], sideSign = 1, thruF = 0, feed = 0;
  function holdLogic() {
    if (grab < 0) { nearLoop = -1; return; } still++;
    if (pushEye < 0) target.y += Math.sign(liftTo - target.y) * Math.min(2.5, Math.abs(liftTo - target.y));   /* the lift towards you is gradual, not a jerk */
    if (noPush) nearLoop = -1; else if (pushEye < 0) { nearLoop = nearestTarget(50); if (nearLoop >= 0 && !pushed) hint(kind(nearLoop) === 'ring' ? HINT_RING : kind(nearLoop) === 'hook' ? HINT_HOOK : HINT_NEAR); else if (!pushed) hint(HINT_GRAB); }
    if (pushEye < 0 && still > 8 && nearLoop >= 0 && !pushed) { pushEye = nearLoop; const hk = kind(pushEye) === 'hook'; holdOpen = hk ? OPEN_HANG : OPEN; holdChord = hk ? CHORD_HANG : HOLD_CHORD; holdLoop(hk ? cellOf[grab] : pushEye); pushT = 0; pushPtr = null; pushY = target.y; hint(kind(pushEye) === 'hook' ? HINT_HANGING : HINT_HOLD); }
    if (pushEye < 0) return;
    pushT++; if (kind(pushEye) === 'hook') { hangStep(); return; }
    const q = tCentre(pushEye).clone();
    const ring = isRing(pushEye);
    /* how far through: a short end through its own loop, or a fold near the end, must not be pulled so far that it pulls itself out again */
    let own = false; if (!ring) { const Lp = loops[pushEye].parts; own = Math.min(Math.abs(arc[grab] - arc[Lp[0]]), Math.abs(arc[grab] - arc[Lp[Lp.length - 1]])) < 150; }
    const toEnd = arc[tips[ropeOf[grab]]] - arc[grab]; let thru = own ? 40 : (demoThru || THRU); if (!ring && toEnd > 20 && toEnd < 150) thru = Math.min(thru, Math.max(35, toEnd - 45));
    if (pushT === 1) {
      /* which way: the end of the rope goes round the back of a loop and comes through towards you (so it hangs in front, where you see it);
         a fold, or anything through the ring, goes through from the side it is on */
      pushDir = (!ring && toEnd <= 20) ? -1 : (P[grab].y < q.y ? 1 : -1);
      /* round the loop on the freer side, away from other loops */
      let dl = 1e9, dr = 1e9; for (let c = 0; c < loops.length; c++) { if (c === pushEye) continue; const o = loopCentre(c); const d = Math.hypot(o.x - q.x, o.z - q.z); if (d > 90) continue; if (o.x < q.x) dl = Math.min(dl, d); else dr = Math.min(dr, d); }
      sideSign = P[grab].x >= q.x ? 1 : -1; if ((sideSign > 0 ? dr : dl) < 40 && (sideSign > 0 ? dl : dr) > 60) sideSign = -sideSign;   /* the side it comes from, unless a loop sits right there */
      const from = -pushDir * SIDE, sx = sideSign * (ring ? 34 : 28);
      wp = [[sx, target.y - q.y, 8], [sx, from, 6], [0, from, 0]]; legFrom.copy(target); thruF = 0; feed = 0;   /* offsets from the loop centre: to the side, round to the near side, in front of the hole */
    }
    const from = q.y - pushDir * SIDE, goal = pushDir > 0 ? Math.min(WALL - RAD[grab] - 4, q.y + thru) : Math.max(-200, q.y - thru);
    const leg = Math.floor((pushT - 1) / LEG), t = ((pushT - 1) % LEG + 1) / LEG;
    if (leg < wp.length) { const w = wp[leg], k = ease(t); if (t === 1 / LEG) legFrom.copy(target);
      target.x = legFrom.x + (q.x + w[0] - legFrom.x) * k; target.z = legFrom.z + (q.z + w[2] - legFrom.z) * k; target.y = legFrom.y + (q.y + w[1] - legFrom.y) * k; }
    else { thruF++; target.x += (q.x - target.x) * 0.25;
      const sp = Math.min(1.8, 0.4 + thruF * 0.12);   /* through: gently at first, then steadily */
      const atGoal = Math.abs(goal - target.y) < 0.5;
      if (ring && pushDir > 0 && atGoal) { feed += 1.5; target.z = Math.max(RAD[grab], target.z - 1.5); }   /* through the ring to the wall, then on down behind it, so enough rope hangs through to stay */
      else target.z += (q.z - target.z) * 0.25;
      target.y += Math.sign(goal - target.y) * Math.min(sp, Math.abs(goal - target.y)); }
    const past = (P[grab].y - q.y) * pushDir;
    if (!pushed && leg >= wp.length && (past > thru - 12 || (Math.abs(goal - target.y) < 0.5 && past > (own ? 14 : 20) && (!ring || pushDir < 0 || feed >= RING_FEED)))) { pushed = true; hint(HINT_THROUGH); }
  }
  /* hanging a loop on a hook: the other hand holds the loop open and carries it out to the side, forward past the knob, in front of the hook,
     and back over the knob onto the shaft, where it is let go and closes on the shaft. The whole loop moves as one; the rope follows */
  let hang = [], hangI = 0, hangT = 0; const hangFrom = new THREE.Vector3();
  function moveLoop(c, dx, dy, dz) { for (const i of loops[c].parts) { P[i].x += dx; P[i].y += dy; P[i].z += dz; PP[i].x += dx; PP[i].y += dy; PP[i].z += dz; } heldEnds.mid.x += dx; heldEnds.mid.y += dy; heldEnds.mid.z += dz; target.x += dx; target.y += dy; target.z += dz; }
  function hangStep() {
    if (heldLoop < 0) { cancelPush(); return; } const g = hookOf(pushEye);
    if (pushT === 1) { const m = heldEnds.mid, s = m.x >= g.x ? 1 : -1, yf = -g.len - g.knob - 24;
      hang = [[g.x + s * 46, m.y, g.z + 4, 12], [g.x + s * 46, yf, g.z + 4, 12], [g.x, yf, g.z, 12], [g.x, 16, g.z, 40]]; hangI = 0; hangT = 0; hangFrom.copy(m); }
    if (hangI < hang.length) { const w = hang[hangI]; hangT++; const k = ease(Math.min(1, hangT / w[3])), m = heldEnds.mid;
      moveLoop(heldLoop, hangFrom.x + (w[0] - hangFrom.x) * k - m.x, hangFrom.y + (w[1] - hangFrom.y) * k - m.y, hangFrom.z + (w[2] - hangFrom.z) * k - m.z);
      if (hangT >= w[3]) { hangI++; hangT = 0; hangFrom.copy(m); } }
    else if (!pushed) { pushed = true; freeLoop(); hint(HINT_HUNG); }
  }
  function pushProgress() { if (pushEye < 0) return 0; if (pushed) return 1; if (kind(pushEye) === 'hook') { let n = 0; for (let i = 0; i < hangI; i++) n += hang[i][3]; return Math.min(1, (n + hangT) / hang.reduce((a, w) => a + w[3], 0)); }
    if (kind(pushEye) === 'ring' && pushDir > 0) { const pre = wp.length * LEG; if (pushT <= pre) return 0.25 * pushT / pre; const past = (P[grab].y - tCentre(pushEye).y); return 0.25 + 0.45 * Math.max(0, Math.min(1, (past + SIDE) / (SIDE + 40))) + 0.3 * Math.min(1, feed / RING_FEED); } const pre = wp.length * LEG; if (pushT <= pre) return 0.3 * pushT / pre; const past = (P[grab].y - tCentre(pushEye).y) * pushDir; return 0.3 + 0.7 * Math.max(0, Math.min(1, (past + SIDE) / (SIDE + 40))); }

  /* ---------- overlay: target ring and the demo hand ---------- */
  const ring = document.createElement('div'); ring.className = 'tring'; ring.hidden = true; stage.appendChild(ring);
  ring.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle class="pulse" cx="32" cy="32" r="22"/><circle class="track" cx="32" cy="32" r="22"/><circle class="bar" cx="32" cy="32" r="22" pathLength="100"/><path class="tick" d="M22 33l7 7 13-14"/></svg>';
  const ringBar = ring.querySelector('.bar');
  const handEl = document.createElement('div'); handEl.className = 'thand'; handEl.hidden = true; stage.appendChild(handEl);
  const v3 = new THREE.Vector3();
  function toStage(v) { const q = v3.copy(v).project(camera); const r = renderer.domElement.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left + (q.x + 1) / 2 * r.width, y: r.top - s.top + (1 - q.y) / 2 * r.height }; }
  function overlay() {
    const c = pushEye >= 0 ? pushEye : nearLoop;
    if (c >= 0 && grab >= 0) { const p = toStage(tCentre(c)); ring.hidden = false; ring.style.left = p.x + 'px'; ring.style.top = p.y + 'px'; ringBar.style.strokeDashoffset = (100 - pushProgress() * 100).toFixed(1); ring.classList.toggle('hold', pushEye >= 0); ring.classList.toggle('done', pushed); ring.classList.toggle('wait', pushEye < 0); }
    else ring.hidden = true;
    if (demo && (grab >= 0 || demoHand)) { const p = toStage(grab >= 0 ? P[grab] : demoHand); handEl.hidden = false; handEl.style.left = p.x + 'px'; handEl.style.top = p.y + 'px'; } else handEl.hidden = true;
  }

  /* ---------- what the rope is doing ---------- */
  function onPegCount() { const g = pegs[0]; let n = 0; for (let i = 0; i < P.length; i++) if (Math.hypot(P[i].x - g.x, P[i].z - g.z) < 16) n++; return n; }
  const cu = new THREE.Vector3(), cv = new THREE.Vector3(), cn = new THREE.Vector3(), cc = new THREE.Vector3(), cq = new THREE.Vector3();
  /* which other parts of the rope pass through loop c: crossings of the loop's plane inside its outline */
  function crossings(c) {
    const L = loops[c], n = L.parts.length, K = P[L.parts[0]], J = P[L.parts[n - 1]];
    const A = L.parts.slice(1, 1 + LOOPN).map(i => P[i]), B = L.parts.slice(1 + LOOPN, 1 + 2 * LOOPN).map(i => P[i]);
    cc.set(0, 0, 0); for (const i of L.parts) cc.add(P[i]); cc.multiplyScalar(1 / n);
    cu.subVectors(J, K).normalize(); cv.copy(A[1]).add(A[2]).sub(B[1]).sub(B[2]).normalize(); cn.crossVectors(cu, cv).normalize();
    const half = J.distanceTo(K) / 2, w = (A[1].distanceTo(B[1]) + A[2].distanceTo(B[2])) / 4 + 2; const out = [];
    for (const s of segs) { if (ownLoop(s[0], c) && ownLoop(s[1], c)) continue; if (L.parts.includes(s[0]) || L.parts.includes(s[1])) continue;
      const a = P[s[0]], b = P[s[1]]; const da = cq.subVectors(a, cc).dot(cn), db = cq.subVectors(b, cc).dot(cn); if (da * db > 0) continue;
      const t = da / (da - db); cq.copy(a).lerp(b, t).sub(cc); const lu = cq.dot(cu), lv = cq.dot(cv);
      const ang = Math.abs(da - db) / (a.distanceTo(b) || 1);   /* how steeply the segment crosses the plane: a rope lying along the loop does not count */
      if (Math.abs(lu) <= half && Math.abs(lv) < w && ang > 0.35) out.push(cellOf[s[0]]); }
    return out;
  }
  function loopWidth(c) { const L = loops[c]; let w = 0; for (const k of L.eyes) w += P[eyes[k][0]].distanceTo(P[eyes[k][1]]); return w / L.eyes.length; }
  function loopNearPeg(c, d) { const q = loopCentre(c), g = pegs[0]; return Math.hypot(q.x - g.x, q.z - g.z) < d; }
  const END_CELL = CELLS - 2, tip = () => tips[0];
  function anyThrough(c) { return crossings(c).some(k => k >= c + 1 || k === CELLS); }   /* the next cell counts too: a noose pulled tight to the hook has its own next cell through it */
  function firstLoopAnyThrough() { for (let c = 0; c < CELLS - 2; c++) if (anyThrough(c)) return c; return -1; }
  function endThrough(c) { return crossings(c).some(k => k >= Math.max(END_CELL, c + 2) || k === CELLS); }
  function firstLoopEndThrough() { for (let c = 0; c < CELLS - 2; c++) if (endThrough(c)) return c; return -1; }

  /* ---------- texts ---------- */
  const HINT_GRAB = 'Hold it still over a loop or the ring and it goes through. Hold a loop over a hook and it goes on.', HINT_NEAR = 'Hold still here and it goes through this loop.', HINT_RING = 'Hold still here and it goes through the ring.', HINT_HOOK = 'Hold still here and this loop goes over the hook.', HINT_HOLD = 'Holding the loop open… keep still.', HINT_HANGING = 'Opening the loop and lifting it over the hook… keep still.', HINT_THROUGH = 'Through. Let go, or keep pulling.', HINT_HUNG = 'On the hook. Let go.';
  const INTRO = 'A loose rope on a wall with two hooks and a ring. Drag it, thread it, hang it, lock it: nothing here is scripted, the locks hold because the rope grips itself, just like the real one. Show me a lock ties the running loop for you.';
  const INTRO_SHORT = 'Drag the rope. Hold still over a loop or the ring and it goes through. Hold a loop over a hook and it goes on.';
  const DEMO_TEXT = [
    ['The hand takes the end of the rope and holds it still over a loop further up: the loop opens, and the end goes through. That makes the running loop.', 'The end goes through a loop further up: the running loop.'],
    ['Then it lifts the running loop and drops it over the hook.', 'The running loop goes over the hook.'],
    ['Then it pulls the end. The loop runs up to the hook and closes on the rope: the running loop, the everyday RunLock lock.', 'Pulled: the loop runs up to the hook and closes.'],
    ['That is the running loop. Load it as hard as you like. Drag the rope at the hook to slack it off, and it opens. Carry on from here, or reset.', 'The running loop. Pull as hard as you like; slack it off and it opens.'] ];
  /* every text the box can show is laid out in it, invisibly, so the box is always as tall as the tallest of them: the panel, and with it the stage, keeps its size when the text changes */
  function textBox(el, texts) { if (!el) return null; el.textContent = ''; const live = document.createElement('span'); live.className = 'live'; el.appendChild(live);
    for (const t of texts) { const g = document.createElement('span'); g.className = 'ghost'; g.setAttribute('aria-hidden', 'true'); g.textContent = t; el.appendChild(g); } return live; }
  const msgLive = textBox(msg, [INTRO, ...DEMO_TEXT.map(t => t[0])]), capLive = textBox(capMsg, [INTRO_SHORT, ...DEMO_TEXT.map(t => t[1]), HINT_GRAB, HINT_NEAR, HINT_RING, HINT_HOOK, HINT_HOLD, HINT_HANGING, HINT_THROUGH, HINT_HUNG]);
  let hintText = null, baseText = [INTRO, INTRO_SHORT];
  function showText() { if (msgLive) msgLive.textContent = baseText[0]; if (capLive) capLive.textContent = hintText || baseText[1]; }
  function hint(t) { if (demo && t) t = null; if (t === hintText) return; hintText = t;   /* while the hand shows a lock, the caption tells what it is doing, not what you could do */ if (capLive) capLive.textContent = t || baseText[1]; }
  function say(k) { baseText = k < 0 ? [INTRO, INTRO_SHORT] : DEMO_TEXT[k]; hintText = null; showText(); }

  /* ---------- "Show me": a hand that ties the running loop, drops it over the hook and pulls it tight, with the same rope and the same physics ---------- */
  let demo = null, demoThru = 0, noPush = false;   /* noPush: the hand is only carrying, holding still must not start a push */
  function* dMove(pts, sp) { let cx = target.x, cz = target.z; for (const [x, z] of pts) { const n = Math.max(1, Math.ceil(Math.hypot(x - cx, z - cz) / sp)); for (let k = 1; k <= n; k++) { if (grab < 0) return; setTarget(cx + (x - cx) * k / n, cz + (z - cz) * k / n); yield; } cx = x; cz = z; } }
  function* dWait(n) { for (let k = 0; k < n; k++) yield; }
  function* dHoldUntilThrough(max) { for (let k = 0; k < max; k++) { if (pushed) { yield* dWait(40); return; } yield; } }   /* and a moment more: the hand feeds the end on through */
  function* dMoveToLoop(c, ox, oz, sp) { for (let k = 0; k < 200; k++) { if (grab < 0) return; const q = loopCentre(c); const x = q.x + ox, z = q.z + oz; const d = Math.hypot(x - target.x, z - target.z); if (d < 1.5) return; const m = Math.min(sp, d); setTarget(target.x + (x - target.x) * m / d, target.z + (z - target.z) * m / d); yield; } }
  function* pushThrough(i, c, from) { grabParticle(i); yield* dMoveToLoop(c, from ? from[0] : 0, from ? from[1] : -70, 5); yield* dMoveToLoop(c, 3, -2, 5); yield* dHoldUntilThrough(200); release(); yield* dWait(60); }
  function* settle(max) { for (let k = 0; k < max; k++) { if (grab < 0 || P[grab].distanceTo(target) < 6) return; yield; } }   /* let the rope catch up with the hand */
  /* the running loop: the end through this loop of the hanging rope, and this far through, which sets the size of the noose */
  const NOOSE = 5, NOOSE_THRU = 100;
  /* the noose is picked up by its far side and held open as a round ring, carried up in front of the hook, past the knob and back onto the shaft, and let go:
     it hangs on the hook with the locking loop at the bottom. While it is carried the ring is rigid; the rope on either side of it follows */
  let demoHand = null, carried = null;
  function unCarry() { if (!carried) return; carried.parts.forEach((i, n) => { W[i] = carried.w0[n]; PP[i].copy(P[i]); }); carried = null; demoHand = null; }
  function* carryNoose(c) {
    const Lp = loops[c].parts, a0 = arc[Lp[Lp.length - 1]], q = loopCentre(c).clone();
    let aEnd = -1, bd = 1e9; for (let i = 0; i < P.length; i++) { if (ropeOf[i] !== 0 || arc[i] < a0 + 40) continue; const d = P[i].distanceTo(q); if (d < bd) { bd = d; aEnd = arc[i]; } }   /* where the end passes through the loop */
    if (aEnd < 0) return;
    const L = aEnd - a0, R = L / (2 * Math.PI), aMid = (a0 + aEnd) / 2;
    const parts = []; for (let i = 0; i < P.length; i++) if (ropeOf[i] === 0 && arc[i] >= a0 && arc[i] <= aEnd - 25) parts.push(i);   /* the last bit stays free: it is what sits in the loop */
    const js = parts.filter(i => joinP[i]).sort((u, v) => arc[u] - arc[v]);
    let hi = js[0]; for (const i of js) if (Math.abs(arc[i] - aMid) < Math.abs(arc[hi] - aMid)) hi = i;   /* the hand holds the far side of the noose: the top of the ring */
    const nearArc = (a) => { let b = js[0]; for (const i of js) if (Math.abs(arc[i] - a) < Math.abs(arc[b] - a)) b = i; return b; };
    /* first the noose is lifted by its far side, so it hangs from the hand with the loop at the bottom and the end still through it */
    const j6 = P[Lp[Lp.length - 1]], g = pegs[0]; noPush = true; grabParticle(hi); yield* dMove([[j6.x + 16, j6.z + 2 * R + 16]], 4); yield* dWait(24); noPush = false; if (grab < 0) return; release(); hint(null);
    /* which side each half of the noose hangs on now, so the ring opens without turning over */
    const sgn = P[nearArc(aMid - L / 4)].x < P[nearArc(aMid + L / 4)].x ? -1 : 1;
    const at = (i, cx, cy, cz) => { const th = Math.PI / 2 + sgn * 2 * Math.PI * (arc[i] - aMid) / L, r = R + strand[i] * eyeW[i] / 2; return [cx + r * Math.cos(th), cy, cz + r * Math.sin(th)]; };
    const start = parts.map(i => P[i].clone()), w0 = parts.map(i => W[i]); for (const i of parts) W[i] = 0; carried = { parts, w0 };
    let cx = P[hi].x, cy = Math.max(-10, Math.min(10, P[hi].y)), cz = P[hi].z - R;   /* the ring opens out from the hanging bight: the top stays in the hand, the loop stays at the bottom */
    const way = [[cx, cy, cz, 30], [g.x - 12, -86, g.z + 8, 72], [g.x, -86, g.z, 14], [g.x, 10, g.z, 36]];
    let from = [cx, cy, cz]; demoHand = new THREE.Vector3();
    for (let wi = 0; wi < way.length; wi++) { const w = way[wi];
      for (let t = 1; t <= w[3]; t++) { if (!demo) break; const k = ease(t / w[3]); cx = from[0] + (w[0] - from[0]) * k; cy = from[1] + (w[1] - from[1]) * k; cz = from[2] + (w[2] - from[2]) * k;
        parts.forEach((i, n) => { const p = at(i, cx, cy, cz); if (wi === 0) { P[i].set(start[n].x + (p[0] - start[n].x) * k, start[n].y + (p[1] - start[n].y) * k, start[n].z + (p[2] - start[n].z) * k); } else P[i].set(p[0], p[1], p[2]); PP[i].copy(P[i]); });
        demoHand.copy(P[hi]); yield; }
      from = [w[0], w[1], w[2]]; }
    unCarry();
    yield* dWait(70); }
  /* pull the end, down and to the left, until the loop has run up to the hook and closed on the rope, then a little more, and let go */
  function* pullEnd(c) { grabParticle(tip()); if (c < 0) { release(); return; }
    for (let k = 0; k < 200; k++) { if (grab < 0) return; setTarget(target.x - 0.3, Math.max(20, target.z - 2.2)); yield;
      if (firstLoopAnyThrough() < 0 || loopNearPeg(c, 45)) break; }
    for (let k = 0; k < 25; k++) { if (grab < 0 || firstLoopAnyThrough() < 0) break; setTarget(target.x - 1.2, Math.max(20, target.z - 0.8)); yield; }
    yield* settle(40); release(); yield* dWait(50); }
  function* runningLoop() {
    say(0); demoThru = NOOSE_THRU; yield* pushThrough(tip(), NOOSE); demoThru = 0;
    const c = firstLoopAnyThrough(); if (c < 0) return;
    say(1); yield* carryNoose(c);
    say(2); yield* pullEnd(firstLoopAnyThrough());
    say(3);
  }
  const SHOW_LABEL = ['Show me a lock', 'Show me'];
  function startDemo() { stopDemo(); restart(); demo = runningLoop(); host.classList.add('demo'); if (showBtn) showBtn.textContent = 'Stop'; if (capShow) capShow.textContent = 'Stop'; }
  function stopDemo(done) { if (!demo) return; demo = null; demoThru = 0; noPush = false; unCarry(); release(); if (!done) say(-1); else hint(null); host.classList.remove('demo'); if (showBtn) showBtn.textContent = SHOW_LABEL[0]; if (capShow) capShow.textContent = SHOW_LABEL[1]; }
  /* the button keeps the width of its longer label, so the row does not re-wrap when it says Stop */
  function holdWidth() { for (const b of [showBtn, capShow]) if (b && SHOW_LABEL.includes(b.textContent)) { b.style.minWidth = ''; b.style.minWidth = Math.ceil(b.getBoundingClientRect().width) + 'px'; } }
  holdWidth(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(holdWidth);
  if (showBtn) showBtn.addEventListener('click', () => { if (demo) stopDemo(); else startDemo(); }); if (capShow) capShow.addEventListener('click', () => { if (demo) stopDemo(); else startDemo(); });

  /* ---------- loop ---------- */
  let running = false, raf = 0, frame = 0, paused = false, lastNow = 0, acc = 0, stepMs = 0, lowQ = false, qAt = 0;
  function simFrame() { frame++; if (bad) { restart(); bad = false; }
    if (demo) { const r = demo.next(); if (r.done) stopDemo(true); }
    holdLogic(); breathe(); handMoving = grab >= 0 && (handFrames > 0 || pushEye >= 0); if (handFrames > 0) handFrames--;
    if (frame % 3 === 0) for (let c = 0; c < loops.length; c++) { if (loopWidth(c) >= 16.5) { bite[c] = 0; continue; } const n = crossings(c).length; bite[c] = n >= 3 ? 2 : n >= 1 ? 1 : 0; }   /* a closed loop grips what runs through it; three or more crossings is a fold (a single pass makes two), and that it bites */
    const t0 = performance.now(); step(); stepMs = stepMs * 0.9 + (performance.now() - t0) * 0.1;
    if (!lowQ && stepMs > 9 && frame > 60) { lowQ = true; SUB = 8; DIST_SWEEPS = 3; qAt = frame; } else if (lowQ && stepMs < 3.5 && frame - qAt > 600) { lowQ = false; SUB = 12; DIST_SWEEPS = 4; qAt = frame; } }
  function tick(now) {
    const dt = Math.min(50, lastNow ? now - lastNow : 16.7); lastNow = now; acc += dt; let n = 0;
    while (acc >= 1000 / 60 && n < 2) { simFrame(); acc -= 1000 / 60; n++; } if (acc > 1000 / 60) acc = 0;
    if (n) { draw(); overlay(); }
    if (running && !paused) raf = requestAnimationFrame(tick);
  }
  function start() { if (!running) { running = true; lastNow = 0; if (!paused) raf = requestAnimationFrame(tick); } }
  function stop() { running = false; cancelAnimationFrame(raf); }
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop()), { threshold: 0.05 }).observe(stage); else start();

  function restart() { release(); build(); buildMeshes(); for (let i = 0; i < 40; i++) step(); }
  function resetAll() { stopDemo(); yaw = 0; pitch = 0; placeCamera(); restart(); say(-1); }
  if (reset) reset.addEventListener('click', resetAll); if (capReset) capReset.addEventListener('click', resetAll);
  /* rope colour: the five RunLock colours, for the rope you last took hold of */
  const dots = host.querySelectorAll('.tdots button');
  function showDots() { dots.forEach(b => b.setAttribute('aria-pressed', b.dataset.c === ropeColour[lastRope] ? 'true' : 'false')); }
  dots.forEach(b => b.addEventListener('click', () => { ropeColour[lastRope] = b.dataset.c; showDots(); if (!running || paused) draw(); }));
  showDots();
  if (fsb) { fsb.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else if (host.requestFullscreen) host.requestFullscreen(); });
    document.addEventListener('fullscreenchange', () => { fsb.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; setTimeout(resize, 60); setTimeout(resize, 400); });
    if (!document.documentElement.requestFullscreen) fsb.hidden = true; }
  window.addEventListener('resize', resize); if ('ResizeObserver' in window) new ResizeObserver(() => resize()).observe(stage);   /* the stage follows the panel's height */
  restart(); say(-1); resize(); draw();
  host.dataset.ready = '1';
  window.__rope3d = { bad: () => bad, stretch: () => { let m = 0, sum = 0; for (const sg of segs) { const st = Math.abs(P[sg[0]].distanceTo(P[sg[1]]) - sg[2]); sum += st; if (st > m) m = st; } return { max: m.toFixed(2), mean: (sum / segs.length).toFixed(3) }; }, dbg,
    get: () => ({ P, segs, contacts: contacts.length, grab, target: target.clone(), held: heldLoop, pushEye, pushed, demo: !!demo, stepMs, lowQ, nearLoop, tips, ropeOf, colours: ropeColour }), setColour: (r, c) => { ropeColour[r] = c; }, orbit: orbitBy, loopCentre: (c) => loopCentre(c).clone(), tCentre: (c) => tCentre(c).clone(), eyes: () => eyes, loops: () => loops, cellOf: () => cellOf, pegs, rings, clamp, crossings, onPegCount, loopWidth, firstLoopAnyThrough, firstLoopEndThrough, loopNearPeg,
    project: (v) => { const q = v.clone().project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height }; },
    grabAt: (i) => grabParticle(i), move: (x, z) => setTarget(x, z), release, step, frame: (nodraw) => { simFrame(); if (!nodraw) { draw(); overlay(); } }, draw, startDemo, stopDemo,
    setQ: (low) => { lowQ = !!low; SUB = low ? 8 : 12; DIST_SWEEPS = low ? 3 : 4; qAt = frame + 1e9; },
    pause: () => { paused = true; cancelAnimationFrame(raf); }, resume: () => { paused = false; lastNow = 0; if (running) raf = requestAnimationFrame(tick); }, restart: resetAll, camera, renderer };
}
