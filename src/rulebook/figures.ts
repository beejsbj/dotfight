// The rulebook's drawings: each mechanic sketched on the page with the game's
// own ballpoint and pencil. A figure is a function of time t (0..1): the ink
// goes on the way a hand would put it there, and at t = 1 it's the finished
// drawing. Everything is seeded, so a figure always looks the same.

import { distToPath, rng, type Pt } from "../game";
import { INK, handText, inkCircle, inkCross, inkDot, inkPolygon, pencilArrow, pencilLine, pencilLoop } from "../ink";

type Ctx = CanvasRenderingContext2D;

export interface Figure {
  /** Logical size: every figure is drawn 400 wide. */
  w: number;
  h: number;
  /** How long it takes to draw, ms. */
  dur: number;
  draw(g: Ctx, t: number): void;
}

const BLUE = INK.pens[0], RED = INK.pens[1];
const LEAD = "rgb(62, 60, 58)";
const DOT = 5.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Progress through [a, b] of the timeline. */
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const P = (x: number, y: number): Pt => ({ x, y });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dirOf = (a: number): Pt => ({ x: Math.cos(a), y: Math.sin(a) });
const add = (a: Pt, d: Pt, k: number): Pt => ({ x: a.x + d.x * k, y: a.y + d.y * k });

// --- paths -------------------------------------------------------------------

/** A polyline resampled to even steps, so "a fraction of the points" is a fraction of the length. */
function resample(poly: Pt[], step = 3): Pt[] {
  const out: Pt[] = [poly[0]];
  let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    let d = step - carry;
    while (d <= l) { out.push(lerp(a, b, d / l)); d += step; }
    carry = l - (d - step);
  }
  const end = poly[poly.length - 1], last = out[out.length - 1];
  if (Math.hypot(end.x - last.x, end.y - last.y) > 0.5) out.push(end);
  return out;
}
/** A gently bowed stroke from a to b (bow as a share of its length, + bends left of travel). */
function bowed(a: Pt, b: Pt, bow = 0.04): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  const c = { x: (a.x + b.x) / 2 + (dy / l) * bow * l * 2, y: (a.y + b.y) / 2 - (dx / l) * bow * l * 2 };
  const q: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t;
    q.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return resample(q);
}
const along = (pts: Pt[], p: Pt) => distToPath(p, pts).along;
function at(pts: Pt[], u: number): Pt {
  const f = clamp01(u) * (pts.length - 1), i = Math.floor(f);
  return i >= pts.length - 1 ? pts[pts.length - 1] : lerp(pts[i], pts[i + 1], f - i);
}

// --- marks ---------------------------------------------------------------------

/**
 * A ballpoint line whose weight is set along its length: it thins where it
 * pays for a wall or a man. Drawn in runs of one weight, so the ink reads as
 * one stroke rather than a string of beads.
 */
function taperLine(g: Ctx, pts: Pt[], width: (u: number) => number, color: string, seed: number, upTo = 1) {
  if (upTo <= 0 || pts.length < 2) return;
  let r = seed >>> 0;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.globalAlpha = 0.5;
  g.beginPath();
  g.arc(pts[0].x, pts[0].y, width(0) * 1.1, 0, Math.PI * 2);
  g.fill();
  const n = pts.length - 1, head = n * upTo;
  const q = (w: number) => Math.round(w * 5) / 5;
  let run: Pt[] = [pts[0]], rw = q(width(1 / n));
  const flush = () => {
    if (run.length > 1 && rw > 0) {
      g.globalAlpha = Math.min(0.9, 0.52 + rw * 0.12) + (rand() - 0.5) * 0.06;
      g.lineWidth = rw;
      g.beginPath();
      run.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
  };
  for (let i = 1; i <= Math.ceil(head); i++) {
    const w = q(width(i / n));
    const a = pts[i - 1], b = pts[i], f = Math.min(1, head - (i - 1));
    const end = f >= 1 ? b : lerp(a, b, f);
    if (w !== rw) { flush(); run = [a]; rw = w; }
    run.push(end);
    if (w <= 0) break;
  }
  flush();
  g.globalAlpha = 1;
}

/** The plain flick: heavy where the pen sat, thinning as it lifts off. */
const flick = (g: Ctx, pts: Pt[], color: string, seed: number, upTo = 1, w = 3) =>
  taperLine(g, pts, (u) => w * (u < 0.06 ? 1.1 : 1 - Math.pow(u, 1.8) * 0.62), color, seed, upTo);

function note(g: Ctx, text: string, x: number, y: number, upTo = 1, o: { size?: number; rot?: number; align?: "left" | "center" | "right"; color?: string; weight?: number } = {}) {
  handText(g, text, x, y, o.size ?? 19, o.color ?? LEAD, { upTo, alpha: 0.9, weight: o.weight ?? 400, rot: o.rot ?? -0.03, align: o.align ?? "left" });
}
const arrow = (g: Ctx, a: Pt, b: Pt, seed: number, upTo = 1, bend = 0.18) => pencilArrow(g, a, b, bend, seed, 1.4, upTo, 0.85);

/** A dashed pencil circle: a limit, not a wall. */
function pencilRing(g: Ctx, c: Pt, r: number, seed: number, upTo = 1) {
  const n = Math.round((r * Math.PI * 2) / 9);
  for (let i = 0; i < n * upTo; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n * 0.55;
    pencilLine(g, add(c, dirOf(a0), r), add(c, dirOf(a1), r), 1.2, seed + i, false);
  }
}
/** The aim cone the game shows: two faint pencil lines. */
function cone(g: Ctx, from: Pt, ang: number, spread: number, len: number, seed: number, upTo = 1) {
  if (upTo <= 0) return;
  for (const s of [-1, 1]) pencilLine(g, add(from, dirOf(ang + s * spread), 14), add(from, dirOf(ang + s * spread), 14 + (len - 14) * upTo), 1, seed + s, true);
}
/** A jolt: a quick pencil zigzag across the line. */
function zigzag(g: Ctx, p: Pt, ang: number, upTo = 1) {
  if (upTo <= 0) return;
  const d = dirOf(ang), n = dirOf(ang + Math.PI / 2);
  g.strokeStyle = LEAD;
  g.lineWidth = 1.3;
  g.globalAlpha = 0.8;
  g.beginPath();
  const k = Math.ceil(5 * upTo);
  for (let i = 0; i <= k; i++) {
    const q = add(add(p, d, (i - 2.5) * 4), n, (i % 2 ? 1 : -1) * 7 + 12);
    if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
  }
  g.stroke();
  g.globalAlpha = 1;
}
/** A groove catch: "=" pencilled along the line. */
function grooveMark(g: Ctx, p: Pt, ang: number, seed: number) {
  const d = dirOf(ang), n = dirOf(ang + Math.PI / 2);
  for (const s of [-1, 1]) pencilLine(g, add(add(p, n, s * 3 - 9), d, -6), add(add(p, n, s * 3 - 9), d, 6), 1.2, seed + s, false);
}
/** A small pencil star: a bank or a split. */
function star(g: Ctx, p: Pt, upTo = 1) {
  if (upTo <= 0) return;
  g.strokeStyle = LEAD;
  g.lineWidth = 1.2;
  g.globalAlpha = 0.8;
  for (let i = 0; i < 4; i++) {
    const d = dirOf((i / 4) * Math.PI + 0.3), r = 7 * upTo;
    g.beginPath();
    g.moveTo(p.x - d.x * r, p.y - d.y * r);
    g.lineTo(p.x + d.x * r, p.y + d.y * r);
    g.stroke();
  }
  g.globalAlpha = 1;
}

const dot = (g: Ctx, p: Pt, color: string, seed: number, grow = 1, alpha = 1) => inkDot(g, p.x, p.y, DOT, color, seed, alpha, grow);
const kill = (g: Ctx, p: Pt, color: string, seed: number, upTo = 1) => inkCross(g, p.x, p.y, DOT * 1.9, color, seed, 2.3, 1, upTo);
/** Soldiers jotted in a base: a sunflower spread, the way a hand fills a circle. */
function jot(c: Pt, r: number, n: number, turn = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const rr = r * 0.72 * Math.sqrt((i + 0.6) / n), a = i * 2.39996 + turn;
    out.push(P(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr));
  }
  return out;
}
/** Is p near the line (within a dot)? */
const onLine = (pts: Pt[], p: Pt) => distToPath(p, pts).d < DOT + 3;

