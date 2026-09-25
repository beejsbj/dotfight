// Pure game state. No DOM, no clock: randomness comes in through seeds and
// resolved flicks, so a game can be saved, replayed, or simulated by the bot.
// Everything a game does is driven by its RuleSet (s.rules), and every action
// is logged (s.actions) so replay(newGame(...), actions) rebuilds the page.

import { insideBase, scatterIn } from "./bases";
import { boxOf, cutAt, dist, distToPath, flickPath, pathLen, rng, segHit, type Pt } from "./geom";
import { PROTOTYPE, RULES, resolveRules, type RuleSet, type Shape } from "./rules";
import { trace, type TraceEvent } from "./trace";

export { rng, flickPath, distToPath, pathLen, pointAlong, type Pt } from "./geom";
export type { TraceEvent } from "./trace";

export type Player = 0 | 1;
export type ActionKind = "shoot" | "move";

export interface Base {
  id: number;
  owner: Player;
  /** Who drew it. Differs from owner once it's been captured. */
  founder: Player;
  x: number;
  y: number;
  /** Circumradius. */
  r: number;
  seed: number;
  shape: Shape;
  rot: number;
  /** The turn it fell (no living soldier of its owner left inside). Gone for good, unless captured. */
  fallen?: number;
  /** Wall edges that have taken their one hit. */
  breached?: number[];
}

export interface Soldier {
  id: number;
  owner: Player;
  x: number;
  y: number;
  alive: boolean;
  /** Hits left (last stand). Missing means 1. */
  hp?: number;
  /** On the road in this transfer; off the page until it arrives. */
  transit?: number;
}

export interface Transit {
  id: number;
  owner: Player;
  from: number;
  to: number;
  ids: number[];
  /** Opponent actions until they arrive. */
  due: number;
  road: [Pt, Pt];
  turn: number;
  state: "road" | "arrived" | "cut";
}

export type Mark =
  | { t: "stroke"; kind: ActionKind; owner: Player; pts: Pt[]; seed: number; turn: number; branch?: number }
  // kill: crossed in the killer's ink. moved: crossed in your own ink (left the spot). wound: one stroke of a cross.
  | { t: "cross"; kind: "kill" | "moved" | "lost" | "wound"; owner: Player; x: number; y: number; seed: number; turn: number }
  // a transfer's road, drawn between two bases with how many walk it
  | { t: "road"; owner: Player; a: Pt; b: Pt; n: number; transit: number; seed: number; turn: number }
  // a wall edge taking its hit
  | { t: "notch"; owner: Player; x: number; y: number; base: number; edge: number; seed: number; turn: number }
  // a base struck through when it falls (in the ink of whoever made it fall)
  | { t: "raze"; owner: Player; base: number; seed: number; turn: number }
  // a fallen base re-circled by whoever took it
  | { t: "found"; owner: Player; base: number; seed: number; turn: number }
  // a side's last stand begins
  | { t: "stand"; owner: Player; seed: number; turn: number; at?: Pt[] };

export interface Flick {
  soldierId: number;
  kind: ActionKind;
  angle: number; // radians, world space
  length: number; // world units, before anything stops it
  bend: number; // signed, fraction of length the line bows sideways
}

export type Action =
  | { t: "base"; x: number; y: number; shape?: Shape }
  | ({ t: "flick" } & Flick)
  | { t: "transfer"; from: number; to: number; n: number }
  | { t: "pass" };

export interface Outcome {
  /** The main line: the one the pen draws and a mover rides. */
  path: Pt[];
  /** Every branch of the line (a prism splits it). paths[0] === path. */
  paths: Pt[][];
  killed: number[];
  wounded: number[];
  movedTo?: Pt;
  lost: boolean;
  events: TraceEvent[];
  breaches: { base: number; edge: number; at: Pt }[];
  /** Convoys caught on the road by this line. */
  cut: { transit: number; ids: number[]; at: Pt[] }[];
  // filled in by act()
  arrived?: number[];
  fell?: number[];
  founded?: number[];
  stood?: Player[];
  /** The same player acts again (a kill, or a last-stand second shot). */
  again?: boolean;
}

