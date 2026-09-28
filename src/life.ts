// Soldier life: what a scribbled dot does with its body.
//
// A soldier has no face. Everything he feels is carried by the four things a
// hand-drawn dot can do: move a little off his spot, squash and stretch along
// an axis, swell or shrink, and be redrawn faster or slower. How fast his
// drawings swap is his heartbeat (boil.ts swaps a living soldier between three
// drawings of his dot): calm, steadily; excited or scared, racing; when a
// comrade is crossed out it stops for a beat, the way you hold your breath.
//
// Everything here is presentation. Nothing reads or writes game state beyond
// looking at where soldiers stand; anything that varies is seeded from a
// soldier's id and the clock, so a pinned clock replays the same motion.
// Poses are sampled on the boil's 12 fps grid ("on twos"), so reactions are
// written as key drawings a frame apart, the way a 2D animator would.

import { type GameState, type Player, type Pt, type Soldier } from "./game";
import { inBase } from "./hand";
import { RULES } from "./rules";

/**
 * Every idea is its own switch, so each can be compared on and off.
 * (Dev: `pft.LIFE.voices = false`, live.)
 */
export const LIFE = {
  /** Eager little hops from the side whose go it is. (His breathing is his scribble.) */
  idle: true,
  /** The line: dread while a pen points at you, the flinch as ink passes (the headline), a gasp before it hits, the shooter's recoil. */
  line: true,
  /** A camp's feelings: cheering a kill, a beat of stillness for a man crossed out, nerves at a last stand, and a volley on a lunger who lands inside. */
  crowd: true,
  /** The one you pick up: he perks up, his campmates turn to him, he winds up under the pull, rides his ink and lands. */
  chosen: true,
  /** Gibberish voices, one per soldier (voice.ts). */
  voices: true,
  /** Tap your man again while leaning in: the camera drops to his eye level for a beat. */
  unitCam: true,
  /** The pen: it wobbles as it lands on a dot, shivers at full charge, and draws back before it flicks. */
  pen: true,
  /** A camp's pen: brisk round a full camp, tired round an emptying one, hurried when its men are in the line of fire, still for a beat when one falls. */
  camps: true,
  /** Haptics for these moments (feel.ts). */
  haptics: true,
  /** Now and then a comic bubble: a word or two on a torn scrap, or pencilled and ringed, beside him (bubble.ts). */
  bubbles: true,
};

/** 12 fps: the boil's drawing rate. One key drawing per frame. */
export const FPS = 12;
export const FRAME = 1000 / FPS;

/** How far a pose may take a dot from his spot: the boil layer's box has room for this, no more. */
export const REACH = { offset: 9, stretch: 1.42, scale: 1.14 };
/** Half the side of a living soldier's box on the boil layer (page units): his scribble at full stretch, off his spot. */
export const LIFE_BOX = REACH.offset + RULES.soldierRadius * 1.3 * REACH.stretch * REACH.scale + 3;

export interface Pose {
  /** Off his spot, page units. */
  ox: number;
  oy: number;
  /** Swell (>1) or shrink. */
  k: number;
  /** Stretch along `ax` (page radians); he keeps his volume, so across it he's 1/st. Under 1 is a squash. */
  st: number;
  ax: number;
  /** How fast he's being scribbled: 1 calm, 0 holding his breath, 2+ racing. */
  rate: number;
}
export const REST: Readonly<Pose> = Object.freeze({ ox: 0, oy: 0, k: 1, st: 1, ax: 0, rate: 1 });

// --- small seeded helpers ---------------------------------------------------------

export function hash(...n: number[]) {
  let h = 2166136261;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 16777619);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  }
  return (h ^ (h >>> 15)) >>> 0;
}
/** A seeded value in [0, 1). */
export const unit = (...n: number[]) => hash(...n) / 4294967296;

// --- key drawings ------------------------------------------------------------------
// Each reaction is a short run of key poses, one per 12 fps frame, in its own
// frame of reference: `d` is along the reaction's direction (a hop's "up" on
// screen, a flinch's "away from the line"), `s` a stretch along that direction
// (under 1 squashes), `k` a swell, `r` the scribble rate.

/** `side`: off to one side of the reaction's direction (a shake), in the same units as `d`. */
export interface Key { d?: number; s?: number; k?: number; r?: number; side?: number }

