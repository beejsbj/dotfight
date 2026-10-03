// The sheet itself, and everything that has dried on it.
//
// The settled page lives in one page-space canvas that only ever grows: when a
// mark finishes drawing it is added on top, never redrawn. Every mark is
// multiplied onto the paper, and multiplying is order-free, so adding marks as
// they settle gives the same pixels as drawing the page from scratch. The
// camera can then swoop and chase the ink for the cost of one image draw.

import { corners, rng, type Mark, type Pt } from "./game";
import type { AnyState as GameState } from "./record";
import { INK, handText, inkCircle, inkCross, inkDot, inkFlick, inkLeft, inkOp, inkPolygon, inkScribble, inkShape, paint, paperGrain, shapeCorners } from "./ink";
import { GAME } from "./name";
import { RULES, type Shape } from "./rules";
import type { Hold } from "./boil";
import { theme, type Theme } from "./theme";

type Ctx = CanvasRenderingContext2D;

/**
 * How the spent (the dead, and the spots men have left) recede so the living
 * stand out. The page is append-only, so this is decided when a dot is inked:
 * a living soldier is held off the page (boil sprite) until he dies or moves,
 * and only then is his dot put down, faded (or, with `hollow`, as an empty
 * ring). `ring` puts an ink ring round each living man, on his sprite.
 */
export const CLARITY = { fade: 0.38, hollow: true, ring: false };

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

// Each paper's grain is made once, the first time that paper is drawn.
const grains = new Map<string, HTMLCanvasElement>();
function grainFor(t: Theme) {
  let c = grains.get(t.id);
  if (!c) { c = paperGrain(500, 850, 7, t.paper.grain, t.paper.foxing); grains.set(t.id, c); }
  return c;
}

/** The blank sheet in the theme's paper: rules, margin, print, and whatever makes it that object. */
export function drawPaper(g: Ctx, s: GameState) {
  const P = theme.paper;
  const { pageW: w, pageH: h, margin } = RULES;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = P.colour;
  g.fillRect(0, 0, w, h);
  if (P.extra === "titleblock") wash(g, w, h);
  g.drawImage(grainFor(theme), 0, 0, w, h);
  if (P.extra === "showthrough") showThrough(g, w, h);
  lines(g, P, w, h, margin);
  marginLine(g, P, w, h, margin);
  if (P.extra === "staples") staples(g, h);
  if (P.extra === "gum") gum(g, w);
  if (P.extra === "titleblock") titleBlock(g, P, w);
  // printed header
  g.fillStyle = P.print;
  g.font = P.extra === "titleblock" ? "15px 'Special Elite', monospace" : "21px 'Patrick Hand', sans-serif";
  for (const [text, x, y] of P.labels) g.fillText(text, x, y);
  if (s.page) {
    g.globalCompositeOperation = inkOp();
    handText(g, String(s.page.no), P.noAt[0], P.noAt[1], 36, INK.pens[0], { rot: -0.04, alpha: 0.92 });
    handText(g, s.page.date, P.dateAt[0], P.dateAt[1], 33, INK.pens[0], { rot: -0.025, alpha: 0.92 });
    g.globalCompositeOperation = "source-over";
  }
}

function lines(g: Ctx, P: Theme["paper"], w: number, h: number, margin: number) {
  if (P.lines === "squared") {
    // squared paper: the back pages of a maths copy
    g.strokeStyle = P.line;
    g.lineWidth = 1.1;
    g.beginPath();
    for (let x = P.step; x < w; x += P.step) { g.moveTo(x, P.top); g.lineTo(x, h); }
    for (let y = P.top; y < h; y += P.step) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    g.strokeStyle = P.bold;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, P.top); g.lineTo(w, P.top);
    g.stroke();
  } else if (P.lines === "ruled") {
    g.strokeStyle = P.line;
    g.lineWidth = 1.4;
    g.beginPath();
    for (let y = P.top; y < h - 10; y += P.step) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    if (P.bold !== P.line) {
      // a coloured header rule above the first line, as school copies print it
      g.strokeStyle = P.bold;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(0, P.top - 12); g.lineTo(w, P.top - 12);
      g.stroke();
    }
  } else if (P.lines === "graph") {
    // fine squares with a bold one every few, lined up so a bold line is the margin
    const big = P.step * P.every, x0 = margin % big;
    for (const bold of [false, true]) {
      g.strokeStyle = bold ? P.bold : P.line;
      g.lineWidth = bold ? 1.3 : 0.8;
      g.beginPath();
      const st = bold ? big : P.step;
      for (let x = x0 % st; x < w; x += st) {
        if (!bold && Math.abs(((x - x0) / big) - Math.round((x - x0) / big)) < 1e-6) continue;
        g.moveTo(x, P.top); g.lineTo(x, h);
      }
      for (let y = P.top; y < h; y += st) {
        if (!bold && Math.abs(((y - P.top) / big) - Math.round((y - P.top) / big)) < 1e-6) continue;
        g.moveTo(0, y); g.lineTo(w, y);
      }
      g.stroke();
    }
  }
}

