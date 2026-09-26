// How a hand does things on the page: which soldier it means when it taps,
// and the order it jots dots into a fresh base. Pure, so it can be tested.

import { type GameState, type Pt } from "./game";

export interface PickTol {
  /** A tap within this many world units of a soldier means that soldier. */
  soldier: number;
  /** A tap within base radius + this means "one of the soldiers in this base". */
  base: number;
}

/**
 * The current player's soldier a tap at `w` most likely means, or undefined.
 * A tap on or near a soldier picks it. Failing that, a tap inside or near one
 * of your bases picks the living soldier of that base nearest the tap, so at
 * full-page zoom you only need to hit the circle, not a 5px dot.
 */
export function pickSoldier(s: GameState, w: Pt, tol: PickTol): number | undefined {
  const mine = s.soldiers.filter((x) => x.alive && x.owner === s.current);
  let best: number | undefined, bd = tol.soldier;
  for (const x of mine) {
    const d = Math.hypot(x.x - w.x, x.y - w.y);
    if (d <= bd) { bd = d; best = x.id; }
  }
  if (best !== undefined || tol.base <= 0) return best;

  let base: GameState["bases"][number] | undefined, bb = Infinity;
  for (const b of s.bases) {
    if (b.owner !== s.current) continue;
    const d = Math.hypot(b.x - w.x, b.y - w.y);
    if (d <= b.r + tol.base && d < bb && inBase(mine, b).length) { bb = d; base = b; }
  }
  if (!base) return undefined;
  bd = Infinity;
  for (const x of inBase(mine, base)) {
    const d = Math.hypot(x.x - w.x, x.y - w.y);
    if (d < bd) { bd = d; best = x.id; }
  }
  return best;
}

/** Living soldiers still standing inside a base's circle. */
export function inBase<T extends Pt>(soldiers: T[], b: { x: number; y: number; r: number }) {
  return soldiers.filter((x) => Math.hypot(x.x - b.x, x.y - b.y) <= b.r * 1.05);
}

/**
 * The order a hand jots dots: start at the top-left one, then always the
 * nearest one not yet drawn. Returns indices into `pts`.
 */
export function jotOrder(pts: Pt[]): number[] {
  if (!pts.length) return [];
  const left = pts.map((_, i) => i);
  let cur = left.reduce((a, i) => (pts[i].y + pts[i].x * 0.5 < pts[a].y + pts[a].x * 0.5 ? i : a), 0);
  const out: number[] = [];
  while (left.length) {
    left.splice(left.indexOf(cur), 1);
    out.push(cur);
    let next = -1, bd = Infinity;
    for (const i of left) {
      const d = Math.hypot(pts[i].x - pts[cur].x, pts[i].y - pts[cur].y);
      if (d < bd) { bd = d; next = i; }
    }
    cur = next;
  }
  return out;
}