export const KEYS = {
  /** A hop: crouch, spring up stretched, hang, fall, land squashed, settle. */
  hop: [
    { d: 0, s: 0.76, k: 0.98 },
    { d: 0.55, s: 1.3 },
    { d: 1, s: 1.06 },
    { d: 0.62, s: 1.2 },
    { d: 0, s: 0.74, k: 1.02 },
    { d: 0, s: 1.08 },
  ],
  /**
   * A flinch as ink goes by, the page's favourite. He sees it coming and leans
   * away, tight; as it passes he jerks away, flattened and small, his heart
   * going like mad; he shakes; then a big breath out, "phew", and his
   * scribble slows right down before it comes back to itself. The ink passes
   * on the third key (FLINCH_HIT).
   */
  flinch: [
    { d: 0.15, s: 1.08, r: 2 },
    { d: 0.3, s: 1.14, k: 0.98, r: 2.6 },
    { d: 1, s: 0.58, k: 0.8, r: 4 },
    { d: 0.95, s: 0.7, k: 0.82, r: 4 },
    { d: 0.75, side: 0.3, s: 0.92, k: 0.88, r: 3.5 },
    { d: 0.6, side: -0.28, s: 1.04, k: 0.9, r: 3.2 },
    { d: 0.45, side: 0.22, k: 0.92, r: 3 },
    { d: 0.35, side: -0.16, k: 0.94, r: 2.8 },
    { d: 0.25, side: 0.1, k: 0.96, r: 2.5 },
    { d: 0.15, side: -0.05, k: 0.98, r: 2.2 },
    { d: 0.06, s: 1.04, k: 1.05, r: 1.2 },
    { d: 0, s: 1.06, k: 1.08, r: 0.5 },
    { k: 1.06, r: 0.4 },
    { k: 1.03, r: 0.6 },
    { k: 1.01, r: 0.85 },
  ],
  /** He sees it coming: rears back from the ink, tall and tight, scribbling wildly. */
  gasp: [
    { d: 0.2, s: 1.12, k: 1.02, r: 2.5 },
    { d: 0.5, s: 1.3, k: 1.06, r: 3.5 },
    { d: 0.7, s: 1.38, k: 1.08, r: 4 },
    { d: 0.75, s: 1.36, k: 1.08, r: 4 },
  ],
  /** The shooter as his pen goes: knocked back along the shot, then springing to. `d` is along the shot, so negative. */
  recoil: [
    { d: -0.8, s: 0.7, k: 1.02, r: 2 },
    { d: -0.5, s: 1.18, r: 1.8 },
    { d: -0.15, s: 0.94, r: 1.5 },
    { d: 0, s: 1.04, r: 1.3 },
  ],
  /** Picked up: a little crouch, then up on his toes, and settling tall. */
  perk: [
    { d: 0, s: 0.74, k: 0.96, r: 1.4 },
    { d: 0.45, s: 1.38, k: 1.1, r: 2.2 },
    { d: 0.25, s: 1.16, k: 1.07, r: 2 },
    { d: 0, s: 0.92, k: 1.04, r: 1.8 },
    { d: 0, s: 1.06, k: 1.05, r: 1.7 },
  ],
  /**
   * A defender turning on an intruder in his camp: he rounds on him, draws
   * back, and jabs (the line goes on JAB_FIRE), then eases off. `d` toward him.
   */
  jab: [
    { d: 0.3, s: 1.15, r: 2.5 },
    { d: 0.5, s: 1.25, k: 1.04, r: 3 },
    { d: -0.35, s: 0.78, k: 1.02, r: 3.5 },
    { d: 1, s: 1.38, r: 4 },
    { d: 0.55, s: 1.12, r: 3 },
    { d: 0.25, s: 1.04, r: 2 },
    { d: 0.1, r: 1.5 },
  ],
  /** Arriving where his ink stopped: squashed along the way he came, then up. `d` along his travel. */
  land: [
    { d: 0.5, s: 0.66, k: 1.04, r: 2 },
    { d: 0.2, s: 1.22, r: 1.8 },
    { d: 0, s: 0.9, r: 1.5 },
    { d: 0, s: 1.05, r: 1.2 },
  ],
} satisfies Record<string, Key[]>;

export type ReactionKind = keyof typeof KEYS | "cheer" | "mourn";
/** Which flinch key the ink passes on, and which jab key the line goes on. */
export const FLINCH_HIT = 2;
export const JAB_FIRE = 3;

export interface Reaction {
  kind: ReactionKind;
  /** Wall ms it starts. */
  t0: number;
  /** Page direction it's about (radians). For "hop" and "cheer", undefined: screen-up at the time. */
  dir?: number;
  /** How far `d` goes, page units; poses scale by `amp / full`. */
  amp: number;
  /** Cheers: how many hops. */
  n?: number;
}

/** How long a reaction lasts, ms. */
export function span(r: Reaction) {
  if (r.kind === "cheer") return (r.n ?? 1) * KEYS.hop.length * FRAME + FRAME;
  if (r.kind === "mourn") return MOURN.still + MOURN.low;
  return KEYS[r.kind].length * FRAME;
}

/** Mourning: the pen round him stops dead, then goes on slowly and small. */
export const MOURN = { still: 750, low: 2600, rate: 0.4, k: 0.92, lean: 1.8 };