// --- the figures -------------------------------------------------------------------

/** Setup: a base drawn, jotted full, and a man placed just outside its wall. */
const setup: Figure = {
  w: 400, h: 224, dur: 3200,
  draw(g, t) {
    const c = P(106, 110), r = 66;
    inkCircle(g, c.x, c.y, r, BLUE, 41, 2.8, 2, ease(seg(t, 0, 0.22)));
    const men = jot(c, r, 9, 0.4);
    const from = men[2], to = add(c, dirOf(-0.5), r + 10);
    men.forEach((m, i) => { if (i !== 2) dot(g, m, BLUE, 50 + i, seg(t, 0.22 + i * 0.03, 0.3 + i * 0.03)); });
    pencilRing(g, c, r + 16, 70, seg(t, 0.52, 0.64));
    const k = ease(seg(t, 0.66, 0.84));
    if (k > 0 && k < 1) arrow(g, from, to, 80, 1, 0.3);
    dot(g, lerp(from, to, k), BLUE, 52, seg(t, 0.28, 0.36));
    arrow(g, P(250, 46), P(to.x + 12, to.y - 6), 81, seg(t, 0.84, 0.94), -0.2);
    note(g, "a little outside", 238, 30, seg(t, 0.84, 0.94));
    note(g, "is allowed", 252, 52, seg(t, 0.86, 0.96));
    arrow(g, P(246, 160), P(c.x + r + 2, c.y + 22), 82, seg(t, 0.9, 1), 0.2);
    note(g, "walls protect", 240, 178, seg(t, 0.9, 1));
  },
};

/** Flicking: soft is short and sure; hard is long and wild. */
const flicking: Figure = {
  w: 400, h: 220, dur: 3400,
  draw(g, t) {
    // soft
    const a = P(72, 62), fa = P(190, 58);
    dot(g, a, BLUE, 3);
    dot(g, fa, RED, 4);
    pencilArrow(g, a, P(46, 63), 0.1, 5, 1.4, ease(seg(t, 0, 0.12)), 0.85);
    cone(g, a, -0.03, 0.035, 140, 6, seg(t, 0.1, 0.2));
    const la = bowed(a, P(206, 57), 0.01);
    flick(g, la, BLUE, 7, ease(seg(t, 0.2, 0.34)));
    if (t > 0.3) kill(g, fa, BLUE, 8, seg(t, 0.3, 0.36));
    note(g, "soft: short and sure", 222, 50, seg(t, 0.36, 0.48));
    // hard
    const b = P(72, 160), fb = P(300, 160);
    dot(g, b, BLUE, 9);
    dot(g, fb, RED, 10);
    pencilArrow(g, b, P(14, 166), 0.1, 11, 1.4, ease(seg(t, 0.5, 0.62)), 0.85);
    cone(g, b, 0, 0.13, 330, 12, seg(t, 0.6, 0.7));
    const lb = bowed(b, P(392, 116), -0.03);
    flick(g, lb, BLUE, 13, ease(seg(t, 0.7, 0.86)), 2.9);
    note(g, "hard: long and wild", 150, 207, seg(t, 0.86, 1));
  },
};