export interface GameState {
  v: 2;
  seed: number;
  rules: RuleSet;
  phase: "setup" | "play" | "over";
  current: Player;
  turn: number;
  /** Actions the current player still has this turn. */
  owed: number;
  /** Has the current player already earned a kill bonus this turn? (extraTurn "once") */
  bonus: boolean;
  /** Extra flicks earned this turn (missing in older saves: read from `bonus`). */
  streak?: number;
  /** Turn each side's last stand began (0: not yet). */
  stand: [number, number];
  bases: Base[];
  soldiers: Soldier[];
  transits: Transit[];
  marks: Mark[];
  /** Everything that happened, in order: enough to replay the page. */
  actions: Action[];
  winner?: Player;
  page?: { no: number; date: string }; // written in the header; optional so older saves still load
}

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

// --- setup ------------------------------------------------------------------

export function newGame(rules: RuleSet | Partial<RuleSet> = PROTOTYPE, seed = (Math.random() * 2 ** 32) >>> 0, page?: GameState["page"]): GameState {
  return {
    v: 2, seed, rules: resolveRules(rules), phase: "setup", current: 0, turn: 0, owed: 1, bonus: false, streak: 0, stand: [0, 0],
    bases: [], soldiers: [], transits: [], marks: [], actions: [], ...(page && { page }),
  };
}

/** Load any saved state: v1 saves (before rule sets) play on with the prototype's rules. */
export function migrate(raw: unknown): GameState {
  const o = raw as Partial<GameState> & { v: number; flicks?: Flick[] };
  if (o.v === 2) return { ...o, rules: resolveRules(o.rules) } as GameState;
  if (o.v !== 1) throw new Error("unknown save");
  const bases: Base[] = (o.bases ?? []).map((b) => ({ ...b, founder: b.owner, shape: "circle", rot: 0 }));
  const actions: Action[] = [
    ...bases.map((b) => ({ t: "base" as const, x: b.x, y: b.y })),
    ...(o.flicks ?? []).map((f) => ({ t: "flick" as const, ...f })),
  ];
  const { flicks: _drop, ...rest } = o;
  void _drop;
  return {
    ...(rest as GameState), v: 2, rules: resolveRules(PROTOTYPE), owed: 1, bonus: false, stand: [0, 0],
    bases, transits: [], actions,
  };
}

/** Shapes a player still has to draw (all circles without a kit). */
export function kitLeft(s: GameState, p: Player): Shape[] {
  const placed = s.bases.filter((b) => b.founder === p).map((b) => b.shape);
  if (!s.rules.kit) return Array(Math.max(0, s.rules.basesPerPlayer - placed.length)).fill("circle");
  const left = [...s.rules.kit];
  for (const sh of placed) { const i = left.indexOf(sh); if (i >= 0) left.splice(i, 1); }
  return left;
}

export function basesLeft(s: GameState, p: Player) {
  return kitLeft(s, p).length;
}

export const baseRadius = (R: RuleSet, shape: Shape = "circle") => R.baseRadius * (R.shapes[shape]?.size ?? 1);

export function canPlaceBase(s: GameState, x: number, y: number, shape: Shape = kitLeft(s, s.current)[0] ?? "circle"): string | null {
  if (s.phase !== "setup") return "not setup";
  const R = s.rules;
  if (!kitLeft(s, s.current).includes(shape)) return "none of those left";
  const r = baseRadius(R, shape);
  if (x - r < RULES.margin + 8 || x + r > RULES.pageW - 16 || y - r < 16 || y + r > RULES.pageH - 16)
    return "too close to the edge";
  for (const b of s.bases) {
    const gap = b.owner === s.current ? R.minBaseGap : R.minEnemyBaseGap;
    if (Math.hypot(b.x - x, b.y - y) < b.r + r + gap)
      return b.owner === s.current ? "overlaps your base" : "too close to the enemy";
  }
  return null;
}