/** The key a reaction shows `ms` into it (quantised to frames), or null once it's over. */
export function keyAt(r: Reaction, ms: number): Key | null {
  const dt = ms - r.t0;
  if (dt < 0 || dt >= span(r)) return null;
  const f = Math.floor(dt / FRAME);
  if (r.kind === "cheer") {
    // hops back to back, each a little lower than the one before
    const i = Math.floor(f / KEYS.hop.length), key = KEYS.hop[f % KEYS.hop.length];
    if (i >= (r.n ?? 1)) return {};
    return { ...key, d: (key.d ?? 0) * Math.pow(0.8, i), r: 1.9 };
  }
  if (r.kind === "mourn") {
    if (dt < MOURN.still) return { r: 0, k: MOURN.k, d: MOURN.lean * Math.min(1, dt / 300) };
    const u = (dt - MOURN.still) / MOURN.low; // easing back to himself
    return { r: MOURN.rate + (1 - MOURN.rate) * u * u, k: MOURN.k + (1 - MOURN.k) * u, d: MOURN.lean * (1 - u) };
  }
  return KEYS[r.kind][f];
}

// --- composing a pose ------------------------------------------------------------
// Stretches along different axes add as vectors on the doubled angle (an axis
// has no front or back), so a squash along one axis is a stretch across it.

class Acc {
  ox = 0; oy = 0; k = 1; sx = 0; sy = 0; rate = 1;
  push(dir: number, d: number, s = 1, k = 1) {
    this.ox += Math.cos(dir) * d;
    this.oy += Math.sin(dir) * d;
    this.stretch(dir, s);
    this.k *= k;
  }
  stretch(ax: number, s: number) {
    const m = s - 1;
    this.sx += m * Math.cos(2 * ax);
    this.sy += m * Math.sin(2 * ax);
  }
  pose(): Pose {
    const off = Math.hypot(this.ox, this.oy), cap = off > REACH.offset ? REACH.offset / off : 1;
    return {
      ox: this.ox * cap, oy: this.oy * cap,
      k: Math.max(1 / REACH.scale, Math.min(REACH.scale, this.k)),
      st: Math.min(REACH.stretch, 1 + Math.hypot(this.sx, this.sy)),
      ax: Math.atan2(this.sy, this.sx) / 2,
      rate: Math.max(0, this.rate),
    };
  }
}

/** Full-size reach of each reaction's `d` (page units), at amp 1. */
export const AMP = { hop: 7.5, flinch: 8.5, gasp: 4, recoil: 6, perk: 5, land: 5, cheer: 8, mourn: 1, jab: 6 };

// --- what's going on round him ----------------------------------------------------

export interface Scene {
  s: GameState;
  /** The page direction of "up" on screen, for hops. */
  up: number;
  /** The camera's zoom (1: the whole page). Standing back, hops are drawn bigger so they still read. */
  zoom?: number;
  /** Whose go it is and they're free to act: their men are eager. */
  eager?: Player;
  /** The man in hand, since when (wall ms). */
  chosen?: { id: number; t0: number };
  /** A pull on him: which way and how hard (0..1), and how far and wide it might go. */
  aim?: { angle: number; power: number; reach: number; spread: number };
}

/** Where the line of a flick might go: enemy soldiers in its cone, as page distance along it. Pure. */
export function inLine(s: GameState, id: number, angle: number, reach: number, spread: number, slack = 22) {
  const me = s.soldiers[id];
  const out: number[] = [];
  if (!me) return out;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  for (const x of s.soldiers) {
    if (!x.alive || x.owner === me.owner) continue;
    const vx = x.x - me.x, vy = x.y - me.y, along = vx * dx + vy * dy;
    if (along <= 0 || along > reach) continue;
    if (Math.abs(-vx * dy + vy * dx) <= slack + along * Math.tan(Math.min(0.6, spread))) out.push(x.id);
  }
  return out;
}

/** A man's comrades within `r` of a point (living, his side), nearest first. Pure. */
export function comrades(s: GameState, owner: Player, at: Pt, r: number, not?: number) {
  return s.soldiers
    .filter((x) => x.alive && x.owner === owner && x.id !== not && Math.hypot(x.x - at.x, x.y - at.y) <= r)
    .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y));
}

/** A side down to its last few: they huddle and tremble. */
export const LAST_STAND = 3;
export const lastStand = (s: GameState, p: Player) => {
  if (s.phase !== "play") return false;
  const n = s.soldiers.reduce((a, x) => a + (x.alive && x.owner === p ? 1 : 0), 0);
  return n > 0 && n <= LAST_STAND;
};

export interface Pass {
  id: number;
  /** Fractional vertex index along the path where the ink comes closest. */
  index: number;
  /** How close it comes (page units, centre to line). */
  d: number;
  /** Page direction from the line to him: away. */
  away: number;
  fatal: boolean;
}

