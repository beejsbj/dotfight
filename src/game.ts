// Pure game state. No DOM, no clock: randomness comes in through seeds and
// resolved flicks, so a game can be saved, replayed, or simulated by the bot.

import { RULES } from "./rules";

export type Player = 0 | 1;
export type ActionKind = "shoot" | "move";
export type Pt = { x: number; y: number };

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
}

export type Mark =
  | { t: "stroke"; kind: ActionKind; owner: Player; pts: Pt[]; seed: number; turn: number }
  // kill: crossed in the killer's ink. moved: crossed in your own ink.
  | { t: "cross"; kind: "kill" | "moved" | "lost"; owner: Player; x: number; y: number; seed: number; turn: number };

export interface Flick {
  soldierId: number;
  kind: ActionKind;
  angle: number; // radians, world space
  length: number; // world units, before clipping
  bend: number; // signed, fraction of length the line bows sideways
}

export interface Outcome {
  path: Pt[];
  killed: number[];
  movedTo?: Pt;
  lost: boolean;
}

export interface GameState {
  v: 1;
  seed: number;
  phase: "setup" | "play" | "over";
  current: Player;
  turn: number;
  bases: Base[];
  soldiers: Soldier[];
  marks: Mark[];
  flicks: Flick[]; // history, enough to replay the page
  winner?: Player;
}

// --- rng --------------------------------------------------------------------

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const other = (p: Player): Player => (p === 0 ? 1 : 0);

// --- setup ------------------------------------------------------------------

export function newGame(seed = (Math.random() * 2 ** 32) >>> 0): GameState {
  return { v: 1, seed, phase: "setup", current: 0, turn: 0, bases: [], soldiers: [], marks: [], flicks: [] };
}

export function basesLeft(s: GameState, p: Player) {
  return RULES.basesPerPlayer - s.bases.filter((b) => b.owner === p).length;
}

export function canPlaceBase(s: GameState, x: number, y: number): string | null {
  if (s.phase !== "setup") return "not setup";
  const r = RULES.baseRadius;
  if (x - r < RULES.margin + 8 || x + r > RULES.pageW - 16 || y - r < 16 || y + r > RULES.pageH - 16)
    return "too close to the edge";
  for (const b of s.bases) {
    const gap = b.owner === s.current ? RULES.minBaseGap : RULES.minEnemyBaseGap;
    if (Math.hypot(b.x - x, b.y - y) < b.r + r + gap)
      return b.owner === s.current ? "overlaps your base" : "too close to the enemy";
  }
  return null;
}

export function placeBase(s: GameState, x: number, y: number): Base {
  const why = canPlaceBase(s, x, y);
  if (why) throw new Error(why);
  const id = s.bases.length;
  const base: Base = { id, owner: s.current, x, y, r: RULES.baseRadius, seed: (s.seed ^ (id * 7919)) >>> 0 };
  s.bases.push(base);
  for (const p of scatterSoldiers(base)) {
    s.soldiers.push({ id: s.soldiers.length, owner: base.owner, x: p.x, y: p.y, alive: true });
  }
  if (basesLeft(s, 0) === 0 && basesLeft(s, 1) === 0) {
    s.phase = "play";
    s.current = 0;
    s.turn = 1;
  } else {
    s.current = basesLeft(s, other(s.current)) > 0 ? other(s.current) : s.current;
  }
  return base;
}

// Dots jotted into a circle by hand: spread out, never touching.
export function scatterSoldiers(b: Base): Pt[] {
  const rand = rng(b.seed);
  const pts: Pt[] = [];
  const inner = b.r - RULES.soldierRadius * 2.2;
  const minD = RULES.soldierRadius * 3.2;
  let tries = 0;
  while (pts.length < RULES.soldiersPerBase && tries++ < 5000) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * inner;
    const p = { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minD)) pts.push(p);
  }
  return pts;
}

// --- geometry ---------------------------------------------------------------

// A flicked line: a shallow arc from the soldier, sampled as a polyline.
export function flickPath(from: Pt, f: Pick<Flick, "angle" | "length" | "bend">, steps = 32): Pt[] {
  const dx = Math.cos(f.angle), dy = Math.sin(f.angle);
  const end = { x: from.x + dx * f.length, y: from.y + dy * f.length };
  const off = f.bend * f.length * 2; // quadratic control offset -> peak bow ~ bend*len
  const c = { x: (from.x + end.x) / 2 - dy * off, y: (from.y + end.y) / 2 + dx * off };
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push({ x: u * u * from.x + 2 * u * t * c.x + t * t * end.x, y: u * u * from.y + 2 * u * t * c.y + t * t * end.y });
  }
  return pts;
}

