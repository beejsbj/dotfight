// One frame of the desk, built from layers the GPU carries.
//
// The desk and the page are canvases drawn in page space. They're never
// redrawn when the camera moves: one CSS matrix3d per layer puts them on
// screen at any zoom, turn or tilt, and the compositor does the rest. What
// is still moving (ink being drawn, a soldier riding his line, pencil guides,
// the pen's shadow) is drawn on a small live layer multiplied over the page.
// What is alive boils on a small page-space layer of its own (boil.ts), placed
// the same way and redrawn only when its boil frame ticks.
// Light and fog are two tiny canvases stretched over the screen. The standing
// pen lives on the untilted overlay. A camera move therefore costs a few
// style writes and a couple of hundred pixels of gradient, not a repaint.

import { BoilLayer, planBoil, type Plan } from "./boil";
import type { Pt } from "./game";
import type { AnyState as GameState } from "./record";
import { INK, handText, lead, pencilArrow, pencilLine, pencilLoop } from "./ink";
import { lightAt, paintHaze, paintLight, type Lamp } from "./light";
import { drawBase, drawDot, drawMark, drawSignature, PageLayer, SETTLED, yellowing, ageOf, type Ink, type Signature } from "./page";
import { drawPen, drawPenShadow, PEN, type PenPose } from "./pen";
import { cssMatrix, layerMatrix, project, stageCss, toLocal, unproject, type View } from "./projection";
import { RULES } from "./rules";
import { DESK, deskTexture } from "./textures";
import { theme } from "./theme";

type Ctx = CanvasRenderingContext2D;

export interface Aim {
  soldierId: number;
  angle: number;
  power: number;
  spread: number;
  reach: number;
  kind: "snipe" | "lunge";
  /** Pen falcon: a sight at the end of the guide, drawn closed as the hand holds still (0..1). */
  sight?: number;
  /** How far out the sight sits (page units), kept on screen. */
  sightAt?: number;
}

export interface Frame {
  s: GameState;
  view: View;
  lamp: Lamp;
  ink: Ink;
  /** How far the camera has leaned in to aim, 0..1: brings up the fog. */
  lean: number;
  /** Screen width (css px); live canvas size in css px; the pixel ratio canvases use. */
  sw: number;
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
  /** Convoys walking (the time-lapse between turns): each soldier from where he stood to where he'll stand. */
  walkers?: { id: number; from: Pt; to: Pt; p: number }[];
  /** Positioning: how far each of your bases' soldiers may stand, in pencil. */
  zones?: { x: number; y: number; r: number }[];
  /** Positioning: the soldier under your finger. */
  drag?: { id: number; at: Pt; ok: boolean };
  /** A send being drawn, base to base, in pencil. */
  sendArrow?: { from: Pt; to: Pt; ok: boolean };
  /** Sends ordered this turn: the road in pencil, the ones going ringed. */
  orders?: { a: Pt; b: Pt; at: Pt[] }[];
  /** Aiming a lunge: enemy bases with men at home, where he'd be shot if he landed. */
  danger?: { x: number; y: number; r: number }[];
  /** Pencilled help on the page; "note" writes `text` (a room waiting on the other side). */
  teach?: { kind: "aim" | "place" | "arrange" | "note"; at: Pt; p: number; rot: number; note?: string; text?: string };
  sig?: Signature;
  /** The line boil: whether the living boil at all, wall time (ms) for its frame, and how bold (boil.ts boldAt). */
  boil?: { on: boolean; ms: number; bold: number };
}

export const page = new PageLayer();
export const pageState = { epoch: 0, S: 1.6 };
export const stageStats = { live: 0, air: 0, frames: 0, boil: 0 };
export const boil = new BoilLayer();

export interface Els {
  desk: HTMLCanvasElement;
  pageHost: HTMLElement;
  boilHost: HTMLElement;
  live: HTMLCanvasElement;
  light: HTMLCanvasElement;
  haze: HTMLCanvasElement;
}

export function worldTransform(ctx: Ctx, v: View, dpr: number) {
  const c = Math.cos(v.rot) * v.z, s = Math.sin(v.rot) * v.z;
  const lx = v.px + v.ox, ly = v.py + v.oy;
  ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * (lx - (c * v.x - s * v.y)), dpr * (ly - (s * v.x + c * v.y)));
}