/** A snipe tapers: a lot of its power goes at each wall, a little at each man, and it falls short. */
const snipe: Figure = {
  w: 400, h: 240, dur: 3600,
  draw(g, t) {
    const s = P(24, 168), full = P(396, 84);
    const path = bowed(s, full, 0.035);
    const stop = 0.74; // where the power runs out
    const base = P(196, 128), r = 50;
    // where the line meets the wall, going in and coming out
    const inWall = path.findIndex((p) => Math.hypot(p.x - base.x, p.y - base.y) < r) / (path.length - 1);
    const inside = path.map((p) => Math.hypot(p.x - base.x, p.y - base.y) < r);
    const outWall = inside.lastIndexOf(true) / (path.length - 1);
    const hits = [at(path, inWall + 0.07), at(path, outWall - 0.08)];
    const others = jot(base, r, 6, 1.1).filter((p) => !hits.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 16) && !onLine(path, p));
    const far = at(path, 0.88);
    const w = (u: number) => {
      let k = 3.6;
      if (u > inWall) k -= 0.8;
      for (const h of hits) if (u > along(path, h)) k -= 0.3;
      if (u > outWall) k -= 0.6;
      return u > stop ? 0 : k * (u > stop - 0.06 ? (stop - u) / 0.06 * 0.6 + 0.4 : 1);
    };
    inkCircle(g, base.x, base.y, r, RED, 21);
    others.forEach((p, i) => dot(g, p, RED, 30 + i));
    hits.forEach((p, i) => dot(g, p, RED, 40 + i));
    dot(g, far, RED, 44);
    dot(g, s, BLUE, 45);
    const head = ease(seg(t, 0.05, 0.5)) * stop;
    taperLine(g, path, w, BLUE, 46, head);
    hits.forEach((p, i) => { if (head > along(path, p)) kill(g, p, BLUE, 47 + i, seg(t, 0.1 + along(path, p) * 0.6, 0.18 + along(path, p) * 0.6)); });
    // where it would have gone
    const ghost = seg(t, 0.55, 0.65);
    if (ghost > 0) pencilLine(g, at(path, stop + 0.01), at(path, stop + 0.01 + (0.99 - stop) * ghost), 1.1, 49, true);
    // notes
    const wi = at(path, inWall);
    arrow(g, P(wi.x - 58, wi.y - 58), P(wi.x - 4, wi.y - 8), 50, seg(t, 0.62, 0.72), -0.25);
    note(g, "a wall: a lot", wi.x - 118, wi.y - 64, seg(t, 0.62, 0.72));
    note(g, "each man: a little", 150, 222, seg(t, 0.7, 0.8));
    arrow(g, P(186, 208), P(hits[1].x - 4, hits[1].y + 12), 51, seg(t, 0.72, 0.8), 0.15);
    const end = at(path, stop);
    note(g, "falls short", end.x - 30, end.y + 40, seg(t, 0.8, 0.9));
    note(g, "two with one line: flick again!", 104, 30, seg(t, 0.88, 1), { color: BLUE, weight: 700, size: 20, rot: -0.02 });
  },
};

/** Garrisoned walls: a full base's wall eats a snipe; a base shot down is paper. */
const garrisonWalls: Figure = {
  w: 400, h: 240, dur: 3800,
  draw(g, t) {
    const r = 46;
    // left: a full base. The line pays most of its power at the wall and dies inside.
    const A = P(112, 104), sa = P(92, 228);
    const la = bowed(sa, P(128, 8), 0.02);
    const inA = la.findIndex((p) => Math.hypot(p.x - A.x, p.y - A.y) < r) / (la.length - 1);
    const stopA = inA + 0.1;
    const menA = jot(A, r, 9, 0.3).filter((p) => !onLine(la, p));
    inkCircle(g, A.x, A.y, r, RED, 610);
    menA.forEach((p, i) => dot(g, p, RED, 611 + i));
    dot(g, sa, BLUE, 620);
    const wa = (u: number) => (u > stopA ? 0 : u > inA ? 1.4 * (u > stopA - 0.05 ? (stopA - u) / 0.05 * 0.6 + 0.4 : 1) : 3.6);
    const headA = ease(seg(t, 0.04, 0.36)) * stopA;
    taperLine(g, la, wa, BLUE, 621, headA);
    const ghostA = seg(t, 0.36, 0.46);
    if (ghostA > 0) pencilLine(g, at(la, stopA + 0.01), at(la, stopA + 0.01 + (0.97 - stopA) * ghostA), 1.1, 622, true);
    // right: the same base shot down to two. Its wall is nearly paper; the line runs on and takes the man behind.
    const B = P(292, 104), sb = P(272, 228);
    const lb = bowed(sb, P(308, 8), 0.02);
    const inB = lb.findIndex((p) => Math.hypot(p.x - B.x, p.y - B.y) < r) / (lb.length - 1);
    const insideB = lb.map((p) => Math.hypot(p.x - B.x, p.y - B.y) < r);
    const outB = insideB.lastIndexOf(true) / (lb.length - 1);
    const menB = jot(B, r, 9, 1.7).filter((p) => !onLine(lb, p));
    const far = at(lb, 0.9);
    inkCircle(g, B.x, B.y, r, RED, 630);
    menB.forEach((p, i) => { dot(g, p, RED, 631 + i); if (i >= 2) kill(g, p, BLUE, 640 + i); });
    dot(g, far, RED, 650);
    dot(g, sb, BLUE, 651);
    const wb = (u: number) => 3.6 - (u > inB ? 0.25 : 0) - (u > outB ? 0.25 : 0) - (u > 0.92 ? (u - 0.92) / 0.08 * 2.4 : 0);
    const headB = ease(seg(t, 0.44, 0.78));
    taperLine(g, lb, wb, BLUE, 652, headB);
    if (headB > along(lb, far)) kill(g, far, BLUE, 653, seg(t, 0.44 + along(lb, far) * 0.34, 0.52 + along(lb, far) * 0.34));
    // notes
    note(g, "full: a thick wall", A.x, A.y + r + 20, seg(t, 0.3, 0.42), { align: "center" });
    note(g, "shot down: paper", B.x, B.y + r + 20, seg(t, 0.8, 0.9), { align: "center" });
    note(g, "a wall is as strong as the men inside it", 200, 234, seg(t, 0.88, 1), { align: "center", color: BLUE, weight: 700, size: 18, rot: -0.015 });
  },
};