export function placeBase(s: GameState, x: number, y: number, shape?: Shape): Base {
  const sh = shape ?? kitLeft(s, s.current)[0] ?? "circle";
  const why = canPlaceBase(s, x, y, sh);
  if (why) throw new Error(why);
  const R = s.rules;
  const id = s.bases.length;
  const seed = (s.seed ^ (id * 7919)) >>> 0;
  const base: Base = {
    id, owner: s.current, founder: s.current, x, y, r: baseRadius(R, sh), seed, shape: sh,
    rot: sh === "circle" ? 0 : rng(seed ^ 0x5bd1)() * Math.PI * 2,
  };
  s.bases.push(base);
  s.actions.push({ t: "base", x, y, ...(shape && { shape }) });
  const n = sh === "circle" ? R.soldiersPerBase : R.shapes[sh].soldiers;
  for (const p of scatterIn(base, n, seed, R.soldierRadius)) {
    s.soldiers.push({ id: s.soldiers.length, owner: base.owner, x: p.x, y: p.y, alive: true });
  }
  if (basesLeft(s, 0) === 0 && basesLeft(s, 1) === 0) {
    s.phase = "play";
    s.current = R.firstFlick ?? 0;
    s.turn = 1;
    s.owed = allotment(s, s.current);
  } else {
    s.current = basesLeft(s, other(s.current)) > 0 ? other(s.current) : s.current;
  }
  return base;
}

/** Soldier positions for a circle base, as the prototype jotted them. */
export function scatterSoldiers(b: Base, R: RuleSet = PROTOTYPE): Pt[] {
  return scatterIn(b, R.soldiersPerBase, b.seed, R.soldierRadius);
}

// --- queries ----------------------------------------------------------------

/** Living soldiers, including any on the road. */
export function alive(s: GameState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p);
}

/** Living soldiers on the page: the ones that can flick and be hit. */
export function ready(s: GameState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p && x.transit === undefined);
}

export function standing(s: GameState, p: Player) {
  return s.bases.filter((b) => b.owner === p && !b.fallen);
}

/** The owner's living soldiers standing in a base. */
export function garrison(s: GameState, b: Base) {
  return s.soldiers.filter((x) => x.alive && x.transit === undefined && x.owner === b.owner && insideBase(b, x));
}

export function canAct(s: GameState, soldierId: number) {
  const x = s.soldiers[soldierId];
  return s.phase === "play" && !!x && x.alive && x.owner === s.current && x.transit === undefined;
}

/** Is this side in its last stand? */
export const inLastStand = (s: GameState, p: Player) => !!s.rules.lastStand && s.stand[p] > 0;

/** Multiplier on the hand error of this soldier's flick (last stand: steadier). Never 0: the flick stays a flick. */
export function steadiness(s: GameState, soldierId: number) {
  const x = s.soldiers[soldierId];
  return x && inLastStand(s, x.owner) ? Math.max(0.3, s.rules.lastStand!.steady) : 1;
}

export function allotment(s: GameState, p: Player) {
  return inLastStand(s, p) ? Math.max(1, s.rules.lastStand!.shots) : 1;
}

export function hitReach(s: GameState, x: Soldier) {
  const grow = inLastStand(s, x.owner) ? s.rules.lastStand!.grow : 1;
  return s.rules.soldierRadius * grow + RULES.inkWidth / 2 + s.rules.hitSlop;
}

/** How long a flick of this kind and power is. */
export function reachOf(R: RuleSet, kind: ActionKind, power: number) {
  const p = Math.pow(Math.max(0, Math.min(1, power)), 0.9);
  const r = kind === "shoot" ? R.shoot : R.move;
  return r.min + (r.max - r.min) * p;
}

/** The power that gives a flick this length (inverse of reachOf). */
export function powerFor(R: RuleSet, kind: ActionKind, length: number) {
  const r = kind === "shoot" ? R.shoot : R.move;
  const f = Math.max(0, Math.min(1, (length - r.min) / Math.max(1, r.max - r.min)));
  return Math.pow(f, 1 / 0.9);
}

