// Line boil: what is alive on the page is being drawn, over and over.
//
// A camp still manned is being drawn right now: a pen goes round it without
// stopping, fresh ink over the lap before, never quite the same circle twice.
// A soldier still standing is redrawn a few times a second by the same hand,
// the way a hand-drawn cartoon's lines crawl between frames: the shape stays,
// the line that forms it shifts. (BOIL_STYLE picks either way for either.)
// The dead (crossed-out soldiers, emptied camps, the ink lines) are dry and
// perfectly still.
//
// The page is append-only, so anything that boils is held off it and drawn on
// a small layer of its own: pre-drawn sprites for swapped drawings, fresh ink
// for a camp being drawn, redrawn only where something changed. The moment a
// thing stops boiling it is multiplied onto the page like every other mark and
// leaves the layer.

import type { GameState, Soldier } from "./game";
import { inBase } from "./hand";
import { INK, LAP_CHANGES, inkLaps, inkScribbledDot, lapPath } from "./ink";
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

/**
 * How a boiling thing boils. "swap": a few drawings of it, swapped at boil
 * rate, like a cartoon's lines crawling. "draw": it is being drawn, now: a pen
 * goes round a camp without stopping, laying fresh ink over the lap before,
 * never quite the same circle twice (for a soldier, a tiny scribble round his
 * dot). Things that don't boil are still either way.
 */
export const BOIL_STYLE: Record<"camps" | "soldiers", "swap" | "draw"> = { camps: "draw", soldiers: "draw" };

