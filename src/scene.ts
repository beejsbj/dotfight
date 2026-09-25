// One frame of the desk. The stage canvas draws the desk plane flat (CSS tilts
// it); the overlay canvas, untilted, carries the things that stand up off the
// page: the pen.

import type { GameState, Pt } from "./game";
import { INK, handText, inkFlick, pencilArrow, pencilLine, pencilLoop } from "./ink";
import { farColour, lightAt, lightGradient, type Lamp } from "./light";
import { drawBase, drawDot, drawMark, drawSignature, pendingKills, PageLayer, SETTLED, type Ink, type Signature } from "./page";
import { drawPen, drawPenShadow, type PenPose } from "./pen";
import type { View } from "./projection";
import { RULES } from "./rules";
import { SHADOW_PAD, sheetShadow, woodTexture } from "./textures";

type Ctx = CanvasRenderingContext2D;

export interface Aim {
  soldierId: number;
  angle: number;
  power: number;
  spread: number;
  reach: number;
  kind: "shoot" | "move";
}

export interface Frame {
  s: GameState;
  view: View;
  lamp: Lamp;
  ink: Ink;
  /** Stage canvas size in css px, and its pixel ratio. */
  cw: number;
  ch: number;
  dpr: number;
  selected?: number;
  aim?: Aim;
  ghost?: { x: number; y: number; ok: boolean; owner: 0 | 1 };
  /** Setup: the no-go rings round enemy bases, faintly hatched. */
  keepOut?: { x: number; y: number; r: number }[];
  mover?: { id: number; at: Pt };
  pen?: PenPose;
  hint?: { p: number; bases: { id: number; x: number; y: number; r: number }[] };
  teach?: { kind: "aim" | "place"; at: Pt; p: number; rot: number };
  sig?: Signature;
  /** Page yellowing, 0..1. */
  age: number;
}

let wood: CanvasPattern | null = null;
let woodImg: HTMLCanvasElement | null = null;
let shadow: HTMLCanvasElement | null = null;

export const page = new PageLayer();
/** Dev switches for profiling layers. */
export const dbg = { wood: true, light: true, page: true, shadow: true, live: true, sheen: true, fade: true, hq: true };
export const pageState = { epoch: 0, S: 1.6 };

export function worldTransform(g: Ctx, v: View, dpr: number) {
  const c = Math.cos(v.rot) * v.z, s = Math.sin(v.rot) * v.z;
  const lx = v.px + v.ox, ly = v.py + v.oy;
  g.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * (lx - (c * v.x - s * v.y)), dpr * (ly - (s * v.x + c * v.y)));
}

// The lit desk is composited once and reused while nothing under the light
// changes: aiming, waiting and the bot's thinking then cost one image copy
// plus the pencil and the pen. Only a moving camera (or lamp, or ink being
// drawn on) pays for the full stack.
const lit = { c: null as HTMLCanvasElement | null, key: "" };
export const stageStats = { full: 0, cached: 0 };

export function renderStage(g: Ctx, f: Frame, still: boolean) {
  const { view: v, lamp, dpr, s } = f;
  const ink = f.ink ?? SETTLED;
  const grew = page.sync(s, ink, pageState.S, pageState.epoch, f.sig);
  const W = g.canvas.width, H = g.canvas.height;
  const canCache = still && !ink.live.size && !f.mover;
  if (canCache) {
    const alive = s.soldiers.reduce((a, x) => a + (x.alive ? x.x * 3 + x.y : 0), 0);
    const key = [v.x, v.y, v.z, v.rot, v.tilt, v.px, v.py, lamp.x, lamp.y, lamp.h, lamp.on, lamp.dawn, f.age, s.marks.length, s.bases.length, alive, page.isSigned, pageState.epoch, W, H].join("|");
    if (!lit.c) lit.c = document.createElement("canvas");
    if (lit.c.width !== W || lit.c.height !== H) { lit.c.width = W; lit.c.height = H; lit.key = ""; }
    if (lit.key !== key || grew) {
      drawLitDesk(lit.c.getContext("2d")!, f, ink);
      lit.key = key;
      stageStats.full++;
    } else stageStats.cached++;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(lit.c, 0, 0);
  } else {
    lit.key = "";
    drawLitDesk(g, f, ink);
    stageStats.full++;
  }
  worldTransform(g, v, dpr);
  drawGuides(g, f);
  if (f.pen) {
    g.globalCompositeOperation = "multiply";
    drawPenShadow(g, f.pen, lamp);
    g.globalCompositeOperation = "source-over";
  }
  // fresh ink still wet: it catches the lamp
  if (dbg.sheen) drawSheen(g, f);
}