// A world-space bounding box, grown as the live layer draws, so the next
// frame clears only what was drawn instead of the whole canvas.
class Box {
  x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
  add(x: number, y: number, r = 0) {
    this.x0 = Math.min(this.x0, x - r); this.y0 = Math.min(this.y0, y - r);
    this.x1 = Math.max(this.x1, x + r); this.y1 = Math.max(this.y1, y + r);
  }
  get empty() { return this.x0 > this.x1; }
}

let lastCss = { desk: "", page: "", live: "", boil: ["", ""] };
let liveDirty: { x: number; y: number; w: number; h: number } | null = null;
let airKey = "";
let deskTheme = ""; // the theme the desk canvas was painted for

/** Put the page-space layers where the camera says. Style writes only. */
function place(els: Els, f: Frame) {
  const v = f.view;
  if (deskTheme !== theme.id) {
    const d = deskTexture(RULES.pageW, RULES.pageH);
    els.desk.width = d.width; els.desk.height = d.height;
    els.desk.getContext("2d")!.drawImage(d, 0, 0);
    els.desk.style.width = `${d.width}px`; els.desk.style.height = `${d.height}px`;
    deskTheme = theme.id;
  }
  const dm = cssMatrix(layerMatrix(v, DESK.S, -DESK.pad, -DESK.pad));
  if (dm !== lastCss.desk) { els.desk.style.transform = dm; lastCss.desk = dm; }
  const c = page.c!;
  if (c.parentElement !== els.pageHost) { els.pageHost.replaceChildren(c); lastCss.page = ""; }
  const w = `${c.width}px`, h = `${c.height}px`;
  if (c.style.width !== w) { c.style.width = w; c.style.height = h; }
  const pm = cssMatrix(layerMatrix(v, page.S));
  if (pm !== lastCss.page) { c.style.transform = pm; lastCss.page = pm; }
  const cs = boil.parts.map((p) => p.c);
  if (cs.some((c, i) => els.boilHost.children[i] !== c)) { els.boilHost.replaceChildren(...cs); lastCss.boil = ["", ""]; }
  boil.parts.forEach((p, i) => {
    const b = p.c;
    const bv = p.empty ? "hidden" : "";
    if (b.style.visibility !== bv) b.style.visibility = bv;
    if (p.empty) return;
    const bw = `${b.width}px`, bh = `${b.height}px`;
    if (b.style.width !== bw || b.style.height !== bh) { b.style.width = bw; b.style.height = bh; }
    const bm = cssMatrix(layerMatrix(v, page.S, p.ox, p.oy));
    if (bm !== lastCss.boil[i]) { b.style.transform = bm; lastCss.boil[i] = bm; }
  });
  const lc = stageCss(v);
  const lk = lc.transform + lc.origin;
  if (lk !== lastCss.live) { els.live.style.transform = lc.transform; els.live.style.transformOrigin = lc.origin; lastCss.live = lk; }
}

export function renderStage(els: Els, f: Frame) {
  const { s, dpr } = f;
  const ink = f.ink ?? SETTLED;
  const plan = boilPlan(f, ink);
  page.sync(s, ink, pageState.S, pageState.epoch, f.sig, plan.hold);
  boil.set(plan, s, pageState.S);
  place(els, f);
  seen = onScreen(f);
  bold = f.boil?.bold ?? 0;
  if (boil.draw(f.boil?.ms ?? 0, bold, seen)) stageStats.boil++;
  renderLive(els.live.getContext("2d")!, els.live, f, ink, dpr);
  renderAir(els, f);
  stageStats.frames++;
}

// The boil plan only changes when the page or the ink does: most frames reuse it.
let planMemo: { s: GameState | null; stamp: string; plan: Plan | null } = { s: null, stamp: "", plan: null };
function boilPlan(f: Frame, ink: Ink): Plan {
  const { s } = f;
  const on = !!f.boil?.on && !boil.tooDear;
  let stamp = `${s.v === 1 ? s.flicks.length : s.actions.length}|${s.marks.length}|${s.bases.length}|${s.soldiers.length}|${s.turn}|${f.mover?.id}|${on}|`;
  for (const k of ink.live) stamp += k + (ink.p(k) > 0 ? "+" : "-");
  if (planMemo.s !== s || planMemo.stamp !== stamp || !planMemo.plan) planMemo = { s, stamp, plan: planBoil(s, ink, { on, moving: f.mover?.id }) };
  return planMemo.plan!;
}