/**
 * Everyone the ink comes near (within `near`), and where along it: who will
 * flinch and who will be crossed out. `soldiers` is the page after the flick
 * (so the killed are already dead: `killed` names them). Pure.
 */
export function passes(soldiers: readonly Soldier[], path: Pt[], shooter: number, killed: readonly number[], near = NEAR): Pass[] {
  const dead = new Set(killed);
  const out: Pass[] = [];
  for (const x of soldiers) {
    if (x.id === shooter || (!x.alive && !dead.has(x.id))) continue;
    let best = Infinity, bi = 0, bp: Pt = path[0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x.x - a.x) * vx + (x.y - a.y) * vy) / l2));
      const px = a.x + vx * t, py = a.y + vy * t, d = Math.hypot(x.x - px, x.y - py);
      if (d < best) { best = d; bi = i - 1 + t; bp = { x: px, y: py }; }
    }
    if (best > near && !dead.has(x.id)) continue;
    // right on the line: away is across it
    const i0 = Math.min(path.length - 2, Math.floor(bi)), a = path[i0], b = path[i0 + 1];
    const across = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const away = best > 0.5 ? Math.atan2(x.y - bp.y, x.x - bp.x) : across;
    out.push({ id: x.id, index: bi, d: best, away, fatal: dead.has(x.id) });
  }
  return out.sort((p, q) => p.index - q.index);
}

/**
 * Now and then, on his side's go, a man hops, ready: the key of his hop at
 * `ms`, or null. Each has his own period and his own moment in it, and skips
 * about half of them. Pure.
 */
function hopKey(id: number, h: number, ms: number) {
  const P = 5200 + ((h >>> 8) % 4200), w = Math.floor((ms + (h % P)) / P);
  if (unit(id, w, 3) >= 0.55) return null;
  const at = w * P - (h % P) + unit(id, w, 5) * (P - KEYS.hop.length * FRAME);
  const f = Math.floor((ms - at) / FRAME);
  return f >= 0 && f < KEYS.hop.length ? KEYS.hop[f] : null;
}

// --- the life of the page --------------------------------------------------------

/**
 * Who is doing what. Reactions are queued with their wall start times; a pose
 * is worked out when the boil draws a soldier. The heartbeat is integrated
 * tick by tick, so a racing heart moves his scribble on faster and a held
 * breath stops it where it is.
 */
export class Life {
  scene: Scene | null = null;
  private acts = new Map<number, Reaction[]>();
  /** Since when each soldier has had a pen pointed his way (wall ms). */
  private dread = new Map<number, number>();
  private beats = new Map<number, { look: number; ph: number }>();
  private rings = new Map<number, { look: number; u: number; memo: Map<number, number> }>();
  /** Camps holding their breath: base id -> [from, until] (wall ms). */
  private hush = new Map<number, [number, number]>();
  /** Men stopped for good from a wall time on (a volley's crossed-out intruder, before the rules record it). */
  private stilled = new Map<number, number>();
  /** He stops being drawn at `from` (wall ms): still, like the dead. */
  still(id: number, from: number) { this.stilled.set(id, from); this.memo.delete(id); }

  /** Queue a reaction for soldier `id`. Of one kind, the latest to have started plays: a new jolt cuts off the last. */
  add(id: number, r: Reaction) {
    this.memo.delete(id);
    const list = (this.acts.get(id) ?? []).filter((x) => x.t0 + span(x) > r.t0 - 2000 && !(x.kind === r.kind && x.t0 === r.t0));
    list.push(r);
    this.acts.set(id, list);
  }
  /** A camp's pen stops for a beat, from `from` to `until` (wall ms). */
  hold(base: number, from: number, until: number) {
    const h = this.hush.get(base);
    this.hush.set(base, h && h[1] >= from ? [Math.min(h[0], from), Math.max(h[1], until)] : [from, until]);
  }
  clear() { this.stilled.clear(); this.memo.clear(); this.acts.clear(); this.dread.clear(); this.beats.clear(); this.rings.clear(); this.hush.clear(); }
  reactions(id: number) { return this.acts.get(id) ?? []; }

  /** Sides at their last stand, counted once a frame rather than once a soldier. */
  private stand = [false, false];
  /** The last pose worked out for each soldier: his heartbeat and his drawing ask for the same moment. */
  private memo = new Map<number, { ms: number; pose: Pose }>();

  /** Take what's going on now (every rendered frame). `ms`: wall time. */
  see(sc: Scene, ms: number) {
    this.scene = sc;
    this.stand = [lastStand(sc.s, 0), lastStand(sc.s, 1)];
    this.memo.clear();
    const now = new Set(LIFE.line && sc.aim && sc.chosen && sc.aim.power > 0.02 ? inLine(sc.s, sc.chosen.id, sc.aim.angle, sc.aim.reach, sc.aim.spread) : []);
    for (const id of this.dread.keys()) if (!now.has(id)) this.dread.delete(id);
    for (const id of now) if (!this.dread.has(id)) this.dread.set(id, ms);
  }
  /** Soldiers with a pen pointed their way right now. */
  get dreading() { return [...this.dread.keys()]; }

