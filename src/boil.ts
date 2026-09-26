// Line boil: what is alive on the page is being drawn, over and over.
//
// A soldier still standing and a camp still manned are redrawn a few times a
// second by the same hand, the way a hand-drawn cartoon's lines crawl between
// frames: the shape stays, the line that forms it shifts. The dead (crossed
// out soldiers, emptied camps, the ink lines) are dry and perfectly still.
//
// The page is append-only, so anything that boils is held off it and drawn on
// a small layer of its own from pre-drawn sprites, a few drawings per thing,
// swapped at boil rate. The moment a thing stops boiling it is multiplied onto
// the page like every other mark and leaves the layer.

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
  /** New drawings a second: on threes at 24fps. */
  fps: 8,
  /** Drawings per thing, cycled. Drawing 0 is the one the page keeps. */
  variants: 3,
  /** A boil tick costing more than this (ms, median of recent ticks) and the device can't afford it: stop. */
  budgetMs: 6,
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
  paint: (g: Ctx, wob: number) => void;
}

// Things bigger than this (page px, either side) are drawn as vectors each tick, not cached.
const SPRITE_MAX = 400;

/**
 * The boil layer: a page-space canvas covering only the living things, placed
 * by the same CSS matrix as the page, so the camera never redraws it. It is
 * redrawn when the boil frame ticks or the set of living things changes, and
 * only inside the boxes of what it draws.
 */
export class BoilLayer {
  readonly c: HTMLCanvasElement;
  private g: Ctx;
  private S = 0;
  /** The page point at canvas pixel (0, 0): where the layer sits on the page. */
  ox = 0;
  oy = 0;
  private things: Thing[] = [];
  private sig = "";
  private frame = -1;
  private sprites = new Map<string, { c: CanvasImageSource; u: number; w: number }>();
  private drawn: [number, number, number, number][] = [];
  /** Recent tick costs (ms), to judge whether the device can afford the boil. */
  private recent: number[] = [];
  /** The device can't afford the boil: set once ticks run over budget. */
  tooDear = false;
  redraws = 0;

  constructor() {
    this.c = document.createElement("canvas");
    this.c.id = "boil";
    this.g = this.c.getContext("2d")!;
  }

  get empty() { return this.things.length === 0; }
  get boiling() { return this.things.some((t) => t.boils); }

  /** Take this frame's plan (cheap when it hasn't changed). */
  set(plan: Plan, s: GameState, S: number) {
    if (plan.sig === this.sig && S === this.S) return;
    if (S !== this.S) { for (const sp of this.sprites.values()) if (sp.c instanceof ImageBitmap) sp.c.close(); this.sprites.clear(); }
    this.sig = plan.sig;
    this.S = S;
    const pad = 3;
    const R = RULES.soldierRadius * 1.4 + pad;
    const things: Thing[] = [];
    for (const { spot, boils } of plan.dots) {
      const x = s.soldiers[spot.id];
      things.push({ key: spot.key, boils, x0: spot.x - R, y0: spot.y - R, x1: spot.x + R, y1: spot.y + R, paint: (g, w) => drawDot(g, x, 1, 1, spot, w) });
    }
    for (const { id, boils } of plan.bases) {
      const b = s.bases[id];
      const r = b.r * 1.12 + 4 + pad;
      things.push({ key: `b${id}@${b.seed}`, boils, x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r, paint: (g, w) => drawBase(g, b, 1, w) });
    }
    for (const { i, boils } of plan.marks) {
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
    this.prune();
    this.frame = -1; // redraw on the next tick, whatever frame it is
    // the canvas covers what it draws, snapped to whole pixels on the page's grid
    if (things.length) {
      const px0 = Math.floor(Math.min(...things.map((t) => t.x0)) * S), py0 = Math.floor(Math.min(...things.map((t) => t.y0)) * S);
      const px1 = Math.ceil(Math.max(...things.map((t) => t.x1)) * S), py1 = Math.ceil(Math.max(...things.map((t) => t.y1)) * S);
      this.ox = px0 / S; this.oy = py0 / S;
      if (this.c.width !== px1 - px0 || this.c.height !== py1 - py0) { this.c.width = px1 - px0; this.c.height = py1 - py0; this.drawn = []; }
    }
  }

  /** Draw boil frame `frame` if it isn't already up. Returns whether anything was drawn. */
  draw(frame: number) {
    if (frame === this.frame) return false;
    // nothing boiling: one still drawing is enough
    if (this.frame >= 0 && !this.boiling) return false;
    this.frame = frame;
    const t0 = performance.now();
    const g = this.g, S = this.S;
    const X = Math.round(this.ox * S), Y = Math.round(this.oy * S);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    for (const [x, y, w, h] of this.drawn) g.clearRect(x, y, w, h);
    this.drawn = [];
    // ink multiplies, on this layer as on the page, so overlaps darken the same way
    g.globalCompositeOperation = "multiply";
    for (const t of this.things) {
      const wob = t.boils ? variantAt(frame, t.key) : 0;
      const px0 = Math.floor(t.x0 * S), py0 = Math.floor(t.y0 * S), pw = Math.ceil(t.x1 * S) - px0, ph = Math.ceil(t.y1 * S) - py0;
      if (pw > SPRITE_MAX || ph > SPRITE_MAX) {
        g.setTransform(S, 0, 0, S, -X, -Y);
        t.paint(g, wob);
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else g.drawImage(this.sprite(t, wob, px0, py0, pw, ph), px0 - X, py0 - Y);
      this.drawn.push([px0 - X - 1, py0 - Y - 1, pw + 2, ph + 2]);
    }
    g.globalCompositeOperation = "source-over";
    this.redraws++;
    this.cost(performance.now() - t0);
    return true;
  }

  // A sprite is drawn once per drawing, then only copied. Where the browser
  // can, it's an ImageBitmap: immutable, so it goes to the GPU once.
  private sprite(t: Thing, wob: number, px0: number, py0: number, pw: number, ph: number) {
    const k = `${t.key}|${wob}`;
    let sp = this.sprites.get(k);
    if (!sp || sp.u !== px0 || sp.w !== py0) {
      const off = typeof OffscreenCanvas !== "undefined";
      const c = off ? new OffscreenCanvas(pw, ph) : Object.assign(document.createElement("canvas"), { width: pw, height: ph });
      const g = c.getContext("2d") as Ctx;
      g.setTransform(this.S, 0, 0, this.S, -px0, -py0);
      g.globalCompositeOperation = "multiply";
      t.paint(g, wob);
      sp = { c: off ? (c as OffscreenCanvas).transferToImageBitmap() : (c as HTMLCanvasElement), u: px0, w: py0 };
      this.sprites.set(k, sp);
    }
    return sp.c;
  }

  // Sprites are drawn the first time each drawing shows, so the first ticks
  // after a change cost more: judge the device on the steady ticks.
  private cost(ms: number) {
    this.recent.push(ms);
    if (this.recent.length > 24) this.recent.shift();
    if (this.recent.length < 24) return;
    const med = [...this.recent].sort((a, b) => a - b)[this.recent.length >> 1];
    if (med > BOIL.budgetMs) this.tooDear = true;
  }

  /** Forget sprites of things no longer on the layer (a camp emptied, a soldier moved on). */
  private prune() {
    const live = new Set(this.things.map((t) => t.key));
    for (const [k, sp] of this.sprites) {
      if (live.has(k.slice(0, k.lastIndexOf("|")))) continue;
      if (sp.c instanceof ImageBitmap) sp.c.close();
      this.sprites.delete(k);
    }
  }
}