/** A lunge: he runs his ink, a kill earns another, shakier; landing inside a base kills him. */
const lunge: Figure = {
  w: 400, h: 250, dur: 4200,
  draw(g, t) {
    const s = P(30, 206), l1 = P(176, 170), e1 = P(104, 192);
    const base = P(316, 98), r = 54;
    const leg1 = bowed(s, l1, 0.03);
    const e1p = at(leg1, along(leg1, e1));
    // the second leg jolts where it crosses the wall
    const wallAng = Math.atan2(l1.y - base.y, l1.x - base.x);
    const wallPt = add(base, dirOf(wallAng + 0.08), r);
    const pre = bowed(l1, wallPt, 0.02);
    const kink = Math.atan2(wallPt.y - l1.y, wallPt.x - l1.x) - 0.2;
    const land = add(wallPt, dirOf(kink), 34);
    const leg2 = [...pre, ...bowed(wallPt, land, 0.03).slice(1)];
    inkCircle(g, base.x, base.y, r, RED, 60);
    jot(base, r, 6, 2.4).filter((p) => Math.hypot(p.x - land.x, p.y - land.y) > 16).forEach((p, i) => dot(g, p, RED, 61 + i));
    dot(g, e1p, RED, 68);
    // link one
    const k1 = ease(seg(t, 0.06, 0.32));
    if (k1 > 0) {
      dot(g, s, BLUE, 70);
      inkCross(g, s.x, s.y, DOT * 1.2, BLUE, 71, 1.5, 0.7, seg(t, 0.32, 0.38)); // moved: his old spot, lightly crossed
    }
    flick(g, leg1, BLUE, 72, k1);
    if (k1 > along(leg1, e1p)) kill(g, e1p, BLUE, 73, seg(t, 0.2, 0.28));
    note(g, "a kill: lunge again", 96, 150, seg(t, 0.34, 0.44), { rot: -0.08 });
    // link two, shakier
    cone(g, l1, Math.atan2(wallPt.y - l1.y, wallPt.x - l1.x), 0.11, 120, 74, seg(t, 0.44, 0.52));
    note(g, "shakier", 146, 226, seg(t, 0.46, 0.54));
    const k2 = ease(seg(t, 0.54, 0.78));
    if (k2 > 0) inkCross(g, l1.x, l1.y, DOT * 1.2, BLUE, 75, 1.5, 0.7, seg(t, 0.78, 0.82));
    flick(g, leg2, BLUE, 76, k2);
    if (k2 > along(leg2, wallPt)) zigzag(g, wallPt, kink - 0.4, seg(t, 0.68, 0.74));
    const him = k1 < 1 ? at(leg1, k1) : k2 > 0 ? at(leg2, k2) : l1;
    if (k1 > 0) dot(g, him, BLUE, 77);
    if (t > 0.84) kill(g, land, RED, 78, seg(t, 0.84, 0.9));
    note(g, "lands among them: shot", 222, 196, seg(t, 0.88, 1));
    arrow(g, P(292, 178), P(land.x + 2, land.y + 12), 79, seg(t, 0.9, 1), 0.2);
  },
};

/** The angle decides: shallow, the groove pulls the pen along; steep, it jolts. */
const groove: Figure = {
  w: 400, h: 230, dur: 3600,
  draw(g, t) {
    // an old line, already dry
    const old = bowed(P(10, 138), P(392, 118), 0.01);
    flick(g, old, BLUE, 90, 1, 2.4);
    // shallow: meets it nearly parallel, is pulled in and carried along
    const meet = at(old, 0.34), rideEnd = at(old, 0.66);
    const inA = bowed(P(26, 92), meet, -0.03);
    const ride = old.filter((p) => p.x > meet.x && p.x < rideEnd.x).map((p) => P(p.x, p.y - 2.2));
    const off = bowed(ride[ride.length - 1] ?? rideEnd, P(308, 118), 0.01);
    const lineA = resample([...inA, ...ride, ...off]);
    flick(g, lineA, BLUE, 91, ease(seg(t, 0.04, 0.4)));
    if (t > 0.2) grooveMark(g, at(old, 0.45), -0.05, 92);
    // the angle it met at
    if (t > 0.42) {
      g.strokeStyle = LEAD; g.lineWidth = 1.1; g.globalAlpha = 0.75;
      g.beginPath(); g.arc(meet.x, meet.y, 34, Math.PI + 0.02, Math.PI + 0.33); g.stroke(); g.globalAlpha = 1;
    }
    note(g, "shallow: pulled into", 30, 58, seg(t, 0.42, 0.52));
    note(g, "the groove, carried along", 30, 78, seg(t, 0.44, 0.54));
    // steep: crosses and jolts
    const cross = at(old, 0.84);
    const inB = bowed(P(cross.x - 34, 24), cross, 0.02);
    const a1 = Math.atan2(cross.y - 24, 34) + 0.42;
    const outB = bowed(cross, add(cross, dirOf(a1), 86), 0.03);
    const lineB = resample([...inB, ...outB.slice(1)]);
    flick(g, lineB, BLUE, 93, ease(seg(t, 0.56, 0.84)));
    if (t > 0.72) zigzag(g, cross, Math.atan2(cross.y - 24, 34) - Math.PI / 2 + 0.2, seg(t, 0.72, 0.8));
    note(g, "steep: a jolt", 212, 212, seg(t, 0.86, 1));
    arrow(g, P(284, 200), P(cross.x - 12, cross.y + 22), 94, seg(t, 0.88, 1), -0.2);
  },
};