  /** Soldier `id`'s pose at wall `ms` (on the 12 fps grid). */
  pose(id: number, ms: number): Pose {
    const m = this.memo.get(id);
    if (m && m.ms === ms) return m.pose;
    const pose = this.work(id, ms);
    this.memo.set(id, { ms, pose });
    return pose;
  }

  private work(id: number, ms: number): Pose {
    const sc = this.scene;
    const x = sc?.s.soldiers[id];
    if (!sc || !x) return { ...REST };
    const dead = this.stilled.get(id);
    if (dead !== undefined && ms >= dead) return { ...REST, rate: 0 };
    const h = hash(id, 77);
    const up = sc.up;
    const chosen = sc.chosen;
    // most men, most ticks, are simply standing: say so without the arithmetic
    const acts = this.acts.get(id);
    const me = chosen && sc.s.soldiers[chosen.id];
    const mate = !!me && chosen!.id !== id && me.owner === x.owner && Math.hypot(me.x - x.x, me.y - x.y) < RULES.baseRadius * 2.4;
    const hop = LIFE.idle && sc.eager === x.owner && chosen?.id !== id ? hopKey(id, h, ms) : null;
    const busy = !!acts?.length || chosen?.id === id || mate || hop || this.dread.has(id) || this.stand[x.owner];
    if (!busy) return REST;
    const a = new Acc();
    // legibility: from bird's-eye a dot is a few pixels, so a hop is drawn taller there
    const tall = Math.max(1, Math.min(1.6, 1.8 / (sc.zoom ?? 1.8)));
    // on his side's go, now and then a little hop: ready
    if (hop) a.push(up, (hop.d ?? 0) * AMP.hop * 0.6 * tall, 1 + ((hop.s ?? 1) - 1) * 0.7, hop.k ?? 1);
    for (const r of acts ?? []) {
      // of each kind, only the latest to have started
      if (acts!.some((o) => o !== r && o.kind === r.kind && o.t0 > r.t0 && o.t0 <= ms)) continue;
      const key = keyAt(r, ms);
      if (!key) continue;
      const dir = r.dir ?? up;
      // hops and flinches are what you watch from bird's-eye: drawn bigger there
      const big = r.dir === undefined || r.kind === "flinch" ? tall : 1;
      const d = (key.d ?? 0) * AMP[r.kind] * r.amp * big;
      a.push(dir, d, key.s ?? 1, key.k ?? 1);
      if (key.side) a.push(dir + Math.PI / 2, key.side * AMP[r.kind] * r.amp * big);
      a.rate *= key.r ?? 1;
    }
    if (LIFE.chosen && chosen) {
      if (chosen.id === id) {
        a.rate *= 1.7;
        a.k *= 1.04;
        if (sc.aim && sc.aim.power > 0) {
          // wound up against the pull: stretched along it, drawn back from it
          const p = sc.aim.power;
          a.push(sc.aim.angle, -2.2 * p, 1 + 0.32 * p);
          a.rate *= 1 + p;
          if (p > 0.97) a.push(unit(id, Math.floor(ms / FRAME)) * 6.283, 0.7);
        }
      } else if (mate && me) {
        // his campmates turn to him: a lean and a stretch his way, rippling out
        const dist = Math.hypot(me.x - x.x, me.y - x.y);
        {
          const on = Math.max(0, Math.min(1, (ms - chosen.t0 - dist * 1.6) / (FRAME * 3)));
          const toward = Math.atan2(me.y - x.y, me.x - x.x);
          a.push(toward, 2.4 * on, 1 + 0.14 * on);
        }
      }
    }
    if (LIFE.line) {
      const since = this.dread.get(id);
      if (since !== undefined && chosen) {
        // a pen pointed his way: he cowers from it and trembles
        const on = Math.min(1, (ms - since) / (FRAME * 3));
        const me = sc.s.soldiers[chosen.id];
        a.push(Math.atan2(x.y - me.y, x.x - me.x), 1.4 * on, 1 - 0.12 * on, 1 - 0.1 * on);
        a.push(unit(id, Math.floor(ms / FRAME), 9) * 6.283, 0.8 * on);
        a.rate *= 1 + 1.3 * on;
      }
    }
    if (LIFE.crowd && this.stand[x.owner]) {
      // the last few: huddled toward the nearest of the others, trembling, hearts going
      const near = comrades(sc.s, x.owner, x, RULES.baseRadius * 3, id)[0];
      if (near) a.push(Math.atan2(near.y - x.y, near.x - x.x), 1.8, 1.1);
      a.push(unit(id, Math.floor(ms / FRAME), 11) * 6.283, 0.55);
      a.rate *= 1.8;
    }
    if (!LIFE.idle && !LIFE.crowd && !LIFE.line && !LIFE.chosen) return { ...REST };
    return a.pose();
  }

