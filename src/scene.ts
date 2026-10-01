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
import type { Mood } from "./bubble";
import { rng, type Pt } from "./game";
import type { AnyState as GameState } from "./record";
import { INK, bowed, handText, inkCross, inkFlick, lead, pencilArrow, pencilLine, pencilLoop, pencilStroke, rubOut } from "./ink";
import { Life } from "./life";
import { PencilLayer } from "./pencil-layer";
import { lightAt, paintHaze, paintLight, type Lamp } from "./light";
import { drawBase, drawDot, drawMark, drawSignature, wentTo, PageLayer, SETTLED, yellowing, ageOf, type Ink, type Signature } from "./page";
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
  mover?: { id: number; at: Pt; angle?: number; stretch?: number };
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
  /** Soldiers out on the open road between camps (a convoy in transit), marked in pencil as marching and exposed: where he stands and the way he faces. */
  road?: { at: Pt; dir: number }[];
  /** Aiming a lunge: enemy bases with men at home, where he'd be shot if he landed. */
  danger?: { x: number; y: number; r: number }[];
  /** Pencilled help on the page; "note" writes `text` (a room waiting on the other side). */
  teach?: { kind: "aim" | "place" | "arrange" | "note"; at: Pt; p: number; rot: number; note?: string; text?: string };
  sig?: Signature;
  /** A volley (life.ts): the defenders' jabs, drawn on and glinting away, and the intruder's cross if the rules haven't drawn one. */
  jabs?: { pts: Pt[]; p: number; alpha: number; owner: 0 | 1; seed: number }[];
  stamp?: { x: number; y: number; owner: 0 | 1; seed: number; p: number };
  /** Screen height and the HUD's top and bottom bars (css px), to keep notes clear of them. */
  hud?: { h: number; top: number; bottom: number };
  /** A soldier's line (bubble.ts), pencilled on the page beside him with a tail to him: how much is written (p) and how much rubbed out (e). */
  bubble?: { text: string; mood: Mood; at: Pt; p: number; e: number; side: 1 | -1; seed: number; owner: 0 | 1 };
  /** The line boil: whether the living boil at all, wall time (ms) for its frame, and how bold (boil.ts boldAt). */
  boil?: { on: boolean; ms: number; bold: number };
}

export const page = new PageLayer();
export const pageState = { epoch: 0, S: 1.6 };
export const stageStats = { live: 0, air: 0, frames: 0, boil: 0, field: 0, streak: 0 };
export const field = new PencilLayer();
export const streak = new PencilLayer();
export const boil = new BoilLayer();
/** What the living are feeling (life.ts): the boil draws each soldier in his pose. */
export const life = new Life();
boil.life = life;

export interface Els {
  desk: HTMLCanvasElement;
  pageHost: HTMLElement;
  boilHost: HTMLElement;
  fieldHost: HTMLElement;
  streakHost: HTMLElement;
  live: HTMLCanvasElement;
  /** Notes: pencil on the same sheet, the theme's blend like the live layer; its own dirty box, hidden when no one's talking. */
  talk: HTMLCanvasElement;
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

let lastCss = { field: "", streak: "", desk: "", page: "", live: "", talk: "", boil: ["", ""] };
let liveDirty: { x: number; y: number; w: number; h: number } | null = null;
let talkDirty: { x: number; y: number; w: number; h: number } | null = null;
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
  for (const [name, layer, host] of [["field", field, els.fieldHost], ["streak", streak, els.streakHost]] as const) {
    if (layer.c.parentElement !== host) { host.replaceChildren(layer.c); lastCss[name] = ""; }
    layer.c.style.visibility = layer.empty ? "hidden" : "";
    if (!layer.empty) {
      const m = cssMatrix(layerMatrix(v, layer.S, layer.ox, layer.oy));
      if (m !== lastCss[name]) { layer.c.style.transform = m; lastCss[name] = m; }
    }
  }
  const lc = stageCss(v);
  const lk = lc.transform + lc.origin;
  if (lk !== lastCss.live) { els.live.style.transform = lc.transform; els.live.style.transformOrigin = lc.origin; lastCss.live = lk; }
  if (lk !== lastCss.talk) { els.talk.style.transform = lc.transform; els.talk.style.transformOrigin = lc.origin; lastCss.talk = lk; }
}

