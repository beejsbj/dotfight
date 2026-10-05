// The ink already on the page, as the long war's lines feel it: every stroke
// simplified to a few straight runs and dropped into a coarse grid, so a step
// of the pen only looks at the ink near it. Built once per page state (the
// page only changes when a mark is added). (pure, tested)

import { dist, type Pt } from "./geom";
import type { Mark, Player } from "./game";

/** One straight run of an old stroke. */
export interface Run {
  a: Pt;
  b: Pt;
  owner: Player;
  /** Which stroke (its index in `marks`): one crossing where two runs meet counts once. */
  stroke: number;
  /** Last query that returned it, so a run in several cells comes back once. */
  q?: number;
}

const CELL = 64;
// A point is kept once the line has run 60 units or turned 0.08 rad since the
// last one kept: a flick's bow is shallow, so this is within a unit or two of the drawn line.
const KEEP_RUN = 60, KEEP_TURN = 0.08;

export const wrap = (a: number) => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a <= -Math.PI ? a + 2 * Math.PI : a; };

export function simplify(src: Pt[]): Pt[] {
  if (src.length < 2) return src.slice();
  const out: Pt[] = [src[0]];
  let run = 0, h0 = NaN;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    if (Number.isNaN(h0)) h0 = h;
    run += l;
    if (i === src.length - 1 || run >= KEEP_RUN || Math.abs(wrap(h - h0)) > KEEP_TURN) { out.push(b); run = 0; h0 = NaN; }
  }
  if (out.length === 1) out.push(src[src.length - 1]);
  return out;
}

export class InkGrid {
  private cells = new Map<number, Run[]>();
  private stamp = 0;
  readonly size: number;

  constructor(marks: readonly Mark[]) {
    let n = 0;
    marks.forEach((m, i) => {
      if (m.t !== "stroke") return;
      const pts = simplify(m.pts);
      for (let k = 1; k < pts.length; k++) { this.add({ a: pts[k - 1], b: pts[k], owner: m.owner, stroke: i }); n++; }
    });
    this.size = n;
  }

  private add(r: Run) {
    const x0 = Math.floor(Math.min(r.a.x, r.b.x) / CELL), x1 = Math.floor(Math.max(r.a.x, r.b.x) / CELL);
    const y0 = Math.floor(Math.min(r.a.y, r.b.y) / CELL), y1 = Math.floor(Math.max(r.a.y, r.b.y) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = (cx + 64) * 4096 + (cy + 64);
      const list = this.cells.get(k);
      if (list) list.push(r); else this.cells.set(k, [r]);
    }
  }

  /** Runs whose cells meet the box [x0,x1]×[y0,y1], each once. `out` is reused. */
  near(x0: number, y0: number, x1: number, y1: number, out: Run[] = []) {
    out.length = 0;
    const q = ++this.stamp;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      const list = this.cells.get((cx + 64) * 4096 + (cy + 64));
      if (list) for (const r of list) if (r.q !== q) { r.q = q; out.push(r); }
    }
    return out;
  }
}

// The page only grows, and a state's marks array is its own: cache by array and length.
const memo = new WeakMap<readonly Mark[], { n: number; grid: InkGrid }>();

/** The ink grid for this page as it stands. */
export function inkOf(marks: readonly Mark[]): InkGrid {
  const m = memo.get(marks);
  if (m && m.n === marks.length) return m.grid;
  const grid = new InkGrid(marks);
  memo.set(marks, { n: marks.length, grid });
  return grid;
}

/** Where segment ab crosses cd, as a fraction along ab, or null. */
export function segT(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t < 0 || t > 1 || u < 0 || u > 1 ? null : t;
}