  /**
   * How far round his scribble a soldier is at boil look `look` (frames).
   * Integrated: each frame moves it on by his heartbeat, so a held breath stops
   * it where it is. Without `LIFE`, one picture a frame, as before.
   */
  scribble(id: number, look: number) {
    const b = this.beats.get(id);
    if (!b || look < b.look || look - b.look > FPS * 4) {
      this.beats.set(id, { look, ph: look });
      return look;
    }
    if (look > b.look) {
      const r = this.heart(id, look * FRAME);
      b.ph += (look - b.look) * r;
      b.look = look;
    }
    return b.ph;
  }
  /** His scribble rate at `ms`: the pose's rate, capped (the loop is only 12 pictures). */
  heart(id: number, ms: number) {
    if (!LIFE.idle && !LIFE.crowd && !LIFE.line && !LIFE.chosen) return 1;
    return Math.min(4, this.pose(id, ms).rate);
  }

  /**
   * How far round a camp's pen is, in turns, at look `look`: its pace changes
   * with how its men are doing, and the head never jumps.
   */
  ring(base: number, look: number, lapMs: number, phase: number) {
    const r = this.rings.get(base);
    const flat = (look * FRAME) / lapMs + phase;
    if (!LIFE.camps) return flat;
    if (!r || look - r.look > FPS * 4) {
      const n = { look, u: flat, memo: new Map([[look, flat]]) };
      this.rings.set(base, n);
      return flat;
    }
    const m = r.memo.get(look);
    if (m !== undefined) return m;
    // a look from before the last few: unknown (the layer then redraws the ring whole)
    if (look < r.look) return NaN;
    r.u += ((look - r.look) * FRAME / lapMs) * this.pace(base, look * FRAME);
    r.look = look;
    r.memo.set(look, r.u);
    if (r.memo.size > 6) r.memo.delete(r.memo.keys().next().value!);
    return r.u;
  }

  /** A camp's pen, relative to its usual pace. Pure given the scene. */
  pace(base: number, ms: number) {
    const sc = this.scene;
    if (!sc) return 1;
    const h = this.hush.get(base);
    if (h && ms >= h[0] && ms < h[1]) return 0;
    const b = sc.s.bases[base];
    if (!b) return 1;
    const men = inBase(sc.s.soldiers.filter((x) => x.alive && x.owner === b.owner), b);
    // tired round an emptying camp; a full one goes briskly
    let p = 0.45 + 0.55 * Math.min(1, men.length / RULES.soldiersPerBase);
    // hurried while its men are in the line of fire
    if (men.some((x) => this.dread.has(x.id))) p *= 1.5;
    return p;
  }
}

// --- a flick, as the page will feel it ------------------------------------------

/** Something a soldier says (voice.ts), `at` ms after the flick. */
export interface Cue { at: number; id: number; say: "eep" | "gasp" | "oh" | "cheer" | "wheee" | "land" | "phew" | "jab"; gain: number; len?: number }

export interface FlickPlan {
  /** Reactions, with t0 in ms after the flick. */
  acts: { id: number; r: Reaction }[];
  cues: Cue[];
  /** Camps that hold their breath: from `at`, for `ms`. */
  hush: { base: number; at: number; ms: number }[];
}

/** How near the ink must come to make a man flinch (page units, centre to line). */
export const NEAR = 85;

/**
 * What a flick does to the living, planned the moment it's fired: the
 * shooter's recoil (or his ride and landing), everyone the ink comes near
 * flinching as it passes, each man it will cross out rearing back just before
 * it gets to him, his campmates holding still for him, and the shooter's
 * campmates cheering. `s` is the page after the flick; `when(index)` is ms
 * after the flick at which the ink's head reaches fractional vertex `index` of
 * the path; `arrive` is when a moving man's ink stops. Pure.
 */