export function renderStage(els: Els, f: Frame) {
  const { s, dpr } = f;
  const ink = f.ink ?? SETTLED;
  const plan = boilPlan(f, ink);
  page.sync(s, ink, pageState.S, pageState.epoch, f.sig, plan.hold);
  boil.set(plan, s, pageState.S);
  const road = f.road ?? [];
  const key = JSON.stringify([theme.id, pageState.epoch, pageState.S, road]);
  if (field.draw(key, road.map((q) => q.at), pageState.S, 42, (g) => {
    for (const q of road) drawRoad(g, q.at, q.dir, 3, s.soldiers.length + Math.round(q.at.x));
  })) stageStats.field++;
  const mover = f.mover && (f.mover.stretch ?? 1) > 1.04 ? f.mover : undefined;
  const speedKey = JSON.stringify([theme.id, pageState.epoch, pageState.S, mover]);
  if (streak.draw(speedKey, mover ? [mover.at] : [], pageState.S, 80, (g) => {
    drawSpeed(g, mover!.at, mover!.angle ?? 0, mover!.stretch ?? 1, 3, mover!.id);
  })) stageStats.streak++;
  place(els, f);
  seen = onScreen(f);
  bold = f.boil?.bold ?? 0;
  if (boil.draw(f.boil?.ms ?? 0, bold, seen)) stageStats.boil++;
  renderLive(els.live.getContext("2d")!, els.live, f, ink, dpr);
  renderTalk(els.talk.getContext("2d")!, els.talk, f, dpr);
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
  field.key = ""; streak.key = "";
  liveDirty = { x: 0, y: 0, w: 1e6, h: 1e6 };
  talkDirty = { x: 0, y: 0, w: 1e6, h: 1e6 };
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
    drawMark(g, m, ink.p(k), 0, wentTo(s, i));
    if (m.t === "stroke") for (const p of m.pts) box.add(p.x, p.y, 8);
    else if (m.t === "walk") { box.add(m.a.x, m.a.y, 10); box.add(m.b.x, m.b.y, 10); }
    else if (m.t === "stand") for (const p of m.at) box.add(p.x, p.y, 24);
    else box.add(m.x, m.y, 34);
  });
  const walking = new Set(f.walkers?.map((w) => w.id));
  for (const x of s.soldiers) {
    const jot = `d${x.id}`;
    if (ink.live.has(jot) && !walking.has(x.id) && f.drag?.id !== x.id) { drawDot(g, x, 1, ink.p(jot)); box.add(x.x, x.y, 12); }
  }
  if (f.mover) {
    const { at, angle = 0, stretch = 1 } = f.mover;
    g.save();
    // stretched along his way, thinner across it (keeping his size)
    g.translate(at.x, at.y); g.rotate(angle); g.scale(stretch, 1 / stretch); g.rotate(-angle); g.translate(-at.x, -at.y);
    drawDot(g, s.soldiers[f.mover.id], 1, 1, at);
    g.restore();
    box.add(at.x, at.y, 12 * stretch);
  }
  for (const j of f.jabs ?? []) {
    if (j.p <= 0 || j.alpha <= 0) continue;
    inkFlick(g, j.pts, INK.pens[j.owner], j.seed, RULES.inkWidth * 0.6, j.p, j.alpha);
    for (const q of j.pts) box.add(q.x, q.y, 6);
  }
  if (f.stamp && f.stamp.p > 0) {
    const t = f.stamp;
    inkCross(g, t.x, t.y, RULES.soldierRadius * 2.1, INK.pens[t.owner], t.seed, 2.8, 1, t.p);
    box.add(t.x, t.y, RULES.soldierRadius * 3.2);
  }
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

