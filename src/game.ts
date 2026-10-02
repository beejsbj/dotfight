// The core rules (RULES.md, "Core rules"), as a pure reducer. No DOM, no
// clock: `act(state, action)` is the only way a game changes, and every
// action is logged, so a game is fully described by its record: seed, size,
// rule numbers and the ordered actions (src/record.ts). A flick's randomness
// (the hand's error, and the seed for a lunger's shake) is resolved *before*
// it reaches act(), so the same record always draws the same page.
//
// The June prototype's rules (shoot or move) live on in src/legacy.ts for old
// saves; `s.v` tells the two apart (1: prototype, 2: core rules).
//
// The long war (RULES.md, "Long war rules") is the same reducer with
// `rules.long` set: shaped bases, and lines that bend, bank and split (see
// "the long war's ink" below). Every long-war path is behind `rules.long`, so a
// core game never takes one.
//
// (pure, tested)

import { circleHits, dist, flickPath, gauss, insidePoly, pathLen, polygon, polyHits, rng, rotateAbout, segDist, type Pt } from "./geom";
import { inkOf, segT, wrap, type Run } from "./inkgrid";
import { CORE, RULES, SHAPES, SIZES, type CoreRules, type Shape, type Size } from "./rules";

export { dist, distToPath, flickPath, pathLen, pointAlong, rng, type Pt } from "./geom";

export type Player = 0 | 1;
/** The two flicks. A snipe's soldier stays put; a lunger rides his own ink. */
export type Kind = "snipe" | "lunge";

export interface Base {
  id: number;
  owner: Player;
  x: number;
  y: number;
  r: number;
  seed: number;
  /** The long war: what shape it was drawn (none: a core game's circle). `r` is then its circumradius. */
  shape?: Shape;
  /** A triangle's or hexagon's turn on the page, radians (seeded). */
  rot?: number;
}

export interface Soldier {
  id: number;
  owner: Player;
  x: number;
  y: number;
  alive: boolean;
  /** The base he was jotted into, or last arrived at (positioning keeps him near it). */
  home?: number;
  /** In a send: ordered this turn (still standing at home), or out on the road. */
  convoy?: number;
}

/** Everything inked on the page, in order. The page is append-only: marks are never removed. */
export type Mark =
  | { t: "stroke"; kind: Kind | "shoot" | "move"; owner: Player; pts: Pt[]; seed: number; turn: number }
  // kill: crossed out in the killer's ink. moved: a small cross in his own ink on the spot he left
  // (`id` is who left it). lost: a lunger off the page, or shot where he landed.
  | { t: "cross"; kind: "kill" | "moved" | "lost"; owner: Player; x: number; y: number; seed: number; turn: number; id?: number }
  // a convoy's footprints, from `a` to `b`
  | { t: "walk"; owner: Player; a: Pt; b: Pt; n: number; seed: number; turn: number }
  // a side's last stand begins: its survivors are ringed where they stand
  | { t: "stand"; owner: Player; at: Pt[]; seed: number; turn: number };

/** A flick, randomness already resolved: exactly what the ink will do. */
export interface Flick {
  soldier: number;
  kind: Kind;
  /** Radians, page space (0 = +x, π/2 = down the page). */
  angle: number;
  /** World units, before power loss or the page edge cut it short. */
  length: number;
  /** Signed: the fraction of its length the line bows sideways. */
  bend: number;
  /** Seed for the jolts a lunger's hand takes crossing walls and soldiers (uint32). */
  wob: number;
}

/**
 * One move in a game, as it goes in the record and over the wire. Plain JSON,
 * applied in order by `act()`. The record's `v` (2) versions this shape;
 * the actor is always `state.current`, so no action names a player.
 *
 * - `base`: setup. The current player draws a base centred here; it is jotted
 *   full of soldiers (seeded). Players alternate until each has drawn theirs.
 *   In the long war each base names its `shape` (any mix); a core base has none.
 * - `arrange`: positioning. Move one of your soldiers to (x, y): inside his
 *   base or within `rules.positionReach` of its wall. Any number, then `ready`.
 * - `ready`: positioning. Done arranging; the other side arranges (seeing
 *   yours), then the first flick.
 * - `flick`: a snipe or a lunge by one of your soldiers (see `Flick`).
 * - `send`: once a turn, free: `n` soldiers (1..rules.sendMax) walk from base
 *   `from` to base `to`, both yours (`to` may be an empty ring). They leave
 *   when you hand over the pen and arrive at the start of your next turn.
 * - `stop`: turn down an earned lunge; with none pending, end your turn.
 */
export type Action =
  | { t: "base"; x: number; y: number; shape?: Shape }
  | { t: "arrange"; soldier: number; x: number; y: number }
  | { t: "ready" }
  | ({ t: "flick" } & Flick)
  | { t: "send"; from: number; to: number; n: number }
  | { t: "stop" };

export interface Convoy {
  id: number;
  owner: Player;
  from: number;
  to: number;
  ids: number[];
  /** ordered: waiting for the pen to change hands. road: out on the open page. */
  state: "ordered" | "road" | "arrived" | "cut";
  /** Wall to wall, `from` to `to`. */
  road: [Pt, Pt];
  turn: number;
  /** The long war: how far along the road the head of the column has walked. */
  at?: number;
}

/** Something that happened along a line, in order. */
export interface TraceEvent {
  /** The long war adds: `bank` off a cushion, `split` leaving your prism, `ink` crossing an old line. */
  kind: "wall" | "kill" | "edge" | "bank" | "split" | "ink";
  at: Pt;
  /** Distance along the line. */
  d: number;
  base?: number;
  soldier?: number;
  /** A wall at the shooter's back (leaving the base he stands in): free. */
  free?: boolean;
  /** A wall's price: the share of a snipe's length it took, or the lunger's shake (radians, 1 sd). */
  cost?: number;
  /** Radians the lunger's heading turned here (in the long war, any line's, at old ink). */
  jolt?: number;
  /** The long war: which line it happened on (0, or 1 for the half a prism split off). */
  branch?: number;
}

/** What an action did. Flick fields are empty for the other actions. */
export interface Outcome {
  path: Pt[];
  /** The long war: the other half of a line your prism split. */
  branches?: Pt[][];
  killed: number[];
  /** A lunger who lived: where he stands now. */
  movedTo?: Pt;
  /** The lunger died: off the page, or shot where he landed. */
  lost: boolean;
  /** He landed in this enemy base with its men at home, and they shot him. */
  crashed?: number;
  events: TraceEvent[];
  /** The same player still holds the pen. */
  again: boolean;
  /** This flick earned another (a snipe that took two, or a lunge that killed). */
  earned: boolean;
  /** Sides whose last stand began. */
  stood: Player[];
  /** Convoys that walked out onto the road, and that arrived, as the pen changed hands. */
  walked: number[];
  arrived: number[];
  /** The long war: convoys that walked on along their road as the pen changed hands. */
  advanced?: number[];
  /** The pen changed hands. */
  handover: boolean;
}