/** A long war send: soldiers walk the road between your bases, a turn at a time, exposed the whole way. */
const sendLong: Figure = {
  w: 400, h: 220, dur: 4200,
  draw(g, t) {
    const A = P(62, 100), B = P(338, 100), r = 42;
    inkCircle(g, A.x, A.y, r, BLUE, 100);
    inkCircle(g, B.x, B.y, r, BLUE, 101);
    jot(A, r, 5, 0.3).forEach((p, i) => dot(g, p, BLUE, 102 + i));
    jot(B, r, 3, 1.7).forEach((p, i) => dot(g, p, BLUE, 108 + i));
    const x0 = A.x + r + 10, step = 44, y = A.y;
    pencilLine(g, P(x0 - 6, y + 1), P(B.x - r - 4, y - 1), 1.3, 111, true);
    // three walkers, a hop each time the pen changes hands
    let pos = 0;
    for (let k = 1; k <= 3; k++) {
      const t0 = 0.08 + (k - 1) * 0.18;
      pos += ease(seg(t, t0, t0 + 0.1));
      note(g, String(k), x0 + k * step, y - 16, seg(t, t0 + 0.08, t0 + 0.14), { size: 17, align: "center", rot: 0 });
    }
    const walkers = [0, 1, 2].map((i) => P(x0 + pos * step - i * 15, y));
    // a red line across the road, through the last of them
    const target = P(x0 + 3 * step - 30, y), from = P(target.x - 46, 214);
    const shot = bowed(from, add(target, P((target.x - from.x) / (from.y - target.y), -1), 87), 0.002);
    const k = ease(seg(t, 0.7, 0.86));
    walkers.forEach((w, i) => dot(g, w, BLUE, 112 + i));
    dot(g, from, RED, 115);
    flick(g, shot, RED, 116, k);
    if (k > along(shot, target)) kill(g, walkers[2], RED, 117, seg(t, 0.8, 0.86));
    note(g, "a hop each turn", 70, 36, seg(t, 0.62, 0.72));
    note(g, "caught on the road", 236, 160, seg(t, 0.88, 1));
  },
};

/** A quick battle send: out between turns, on the road for one enemy turn, home at the start of yours. */
const send: Figure = {
  w: 400, h: 220, dur: 4200,
  draw(g, t) {
    const A = P(62, 100), B = P(338, 100), r = 42, y = A.y;
    inkCircle(g, A.x, A.y, r, BLUE, 100);
    inkCircle(g, B.x, B.y, r, BLUE, 101);
    jot(A, r, 4, 0.3).forEach((p, i) => dot(g, p, BLUE, 102 + i));
    jot(B, r, 3, 1.7).forEach((p, i) => dot(g, p, BLUE, 108 + i));
    pencilLine(g, P(A.x + r + 4, y + 1), P(B.x - r - 4, y - 1), 1.3, 111, true);
    // out onto the road as the pen changes hands...
    const out = ease(seg(t, 0.06, 0.26)), home = ease(seg(t, 0.72, 0.9));
    const mid = P(214, y);
    const walkers = [0, 1, 2].map((i) => {
      const from = P(A.x + 10 - i * 10, A.y + 10 - i * 8), road = P(mid.x - i * 15, y), end = [P(B.x - 22, B.y - 2), P(B.x + 6, B.y - 6), P(B.x - 16, B.y + 20)][i];
      return home > 0 ? lerp(road, end, home) : lerp(from, road, out);
    });
    // ...where they stand through one enemy turn
    const target = P(mid.x - 30, y), from = P(target.x - 46, 214);
    const shot = bowed(from, add(target, P((target.x - from.x) / (from.y - target.y), -1), 87), 0.002);
    const k = ease(seg(t, 0.36, 0.56));
    walkers.forEach((w, i) => { if (i < 2 || k <= along(shot, target)) dot(g, w, BLUE, 112 + i); });
    dot(g, from, RED, 115);
    flick(g, shot, RED, 116, k);
    if (k > along(shot, target)) { dot(g, target, BLUE, 114); kill(g, target, RED, 117, seg(t, 0.48, 0.56)); }
    note(g, "sent: out between turns", 16, 30, seg(t, 0.2, 0.3));
    note(g, "their turn: on the road", 236, 170, seg(t, 0.56, 0.66));
    note(g, "your turn: home", 396, 30, seg(t, 0.9, 1), { align: "right" });
  },
};

/** An emptied base stays as a ring; a send mans it again. */
const ring: Figure = {
  w: 400, h: 200, dur: 3600,
  draw(g, t) {
    const A = P(124, 100), r = 54, B = P(340, 100), rb = 38;
    inkCircle(g, A.x, A.y, r, BLUE, 120);
    jot(A, r, 7, 0.9).forEach((p, i) => { dot(g, p, BLUE, 121 + i); kill(g, p, RED, 130 + i); });
    note(g, "empty", A.x, A.y + 72, seg(t, 0.06, 0.22), { align: "center", size: 20 });
    inkCircle(g, B.x, B.y, rb, BLUE, 140);
    jot(B, rb, 4, 0.2).forEach((p, i) => dot(g, p, BLUE, 141 + i));
    pencilLine(g, P(B.x - rb - 8, B.y), P(A.x + r + 4, A.y), 1.3, 145, true);
    const k = ease(seg(t, 0.28, 0.72));
    const walker = lerp(P(B.x - rb - 12, B.y - 1), P(A.x + 26, A.y - 34), k);
    if (t > 0.2) dot(g, walker, BLUE, 146, seg(t, 0.2, 0.28));
    if (t > 0.76) pencilLoop(g, walker.x, walker.y, 14, 147, 1.4, seg(t, 0.76, 0.86));
    const strike = seg(t, 0.8, 0.9);
    if (strike > 0) pencilLine(g, P(A.x - 26, A.y + 66), P(A.x - 26 + 54 * strike, A.y + 64), 1.6, 149, false);
    note(g, "manned again", 200, 42, seg(t, 0.84, 1));
    arrow(g, P(214, 48), P(walker.x + 14, walker.y - 4), 148, seg(t, 0.86, 1), 0.2);
  },
};