/** The note layer: nothing on it but a soldier's line, so it's hidden the rest of the time. */
function renderTalk(g: Ctx, el: HTMLCanvasElement, f: Frame, dpr: number) {
  if (!f.bubble && !talkDirty) return;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (talkDirty) g.clearRect(talkDirty.x, talkDirty.y, talkDirty.w, talkDirty.h);
  talkDirty = null;
  if (!f.bubble) { if (el.style.visibility !== "hidden") el.style.visibility = "hidden"; return; }
  const v = f.view, box = new Box();
  worldTransform(g, v, dpr);
  drawNote(g, f, f.bubble, box);
  if (el.style.visibility === "hidden") el.style.visibility = "";
  const pts = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]].map(([x, y]) => toLocal(v, x, y));
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) * dpr) - 4), y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) * dpr) - 4);
  const x1 = Math.min(el.width, Math.ceil(Math.max(...pts.map((p) => p.x)) * dpr) + 4), y1 = Math.min(el.height, Math.ceil(Math.max(...pts.map((p) => p.y)) * dpr) + 4);
  talkDirty = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
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

/**
 * A soldier out on the open road: a broken pencil ring round him (nobody's
 * camp is round him now, so he's out in the open) and a pair of chevrons ahead
 * of him, marching. Pencil, so it's the paper's remark on the page, never ink history.
 */
function drawRoad(g: Ctx, at: Pt, dir: number, px: number, seed: number) {
  const r = RULES.soldierRadius + 8, w = Math.max(2.4, px * 1.9);
  const n = 10;
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2 + 0.2, a1 = ((i + 1.2) / n) * Math.PI * 2 + 0.2;
    pencilLine(g, { x: at.x + Math.cos(a0) * r, y: at.y + Math.sin(a0) * r }, { x: at.x + Math.cos(a1) * r, y: at.y + Math.sin(a1) * r }, w, seed + i, false);
  }
  const ux = Math.cos(dir), uy = Math.sin(dir);
  for (const d of [r + 5, r + 12]) {
    const cx = at.x + ux * d, cy = at.y + uy * d, s = 6.5;
    pencilLine(g, { x: cx - ux * s - uy * s, y: cy - uy * s + ux * s }, { x: cx, y: cy }, w, seed + 40 + d, false);
    pencilLine(g, { x: cx - ux * s + uy * s, y: cy - uy * s - ux * s }, { x: cx, y: cy }, w, seed + 50 + d, false);
  }
}

/** A lunger at speed: three short pencil streaks trailing from him, the way a kid draws a fast thing. */
function drawSpeed(g: Ctx, at: Pt, angle: number, stretch: number, px: number, seed: number) {
  const ux = Math.cos(angle), uy = Math.sin(angle), w = Math.max(1.4, px * 1.1);
  const len = 14 + (stretch - 1) * 60;
  [-1, 0, 1].forEach((k, i) => {
    const gap = 10 + Math.abs(k) * 2, lat = k * 6;
    const a = { x: at.x - ux * gap - uy * lat, y: at.y - uy * gap + ux * lat };
    const b = { x: a.x - ux * len * (k ? 0.65 : 1), y: a.y - uy * len * (k ? 0.65 : 1) };
    pencilLine(g, a, b, w, seed * 7 + i, false);
  });
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

// A soldier's line: a word or two pencilled in his side's colour in a gap on
// the page beside him, with a little speech tail to him, the way someone at
// the desk would scribble it, then rubbed out. Pencil on the same sheet: no
// fill, no second surface, the theme's blend, under the lamp like every other
// mark. The gap is found once per note (the emptiest of a ring of spots round
// him: clear of men, camp rings and lines, on the page and off the HUD) and
// remembered, so it holds still while the camera moves. Upright the way you're
// looking, sized to read from bird's-eye as well as leaning in.
export const NOTE = {
  /** The lead's tooth, whatever the theme's pen. */
  grain: 0.5,
  alpha: 0.9,
  /** A loose pencil ring round the words (off: just the words and their tail). */
  ring: true,
};
const HUD_INSET = 20;
function noteBounds(f: Frame): { x0: number; y0: number; x1: number; y1: number } {
  const B = { x0: 12, y0: 12, x1: RULES.pageW - 12, y1: RULES.pageH - 12 };
  const v = f.view, hud = f.hud;
  if (!hud) return B;
  // the part of the screen clear of the HUD, in page units
  const l = HUD_INSET, r = f.sw - HUD_INSET, t = hud.top + HUD_INSET, bt = hud.h - hud.bottom - HUD_INSET;
  const pts = [[l, t], [r, t], [l, bt], [r, bt]].map(([x, y]) => unproject(v, x, y));
  if (pts.some((p) => !p) || bt - t < 60) return B;
  const xs = pts.map((p) => p!.x), ys = pts.map((p) => p!.y);
  // a turned screen is a diamond on the page: shrink to the box it certainly holds
  const q = 1 + Math.abs(Math.sin(2 * v.rot)) * 0.35;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const hw = (Math.max(...xs) - Math.min(...xs)) / 2 / q, hh = (Math.max(...ys) - Math.min(...ys)) / 2 / q;
  return { x0: Math.max(B.x0, cx - hw), x1: Math.min(B.x1, cx + hw), y0: Math.max(B.y0, cy - hh), y1: Math.min(B.y1, cy + hh) };
}

/** A polyline with points at least `d` apart (a flick's line is a few hundred points and nearly straight). */
function thin(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i].x - l.x, pts[i].y - l.y) >= d) out.push(pts[i]); }
  out.push(pts[pts.length - 1]);
  return out;
}

