// Camera and page rendering. The page is redrawn from state every frame it
// changes; marks are seeded so it looks the same every time.

import { baseEdges, baseVerts } from "./bases";
import { inLastStand, type Base, type GameState, type Player, type Pt } from "./game";
import { INK, drawPen, inkCircle, inkCross, inkDot, inkFlick, inkNotch, inkPolygon, inkRoad, inkStrike, handText, paperGrain, pencilArrow, pencilLine, pencilLoop } from "./ink";
import { RULES, type Shape } from "./rules";

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export class Camera {
  x = RULES.pageW / 2;
  y = RULES.pageH / 2;
  z = 1;
  // viewport the page is framed in (css px), leaving room for the HUD
  vx = 0; vy = 0; vw = 1; vh = 1;
  private tw: { from: [number, number, number]; to: [number, number, number]; t0: number; dur: number } | null = null;

  setViewport(x: number, y: number, w: number, h: number) {
    this.vx = x; this.vy = y; this.vw = w; this.vh = h;
  }
  get fitZ() {
    return Math.min(this.vw / RULES.pageW, this.vh / RULES.pageH) * 0.96;
  }
  get cx() { return this.vx + this.vw / 2; }
  get cy() { return this.vy + this.vh / 2; }

  toWorld(sx: number, sy: number): Pt {
    return { x: (sx - this.cx) / this.z + this.x, y: (sy - this.cy) / this.z + this.y };
  }
  toScreen(p: Pt): Pt {
    return { x: (p.x - this.x) * this.z + this.cx, y: (p.y - this.y) * this.z + this.cy };
  }

  fit(animate = false) {
    this.to(RULES.pageW / 2, RULES.pageH / 2, this.fitZ, animate ? 450 : 0);
  }
  to(x: number, y: number, z: number, dur = 350) {
    z = Math.min(this.fitZ * 4, Math.max(this.fitZ, z));
    [x, y] = this.clampXY(x, y, z);
    if (!dur) { this.x = x; this.y = y; this.z = z; this.tw = null; return; }
    this.tw = { from: [this.x, this.y, this.z], to: [x, y, z], t0: performance.now(), dur };
  }
  get moving() { return !!this.tw; }
  stop() { this.tw = null; }

  // keep the page on screen; when zoomed out fully, centre it
  clampXY(x: number, y: number, z: number): [number, number] {
    const hw = this.vw / 2 / z, hh = this.vh / 2 / z;
    const pad = 30;
    const cl = (v: number, half: number, size: number) =>
      half * 2 >= size + pad * 2 ? size / 2 : Math.min(size + pad - half, Math.max(half - pad, v));
    return [cl(x, hw, RULES.pageW), cl(y, hh, RULES.pageH)];
  }
  clamp() { [this.x, this.y] = this.clampXY(this.x, this.y, this.z); }

  tick(now: number) {
    if (!this.tw) return false;
    const t = Math.min(1, (now - this.tw.t0) / this.tw.dur), e = ease(t);
    const [a, b] = [this.tw.from, this.tw.to];
    this.x = a[0] + (b[0] - a[0]) * e;
    this.y = a[1] + (b[1] - a[1]) * e;
    this.z = a[2] + (b[2] - a[2]) * e;
    if (t >= 1) this.tw = null;
    return true;
  }
}

// How far along each mark is being drawn. Keys: `b<id>` base circle,
// `d<soldier>` a soldier's dot being jotted, `m<index>` a mark.
export interface Ink {
  p(key: string): number; // 0..1; anything not scheduled is settled (1)
  live: Set<string>; // keys still being drawn: kept out of the settled layer
}

export interface Pen { x: number; y: number; angle: number; pull: number; lift: number; owner: Player }