export interface GameState {
  v: 2;
  seed: number;
  size: Size;
  /** The rule numbers this game is played by (a copy of CORE when it began). */
  rules: CoreRules;
  phase: "setup" | "position" | "play" | "over";
  current: Player;
  /** Pen hand-overs so far, from 1 at the first flick. 0 in setup and positioning. */
  turn: number;
  /** Flicks the current player still has this turn (1; 2 in a last stand; +1 for each earned). */
  left: number;
  /** An earned lunge: the next flick must be this soldier lunging. `link` counts the chain. */
  chain?: { soldier: number; link: number };
  /** This turn's free send is used. */
  sent: boolean;
  /** Positioning: which sides are done. */
  ready: [boolean, boolean];
  /** The turn each side's last stand began (0: not yet). */
  stand: [number, number];
  bases: Base[];
  soldiers: Soldier[];
  convoys: Convoy[];
  marks: Mark[];
  actions: Action[];
  winner?: Player;
  page?: { no: number; date: string; theme?: string }; // written in the header, and the paper it was on; optional so older saves still load
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

// --- setup ------------------------------------------------------------------

export function newGame(size: Size = SIZES.classic, seed = (Math.random() * 2 ** 32) >>> 0, page?: GameState["page"], rules: CoreRules = CORE): GameState {
  return {
    v: 2, seed, size: { ...size }, rules: structuredClone(rules), phase: "setup", current: 0, turn: 0, left: 0, sent: false,
    ready: [false, false], stand: [0, 0], bases: [], soldiers: [], convoys: [], marks: [], actions: [], ...(page && { page }),
  };
}

export function basesLeft(s: GameState, p: Player) {
  return Math.max(0, s.size.bases - s.bases.filter((b) => b.owner === p).length);
}

/** How big a base of this shape is drawn: its radius (circumradius for a triangle or hexagon). */
export const radiusOf = (s: GameState, shape?: Shape) => (s.rules.long && shape ? RULES.baseRadius * s.rules.long.shapes[shape].size : RULES.baseRadius);

export function canPlaceBase(s: GameState, x: number, y: number, shape?: Shape): string | null {
  if (s.phase !== "setup") return "not setup";
  const r = radiusOf(s, shape);
  if (x - r < RULES.margin + 8 || x + r > RULES.pageW - 16 || y - r < 16 || y + r > RULES.pageH - 16) return "too close to the edge";
  for (const b of s.bases) {
    const gap = b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap;
    if (Math.hypot(b.x - x, b.y - y) < b.r + r + gap) return b.owner === s.current ? "overlaps your base" : "too close to the enemy";
  }
  return null;
}

function placeBase(s: GameState, x: number, y: number, shape?: Shape) {
  const why = canPlaceBase(s, x, y, shape);
  if (why) throw new Error(why);
  const id = s.bases.length;
  const base: Base = { id, owner: s.current, x, y, r: RULES.baseRadius, seed: (s.seed ^ (id * 7919)) >>> 0 };
  if (s.rules.long && shape) {
    base.shape = shape;
    base.r = radiusOf(s, shape);
    if (shape !== "camp") base.rot = rng(base.seed ^ 0x2545f491)() * 2 * Math.PI;
  }
  s.bases.push(base);
  for (const p of scatterIn(base, capacity(s, base), base.seed)) {
    s.soldiers.push({ id: s.soldiers.length, owner: base.owner, x: p.x, y: p.y, alive: true, home: id });
  }
  if (basesLeft(s, 0) === 0 && basesLeft(s, 1) === 0) {
    // everyone arranges their soldiers first: whoever flicks first arranges first
    s.phase = "position";
    s.current = 0;
  } else {
    s.current = basesLeft(s, other(s.current)) > 0 ? other(s.current) : s.current;
  }
}

/** Dots jotted into a base by hand: spread out, never touching, clear of the wall. */
export function scatterIn(b: { x: number; y: number; r: number; shape?: Shape; rot?: number }, n: number, seed: number, avoid: Pt[] = []): Pt[] {
  const rand = rng(seed);
  const dot = RULES.soldierRadius;
  const pts: Pt[] = [];
  const inner = b.r - dot * 2.2;
  const vs = corners(b);
  let minD = dot * 3.2;
  let tries = 0;
  while (pts.length < n && tries < 20000) {
    tries++;
    if (tries % 4000 === 0) minD *= 0.8; // a crowded base: squeeze them in
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * inner;
    const p = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d };
    if (vs && !(insidePoly(p, vs) && vs.every((v, i) => segDist(p, v, vs[(i + 1) % vs.length]) >= dot * 2.2))) continue; // a triangle's or hexagon's corners are cut off
    if (pts.every((q) => dist(q, p) >= minD) && avoid.every((q) => dist(q, p) >= minD)) pts.push(p);
  }
  return pts;
}

// --- shapes -----------------------------------------------------------------

const cornerMemo = new WeakMap<object, Pt[]>();

/** A triangle's or hexagon's corners, in order; null for a circle (a camp, or any core base). */
export function corners(b: { x: number; y: number; r: number; shape?: Shape; rot?: number }): Pt[] | null {
  if (b.shape !== "prism" && b.shape !== "cushion") return null;
  let vs = cornerMemo.get(b);
  if (!vs) { vs = polygon(b.shape === "prism" ? 3 : 6, b, b.r, b.rot ?? 0); cornerMemo.set(b, vs); }
  return vs;
}

/** How far `p` is outside the base's wall (negative: inside). */
export function wallGap(b: Base, p: Pt) {
  const vs = corners(b);
  if (!vs) return dist(b, p) - b.r;
  const d = Math.min(...vs.map((v, i) => segDist(p, v, vs[(i + 1) % vs.length])));
  return insidePoly(p, vs) ? -d : d;
}

/** How many soldiers make this base full: what it was jotted with. */
export const capacity = (s: GameState, b: Base) => (s.rules.long && b.shape ? s.rules.long.shapes[b.shape].soldiers : s.size.soldiers);

// --- positioning --------------------------------------------------------------

/** Where a soldier may be put before the first flick: in his base or within reach of its wall, on the page, clear of everyone. */
export function canArrange(s: GameState, id: number, x: number, y: number): string | null {
  if (s.phase !== "position") return "not now";
  const me = s.soldiers[id];
  if (!me || !me.alive || me.owner !== s.current) return "not yours";
  const home = s.bases[me.home ?? -1];
  if (!home) return "no home base";
  const p = { x, y };
  if (home.shape ? wallGap(home, p) > s.rules.positionReach : dist(home, p) > home.r + s.rules.positionReach) return "too far from his base";
  if (x < RULES.margin + 8 || x > RULES.pageW - 8 || y < 8 || y > RULES.pageH - 8) return "off the page";
  for (const b of s.bases) if (b.owner !== me.owner && inside(b, p, 1.1)) return "in their base";
  for (const o of s.soldiers) if (o.id !== id && o.alive && dist(o, p) < RULES.soldierRadius * 2.4) return "on top of someone";
  return null;
}