// How full the paper is round the man, rasterised once per note: a grid of
// cells (half a note-size square) in local (screen-upright) units centred on
// him, each holding the cost of writing over it. Men, camp rings, crosses and
// lines are painted in with their weights; a candidate rectangle then costs
// the sum of the cells it samples, whatever its angle.
class Clutter {
  private g: Float32Array;
  private n: number;
  constructor(private cell: number, private half: number) {
    this.n = Math.ceil((half * 2) / cell) + 1;
    this.g = new Float32Array(this.n * this.n);
  }
  private idx(x: number, y: number) {
    const i = Math.floor((x + this.half) / this.cell), j = Math.floor((y + this.half) / this.cell);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i;
  }
  add(x: number, y: number, w: number) { const k = this.idx(x, y); if (k >= 0) this.g[k] += w; }
  /** Paint `w` into every cell within `r` of (x, y). */
  disc(x: number, y: number, r: number, w: number) {
    for (let v = y - r; v <= y + r + 1e-6; v += this.cell) for (let u = x - r; u <= x + r + 1e-6; u += this.cell) this.add(u, v, w);
  }
  /** Paint `w` per step along the segment a-b, a step every half cell. */
  seg(a: Pt, b: Pt, w: number) {
    const l = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(l / (this.cell * 0.5)));
    for (let i = 0; i <= n; i++) this.add(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, w);
  }
  ring(x: number, y: number, r: number, w: number) {
    const n = Math.max(8, Math.ceil((Math.PI * 2 * r) / (this.cell * 0.5)));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.add(x + Math.cos(a) * r, y + Math.sin(a) * r, w); }
  }
  at(x: number, y: number) { const k = this.idx(x, y); return k < 0 ? 0 : this.g[k]; }
}

// How each mood is written: size and weight, how neat the hand is, and what's
// round the words (a shout's ring is spiky, and it's underlined twice).
const MOODS: Record<Mood, { size: number; weight: number; alpha: number; tilt: number; skew: number; stretch: number; ring: number; spiky: boolean; under: number }> = {
  whisper: { size: 0.8, weight: 400, alpha: 0.72, tilt: 0.01, skew: 0, stretch: 1, ring: 0.55, spiky: false, under: 0 },
  say: { size: 1, weight: 700, alpha: 0.9, tilt: 0.03, skew: 0, stretch: 1, ring: 0.8, spiky: false, under: 0 },
  shout: { size: 1.25, weight: 700, alpha: 1, tilt: 0.08, skew: -0.14, stretch: 1.08, ring: 0.95, spiky: true, under: 2 },
};