// The part of the page on screen (page units, padded), so the boil leaves
// what you can't see alone. None if the view reaches the horizon.
let seen: { x0: number; y0: number; x1: number; y1: number } | undefined;
/** How bold the boil is drawn, by how far away the camera stands (boil.ts boldAt), as of the last render. */
let bold = 0;
function onScreen(f: Frame) {
  const pts = [[0, 0], [f.sw, 0], [0, f.ch], [f.sw, f.ch]].map(([x, y]) => unproject(f.view, x, y));
  if (pts.some((p) => !p)) return undefined;
  const xs = pts.map((p) => p!.x), ys = pts.map((p) => p!.y), pad = 40;
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

/**
 * Dev check: forget every layer's dirty rectangles, so the next render draws
 * each whole. An incremental frame must match that full redraw (pft.redrawCheck).
 */
/** Dev: the part of the page the boil keeps up to date (page units), or undefined for all of it. Off it, a thing keeps its last look until it's seen. */
export const boilSeen = () => seen;

export function forgetDrawn() {
  liveDirty = { x: 0, y: 0, w: 1e6, h: 1e6 };
  inked = { x: 0, y: 0, w: 1e6, h: 1e6 };
  boil.redrawAll();
}

/** Between rendered frames: redraw the boil if its frame has ticked. Returns whether it did. */
export function boilTick(ms: number) {
  if (boil.empty || !boil.draw(ms, bold, seen)) return false;
  stageStats.boil++;
  return true;
}

// --- the live layer: only what is still being drawn ---------------------------

function renderLive(g: Ctx, el: HTMLCanvasElement, f: Frame, ink: Ink, dpr: number) {
  const { s, view: v } = f;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (liveDirty) g.clearRect(liveDirty.x, liveDirty.y, liveDirty.w, liveDirty.h);
  const box = new Box();
  worldTransform(g, v, dpr);
  g.globalCompositeOperation = "source-over";
  // ink still going on: camps being circled, dots being jotted, the flick, its crosses
  for (const b of s.bases) {
    const k = `b${b.id}`;
    if (!page.has(k) && ink.live.has(k)) { drawBase(g, b, ink.p(k)); box.add(b.x, b.y, b.r + 8); }
  }
  s.marks.forEach((m, i) => {
    const k = `m${i}`;
    if (page.has(k) || !ink.live.has(k)) return;
    drawMark(g, m, ink.p(k));
    if (m.t === "stroke") for (const p of m.pts) box.add(p.x, p.y, 8);
    else if (m.t === "walk") { box.add(m.a.x, m.a.y, 10); box.add(m.b.x, m.b.y, 10); }
    else if (m.t === "stand") for (const p of m.at) box.add(p.x, p.y, 24);
    else box.add(m.x, m.y, 20);
  });
  const walking = new Set(f.walkers?.map((w) => w.id));
  for (const x of s.soldiers) {
    const jot = `d${x.id}`;
    if (ink.live.has(jot) && !walking.has(x.id) && f.drag?.id !== x.id) { drawDot(g, x, 1, ink.p(jot)); box.add(x.x, x.y, 12); }
  }
  if (f.mover) { drawDot(g, s.soldiers[f.mover.id], 1, 1, f.mover.at); box.add(f.mover.at.x, f.mover.at.y, 12); }
  for (const w of f.walkers ?? []) {
    if (w.p <= 0) continue; // held: still standing where the page shows him
    const e = w.p * w.p * (3 - 2 * w.p);
    const at = { x: w.from.x + (w.to.x - w.from.x) * e, y: w.from.y + (w.to.y - w.from.y) * e };
    // a little bob as he marches
    at.y -= Math.abs(Math.sin(w.p * Math.PI * 7)) * 2.5 * (1 - w.p);
    drawDot(g, s.soldiers[w.id], 1, 1, at);
    box.add(at.x, at.y, 12);
  }
  if (f.drag) { drawDot(g, s.soldiers[f.drag.id], f.drag.ok ? 1 : 0.45, 1, f.drag.at); box.add(f.drag.at.x, f.drag.at.y, 14); }
  if (f.sig && !page.isSigned && ink.live.has("sign")) {
    drawSignature(g, f.sig, ink.p("sign"));
    box.add(0, RULES.pageH - 110); box.add(RULES.pageW, RULES.pageH);
  }
  drawGuides(g, f, box);
  if (f.pen) {
    drawPenShadow(g, f.pen, f.lamp);
    const c = shadowEnds(f.pen, f.lamp);
    box.add(c[0].x, c[0].y, PEN.R * 4); box.add(c[1].x, c[1].y, PEN.R * 6);
  }
  if (box.empty) {
    liveDirty = null;
    if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
    return;
  }
  if (el.style.visibility === "hidden") el.style.visibility = "";
  stageStats.live++;
  // the drawn box, in canvas pixels, for next frame's clear
  const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].map(([x, y]) => toLocal(v, x, y));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) * dpr) - 4), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) * dpr) - 4);
  const x1 = Math.min(el.width, Math.ceil(Math.max(...pts.map((p) => p.x)) * dpr) + 4), y1 = Math.min(el.height, Math.ceil(Math.max(...pts.map((p) => p.y)) * dpr) + 4);
  liveDirty = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function shadowEnds(p: PenPose, lamp: Lamp) {
  const cast = (q: { x: number; y: number; h: number }) => {
    const k = lamp.h / Math.max(lamp.h * 0.08, lamp.h - q.h);
    return { x: lamp.x + (q.x - lamp.x) * k, y: lamp.y + (q.y - lamp.y) * k };
  };
  return [cast({ x: p.x, y: p.y, h: p.h }), cast({ x: p.x + p.ax * PEN.L, y: p.y + p.ay * PEN.L, h: p.h + p.az * PEN.L })];
}