// --- queries ----------------------------------------------------------------

/** Living soldiers, including any in a send. */
export function alive(s: GameState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p);
}

const onRoad = (s: GameState, x: Soldier) => x.convoy !== undefined && s.convoys[x.convoy]?.state === "road";

/** Is this point inside the base's wall? Dots drawn on the line count. `slack` scales the wall about its centre. */
export function inside(b: Base, p: Pt, slack = 1.05) {
  const vs = corners(b);
  if (!vs) return dist(b, p) <= b.r * slack;
  return insidePoly({ x: b.x + (p.x - b.x) / slack, y: b.y + (p.y - b.y) / slack }, vs);
}

/** The base's own living soldiers standing inside its wall (not out on a road). */
export function garrison(s: GameState, b: Base) {
  return s.soldiers.filter((x) => x.alive && x.owner === b.owner && !onRoad(s, x) && inside(b, x));
}

/** An empty ring: a base with nobody of its own inside. It stays on the page, and a send can man it again. */
export const isRing = (s: GameState, b: Base) => garrison(s, b).length === 0;

/** The soldiers a send from this base can take: its own men in it or just outside (positioning), not already sent, not owing a lunge. */
export function sendable(s: GameState, b: Base) {
  const near = (x: Soldier) => (b.shape ? wallGap(b, x) <= s.rules.positionReach + 1 : dist(b, x) <= b.r + s.rules.positionReach + 1);
  return s.soldiers.filter((x) => x.alive && x.owner === b.owner && x.convoy === undefined && s.chain?.soldier !== x.id && near(x));
}

/**
 * How tough a base's wall is right now, 0 (an empty ring) to 1 (a full base):
 * its garrison over the soldiers a base starts with, capped at full and shaped
 * by the rules' curve. `gone`: soldiers this line already crossed out;
 * `but`: the man flicking (never his own wall's garrison). 1 on flat walls.
 */
export function wallStrength(s: GameState, b: Base, gone?: Set<number>, but?: number) {
  const G = s.rules.garrison;
  if (!G) return 1;
  let n = 0;
  for (const x of garrison(s, b)) if (x.id !== but && !gone?.has(x.id)) n++;
  return Math.pow(Math.min(1, n / Math.max(1, capacity(s, b))), G.curve);
}

/** What crossing this wall costs a line now: a snipe's share of length lost, or a lunger's jolt (radians, 1 sd). */
export function wallCost(s: GameState, b: Base, kind: Kind, gone?: Set<number>, but?: number) {
  const G = s.rules.garrison;
  if (!G) return kind === "snipe" ? s.rules.snipeWallLoss : s.rules.lungeWallShake;
  const [lo, hi] = kind === "snipe" ? G.snipeLoss : G.lungeShake;
  return lo + (hi - lo) * wallStrength(s, b, gone, but);
}

/** Can this soldier flick now (and flick this kind)? */
export function canFlick(s: GameState, id: number, kind?: Kind) {
  const x = s.soldiers[id];
  if (!(s.phase === "play" && !!x && x.alive && x.owner === s.current && x.convoy === undefined)) return false;
  if (s.chain && (s.chain.soldier !== id || (kind !== undefined && kind !== "lunge"))) return false;
  return true;
}

/** Soldiers of the current player who can flick. */
export function flickers(s: GameState) {
  return s.soldiers.filter((x) => canFlick(s, x.id));
}

export const inLastStand = (s: GameState, p: Player) => s.stand[p] > 0;

/**
 * How shaky this soldier's hand is: a multiplier on the pen's release error
 * (steadier in a last stand), and a tremor in radians (1 sd) added in
 * quadrature for each link of a lunge chain, however soft the flick.
 */
export function hand(s: GameState, id: number, kind: Kind) {
  const x = s.soldiers[id];
  const mult = x && inLastStand(s, x.owner) ? s.rules.lastStandSteady : 1;
  const tremor = kind === "lunge" && s.chain?.soldier === id ? s.rules.lungeLinkTremor * s.chain.link : 0;
  return { mult, tremor, wild: (power: number) => wildOf(s.rules, power) };
}

/** Flicks a side gets at the start of its turn. */
export const allotment = (s: GameState, p: Player) => (inLastStand(s, p) ? s.rules.lastStandFlicks : 1);

/** Version 1 pages ran on this one reach and curve; the hand's error, wobble and bend were tuned on it. */
const V1_REACH = { min: 300, max: 1800, curve: 0.9 };

/** The reach a page runs on: one for both kinds. Version 1 pages keep the old one. */
const reachFor = (R: CoreRules) => (R.version < 2 ? V1_REACH : R.reach);

/** How long a flick of this power is (power 0..1, the share of the thumb's travel). Snipe and lunge reach alike. */
export function reachOf(R: CoreRules, power: number) {
  const r = reachFor(R);
  return r.min + (r.max - r.min) * Math.pow(Math.max(0, Math.min(1, power)), r.curve);
}

/** The power that gives a flick this length (inverse of reachOf). */
export function powerFor(R: CoreRules, length: number) {
  const r = reachFor(R);
  const f = Math.max(0, Math.min(1, (length - r.min) / Math.max(1, r.max - r.min)));
  return Math.pow(f, 1 / r.curve);
}

/** The longest line a flick can draw. */
export const maxReach = (R: CoreRules) => reachFor(R).max;

/**
 * How wild a line of this length is, as a power 0..1 on the version-1 curve
 * (where the hand's error, wobble and bend were tuned). Error follows the
 * line's length, not the thumb's travel, so changing the reach or the pull
 * range doesn't change how accurate a 700-unit line is.
 */
export function wildOfLength(length: number) {
  const r = V1_REACH;
  const f = Math.max(0, Math.min(1, (length - r.min) / (r.max - r.min)));
  return Math.pow(f, 1 / r.curve);
}

/** `wildOfLength` for a flick pulled to this power. */
export const wildOf = (R: CoreRules, power: number) => wildOfLength(reachOf(R, power));

/** How close ink must pass a dot to cross it out. */
export const hitReach = () => RULES.soldierRadius + RULES.inkWidth / 2 + RULES.hitSlop;

// --- the ink --------------------------------------------------------------------

const onPage = (p: Pt) => p.x >= 0 && p.x <= RULES.pageW && p.y >= 0 && p.y <= RULES.pageH;

/** The param along a→b (a on the page) where it leaves the page, or Infinity. */
function edgeParam(a: Pt, b: Pt) {
  if (onPage(b)) return Infinity;
  let t = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (b.x < 0) t = Math.min(t, (0 - a.x) / dx);
  if (b.x > RULES.pageW) t = Math.min(t, (RULES.pageW - a.x) / dx);
  if (b.y < 0) t = Math.min(t, (0 - a.y) / dy);
  if (b.y > RULES.pageH) t = Math.min(t, (RULES.pageH - a.y) / dy);
  return Math.max(0, t);
}