export function planFlick(
  s: GameState,
  o: { path: Pt[]; killed: readonly number[]; lost: boolean; movedTo?: Pt },
  shooter: number, kind: "shoot" | "move", when: (index: number) => number, arrive: number,
): FlickPlan {
  const plan: FlickPlan = { acts: [], cues: [], hush: [] };
  const me = s.soldiers[shooter];
  const P = o.path, n = P.length - 1;
  if (!me || n < 1) return plan;
  const act = (id: number, r: Reaction) => plan.acts.push({ id, r });
  const out = Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x);
  if (kind === "shoot") act(shooter, { kind: "recoil", t0: 0, dir: out, amp: 1 });
  else {
    plan.cues.push({ at: 0, id: shooter, say: "wheee", gain: 0.8, len: arrive / 1000 });
    if (!o.lost) {
      const end = Math.atan2(P[n].y - P[n - 1].y, P[n].x - P[n - 1].x);
      act(shooter, { kind: "land", t0: arrive, dir: end, amp: 1 });
      plan.cues.push({ at: arrive, id: shooter, say: "land", gain: 0.7 });
    }
  }
  const ps = passes(s.soldiers, P, shooter, o.killed);
  let eeps = 0, phews = 0;
  const near = new Set(ps.map((p) => p.id));
  const twitched = new Set<number>();
  for (const p of ps) {
    const at = when(p.index);
    const x = s.soldiers[p.id];
    if (p.fatal) {
      // he sees it coming, and rears back: the cross cuts him off
      act(p.id, { kind: "gasp", t0: at - KEYS.gasp.length * FRAME, dir: p.away, amp: 1 });
      plan.cues.push({ at: at - 170, id: p.id, say: "gasp", gain: 0.8 });
    } else {
      // generous: a near-ish miss still makes him jump
      const amp = Math.max(0.4, 1 - Math.pow(p.d / NEAR, 1.6)) * (x.owner === me.owner ? 0.6 : 1);
      // the ink passes him on his flinch's FLINCH_HIT key
      act(p.id, { kind: "flinch", t0: at - FLINCH_HIT * FRAME, dir: p.away, amp });
      if (p.d < 45 && eeps++ < 3) plan.cues.push({ at, id: p.id, say: "eep", gain: 0.5 + 0.5 * amp });
      if (p.d < 30 && phews++ < 1) plan.cues.push({ at: at + 9 * FRAME, id: p.id, say: "phew", gain: 0.7 });
      // a close one makes the men right beside him jump too, a beat later
      if (p.d < 40) for (const c of comrades(s, x.owner, x, 34, x.id)) {
        if (near.has(c.id) || twitched.has(c.id) || twitched.size >= 8) continue;
        twitched.add(c.id);
        act(c.id, { kind: "flinch", t0: at - FLINCH_HIT * FRAME + 2 * FRAME, dir: Math.atan2(c.y - x.y, c.x - x.x), amp: 0.3 });
      }
    }
  }
  // the fallen: his campmates hold still for him, and one of them says so
  const fallen = ps.filter((p) => p.fatal).map((p) => ({ x: s.soldiers[p.id], at: when(p.index) }));
  // flicked off the page: mourned by the camp he left
  if (o.lost) fallen.push({ x: { ...me, x: P[0].x, y: P[0].y }, at: arrive });
  let ohs = 0;
  const mourned = new Set<number>();
  for (const f of fallen) {
    const near = comrades(s, f.x.owner, f.x, RULES.baseRadius * 2.4, f.x.id);
    near.forEach((c, rank) => {
      if (mourned.has(c.id)) return;
      mourned.add(c.id);
      act(c.id, { kind: "mourn", t0: f.at + 60 + rank * 30, dir: Math.atan2(f.x.y - c.y, f.x.x - c.x), amp: 1 });
    });
    if (near[0] && ohs++ < 2) plan.cues.push({ at: f.at + 420 + ohs * 180, id: near[0].id, say: "oh", gain: 0.8 });
    const home = s.bases.find((b) => b.owner === f.x.owner && Math.hypot(b.x - f.x.x, b.y - f.x.y) <= b.r * 1.05);
    if (home) plan.hush.push({ base: home.id, at: f.at, ms: MOURN.still });
  }
  // the shooter's side cheers a kill: him first and loudest, then his campmates in a ripple
  if (o.killed.length) {
    const first = Math.min(...fallen.filter((f) => f.x.owner !== me.owner).map((f) => f.at));
    const at0 = (Number.isFinite(first) ? first : arrive) + 180;
    const where = o.movedTo ?? me;
    const hops = Math.min(3, 1 + o.killed.length);
    const crowd = [me, ...comrades(s, me.owner, where, RULES.baseRadius * 2.6, me.id)].filter((x) => x.alive);
    crowd.forEach((c, rank) => {
      if (mourned.has(c.id)) return;
      act(c.id, { kind: "cheer", t0: at0 + rank * 55 + unit(c.id, 31) * 50, amp: c.id === shooter ? 1 : 0.8, n: c.id === shooter ? hops : Math.max(1, hops - 1) });
    });
    const voices = Math.min(crowd.length, 1 + o.killed.length, 4);
    for (let i = 0; i < voices; i++) plan.cues.push({ at: at0 + i * 70, id: crowd[i].id, say: "cheer", gain: i ? 0.7 / Math.sqrt(voices) : 1 });
  }
  return plan;
}

// --- a volley: a camp turning on an intruder ----------------------------------------

