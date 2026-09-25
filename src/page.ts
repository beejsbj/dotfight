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

export function drawBase(g: Ctx, b: GameState["bases"][number], p = 1) {
  inkCircle(g, b.x, b.y, b.r, INK.pens[b.owner], b.seed, 2.8, 2, p);
}

export function drawMark(g: Ctx, m: Mark, p = 1) {
  const pen = INK.pens[m.owner];
  if (m.t === "stroke") inkFlick(g, m.pts, pen, m.seed, RULES.inkWidth, p);
  else if (m.kind === "moved") {
    // the old dot stays; the little cross comes after the move
    inkDot(g, m.x, m.y, RULES.soldierRadius, pen, m.seed);
    inkCross(g, m.x, m.y, RULES.soldierRadius * 1.2, pen, m.seed, 1.6, 0.7, p);
  } else if (m.kind === "kill") inkCross(g, m.x, m.y, RULES.soldierRadius * 2.1, pen, m.seed, 2.8, 1, p);
  else inkCross(g, m.x, m.y, RULES.soldierRadius * 1.6, pen, m.seed, 2, 1, p);
}

export function drawDot(g: Ctx, x: Soldier, alpha = 1, grow = 1, at: { x: number; y: number } = x) {
  inkDot(g, at.x, at.y, RULES.soldierRadius, INK.pens[x.owner], x.id * 131 + 7, alpha, grow);
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

/**
 * What a long night does to a page: it yellows, and somewhere past the
 * twenty-fourth turn a mug gets set down on it. Seeded, so the same page
 * always has the same ring. Multiplied, so it sits under and over the ink
 * alike, the way a real stain does.
 */
export function drawAge(g: Ctx, s: GameState) {
  const age = ageOf(s);
  if (age <= 0) return;
  g.fillStyle = `rgba(236, 214, 170, ${0.55 * age})`;
  g.fillRect(0, 0, RULES.pageW, RULES.pageH);
  if (s.turn < 24) return;
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

/** Kill crosses still being drawn, by the position of the soldier they cross out. */
export function pendingKills(s: GameState, ink: Ink) {
  const out = new Map<string, string>();
  if (!ink.live.size) return out;
  s.marks.forEach((m, i) => {
    if (m.t === "cross" && m.kind === "kill" && ink.live.has(`m${i}`)) out.set(`${m.x},${m.y}`, `m${i}`);
  });
  return out;
}

export class PageLayer {
  c: HTMLCanvasElement | null = null;
  S = 1;
  private g: Ctx | null = null;
  private src: GameState | null = null;
  private epoch = -1;
  private marks: boolean[] = [];
  private bases = new Set<number>();
  private dead = new Set<number>();
  private signed = false;

  /** Anything in this set is on the cached page; everything else must be drawn live. */
  has(key: string) {
    if (key.startsWith("m")) return !!this.marks[+key.slice(1)];
    if (key.startsWith("b")) return this.bases.has(+key.slice(1));
    return false;
  }
  hasDead(id: number) { return this.dead.has(id); }
  get isSigned() { return this.signed; }

  /**
   * Bring the cached page up to date. `S` is page-canvas px per world unit.
   * Returns whether the page was redrawn from scratch, and the marks that
   * were added (as draw calls in page units), so a caller holding its own
   * copy of the page can multiply the same marks onto it.
   */
  sync(s: GameState, ink: Ink, S: number, epoch: number, sig?: Signature) {
    const fresh = !this.c || this.src !== s || this.S !== S || this.epoch !== epoch || s.marks.length < this.marks.filter(Boolean).length;
    if (fresh) this.rebuild(s, S, epoch);
    const added: ((g: Ctx) => void)[] = [];
    for (const b of s.bases) {
      if (!this.bases.has(b.id) && !ink.live.has(`b${b.id}`)) { added.push((g) => drawBase(g, b)); this.bases.add(b.id); }
    }
    s.marks.forEach((m, i) => {
      if (!this.marks[i] && !ink.live.has(`m${i}`)) { added.push((g) => drawMark(g, m)); this.marks[i] = true; }
    });
    const pending = pendingKills(s, ink);
    for (const x of s.soldiers) {
      if (x.alive || this.dead.has(x.id) || ink.live.has(`d${x.id}`) || pending.has(`${x.x},${x.y}`)) continue;
      added.push((g) => drawDot(g, x, 0.8));
      this.dead.add(x.id);
    }
    if (sig && !this.signed && !ink.live.has("sign")) { added.push((g) => drawSignature(g, sig)); this.signed = true; }
    if (added.length) {
      const g = this.g!;
      g.setTransform(S, 0, 0, S, 0, 0);
      g.globalCompositeOperation = "multiply";
      for (const draw of added) draw(g);
      g.globalCompositeOperation = "source-over";
    }
    return { fresh, added };
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
    this.dead.clear();
    this.signed = false;
  }
}
