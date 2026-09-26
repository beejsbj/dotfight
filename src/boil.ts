// Line boil: what is alive on the page is drawn over and over.
//
// A soldier still standing and a camp still manned are redrawn a few times a
// second by the same hand, the way a hand-drawn cartoon's lines crawl between
// frames: the shape stays, the line that forms it shifts. The dead
// (crossed-out soldiers, emptied camps, the ink lines) are dry and perfectly
// still.
//
// The page is append-only, so anything that boils is held off it and drawn on
// a small layer of its own, from pre-drawn sprites, redrawn only where
// something changed. The moment a thing stops boiling it is multiplied onto
// the page like every other mark and leaves the layer.
//
// From bird's-eye a camp is a thumbnail and a soldier a few pixels, so a
// boil that reads leaning in vanishes there: the redrawings stray further
// the further away the camera stands (BOIL.bold).

import type { GameState, Soldier } from "./game";
import { inBase } from "./hand";
import { dotSpots, drawBase, drawDot, drawMark, type Ink, type Spot } from "./page";
import { RULES } from "./rules";

type Ctx = CanvasRenderingContext2D;

/**
 * Which side of the war boils. Burooj asked for the living: soldiers still
 * standing and camps still manned are drawn again and again, the dead stay
 * still. "dead" flips it: crossed-out soldiers, emptied camps and every ink
 * line boil, and the living hold still (costlier: the lines are most of the ink).
 */
export const BOILS: "living" | "dead" = "living";

export const BOIL = {
  /** New drawings a second, on threes at 24fps. */
  fps: 8,
  /** Drawings per thing, cycled. Drawing 0 is the one the page keeps. */
  variants: 3,
  /**
   * How far the redrawings stray from the page's drawing, by how far away the
   * camera stands (its zoom as a multiple of the whole-page fit): bolder from
   * above, where a camp is a thumbnail, gentler leaning in, where the same
   * stray would be a wobble. The first level whose `m` the zoom is under.
   */
  bold: [
    { m: 1.35, amp: 2.6 }, // standing up: the whole page, and watching the ink
    { m: 1.9, amp: 1.7 }, // on the way down
    { m: Infinity, amp: 1 }, // leaning in
  ],
  /** A boil tick costing more than this (ms, median of recent ticks) and the device can't afford it: stop. */
  budgetMs: 6,
  /**
   * Sprite pixels made per tick after new things join: the browser rasterises
   * each batch the first time it's copied from, and a big batch is a hitch.
   * About one camp drawing and a handful of dots.
   */
  predrawPx: 120_000,
  /**
   * And at most this many sprites a tick: the browser draws a batch's ink when
   * it's first copied from, so a batch of many small scribbles is a hitch
   * however few pixels it has.
   */
  predrawSprites: 16,
};

/** Which of BOIL.bold the camera's zoom `m` (a multiple of the whole-page fit) calls for. */
export const boldAt = (m: number) => {
  const i = BOIL.bold.findIndex((b) => m < b.m);
  return i < 0 ? BOIL.bold.length - 1 : i;
};

/** Which boil frame it is at wall time `ms`. */
export const boilFrame = (ms: number, fps = BOIL.fps) => Math.floor((ms * fps) / 1000);