/**
 * Walk a flick's line from the soldier, in order along it: base walls
 * (entering or leaving; the wall at his back is free), enemy soldiers
 * crossed out, and the page edge. A snipe loses a share of what's left of
 * its length at each wall and each kill, so it falls short; a lunger's
 * heading jolts instead (seeded by `wob`), turning the rest of his line.
 */
export function trace(s: GameState, f: Flick): Trace {
  if (s.rules.long) return traceLong(s, f);
  const R = s.rules;
  const me = s.soldiers[f.soldier];
  const snipe = f.kind === "snipe";
  const raw = flickPath(me, f);
  const rand = rng(f.wob >>> 0);
  const reach = hitReach();
  const free = new Set(s.bases.filter((b) => dist(b, me) < b.r).map((b) => b.id));
  const targets = s.soldiers.filter((o) => o.alive && o.owner !== me.owner);
  const hit = new Set<number>();
  const hits: number[] = [];
  const events: TraceEvent[] = [];
  let end = snipe ? pathLen(raw) : Infinity;
  let cur = raw[0];
  let rest = raw.slice(1);
  const out: Pt[] = [cur];
  let run = 0;
  let offPage = false;
  const jolt = (at: Pt, sd: number) => {
    const a = gauss(rand) * sd;
    if (a) rest = rest.map((q) => rotateAbout(q, at, a));
    return a;
  };
  for (let guard = 0; rest.length && guard < 400; guard++) {
    const nxt = rest[0];
    const vx = nxt.x - cur.x, vy = nxt.y - cur.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) { rest.shift(); continue; }
    let tEnd = 1;
    if (run + len > end) tEnd = Math.max(0, (end - run) / len);
    // the earliest thing this stretch of line meets
    let bt = Infinity;
    let ev: { kind: TraceEvent["kind"]; base?: number; soldier?: number } | null = null;
    const te = edgeParam(cur, nxt);
    if (te <= tEnd) { bt = te; ev = { kind: "edge" }; }
    for (const b of s.bases) {
      for (const t of circleHits(cur, nxt, b, b.r)) {
        if (t <= tEnd && t < bt) { bt = t; ev = { kind: "wall", base: b.id }; }
        break; // only the nearer crossing can be first
      }
    }
    for (const o of targets) {
      if (hit.has(o.id)) continue;
      const px = o.x - cur.x, py = o.y - cur.y;
      if (Math.abs(px) > len + reach || Math.abs(py) > len + reach) continue;
      const u = (px * vx + py * vy) / (len * len);
      // closest further on: a later stretch of line will find him (unless the line ends here)
      if (u > tEnd && tEnd === 1 && rest.length > 1) continue;
      const t = Math.max(0, Math.min(tEnd, u));
      if (t >= bt) continue;
      if (Math.hypot(px - vx * t, py - vy * t) > reach) continue;
      // the first sliver of the line sits on the shooter's own dot
      if (run + t * len <= RULES.soldierRadius * 1.5) continue;
      bt = t; ev = { kind: "kill", soldier: o.id };
    }
    if (!ev) {
      if (tEnd < 1) { out.push({ x: cur.x + vx * tEnd, y: cur.y + vy * tEnd }); break; }
      out.push(nxt);
      run += len;
      cur = nxt;
      rest.shift();
      continue;
    }
    const at = { x: cur.x + vx * bt, y: cur.y + vy * bt };
    const d = run + len * bt;
    if (bt > 0) out.push(at);
    run = d;
    cur = at;
    if (ev.kind === "edge") { offPage = true; events.push({ kind: "edge", at, d }); break; }
    if (ev.kind === "wall") {
      if (free.has(ev.base!)) { free.delete(ev.base!); events.push({ kind: "wall", at, d, base: ev.base, free: true }); continue; }
      // garrisoned walls: as tough as the men inside at this moment (those this line crossed out don't hold it)
      const cost = wallCost(s, s.bases[ev.base!], f.kind, hit, me.id);
      if (snipe) { end = d + (end - d) * (1 - cost); events.push({ kind: "wall", at, d, base: ev.base, cost }); }
      else events.push({ kind: "wall", at, d, base: ev.base, cost, jolt: jolt(at, cost) });
      continue;
    }
    hit.add(ev.soldier!);
    hits.push(ev.soldier!);
    if (snipe) { end = d + (end - d) * (1 - R.snipeKillLoss); events.push({ kind: "kill", at, d, soldier: ev.soldier }); }
    else events.push({ kind: "kill", at, d, soldier: ev.soldier, jolt: jolt(at, R.lungeKillShake) });
  }
  return { pts: out, events, hits, offPage };
}

/** Where a flick's ink goes, and what it meets on the way. */
export interface Trace {
  pts: Pt[];
  events: TraceEvent[];
  hits: number[];
  offPage: boolean;
  /** The long war: a prism's split-off halves. */
  branches?: Pt[][];
}

// --- the long war's ink -----------------------------------------------------------
//
// A long-war line is walked like a turtle: a heading, plus the flick's own
// arc as a turn before each step, in steps short enough for the page to bend
// it. Before each step a camp's well and an old line's groove turn the
// heading a little; within it, the first thing met is dealt with: the page
// edge, a wall (priced by its garrison, as in the core rules; or a bank off a
// cushion, or a split leaving your prism), an enemy soldier, or a steep
// crossing of old ink (a jolt). A bank reflects the heading and mirrors the
// arc. The only randomness is the jolts, from the flick's `wob`.

const SUB = 14; // the longest step the pen takes between bends
const LOOK = 20, RIDING = 5; // a groove leans the pen in over this run; it's riding once this close