// --- light and fog: tiny canvases, stretched ------------------------------------

function renderAir(els: Els, f: Frame) {
  const { view: v, lamp, lean } = f;
  const age = ageOf(f.s);
  const tip = f.pen ?? (f.selected !== undefined ? f.s.soldiers[f.selected] : undefined);
  const key = [theme.id, v.x, v.y, v.z, v.rot, v.tilt, v.px, v.py, lamp.on, lamp.dawn, age, lean, tip?.x, tip?.y].map((n) => (typeof n === "number" ? n.toFixed(3) : n)).join("|");
  if (key === airKey) return;
  airKey = key;
  stageStats.air++;
  const k = els.light.width / f.sw;
  paintLight(els.light.getContext("2d")!, els.light.width, els.light.height, k, lamp, v, yellowing(age));
  const hz = els.haze.getContext("2d")!;
  const visible = paintHaze(hz, els.haze.width, els.haze.height, k, v, lean, lamp.dawn, tip && lean > 0.02 ? project(v, tip.x, tip.y) : undefined);
  const vis = visible ? "" : "hidden";
  if (els.haze.style.visibility !== vis) els.haze.style.visibility = vis;
}

// Pencil: selection, aim, placement. Not ink yet, so it sits on top of the paper.
function drawGuides(g: Ctx, f: Frame, box: Box) {
  const { s, view: v } = f;
  const px = 1 / v.z;
  for (const z of f.zones ?? []) {
    // dashed pencil: how far out his men may stand
    const n = 36;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      pencilLine(g, { x: z.x + Math.cos(a0) * z.r, y: z.y + Math.sin(a0) * z.r }, { x: z.x + Math.cos(a1) * z.r, y: z.y + Math.sin(a1) * z.r }, Math.max(1.4, px), 300 + i, false);
    }
    box.add(z.x, z.y, z.r + 6);
  }
  for (const d of f.danger ?? []) { pencilHatchRing(g, d.x, d.y, d.r, px); box.add(d.x, d.y, d.r + 6); }
  for (const o of f.orders ?? []) {
    pencilArrow(g, o.a, o.b, 0.08, 611, Math.max(1.8, px * 1.2), 1, 0.85);
    for (const q of o.at) pencilLoop(g, q.x, q.y, RULES.soldierRadius + 7, 71 + Math.round(q.x), Math.max(1.4, px), 1, 0.8);
    box.add(o.a.x, o.a.y, 30); box.add(o.b.x, o.b.y, 30);
    for (const q of o.at) box.add(q.x, q.y, 20);
  }
  if (f.sendArrow) {
    g.globalAlpha = f.sendArrow.ok ? 1 : 0.45;
    pencilArrow(g, f.sendArrow.from, f.sendArrow.to, 0.08, 612, Math.max(2, px * 1.4), 1, 0.9);
    g.globalAlpha = 1;
    box.add(f.sendArrow.from.x, f.sendArrow.from.y, 30); box.add(f.sendArrow.to.x, f.sendArrow.to.y, 30);
  }
  if (f.keepOut) {
    for (const k of f.keepOut) { pencilHatchRing(g, k.x, k.y, k.r, px); box.add(k.x, k.y, k.r + 6); }
  }
  if (f.hint) for (const b of f.hint.bases) { pencilLoop(g, b.x, b.y, b.r + 12, 900 + b.id * 17, Math.max(1.6, px * 1.1), f.hint.p, 0.75); box.add(b.x, b.y, b.r + 24); }
  if (f.selected !== undefined && !f.aim && !f.mover) {
    const x = s.soldiers[f.selected];
    pencilLoop(g, x.x, x.y, RULES.soldierRadius + 10, 77 + x.id, Math.max(1.6, px), 1, 0.9);
    box.add(x.x, x.y, 30);
  }
  if (f.ghost) {
    box.add(f.ghost.x, f.ghost.y, RULES.baseRadius + 10);
    g.globalAlpha = f.ghost.ok ? 1 : 0.5;
    const r = RULES.baseRadius;
    for (let i = 0; i < 28; i++) {
      if (!f.ghost.ok && i % 2) continue;
      const a0 = (i / 28) * Math.PI * 2, a1 = ((i + 1) / 28) * Math.PI * 2;
      pencilLine(g, { x: f.ghost.x + Math.cos(a0) * r, y: f.ghost.y + Math.sin(a0) * r }, { x: f.ghost.x + Math.cos(a1) * r, y: f.ghost.y + Math.sin(a1) * r }, Math.max(2, px * 1.4), i, false);
    }
    g.globalAlpha = 1;
  }
  if (f.teach) { drawTeach(g, f.teach); box.add(f.teach.at.x, f.teach.at.y, 420); }
  if (f.aim) { drawAim(g, s, f.aim, px); box.add(s.soldiers[f.aim.soldierId].x, s.soldiers[f.aim.soldierId].y, aimShow(f.aim) + (f.aim.sight !== undefined ? 90 : 24)); }
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