function marginLine(g: Ctx, P: Theme["paper"], w: number, h: number, margin: number) {
  g.strokeStyle = P.margin;
  if (P.marginStyle === "single" || P.marginStyle === "double") {
    g.lineWidth = P.marginStyle === "double" ? 1.6 : 1.8;
    g.beginPath();
    g.moveTo(margin, 0); g.lineTo(margin, h);
    if (P.marginStyle === "double") { g.moveTo(margin + 5, 0); g.lineTo(margin + 5, h); }
    g.stroke();
  } else if (P.marginStyle === "pencil") {
    // ruled by hand against a ruler that slipped a little: grainy, uneven
    const r = rng(4242);
    g.lineCap = "round";
    let x = margin + (r() - 0.5) * 2;
    for (let y = 6; y < h - 6; y += 34) {
      const nx = margin + (y / h) * 3 + (r() - 0.5) * 1.2;
      g.globalAlpha = 0.55 + r() * 0.4;
      g.lineWidth = 1.3 + r() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, y + 34); g.stroke();
      x = nx;
    }
    g.globalAlpha = 1;
  } else if (P.marginStyle === "frame") {
    // a drawing sheet's border: a wide filing margin on the left, narrow elsewhere
    g.lineWidth = 3;
    g.strokeRect(margin, 22, w - 22 - margin, h - 44);
    g.lineWidth = 1;
    g.strokeRect(margin + 7, 29, w - 36 - margin, h - 58);
  }
}

// A copy is stapled through its fold: two staples along the spine, and the
// fold's gutter shading the paper beside them.
function staples(g: Ctx, h: number) {
  const gut = g.createLinearGradient(0, 0, 30, 0);
  gut.addColorStop(0, "rgba(60, 60, 70, 0.16)");
  gut.addColorStop(1, "rgba(60, 60, 70, 0)");
  g.fillStyle = gut;
  g.fillRect(0, 0, 30, h);
  for (const y of [h * 0.23, h * 0.77]) {
    g.fillStyle = "rgba(40, 40, 50, 0.25)";
    g.fillRect(3.5, y - 34, 7, 70); // its shadow
    const m = g.createLinearGradient(2, 0, 9, 0);
    m.addColorStop(0, "#8d9096");
    m.addColorStop(0.45, "#e7e9ec");
    m.addColorStop(1, "#6f7278");
    g.fillStyle = m;
    g.fillRect(2, y - 36, 6.5, 70);
    g.fillStyle = "rgba(50, 50, 60, 0.45)"; // where the legs go through
    g.fillRect(2, y - 36, 6.5, 3);
    g.fillRect(2, y + 31, 6.5, 3);
  }
}

// A legal pad's red gummed binding and the perforation under it.
function gum(g: Ctx, w: number) {
  const band = g.createLinearGradient(0, 0, 0, 40);
  band.addColorStop(0, "#8e2622");
  band.addColorStop(0.7, "#a9322c");
  band.addColorStop(1, "#7d1f1c");
  g.fillStyle = band;
  g.fillRect(0, 0, w, 38);
  const r = rng(77);
  g.fillStyle = "rgba(255, 220, 200, 0.07)";
  for (let i = 0; i < 260; i++) g.fillRect(r() * w, r() * 36, 2 + r() * 14, 1);
  g.fillStyle = "rgba(60, 20, 10, 0.18)";
  g.fillRect(0, 38, w, 3);
  g.fillStyle = "rgba(90, 80, 40, 0.28)";
  for (let x = 4; x < w; x += 9) { g.beginPath(); g.arc(x, 54, 1.3, 0, Math.PI * 2); g.fill(); }
}