export interface Overlay {
  selected?: number;
  aim?: { soldierId: number; angle: number; power: number; spread: number; reach: number };
  ghost?: { x: number; y: number; ok: boolean; shape: Shape; r: number; rot: number }; // base placement preview
  pick?: { from?: number; to?: number }; // a transfer being set up: pencil rings round the bases
  ink?: Ink;
  mover?: { id: number; at: Pt }; // a moving soldier rides the head of its own ink
  pen?: Pen; // the pen after release: riding the ink, then lifting away
  teach?: { kind: "aim" | "place"; at: Pt; p: number }; // first-time pencil notes, once ever
  hint?: { p: number; bases: { id: number; x: number; y: number; r: number }[] }; // whose turn: pencil loops
}

const SETTLED: Ink = { p: () => 1, live: new Set() };
let grain: HTMLCanvasElement | null = null;

export function worldTransform(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cam.cx - cam.x * cam.z), dpr * (cam.cy - cam.y * cam.z));
}

// The settled page is cached per target canvas: a late-game page is hundreds
// of seeded strokes (~56ms a frame on a throttled phone CPU), and it only
// changes when the camera moves or a mark settles. Aiming and animation then
// cost one image copy plus the live layer.
const pageCache = new WeakMap<HTMLCanvasElement, { c: HTMLCanvasElement; key: string }>();
let epoch = 0; // bump to throw every cached page away (e.g. once fonts load)
export const renderOpts = { cache: true };
export function invalidatePage() { epoch++; }

