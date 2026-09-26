// The rulebook as a bound book, in numbers: which leaves it has, which pages
// face you at a position, which page a section lives on, and where a leaf's
// corner, fold and back are while it turns. No DOM here, so it can be tested.
//
// A "position" counts leaves turned. At a whole number the book lies open;
// 2.4 means leaf 2 is 40% of the way over. Content pages are numbered from 1;
// page 0 is the cover.

export type Mode = "single" | "spread";

export type Side =
  | { kind: "cover" }
  | { kind: "inside" } // the inside of the front cover
  | { kind: "blank" }
  | { kind: "page"; n: number }
  | { kind: "ghost"; n: number }; // the back of page n: its ink showing through, reversed

export interface Leaf { front: Side; back: Side }

/** The leaves of a book of n pages. Phones turn single pages round a left spine,
 *  each leaf's back showing its own ink through the paper; wide screens open
 *  to spreads, a leaf's back being the next left-hand page. */
export function leaves(mode: Mode, n: number): Leaf[] {
  if (mode === "single") {
    return Array.from({ length: n + 1 }, (_, j) => (j === 0 ? { front: { kind: "cover" }, back: { kind: "inside" } } : { front: { kind: "page", n: j }, back: { kind: "ghost", n: j } }));
  }
  const sides: Side[] = [{ kind: "cover" }, { kind: "inside" }];
  for (let p = 1; p <= n; p++) sides.push({ kind: "page", n: p });
  if (sides.length % 2) sides.push({ kind: "blank" });
  const out: Leaf[] = [];
  for (let i = 0; i < sides.length; i += 2) out.push({ front: sides[i], back: sides[i + 1] });
  return out;
}

/** The side index of page p in a spread book: cover 0, inside cover 1, page p at p + 1. */
const sideOf = (p: number) => (p === 0 ? 0 : p + 1);

/** The position at which page p (0 = cover) faces you. */
export function posOfPage(mode: Mode, p: number): number {
  if (mode === "single") return p;
  return Math.ceil(sideOf(p) / 2);
}

/** The furthest the book opens: its last page facing you. */
export function maxPos(mode: Mode, n: number): number {
  return posOfPage(mode, n);
}

/** The pages facing you when the book lies open at whole position k, left to right. */
export function pagesAt(mode: Mode, k: number, n: number): number[] {
  if (mode === "single") return [Math.max(0, Math.min(n, k))];
  if (k <= 0) return [0];
  const out: number[] = [];
  for (const side of [2 * k - 1, 2 * k]) {
    const p = side - 1; // side 1 is the inside cover, page p is side p + 1
    if (p >= 1 && p <= n) out.push(p);
  }
  return out;
}

/** Which page an id is on, given the ids on each page (index = page number). */
export function pageOf(id: string, ids: string[][]): number | undefined {
  const p = ids.findIndex((list) => list.includes(id));
  return p < 0 ? undefined : p;
}

/** The address of what's facing you: the first contents entry that starts on
 *  these pages, or else the one still running on from an earlier page. The
 *  cover has none. */
export function hashFor(pages: number[], ids: string[][], contents: Set<string>): string {
  const shown = pages.filter((p) => p > 0);
  if (!shown.length) return "";
  for (const p of shown) {
    const id = ids[p]?.find((x) => contents.has(x));
    if (id) return id;
  }
  for (let p = Math.min(...shown) - 1; p >= 1; p--) {
    const list = (ids[p] ?? []).filter((x) => contents.has(x));
    if (list.length) return list[list.length - 1];
  }
  return "";
}

// --- what's moving --------------------------------------------------------------

export interface Turn { leaf: number; t: number }
/** A picture of the book: leaves in the air, the leaf lying open on the right
 *  (its front showing) and the one lying open on the left (its back showing). */
export interface Frame { turning: Turn[]; right: number; left: number }

