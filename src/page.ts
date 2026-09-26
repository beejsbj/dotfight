// The sheet itself, and everything that has dried on it.
//
// The settled page lives in one page-space canvas that only ever grows: when a
// mark finishes drawing it is added on top, never redrawn. Every mark is
// multiplied onto the paper, and multiplying is order-free, so adding marks as
// they settle gives the same pixels as drawing the page from scratch. The
// camera can then swoop and chase the ink for the cost of one image draw.

import { rng, type GameState, type Mark, type Soldier } from "./game";
import { INK, handText, inkCircle, inkCross, inkDot, inkFlick, paperGrain } from "./ink";
import { RULES } from "./rules";
import type { Hold } from "./boil";

type Ctx = CanvasRenderingContext2D;

/** How far along each mark is being drawn. Keys: `b<id>` base, `d<soldier>` dot, `m<index>` mark, `sign`. */
export interface Ink {
  p(key: string): number; // 0..1; anything not scheduled is settled (1)
  live: Set<string>;
}
export const SETTLED: Ink = { p: () => 1, live: new Set() };

/** The winner's line along the foot of a finished page. */
export interface Signature {
  text: string;
  owner: 0 | 1;
}

export const GRID = 25;
const HEADER = 100;

let grain: HTMLCanvasElement | null = null;

export function drawPaper(g: Ctx, s: GameState) {
  const { pageW: w, pageH: h, margin } = RULES;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = INK.paper;
  g.fillRect(0, 0, w, h);
  grain ??= paperGrain(500, 850, 7);
  g.drawImage(grain, 0, 0, w, h);
  // squared paper: the back pages of a maths copy
  g.strokeStyle = INK.grid;
  g.lineWidth = 1.1;
  g.beginPath();
  for (let x = GRID; x < w; x += GRID) { g.moveTo(x, HEADER); g.lineTo(x, h); }
  for (let y = HEADER; y < h; y += GRID) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
  g.strokeStyle = INK.gridBold;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, HEADER); g.lineTo(w, HEADER);
  g.stroke();
  // the margin
  g.strokeStyle = INK.margin;
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(margin, 0); g.lineTo(margin, h);
  g.stroke();
  // printed header
  g.fillStyle = "rgba(84, 128, 168, 0.75)";
  g.font = "21px 'Patrick Hand', sans-serif";
  g.fillText("Page No. ________", margin + 22, 66);
  g.fillText("Date ______________", w - 262, 66);
  if (s.page) {
    g.globalCompositeOperation = "multiply";
    handText(g, String(s.page.no), margin + 118, 60, 36, INK.pens[0], { rot: -0.04, alpha: 0.92 });
    handText(g, s.page.date, w - 200, 60, 33, INK.pens[0], { rot: -0.025, alpha: 0.92 });
    g.globalCompositeOperation = "source-over";
  }
}

// `wob` picks a redrawing for the line boil; 0 is the drawing the page keeps.
export function drawBase(g: Ctx, b: GameState["bases"][number], p = 1, wob = 0) {
  inkCircle(g, b.x, b.y, b.r, INK.pens[b.owner], b.seed, 2.8, 2, p, wob);
}

export function drawMark(g: Ctx, m: Mark, p = 1, wob = 0) {
  const pen = INK.pens[m.owner];
  if (m.t === "stroke") inkFlick(g, m.pts, pen, m.seed, RULES.inkWidth, p, 1, wob);
  else if (m.kind === "moved") {
    // the old dot stays; the little cross comes after the move
    inkDot(g, m.x, m.y, RULES.soldierRadius, pen, m.seed, 1, 1, wob);
    inkCross(g, m.x, m.y, RULES.soldierRadius * 1.2, pen, m.seed, 1.6, 0.7, p, wob);
  } else if (m.kind === "kill") inkCross(g, m.x, m.y, RULES.soldierRadius * 2.1, pen, m.seed, 2.8, 1, p, wob);
  else inkCross(g, m.x, m.y, RULES.soldierRadius * 1.6, pen, m.seed, 2, 1, p, wob);
}

export function drawDot(g: Ctx, x: Soldier, alpha = 1, grow = 1, at: { x: number; y: number } = x, wob = 0) {
  inkDot(g, at.x, at.y, RULES.soldierRadius, INK.pens[x.owner], x.id * 131 + 7, alpha, grow, wob);
}