export function render(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, o: Overlay, W: number, H: number, dpr: number) {
  const ink = o.ink ?? SETTLED;
  const target = ctx.canvas;
  if (!renderOpts.cache || typeof document === "undefined") {
    drawSettled(ctx, cam, s, o, ink, W, H, dpr);
  } else {
    const key = [epoch, cam.x, cam.y, cam.z, cam.vx, cam.vy, cam.vw, cam.vh, W, H, dpr, target.width, target.height,
      s.bases.length, s.marks.length, s.turn, s.phase, s.page?.no, o.mover?.id ?? "", [...ink.live].sort().join()].join("|");
    let hit = pageCache.get(target);
    if (!hit) { hit = { c: document.createElement("canvas"), key: "" }; pageCache.set(target, hit); }
    if (hit.key !== key) {
      if (hit.c.width !== target.width || hit.c.height !== target.height) { hit.c.width = target.width; hit.c.height = target.height; }
      drawSettled(hit.c.getContext("2d")!, cam, s, o, ink, W, H, dpr);
      hit.key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(hit.c, 0, 0);
  }
  worldTransform(ctx, cam, dpr);
  drawLive(ctx, cam, s, o, ink);
}

// Desk, paper, and every mark that is finished: the page as a record.
export function drawSettled(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, o: Overlay, ink: Ink, W: number, H: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#2b2825"; // desk
  ctx.fillRect(0, 0, W, H);
  worldTransform(ctx, cam, dpr);
  drawPaper(ctx, s);
  ctx.globalCompositeOperation = "multiply";
  drawMarks(ctx, s, ink, false);
  drawSoldiers(ctx, s, o, ink, false);
  ctx.globalCompositeOperation = "source-over";
}

// Everything still moving: marks being drawn, pencil guides, the pen.
// Marks use multiply, so drawing them after the settled ones gives the same page.
export function drawLive(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, o: Overlay, ink: Ink) {
  if (ink.live.size || o.mover) {
    ctx.globalCompositeOperation = "multiply";
    drawMarks(ctx, s, ink, true);
    drawSoldiers(ctx, s, o, ink, true);
    ctx.globalCompositeOperation = "source-over";
  }
  const px = 1 / cam.z; // one css pixel in world units
  drawWet(ctx, s, ink);
  if (o.hint) for (const b of o.hint.bases) {
    pencilLoop(ctx, b.x, b.y, b.r + 12, 900 + b.id * 17, Math.max(1.4, px * 0.9), o.hint.p, 0.6);
  }
  if (o.selected !== undefined && !o.aim && !o.pen) {
    const x = s.soldiers[o.selected];
    pencilRing(ctx, x.x, x.y, s.rules.soldierRadius + 9, 1.6);
  }
  if (o.pick) {
    for (const id of [o.pick.from, o.pick.to]) {
      if (id === undefined) continue;
      const b = s.bases[id];
      pencilLoop(ctx, b.x, b.y, b.r + 14, 700 + id, Math.max(1.6, px * 1.2), 1, id === o.pick.from ? 0.95 : 0.7);
    }
    if (o.pick.from !== undefined && o.pick.to !== undefined) {
      const a = s.bases[o.pick.from], b = s.bases[o.pick.to];
      pencilArrow(ctx, a, b, 0.08, 31, 2.2, 1, 0.8);
    }
  }
  if (o.ghost) {
    ctx.globalAlpha = o.ghost.ok ? 0.8 : 0.45;
    const g = o.ghost;
    const v = baseVerts({ shape: g.shape, x: g.x, y: g.y, r: g.r, rot: g.rot });
    if (v) v.forEach((p, i) => pencilLine(ctx, p, v[(i + 1) % v.length], g.ok ? 2 : 1.4, i, !g.ok));
    else pencilRing(ctx, g.x, g.y, g.r, g.ok ? 2 : 1.4, !g.ok);
    ctx.globalAlpha = 1;
  }
  if (o.teach) drawTeach(ctx, o.teach);
  if (o.aim) drawAim(ctx, s, o.aim, px);
  if (o.pen) drawPen(ctx, o.pen.x, o.pen.y, o.pen.angle, o.pen.pull, INK.pens[o.pen.owner], 1, o.pen.lift);
}

// Wet ink (rules with ink.fresh): each player's newest lines still shine a
// little. It's only a sheen over the ink; when a line dries the sheen goes
// and the ink underneath is exactly as it was.
function drawWet(ctx: CanvasRenderingContext2D, s: GameState, ink: Ink) {
  const I = s.rules.ink;
  if (!I.fresh || !(I.ownBounces || I.enemyStops || I.friction)) return;
  const seen = [0, 0];
  for (let i = s.marks.length - 1; i >= 0; i--) {
    const m = s.marks[i];
    if (m.t !== "stroke" || seen[m.owner]++ >= I.fresh) continue;
    const p = ink.p(`m${i}`);
    if (p < 1) continue;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    const n = Math.floor((m.pts.length - 1) * 0.75);
    for (let k = 0; k <= n; k++) {
      const a = m.pts[Math.max(0, k - 1)], b = m.pts[Math.min(m.pts.length - 1, k + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const x = m.pts[k].x - (dy / l) * 0.7, y = m.pts[k].y + (dx / l) * 0.7;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function pencilRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, dashed = true) {
  const n = Math.max(12, Math.round(r / 3));
  for (let i = 0; i < n; i++) {
    if (dashed && i % 2) continue;
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    pencilLine(ctx, { x: x + Math.cos(a0) * r, y: y + Math.sin(a0) * r }, { x: x + Math.cos(a1) * r, y: y + Math.sin(a1) * r }, w, i, false);
  }
}

function drawPaper(ctx: CanvasRenderingContext2D, s: GameState) {
  const { pageW: w, pageH: h, margin } = RULES;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(6, 9, w, h);
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, w, h);
  grain ??= paperGrain(500, 700, 7);
  ctx.drawImage(grain, 0, 0, w, h);
  // ruled lines
  ctx.strokeStyle = INK.rule;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let y = 120; y < h - 10; y += 44) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  // double margin
  ctx.strokeStyle = INK.margin;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(margin, 0); ctx.lineTo(margin, h);
  ctx.moveTo(margin + 5, 0); ctx.lineTo(margin + 5, h);
  ctx.stroke();
  // printed header
  ctx.fillStyle = "rgba(92, 140, 196, 0.7)";
  ctx.font = "22px 'Patrick Hand', sans-serif";
  ctx.fillText("Date ____________", w - 250, 70);
  ctx.fillText("No. ______", margin + 30, 70);
  // filled in by whoever started the page, in their pen
  if (s.page) {
    ctx.globalCompositeOperation = "multiply";
    handText(ctx, String(s.page.no), margin + 78, 64, 34, INK.pens[0], { rot: -0.04, alpha: 0.9 });
    handText(ctx, s.page.date, w - 190, 64, 32, INK.pens[0], { rot: -0.025, alpha: 0.9 });
    ctx.globalCompositeOperation = "source-over";
  }
}

/** A base's outline in its founder's pen: a circle, or a hand-drawn polygon. */
export function drawBase(ctx: CanvasRenderingContext2D, b: Base, upTo = 1, owner: Player = b.founder ?? b.owner, seed = b.seed) {
  const v = baseVerts(b);
  if (v) inkPolygon(ctx, v, INK.pens[owner], seed, 2.6, 2, upTo);
  else inkCircle(ctx, b.x, b.y, b.r, INK.pens[owner], seed, 2.6, 2, upTo);
}

// live=false draws the settled marks, live=true only the ones being drawn.
function drawMarks(ctx: CanvasRenderingContext2D, s: GameState, ink: Ink, live: boolean) {
  const dot = s.rules.soldierRadius;
  for (const b of s.bases) {
    const k = `b${b.id}`;
    if (ink.live.has(k) !== live) continue;
    drawBase(ctx, b, live ? ink.p(k) : 1);
  }
  s.marks.forEach((m, i) => {
    const k = `m${i}`;
    if (ink.live.has(k) !== live) return;
    const p = live ? ink.p(k) : 1;
    const pen = INK.pens[m.owner];
    if (m.t === "stroke") inkFlick(ctx, m.pts, pen, m.seed, RULES.inkWidth, p);
    else if (m.t === "road") {
      inkRoad(ctx, m.a, m.b, pen, m.seed, 2, p);
      if (p > 0.5) {
        const mx = (m.a.x + m.b.x) / 2, my = (m.a.y + m.b.y) / 2;
        const ang = Math.atan2(m.b.y - m.a.y, m.b.x - m.a.x);
        const up = Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang;
        handText(ctx, `${m.n}`, mx - Math.sin(up) * 16, my + Math.cos(up) * 16 + 10, 34, pen, { rot: up, align: "center", alpha: 0.9, upTo: (p - 0.5) * 2 });
      }
    } else if (m.t === "notch") {
      const [a, e] = baseEdges(s.bases[m.base])[m.edge] ?? [m, m];
      inkNotch(ctx, m.x, m.y, Math.atan2(e.y - a.y, e.x - a.x), pen, m.seed, 11, p);
    } else if (m.t === "raze") {
      const b = s.bases[m.base];
      inkStrike(ctx, b.x, b.y, b.r, pen, m.seed, p);
    } else if (m.t === "found") {
      // taken: circled again, in the taker's pen
      const b = s.bases[m.base];
      drawBase(ctx, { ...b, r: b.r + 7 }, p, m.owner, m.seed);
    } else if (m.t === "stand") {
      // written in the margin of the page, in that side's pen
      const y = m.owner === 0 ? RULES.pageH - 60 : 150;
      handText(ctx, "last stand!", RULES.margin - 8, y, 30, pen, { rot: -Math.PI / 2, align: "center", upTo: p, alpha: 0.9 });
      // each survivor circled where he dug in
      (m.at ?? []).forEach((q, j) => inkCircle(ctx, q.x, q.y, dot * 2.3, pen, m.seed + j * 13, 1.6, 1, Math.min(1, p * 1.6 - j * 0.1)));
    } else if (m.kind === "moved") {
      // the old dot stays; the little cross comes after the move
      inkDot(ctx, m.x, m.y, dot, pen, m.seed);
      inkCross(ctx, m.x, m.y, dot * 1.2, pen, m.seed, 1.6, 0.7, p);
    } else if (m.kind === "kill") inkCross(ctx, m.x, m.y, dot * 2, pen, m.seed, 2.6, 1, p);
    else if (m.kind === "wound") inkCross(ctx, m.x, m.y, dot * 2, pen, m.seed, 2.6, 1, p * 0.5); // one stroke of a cross
    else inkCross(ctx, m.x, m.y, dot * 1.6, pen, m.seed, 2, 1, p);
  });
}

function drawSoldiers(ctx: CanvasRenderingContext2D, s: GameState, o: Overlay, ink: Ink, live: boolean) {
  const dot = s.rules.soldierRadius;
  // the fallen whose cross is still coming keep their full dot until it lands
  const crossing = new Map<string, string>();
  if (ink.live.size) s.marks.forEach((m, i) => {
    if (m.t === "cross" && m.kind === "kill" && ink.live.has(`m${i}`)) crossing.set(`${m.x},${m.y}`, `m${i}`);
  });
  for (const x of s.soldiers) {
    const jot = `d${x.id}`;
    const cross = x.alive ? undefined : crossing.get(`${x.x},${x.y}`);
    const moving = o.mover?.id === x.id;
    if ((ink.live.has(jot) || !!cross || moving) !== live) continue;
    const p = moving ? o.mover!.at : x;
    if (x.transit !== undefined && !moving) continue; // on the road: off the page until they arrive
    const fallen = !x.alive && !(cross && ink.p(cross) <= 0);
    // the dead keep their dot; the cross is in the marks
    inkDot(ctx, p.x, p.y, dot * (inLastStand(s, x.owner) ? s.rules.lastStand!.grow : 1), INK.pens[x.owner], x.id * 131 + 7, fallen ? 0.8 : 1, live ? ink.p(jot) : 1);
  }
}

function drawAim(ctx: CanvasRenderingContext2D, s: GameState, a: NonNullable<Overlay["aim"]>, px: number) {
  const me = s.soldiers[a.soldierId];
  const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
  // pencil guide: only the first stretch of the line, so you still have to judge it
  const show = Math.min(a.reach, 90 + a.reach * 0.22);
  const tip = { x: me.x + dx * show, y: me.y + dy * show };
  if (a.power > 0) {
    // the uncertainty cone, faint
    ctx.fillStyle = "rgba(70,68,66,0.08)";
    ctx.beginPath();
    ctx.moveTo(me.x, me.y);
    ctx.arc(me.x, me.y, show, a.angle - a.spread, a.angle + a.spread);
    ctx.closePath();
    ctx.fill();
    pencilLine(ctx, me, tip, 2.2 * Math.max(0.7, px), 3);
  }
  drawPen(ctx, me.x, me.y, a.angle, a.power, INK.pens[me.owner], 1);
}

// A note in pencil, the way a friend would scribble how-to on your page.
function drawTeach(ctx: CanvasRenderingContext2D, t: NonNullable<Overlay["teach"]>) {
  const { at, p } = t;
  if (t.kind === "place") {
    handText(ctx, "tap anywhere to draw a base", at.x, at.y, 44, INK.pencil, { upTo: p * 1.4, alpha: 0.9, weight: 400, rot: -0.03, align: "center" });
    return;
  }
  // the arrow shows the gesture: drag back from the soldier...
  const side = at.x > RULES.pageW * 0.62 ? -1 : 1;
  const from = { x: at.x + side * 14, y: at.y + 22 }, to = { x: at.x + side * 34, y: at.y + 118 };
  pencilArrow(ctx, from, to, 0.18 * side, 77, 2.2, Math.min(1, p * 1.6), 0.9);
  const tx = at.x + side * 52;
  handText(ctx, "pull back,", tx, at.y + 108, 34, INK.pencil, { upTo: p * 2 - 0.5, alpha: 0.9, weight: 400, rot: -0.05, align: side > 0 ? "left" : "right" });
  handText(ctx, "then let go", tx + side * 10, at.y + 142, 34, INK.pencil, { upTo: p * 2 - 1, alpha: 0.9, weight: 400, rot: -0.05, align: side > 0 ? "left" : "right" });
}