/** Last stand: the last four, circled, flick twice a turn with a steadier hand. */
const lastStand: Figure = {
  w: 400, h: 230, dur: 3800,
  draw(g, t) {
    const dead = [P(40, 60), P(70, 34), P(58, 186), P(128, 206), P(22, 130), P(150, 38)];
    dead.forEach((p, i) => { dot(g, p, BLUE, 150 + i); kill(g, p, RED, 160 + i); });
    const four = [P(76, 104), P(118, 76), P(102, 150), P(54, 150)];
    four.forEach((p, i) => { dot(g, p, BLUE, 170 + i); pencilLoop(g, p.x, p.y, 13, 175 + i, 1.4, seg(t, 0.04 + i * 0.05, 0.14 + i * 0.05)); });
    note(g, "the last four", 150, 118, seg(t, 0.26, 0.34));
    note(g, "lost their comrades", 150, 138, seg(t, 0.3, 0.4));
    const foes = [P(344, 64), P(356, 178), P(310, 196)];
    foes.forEach((p, i) => dot(g, p, RED, 180 + i));
    // two flicks, one turn, steadier
    const shots: [Pt, Pt, number][] = [[four[1], P(390, 58), 0.46], [four[2], P(392, 186), 0.7]];
    shots.forEach(([from, to, t0], i) => {
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      cone(g, from, ang, 0.025, 110, 185 + i, seg(t, t0 - 0.06, t0));
      const path = bowed(from, to, 0.01);
      const k = ease(seg(t, t0, t0 + 0.16));
      flick(g, path, BLUE, 187 + i, k);
      const hit = foes.find((f) => onLine(path, f));
      if (hit && k > along(path, hit)) kill(g, hit, BLUE, 189 + i, seg(t, t0 + 0.1, t0 + 0.16));
      note(g, String(i + 1), from.x - 20, from.y - 10, seg(t, t0, t0 + 0.05), { size: 18, weight: 700, color: BLUE });
    });
    note(g, "twice a turn, steadier", 190, 30, seg(t, 0.9, 1));
  },
};

// the hexagon: flat top, so a face looks straight up
const hexAt = (c: Pt, R: number) => [0, 1, 2, 3, 4, 5].map((i) => add(c, dirOf((i * Math.PI) / 3), R));
const reflect = (d: Pt, n: Pt): Pt => { const k = 2 * (d.x * n.x + d.y * n.y); return P(d.x - k * n.x, d.y - k * n.y); };

/** A cushion banks a glancing line and lets a straight one in. */
const cushion: Figure = {
  w: 400, h: 240, dur: 3600,
  draw(g, t) {
    const c = P(270, 138), R = 56;
    const hex = hexAt(c, R);
    inkPolygon(g, hex, RED, 200);
    // glancing: onto the top face at 70° off square
    const top = lerp(hex[4], hex[5], 0.35), dIn = dirOf(0.36);
    const dOut = reflect(dIn, P(0, -1));
    const g1 = resample([...bowed(add(top, dIn, -212), top, 0.005), ...bowed(top, add(top, dOut, 118), 0.005).slice(1)]);
    // straight: into the lower-left face, nearly square
    const mid = lerp(hex[2], hex[3], 0.5), d2 = dirOf(-0.38);
    const g2 = bowed(add(mid, d2, -176), add(mid, d2, 74), 0.005);
    const victim = at(g2, along(g2, add(mid, d2, 42)));
    const men = jot(c, R, 5, 0.7).filter((p) => Math.hypot(p.x - victim.x, p.y - victim.y) > 14 && !onLine(g1, p));
    men.forEach((p, i) => dot(g, p, RED, 201 + i));
    dot(g, victim, RED, 207);
    dot(g, g1[0], BLUE, 208);
    dot(g, g2[0], BLUE, 209);
    const k1 = ease(seg(t, 0.05, 0.42));
    flick(g, g1, BLUE, 210, k1);
    if (k1 > along(g1, top)) star(g, add(top, P(0, -1), -2), seg(t, 0.24, 0.3));
    note(g, "a glance: it banks", 132, 26, seg(t, 0.42, 0.52));
    const k2 = ease(seg(t, 0.56, 0.84));
    flick(g, g2, BLUE, 211, k2);
    if (k2 > along(g2, victim)) kill(g, victim, BLUE, 212, seg(t, 0.76, 0.82));
    note(g, "straight: it goes in", 200, 228, seg(t, 0.86, 1));
  },
};

/** A prism in front of your camp splits your line as it leaves. */
const prism: Figure = {
  w: 400, h: 230, dur: 3400,
  draw(g, t) {
    const camp = P(58, 118), r = 42;
    inkCircle(g, camp.x, camp.y, r, BLUE, 220);
    const shooter = P(64, 116);
    jot(camp, r, 6, 0.5).filter((p) => Math.hypot(p.x - shooter.x, p.y - shooter.y) > 14 && Math.abs(p.y - 116) > 8).forEach((p, i) => dot(g, p, BLUE, 221 + i));
    dot(g, shooter, BLUE, 228);
    const tri = [P(158, 72), P(236, 116), P(158, 160)];
    inkPolygon(g, tri, BLUE, 229);
    [P(176, 96), P(176, 138)].forEach((p, i) => dot(g, p, BLUE, 230 + i));
    const apex = tri[1];
    const inLine = bowed(shooter, apex, 0.002);
    const spread = 0.24;
    const branches = [-1, 1].map((s) => bowed(apex, add(apex, dirOf(s * spread), 164), s * 0.01));
    const foes = branches.map((b) => at(b, 0.62));
    foes.forEach((p, i) => dot(g, p, RED, 232 + i));
    dot(g, P(360, 116), RED, 234);
    const k = ease(seg(t, 0.08, 0.36));
    flick(g, inLine, BLUE, 235, k, 2.9);
    const kb = ease(seg(t, 0.36, 0.66));
    if (kb > 0) star(g, apex, seg(t, 0.36, 0.42));
    branches.forEach((b, i) => {
      taperLine(g, b, (u) => 2.4 * (1 - Math.pow(u, 1.8) * 0.6), BLUE, 236 + i, kb);
      if (kb > 0.62) kill(g, foes[i], BLUE, 238 + i, seg(t, 0.56, 0.62));
    });
    note(g, "yours splits on the way out", 150, 30, seg(t, 0.7, 0.82));
    note(g, "so put it in front", 158, 214, seg(t, 0.84, 1));
  },
};

/**
 * A turtle walk: a line that turns by `jolt(s)` radians once it has run s
 * units, and is bent by `pull(p, v)` at every step. Returns the points and
 * where each jolt happened.
 */