// The angles a note may be written at, relative to the way you're looking
// (so never upside down for the reader), and what each costs: upright and
// slight tilts for choice, steeper ones, up to vertical, when they find clear paper.
const ANGLES: [number, number][] = [[0, 0], [0.22, 0.5], [-0.22, 0.5], [0.5, 1.4], [-0.5, 1.4], [0.85, 2.6], [-0.85, 2.6], [1.2, 3.4], [-1.2, 3.4], [Math.PI / 2, 3.8], [-Math.PI / 2, 3.8]];

// The gap the note goes in (page units from the man) and the angle it's
// written at (screen-relative), chosen once per note and remembered.
let spotMemo: { key: string; dx: number; dy: number; ang: number; side: 1 | -1 } | null = null;
/** Dev: where the note showing was put (page offset from the man, its angle), or null. */
export const noteSpotNow = () => spotMemo;
function noteSpot(f: Frame, b: NonNullable<Frame["bubble"]>, hw: number, hh: number, size: number, angK = 1) {
  const key = `${b.seed}|${b.text}|${b.at.x},${b.at.y}`;
  if (spotMemo?.key === key) return spotMemo;
  const { s } = f, R = RULES.soldierRadius, B = noteBounds(f);
  const rot = f.view.rot, c = Math.cos(rot), sn = Math.sin(rot);
  const toPage = (lx: number, ly: number): Pt => ({ x: b.at.x + lx * c + ly * sn, y: b.at.y - lx * sn + ly * c });
  const toLocal_ = (x: number, y: number): Pt => ({ x: (x - b.at.x) * c - (y - b.at.y) * sn, y: (x - b.at.x) * sn + (y - b.at.y) * c });
  // what's on the paper near him: crosses as points, strokes and roads as their lines, all in local (screen-upright) units
  const reach = R + Math.max(hw, hh) * 2.2 + size * 3;
  const cell = size * 0.5, grid = new Clutter(cell, reach + Math.max(hw, hh) + cell);
  const near = (p: Pt) => Math.hypot(p.x - b.at.x, p.y - b.at.y) < reach + size * 6;
  const L_ = (p: Pt) => toLocal_(p.x, p.y);
  for (const x of s.soldiers) if (near(x)) { const q = L_(x); grid.disc(q.x, q.y, R + 3, 10); }
  for (const k of s.bases) if (Math.hypot(k.x - b.at.x, k.y - b.at.y) < reach + k.r) { const q = L_(k); grid.ring(q.x, q.y, k.r, 1); }
  for (const m of s.marks) {
    if (m.t === "cross") { if (near(m)) { const q = L_(m); grid.disc(q.x, q.y, 9, 6); } }
    else if (m.t === "walk") { if (near(m.a) || near(m.b)) grid.seg(L_(m.a), L_(m.b), 0.6); }
    else if (m.t === "stand") { for (const p of m.at) if (near(p)) { const q = L_(p); grid.disc(q.x, q.y, 9, 6); } }
    else if (m.pts.some(near)) { const pts = thin(m.pts, cell).map(L_); for (let j = 1; j < pts.length; j++) grid.seg(pts[j - 1], pts[j], 0.6); }
  }
  let best: { cost: number; dx: number; dy: number; ang: number; side: 1 | -1 } | null = null;
  const seed = rng(b.seed ^ 0x5eed);
  const nu = Math.max(2, Math.ceil((hw * 2) / cell)), nv = Math.max(2, Math.ceil((hh * 2) / cell));
  for (const [ang, angCost] of ANGLES) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // the turned rect's reach on the page, whichever way the screen is turned
    const th = ang - rot, ex = Math.abs(Math.cos(th)) * hw + Math.abs(Math.sin(th)) * hh, ey = Math.abs(Math.sin(th)) * hw + Math.abs(Math.cos(th)) * hh;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2; // up first
        const gap = size * (ring ? 1.7 : 0.85); // room for the tail
        // how far the turned rect reaches toward him along this direction
        const along = Math.abs(Math.cos(a - ang)) * hw + Math.abs(Math.sin(a - ang)) * hh;
        const lx = Math.cos(a) * (R + along + gap), ly = Math.sin(a) * (R + along + gap);
        const p = toPage(lx, ly);
        const q = { x: Math.max(B.x0 + ex, Math.min(B.x1 - ex, p.x)), y: Math.max(B.y0 + ey, Math.min(B.y1 - ey, p.y)) };
        const miss = Math.hypot(q.x - p.x, q.y - p.y);
        const L = toLocal_(q.x, q.y);
        // over his own dot once clamped: no good
        const mx = -L.x * ca - L.y * sa, my = L.x * sa - L.y * ca;
        if (Math.abs(mx) <= hw + R && Math.abs(my) <= hh + R) continue;
        let cost = angCost * angK + (miss / size) * 4 + (miss > size * 1.5 ? 30 : 0);
        cost += 2.5 * (1 + Math.sin(a)) / 2 + (ring ? 1.5 : 0) + seed() * 0.6; // above him for choice, close for choice
        // what the turned rect covers, a sample per cell
        for (let v = 0; v <= nv; v++) {
          const y = -hh + (v / nv) * hh * 2;
          for (let u = 0; u <= nu; u++) {
            const x = -hw + (u / nu) * hw * 2;
            cost += grid.at(L.x + x * ca - y * sa, L.y + x * sa + y * ca);
          }
        }
        if (!best || cost < best.cost) best = { cost, dx: q.x - b.at.x, dy: q.y - b.at.y, ang, side: lx < 0 ? -1 : 1 };
      }
    }
  }
  const up = toPage(0, -(R + hh + size));
  spotMemo = { key, ...(best ?? { dx: up.x - b.at.x, dy: up.y - b.at.y, ang: 0, side: 1 as const }) };
  return spotMemo;
}