export function drawSignature(g: Ctx, sig: Signature, p = 1) {
  const y = RULES.pageH - 38;
  g.globalCompositeOperation = "multiply";
  handText(g, sig.text, RULES.pageW - 40, y, 44, INK.pens[sig.owner], { upTo: p, rot: -0.03, align: "right", alpha: 0.95 });
  if (p >= 1) {
    // an underline flourish, flicked off at the end
    inkFlick(g, [{ x: RULES.pageW - 420, y: y + 14 }, { x: RULES.pageW - 230, y: y + 10 }, { x: RULES.pageW - 60, y: y + 2 }], INK.pens[sig.owner], 991, 2.4);
  }
}

/** How yellowed the paper is: a long war ages the sheet. */
export const ageOf = (s: GameState) => Math.min(1, s.turn / 70);
/** The yellowing as a multiply colour (per channel, 0..1), for layers that tint instead of paint. */
export function yellowing(age: number): [number, number, number] {
  const a = 0.55 * age;
  return [1 - a + a * (236 / 255), 1 - a + a * (214 / 255), 1 - a + a * (170 / 255)];
}
export const RING_TURN = 24;

/** Yellowed paper (for the kept image; on screen the lamp layer does it). */
export function drawYellow(g: Ctx, s: GameState) {
  const age = ageOf(s);
  if (age <= 0) return;
  g.fillStyle = `rgba(236, 214, 170, ${0.55 * age})`;
  g.fillRect(0, 0, RULES.pageW, RULES.pageH);
}

/**
 * Somewhere past the twenty-fourth turn a mug gets set down on the page.
 * Seeded, so the same page always has the same ring; multiplied, so it sits
 * under and over the ink alike, the way a real stain does.
 */
export function drawRing(g: Ctx, s: GameState) {
  const r = rng((s.seed ^ 0xc0ffee) >>> 0);
  const x = 150 + r() * 700, y = r() < 0.5 ? 200 + r() * 260 : 1260 + r() * 330, R = 74 + r() * 16;
  const wash = g.createRadialGradient(x, y, R * 0.2, x, y, R);
  wash.addColorStop(0, "rgba(176, 128, 70, 0.05)");
  wash.addColorStop(0.85, "rgba(176, 128, 70, 0.1)");
  wash.addColorStop(1, "rgba(176, 128, 70, 0)");
  g.fillStyle = wash;
  g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
  // the rim: darker where the coffee pooled, broken where it didn't
  g.lineCap = "round";
  for (const [dx, dy, rr, from, to] of [[0, 0, R, 0, 1], [9 + r() * 6, -6 - r() * 6, R * 0.97, 0.1 + r() * 0.2, 0.62]] as const) {
    const n = 56;
    for (let i = Math.floor(from * n); i < Math.floor(to * n); i++) {
      const k = r();
      if (k < 0.08) continue;
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1.1) / n) * Math.PI * 2;
      g.strokeStyle = `rgba(150, 100, 50, ${0.12 + k * 0.2})`;
      g.lineWidth = 2 + k * 4;
      g.beginPath();
      g.arc(x + dx, y + dy, rr * (1 + (k - 0.5) * 0.02), a0, a1);
      g.stroke();
    }
  }
}

/** Yellowing and the ring together, for the kept image. */
export function drawAge(g: Ctx, s: GameState) {
  drawYellow(g, s);
  if (s.turn >= RING_TURN) drawRing(g, s);
}

export interface Spot { id: number; x: number; y: number; key: string }

/**
 * Every dot a soldier's ink has left on the page: where he stands now, and
 * every place he moved away from (a moved soldier's old dot is still ink).
 * Pure: the page is append-only because of this, living soldiers included.
 */
export function dotSpots(s: GameState): Spot[] {
  const out = new Map<string, Spot>();
  const add = (id: number, x: number, y: number) => {
    const key = `${id}@${x},${y}`;
    if (!out.has(key)) out.set(key, { id, x, y, key });
  };
  for (const m of s.marks) {
    if (m.t !== "cross" || m.kind !== "moved") continue;
    const f = s.flicks[m.turn - 1];
    if (f) add(f.soldierId, m.x, m.y);
  }
  for (const x of s.soldiers) add(x.id, x.x, x.y);
  return [...out.values()];
}