function traceLong(s: GameState, f: Flick): Trace {
  const R = s.rules, L = R.long!;
  const me = s.soldiers[f.soldier];
  const snipe = f.kind === "snipe";
  const raw = flickPath(me, f);
  // the arc as the turtle walks it: each step's turn (from the one before) and length
  const turn: number[] = [], len: number[] = [];
  let h0 = f.angle, prev = NaN;
  for (let i = 1; i < raw.length; i++) {
    const l = dist(raw[i - 1], raw[i]);
    if (l < 1e-9) continue;
    const h = Math.atan2(raw[i].y - raw[i - 1].y, raw[i].x - raw[i - 1].x);
    if (Number.isNaN(prev)) { h0 = h; turn.push(0); } else turn.push(wrap(h - prev));
    len.push(l);
    prev = h;
  }
  const rand = rng(f.wob >>> 0);
  const reach = hitReach();
  const targets = s.soldiers.filter((o) => o.alive && o.owner !== me.owner);
  const camps = s.bases.filter((b) => b.shape === "camp").map((b) => ({ b, men: garrison(s, b).filter((x) => x.id !== me.id) }));
  const ink = inkOf(s.marks);
  const runs: Run[] = [];
  const vmax = maxReach(R);
  const hit = new Set<number>();
  const hits: number[] = [];
  const events: TraceEvent[] = [];
  const branches: Pt[][] = [];
  let offPage = false;

  // a groove's pull: the nearest old line within reach and within the groove angle of parallel turns the pen along it, leaning in
  const pull = (p: Pt, h: number, left: number, step: number) => {
    const G = L.ink.grooveReach, max = L.ink.groove, cosMax = Math.cos(max);
    const hx = Math.cos(h), hy = Math.sin(h);
    let best = 0, delta = 0, own = false, near = Infinity, angle = 0;
    for (const r of ink.near(p.x - G, p.y - G, p.x + G, p.y + G, runs)) {
      const vx = r.b.x - r.a.x, vy = r.b.y - r.a.y;
      const l2 = vx * vx + vy * vy;
      if (l2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((p.x - r.a.x) * vx + (p.y - r.a.y) * vy) / l2));
      const qx = r.a.x + vx * t, qy = r.a.y + vy * t;
      const rho = Math.hypot(p.x - qx, p.y - qy);
      if (rho > G) continue;
      const l = Math.sqrt(l2);
      const c = (hx * vx + hy * vy) / l;
      if (Math.abs(c) <= cosMax) continue; // steeper than a groove: a crossing, not a pull
      const phi = Math.acos(Math.min(1, Math.abs(c)));
      const w = (1 - rho / G) * (1 - phi / max);
      if (w <= best) continue;
      best = w;
      // along the line (whichever way is nearer the pen's heading), leaning in toward it
      const cross = ((hx * vy - hy * vx) / l) * Math.sign(c);
      const side = hx * (qy - p.y) - hy * (qx - p.x);
      delta = Math.sign(cross) * phi + Math.sign(side) * Math.atan2(rho, LOOK);
      own = r.owner === me.owner;
      near = rho;
      angle = phi;
    }
    if (!best) return { turn: 0, k: 1 };
    // a flick slows as it runs out: speed goes as the root of the line it has left
    const speed = Math.sqrt(Math.max(0, Math.min(1, left / vmax)));
    const rate = L.ink.groovePull * best * (1 - speed) * step;
    const riding = near < RIDING && angle < max * 0.4;
    return { turn: Math.max(-rate, Math.min(rate, delta)), k: riding ? (own ? L.ink.grooveOwn : L.ink.grooveEnemy) : 1 };
  };

  interface Pen { at: Pt; h: number; sign: number; j: number; rem: number; budget: number; d: number; free: Set<number>; banks: number; jolts: number; well: number; skipBase: number }

  const walk = (pen: Pen, branch: number, canSplit: boolean): Pt[] => {
    let { at: pos, h, sign, j, rem, budget, d } = pen;
    const { free } = pen;
    let { banks, jolts, well, skipBase } = pen; // the base just met here, not to be met again at once
    let skipStroke = -1; // likewise the old stroke
    const pts: Pt[] = [pos];
    let lastInk = { stroke: -1, d: -1 };
    const ev = (e: Omit<TraceEvent, "branch">) => events.push(branch ? { ...e, branch } : e);
    for (let guard = 0; budget > 1e-6 && guard < 4000; guard++) {
      if (rem <= 1e-9) {
        j++;
        if (j < len.length) { h += sign * turn[j]; rem = len[j]; } else rem = Infinity; // past the arc with line to spare (a friendly groove): straight on
      }
      const seg = Math.min(rem, SUB);
      let wellTurn = 0, grooveTurn = 0; // what the well and the groove turned the pen for this step
      // a camp's well: lines outside its wall turn toward it, as hard as its garrison
      if (well < L.well.maxTurn) {
        let dh = 0;
        for (const c of camps) {
          if (free.has(c.b.id)) continue; // still leaving his own camp
          const dd = dist(c.b, pos), Rw = c.b.r * L.well.reach;
          if (dd <= c.b.r || dd >= Rw) continue;
          let n = 0;
          for (const x of c.men) if (!hit.has(x.id)) n++;
          const g = Math.max(L.well.floor, Math.min(1, n / capacity(s, c.b)));
          const w = ((Rw - dd) / (Rw - c.b.r)) ** 2;
          dh += L.well.pull * g * w * Math.sin(wrap(Math.atan2(c.b.y - pos.y, c.b.x - pos.x) - h)) * seg;
        }
        dh = Math.max(well - L.well.maxTurn, Math.min(L.well.maxTurn - well, dh));
        well += Math.abs(dh);
        h += dh;
        wellTurn = dh;
      }
      // a groove: nearly parallel to old ink, the pen is drawn along it; riding it, the line runs further or shorter
      let k = 1;
      if (branch || d >= Math.max(L.ink.clear, L.ink.grooveReach * 1.5)) {
        const g = pull(pos, h, budget, seg);
        h += g.turn;
        grooveTurn = g.turn;
        k = g.k;
      }
      const nxt = { x: pos.x + Math.cos(h) * seg, y: pos.y + Math.sin(h) * seg };
      const tEnd = Math.min(1, budget / (seg * k));
      // the earliest thing this step meets
      let bt = Infinity;
      let ev0: { kind: "edge" } | { kind: "wall"; base: Base; edge: number } | { kind: "kill"; soldier: number } | { kind: "ink"; run: Run } | null = null;
      const te = edgeParam(pos, nxt);
      if (te <= tEnd) { bt = te; ev0 = { kind: "edge" }; }
      for (const b of s.bases) {
        const vs = corners(b);
        const first = vs ? polyHits(pos, nxt, vs)[0] : (() => { const t = circleHits(pos, nxt, b, b.r)[0]; return t === undefined ? undefined : { t, edge: -1 }; })();
        if (!first || first.t > tEnd || first.t >= bt) continue;
        if (b.id === skipBase && first.t * seg < 1e-3) continue;
        bt = first.t; ev0 = { kind: "wall", base: b, edge: first.edge };
      }
      const vx = nxt.x - pos.x, vy = nxt.y - pos.y;
      for (const o of targets) {
        if (hit.has(o.id)) continue;
        const px = o.x - pos.x, py = o.y - pos.y;
        if (Math.abs(px) > seg + reach || Math.abs(py) > seg + reach) continue;
        const u = (px * vx + py * vy) / (seg * seg);
        if (u > tEnd && tEnd === 1 && budget - seg * k > 1e-6) continue; // closest further on: a later step finds him (unless the line ends here)
        const t = Math.max(0, Math.min(tEnd, u));
        if (t >= bt) continue;
        if (Math.hypot(px - vx * t, py - vy * t) > reach) continue;
        if (!branch && d + t * seg <= RULES.soldierRadius * 1.5) continue; // the first sliver sits on the shooter's own dot
        bt = t; ev0 = { kind: "kill", soldier: o.id };
      }
      if (ink.size && jolts < L.ink.joltMax) {
        for (const r of ink.near(Math.min(pos.x, nxt.x) - 1, Math.min(pos.y, nxt.y) - 1, Math.max(pos.x, nxt.x) + 1, Math.max(pos.y, nxt.y) + 1, runs)) {
          const t = segT(pos, nxt, r.a, r.b);
          if (t === null || t > tEnd || t >= bt) continue;
          if (!branch && d + t * seg < L.ink.clear) continue; // his own old lines all start on his dot
          if (r.stroke === skipStroke && t * seg < 1e-3) continue;
          if (r.stroke === lastInk.stroke && Math.abs(d + t * seg - lastInk.d) < 1) continue; // where two runs of one stroke meet
          let off = Math.abs(wrap(Math.atan2(r.b.y - r.a.y, r.b.x - r.a.x) - h));
          if (off > Math.PI / 2) off = Math.PI - off;
          if (off < L.ink.groove) continue; // shallow: that's a groove, not a crossing
          bt = t; ev0 = { kind: "ink", run: r };
        }
      }
      if (!ev0) {
        if (tEnd < 1) { pts.push({ x: pos.x + vx * tEnd, y: pos.y + vy * tEnd }); break; }
        budget -= seg * k;
        d += seg;
        rem -= seg;
        pts.push(nxt);
        pos = nxt;
        skipBase = skipStroke = -1;
        continue;
      }
      const at = { x: pos.x + vx * bt, y: pos.y + vy * bt };
      // cut short: the well and the groove only bent it for the part it walked
      h -= (1 - bt) * (wellTurn + grooveTurn);
      well -= (1 - bt) * Math.abs(wellTurn);
      budget -= bt * seg * k;
      d += bt * seg;
      rem -= bt * seg;
      if (bt > 0) pts.push(at);
      const was = pos;
      pos = at;
      skipBase = skipStroke = -1;
      if (ev0.kind === "edge") {
        if (!branch) offPage = true;
        ev({ kind: "edge", at, d });
        break;
      }
      if (ev0.kind === "kill") {
        hit.add(ev0.soldier);
        hits.push(ev0.soldier);
        if (snipe) { budget *= 1 - R.snipeKillLoss; ev({ kind: "kill", at, d, soldier: ev0.soldier }); }
        else { const a = gauss(rand) * R.lungeKillShake; h += a; ev({ kind: "kill", at, d, soldier: ev0.soldier, jolt: a }); }
        continue;
      }
      if (ev0.kind === "ink") {
        const a = gauss(rand) * L.ink.jolt;
        h += a;
        jolts++;
        skipStroke = ev0.run.stroke;
        lastInk = { stroke: ev0.run.stroke, d };
        ev({ kind: "ink", at, d, jolt: a });
        continue;
      }
      // a wall: which way through?
      const b = ev0.base;
      skipBase = b.id;
      const e = Math.min(0.5, 0.5 / seg);
      const before = { x: was.x + vx * Math.max(0, bt - e), y: was.y + vy * Math.max(0, bt - e) };
      const after = { x: was.x + vx * Math.min(1, bt + e), y: was.y + vy * Math.min(1, bt + e) };
      const inBefore = inside(b, before, 1), inAfter = inside(b, after, 1);
      const entering = !inBefore && inAfter, leaving = inBefore && !inAfter;
      if (!entering && !leaving) continue; // grazed a corner
      if (b.shape === "cushion" && entering && banks < L.cushion.maxBanks) {
        // billiards: only a glancing line comes off the cushion; a straight one goes in
        const vs = corners(b)!, p = vs[ev0.edge], q = vs[(ev0.edge + 1) % vs.length];
        const wall = Math.atan2(q.y - p.y, q.x - p.x);
        if (Math.abs(Math.cos(h - wall)) > Math.sin(L.cushion.glance)) {
          h = 2 * wall - h;
          sign = -sign;
          banks++;
          ev({ kind: "bank", at, d, base: b.id });
          continue;
        }
      }
      const back = leaving && free.has(b.id);
      if (back) free.delete(b.id);
      const own = b.shape === "prism" && b.owner === me.owner && L.prism.ownFree;
      if (back || own) ev({ kind: "wall", at, d, base: b.id, free: true });
      else {
        // garrisoned walls, as in the core rules: as tough as the men inside at this moment
        const cost = wallCost(s, b, f.kind, hit, me.id);
        if (snipe) { budget *= 1 - cost; ev({ kind: "wall", at, d, base: b.id, cost }); }
        else { const a = gauss(rand) * cost; h += a; ev({ kind: "wall", at, d, base: b.id, cost, jolt: a }); }
      }
      if (b.shape === "prism" && b.owner === me.owner && snipe && leaving && canSplit) {
        // leaving your own prism, a snipe splits in two
        canSplit = false;
        ev({ kind: "split", at, d, base: b.id });
        const half = { at, sign, j, rem, budget, d, free: new Set(free), banks, jolts, well, skipBase: b.id };
        branches.push(walk({ ...half, h: h - L.prism.spread }, branches.length + 1, false));
        h += L.prism.spread;
      }
    }
    return pts;
  };

  const free = new Set(s.bases.filter((b) => wallGap(b, me) < 0).map((b) => b.id));
  const pts = walk({ at: { x: me.x, y: me.y }, h: h0, sign: 1, j: 0, rem: len[0] ?? 0, budget: pathLen(raw), d: 0, free, banks: 0, jolts: 0, well: 0, skipBase: -1 }, 0, true);
  return { pts, events, hits, offPage, ...(branches.length && { branches }) };
}

