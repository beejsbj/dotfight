// Plain geometry and the seeded random source. No state, no DOM. (pure, tested)

export type Pt = { x: number; y: number };

/** mulberry32: a small seeded generator. Every bit of game randomness comes through here. */
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

/** A standard normal sample (Box-Muller). */
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
export function distToPath(p: Pt, pts: Pt[]): { d: number; along: number } {
  let best = Infinity, along = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    if (d < best) { best = d; along = (i - 1 + t) / (pts.length - 1); }
  }
  return { d: best, along };
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

export function rotateAbout(p: Pt, c: Pt, ang: number): Pt {
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const x = p.x - c.x, y = p.y - c.y;
  return { x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs };
}

/** Where segment a→b first meets circle (c, r), as params in (lo, 1]. Both roots, ascending. */
export function circleHits(a: Pt, b: Pt, c: Pt, r: number, lo = 1e-7): number[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - c.x, fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-12) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return [];
  const sq = Math.sqrt(disc);
  const out: number[] = [];
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (t > lo && t <= 1) out.push(t);
  return out;
}