function hash(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Which drawing of a thing shows on boil frame `frame`. Every thing changes
 * drawing every frame, but each starts at its own drawing and half of them
 * cycle backwards, so neighbours never swap in step and the page doesn't pulse.
 */
export function variantAt(frame: number, key: string, n = BOIL.variants) {
  if (n <= 1) return 0;
  const h = hash(key);
  const dir = h & 1 ? 1 : -1;
  const v = ((h >>> 1) % n + dir * frame) % n;
  return v < 0 ? v + n : v;
}

/** Things kept off the page for now (see PageLayer.sync). `sig` changes whenever they do. */
export interface Hold {
  dots: Set<string>;
  bases: Set<number>;
  marks: Set<number>;
  sig: string;
}

/** What the boil layer draws: each held thing not being drawn on right now, and whether it boils. */
export interface Plan {
  hold: Hold;
  dots: { spot: Spot; boils: boolean }[];
  bases: { id: number; boils: boolean }[];
  marks: { i: number; boils: boolean }[];
  /** Changes whenever what the layer draws does. */
  sig: string;
}

/**
 * Who is alive to look at. A soldier killed this flick is still standing
 * until the ink reaches him and his cross starts; a camp is manned while
 * one of its side's living soldiers stands inside it.
 */
export function lifeOf(s: GameState, ink: Ink) {
  const dying = new Set<string>();
  for (const k of ink.live) {
    if (k[0] !== "m") continue;
    const m = s.marks[+k.slice(1)];
    if (m?.t === "cross" && m.kind === "kill" && ink.p(k) <= 0) dying.add(`${m.x},${m.y}`);
  }
  const soldiers = s.soldiers.filter((x) => x.alive || dying.has(`${x.x},${x.y}`));
  const spots = new Set(soldiers.map(spotKey));
  const bases = new Set(s.bases.filter((b) => inBase(soldiers.filter((x) => x.owner === b.owner), b).length).map((b) => b.id));
  return { soldiers: new Set(soldiers.map((x) => x.id)), spots, bases };
}

export const spotKey = (x: Pick<Soldier, "id" | "x" | "y">) => `${x.id}@${x.x},${x.y}`;

/**
 * What to hold off the page and what the boil layer draws this frame.
 * `on` false: nothing boils (reduced motion, a slow phone), and the only thing
 * held is a soldier riding his ink (`moving`).
 */
export function planBoil(s: GameState, ink: Ink, o: { on: boolean; side?: "living" | "dead"; moving?: number }): Plan {
  const side = o.side ?? BOILS;
  const hold: Hold = { dots: new Set(), bases: new Set(), marks: new Set(), sig: "" };
  const plan: Plan = { hold, dots: [], bases: [], marks: [], sig: "" };
  const mover = o.moving !== undefined ? s.soldiers[o.moving] : undefined;
  const riding = mover?.alive ? spotKey(mover) : undefined;
  if (riding) hold.dots.add(riding);
  if (o.on) {
    const life = lifeOf(s, ink);
    const boils = (living: boolean) => (side === "living" ? living : !living);
    // the living boil and can only die; the dead boil and the living may yet
    // join them, so on that side everything that can change stays off the page
    for (const spot of dotSpots(s)) {
      const living = life.spots.has(spot.key);
      if (side === "living" && !living) continue;
      hold.dots.add(spot.key);
      if (spot.key === riding || ink.live.has(`d${spot.id}`) && living) continue;
      plan.dots.push({ spot, boils: boils(living) });
    }
    for (const b of s.bases) {
      const living = life.bases.has(b.id);
      if (side === "living" && !living) continue;
      hold.bases.add(b.id);
      if (!ink.live.has(`b${b.id}`)) plan.bases.push({ id: b.id, boils: boils(living) });
    }
    if (side === "dead") {
      s.marks.forEach((_, i) => {
        hold.marks.add(i);
        if (!ink.live.has(`m${i}`)) plan.marks.push({ i, boils: true });
      });
    }
  }
  hold.sig = `${[...hold.dots].join()}|${[...hold.bases].join()}|${hold.marks.size}`;
  plan.sig = `${plan.dots.map((d) => d.spot.key + +d.boils).join()}|${plan.bases.map((b) => b.id + "" + +b.boils).join()}|${plan.marks.map((m) => m.i).join()}`;
  return plan;
}

// --- the layer ------------------------------------------------------------------

interface Thing {
  key: string;
  boils: boolean;
  /** Page-space box. */
  x0: number; y0: number; x1: number; y1: number;
  /** How to draw its drawing `wob`, straying `amp` times the usual from the page's. */
  paint: (g: Ctx, wob: number, amp: number) => void;
}

// Things bigger than this (page px, either side) are drawn as vectors each tick, not cached.
const SPRITE_MAX = 400;

function pixels(t: Thing, S: number) {
  const px0 = Math.floor(t.x0 * S), py0 = Math.floor(t.y0 * S);
  return { px0, py0, pw: Math.ceil(t.x1 * S) - px0, ph: Math.ceil(t.y1 * S) - py0 };
}

interface Batch { src: CanvasImageSource; n: number }
interface Sprite { batch: Batch; x: number; y: number }

/**
 * A thing's look at wall time `ms`: which drawing it shows. It changes exactly
 * when the thing must be redrawn; a still thing's never does.
 */
export function lookAt(boils: boolean, key: string, ms: number) {
  return boils ? variantAt(boilFrame(ms), key) : 0;
}

/** Where drawing `wob` at boldness `bold` is kept. Drawing 0 is the page's at every boldness. */
const spriteKey = (t: Thing, wob: number, bold: number) => (wob ? `${t.key}|${bold}.${wob}` : `${t.key}|0`);

/**
 * One boil canvas: page space, covering only what it draws, placed by the same
 * CSS matrix as the page, so the camera never redraws it. A thing is redrawn
 * only when its drawing changes, and only inside its own box: what overlaps
 * that box is redrawn clipped to it.
 */
class BoilCanvas {
  readonly c: HTMLCanvasElement;
  private g: Ctx;
  private S = 0;
  /** The page point at canvas pixel (0, 0): where the layer sits on the page. */
  ox = 0;
  oy = 0;
  private things: Thing[] = [];
  private sig = "";
  /** The clock grid step and boldness last looked at, and each thing's look when last drawn (null: draw everything). */
  private grid = -1;
  private bold = -1;
  private shown: number[] | null = null;
  /** Each drawing's sprite, by spriteKey. Kept across boldness changes: a camera going up and down again reuses them. */
  private sprites = new Map<string, Sprite>();
  /** Drawings still to make, a few each tick. */
  private later: { t: Thing; wob: number; bold: number }[] = [];
  /** Every sprite made: the layer's steady state. */
  get settled() { return this.later.length === 0; }
  /** Boxes of things that have left the canvas, still to be cleared. */
  private gone: number[][] = [];
  /** Whether this canvas's last draw was a steady one (no sprites made, nothing drawn as stand-in ink). */
  steady = true;

  /** `part`: the camps' rings, or everything else (soldiers, and marks when the dead boil). */
  constructor(private part: "rings" | "rest") {
    this.c = document.createElement("canvas");
    this.c.className = `boil-${part}`;
    this.g = this.c.getContext("2d")!;
  }

  get empty() { return this.things.length === 0; }
  /** Draw everything on the next tick, as if new (the dev redraw check). */
  redrawAll() { this.shown = null; this.grid = -1; }
  get boiling() { return this.things.some((t) => t.boils); }

  /** Take this frame's plan (cheap when it hasn't changed). */
  set(plan: Plan, s: GameState, S: number) {
    const sig = plan.sig;
    const rings = this.part === "rings";
    if (sig === this.sig && S === this.S) return;
    const was = S === this.S && this.shown ? new Map(this.things.map((t, i) => [`${t.key}|${+t.boils}`, { t, look: this.shown![i] }])) : null;
    const geometry = [this.ox, this.oy, this.c.width, this.c.height].join();
    if (S !== this.S) this.forget(() => true);
    this.sig = sig;
    this.S = S;
    const pad = 3;
    const R = RULES.soldierRadius * 1.4 + pad;
    const things: Thing[] = [];
    for (const { spot, boils } of rings ? [] : plan.dots) {
      const x = s.soldiers[spot.id];
      things.push({ key: spot.key, boils, x0: spot.x - R, y0: spot.y - R, x1: spot.x + R, y1: spot.y + R, paint: (g, w, amp) => drawDot(g, x, 1, 1, spot, w, amp) });
    }
    for (const { id, boils } of rings ? plan.bases : []) {
      const b = s.bases[id];
      // room for the boldest redrawing's stray
      const r = b.r * 1.16 + 4 + pad;
      things.push({ key: `b${id}@${b.seed}`, boils, x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r, paint: (g, w, amp) => drawBase(g, b, 1, w, amp) });
    }
    for (const { i, boils } of rings ? [] : plan.marks) {
      const m = s.marks[i];
      let x0: number, y0: number, x1: number, y1: number;
      if (m.t === "stroke") {
        x0 = Math.min(...m.pts.map((p) => p.x)) - 10; x1 = Math.max(...m.pts.map((p) => p.x)) + 10;
        y0 = Math.min(...m.pts.map((p) => p.y)) - 10; y1 = Math.max(...m.pts.map((p) => p.y)) + 10;
      } else {
        const r = RULES.soldierRadius * 3.2 + pad;
        x0 = m.x - r; y0 = m.y - r; x1 = m.x + r; y1 = m.y + r;
      }
      things.push({ key: `m${i}@${m.seed}`, boils, x0, y0, x1, y1, paint: (g, w) => drawMark(g, m, 1, w) });
    }
    this.things = things;
    const keep = new Set(things.map((t) => t.key));
    this.forget((k) => !keep.has(k.slice(0, k.lastIndexOf("|"))));
    this.queue(Math.max(0, this.bold));
    // the canvas covers what it draws, snapped to whole pixels on the page's grid
    if (things.length) {
      const px0 = Math.floor(Math.min(...things.map((t) => t.x0)) * S), py0 = Math.floor(Math.min(...things.map((t) => t.y0)) * S);
      const px1 = Math.ceil(Math.max(...things.map((t) => t.x1)) * S), py1 = Math.ceil(Math.max(...things.map((t) => t.y1)) * S);
      this.ox = px0 / S; this.oy = py0 / S;
      if (this.c.width !== px1 - px0 || this.c.height !== py1 - py0) { this.c.width = px1 - px0; this.c.height = py1 - py0; }
    }
    if (was && geometry === [this.ox, this.oy, this.c.width, this.c.height].join()) {
      // the canvas stays: what carries on keeps its look, what's new is drawn,
      // and what's gone (a man killed, a camp emptied) is cleared
      this.shown = things.map((t) => was.get(`${t.key}|${+t.boils}`)?.look ?? NaN);
      const kept = new Set(things.map((t) => `${t.key}|${+t.boils}`));
      for (const [k, { t }] of was) if (!kept.has(k)) this.gone.push([t.x0, t.y0, t.x1, t.y1]);
    } else {
      this.shown = null; // draw everything on the next tick
      this.gone = [];
    }
  }

  /**
   * Queue the sprites still missing at boldness `bold`, made a few a tick,
   * first drawings first; until one is made its thing is drawn from a stand-in
   * (the same drawing at another boldness, or the page's drawing).
   */
  private queue(bold: number) {
    this.later = [];
    const asked = new Set<string>();
    for (let w = 0; w < BOIL.variants; w++) for (const t of this.things) {
      if (!t.boils && w > 0) continue;
      const k = spriteKey(t, w, bold);
      if (!this.sprites.has(k) && !asked.has(k)) { asked.add(k); this.later.push({ t, wob: w, bold }); }
    }
  }

  /**
   * Bring the canvas up to wall time `ms`, at boldness `bold`. `seen` is the
   * part of the page on screen: what's outside it isn't redrawn until it
   * comes into view. Returns whether anything was drawn.
   */
  draw(ms: number, bold: number, seen?: { x0: number; y0: number; x1: number; y1: number }) {
    const grid = boilFrame(ms);
    // a new boldness is every living thing drawn anew: the whole canvas, once
    if (bold !== this.bold) { this.bold = bold; this.queue(bold); if (this.boiling) this.shown = null; }
    const news = this.shown?.some((v) => Number.isNaN(v)) || this.gone.length > 0;
    if (grid === this.grid && this.shown && !news) return false;
    this.grid = grid;
    const all = !this.shown;
    // nothing boiling and already drawn: it holds still
    if (!all && !news && !this.boiling) return false;
    const inView = (t: Thing) => !seen || (t.x1 > seen.x0 && t.x0 < seen.x1 && t.y1 > seen.y0 && t.y0 < seen.y1);
    const now = this.things.map((t, i) => (all || inView(t) ? lookAt(t.boils, t.key, ms) : this.shown![i]));
    const dirty = all ? this.things.map((_, i) => i) : now.flatMap((v, i) => (v !== this.shown![i] ? [i] : []));
    const gone = this.gone;
    this.gone = [];
    if (!dirty.length && !gone.length) return false;
    const g = this.g, S = this.S;
    const X = Math.round(this.ox * S), Y = Math.round(this.oy * S);
    // a tick that makes sprites or draws ink straight isn't a steady one
    let steady = !this.later.length;
    this.steady = false;
    if (this.later.length) {
      let px = 0, k = 0;
      while (k < this.later.length && (k === 0 || (px < BOIL.predrawPx && k < BOIL.predrawSprites))) {
        const { pw, ph } = pixels(this.later[k].t, S);
        px += pw * ph;
        k++;
      }
      this.predraw(this.later.splice(0, k));
    }
    // the dirty boxes, in layer pixels; everything touching one is redrawn inside it
    const px = ([x0, y0, x1, y1]: number[]) => [Math.floor(x0 * S) - X - 1, Math.floor(y0 * S) - Y - 1, Math.ceil(x1 * S) - Math.floor(x0 * S) + 2, Math.ceil(y1 * S) - Math.floor(y0 * S) + 2];
    const rects: number[][] = gone.map(px);
    for (const i of dirty) { const t = this.things[i]; rects.push(px([t.x0, t.y0, t.x1, t.y1])); }
    const touches = (t: Thing, [x, y, w, h]: number[]) => {
      const [a, b, c, d] = px([t.x0, t.y0, t.x1, t.y1]);
      return x < a + c && a < x + w && y < b + d && b < y + h;
    };
    const whole = all || (!gone.length && dirty.length === this.things.length);
    const redraw = whole ? this.things.map((_, i) => i) : this.things.flatMap((t, i) => (rects.some((r) => touches(t, r)) ? [i] : []));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    if (all) g.clearRect(0, 0, this.c.width, this.c.height);
    else for (const [x, y, w, h] of rects) g.clearRect(x, y, w, h);
    g.save();
    if (!whole) {
      g.beginPath();
      for (const [x, y, w, h] of rects) g.rect(x, y, w, h);
      g.clip();
    }
    // ink multiplies, on this layer as on the page, so overlaps darken the same way
    g.globalCompositeOperation = "multiply";
    for (const i of redraw) if (!this.paint(this.things[i], now[i], X, Y)) steady = false;
    g.restore();
    g.globalCompositeOperation = "source-over";
    this.shown = now;
    this.steady = steady;
    return true;
  }

  /** The sprite for drawing `wob`, or the best stand-in made: the same drawing at another boldness, then the page's drawing. */
  private sprite(t: Thing, wob: number) {
    const own = this.sprites.get(spriteKey(t, wob, this.bold));
    if (own) return own;
    for (let b = 0; b < BOIL.bold.length && wob; b++) {
      const sp = this.sprites.get(spriteKey(t, wob, b));
      if (sp) return sp;
    }
    return this.sprites.get(spriteKey(t, 0, 0));
  }

  /** Draw one thing as it looks now. Returns false if it had to be drawn as ink because its sprite isn't made yet. */
  private paint(t: Thing, wob: number, X: number, Y: number) {
    const g = this.g, S = this.S;
    const { px0, py0, pw, ph } = pixels(t, S);
    const sp = this.sprite(t, wob);
    if (sp) { g.drawImage(sp.batch.src, sp.x, sp.y, pw, ph, px0 - X, py0 - Y, pw, ph); return true; }
    // not made yet, or too big to cache (a whole ink line, when the dead boil)
    g.setTransform(S, 0, 0, S, -X, -Y);
    t.paint(g, wob, BOIL.bold[Math.max(0, this.bold)].amp);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return pw > SPRITE_MAX || ph > SPRITE_MAX;
  }

  /**
   * Draw these drawings, packed in rows on one new canvas that is never drawn
   * into again; the ticks then only copy. (A canvas per sprite costs far more
   * to make than its ink, and drawing into a canvas that has been copied from
   * makes the browser copy all of it.)
   */
  private predraw(list: { t: Thing; wob: number; bold: number }[]) {
    const S = this.S, W = 1024;
    const todo: { t: Thing; wob: number; bold: number; x: number; y: number; pw: number; ph: number; px0: number; py0: number }[] = [];
    let x = 0, y = 0, row = 0, w = 0;
    for (const { t, wob, bold } of list) {
      const { px0, py0, pw, ph } = pixels(t, S);
      if (pw > SPRITE_MAX || ph > SPRITE_MAX || this.sprites.has(spriteKey(t, wob, bold))) continue;
      if (x + pw > W) { x = 0; y += row; row = 0; }
      todo.push({ t, wob, bold, x, y, pw, ph, px0, py0 });
      x += pw + 2;
      w = Math.max(w, x);
      row = Math.max(row, ph + 2);
    }
    if (!todo.length) return;
    const h = y + row;
    const off = typeof OffscreenCanvas !== "undefined";
    const c = off ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const g = c.getContext("2d") as Ctx;
    g.globalCompositeOperation = "multiply";
    // each box is padded past its ink, so no clipping is needed
    for (const d of todo) {
      g.setTransform(S, 0, 0, S, d.x - d.px0, d.y - d.py0);
      d.t.paint(g, d.wob, BOIL.bold[d.bold].amp);
    }
    const batch: Batch = { src: off ? (c as OffscreenCanvas).transferToImageBitmap() : (c as HTMLCanvasElement), n: todo.length };
    for (const d of todo) this.sprites.set(spriteKey(d.t, d.wob, d.bold), { batch, x: d.x, y: d.y });
  }

  /** Let go of drawings whose key matches (a camp emptied, a soldier moved on); a batch goes when all its drawings have. */
  private forget(gone: (key: string) => boolean) {
    for (const [k, sp] of this.sprites) {
      if (!gone(k)) continue;
      this.sprites.delete(k);
      if (--sp.batch.n === 0 && sp.batch.src instanceof ImageBitmap) sp.batch.src.close();
    }
  }
}

/**
 * The boil layer: two page-space canvases, the camps' rings and everything
 * else, so a soldier swapping his drawing never re-copies the ring round him
 * and a ring swapping never re-copies the soldiers inside it. Ink
 * multiplies, so which canvas is on top makes no difference.
 */
export class BoilLayer {
  readonly parts = [new BoilCanvas("rings"), new BoilCanvas("rest")];
  /** Recent tick costs (ms), to judge whether the device can afford the boil. */
  private recent: number[] = [];
  /** The device can't afford the boil: set once ticks run over budget. */
  tooDear = false;
  redraws = 0;

  get empty() { return this.parts.every((p) => p.empty); }
  get settled() { return this.parts.every((p) => p.settled); }

  set(plan: Plan, s: GameState, S: number) { for (const p of this.parts) p.set(plan, s, S); }
  /** Draw both canvases whole on their next ticks (the dev redraw check). */
  redrawAll() { for (const p of this.parts) p.redrawAll(); }

  private turn = 0;

  /**
   * Bring the layer up to wall time `ms`, at boldness `bold` (boldAt). One canvas a frame at most, taking
   * turns: when both are due (a slow phone's frames are far apart) the other
   * catches up next frame, so no frame pays for both. Returns whether anything
   * was drawn.
   */
  draw(ms: number, bold: number, seen?: { x0: number; y0: number; x1: number; y1: number }) {
    const t0 = performance.now();
    let drew = false, steady = true;
    for (let k = 0; k < this.parts.length && !drew; k++) {
      const i = (this.turn + k) % this.parts.length, p = this.parts[i];
      if (p.draw(ms, bold, seen)) { drew = true; steady = p.steady; this.turn = i + 1; }
    }
    if (!drew) return false;
    this.redraws++;
    if (steady) this.cost(performance.now() - t0);
    return true;
  }

  // Judge the device on the median of recent steady ticks, not one slow one.
  private cost(ms: number) {
    this.recent.push(ms);
    if (this.recent.length > 24) this.recent.shift();
    if (this.recent.length < 24) return;
    const med = [...this.recent].sort((a, b) => a - b)[this.recent.length >> 1];
    if (med > BOIL.budgetMs) this.tooDear = true;
  }
}