// --- flicks -----------------------------------------------------------------

const onPage = (p: Pt) => p.x >= 0 && p.x <= RULES.pageW && p.y >= 0 && p.y <= RULES.pageH;

// Cut a path where it first leaves the page. Returns [path, leftPage].
export function clipToPage(pts: Pt[]): [Pt[], boolean] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (onPage(b)) { out.push(b); continue; }
    let lo = 0, hi = 1;
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2;
      if (onPage({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m })) lo = m; else hi = m;
    }
    out.push({ x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo });
    return [out, true];
  }
  return [out, false];
}

// Resolve a flick without touching state: what would the ink do?
export function preview(s: GameState, f: Flick): Outcome {
  const R = s.rules;
  const me = s.soldiers[f.soldierId];
  const shot = f.kind === "shoot";
  const tr = trace(s, me.owner, me, flickPath(me, f), shot);
  const branches = tr.branches;
  const kills = shot || R.moveKills;
  const hitIds = new Set<number>();
  const cutoff: number[] = branches.map(() => Infinity);
  const dropped = new Set<number>();
  const perBranch: number[][] = [];
  branches.forEach((br, k) => {
    // a split-off branch only happened if its parent got that far
    if (br.parent !== undefined && (dropped.has(br.parent) || br.parentD! > cutoff[br.parent])) { dropped.add(k); perBranch.push([]); return; }
    const hits: { id: number; at: number }[] = [];
    if (kills) {
      const box = boxOf(br.pts, R.soldierRadius * 3 + 10);
      for (const o of s.soldiers) {
        if (!o.alive || o.id === me.id || o.transit !== undefined || hitIds.has(o.id)) continue;
        if (o.owner === me.owner && !R.friendlyFire) continue;
        if (o.x < box.x0 || o.x > box.x1 || o.y < box.y0 || o.y > box.y1) continue;
        const { d, at } = distToPath(o, br.pts);
        // ignore the first sliver of the line: the pen sits on the shooter's own dot
        if (d <= hitReach(s, o) && (k > 0 || at > R.soldierRadius * 1.5)) hits.push({ id: o.id, at });
      }
    }
    hits.sort((a, b) => a.at - b.at);
    if (R.pierce > 0 && hits.length >= R.pierce) {
      // the line stops in the last body it can take
      hits.length = R.pierce;
      cutoff[k] = hits[hits.length - 1].at;
      br.pts = cutAt(br.pts, cutoff[k] + 0.01);
      br.end = "stop";
    }
    for (const h of hits) hitIds.add(h.id);
    perBranch.push(hits.map((h) => h.id));
  });
  const live = branches.map((b, k) => ({ b, k })).filter(({ k }) => !dropped.has(k));
  const events = tr.events.filter((e) => !dropped.has(e.branch) && e.d <= cutoff[e.branch] + 1e-6);
  const killed: number[] = [], wounded: number[] = [];
  for (const ids of perBranch) for (const id of ids) {
    const o = s.soldiers[id];
    if ((o.hp ?? 1) > 1) wounded.push(id); else killed.push(id);
  }
  const breaches = events.filter((e) => (e.on === "stop" || e.on === "mirror") && e.base !== undefined)
    .map((e) => ({ base: e.base!, edge: e.edge!, at: e.at }));
  const path = live[0].b.pts;
  const out: Outcome = {
    path, paths: live.map(({ b }) => b.pts), killed, wounded, lost: false, events, breaches, cut: [],
  };
  // convoys on the road: a line across it is an ambush
  if (R.transfer && R.transfer.ambush !== "none") {
    for (const t of s.transits) {
      if (t.state !== "road" || t.owner === me.owner) continue;
      const at: Pt[] = [];
      for (const pts of out.paths) for (let i = 1; i < pts.length; i++) {
        const h = segHit(pts[i - 1], pts[i], t.road[0], t.road[1]);
        if (h) at.push({ x: t.road[0].x + (t.road[1].x - t.road[0].x) * h.u, y: t.road[0].y + (t.road[1].y - t.road[0].y) * h.u });
      }
      if (!at.length) continue;
      const walking = t.ids.filter((id) => s.soldiers[id].alive);
      const ids = R.transfer.ambush === "all" ? walking : walking.slice(0, at.length);
      if (ids.length) out.cut.push({ transit: t.id, ids, at });
    }
  }
  if (f.kind === "move") {
    const main = branches[0];
    if (main.end === "edge" && R.offPageMoveKills) out.lost = true;
    else {
      let end = path[path.length - 1];
      if (main.end !== "spent" && path.length > 1) {
        // stopped by something: he stands just short of it, on the page
        const back = Math.min(pathLen(path) - 0.5, R.soldierRadius + 2);
        end = cutAt(path, Math.max(0, pathLen(path) - back)).at(-1)!;
      }
      out.movedTo = { x: Math.min(RULES.pageW - 1, Math.max(1, end.x)), y: Math.min(RULES.pageH - 1, Math.max(1, end.y)) };
    }
  }
  return out;
}