export const BOIL = {
  /** "swap": new drawings a second, on threes at 24fps. */
  fps: 8,
  /** "draw": how many times a second the pen's head moves on, on twos at 24fps. */
  drawFps: 12,
  /** "draw": one lap of the pen round a camp (ms). */
  lapMs: 1700,
  /** "draw": a soldier's scribble as a loop of pictures at drawFps, going round `dotLaps` times a loop. */
  dotFrames: 12,
  dotLaps: 2,
  /** Scribbles per side, shared among its soldiers. */
  dotShapes: 6,
  /** Drawings per thing, cycled. Drawing 0 is the one the page keeps. */
  variants: 3,
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

type Style = "still" | "swap" | "draw";

interface Thing {
  key: string;
  boils: boolean;
  style: Style;
  /** Page-space box. */
  x0: number; y0: number; x1: number; y1: number;
  /** How many pictures it cycles through (1: it holds still), which one shows at look `look`, and how to draw picture `i`. */
  frames: number;
  frameAt: (look: number) => number;
  paint: (g: Ctx, i: number) => void;
  /** Whose pictures it uses, if not its own: soldiers share a few scribbles a side. */
  sprite: string;
  /** A camp being drawn: fresh ink every tick instead of pictures, its pen `u` turns in. */
  drawn?: {
    lapMs: number; phase: number;
    paint: (g: Ctx, u: number, near?: [number, number]) => void;
    /** Its pen's path, so only the stretch round the head need be redrawn. */
    path: (t: number) => [number, number];
  };
  /** A camp's ring has nothing inside this circle: soldiers in there don't touch it. */
  hole?: { x: number; y: number; r: number };
}

// Things bigger than this (page px, either side) are drawn as vectors each tick, not cached.
const SPRITE_MAX = 400;
/** The layer looks at the clock this often: fine enough for both 8 fps swaps and 12 fps drawing. */
const GRID_FPS = 24;

function pixels(t: Thing, S: number) {
  const px0 = Math.floor(t.x0 * S), py0 = Math.floor(t.y0 * S);
  return { px0, py0, pw: Math.ceil(t.x1 * S) - px0, ph: Math.ceil(t.y1 * S) - py0 };
}

interface Batch { src: CanvasImageSource; n: number }
interface Sprite { batch: Batch; x: number; y: number }

/** Pictures for a still or swapping thing: its settled drawing, or its drawings cycled at boil rate. */
function drawings(style: Style) {
  return style === "swap" ? { frames: BOIL.variants, frameAt: (look: number) => look } : { frames: 1, frameAt: () => 0 };
}

/** Where a camp's pen is, in turns, at look (drawing frame) `look`: it moves on only on drawing frames. */
const headAt = (d: NonNullable<Thing["drawn"]>, look: number) => (look * 1000) / BOIL.drawFps / d.lapMs + d.phase;

/**
 * A thing's look at wall time `ms`: which drawing it shows ("swap"), or which
 * step round the pen has reached ("draw"). It changes exactly when the thing
 * must be redrawn; a still thing never does.
 */
export function lookAt(style: "still" | "swap" | "draw", key: string, ms: number) {
  if (style === "swap") return variantAt(boilFrame(ms), key);
  if (style === "draw") return boilFrame(ms, BOIL.drawFps);
  return -1;
}

/**
 * One boil canvas: page space, covering only what it draws, placed by the same
 * CSS matrix as the page, so the camera never redraws it. A thing is redrawn
 * only when its look changes (a swap, or the pen moving on), and only inside
 * its own box (for a ring, the box round its pen's head): what overlaps that
 * box is redrawn clipped to it.
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
  /** The clock grid step last looked at, and each thing's look when last drawn (null: draw everything). */
  private grid = -1;
  private shown: number[] | null = null;
  /** Where each thing's drawings sit: `${key}|${drawing}`. */
  private sprites = new Map<string, Sprite>();
  /** Drawings still to make, a few each tick. */
  private later: { t: Thing; wob: number }[] = [];
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
    const sig = `${plan.sig}|${BOIL_STYLE.camps}${BOIL_STYLE.soldiers}`;
    const rings = this.part === "rings";
    if (sig === this.sig && S === this.S) return;
    const was = S === this.S && this.shown ? new Map(this.things.map((t, i) => [`${t.key}|${t.style}`, { t, look: this.shown![i] }])) : null;
    const geometry = [this.ox, this.oy, this.c.width, this.c.height].join();
    if (S !== this.S) this.forget(() => true);
    this.sig = sig;
    this.S = S;
    const pad = 3;
    const R = RULES.soldierRadius * 1.4 + pad;
    const style = (boils: boolean, s: "swap" | "draw"): Style => (boils ? s : "still");
    const things: Thing[] = [];
    for (const { spot, boils } of rings ? [] : plan.dots) {
      const x = s.soldiers[spot.id];
      const st = style(boils, BOIL_STYLE.soldiers);
      const box = { x0: spot.x - R, y0: spot.y - R, x1: spot.x + R, y1: spot.y + R };
      if (st === "draw") {
        // a scribble going round: a short loop of pictures, each dot starting at its own place in it
        // One dot is as good as another, so each side has a handful of scribbles,
        // shared, each dot at its own place in its own one: the pictures don't
        // grow with the army, and a man who moves needs no new ones. (A shared
        // picture sits up to half a pixel off a dot's exact place.)
        const F = BOIL.dotFrames, h = hash(spot.key), start = h % F, shape = (h >>> 8) % BOIL.dotShapes;
        things.push({
          key: spot.key, boils, style: st, ...box, frames: F, frameAt: (look) => (look + start) % F, sprite: `dot${x.owner}.${shape}`,
          paint: (g, i) => inkScribbledDot(g, spot.x, spot.y, RULES.soldierRadius, INK.pens[x.owner], 7777 + x.owner * 97 + shape * 13, (i / F) * BOIL.dotLaps, BOIL.dotLaps),
        });
      } else {
        things.push({ key: spot.key, boils, style: st, ...box, ...drawings(st), sprite: spot.key, paint: (g, w) => drawDot(g, x, 1, 1, spot, w) });
      }
    }
    for (const { id, boils } of rings ? plan.bases : []) {
      const b = s.bases[id];
      const r = b.r * 1.12 + 4 + pad;
      const key = `b${id}@${b.seed}`, h = hash(key);
      const path = lapPath(b.x, b.y, b.r, b.seed);
      const st = style(boils, BOIL_STYLE.camps);
      things.push({
        key, boils, style: st, x0: b.x - r, y0: b.y - r, x1: b.x + r, y1: b.y + r, sprite: key,
        ...(st === "draw" ? { frames: 0, frameAt: () => 0 } : drawings(st)),
        paint: (g, w) => drawBase(g, b, 1, w),
        // every camp's pen at its own place round, and its own pace
        drawn: st === "draw" ? { lapMs: BOIL.lapMs * (0.9 + (h % 100) / 500), phase: (h >>> 8) / 2 ** 24, path, paint: (g, u, near) => inkLaps(g, path, u, INK.pens[b.owner], 2.8, near) } : undefined,
        // inside the ring's narrowest reach (drift, wave, squash, the pen's ball), with room to spare
        hole: { x: b.x, y: b.y, r: b.r * 0.8 },
      });
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
      const key = `m${i}@${m.seed}`, st = style(boils, "swap");
      things.push({ key, boils, style: st, x0, y0, x1, y1, ...drawings(st), sprite: key, paint: (g, w) => drawMark(g, m, 1, w) });
    }
    this.things = things;
    const keep = new Set(things.map((t) => t.sprite));
    this.forget((k) => !keep.has(k.slice(0, k.lastIndexOf("|"))));
    // sprites for what's new are made a few a tick, first pictures first; until
    // then a thing is drawn as ink straight onto the layer. A camp being drawn
    // needs none: it is ink every time.
    this.later = [];
    const most = Math.max(0, ...things.map((t) => t.frames));
    const asked = new Set<string>();
    for (let i = 0; i < most; i++) for (const t of things) {
      const k = `${t.sprite}|${i}`;
      if (i < t.frames && !this.sprites.has(k) && !asked.has(k)) { asked.add(k); this.later.push({ t, wob: i }); }
    }
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
      this.shown = things.map((t) => was.get(`${t.key}|${t.style}`)?.look ?? NaN);
      const kept = new Set(things.map((t) => `${t.key}|${t.style}`));
      for (const [k, { t }] of was) if (!kept.has(k)) this.gone.push([t.x0, t.y0, t.x1, t.y1]);
    } else {
      this.shown = null; // draw everything on the next tick
      this.gone = [];
    }
  }

  /**
   * Bring the canvas up to wall time `ms`. `seen` is the part of the page on
   * screen: what's outside it isn't redrawn until it comes into view.
   * Returns whether anything was drawn.
   */
  draw(ms: number, seen?: { x0: number; y0: number; x1: number; y1: number }) {
    const grid = boilFrame(ms, GRID_FPS);
    const news = this.shown?.some((v) => Number.isNaN(v)) || this.gone.length > 0;
    if (grid === this.grid && this.shown && !news) return false;
    this.grid = grid;
    const all = !this.shown;
    // nothing boiling and already drawn: it holds still
    if (!all && !news && !this.boiling) return false;
    const inView = (t: Thing) => !seen || (t.x1 > seen.x0 && t.x0 < seen.x1 && t.y1 > seen.y0 && t.y0 < seen.y1);
    const now = this.things.map((t, i) => (all || inView(t) ? lookAt(t.style, t.key, ms) : this.shown![i]));
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
    // the dirty boxes, in layer pixels; everything touching one is redrawn inside it.
    // A camp being drawn only changes round its pen's head: just that box.
    const px = ([x0, y0, x1, y1]: number[]) => [Math.floor(x0 * S) - X - 1, Math.floor(y0 * S) - Y - 1, Math.ceil(x1 * S) - Math.floor(x0 * S) + 2, Math.ceil(y1 * S) - Math.floor(y0 * S) + 2];
    const near: ([number, number] | undefined)[] = [];
    const rects: number[][] = gone.map(px);
    for (const i of dirty) {
      const t = this.things[i];
      const win = all ? undefined : this.headWindow(t, this.shown![i], now[i]);
      near[i] = win?.near;
      rects.push(px(win?.box ?? [t.x0, t.y0, t.x1, t.y1]));
    }
    const touches = (t: Thing, [x, y, w, h]: number[]) => {
      const [a, b, c, d] = px([t.x0, t.y0, t.x1, t.y1]);
      if (!(x < a + c && a < x + w && y < b + d && b < y + h)) return false;
      if (!t.hole) return true;
      // a box wholly inside the ring's hole doesn't touch the ring
      const o = t.hole, cx = o.x * S - X, cy = o.y * S - Y, R = o.r * S;
      return ![[x, y], [x + w, y], [x, y + h], [x + w, y + h]].every(([p, q]) => Math.hypot(p - cx, q - cy) < R);
    };
    const whole = all || (!gone.length && dirty.length === this.things.length && dirty.every((i) => !near[i]));
    const redraw: number[] = [];
    this.things.forEach((t, i) => {
      if (whole) return void redraw.push(i);
      const hits = rects.filter((r) => touches(t, r));
      if (!hits.length) return;
      // traced near its head only if nothing but its own head box needs it
      if (near[i] && hits.length > 1) near[i] = undefined;
      redraw.push(i);
    });
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
    for (const i of redraw) if (!this.paint(this.things[i], now[i], X, Y, near[i])) steady = false;
    g.restore();
    g.globalCompositeOperation = "source-over";
    this.shown = now;
    this.steady = steady;
    return true;
  }

  /** Draw one thing as it looks now. Returns false if it had to be drawn as ink because its sprite isn't made yet. */
  private paint(t: Thing, state: number, X: number, Y: number, near?: [number, number]) {
    const g = this.g, S = this.S;
    const { px0, py0, pw, ph } = pixels(t, S);
    const ink = (f: () => void) => { g.setTransform(S, 0, 0, S, -X, -Y); f(); g.setTransform(1, 0, 0, 1, 0, 0); };
    if (t.drawn) {
      const d = t.drawn;
      ink(() => d.paint(g, headAt(d, state), near));
      return true;
    }
    const i = t.frameAt(state);
    // a picture not made yet: its first picture stands in, while there is one
    const sp = this.sprites.get(`${t.sprite}|${i}`) ?? this.sprites.get(`${t.sprite}|0`);
    if (sp) { g.drawImage(sp.batch.src, sp.x, sp.y, pw, ph, px0 - X, py0 - Y, pw, ph); return true; }
    // not made yet, or too big to cache (a whole ink line, when the dead boil)
    ink(() => t.paint(g, i));
    return pw > SPRITE_MAX || ph > SPRITE_MAX;
  }

  /**
   * A camp whose pen moved from look `was` to `now`: the page box round the
   * head that covers everything that changed, and how far round to trace (a
   * little past the box, so no stroke ends inside it). Undefined: redraw it all.
   */
  private headWindow(t: Thing, was: number, now: number) {
    const d = t.drawn;
    if (!d || !(was >= 0)) return undefined;
    const u = headAt(d, now), step = u - headAt(d, was);
    if (step <= 0 || step > 0.3) return undefined;
    const behind = LAP_CHANGES.behind + step + 0.02, ahead = LAP_CHANGES.ahead + 0.02;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k <= 6; k++) {
      const tt = u - behind + ((behind + ahead) * k) / 6;
      for (const lap of [0, 1, 2]) {
        const [x, y] = d.path(tt - lap);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    const pad = 5;
    // traced a little past the box's ends (a fifth of a lap is well clear of a box this size)
    return { box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], near: [behind + 0.06, ahead + 0.06] as [number, number] };
  }

  /**
   * Draw these drawings, packed in rows on one new canvas that is never drawn
   * into again; the ticks then only copy. (A canvas per sprite costs far more
   * to make than its ink, and drawing into a canvas that has been copied from
   * makes the browser copy all of it.)
   */
  private predraw(list: { t: Thing; wob: number }[]) {
    const S = this.S, W = 1024;
    const todo: { t: Thing; wob: number; x: number; y: number; pw: number; ph: number; px0: number; py0: number }[] = [];
    let x = 0, y = 0, row = 0, w = 0;
    for (const { t, wob } of list) {
      const { px0, py0, pw, ph } = pixels(t, S);
      if (pw > SPRITE_MAX || ph > SPRITE_MAX || this.sprites.has(`${t.sprite}|${wob}`)) continue;
      if (x + pw > W) { x = 0; y += row; row = 0; }
      todo.push({ t, wob, x, y, pw, ph, px0, py0 });
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
      d.t.paint(g, d.wob);
    }
    const batch: Batch = { src: off ? (c as OffscreenCanvas).transferToImageBitmap() : (c as HTMLCanvasElement), n: todo.length };
    for (const d of todo) this.sprites.set(`${d.t.sprite}|${d.wob}`, { batch, x: d.x, y: d.y });
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
 * else, so a soldier swapping his drawing never makes a ring be traced again
 * and a pen moving round a ring never re-copies the soldiers inside it. Ink
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
   * Bring the layer up to wall time `ms`. One canvas a frame at most, taking
   * turns: when both are due (a slow phone's frames are far apart) the other
   * catches up next frame, so no frame pays for both. Returns whether anything
   * was drawn.
   */
  draw(ms: number, seen?: { x0: number; y0: number; x1: number; y1: number }) {
    const t0 = performance.now();
    let drew = false, steady = true;
    for (let k = 0; k < this.parts.length && !drew; k++) {
      const i = (this.turn + k) % this.parts.length, p = this.parts[i];
      if (p.draw(ms, seen)) { drew = true; steady = p.steady; this.turn = i + 1; }
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