function drawLitDesk(g: Ctx, f: Frame, ink: Ink) {
  const { view: v, lamp, dpr } = f;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  worldTransform(g, v, dpr);
  const { pageW: pw, pageH: ph } = RULES;
  const BIG = 4000;

  // the desk and the sheet's shadow, only where the sheet isn't
  g.save();
  g.beginPath();
  g.rect(-BIG, -BIG, pw + BIG * 2, ph + BIG * 2);
  g.rect(0, 0, pw, ph);
  g.clip("evenodd");
  woodImg ??= woodTexture();
  wood ??= g.createPattern(woodImg, "repeat");
  if (wood && dbg.wood) {
    wood.setTransform(new DOMMatrix().scale(1.5));
    g.fillStyle = wood;
  } else g.fillStyle = "#4a3426";
  g.fillRect(-BIG, -BIG, pw + BIG * 2, ph + BIG * 2);
  if (dbg.shadow) {
    shadow ??= sheetShadow(pw, ph);
    const away = Math.atan2(ph / 2 - lamp.y, pw / 2 - lamp.x);
    g.globalAlpha = 0.55;
    g.drawImage(shadow, -SHADOW_PAD + Math.cos(away) * 10, -SHADOW_PAD + Math.sin(away) * 10, pw + SHADOW_PAD * 2, ph + SHADOW_PAD * 2);
    g.globalAlpha = 1;
  }
  g.restore();

  // the page, and everything dry on it
  g.imageSmoothingQuality = dbg.hq ? "high" : "low";
  if (dbg.page) g.drawImage(page.c!, 0, 0, pw, ph);

  // the paper yellows as the war goes on
  g.globalCompositeOperation = "multiply";
  if (f.age > 0) {
    g.fillStyle = `rgba(236, 214, 170, ${0.55 * f.age})`;
    g.fillRect(0, 0, pw, ph);
  }
  // living soldiers, and anything still being drawn on
  if (dbg.live) drawLive(g, f, ink);

  // the lamp
  g.fillStyle = lightGradient(g, lamp);
  if (dbg.light) g.fillRect(-BIG, -BIG, pw + BIG * 2, ph + BIG * 2);
  g.globalCompositeOperation = "source-over";

  // when the desk tilts away its far edges must melt into the dark
  if (v.tilt > 1e-3 && dbg.fade) edgeFade(g, f);
}

function drawLive(g: Ctx, f: Frame, ink: Ink) {
  const { s } = f;
  for (const b of s.bases) {
    const k = `b${b.id}`;
    if (!page.has(k) && ink.live.has(k)) drawBase(g, b, ink.p(k));
  }
  s.marks.forEach((m, i) => {
    const k = `m${i}`;
    if (!page.has(k) && ink.live.has(k)) drawMark(g, m, ink.p(k));
  });
  const pending = pendingKills(s, ink);
  for (const x of s.soldiers) {
    if (!x.alive && page.hasDead(x.id)) continue;
    const jot = `d${x.id}`;
    const moving = f.mover?.id === x.id;
    const cross = x.alive ? undefined : pending.get(`${x.x},${x.y}`);
    const fallen = !x.alive && !(cross && ink.p(cross) <= 0);
    drawDot(g, x, fallen ? 0.8 : 1, ink.live.has(jot) ? ink.p(jot) : 1, moving ? f.mover!.at : x);
  }
  if (f.sig && !page.isSigned && ink.live.has("sign")) drawSignature(g, f.sig, ink.p("sign"));
}