function drawNote(g: Ctx, f: Frame, b: NonNullable<Frame["bubble"]>, box: Box) {
  const pen = INK.pens[b.owner], M = MOODS[b.mood];
  let size = Math.max(30, Math.min(70, 25 / f.view.z)) * M.size; // page units: about 25 screen px
  g.save();
  g.font = `${M.weight} ${size}px Caveat, "Patrick Hand", cursive`;
  let w = g.measureText(b.text).width * M.stretch;
  g.restore();
  // a long line is written smaller rather than across half the screen
  const most = (f.sw * 0.5) / f.view.z;
  if (w > most) { size *= most / w; w = most; }
  const R = RULES.soldierRadius;
  const hw = w / 2 + size * 0.1, hh = size * 0.5 + (M.under ? size * 0.22 : 0);
  const rot = f.view.rot, c = Math.cos(rot), sn = Math.sin(rot);
  const rx = hw + (NOTE.ring ? size * 0.5 : size * 0.05), ry = hh + (NOTE.ring ? size * 0.3 : size * 0.1);
  // a burst's spikes reach past the ring; a shout is yelled upright unless the paper's really full
  const spot = noteSpot(f, b, rx * (M.spiky ? 1.14 : 1), ry * (M.spiky ? 1.14 : 1), size, M.spiky ? 1.7 : 1);
  const ang = spot.ang, ca = Math.cos(ang), sa = Math.sin(ang);
  // local (screen-upright, at the man) <-> page
  const toPage = (lx: number, ly: number): Pt => ({ x: b.at.x + lx * c + ly * sn, y: b.at.y - lx * sn + ly * c });
  const L = { x: spot.dx * c - spot.dy * sn, y: spot.dx * sn + spot.dy * c };
  // the tail: from the ring's edge nearest him to just short of him, two strokes closing on him
  const d = Math.hypot(L.x, L.y) || 1, u = { x: L.x / d, y: L.y / d };
  const ur = { x: u.x * ca + u.y * sa, y: -u.x * sa + u.y * ca }; // toward him, in the ring's frame
  const t = Math.min(rx / Math.max(1e-6, Math.abs(ur.x)), ry / Math.max(1e-6, Math.abs(ur.y)));
  const start = { x: L.x - u.x * (t + size * 0.1), y: L.y - u.y * (t + size * 0.1) };
  const tip = { x: u.x * (R + 4), y: u.y * (R + 4) };
  const len = Math.hypot(start.x - tip.x, start.y - tip.y);
  const perp = { x: -u.y, y: u.x }, half = Math.min(size * 0.36, len * 0.5);
  // written the way a hand would: the words, the ring round them, then the tail
  const words = Math.min(1, b.p / (NOTE.ring ? 0.58 : 0.78)), ring = Math.max(0, (b.p - 0.5) / 0.4), tail = Math.max(0, (b.p - (NOTE.ring ? 0.86 : 0.78)) / (NOTE.ring ? 0.14 : 0.22));
  const lw = Math.max(2.2, size * 0.065);
  const r = rng(b.seed + 3);
  const tilt = (r() - 0.5) * 2 * M.tilt;
  g.save();
  g.translate(b.at.x, b.at.y);
  g.rotate(-rot);
  g.save();
  g.translate(L.x, L.y);
  g.rotate(ang);
  if (NOTE.ring) {
    const ph = [r() * 6.28, r() * 6.28], a0 = r() * 6.28, N = M.spiky ? 44 : 40;
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const a = a0 + (i / N) * Math.PI * 2.04;
      let k = 1 + Math.sin(a * 2 + ph[0]) * 0.04 + Math.sin(a * 5 + ph[1]) * 0.02;
      if (M.spiky) k += (i % 2 ? 0.11 : -0.02) + (r() - 0.5) * 0.04; // a burst: every other point flung out
      pts.push({ x: Math.cos(a) * rx * k, y: Math.sin(a) * ry * k });
    }
    pencilStroke(g, pts, pen, b.seed + 5, lw * (M.spiky ? 1.1 : 0.9), ring, NOTE.alpha * M.ring, NOTE.grain);
  }
  g.save();
  g.transform(M.stretch, 0, M.skew, 1, 0, 0); // a shout's letters stretched and leaning
  handText(g, b.text, 0, size * 0.3 - (M.under ? size * 0.16 : 0), size, pen, { upTo: words, alpha: NOTE.alpha * M.alpha, weight: M.weight, rot: tilt, align: "center", grain: NOTE.grain });
  g.restore();
  for (let i = 0; i < M.under; i++) {
    // underlined, twice, in a hurry: each line its own quick stroke, a little off
    const y = size * 0.42 + i * size * 0.13, up = Math.max(0, (words - 0.7 - i * 0.15) / 0.3);
    const j = r() * 6.28;
    pencilStroke(g, Array.from({ length: 6 }, (_, k) => ({ x: -hw * 0.95 + (k / 5) * hw * 1.9 + (r() - 0.5) * size * 0.05, y: y + Math.sin(k + j) * size * 0.03 })), pen, b.seed + 21 + i, lw * 1.1, up, NOTE.alpha * M.alpha, NOTE.grain);
  }
  if (b.e > 0) rubOut(g, -rx, -ry, rx, ry, b.seed + 11, b.e, size, pen);
  g.restore();
  if (len > size * 0.2 && tail > 0) {
    const a = { x: start.x + perp.x * half, y: start.y + perp.y * half }, k = { x: start.x - perp.x * half, y: start.y - perp.y * half };
    pencilStroke(g, bowed(a, tip, 0.16, 8), pen, b.seed + 7, lw, Math.min(1, tail / 0.55), NOTE.alpha, NOTE.grain);
    pencilStroke(g, bowed(tip, k, 0.16, 8), pen, b.seed + 9, lw * 0.9, Math.max(0, (tail - 0.5) / 0.5), NOTE.alpha, NOTE.grain);
  }
  if (b.e > 0) {
    // the tail under its own rub
    const tx0 = Math.min(start.x, tip.x) - half, ty0 = Math.min(start.y, tip.y) - half, tx1 = Math.max(start.x, tip.x) + half, ty1 = Math.max(start.y, tip.y) + half;
    rubOut(g, tx0, ty0, tx1, ty1, b.seed + 13, Math.min(1, b.e * 1.15), size * 0.7, pen, 1);
  }
  g.restore();
  const m = toPage(L.x, L.y);
  box.add(m.x, m.y, Math.max(rx, ry) * 1.2 + size * 1.4);
  box.add(b.at.x, b.at.y, R + size * 0.6);
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
