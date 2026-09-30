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
// (pure, tested)

import { circleHits, dist, flickPath, gauss, pathLen, rng, rotateAbout, type Pt } from "./geom";
import { CORE, RULES, SIZES, type CoreRules, type Size } from "./rules";

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
  | { t: "base"; x: number; y: number }
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
}

/** Something that happened along a line, in order. */
export interface TraceEvent {
  kind: "wall" | "kill" | "edge";
  at: Pt;
  /** Distance along the line. */
  d: number;
  base?: number;
  soldier?: number;
  /** A wall at the shooter's back (leaving the base he stands in): free. */
  free?: boolean;
  /** Radians the lunger's heading turned here. */
  jolt?: number;
}

/** What an action did. Flick fields are empty for the other actions. */
export interface Outcome {
  path: Pt[];
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

export function canPlaceBase(s: GameState, x: number, y: number): string | null {
  if (s.phase !== "setup") return "not setup";
  const r = RULES.baseRadius;
  if (x - r < RULES.margin + 8 || x + r > RULES.pageW - 16 || y - r < 16 || y + r > RULES.pageH - 16) return "too close to the edge";
  for (const b of s.bases) {
    const gap = b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap;
    if (Math.hypot(b.x - x, b.y - y) < b.r + r + gap) return b.owner === s.current ? "overlaps your base" : "too close to the enemy";
  }
  return null;
}

function placeBase(s: GameState, x: number, y: number) {
  const why = canPlaceBase(s, x, y);
  if (why) throw new Error(why);
  const id = s.bases.length;
  const base: Base = { id, owner: s.current, x, y, r: RULES.baseRadius, seed: (s.seed ^ (id * 7919)) >>> 0 };
  s.bases.push(base);
  for (const p of scatterIn(base, s.size.soldiers, base.seed)) {
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

/** Dots jotted into a circle by hand: spread out, never touching, clear of the wall. */
export function scatterIn(b: { x: number; y: number; r: number }, n: number, seed: number, avoid: Pt[] = []): Pt[] {
  const rand = rng(seed);
  const dot = RULES.soldierRadius;
  const pts: Pt[] = [];
  const inner = b.r - dot * 2.2;
  let minD = dot * 3.2;
  let tries = 0;
  while (pts.length < n && tries < 20000) {
    tries++;
    if (tries % 4000 === 0) minD *= 0.8; // a crowded base: squeeze them in
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * inner;
    const p = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d };
    if (pts.every((q) => dist(q, p) >= minD) && avoid.every((q) => dist(q, p) >= minD)) pts.push(p);
  }
  return pts;
}

// --- positioning --------------------------------------------------------------

/** Where a soldier may be put before the first flick: in his base or within reach of its wall, on the page, clear of everyone. */
export function canArrange(s: GameState, id: number, x: number, y: number): string | null {
  if (s.phase !== "position") return "not now";
  const me = s.soldiers[id];
  if (!me || !me.alive || me.owner !== s.current) return "not yours";
  const home = s.bases[me.home ?? -1];
  if (!home) return "no home base";
  const p = { x, y };
  if (dist(home, p) > home.r + s.rules.positionReach) return "too far from his base";
  if (x < RULES.margin + 8 || x > RULES.pageW - 8 || y < 8 || y > RULES.pageH - 8) return "off the page";
  for (const b of s.bases) if (b.owner !== me.owner && dist(b, p) <= b.r * 1.1) return "in their base";
  for (const o of s.soldiers) if (o.id !== id && o.alive && dist(o, p) < RULES.soldierRadius * 2.4) return "on top of someone";
  return null;
}

// --- queries ----------------------------------------------------------------

/** Living soldiers, including any in a send. */
export function alive(s: GameState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p);
}

const onRoad = (s: GameState, x: Soldier) => x.convoy !== undefined && s.convoys[x.convoy]?.state === "road";

/** Is this point inside the base's wall? Dots drawn on the line count. */
export const inside = (b: Base, p: Pt, slack = 1.05) => dist(b, p) <= b.r * slack;

/** The base's own living soldiers standing inside its wall (not out on a road). */
export function garrison(s: GameState, b: Base) {
  return s.soldiers.filter((x) => x.alive && x.owner === b.owner && !onRoad(s, x) && inside(b, x));
}

/** An empty ring: a base with nobody of its own inside. It stays on the page, and a send can man it again. */
export const isRing = (s: GameState, b: Base) => garrison(s, b).length === 0;

/** The soldiers a send from this base can take: its own men in it or just outside (positioning), not already sent, not owing a lunge. */
export function sendable(s: GameState, b: Base) {
  const reach = b.r + s.rules.positionReach + 1;
  return s.soldiers.filter((x) => x.alive && x.owner === b.owner && x.convoy === undefined && s.chain?.soldier !== x.id && dist(b, x) <= reach);
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
  return { mult, tremor };
}

/** Flicks a side gets at the start of its turn. */
/**
 * An extra flick owed this turn from a snipe that took two (a lunge's is the
 * chain's): who earned it, and how many are owed. Derived from state alone
 * (flicks left against the turn's allotment less the strokes already drawn),
 * so a reload, a room or a replay shows what the live game did.
 */
export function owedFlick(s: GameState): { soldier: number; n: number } | undefined {
  if (s.phase !== "play" || s.chain) return undefined;
  const p = s.current;
  const start = s.stand[p] > 0 && s.stand[p] < s.turn ? s.rules.lastStandFlicks : 1; // a stand begun this turn doesn't bump this turn
  let used = 0;
  for (const m of s.marks) if (m.t === "stroke" && m.turn === s.turn && m.owner === p) used++;
  // more flicks left than an unearned turn would leave; what's owed is the extra, never more than what's left
  const n = Math.min(s.left, s.left - (start - used));
  const last = s.actions[s.actions.length - 1];
  if (n <= 0 || !used || last?.t !== "flick" || last.kind !== "snipe" || s.soldiers[last.soldier]?.owner !== p) return undefined;
  return { soldier: last.soldier, n };
}

export const allotment = (s: GameState, p: Player) => (inLastStand(s, p) ? s.rules.lastStandFlicks : 1);

/** How long a flick of this power is (0..1). Both kinds reach as far. */
export function reachOf(R: CoreRules, power: number) {
  const p = Math.pow(Math.max(0, Math.min(1, power)), 0.9);
  return R.reach.min + (R.reach.max - R.reach.min) * p;
}

/** The power that gives a flick this length (inverse of reachOf). */
export function powerFor(R: CoreRules, length: number) {
  const f = Math.max(0, Math.min(1, (length - R.reach.min) / Math.max(1, R.reach.max - R.reach.min)));
  return Math.pow(f, 1 / 0.9);
}

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
export function trace(s: GameState, f: Flick): { pts: Pt[]; events: TraceEvent[]; hits: number[]; offPage: boolean } {
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
      if (snipe) { end = d + (end - d) * (1 - R.snipeWallLoss); events.push({ kind: "wall", at, d, base: ev.base }); }
      else events.push({ kind: "wall", at, d, base: ev.base, jolt: jolt(at, R.lungeWallShake) });
      continue;
    }
    hit.add(ev.soldier!);
    hits.push(ev.soldier!);
    if (snipe) { end = d + (end - d) * (1 - R.snipeKillLoss); events.push({ kind: "kill", at, d, soldier: ev.soldier }); }
    else events.push({ kind: "kill", at, d, soldier: ev.soldier, jolt: jolt(at, R.lungeKillShake) });
  }
  return { pts: out, events, hits, offPage };
}