const aimShow = (a: Aim) =>
  a.sight !== undefined ? a.sightAt ?? 560 // the pen falcon's sight: out past the standing pen, where you can see it
  : a.kind === "lunge" ? Math.min(a.reach * 0.55, 110 + a.reach * 0.3) : Math.min(a.reach, 110 + a.reach * 0.2);

function drawAim(g: Ctx, s: GameState, a: Aim, px: number) {
  const me = s.soldiers[a.soldierId];
  const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
  // only the first stretch is pencilled in: you still have to judge the rest
  const show = aimShow(a);
  if (a.power <= 0) return;
  // the cone of doubt, faint graphite
  g.fillStyle = lead(theme).cone;
  g.beginPath();
  g.moveTo(me.x, me.y);
  g.arc(me.x, me.y, show, a.angle - a.spread, a.angle + a.spread);
  g.closePath();
  g.fill();
  pencilLine(g, me, { x: me.x + dx * show, y: me.y + dy * show }, Math.max(2.2, 1.6 * px), 3);
  if (a.sight !== undefined) return drawSight(g, me.x + dx * show, me.y + dy * show, a.sight, px);
  // power, as ticks along the guide: each is a notch you can feel
  const notches = Math.floor(a.power * 5 + 1e-6);
  for (let i = 1; i <= notches; i++) {
    const t = (show * i) / 5.5;
    const cx = me.x + dx * t, cy = me.y + dy * t;
    pencilLine(g, { x: cx - dy * 7, y: cy + dx * 7 }, { x: cx + dy * 7, y: cy - dx * 7 }, Math.max(1.8, 1.3 * px), 40 + i, false);
  }
}