const empty = (): Outcome => ({ path: [], killed: [], lost: false, events: [], again: true, earned: false, stood: [], walked: [], arrived: [], handover: false });

/** What a flick would do, without doing it. */
export function preview(s: GameState, f: Flick): Outcome {
  const tr = trace(s, f);
  const o: Outcome = { ...empty(), path: tr.pts, killed: tr.hits, events: tr.events, ...(tr.branches && { branches: tr.branches }) };
  if (f.kind === "lunge") {
    const end = tr.pts[tr.pts.length - 1];
    if (tr.offPage) o.lost = true;
    else {
      // where he lands decides: among enemy soldiers still standing in their base, they shoot him
      const dead = new Set(tr.hits);
      const me = s.soldiers[f.soldier];
      const at = (b: Base) => (s.rules.long ? inside(b, end, 1) : dist(b, end) <= b.r);
      const camp = s.bases.find((b) => b.owner !== me.owner && at(b) && garrison(s, b).some((x) => !dead.has(x.id)));
      if (camp) { o.lost = true; o.crashed = camp.id; }
      else o.movedTo = { x: end.x, y: end.y };
    }
  }
  return o;
}

// --- the reducer -------------------------------------------------------------

const markSeed = (s: GameState) => (s.seed + s.actions.length * 104729) >>> 0;