// Pencil: selection, aim, placement. Not ink yet, so it sits on top of the paper.
function drawGuides(g: Ctx, f: Frame) {
  const { s, view: v } = f;
  const px = 1 / v.z;
  if (f.keepOut) {
    for (const k of f.keepOut) pencilHatchRing(g, k.x, k.y, k.r, px);
  }
  if (f.hint) for (const b of f.hint.bases) pencilLoop(g, b.x, b.y, b.r + 12, 900 + b.id * 17, Math.max(1.6, px * 1.1), f.hint.p, 0.75);
  if (f.selected !== undefined && !f.aim && !f.mover) {
    const x = s.soldiers[f.selected];
    pencilLoop(g, x.x, x.y, RULES.soldierRadius + 10, 77 + x.id, Math.max(1.6, px), 1, 0.9);
  }
  if (f.ghost) {
    g.globalAlpha = f.ghost.ok ? 1 : 0.5;
    const r = RULES.baseRadius;
    for (let i = 0; i < 28; i++) {
      if (!f.ghost.ok && i % 2) continue;
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
      pencilLine(g, { x: f.ghost.x + Math.cos(a0) * r, y: f.ghost.y + Math.sin(a0) * r }, { x: f.ghost.x + Math.cos(a1) * r, y: f.ghost.y + Math.sin(a1) * r }, Math.max(2, px * 1.4), i, false);
    }
    g.globalAlpha = 1;
  }
  if (f.teach) drawTeach(g, f.teach);
  if (f.aim) drawAim(g, s, f.aim, px);
}

function pencilHatchRing(g: Ctx, x: number, y: number, r: number, px: number) {
  g.save();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = INK.pencil;
  g.globalAlpha = 0.28;
  g.lineWidth = Math.max(1.2, px);
  g.beginPath();
  for (let d = -r * 2; d < r * 2; d += 16) { g.moveTo(x + d - r, y - r); g.lineTo(x + d + r, y + r); }
  g.stroke();
  g.restore();
  g.globalAlpha = 0.5;
  pencilLoop(g, x, y, r, (x * 13 + y) | 0, Math.max(1.4, px), 1, 0.8);
  g.globalAlpha = 1;
}

function drawAim(g: Ctx, s: GameState, a: Aim, px: number) {
  const me = s.soldiers[a.soldierId];
  const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
  // only the first stretch is pencilled in: you still have to judge the rest
  const show = a.kind === "move" ? a.reach * 0.55 : Math.min(a.reach, 110 + a.reach * 0.2);
  if (a.power <= 0) return;
  // the cone of doubt, faint graphite
  g.fillStyle = "rgba(60,58,56,0.09)";
  g.beginPath();
  g.moveTo(me.x, me.y);
  g.arc(me.x, me.y, show, a.angle - a.spread, a.angle + a.spread);
  g.closePath();
  g.fill();
  pencilLine(g, me, { x: me.x + dx * show, y: me.y + dy * show }, Math.max(2.2, 1.6 * px), 3);
  // power, as ticks along the guide: each is a notch you can feel
  const notches = Math.floor(a.power * 5 + 1e-6);
  for (let i = 1; i <= notches; i++) {
    const t = (show * i) / 5.5;
    const cx = me.x + dx * t, cy = me.y + dy * t;
    pencilLine(g, { x: cx - dy * 7, y: cy + dx * 7 }, { x: cx + dy * 7, y: cy - dx * 7 }, Math.max(1.8, 1.3 * px), 40 + i, false);
  }
}