// The drawing sheet's title block across the top, and the blueprint's uneven wash.
function titleBlock(g: Ctx, P: Theme["paper"], w: number) {
  const x0 = RULES.margin + 7, x1 = w - 29, y0 = 29, y1 = 96;
  g.strokeStyle = P.margin;
  g.lineWidth = 1.4;
  g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  g.beginPath();
  for (const x of [300, 700]) { g.moveTo(x, y0); g.lineTo(x, y1); }
  g.stroke();
  g.fillStyle = P.print;
  g.textAlign = "center";
  g.font = "24px 'Special Elite', monospace";
  g.fillText(GAME.name.toUpperCase(), 500, 60);
  g.font = "12px 'Special Elite', monospace";
  g.fillText("GENERAL ARRANGEMENT · SCALE 1:1 · DO NOT SCALE", 500, 82);
  g.textAlign = "left";
}
function wash(g: Ctx, w: number, h: number) {
  const r = rng(31);
  for (let k = 0; k < 9; k++) {
    const x = r() * w, y = r() * h, rad = 200 + r() * 500, light = r() < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, light ? "rgba(90, 140, 210, 0.16)" : "rgba(10, 30, 70, 0.16)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (const [x0, y0, x1, y1] of [[0, 0, 60, 0], [w, 0, w - 60, 0], [0, 0, 0, 60], [0, h, 0, h - 60]]) {
    const e = g.createLinearGradient(x0, y0, x1, y1);
    e.addColorStop(0, "rgba(6, 20, 50, 0.3)");
    e.addColorStop(1, "rgba(6, 20, 50, 0)");
    g.fillStyle = e;
    g.fillRect(0, 0, w, h);
  }
}

// The front of the worksheet, seen through the paper: mirrored, soft, faint.
// Painted small and stretched, so it blurs for free.
let ghost: HTMLCanvasElement | null = null;
function showThrough(g: Ctx, w: number, h: number) {
  if (!ghost) {
    const k = 0.3;
    ghost = document.createElement("canvas");
    ghost.width = Math.round(w * k);
    ghost.height = Math.round(h * k);
    const q = ghost.getContext("2d")!;
    q.scale(k, k);
    q.fillStyle = q.strokeStyle = "#1a1a22";
    q.font = "700 54px 'Patrick Hand', sans-serif";
    q.fillText("Worksheet 7: Fractions", 110, 140);
    q.font = "30px 'Patrick Hand', sans-serif";
    q.fillText("Name: ____________________    Class: ______", 110, 200);
    q.lineWidth = 3;
    q.strokeRect(80, 230, w - 160, 2);
    const qs = ["1. Shade three quarters of each shape.", "2. Fill in the blanks.", "3. Colour the bigger fraction.", "4. Draw a line to the matching picture."];
    let y = 300;
    qs.forEach((t, i) => {
      q.fillText(t, 110, y);
      y += 40;
      if (i === 0) {
        for (let j = 0; j < 4; j++) {
          const cx = 200 + j * 190, cy = y + 80;
          q.beginPath(); q.arc(cx, cy, 70, 0, Math.PI * 2); q.stroke();
          q.beginPath(); q.moveTo(cx - 70, cy); q.lineTo(cx + 70, cy); q.moveTo(cx, cy - 70); q.lineTo(cx, cy + 70); q.stroke();
        }
        y += 210;
      } else if (i === 1) {
        for (let j = 0; j < 4; j++) { q.fillText(`${j + 1}/4 + ____ = 1          ____ /8 = ${j + 1}/2`, 150, y + 10); y += 52; }
        y += 30;
      } else if (i === 2) {
        for (let j = 0; j < 3; j++) {
          for (let c = 0; c < 2; c++) q.strokeRect(160 + c * 360, y, 280, 60);
          q.fillText("or", 470, y + 42);
          y += 90;
        }
        y += 20;
      } else {
        for (let j = 0; j < 4; j++) {
          q.fillRect(200, y + j * 120 + 20, 12, 12);
          q.strokeRect(640, y + j * 120, 150, 90);
        }
        y += 500;
      }
    });
    q.font = "22px 'Patrick Hand', sans-serif";
    q.fillText("Well done!  ☆ ☆ ☆", 110, h - 90);
  }
  g.save();
  g.globalAlpha = 0.05;
  g.translate(w, 0);
  g.scale(-1, 1); // it's the other side
  g.drawImage(ghost, 0, 0, w, h);
  g.restore();
  // the staple through the corner, its legs folded flat on this side
  g.save();
  g.translate(46, 44);
  g.rotate(-0.72);
  g.fillStyle = "rgba(40, 40, 50, 0.22)";
  g.fillRect(-24, 2.5, 20, 4.5);
  g.fillRect(8, 2.5, 20, 4.5);
  const m = g.createLinearGradient(0, -3, 0, 3);
  m.addColorStop(0, "#9a9da3");
  m.addColorStop(0.5, "#eceef0");
  m.addColorStop(1, "#7a7d83");
  g.fillStyle = m;
  g.fillRect(-26, -2, 20, 4);
  g.fillRect(6, -2, 20, 4);
  g.restore();
}