export function frameAt(pos: number): Frame {
  const i = Math.floor(pos + 1e-6);
  const t = pos - i;
  if (t < 1e-4) return { turning: [], right: i, left: i - 1 };
  return { turning: [{ leaf: i, t }], right: i + 1, left: i - 1 };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Jumping from one place to another: a flurry of leaves, several in the air at
 *  once, staggered. Long jumps turn the first leaf and the last few; the leaves
 *  between are hidden under them and simply land. u runs 0..1. */
export function flurryFrame(from: number, to: number, u: number, most = 5, overlap = 2.2): Frame {
  if (from === to) return frameAt(to);
  const fwd = to > from;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  let list: number[] = [];
  for (let j = lo; j < hi; j++) list.push(j);
  if (list.length > most) list = [list[0], ...list.slice(list.length - (most - 1))];
  if (!fwd) list.reverse(); // going back, the top of the left-hand pile moves first
  const m = list.length;
  const turning = list.map((leaf, k) => {
    const g = clamp01((u * (m - 1 + overlap) - k) / overlap);
    return { leaf, t: fwd ? g : 1 - g };
  });
  return fwd ? { turning, right: to, left: from - 1 } : { turning, right: from, left: to - 1 };
}

// --- the fold ---------------------------------------------------------------------

/** A 2D affine matrix in CSS order: x' = a x + c y + e, y' = b x + d y + f. */
export type Mat = [number, number, number, number, number, number];

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
export const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const rot = (r: number): Mat => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const css = (m: Mat) => `matrix(${m.map((v) => Math.round(v * 1e4) / 1e4).join(",")})`;

export interface Fold {
  /** where the corner has got to, in page coordinates (origin at the top of the spine) */
  corner: [number, number];
  /** the fold's own frame: origin mid-fold, x pointing away from the spine */
  frame: Mat;
  /** a box of size L×L covering the spine side of the fold, and its inverse */
  clip: Mat;
  unclip: Mat;
  /** the leaf's back, laid over the fold (it's a rotation: the back reads the right way round) */
  back: Mat;
  /** how far the folded part reaches from the fold */
  depth: number;
  /** 0 flat, 1 standing up: how high the leaf is lifted, for shadows */
  lift: number;
}

/** A leaf of width W and height H, turned t of the way over, by its bottom
 *  (or top) outer corner. The corner swings over in a shallow arc; the fold is
 *  the line the paper bends along, halfway between where the corner was and
 *  where it is. L is the size of the clipping box (big enough for the book). */
export function fold(t: number, W: number, H: number, top = false, L = 4 * (W + H)): Fold {
  const ay = top ? 0 : H;
  // how far the corner rises: less on a tall page, so the fold leans rather than peels
  const rise = 0.3 * W * Math.min(1, W / H) * Math.sin(Math.PI * t);
  let px = W - 2 * W * t, py = ay + (top ? rise : -rise);
  // paper doesn't stretch: the corner stays within a page's width of the spine end...
  let dx = px, dy = py - ay, r = Math.hypot(dx, dy);
  if (r > W) { px = (dx * W) / r; py = ay + (dy * W) / r; }
  // ...and within a diagonal of the other end
  const oy = H - ay, D = Math.hypot(W, H);
  dx = px; dy = py - oy; r = Math.hypot(dx, dy);
  if (r > D) { px = (dx * D) / r; py = oy + (dy * D) / r; }

  let nx = W - px, ny = ay - py;
  const len = Math.hypot(nx, ny) || 1e-6;
  nx /= len; ny /= len;
  const phi = Math.atan2(ny, nx);
  const mx = (W + px) / 2, my = (ay + py) / 2;
  const frame = mul(tr(mx, my), rot(phi));
  const clip = mul(frame, tr(-L, -L / 2));
  // The back: reflect the page across the fold, then read it from behind. The two
  // mirrorings cancel into a rotation by 2φ that carries the outer edge (W, 0) to
  // its reflection.
  const c2 = Math.cos(2 * phi), s2 = Math.sin(2 * phi);
  const qx = W - mx, qy = -my;
  const back: Mat = [c2, s2, -s2, c2, mx - c2 * qx - s2 * qy, my - s2 * qx + c2 * qy];
  return { corner: [px, py], frame, clip, unclip: inv(clip), back, depth: len / 2, lift: Math.sin(Math.PI * t) };
}