// A pencilled ring that closes while you hold the phone still, and gets its
// cross hairs once it has: then a flick of the wrist fires.
function drawSight(g: Ctx, x: number, y: number, armed: number, px: number) {
  const r = 48, w = Math.max(5, 3.2 * px);
  pencilLoop(g, x, y, r, 5, w * 0.7, 1, 0.3); // where it will close, sketched faintly
  pencilLoop(g, x, y, r, 5, w, 0.12 + 0.88 * armed, 1); // pressed in as the hand holds still
  if (armed < 1) return;
  pencilLoop(g, x, y, r - 3, 9, w * 0.8, 1, 0.8); // gone over twice: armed
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    pencilLine(g, { x: x + ux * (r - 16), y: y + uy * (r - 16) }, { x: x + ux * (r + 18), y: y + uy * (r + 18) }, w, 60 + ux * 3 + uy, false);
  }
}

function drawTeach(g: Ctx, t: NonNullable<Frame["teach"]>) {
  const { at, p } = t;
  g.save();
  g.translate(at.x, at.y);
  g.rotate(-t.rot);
  const pencil = lead(theme).note;
  if (t.kind === "note") {
    handText(g, t.text ?? "", 0, 0, 46, pencil, { upTo: p * 1.2, weight: 400, rot: -0.02, align: "center" });
  } else if (t.kind === "place") {
    handText(g, "touch the page to draw a camp", 0, 0, 46, pencil, { upTo: p * 1.6, weight: 400, rot: -0.03, align: "center" });
    handText(g, t.note ?? "(ten men in each)", 0, 46, 36, pencil, { upTo: p * 1.6 - 0.6, weight: 400, rot: -0.03, align: "center" });
  } else if (t.kind === "arrange") {
    handText(g, "drag your men where you want them", 0, 0, 40, pencil, { upTo: p * 1.6, weight: 400, rot: -0.03, align: "center" });
    handText(g, "(in camp, or just outside the wall)", 0, 42, 32, pencil, { upTo: p * 1.6 - 0.6, weight: 400, rot: -0.03, align: "center" });
  } else {
    // under the soldier, toward you: the way your thumb pulls
    pencilArrow(g, { x: 6, y: 34 }, { x: 14, y: 128 }, 0.12, 77, 2.4, Math.min(1, p * 1.6), 0.9);
    handText(g, "pull back from anywhere,", 0, 176, 32, pencil, { upTo: p * 2 - 0.5, weight: 400, rot: -0.03, align: "center" });
    handText(g, "then let go", 0, 210, 32, pencil, { upTo: p * 2 - 1, weight: 400, rot: -0.03, align: "center" });
  }
  g.restore();
}


// --- the overlay: things standing up off the page, and wet ink catching light ---