function walk(from: Pt, heading: number, len: number, o: { jolts?: [number, number][]; pull?: (p: Pt, v: Pt) => Pt; stop?: (p: Pt, s: number) => boolean } = {}) {
  const step = 3;
  let p = { ...from }, v = dirOf(heading);
  const pts: Pt[] = [{ ...p }], at: { p: Pt; ang: number }[] = [];
  const jolts = [...(o.jolts ?? [])].sort((a, b) => a[0] - b[0]);
  for (let s = 0; s < len; s += step) {
    while (jolts.length && jolts[0][0] <= s) {
      const [, j] = jolts.shift()!;
      at.push({ p: { ...p }, ang: Math.atan2(v.y, v.x) });
      v = dirOf(Math.atan2(v.y, v.x) + j);
    }
    if (o.pull) { const a = o.pull(p, v); v = { x: v.x + a.x * step, y: v.y + a.y * step }; const l = Math.hypot(v.x, v.y); v = { x: v.x / l, y: v.y / l }; }
    p = add(p, v, step);
    pts.push({ ...p });
    if (o.stop?.(p, s)) break;
  }
  return { pts, at };
}
/** How far along a straight line from a leaves and enters a circle: [in, out] distances, or null. */
function chord(a: Pt, ang: number, c: Pt, r: number): [number, number] | null {
  const d = dirOf(ang), fx = a.x - c.x, fy = a.y - c.y;
  const b = fx * d.x + fy * d.y, q = fx * fx + fy * fy - r * r, disc = b * b - q;
  if (disc < 0) return null;
  const k = Math.sqrt(disc);
  return [-b - k, -b + k];
}

/** A lunge may cut right through a base, paying shake at both walls and every man, if he lands outside. */
const lungeThrough: Figure = {
  w: 400, h: 240, dur: 4000,
  draw(g, t) {
    const base = P(196, 124), r = 60, s0 = P(26, 176), ang = -0.3;
    const [w1, w2] = chord(s0, ang, base, r)!;
    // shake at the wall going in, at each man, and at the wall going out
    const k1 = w1 + 34, k2 = w1 + 78;
    const { pts, at: jolt } = walk(s0, ang, 372, { jolts: [[w1, 0.07], [k1, -0.04], [k2, 0.05], [w2 + 4, -0.09]] });
    const hits = [jolt[1].p, jolt[2].p];
    const end = pts[pts.length - 1];
    inkCircle(g, base.x, base.y, r, RED, 250);
    jot(base, r, 7, 0.6).filter((p) => !onLine(pts, p) && hits.every((h) => Math.hypot(h.x - p.x, h.y - p.y) > 16)).forEach((p, i) => dot(g, p, RED, 251 + i));
    hits.forEach((p, i) => dot(g, p, RED, 260 + i));
    const k = ease(seg(t, 0.06, 0.66));
    if (k > 0) inkCross(g, s0.x, s0.y, DOT * 1.2, BLUE, 262, 1.5, 0.7, seg(t, 0.66, 0.72));
    else dot(g, s0, BLUE, 263);
    flick(g, pts, BLUE, 264, k);
    hits.forEach((p, i) => { if (k > along(pts, p)) kill(g, p, BLUE, 265 + i, seg(t, 0.1 + along(pts, p) * 0.56, 0.16 + along(pts, p) * 0.56)); });
    [jolt[0], jolt[3]].forEach((j, i) => { if (k > along(pts, j.p)) zigzag(g, j.p, j.ang - Math.PI / 2 - 0.4, seg(t, 0.2 + i * 0.3, 0.26 + i * 0.3)); });
    if (k > 0) dot(g, at(pts, k), BLUE, 267);
    if (t > 0.72) pencilLoop(g, end.x, end.y, 14, 268, 1.4, seg(t, 0.72, 0.82));
    note(g, "shaky at each wall and each man", 30, 226, seg(t, 0.76, 0.88));
    note(g, "lands outside: lives", end.x + 12, end.y - 24, seg(t, 0.86, 1), { align: "right" });
  },
};

/**
 * Long war's camp is a gravity well, and its pull is its garrison: a full
 * camp bends a passing line hard, a thinned one barely, an empty ring not at all.
 */
const pullOf = (c: Pt, G: number) => (p: Pt) => { const dx = c.x - p.x, dy = c.y - p.y, d = Math.hypot(dx, dy); return { x: (dx * G) / d ** 3, y: (dy * G) / d ** 3 }; };
const WELLS = [
  { c: P(170, 64), alive: 8, of: 8 },
  { c: P(170, 204), alive: 2, of: 8 },
].map((w) => ({ ...w, r: 32, path: walk(P(16, w.c.y + 58), 0, 370, { pull: pullOf(w.c, (11 * w.alive) / w.of) }).pts }));
const well: Figure = {
  w: 400, h: 276, dur: 4000,
  draw(g, t) {
    WELLS.forEach((w, k) => {
      const { c, r, path } = w, t0 = k * 0.42;
      inkCircle(g, c.x, c.y, r, RED, 270 + k);
      jot(c, r, w.of, 0.2 + k).forEach((p, i) => { dot(g, p, RED, 272 + k * 10 + i); if (i >= w.alive) kill(g, p, BLUE, 290 + k * 10 + i); });
      // the pull, pencilled round the camp: a ring for every few men inside
      for (let i = 0; i < Math.ceil((3 * w.alive) / w.of); i++) pencilLoop(g, c.x, c.y, r + 12 + i * 11, 310 + k * 5 + i, 1, seg(t, t0 + i * 0.04, t0 + 0.12 + i * 0.04), 0.5 - i * 0.12);
      // where a straight line would have gone
      const s0 = path[0];
      const ghost = seg(t, t0 + 0.08, t0 + 0.16);
      if (ghost > 0) pencilLine(g, s0, P(s0.x + 370 * ghost, s0.y), 1.1, 320 + k, true);
      dot(g, s0, BLUE, 322 + k);
      flick(g, path, BLUE, 324 + k, ease(seg(t, t0 + 0.14, t0 + 0.4)));
    });
    note(g, "a full camp bends it hard", 396, 20, seg(t, 0.36, 0.46), { align: "right" });
    note(g, "thinned: barely", 396, 186, seg(t, 0.8, 0.9), { align: "right" });
  },
};

