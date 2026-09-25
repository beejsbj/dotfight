// Camera and page rendering. The page is redrawn from state every frame it
// changes; marks are seeded so it looks the same every time.

import { type GameState, type Player, type Pt } from "./game";
import { INK, drawPen, inkCircle, inkCross, inkDot, inkFlick, paperGrain, pencilLine } from "./ink";
import { RULES } from "./rules";

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
  ghost?: { x: number; y: number; ok: boolean }; // base placement preview
  ink?: Ink;
  mover?: { id: number; at: Pt }; // a moving soldier rides the head of its own ink
  pen?: Pen; // the pen after release: riding the ink, then lifting away
}

const SETTLED: Ink = { p: () => 1, live: new Set() };
let grain: HTMLCanvasElement | null = null;

export function worldTransform(ctx: CanvasRenderingContext2D, cam: Camera, dpr: number) {
  ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cam.cx - cam.x * cam.z), dpr * (cam.cy - cam.y * cam.z));
}

export function render(ctx: CanvasRenderingContext2D, cam: Camera, s: GameState, o: Overlay, W: number, H: number, dpr: number) {
  const ink = o.ink ?? SETTLED;
  drawSettled(ctx, cam, s, o, ink, W, H, dpr);
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
  drawPaper(ctx);
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
  if (o.selected !== undefined && !o.aim && !o.pen) {
    const x = s.soldiers[o.selected];
    pencilRing(ctx, x.x, x.y, RULES.soldierRadius + 9, 1.6);
  }
  if (o.ghost) {
    ctx.globalAlpha = o.ghost.ok ? 0.8 : 0.45;
    pencilRing(ctx, o.ghost.x, o.ghost.y, RULES.baseRadius, o.ghost.ok ? 2 : 1.4, !o.ghost.ok);
    ctx.globalAlpha = 1;
  }
  if (o.aim) drawAim(ctx, s, o.aim, px);
  if (o.pen) drawPen(ctx, o.pen.x, o.pen.y, o.pen.angle, o.pen.pull, INK.pens[o.pen.owner], 1, o.pen.lift);
}

function pencilRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, dashed = true) {
  const n = Math.max(12, Math.round(r / 3));
  for (let i = 0; i < n; i++) {
    if (dashed && i % 2) continue;
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    pencilLine(ctx, { x: x + Math.cos(a0) * r, y: y + Math.sin(a0) * r }, { x: x + Math.cos(a1) * r, y: y + Math.sin(a1) * r }, w, i, false);
  }
}

function drawPaper(ctx: CanvasRenderingContext2D) {
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
}

// live=false draws the settled marks, live=true only the ones being drawn.
function drawMarks(ctx: CanvasRenderingContext2D, s: GameState, ink: Ink, live: boolean) {
  for (const b of s.bases) {
    const k = `b${b.id}`;
    if (ink.live.has(k) !== live) continue;
    inkCircle(ctx, b.x, b.y, b.r, INK.pens[b.owner], b.seed, 2.6, 2, live ? ink.p(k) : 1);
  }
  s.marks.forEach((m, i) => {
    const k = `m${i}`;
    if (ink.live.has(k) !== live) return;
    const p = live ? ink.p(k) : 1;
    const pen = INK.pens[m.owner];
    if (m.t === "stroke") inkFlick(ctx, m.pts, pen, m.seed, RULES.inkWidth, p);
    else if (m.kind === "moved") {
      // the old dot stays; the little cross comes after the move
      inkDot(ctx, m.x, m.y, RULES.soldierRadius, pen, m.seed);
      inkCross(ctx, m.x, m.y, RULES.soldierRadius * 1.2, pen, m.seed, 1.6, 0.7, p);
    } else if (m.kind === "kill") inkCross(ctx, m.x, m.y, RULES.soldierRadius * 2, pen, m.seed, 2.6, 1, p);
    else inkCross(ctx, m.x, m.y, RULES.soldierRadius * 1.6, pen, m.seed, 2, 1, p);
  });
}

function drawSoldiers(ctx: CanvasRenderingContext2D, s: GameState, o: Overlay, ink: Ink, live: boolean) {
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
    const fallen = !x.alive && !(cross && ink.p(cross) <= 0);
    // the dead keep their dot; the cross is in the marks
    inkDot(ctx, p.x, p.y, RULES.soldierRadius, INK.pens[x.owner], x.id * 131 + 7, fallen ? 0.8 : 1, live ? ink.p(jot) : 1);
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