const empty = (): Outcome => ({ path: [], killed: [], lost: false, events: [], again: true, earned: false, stood: [], walked: [], arrived: [], handover: false });

/** What a flick would do, without doing it. */
export function preview(s: GameState, f: Flick): Outcome {
  const tr = trace(s, f);
  const o: Outcome = { ...empty(), path: tr.pts, killed: tr.hits, events: tr.events };
  if (f.kind === "lunge") {
    const end = tr.pts[tr.pts.length - 1];
    if (tr.offPage) o.lost = true;
    else {
      // where he lands decides: among enemy soldiers still standing in their base, they shoot him
      const dead = new Set(tr.hits);
      const me = s.soldiers[f.soldier];
      const camp = s.bases.find((b) => b.owner !== me.owner && dist(b, end) <= b.r && garrison(s, b).some((x) => !dead.has(x.id)));
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
    case "base": placeBase(s, a.x, a.y); return { ...empty(), again: false };
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
    case "base": return canPlaceBase(s, a.x, a.y);
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
  const mid = { x: (c.road[0].x + c.road[1].x) / 2, y: (c.road[0].y + c.road[1].y) / 2 };
  s.marks.push({ t: "walk", owner: c.owner, a: mid, b: c.road[1], n: go.length, seed: seed + 9 + c.id, turn: s.turn });
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