/** Ink piles up round a base over a war, and becomes cover: a line jolts at every old line and never gets there. */
const COVER = (() => {
  const base = P(292, 120), r = 46, rand = rng(4242);
  const old: { pts: Pt[]; owner: 0 | 1 }[] = [];
  // lines that ran at the base from above and below, a war's worth
  [96, 132, 166, 198, 226].forEach((x, i) => {
    const top = i % 2 === 0, a = (top ? 1 : -1) * (0.75 + rand() * 0.45);
    const through = P(x, 132 + (rand() - 0.5) * 10), d = dirOf(a);
    old.push({ pts: bowed(add(through, d, -(62 + rand() * 50)), add(through, d, 46 + rand() * 60), (rand() - 0.5) * 0.05), owner: rand() < 0.55 ? 1 : 0 });
  });
  for (let i = 0; i < 6; i++) {
    const top = i % 2 === 0;
    const from = P(150 + rand() * 90, top ? 10 + rand() * 26 : 200 + rand() * 20);
    const aim = add(base, dirOf((top ? -1 : 1) * (1.6 + rand() * 1.2)), r * (0.6 + rand() * 0.6));
    old.push({ pts: bowed(from, lerp(from, aim, 0.8 + rand() * 0.3), (rand() - 0.5) * 0.05), owner: rand() < 0.55 ? 1 : 0 });
  }
  const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
    const r1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), r2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    const r3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x), r4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
    return r1 * r2 < 0 && r3 * r4 < 0;
  };
  // the new line: every old line it crosses jolts it and costs it reach
  const s0 = P(18, 132), step = 3;
  let p = { ...s0 }, h = 0, budget = 300, flip = 1;
  const pts: Pt[] = [{ ...p }], at: { p: Pt; ang: number }[] = [];
  for (let s = 0; s < budget; s += step) {
    const q = add(p, dirOf(h), step);
    const hit = old.some((o) => o.pts.some((b, j) => j > 0 && cross(p, q, o.pts[j - 1], b)));
    p = q;
    pts.push({ ...p });
    if (hit) { at.push({ p: { ...p }, ang: h }); h += flip * 0.13; flip = -flip; budget -= 30; }
    if (Math.hypot(p.x - base.x, p.y - base.y) < r + 14) break;
  }
  return { base, r, old, pts, at };
})();
const cover: Figure = {
  w: 400, h: 256, dur: 3400,
  draw(g, t) {
    const { base, r, old, pts, at: jolts } = COVER;
    inkCircle(g, base.x, base.y, r, RED, 290);
    jot(base, r, 6, 1.4).forEach((p, i) => dot(g, p, RED, 291 + i));
    old.forEach((o, i) => taperLine(g, o.pts, (u) => 1.7 * (1 - u * 0.5), INK.pens[o.owner], 300 + i, ease(seg(t, i * 0.02, 0.2 + i * 0.02))));
    dot(g, pts[0], BLUE, 320);
    const k = ease(seg(t, 0.36, 0.8));
    flick(g, pts, BLUE, 321, k);
    jolts.forEach((j, i) => { if (k > along(pts, j.p)) zigzag(g, j.p, j.ang - Math.PI / 2 - 0.3, seg(t, 0.4 + i * 0.06, 0.46 + i * 0.06)); });
    note(g, "old ink piles up round a base", 250, 24, seg(t, 0.24, 0.36), { align: "center" });
    note(g, "a jolt at every line: it never gets there", 200, 246, seg(t, 0.84, 1), { align: "center" });
  },
};

/** Shaped soldiers: each drawn in its base's shape. */
function shapeDot(g: Ctx, p: Pt, n: number, color: string, seed: number, grow = 1) {
  if (grow <= 0) return;
  if (n === 0) return dot(g, p, color, seed, grow);
  const r = 6.4 * (0.4 + 0.6 * ease(grow)), turn = n === 3 ? -Math.PI / 2 : 0;
  const pts = Array.from({ length: n }, (_, k) => add(p, dirOf(turn + (k * Math.PI * 2) / n + ((seed % 7) - 3) * 0.04), r));
  g.fillStyle = color;
  g.globalAlpha = 0.8 * grow;
  g.beginPath();
  pts.forEach((q, k) => (k ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  inkPolygon(g, pts, color, seed, 1.3, 1);
}
const soldiers: Figure = {
  w: 400, h: 180, dur: 3000,
  draw(g, t) {
    const bases: [Pt, number][] = [[P(70, 90), 0], [P(200, 92), 3], [P(330, 90), 6]];
    bases.forEach(([c, n], b) => {
      const t0 = b * 0.28;
      const R = 50;
      if (n === 0) inkCircle(g, c.x, c.y, R, BLUE, 330 + b, 2.6, 2, ease(seg(t, t0, t0 + 0.14)));
      else inkPolygon(g, Array.from({ length: n }, (_, k) => add(P(c.x, c.y + (n === 3 ? 10 : 0)), dirOf((n === 3 ? -Math.PI / 2 : 0) + (k * Math.PI * 2) / n), n === 3 ? R * 1.18 : R)), BLUE, 330 + b, 2.6, 2, ease(seg(t, t0, t0 + 0.14)));
      const men = jot(P(c.x, c.y + (n === 3 ? 16 : 0)), n === 3 ? 38 : R, n === 3 ? 4 : 6, 0.5 + b);
      men.forEach((p, i) => shapeDot(g, p, n, BLUE, 340 + b * 10 + i, seg(t, t0 + 0.14 + i * 0.02, t0 + 0.22 + i * 0.02)));
    });
    note(g, "a look, for now", 146, 172, seg(t, 0.86, 1));
  },
};

export const FIGURES: Record<string, Figure> = {
  setup,
  flick: flicking,
  snipe,
  lunge,
  groove,
  send,
  "send-long": sendLong,
  ring,
  "last-stand": lastStand,
  cushion,
  prism,
  "lunge-through": lungeThrough,
  garrison: garrisonWalls,
  well,
  cover,
  soldiers,
};
