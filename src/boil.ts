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

import type { Soldier } from "./game";
import type { AnyState as GameState } from "./record";
import { inBase } from "./hand";
import { INK, inkCircle, inkOp } from "./ink";
import { CLARITY, dotSpots, drawBase, drawDot, drawMark, wentTo, type Ink, type Spot } from "./page";
import { FPS as LIFE_FPS, FRAME as LIFE_FRAME, LIFE_BOX, type Life, type Pose } from "./life";
import { theme } from "./theme";
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
    { m: 1.6, amp: 2.6 }, // standing up: the whole page, and watching the ink
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
  /** The boil is on: a dot released from hold was alive until then, and goes on the page spent (page.ts CLARITY). */
  ghost?: boolean;
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
    if (m?.t === "cross" && (m.kind === "kill" || m.kind === "lost") && ink.p(k) <= 0) dying.add(`${m.x},${m.y}`);
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
  const hold: Hold = { dots: new Set(), bases: new Set(), marks: new Set(), ghost: o.on && side === "living", sig: "" };
  const plan: Plan = { hold, dots: [], bases: [], marks: [], sig: "" };
  const mover = o.moving !== undefined ? s.soldiers[o.moving] : undefined;
  const life = o.on || mover ? lifeOf(s, ink) : undefined;
  const riding = mover && life?.soldiers.has(mover.id) ? spotKey(mover) : undefined;
  if (riding) hold.dots.add(riding);
  if (o.on) {
    const boils = (living: boolean) => (side === "living" ? living : !living);
    // the living boil and can only die; the dead boil and the living may yet
    // join them, so on that side everything that can change stays off the page
    for (const spot of dotSpots(s)) {
      const living = life!.spots.has(spot.key);
      if (side === "living" && !living) continue;
      hold.dots.add(spot.key);
      if (spot.key === riding || ink.live.has(`d${spot.id}`) && living) continue;
      plan.dots.push({ spot, boils: boils(living) });
    }
    for (const b of s.bases) {
      const living = life!.bases.has(b.id);
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
  /** Its look at wall `ms`, if it has a life of its own (life.ts); the drawing is look % BOIL.variants. */
  look?: (ms: number) => number;
  /** Its pictures' page box, if smaller than its own (a living soldier's box has room to move in). */
  sbox?: { x0: number; y0: number; x1: number; y1: number };
  /** A living soldier (life.ts): drawn in his pose, round his spot. */
  body?: { id: number; x: number; y: number };
}

// Things bigger than this (page px, either side) are drawn as vectors each tick, not cached.
const SPRITE_MAX = 400;

/** A thing's pictures, in page pixels. */
function pixels(t: Thing, S: number) {
  const b = t.sbox ?? t;
  const px0 = Math.floor(b.x0 * S), py0 = Math.floor(b.y0 * S);
  return { px0, py0, pw: Math.ceil(b.x1 * S) - px0, ph: Math.ceil(b.y1 * S) - py0 };
}

/** The layer looks at the clock this often: fine enough for 8 fps swaps and soldiers' 12 fps poses. */
const GRID_FPS = 24;

/** A living soldier's drawing in pose `q`: his picture's box, moved and scaled (page units). */
function bodyBox(b: { x: number; y: number }, q: Pose) {
  const h = (RULES.soldierRadius * 1.4 + 3) * q.k * Math.max(q.st, 1 / q.st) + 1, x = b.x + q.ox, y = b.y + q.oy;
  return [x - h, y - h, x + h, y + h];
}

/** At rest to a third of a pixel at scale S: drawn by the plain copy. */
function atRest(q: Pose, S: number) {
  const R = RULES.soldierRadius * 1.3 * S;
  return Math.abs(q.ox * S) < 0.33 && Math.abs(q.oy * S) < 0.33 && Math.abs(q.k * q.st - 1) * R < 0.33 && Math.abs(q.k / q.st - 1) * R < 0.33;
}

/**
 * A pose as a whole number, so a soldier's look changes when his pose does
 * (to an eighth of a page unit): 0 at rest. Any change in how he's drawn is a
 * change of look, so he's redrawn whole, never half-moved under someone else's box.
 */
function poseCode(q: Pose, S: number) {
  if (atRest(q, S)) return 0;
  const n = [q.ox * 8, q.oy * 8, q.k * 256, q.st * 256, q.ax * 256].map(Math.round);
  let h = 7;
  for (const v of n) h = (Math.imul(h ^ v, 16777619) >>> 0);
  return 1 + (h % 1_000_000);
}

/**
 * The layer transform that draws page point p at its place in pose `q` round
 * `c`: stretched along q.ax (and 1/st across), swelled by k, moved off by
 * (ox, oy). Canvas layer pixels = S * page - (X, Y).
 */
function posed(g: Ctx, q: Pose, c: { x: number; y: number }, S: number, X: number, Y: number) {
  const cs = Math.cos(q.ax), sn = Math.sin(q.ax), a = q.k * q.st, b = q.k / q.st;
  const m11 = a * cs * cs + b * sn * sn, m12 = (a - b) * cs * sn, m22 = a * sn * sn + b * cs * cs;
  const ex = S * (c.x + q.ox - (m11 * c.x + m12 * c.y)) - X, ey = S * (c.y + q.oy - (m12 * c.x + m22 * c.y)) - Y;
  g.setTransform(S * m11, S * m12, S * m12, S * m22, ex, ey);
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
  private themeId = "";
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
  /**
   * Each living soldier's pose when last drawn, and his page box in it: his
   * dirty box is that and where he's going, not all the room he has to move
   * in, and a redraw under someone else's box draws him exactly as he stands.
   */
  private poses: (Pose | undefined)[] = [];
  private drawn: (number[] | undefined)[] = [];
  /** Whether things that left the canvas are still to be cleared. */
  get clearing() { return this.gone.length > 0; }

  /** `part`: the camps' rings, or everything else (soldiers, and marks when the dead boil). `life`: soldiers' and camps' moods, if they have them. */
  constructor(private part: "rings" | "rest", private life: () => Life | null) {
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
    // a new paper is new ink: every sprite is drawn again in its pens
    if (theme.id !== this.themeId) { this.forget(() => true); this.themeId = theme.id; this.sig = ""; this.shown = null; }
    if (sig === this.sig && S === this.S) return;
    const was = S === this.S && this.shown ? new Map(this.things.map((t, i) => [`${t.key}|${+t.boils}`, { t, look: this.shown![i], pose: this.poses[i], drawn: this.drawn[i] }])) : null;
    const geometry = [this.ox, this.oy, this.c.width, this.c.height].join();
    if (S !== this.S) this.forget(() => true);
    this.sig = sig;
    this.S = S;
    const pad = 3;
    const R = RULES.soldierRadius * 1.4 + pad;
    const things: Thing[] = [];
    const life = this.life();
    for (const { spot, boils } of rings ? [] : plan.dots) {
      const x = s.soldiers[spot.id];
      const sbox = { x0: spot.x - R, y0: spot.y - R, x1: spot.x + R, y1: spot.y + R };
      const paint = (g: Ctx, w: number, amp: number) => {
        drawDot(g, x, 1, 1, spot, w, amp);
        // the living wear a ring (it boils with him); the dead and gone don't
        if (boils && CLARITY.ring && !CLARITY.hollow) inkCircle(g, spot.x, spot.y, RULES.soldierRadius + 4, INK.pens[x.owner], x.id * 131 + 91, 1.3 * theme.ink.width, 1, 1, w, amp);
      };
      if (!boils || !life) { things.push({ key: spot.key, boils, ...sbox, paint }); continue; }
      // a living soldier with a life: room round his spot to move in, drawn in his
      // pose; his heartbeat is how fast his drawings swap (racing, or held still)
      const L = LIFE_BOX, id = x.id, key = spot.key;
      things.push({
        key, boils, x0: spot.x - L, y0: spot.y - L, x1: spot.x + L, y1: spot.y + L, sbox, paint, body: { id, x: spot.x, y: spot.y },
        look: (ms) => {
          const f = boilFrame(ms, LIFE_FPS);
          const wob = variantAt(Math.floor((life.scribble(id, f) * BOIL.fps) / LIFE_FPS), key);
          return wob + BOIL.variants * poseCode(life.pose(id, f * LIFE_FRAME), S);
        },
      });
    }
    for (const { id, boils } of rings ? plan.bases : []) {
      const b = s.bases[id];
      // room for the boldest redrawing's stray
      const r = b.r * 1.16 + 4 + pad;
      const key = `b${id}@${b.seed}`, phase = hash(key) / 2 ** 32;
      things.push({
        key, boils, x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r, paint: (g, w, amp) => drawBase(g, b, 1, w, amp),
        // a camp's mood is how fast its drawings swap: brisk full, tired emptying,
        // hurried under fire, held still for a beat when one of its men falls
        look: boils && life ? (ms) => {
          const u = life.ring(id, boilFrame(ms, LIFE_FPS), 1000 / BOIL.fps, phase);
          return variantAt(Number.isFinite(u) ? Math.floor(u) : boilFrame(ms), key);
        } : undefined,
      });
    }
    for (const { i, boils } of rings ? [] : plan.marks) {
      const m = s.marks[i];
      let x0: number, y0: number, x1: number, y1: number;
      const pts = m.t === "stroke" ? m.pts : m.t === "walk" ? [m.a, m.b] : m.t === "stand" ? m.at : null;
      if (pts) {
        const e = m.t === "stand" ? RULES.soldierRadius + 16 : 10;
        x0 = Math.min(...pts.map((p) => p.x)) - e; x1 = Math.max(...pts.map((p) => p.x)) + e;
        y0 = Math.min(...pts.map((p) => p.y)) - e; y1 = Math.max(...pts.map((p) => p.y)) + e;
      } else if (m.t === "cross") {
        const r = RULES.soldierRadius * 4.4 + pad;
        x0 = m.x - r; y0 = m.y - r; x1 = m.x + r; y1 = m.y + r;
      } else continue;
      things.push({ key: `m${i}@${m.seed}`, boils, x0, y0, x1, y1, paint: (g, w) => drawMark(g, m, 1, w, wentTo(s, i)) });
    }
    this.things = things;
    this.poses = [];
    this.drawn = [];
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
      // Retained pixels keep their exact pose and dirty bounds across membership changes.
      this.poses = things.map((t) => was.get(`${t.key}|${+t.boils}`)?.pose);
      this.drawn = things.map((t) => was.get(`${t.key}|${+t.boils}`)?.drawn);
      const kept = new Set(things.map((t) => `${t.key}|${+t.boils}`));
      for (const [k, { t }] of was) if (!kept.has(k)) this.gone.push([t.x0, t.y0, t.x1, t.y1]);
    } else {
      this.shown = null; // draw everything on the next tick
      this.gone = [];
    }
  }

  /**
   * Queue the sprites still missing, made a few a tick: boldness `bold`'s
   * first, first drawings first, then the other boldness's, so a camera
   * going up or down later finds them made. Until one is made its thing is
   * drawn from a stand-in (the same drawing at another boldness, or the page's drawing).
   */
  private queue(bold: number) {
    this.later = [];
    const asked = new Set<string>();
    for (const b of [bold, ...BOIL.bold.keys()]) for (let w = 0; w < BOIL.variants; w++) for (const t of this.things) {
      if (!t.boils && w > 0) continue;
      const k = spriteKey(t, w, b);
      if (!this.sprites.has(k) && !asked.has(k)) { asked.add(k); this.later.push({ t, wob: w, bold: b }); }
    }
  }

  /**
   * Bring the canvas up to wall time `ms`, at boldness `bold`. `seen` is the
   * part of the page on screen: what's outside it isn't redrawn until it
   * comes into view. Returns whether anything was drawn.
   */
  draw(ms: number, bold: number, seen?: { x0: number; y0: number; x1: number; y1: number }) {
    const grid = boilFrame(ms, GRID_FPS);
    // a new boldness is every living thing drawn anew: the whole canvas, once
    if (bold !== this.bold) { this.bold = bold; this.queue(bold); if (this.boiling) this.shown = null; }
    const news = this.shown?.some((v) => Number.isNaN(v)) || this.gone.length > 0;
    if (grid === this.grid && this.shown && !news) return false;
    this.grid = grid;
    const all = !this.shown;
    // nothing boiling and already drawn: it holds still
    if (!all && !news && !this.boiling) return false;
    const inView = (t: Thing) => !seen || (t.x1 > seen.x0 && t.x0 < seen.x1 && t.y1 > seen.y0 && t.y0 < seen.y1);
    const look = (t: Thing) => (t.look ? t.look(ms) : lookAt(t.boils, t.key, ms));
    const now = this.things.map((t, i) => (all || inView(t) ? look(t) : this.shown![i]));
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
    // each living soldier's pose this tick: the new one if his look changed, else the one he was drawn in
    const life = this.life(), dset = new Set(dirty), f = boilFrame(ms, LIFE_FPS);
    // (a pose that differs from the drawn one by less than poseCode sees is the drawn one: he isn't moved for nothing)
    const pose = this.things.map((t, i) => {
      if (!t.body || !life) return undefined;
      const was = this.poses[i];
      if (was && !dset.has(i) && !all) return was;
      const q = life.pose(t.body.id, f * LIFE_FRAME);
      return was && poseCode(was, S) === poseCode(q, S) ? was : q;
    });
    // each thing's page box this tick: a living soldier's is where he was drawn and where he's going
    const ext = this.things.map((t, i) => {
      const full = [t.x0, t.y0, t.x1, t.y1];
      if (!t.body || !pose[i]) return full;
      const was = this.drawn[i] ?? full;
      if (!dset.has(i)) return was;
      const nb = bodyBox(t.body, pose[i]!);
      return all ? full : [Math.min(was[0], nb[0]), Math.min(was[1], nb[1]), Math.max(was[2], nb[2]), Math.max(was[3], nb[3])];
    });
    const rects: number[][] = gone.map(px);
    for (const i of dirty) rects.push(px(ext[i]));
    const box = ext.map(px);
    const touches = (i: number, [x, y, w, h]: number[]) => {
      const [a, b, c, d] = box[i];
      return x < a + c && a < x + w && y < b + d && b < y + h;
    };
    const whole = all || (!gone.length && dirty.length === this.things.length);
    const ink = (list: number[]) => {
      // ink multiplies (light ink on dark paper screens), on this layer as on the page, so overlaps build the same way
      g.globalCompositeOperation = inkOp();
      for (const i of list) {
        const t = this.things[i], q = pose[i];
        if (!this.paint(t, now[i] % BOIL.variants, X, Y, q)) steady = false;
        if (t.body && q) { this.poses[i] = q; this.drawn[i] = bodyBox(t.body, q); }
      }
      g.globalCompositeOperation = "source-over";
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    if (whole) {
      if (all) g.clearRect(0, 0, this.c.width, this.c.height);
      else for (const [x, y, w, h] of rects) g.clearRect(x, y, w, h);
      ink(this.things.map((_, i) => i));
    } else {
      // One box at a time, each cleared and redrawn whole inside a clip to it
      // alone, so where boxes overlap the ink isn't laid twice. Never one clip
      // made of several boxes: Chrome on Android (S23+, Chrome 154) draws no
      // image at all through one when the ink multiplies, and camps vanished.
      for (const r of rects) {
        const [x, y, w, h] = r;
        g.clearRect(x, y, w, h);
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        ink(this.things.flatMap((_, i) => (touches(i, r) ? [i] : [])));
        g.restore();
      }
    }
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
  private paint(t: Thing, wob: number, X: number, Y: number, q?: Pose) {
    const g = this.g, S = this.S;
    const { px0, py0, pw, ph } = pixels(t, S);
    const sp = this.sprite(t, wob);
    if (t.body && q && !atRest(q, S)) {
      // a living soldier, in his pose: one transformed copy
      posed(g, q, t.body, S, X, Y);
      if (sp) g.drawImage(sp.batch.src, sp.x, sp.y, pw, ph, px0 / S, py0 / S, pw / S, ph / S);
      else t.paint(g, wob, BOIL.bold[Math.max(0, this.bold)].amp);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return !!sp;
    }
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
    g.globalCompositeOperation = inkOp();
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
  /** Soldiers' and camps' moods (life.ts); without it they simply boil. */
  life: Life | null = null;
  readonly parts = [new BoilCanvas("rings", () => this.life), new BoilCanvas("rest", () => this.life)];
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
    // a canvas with something to clear goes first: a thing that left it is already baked into the page
    const first = this.parts.findIndex((p) => p.clearing);
    for (let k = 0; k < this.parts.length && !drew; k++) {
      const i = first >= 0 && k === 0 ? first : (this.turn + k - (first >= 0 ? 1 : 0)) % this.parts.length, p = this.parts[i];
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