// Only the pen's (and the sheen's) own box is cleared and redrawn.
let inked: { x: number; y: number; w: number; h: number } | null = { x: 0, y: 0, w: 1e5, h: 1e5 };
export function renderOverlay(g: Ctx, f: Frame, W: number, H: number, dpr: number) {
  const sheen = sheenStrokes(f);
  if (!f.pen && !sheen.length && !inked) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (inked) g.clearRect(inked.x, inked.y, inked.w, inked.h);
  inked = null;
  const box = new Box();
  if (sheen.length) drawSheen(g, f, sheen, box);
  if (f.pen) {
    const pb = penBox(f.pen, f.view);
    box.add(pb.x0, pb.y0); box.add(pb.x1, pb.y1);
    drawPen(g, f.pen, f.view);
    // the guide runs past the pen's box: its dashes join the box, or they'd never be cleared
    if (f.aim && f.aim.power > 0) guideThroughBarrel(g, f, box);
    // the pen stands in the same light as everything else
    const lit = lightAt(f.lamp, f.pen.x, f.pen.y);
    g.save();
    g.beginPath();
    g.rect(pb.x0, pb.y0, pb.x1 - pb.x0, pb.y1 - pb.y0);
    g.clip();
    g.globalCompositeOperation = "source-atop";
    const { shade, warm } = theme.light;
    g.fillStyle = `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, ${Math.min(0.85, (1 - lit) * 0.9)})`;
    g.fillRect(0, 0, W, H);
    g.fillStyle = `rgba(${warm[0]}, ${warm[1]}, ${warm[2]}, ${warm[3] * f.lamp.on * (1 - f.lamp.dawn)})`;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  if (!box.empty) {
    const x0 = Math.max(0, Math.floor(box.x0) - 4), y0 = Math.max(0, Math.floor(box.y0) - 4);
    const x1 = Math.min(W, Math.ceil(box.x1) + 4), y1 = Math.min(H, Math.ceil(box.y1) + 4);
    if (x1 > x0 && y1 > y0) inked = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}

function penBox(p: PenPose, v: View) {
  const pts = [0, 0.5, 1].map((t) => project(v, p.x + p.ax * PEN.L * t, p.y + p.ay * PEN.L * t, p.h + p.az * PEN.L * t));
  const pad = Math.max(...pts.map((q) => q.k)) * PEN.R * 2.5 + 6;
  return {
    x0: Math.min(...pts.map((q) => q.x)) - pad, y0: Math.min(...pts.map((q) => q.y)) - pad,
    x1: Math.max(...pts.map((q) => q.x)) + pad, y1: Math.max(...pts.map((q) => q.y)) + pad,
  };
}

function guideThroughBarrel(g: Ctx, f: Frame, box: Box) {
  const a = f.aim!;
  const me = f.s.soldiers[a.soldierId];
  const show = aimShow(a);
  const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
  g.strokeStyle = lead(theme).guide;
  g.lineCap = "round";
  const step = 14;
  for (let d = 8; d < show; d += step * 1.8) {
    const p = project(f.view, me.x + dx * d, me.y + dy * d), q = project(f.view, me.x + dx * Math.min(show, d + step), me.y + dy * Math.min(show, d + step));
    g.lineWidth = Math.max(1.2, 2.2 * p.k);
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    box.add(p.x, p.y, g.lineWidth); box.add(q.x, q.y, g.lineWidth);
  }
}

// Wet ballpoint is glossy for a while: a thin bright line on the lamp side,
// for the last turn or two. Projected point by point, so it sits on the page
// whatever the camera does.
function sheenStrokes(f: Frame) {
  const { s, lamp } = f;
  const out: { i: number; wet: number }[] = [];
  if (lamp.on <= 0 || f.lean > 0.3 || theme.ink.gloss <= 0) return out;
  const last = s.phase === "over" ? s.turn : s.turn - 1;
  for (let i = s.marks.length - 1; i >= 0; i--) {
    const m = s.marks[i];
    const age = last - m.turn;
    if (age > 1) break;
    if (m.t === "stroke") out.push({ i, wet: (age <= 0 ? 1 : 0.4) * (1 - lamp.dawn * 0.7) * (1 - f.lean) });
  }
  return out;
}

function drawSheen(g: Ctx, f: Frame, list: { i: number; wet: number }[], box: Box) {
  const { s, lamp, view: v } = f;
  g.lineCap = "round";
  for (const { i, wet } of list) {
    const m = s.marks[i];
    if (m.t !== "stroke") continue;
    const k = `m${i}`;
    const p = f.ink.live.has(k) ? f.ink.p(k) : 1;
    if (p <= 0) continue;
    const mid = m.pts[m.pts.length >> 1];
    const ox = lamp.x - mid.x, oy = lamp.y - mid.y, ol = Math.hypot(ox, oy) || 1;
    const n = Math.max(1, Math.floor((m.pts.length - 1) * p));
    g.beginPath();
    for (let j = 0; j <= n; j++) {
      const q = project(v, m.pts[j].x + (ox / ol) * 0.9, m.pts[j].y + (oy / ol) * 0.9);
      if (j) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
      box.add(q.x, q.y, 3);
    }
    const sh = theme.light.sheen;
    g.strokeStyle = `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, ${Math.min(0.9, 0.45 * theme.ink.gloss * wet * lightAt(lamp, mid.x, mid.y))})`;
    g.lineWidth = Math.max(0.6, RULES.inkWidth * theme.ink.width * 0.3 * v.z);
    g.stroke();
  }
}