const markSeed = (s: GameState) => (s.seed + s.actions.length * 104729) >>> 0;

export function act(s: GameState, f: Flick): Outcome {
  if (!canAct(s, f.soldierId)) throw new Error("illegal flick");
  const o = preview(s, f);
  const R = s.rules;
  const me = s.soldiers[f.soldierId];
  const who = me.owner;
  const seed = markSeed(s);
  s.actions.push({ t: "flick", ...f });
  o.paths.forEach((pts, k) => s.marks.push({ t: "stroke", kind: f.kind, owner: who, pts, seed: seed + k * 31, turn: s.turn, ...(k && { branch: k }) }));
  for (const b of o.breaches) {
    const base = s.bases[b.base];
    (base.breached ??= []).push(b.edge);
    s.marks.push({ t: "notch", owner: who, x: b.at.x, y: b.at.y, base: b.base, edge: b.edge, seed: seed + 97 + b.edge, turn: s.turn });
  }
  for (const id of o.killed) {
    const v = s.soldiers[id];
    v.alive = false;
    v.hp = 0;
    s.marks.push({ t: "cross", kind: "kill", owner: who, x: v.x, y: v.y, seed: seed + id, turn: s.turn });
  }
  for (const id of o.wounded) {
    const v = s.soldiers[id];
    v.hp = (v.hp ?? 1) - 1;
    s.marks.push({ t: "cross", kind: "wound", owner: who, x: v.x, y: v.y, seed: seed + id, turn: s.turn });
  }
  for (const c of o.cut) {
    const t = s.transits[c.transit];
    c.ids.forEach((id, k) => {
      const v = s.soldiers[id];
      const at = c.at[Math.min(k, c.at.length - 1)];
      // the convoy's dots go down on the road where it was cut, a little apart
      const a = t.road[0], b = t.road[1], l = dist(a, b) || 1;
      const off = (k - (c.ids.length - 1) / 2) * R.soldierRadius * 2.6;
      v.x = at.x + ((b.x - a.x) / l) * off;
      v.y = at.y + ((b.y - a.y) / l) * off;
      v.alive = false;
      v.hp = 0;
      v.transit = undefined;
      s.marks.push({ t: "cross", kind: "kill", owner: who, x: v.x, y: v.y, seed: seed + id, turn: s.turn });
    });
    if (t.ids.every((id) => !s.soldiers[id].alive)) t.state = "cut";
  }
  if (f.kind === "move") {
    s.marks.push({ t: "cross", kind: "moved", owner: who, x: me.x, y: me.y, seed: seed + 1, turn: s.turn });
    if (o.lost) {
      me.alive = false;
      me.hp = 0;
      const end = o.path[o.path.length - 1];
      s.marks.push({ t: "cross", kind: "lost", owner: who, x: end.x, y: end.y, seed: seed + 2, turn: s.turn });
    } else if (o.movedTo) {
      me.x = o.movedTo.x;
      me.y = o.movedTo.y;
    }
  }
  const hit = o.killed.length + o.wounded.length + o.cut.reduce((n, c) => n + c.ids.length, 0) > 0;
  after(s, who, o, seed, hit, f.kind === "move" && me.alive ? me : undefined);
  return o;
}