/**
 * A lunger who lands in an enemy camp is shot on the spot by the men inside
 * (the rules-lab lunge: he "dies at the wall"). Every living defender rounds
 * on him and jabs a tiny quick line at him, in a fast ripple round the camp;
 * each jab jolts him; the last one crosses him out; the camp gives a little
 * cheer. Timings (ms) are from the moment he lands.
 */
export const VOLLEY = {
  /** Between one defender's jab and the next, round the ring. */
  ripple: 55,
  /** A jab's line, drawn. */
  jabMs: 80,
  /** And how long it glints before it's gone (it's the flick of a pen, not a mark). */
  fade: 420,
  /** The cross, drawn. */
  crossMs: 170,
};

export interface Jab { id: number; at: number; dur: number; pts: Pt[]; seed: number; owner: Player }
export interface VolleyPlan {
  base: number;
  target: { id: number; x: number; y: number };
  jabs: Jab[];
  acts: { id: number; r: Reaction }[];
  cues: Cue[];
  /** When his cross starts, and when it's all over. */
  cross: number;
  ends: number;
}

/**
 * The volley for intruder `target` (where he stands now) in camp `base`, or
 * null if nobody's home: an empty ring does nothing. Pure.
 */
export function planVolley(s: GameState, base: number, target: { id: number; x: number; y: number }): VolleyPlan | null {
  const b = s.bases[base];
  if (!b) return null;
  const home = inBase(s.soldiers.filter((d) => d.alive && d.owner === b.owner && d.id !== target.id), b);
  if (!home.length) return null;
  const at = (d: Pt) => Math.atan2(d.y - target.y, d.x - target.x);
  // the ripple goes round the ring from the man nearest him
  const first = home.reduce((p, q) => (Math.hypot(q.x - target.x, q.y - target.y) < Math.hypot(p.x - target.x, p.y - target.y) ? q : p));
  const a0 = at(first), round = (d: Pt) => ((at(d) - a0 + Math.PI * 4) % (Math.PI * 2));
  const order = [...home].sort((p, q) => round(p) - round(q));
  const plan: VolleyPlan = { base, target, jabs: [], acts: [], cues: [], cross: 0, ends: 0 };
  const R = RULES.soldierRadius;
  order.forEach((d, i) => {
    const t0 = i * VOLLEY.ripple + unit(d.id, 17) * 20;
    const dir = Math.atan2(target.y - d.y, target.x - d.x), dist = Math.hypot(target.x - d.x, target.y - d.y);
    plan.acts.push({ id: d.id, r: { kind: "jab", t0, dir, amp: 1 } });
    const fire = t0 + JAB_FIRE * FRAME;
    // a quick short line from him to the intruder, bowed a hair, stopping at his dot
    const seed = hash(d.id, target.id, 23);
    const bow = (unit(seed, 1) - 0.5) * 0.12 * dist, nx = -Math.sin(dir), ny = Math.cos(dir);
    const from = R * 1.1, to = Math.max(from + 4, dist - R * 0.8);
    const pts = Array.from({ length: 7 }, (_, k) => {
      const u = k / 6, l = from + (to - from) * u, off = bow * 4 * u * (1 - u);
      return { x: d.x + Math.cos(dir) * l + nx * off, y: d.y + Math.sin(dir) * l + ny * off };
    });
    plan.jabs.push({ id: d.id, at: fire, dur: VOLLEY.jabMs, pts, seed, owner: d.owner });
    plan.cues.push({ at: fire, id: d.id, say: "jab", gain: 0.7 / Math.sqrt(1 + i * 0.3) });
    // each one jolts him, away from whoever jabbed
    plan.acts.push({ id: target.id, r: { kind: "flinch", t0: fire + VOLLEY.jabMs - FLINCH_HIT * FRAME, dir, amp: 0.35 } });
  });
  const last = Math.max(...plan.jabs.map((j) => j.at + j.dur));
  plan.cross = last + 40;
  // he rears up as they round on him, and is cut off by his cross
  plan.acts.unshift({ id: target.id, r: { kind: "gasp", t0: 0, dir: Math.atan2(target.y - b.y, target.x - b.x), amp: 1 } });
  plan.cues.unshift({ at: Math.max(0, plan.cross - 170), id: target.id, say: "gasp", gain: 0.8 });
  // and the camp's grim little cheer
  order.slice(0, 5).forEach((d, i) => plan.acts.push({ id: d.id, r: { kind: "cheer", t0: plan.cross + 160 + i * 50, amp: 0.6, n: 1 } }));
  order.slice(0, 2).forEach((d, i) => plan.cues.push({ at: plan.cross + 200 + i * 80, id: d.id, say: "cheer", gain: 0.5 }));
  plan.ends = Math.max(plan.cross + VOLLEY.crossMs, last + VOLLEY.fade) + 60;
  return plan;
}