/**
 * The page as an append-only canvas in page space. Marks, camps, soldiers'
 * dots, the ring and the signature are multiplied on once, when they finish
 * drawing, and never redrawn. The camera never touches it: the compositor
 * carries it wherever the camera looks. What boils (boil.ts) is held off the
 * page until it stops, then multiplied on like everything else.
 */
export class PageLayer {
  c: HTMLCanvasElement | null = null;
  S = 1;
  private g: Ctx | null = null;
  private src: GameState | null = null;
  private epoch = -1;
  private marks: boolean[] = [];
  private bases = new Set<number>();
  private dots = new Set<string>();
  private ring = false;
  private signed = false;
  /** Bumped whenever the canvas changes, so layers derived from it know to refresh. */
  version = 0;
  private stamp = "";

  has(key: string) {
    if (key.startsWith("m")) return !!this.marks[+key.slice(1)];
    if (key.startsWith("b")) return this.bases.has(+key.slice(1));
    return false;
  }
  hasDot(key: string) { return this.dots.has(key); }
  get isSigned() { return this.signed; }

  /**
   * Bring the page up to date. `hold` is what stays off the page for now: a
   * soldier riding his ink, and whatever is boiling. Something held that is
   * already on the page (a camp manned again) can't be rubbed out, so the
   * page is drawn afresh.
   */
  sync(s: GameState, ink: Ink, S: number, epoch: number, sig?: Signature, hold?: Hold) {
    let fresh = !this.c || this.src !== s || this.S !== S || this.epoch !== epoch || s.marks.length < this.marks.filter(Boolean).length;
    // nothing new since last time: most frames stop here
    const stamp = `${s.marks.length}|${s.bases.length}|${s.turn}|${[...ink.live].join()}|${hold?.sig}|${!!sig}`;
    if (!fresh && stamp === this.stamp) return { fresh, added: 0 };
    this.stamp = stamp;
    if (!fresh && hold && this.holdsBaked(hold)) fresh = true;
    if (fresh) this.rebuild(s, S, epoch);
    const added: ((g: Ctx) => void)[] = [];
    for (const b of s.bases) {
      if (!this.bases.has(b.id) && !ink.live.has(`b${b.id}`) && !hold?.bases.has(b.id)) { added.push((g) => drawBase(g, b)); this.bases.add(b.id); }
    }
    s.marks.forEach((m, i) => {
      if (!this.marks[i] && !ink.live.has(`m${i}`) && !hold?.marks.has(i)) { added.push((g) => drawMark(g, m)); this.marks[i] = true; }
    });
    for (const d of dotSpots(s)) {
      if (this.dots.has(d.key) || ink.live.has(`d${d.id}`) || hold?.dots.has(d.key)) continue;
      const x = s.soldiers[d.id];
      added.push((g) => drawDot(g, x, 1, 1, d));
      this.dots.add(d.key);
    }
    if (!this.ring && s.turn >= RING_TURN) { added.push((g) => drawRing(g, s)); this.ring = true; }
    if (sig && !this.signed && !ink.live.has("sign")) { added.push((g) => drawSignature(g, sig)); this.signed = true; }
    if (added.length) {
      const g = this.g!;
      g.setTransform(S, 0, 0, S, 0, 0);
      g.globalCompositeOperation = "multiply";
      for (const draw of added) draw(g);
      g.globalCompositeOperation = "source-over";
      this.version++;
    }
    return { fresh, added: added.length };
  }

  private holdsBaked(h: Hold) {
    for (const k of h.dots) if (this.dots.has(k)) return true;
    for (const b of h.bases) if (this.bases.has(b)) return true;
    for (const i of h.marks) if (this.marks[i]) return true;
    return false;
  }

  private rebuild(s: GameState, S: number, epoch: number) {
    this.S = S;
    this.src = s;
    this.epoch = epoch;
    const w = Math.round(RULES.pageW * S), h = Math.round(RULES.pageH * S);
    if (!this.c) { this.c = document.createElement("canvas"); }
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    this.g = this.c.getContext("2d")!;
    this.g.setTransform(S, 0, 0, S, 0, 0);
    drawPaper(this.g, s);
    this.marks = [];
    this.bases.clear();
    this.dots.clear();
    this.ring = false;
    this.signed = false;
    this.version++;
  }
}