/** What drawing a man needs: who he is, and (the long war) his shape and his base's turn. Not always a real soldier: a card draws its men this way too. */
type Dotted = { id: number; owner: 0 | 1; shape?: Shape; rot?: number };

/**
 * A man's mark by his base's shape: corners, and the circumradius that gives a
 * triangle, square or hexagon the visual weight of a dot of `soldierRadius` (a triangle
 * in a 7-circle is 41 % of its area; at 9 it's 68 %, and its tips carry the
 * rest; a square at 8.3 is 64 %; a hexagon at 7.6 is 98 %). A look, not a rule: the hit radius stays 7.
 */
export const MAN: Record<Shape, { n: number; R: number }> = { camp: { n: 0, R: RULES.soldierRadius }, prism: { n: 3, R: 9 }, cushion: { n: 6, R: 7.6 }, square: { n: 4, R: 8.3 } };
/** His mark's circumradius: a plain dot's unless he has a shape. */
export const manR = (x: { shape?: Shape }): number => (x.shape ? MAN[x.shape].R : RULES.soldierRadius);

// `wob` picks a redrawing for the line boil (0 is the drawing the page keeps), straying `amp` times the usual.
// A triangle or hexagon (the long war) is inked side by side; each redrawing of the boil is a fresh hand at it.
export function drawBase(g: Ctx, b: GameState["bases"][number], p = 1, wob = 0, amp = 1) {
  const vs = corners(b);
  if (vs) inkPolygon(g, vs, INK.pens[b.owner], wob ? (b.seed ^ Math.imul(wob, 0x9e3779b1)) >>> 0 : b.seed, 2.8 * theme.ink.width, 2, p);
  else inkCircle(g, b.x, b.y, b.r, INK.pens[b.owner], b.seed, 2.8 * theme.ink.width, 2, p, wob, amp);
}

/**
 * Where the soldier who left the spot of "moved" mark `i` went: the spot he
 * left next (a later "moved" mark of his), else where he stands now. Pure, so a
 * rebuilt page draws the same arrows as the one that was inked.
 */
export function wentTo(s: GameState, i: number): Pt | undefined {
  const m = s.marks[i];
  if (m?.t !== "cross" || m.kind !== "moved") return undefined;
  const id = m.id ?? (s.v === 1 ? s.flicks[m.turn - 1]?.soldierId : undefined);
  if (id === undefined) return undefined;
  for (let j = i + 1; j < s.marks.length; j++) {
    const n = s.marks[j];
    if (n.t === "cross" && n.kind === "moved" && (n.id ?? (s.v === 1 ? s.flicks[n.turn - 1]?.soldierId : undefined)) === id) return { x: n.x, y: n.y };
  }
  const x = s.soldiers[id];
  return x && (x.x !== m.x || x.y !== m.y) ? { x: x.x, y: x.y } : undefined;
}

// `to`: where a soldier who left this spot went (wentTo), for the arrow.
export function drawMark(g: Ctx, m: Mark, p = 1, wob = 0, to?: Pt) {
  const pen = INK.pens[m.owner], k = theme.ink.width;
  if (m.t === "stroke") inkFlick(g, m.pts, pen, m.seed, RULES.inkWidth * k, p, 1, wob);
  else if (m.t === "walk") drawWalk(g, m.a, m.b, pen, m.seed, p);
  else if (m.t === "stand") {
    // the last few, ringed where they stood when their comrades were gone
    // twice, and heavier than a camp's line: it has to read from bird's-eye
    m.at.forEach((q, j) => {
      inkCircle(g, q.x, q.y, RULES.soldierRadius + 9, pen, m.seed + j * 17, 2.7 * k, 1, p);
      inkCircle(g, q.x, q.y, RULES.soldierRadius + 14, pen, m.seed + j * 17 + 9, 1.6 * k, 1, Math.max(0, (p - 0.3) / 0.7));
    });
  } else if (m.kind === "moved") {
    // the old dot stays, and a small arrow leaves it: he went that way (a cross means dead, so never a cross)
    if (m.id === undefined) inkDot(g, m.x, m.y, RULES.soldierRadius, pen, m.seed, 1, 1, wob); // (his dot is the page's own, from dotSpots)
    if (to) inkLeft(g, m.x, m.y, to, pen, m.seed + 3, RULES.soldierRadius * 1.6, RULES.soldierRadius * 2.6, 1.9 * k, 0.85, p);
  } else if (m.kind === "kill") {
    // crossed out: a thin cross, and a light scribble over it. Quiet next to the living, but never a cross without it
    inkCross(g, m.x, m.y, RULES.soldierRadius * 2.0, pen, m.seed, 2 * k, 0.6, Math.min(1, p / 0.6), wob);
    inkScribble(g, m.x, m.y, RULES.soldierRadius * 1.3, pen, m.seed + 5, 1.3 * k, 0.5, (p - 0.4) / 0.6);
  } else inkCross(g, m.x, m.y, RULES.soldierRadius * 1.6, pen, m.seed, 2 * k, 1, p, wob);
}

