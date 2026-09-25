// Plain geometry and the seeded random source. No state, no DOM.

export type Pt = { x: number; y: number };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rand: () => number) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// A flicked line: a shallow arc from the soldier, sampled as a polyline.
export function flickPath(from: Pt, f: { angle: number; length: number; bend: number }, steps = 32): Pt[] {
  const dx = Math.cos(f.angle), dy = Math.sin(f.angle);
  const end = { x: from.x + dx * f.length, y: from.y + dy * f.length };
  const off = f.bend * f.length * 2; // quadratic control offset -> peak bow ~ bend*len
  const c = { x: (from.x + end.x) / 2 - dy * off, y: (from.y + end.y) / 2 + dx * off };
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push({ x: u * u * from.x + 2 * u * t * c.x + t * t * end.x, y: u * u * from.y + 2 * u * t * c.y + t * t * end.y });
  }
  return pts;
}

// Distance from p to a polyline, plus how far along (0..1 by segment index) the closest point is.
export function distToPath(p: Pt, pts: Pt[]): { d: number; along: number; at: number } {
  let best = Infinity, along = 0, at = 0, run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    const l2 = len * len || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    if (d < best) { best = d; along = (i - 1 + t) / (pts.length - 1); at = run + len * t; }
    run += len;
  }
  return { d: best, along, at };
}

export function pathLen(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

// The point a fraction `t` of the way along a path (by vertex), clamped to its ends.
export function pointAlong(pts: Pt[], t: number): Pt {
  const i = Math.floor(Math.min(1, Math.max(0, t)) * (pts.length - 1));
  return pts[Number.isFinite(i) ? i : 0];
}

/** The polyline cut `d` world units from its start. */
export function cutAt(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const l = dist(a, b);
    if (run + l >= d) {
      const f = l ? (d - run) / l : 0;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      return out;
    }
    out.push(b);
    run += l;
  }
  return out;
}

/** Where segments ab and cd cross: t along ab, u along cd (both 0..1), or null. */
export function segHit(a: Pt, b: Pt, c: Pt, d: Pt): { t: number; u: number } | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Mirror p across the line through a and b. */
export function reflectPt(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  const fx = a.x + dx * t, fy = a.y + dy * t;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
}

export function rotatePt(p: Pt, c: Pt, ang: number): Pt {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const x = p.x - c.x, y = p.y - c.y;
  return { x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs };
}

/** Corners of a regular polygon. */
export function polygon(sides: number, cx: number, cy: number, r: number, rot: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export function insidePoly(p: Pt, v: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const a = v[i], b = v[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distToSeg(p: Pt, a: Pt, b: Pt) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export interface Box { x0: number; y0: number; x1: number; y1: number }
export function boxOf(pts: Pt[], pad = 0): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
export const boxesMeet = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