function drawTeach(g: Ctx, t: NonNullable<Frame["teach"]>) {
  const { at, p } = t;
  g.save();
  g.translate(at.x, at.y);
  g.rotate(-t.rot);
  const pencil = "rgba(52, 50, 48, 0.85)";
  if (t.kind === "place") {
    handText(g, "touch the page to draw a camp", 0, 0, 46, pencil, { upTo: p * 1.3, weight: 400, rot: -0.03, align: "center" });
    handText(g, "(ten men in each)", 0, 46, 36, pencil, { upTo: p * 1.3 - 0.4, weight: 400, rot: -0.03, align: "center" });
  } else {
    pencilArrow(g, { x: 18, y: 26 }, { x: 44, y: 150 }, 0.2, 77, 2.4, Math.min(1, p * 1.6), 0.9);
    handText(g, "pull back from anywhere,", 64, 128, 38, pencil, { upTo: p * 2 - 0.5, weight: 400, rot: -0.05 });
    handText(g, "then let go", 76, 168, 38, pencil, { upTo: p * 2 - 1, weight: 400, rot: -0.05 });
  }
  g.restore();
}

// Wet ballpoint is glossy for a while: a thin bright line on the lamp side.
function drawSheen(g: Ctx, f: Frame) {
  const { s, lamp } = f;
  if (lamp.on <= 0) return;
  g.globalCompositeOperation = "screen";
  g.lineCap = "round";
  const last = s.phase === "over" ? s.turn : s.turn - 1;
  for (let i = s.marks.length - 1; i >= 0; i--) {
    const m = s.marks[i];
    const age = last - m.turn;
    if (age > 1) break;
    const wet = (age <= 0 ? 1 : 0.4) * (1 - lamp.dawn * 0.7);
    const k = `m${i}`;
    const p = f.ink.live.has(k) ? f.ink.p(k) : 1;
    if (p <= 0) continue;
    if (m.t === "stroke") {
      const pts = m.pts;
      const mid = pts[pts.length >> 1];
      const lit = lightAt(lamp, mid.x, mid.y);
      const ox = lamp.x - mid.x, oy = lamp.y - mid.y, ol = Math.hypot(ox, oy) || 1;
      const off = 0.9;
      const shifted = pts.map((q) => ({ x: q.x + (ox / ol) * off, y: q.y + (oy / ol) * off }));
      inkFlick(g, shifted, `rgb(255, 246, 225)`, m.seed, RULES.inkWidth * 0.32, p, 0.5 * wet * lit);
    } else if (m.kind === "kill") {
      const lit = lightAt(lamp, m.x, m.y);
      g.globalAlpha = 0.35 * wet * lit * Math.min(1, p * 2);
      g.fillStyle = "rgb(255, 246, 225)";
      g.beginPath();
      g.arc(m.x - 2, m.y - 2, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

function edgeFade(g: Ctx, f: Frame) {
  const { cw, ch, dpr } = f;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = farColour(f.lamp);
  const clear = col.replace(/,[^,]*\)$/, ",0)");
  const fade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, col);
    gr.addColorStop(1, clear);
    g.fillStyle = gr;
    g.fillRect(rx, ry, rw, rh);
  };
  const ex = cw * 0.1, ey = ch * 0.16;
  fade(0, 0, 0, ey, 0, 0, cw, ey);
  fade(0, ch, 0, ch - ey * 0.4, 0, ch - ey * 0.4, cw, ey * 0.4);
  fade(0, 0, ex, 0, 0, 0, ex, ch);
  fade(cw, 0, cw - ex, 0, cw - ex, 0, ex, ch);
}

// --- overlay: the standing pen -------------------------------------------------

let overlayInked = true;
export function renderOverlay(g: Ctx, f: Frame, W: number, H: number, dpr: number) {
  if (!f.pen && !overlayInked) return; // nothing standing, nothing to clear
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  overlayInked = !!f.pen;
  if (!f.pen) return;
  drawPen(g, f.pen, f.view);
  // the pen stands in the same light as everything else
  const lit = lightAt(f.lamp, f.pen.x, f.pen.y);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = `rgba(22, 15, 10, ${Math.min(0.85, (1 - lit) * 0.9)})`;
  g.fillRect(0, 0, W, H);
  g.fillStyle = `rgba(255, 196, 120, ${0.1 * f.lamp.on * (1 - f.lamp.dawn)})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
}