/** A convoy's footprints: short ticks, left and right, the way a kid draws soldiers marching. */
export function drawWalk(g: Ctx, a: Pt, b: Pt, color: string, seed: number, p = 1) {
  const rand = rng(seed);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l < 1) return;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  const step = 13;
  const n = Math.floor(l / step);
  g.strokeStyle = paint(g, color);
  g.lineCap = "round";
  g.lineWidth = 1.7 * theme.ink.width;
  for (let i = 0; i <= n * Math.min(1, p); i++) {
    const side = i % 2 ? 1 : -1;
    const d = i * step + (rand() - 0.5) * 3;
    const cx = a.x + ux * d - uy * side * 3.2, cy = a.y + uy * d + ux * side * 3.2;
    g.globalAlpha = 0.55 + rand() * 0.2;
    g.beginPath();
    g.moveTo(cx - ux * 2.4, cy - uy * 2.4);
    g.lineTo(cx + ux * 2.4, cy + uy * 2.4);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** The dot a man leaves on the page when he dies or moves on: faded, or hollow (see CLARITY). */
export function drawSpent(g: Ctx, x: Pt & Dotted, at: Pt) {
  const m = x.shape ? MAN[x.shape] : undefined, seed = x.id * 131 + 7;
  if (CLARITY.hollow) {
    g.globalAlpha = 0.7;
    // a shaped man leaves a hollow in his shape, its corners where his pressed mark's were
    if (m && m.n >= 3) inkPolygon(g, shapeCorners(at.x, at.y, m.R * 0.88, m.n, x.rot ?? 0, rng(seed)), INK.pens[x.owner], seed, 1.7 * theme.ink.width, 1);
    else inkCircle(g, at.x, at.y, RULES.soldierRadius * 0.9, INK.pens[x.owner], seed, 1.7 * theme.ink.width, 1);
    g.globalAlpha = 1;
  } else if (m && m.n >= 3) inkShape(g, at.x, at.y, m.R, m.n, x.rot ?? 0, INK.pens[x.owner], seed, CLARITY.fade, 1);
  else inkDot(g, at.x, at.y, RULES.soldierRadius, INK.pens[x.owner], seed, CLARITY.fade, 1);
}

// A man with a shape (the long war) is pressed in it; without one he's the plain dot, exactly as before.
export function drawDot(g: Ctx, x: Pt & Dotted, alpha = 1, grow = 1, at: { x: number; y: number } = x, wob = 0, amp = 1) {
  const m = x.shape ? MAN[x.shape] : undefined;
  if (m && m.n >= 3) inkShape(g, at.x, at.y, m.R, m.n, x.rot ?? 0, INK.pens[x.owner], x.id * 131 + 7, alpha, grow, wob, amp);
  else inkDot(g, at.x, at.y, RULES.soldierRadius, INK.pens[x.owner], x.id * 131 + 7, alpha, grow, wob, amp);
}

export function drawSignature(g: Ctx, sig: Signature, p = 1) {
  const y = RULES.pageH - 38;
  g.globalCompositeOperation = inkOp();
  handText(g, sig.text, RULES.pageW - 40, y, 44, INK.pens[sig.owner], { upTo: p, rot: -0.03, align: "right", alpha: 0.95 });
  if (p >= 1) {
    // an underline flourish, flicked off at the end
    inkFlick(g, [{ x: RULES.pageW - 420, y: y + 14 }, { x: RULES.pageW - 230, y: y + 10 }, { x: RULES.pageW - 60, y: y + 2 }], INK.pens[sig.owner], 991, 2.4 * theme.ink.width);
  }
}

/** How yellowed the paper is: a long war ages the sheet. */
export const ageOf = (s: GameState) => Math.min(1, s.turn / 70);
/** The yellowing as a multiply colour (per channel, 0..1), for layers that tint instead of paint. */
export function yellowing(age: number, t: Theme = theme): [number, number, number] {
  const a = t.paper.ageK * age, c = t.paper.age;
  return [1 - a + a * (c[0] / 255), 1 - a + a * (c[1] / 255), 1 - a + a * (c[2] / 255)];
}
export const RING_TURN = 24;

/** Yellowed paper (for the kept image; on screen the lamp layer does it). */
export function drawYellow(g: Ctx, s: GameState) {
  const age = ageOf(s);
  if (age <= 0) return;
  g.fillStyle = `rgba(${theme.paper.age.join(", ")}, ${theme.paper.ageK * age})`;
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
    // core rules: the cross names who left; a prototype page had one flick a turn
    const id = m.id ?? (s.v === 1 ? s.flicks[m.turn - 1]?.soldierId : undefined);
    if (id !== undefined) add(id, m.x, m.y);
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
  /** The paper it was drawn on: a different theme means a fresh sheet. */
  private themeId = "";

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
   * page is drawn afresh. `source` keeps a pending presentation snapshot on
   * the same sheet as its engine state; switching back does not rebuild it.
   */
  sync(s: GameState, ink: Ink, S: number, epoch: number, sig?: Signature, hold?: Hold, source = s) {
    let fresh = !this.c || this.src !== source || this.S !== S || this.epoch !== epoch || this.themeId !== theme.id || s.marks.length < this.marks.filter(Boolean).length;
    // nothing new since last time: most frames stop here
    const acts = s.v === 1 ? s.flicks.length : s.actions.length;
    const stamp = `${s.marks.length}|${s.bases.length}|${s.turn}|${acts}|${[...ink.live].join()}|${hold?.sig}|${!!sig}`;
    if (!fresh && stamp === this.stamp) return { fresh, added: 0 };
    this.stamp = stamp;
    if (!fresh && hold && this.holdsBaked(hold)) fresh = true;
    const spots = dotSpots(s);
    // Ink is never taken back once the war starts. Before it, a soldier arranged
    // somewhere else leaves no dot behind: the page is drawn afresh (once per drop).
    if (!fresh && this.dots.size) {
      const keys = new Set(spots.map((d) => d.key));
      for (const k of this.dots) if (!keys.has(k)) { fresh = true; break; }
    }
    if (fresh) { this.rebuild(s, S, epoch); this.src = source; }
    const added: ((g: Ctx) => void)[] = [];
    for (const b of s.bases) {
      if (!this.bases.has(b.id) && !ink.live.has(`b${b.id}`) && !hold?.bases.has(b.id)) { added.push((g) => drawBase(g, b)); this.bases.add(b.id); }
    }
    s.marks.forEach((m, i) => {
      if (!this.marks[i] && !ink.live.has(`m${i}`) && !hold?.marks.has(i)) { added.push((g) => drawMark(g, m, 1, 0, wentTo(s, i))); this.marks[i] = true; }
    });
    for (const d of spots) {
      if (this.dots.has(d.key) || ink.live.has(`d${d.id}`) || hold?.dots.has(d.key)) continue;
      const x = s.soldiers[d.id];
      // held-then-released (the boil is on): he was alive until now, so his dot goes down spent
      added.push((g) => (hold?.ghost ? drawSpent(g, x, d) : drawDot(g, x, 1, 1, d)));
      this.dots.add(d.key);
    }
    // a coffee ring darkens whatever the paper, so it always multiplies
    if (!this.ring && s.turn >= RING_TURN) { added.push((g) => { g.globalCompositeOperation = "multiply"; drawRing(g, s); g.globalCompositeOperation = inkOp(); }); this.ring = true; }
    if (sig && !this.signed && !ink.live.has("sign")) { added.push((g) => drawSignature(g, sig)); this.signed = true; }
    if (added.length) {
      const g = this.g!;
      g.setTransform(S, 0, 0, S, 0, 0);
      // multiplying (or, for light ink on dark paper, screening) is order-free:
      // marks added as they settle make the same pixels as a redrawn page
      g.globalCompositeOperation = inkOp();
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
    this.themeId = theme.id;
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