const onPage = (p: Pt) => p.x >= 0 && p.x <= RULES.pageW && p.y >= 0 && p.y <= RULES.pageH;

// Cut a path where it first leaves the page. Returns [path, leftPage].
export function clipToPage(pts: Pt[]): [Pt[], boolean] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (onPage(b)) { out.push(b); continue; }
    // binary-search the edge crossing
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

// Distance from p to a polyline, plus how far along (0..1 by segment index) the closest point is.
export function distToPath(p: Pt, pts: Pt[]): { d: number; along: number } {
  let best = Infinity, along = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    if (d < best) { best = d; along = (i - 1 + t) / (pts.length - 1); }
  }
  return { d: best, along };
}

// --- play -------------------------------------------------------------------

export function alive(s: GameState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p);
}

// Resolve a flick without touching state: what would the ink do?
export function preview(s: GameState, f: Flick): Outcome {
  const me = s.soldiers[f.soldierId];
  const [path, left] = clipToPage(flickPath(me, f));
  const reach = RULES.soldierRadius + RULES.inkWidth / 2 + RULES.hitSlop;
  const kills = f.kind === "shoot" || RULES.moveKills;
  let hits: { id: number; along: number }[] = [];
  if (kills) {
    for (const o of s.soldiers) {
      if (!o.alive || o.id === me.id) continue;
      if (o.owner === me.owner && !RULES.friendlyFire) continue;
      const { d, along } = distToPath(o, path);
      // ignore the first sliver of the line: the pen sits on the shooter's own dot
      if (d <= reach && along * pathLen(path) > RULES.soldierRadius * 1.5) hits.push({ id: o.id, along });
    }
    hits.sort((a, b) => a.along - b.along);
    if (!RULES.shotPierces && hits.length) hits = [hits[0]];
  }
  const out: Outcome = { path, killed: hits.map((h) => h.id), lost: false };
  if (f.kind === "move") {
    if (left && RULES.offPageMoveKills) out.lost = true;
    else out.movedTo = path[path.length - 1];
  }
  return out;
}

// The point a fraction `t` of the way along a path (by vertex), clamped to its ends.
export function pointAlong(pts: Pt[], t: number): Pt {
  const i = Math.floor(Math.min(1, Math.max(0, t)) * (pts.length - 1));
  return pts[Number.isFinite(i) ? i : 0];
}

export function pathLen(pts: Pt[]) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

export function canAct(s: GameState, soldierId: number) {
  const x = s.soldiers[soldierId];
  return s.phase === "play" && !!x && x.alive && x.owner === s.current;
}

export function act(s: GameState, f: Flick): Outcome {
  if (!canAct(s, f.soldierId)) throw new Error("illegal flick");
  const o = preview(s, f);
  const me = s.soldiers[f.soldierId];
  const seed = (s.seed + s.turn * 104729) >>> 0;
  s.flicks.push(f);
  s.marks.push({ t: "stroke", kind: f.kind, owner: me.owner, pts: o.path, seed, turn: s.turn });
  for (const id of o.killed) {
    const v = s.soldiers[id];
    v.alive = false;
    s.marks.push({ t: "cross", kind: "kill", owner: me.owner, x: v.x, y: v.y, seed: seed + id, turn: s.turn });
  }
  if (f.kind === "move") {
    s.marks.push({ t: "cross", kind: "moved", owner: me.owner, x: me.x, y: me.y, seed: seed + 1, turn: s.turn });
    if (o.lost) {
      me.alive = false;
      const end = o.path[o.path.length - 1];
      s.marks.push({ t: "cross", kind: "lost", owner: me.owner, x: end.x, y: end.y, seed: seed + 2, turn: s.turn });
    } else if (o.movedTo) {
      me.x = o.movedTo.x;
      me.y = o.movedTo.y;
    }
  }
  const foe = other(me.owner);
  if (alive(s, foe).length === 0) { s.phase = "over"; s.winner = me.owner; }
  else if (alive(s, me.owner).length === 0) { s.phase = "over"; s.winner = foe; }
  else { s.current = foe; s.turn++; }
  return o;
}

export const clone = (s: GameState): GameState => structuredClone(s);