/** Apply one action. Throws (and changes nothing) if it isn't legal now. */
export function act(s: GameState, a: Action): Outcome {
  const why = illegal(s, a);
  if (why) throw new Error(`illegal ${a.t}: ${why}`);
  const seed = markSeed(s);
  s.actions.push(structuredClone(a));
  switch (a.t) {
    case "base": placeBase(s, a.x, a.y, a.shape); return { ...empty(), again: false };
    case "arrange": { const x = s.soldiers[a.soldier]; x.x = a.x; x.y = a.y; return empty(); }
    case "ready": {
      s.ready[s.current] = true;
      if (s.ready[0] && s.ready[1]) { s.phase = "play"; s.current = 0; s.turn = 1; s.left = allotment(s, 0); }
      else s.current = other(s.current);
      return { ...empty(), again: false };
    }
    case "flick": { const { t: _t, ...f } = a; void _t; return flick(s, f, seed); }
    case "send": return send(s, a, seed);
    case "stop": {
      const o = empty();
      if (s.chain) { s.chain = undefined; s.left -= 1; }
      else s.left = 0;
      if (s.left <= 0 || !flickers(s).length) endTurn(s, seed, o);
      o.again = !o.handover;
      return o;
    }
  }
}

/** Why an action can't be applied now, or null if it can. */
export function illegal(s: GameState, a: Action): string | null {
  switch (a.t) {
    case "base":
      if (s.rules.long ? !SHAPES.includes(a.shape!) : a.shape !== undefined) return s.rules.long ? "pick a shape" : "no shapes in a quick battle";
      return canPlaceBase(s, a.x, a.y, a.shape);
    case "arrange": return canArrange(s, a.soldier, a.x, a.y);
    case "ready": return s.phase === "position" ? null : "not positioning";
    case "flick": {
      if (!canFlick(s, a.soldier, a.kind)) return s.chain ? "an earned lunge is his to take" : "not his to flick";
      if (a.kind !== "snipe" && a.kind !== "lunge") return "unknown flick";
      if (![a.angle, a.length, a.bend].every(Number.isFinite) || a.length <= 0) return "bad numbers";
      return null;
    }
    case "send": return canSend(s, a.from, a.to, a.n);
    case "stop": return s.phase === "play" ? null : "not playing";
  }
  return "unknown action";
}

function flick(s: GameState, f: Flick, seed: number): Outcome {
  const o = preview(s, f);
  const me = s.soldiers[f.soldier];
  const who = me.owner;
  s.marks.push({ t: "stroke", kind: f.kind, owner: who, pts: o.path, seed, turn: s.turn });
  o.branches?.forEach((pts, k) => s.marks.push({ t: "stroke", kind: f.kind, owner: who, pts, seed: seed + 3 + k, turn: s.turn }));
  for (const id of o.killed) {
    const v = s.soldiers[id];
    v.alive = false;
    s.marks.push({ t: "cross", kind: "kill", owner: who, x: v.x, y: v.y, seed: seed + id, turn: s.turn });
  }
  for (const c of s.convoys) if (c.state === "road" && c.ids.every((id) => !s.soldiers[id].alive)) c.state = "cut";
  if (f.kind === "lunge") {
    s.marks.push({ t: "cross", kind: "moved", owner: who, x: me.x, y: me.y, seed: seed + 1, turn: s.turn, id: me.id });
    const end = o.path[o.path.length - 1];
    if (o.lost) {
      me.alive = false;
      // shot where he landed: he got there, so his dot is there; off the page, he's just gone
      if (o.crashed !== undefined) { me.x = end.x; me.y = end.y; }
      s.marks.push({ t: "cross", kind: "lost", owner: who, x: end.x, y: end.y, seed: seed + 2, turn: s.turn });
    } else {
      me.x = o.movedTo!.x;
      me.y = o.movedTo!.y;
    }
  }
  standCheck(s, seed, o);
  if (winCheck(s, who, o)) return o;
  s.left -= 1;
  // what earns another flick: a snipe that takes two, or a lunge that kills (the same man lunges on)
  if (f.kind === "snipe") {
    s.chain = undefined;
    if (o.killed.length >= s.rules.snipeEarnAt) { s.left += 1; o.earned = true; }
  } else if (o.killed.length > 0 && !o.lost) {
    s.left += 1;
    o.earned = true;
    s.chain = { soldier: me.id, link: (s.chain?.link ?? 0) + 1 };
  } else s.chain = undefined;
  if (s.left <= 0 || !flickers(s).length) endTurn(s, seed, o);
  o.again = !o.handover;
  return o;
}

function winCheck(s: GameState, who: Player, o: Outcome) {
  const foe = other(who);
  const out = (p: Player) => alive(s, p).length === 0;
  if (!out(foe) && !out(who)) return false;
  s.phase = "over";
  s.winner = out(foe) ? who : foe;
  s.left = 0;
  s.chain = undefined;
  o.again = false;
  return true;
}

function standCheck(s: GameState, seed: number, o: Outcome) {
  for (const p of [0, 1] as Player[]) {
    const left = alive(s, p);
    if (s.stand[p] || !left.length || left.length > s.rules.lastStandAt) continue;
    s.stand[p] = Math.max(1, s.turn);
    s.marks.push({ t: "stand", owner: p, at: left.map((x) => ({ x: x.x, y: x.y })), seed: seed + 500 + p, turn: s.turn });
    o.stood.push(p);
  }
}

// --- sends --------------------------------------------------------------------

export function canSend(s: GameState, from: number, to: number, n: number): string | null {
  if (s.phase !== "play") return "not now";
  if (s.sent) return "one send a turn";
  const a = s.bases[from], b = s.bases[to];
  if (!a || !b || a === b) return "pick two bases";
  if (a.owner !== s.current || b.owner !== s.current) return "both bases must be yours";
  if (!Number.isInteger(n) || n < 1) return "send at least one";
  if (n > s.rules.sendMax) return `at most ${s.rules.sendMax} at a time`;
  if (sendable(s, a).length < n) return "not that many there";
  return null;
}

/** Most soldiers you could send from this base now. */
export function sendMax(s: GameState, from: number) {
  const a = s.bases[from];
  if (!a || a.owner !== s.current || s.sent || s.phase !== "play") return 0;
  return Math.min(s.rules.sendMax, sendable(s, a).length);
}

/** The road between two bases: wall to wall. */
export function roadBetween(a: Pt & { r: number }, b: Pt & { r: number }): [Pt, Pt] {
  const l = dist(a, b) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  return [
    { x: a.x + ux * (a.r + 6), y: a.y + uy * (a.r + 6) },
    { x: b.x - ux * (b.r + 6), y: b.y - uy * (b.r + 6) },
  ];
}

/** The soldiers a send of `n` from `from` to `to` would take: the ones nearest the road. */
export function whoGoes(s: GameState, from: number, to: number, n: number) {
  const b = s.bases[to];
  return sendable(s, s.bases[from]).sort((p, q) => dist(p, b) - dist(q, b) || p.id - q.id).slice(0, n);
}

/** A long-war column on its road: the head `at` units along it, the rest behind (none behind the start). */
export function columnAt(road: [Pt, Pt], at: number, n: number): Pt[] {
  const [a, b] = road;
  const l = dist(a, b) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  const gap = RULES.soldierRadius * 2.6;
  return Array.from({ length: n }, (_, k) => {
    const u = Math.max(0, Math.min(l, at) - k * gap);
    return { x: a.x + ux * u, y: a.y + uy * u };
  });
}

