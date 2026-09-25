// Base shapes: where a base's walls are, what counts as inside, and where
// soldiers get jotted. Pure.

import type { Base } from "./game";
import { dist, insidePoly, polygon, rng, type Pt } from "./geom";

export const SIDES = { circle: 0, tri: 3, square: 4, hex: 6 } as const;

/** Corners of a shaped base (null for a circle). */
export function baseVerts(b: Pick<Base, "shape" | "x" | "y" | "r" | "rot">): Pt[] | null {
  const n = SIDES[b.shape ?? "circle"];
  return n ? polygon(n, b.x, b.y, b.r, b.rot ?? 0) : null;
}

/** Wall edges of a shaped base, as [a, b] pairs indexed by edge number. */
export function baseEdges(b: Pick<Base, "shape" | "x" | "y" | "r" | "rot">): [Pt, Pt][] {
  const v = baseVerts(b);
  if (!v) return [];
  return v.map((p, i) => [p, v[(i + 1) % v.length]]);
}

/** Is p inside the base? `slack` > 1 is a little generous (dots drawn on the line count). */
export function insideBase(b: Pick<Base, "shape" | "x" | "y" | "r" | "rot">, p: Pt, slack = 1.05): boolean {
  const v = baseVerts(b);
  if (!v) return dist(b, p) <= b.r * slack;
  const q = { x: b.x + (p.x - b.x) / slack, y: b.y + (p.y - b.y) / slack };
  return insidePoly(q, v);
}

// Dots jotted into a base by hand: spread out, never touching, clear of the walls.
export function scatterIn(b: Pick<Base, "shape" | "x" | "y" | "r" | "rot">, n: number, seed: number, dot: number, avoid: Pt[] = []): Pt[] {
  const rand = rng(seed);
  const pts: Pt[] = [];
  const v = baseVerts(b);
  let minD = dot * 3.2;
  let tries = 0;
  while (pts.length < n && tries < 20000) {
    tries++;
    if (tries % 4000 === 0) minD *= 0.8; // a crowded base: squeeze them in
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    let p: Pt;
    if (!v) {
      const inner = b.r - dot * 2.2;
      p = { x: b.x + Math.cos(a) * d * inner, y: b.y + Math.sin(a) * d * inner };
    } else {
      p = { x: b.x + Math.cos(a) * d * b.r, y: b.y + Math.sin(a) * d * b.r };
      if (!insidePoly(p, v)) continue;
      let edge = Infinity;
      for (let i = 0; i < v.length; i++) edge = Math.min(edge, segDist(p, v[i], v[(i + 1) % v.length]));
      if (edge < dot * 2.2) continue;
    }
    if (pts.every((q) => dist(q, p) >= minD) && avoid.every((q) => dist(q, p) >= minD)) pts.push(p);
  }
  return pts;
}

function segDist(p: Pt, a: Pt, b: Pt) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