// --- transfers ----------------------------------------------------------------

export function canTransfer(s: GameState, from: number, to: number, n: number): string | null {
  const T = s.rules.transfer;
  if (!T) return "no transfers in these rules";
  if (s.phase !== "play") return "not now";
  const a = s.bases[from], b = s.bases[to];
  if (!a || !b || a === b) return "pick two bases";
  if (a.owner !== s.current || b.owner !== s.current) return "both bases must be yours";
  if (a.fallen || b.fallen) return "that base has fallen";
  if (!Number.isInteger(n) || n < 1) return "send at least one";
  if (n > T.max) return `at most ${T.max} at a time`;
  if (garrison(s, a).length - n < 1) return "leave at least one behind";
  return null;
}

/** Most soldiers you could send from this base right now. */
export function transferMax(s: GameState, from: number) {
  const T = s.rules.transfer;
  const a = s.bases[from];
  if (!T || !a) return 0;
  return Math.max(0, Math.min(T.max, garrison(s, a).length - 1));
}

export function transfer(s: GameState, from: number, to: number, n: number): Outcome {
  const why = canTransfer(s, from, to, n);
  if (why) throw new Error(why);
  const a = s.bases[from], b = s.bases[to];
  const who = s.current;
  const seed = markSeed(s);
  s.actions.push({ t: "transfer", from, to, n });
  // the ones nearest the road go
  const go = garrison(s, a).sort((p, q) => dist(p, b) - dist(q, b)).slice(0, n);
  const l = dist(a, b) || 1;
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  const road: [Pt, Pt] = [
    { x: a.x + ux * (a.r + 6), y: a.y + uy * (a.r + 6) },
    { x: b.x - ux * (b.r + 6), y: b.y - uy * (b.r + 6) },
  ];
  const t: Transit = { id: s.transits.length, owner: who, from, to, ids: go.map((x) => x.id), due: 1, road, turn: s.turn, state: "road" };
  s.transits.push(t);
  for (const x of go) {
    s.marks.push({ t: "cross", kind: "moved", owner: who, x: x.x, y: x.y, seed: seed + x.id, turn: s.turn });
    x.transit = t.id;
  }
  s.marks.push({ t: "road", owner: who, a: road[0], b: road[1], n, transit: t.id, seed, turn: s.turn });
  const o: Outcome = { path: [...road], paths: [[...road]], killed: [], wounded: [], lost: false, events: [], breaches: [], cut: [] };
  after(s, who, o, seed, false);
  return o;
}

// Their convoys arrive after this player's action.
function arrive(s: GameState, actor: Player, seed: number): number[] {
  const out: number[] = [];
  for (const t of s.transits) {
    if (t.state !== "road" || t.owner === actor) continue;
    if (--t.due > 0) continue;
    t.state = "arrived";
    const b = s.bases[t.to];
    const walking = t.ids.filter((id) => s.soldiers[id].alive);
    const avoid = s.soldiers.filter((x) => x.transit === undefined).map((x) => ({ x: x.x, y: x.y }));
    const spots = scatterIn(b, walking.length, (seed ^ (t.id * 2654435761)) >>> 0, s.rules.soldierRadius, avoid);
    walking.forEach((id, k) => {
      const x = s.soldiers[id];
      const p = spots[k] ?? { x: b.x + (k - walking.length / 2) * 4, y: b.y };
      x.x = p.x;
      x.y = p.y;
      x.transit = undefined;
      out.push(id);
    });
    if (b.fallen && s.rules.capture && walking.length) refound(s, b, t.owner, seed);
  }
  return out;
}