/** Where a convoy stands on the road during the enemy's turn: a column across the middle. */
export function columnSpots(road: [Pt, Pt], n: number): Pt[] {
  const [a, b] = road;
  const l = dist(a, b) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  const gap = RULES.soldierRadius * 2.6;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return Array.from({ length: n }, (_, k) => {
    const off = ((n - 1) / 2 - k) * gap; // the front of the column nearest where they're going
    return { x: mx + ux * off, y: my + uy * off };
  });
}

function send(s: GameState, a: { from: number; to: number; n: number }, seed: number): Outcome {
  void seed;
  const go = whoGoes(s, a.from, a.to, a.n);
  const c: Convoy = {
    id: s.convoys.length, owner: s.current, from: a.from, to: a.to, ids: go.map((x) => x.id), state: "ordered",
    road: roadBetween(s.bases[a.from], s.bases[a.to]), turn: s.turn,
  };
  s.convoys.push(c);
  for (const x of go) x.convoy = c.id;
  s.sent = true;
  const o = empty();
  // everyone who could flick is off on the road: the turn is over
  if (!flickers(s).length) { s.left = 0; s.chain = undefined; endTurn(s, seed, o); }
  o.again = !o.handover;
  return o;
}

// The pen changes hands. The outgoing side's sends walk out onto the road
// (there for exactly one enemy turn); the incoming side's convoys arrive.
function endTurn(s: GameState, seed: number, o: Outcome) {
  const who = s.current, foe = other(who);
  if (s.rules.long) return endLongTurn(s, seed, o);
  for (const c of s.convoys) if (c.owner === who && c.state === "ordered") walkOut(s, c, seed, o);
  s.current = foe;
  s.turn++;
  s.sent = false;
  s.chain = undefined;
  for (const c of s.convoys) if (c.owner === foe && c.state === "road") arrive(s, c, seed, o);
  s.left = allotment(s, foe);
  o.handover = true;
  o.again = false;
}

// The long war's roads are long: at every hand-over each convoy on the road
// walks `sendPace` further (going in if that reaches the far wall), and the
// outgoing side's sends walk out. They're exposed the whole way, and always
// for at least one enemy turn.
function endLongTurn(s: GameState, seed: number, o: Outcome) {
  const who = s.current, foe = other(who), pace = s.rules.long!.sendPace;
  o.advanced = [];
  for (const c of s.convoys) {
    if (c.state !== "road") continue;
    const go = c.ids.map((id) => s.soldiers[id]).filter((x) => x.alive && x.convoy === c.id);
    const l = dist(c.road[0], c.road[1]);
    if (!go.length) { c.state = "cut"; continue; }
    if (c.at! + pace >= l) { arrive(s, c, seed, o); continue; }
    const was = columnAt(c.road, c.at!, 1)[0];
    c.at = c.at! + pace;
    columnAt(c.road, c.at, go.length).forEach((p, k) => { go[k].x = p.x; go[k].y = p.y; });
    s.marks.push({ t: "walk", owner: c.owner, a: was, b: columnAt(c.road, c.at, 1)[0], n: go.length, seed: seed + 7 + c.id, turn: s.turn });
    o.advanced.push(c.id);
  }
  for (const c of s.convoys) {
    if (c.owner !== who || c.state !== "ordered") continue;
    const go = c.ids.map((id) => s.soldiers[id]).filter((x) => x.alive);
    if (!go.length) { c.state = "cut"; continue; }
    c.at = Math.min(dist(c.road[0], c.road[1]), pace);
    const spots = columnAt(c.road, c.at, go.length);
    go.forEach((x, k) => {
      s.marks.push({ t: "cross", kind: "moved", owner: c.owner, x: x.x, y: x.y, seed: seed + 11 + x.id, turn: s.turn, id: x.id });
      x.x = spots[k].x;
      x.y = spots[k].y;
    });
    s.marks.push({ t: "walk", owner: c.owner, a: c.road[0], b: spots[0], n: go.length, seed: seed + 7 + c.id, turn: s.turn });
    c.state = "road";
    o.walked.push(c.id);
  }
  s.current = foe;
  s.turn++;
  s.sent = false;
  s.chain = undefined;
  s.left = allotment(s, foe);
  o.handover = true;
  o.again = false;
}

function walkOut(s: GameState, c: Convoy, seed: number, o: Outcome) {
  const go = c.ids.map((id) => s.soldiers[id]).filter((x) => x.alive);
  if (!go.length) { c.state = "cut"; return; }
  const spots = columnSpots(c.road, go.length);
  go.forEach((x, k) => {
    s.marks.push({ t: "cross", kind: "moved", owner: c.owner, x: x.x, y: x.y, seed: seed + 11 + x.id, turn: s.turn, id: x.id });
    x.x = spots[k].x;
    x.y = spots[k].y;
  });
  const mid = { x: (c.road[0].x + c.road[1].x) / 2, y: (c.road[0].y + c.road[1].y) / 2 };
  s.marks.push({ t: "walk", owner: c.owner, a: c.road[0], b: mid, n: go.length, seed: seed + 7 + c.id, turn: s.turn });
  c.state = "road";
  o.walked.push(c.id);
}

function arrive(s: GameState, c: Convoy, seed: number, o: Outcome) {
  const go = c.ids.map((id) => s.soldiers[id]).filter((x) => x.alive && x.convoy === c.id);
  if (!go.length) { c.state = "cut"; return; }
  const b = s.bases[c.to];
  const mid = c.at !== undefined ? columnAt(c.road, c.at, 1)[0] : { x: (c.road[0].x + c.road[1].x) / 2, y: (c.road[0].y + c.road[1].y) / 2 };
  if (dist(mid, c.road[1]) > 1e-6) s.marks.push({ t: "walk", owner: c.owner, a: mid, b: c.road[1], n: go.length, seed: seed + 9 + c.id, turn: s.turn });
  const avoid = s.soldiers.filter((x) => x.alive && x.convoy === undefined).map((x) => ({ x: x.x, y: x.y }));
  const spots = scatterIn(b, go.length, (seed ^ (c.id * 2654435761)) >>> 0, avoid);
  go.forEach((x, k) => {
    s.marks.push({ t: "cross", kind: "moved", owner: c.owner, x: x.x, y: x.y, seed: seed + 13 + x.id, turn: s.turn, id: x.id });
    const p = spots[k] ?? { x: b.x + (k - go.length / 2) * 4, y: b.y };
    x.x = p.x;
    x.y = p.y;
    x.home = b.id;
    x.convoy = undefined;
  });
  c.state = "arrived";
  o.arrived.push(c.id);
}

// --- replay -------------------------------------------------------------------

/** Rebuild a game from its seed, size, rules and actions. */
export function replay(size: Size, seed: number, actions: Action[], rules: CoreRules = CORE, page?: GameState["page"]): GameState {
  const s = newGame(size, seed, page, rules);
  for (const a of actions) act(s, a);
  return s;
}

export const clone = (s: GameState): GameState => structuredClone(s);