function refound(s: GameState, b: Base, who: Player, seed: number) {
  b.owner = who;
  b.fallen = undefined;
  b.breached = [];
  s.marks.push({ t: "found", owner: who, base: b.id, seed: seed + 400 + b.id, turn: s.turn });
}

export function pass(s: GameState) {
  if (s.phase !== "play") throw new Error("not now");
  const seed = markSeed(s);
  s.actions.push({ t: "pass" });
  after(s, s.current, { path: [], paths: [], killed: [], wounded: [], lost: false, events: [], breaches: [], cut: [] }, seed, false);
}

// Everything that follows an action: convoys arrive, bases fall or are taken,
// last stands begin, someone may win, and the turn passes (or doesn't).
function after(s: GameState, who: Player, o: Outcome, seed: number, hit: boolean, mover?: Soldier) {
  const R = s.rules;
  o.arrived = arrive(s, who, seed);
  o.founded = [];
  if (mover && R.capture) {
    const b = s.bases.find((b) => b.fallen && insideBase(b, mover));
    if (b) { refound(s, b, who, seed); o.founded.push(b.id); }
  }
  o.fell = [];
  for (const b of s.bases) {
    if (b.fallen || garrison(s, b).length) continue;
    b.fallen = s.turn;
    o.fell.push(b.id);
    s.marks.push({ t: "raze", owner: who, base: b.id, seed: seed + 300 + b.id, turn: s.turn });
  }
  o.stood = [];
  if (R.lastStand) for (const p of [0, 1] as Player[]) {
    const left = alive(s, p);
    if (s.stand[p] || !left.length || left.length > R.lastStand.at) continue;
    s.stand[p] = s.turn;
    for (const x of left) x.hp = Math.max(x.hp ?? 1, R.lastStand.hits);
    s.marks.push({ t: "stand", owner: p, seed: seed + 500 + p, turn: s.turn, at: left.filter((x) => x.transit === undefined).map((x) => ({ x: x.x, y: x.y })) });
    o.stood.push(p);
  }
  const out = (p: Player) => R.win === "bases" ? standing(s, p).length === 0 : alive(s, p).length === 0;
  const foe = other(who);
  if (out(foe)) { s.phase = "over"; s.winner = who; o.again = false; return; }
  if (out(who)) { s.phase = "over"; s.winner = foe; o.again = false; return; }
  s.owed -= 1;
  // a hit earns another flick, up to the cap for the turn (once = 1, chain = chainCap or no limit)
  const earned = s.streak ?? (s.bonus ? 1 : 0);
  const cap = R.extraTurn === "once" ? 1 : R.extraTurn === "chain" ? R.chainCap || Infinity : 0;
  if (hit && earned < cap) { s.owed += 1; s.bonus = true; s.streak = earned + 1; }
  o.again = s.owed > 0 && ready(s, who).length > 0;
  if (!o.again) {
    s.current = foe;
    s.turn++;
    s.owed = allotment(s, foe);
    s.bonus = false;
    s.streak = 0;
  }
}

/** Can the current player do anything at all? If not, the flow should pass(). */
export function stuck(s: GameState) {
  if (s.phase !== "play") return false;
  if (ready(s, s.current).length) return false;
  return !standing(s, s.current).some((b) => transferMax(s, b.id) > 0);
}

// --- replay -------------------------------------------------------------------

export function apply(s: GameState, a: Action) {
  if (a.t === "base") return placeBase(s, a.x, a.y, a.shape);
  if (a.t === "flick") { const { t: _t, ...f } = a; void _t; return act(s, f); }
  if (a.t === "transfer") return transfer(s, a.from, a.to, a.n);
  return pass(s);
}

/** Rebuild a page from its rules, seed and actions. */
export function replay(rules: RuleSet | Partial<RuleSet>, seed: number, actions: Action[], page?: GameState["page"]): GameState {
  const s = newGame(rules, seed, page);
  for (const a of actions) apply(s, a);
  return s;
}

export const clone = (s: GameState): GameState => structuredClone(s);
