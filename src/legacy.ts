// The June prototype's rules (shoot or move, one flick a turn), kept so old
// saves and drawer pages still load, play on and replay exactly as they were
// written. New games play the core rules (src/game.ts). Pure: no DOM.

import { distToPath, flickPath, pathLen, rng, type Pt } from "./geom";
import type { Base, Mark, Player } from "./game";
import { RULES } from "./rules";

export type LegacyKind = "shoot" | "move";

export interface LegacySoldier {
  id: number;
  owner: Player;
  x: number;
  y: number;
  alive: boolean;
}

export interface LegacyFlick {
  soldierId: number;
  kind: LegacyKind;
  angle: number; // radians, world space
  length: number; // world units, before clipping
  bend: number; // signed, fraction of length the line bows sideways
}

export interface LegacyOutcome {
  path: Pt[];
  killed: number[];
  movedTo?: Pt;
  lost: boolean;
}

/** A prototype game, as `pft:save` stored it (v: 1). */
export interface LegacyState {
  v: 1;
  seed: number;
  phase: "setup" | "play" | "over";
  current: Player;
  turn: number;
  bases: Base[];
  soldiers: LegacySoldier[];
  marks: Mark[];
  flicks: LegacyFlick[]; // history, enough to replay the page
  winner?: Player;
  page?: { no: number; date: string; theme?: string }; // written in the header, and the paper it was on; optional so older saves still load
}

const other = (p: Player): Player => (p === 0 ? 1 : 0);

// --- setup ------------------------------------------------------------------

export function newGame(seed = (Math.random() * 2 ** 32) >>> 0, page?: LegacyState["page"]): LegacyState {
  return { v: 1, seed, phase: "setup", current: 0, turn: 0, bases: [], soldiers: [], marks: [], flicks: [], ...(page && { page }) };
}

export function basesLeft(s: LegacyState, p: Player) {
  return RULES.basesPerPlayer - s.bases.filter((b) => b.owner === p).length;
}

export function canPlaceBase(s: LegacyState, x: number, y: number): string | null {
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

export function placeBase(s: LegacyState, x: number, y: number): Base {
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


// --- play -------------------------------------------------------------------

export function alive(s: LegacyState, p: Player) {
  return s.soldiers.filter((x) => x.alive && x.owner === p);
}

// Resolve a flick without touching state: what would the ink do?
export function preview(s: LegacyState, f: LegacyFlick): LegacyOutcome {
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
  const out: LegacyOutcome = { path, killed: hits.map((h) => h.id), lost: false };
  if (f.kind === "move") {
    if (left && RULES.offPageMoveKills) out.lost = true;
    else out.movedTo = path[path.length - 1];
  }
  return out;
}



export function canAct(s: LegacyState, soldierId: number) {
  const x = s.soldiers[soldierId];
  return s.phase === "play" && !!x && x.alive && x.owner === s.current;
}

export function act(s: LegacyState, f: LegacyFlick): LegacyOutcome {
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


// --- the prototype's pen and Dawood-bot ------------------------------------------

/** How long a prototype flick of this kind and power is. */
export function legacyReach(kind: LegacyKind, power: number) {
  const p = Math.pow(Math.max(0, Math.min(1, power)), 0.9);
  return kind === "shoot"
    ? RULES.shootMinLen + (RULES.shootMaxLen - RULES.shootMinLen) * p
    : RULES.moveMinLen + (RULES.moveMaxLen - RULES.moveMinLen) * p;
}

/** The power a prototype flick of this length took (for the bot's pull-back animation). */
export function legacyPower(f: Pick<LegacyFlick, "kind" | "length">) {
  const p = f.kind === "shoot"
    ? (f.length - RULES.shootMinLen) / (RULES.shootMaxLen - RULES.shootMinLen)
    : (f.length - RULES.moveMinLen) / (RULES.moveMaxLen - RULES.moveMinLen);
  return Math.max(0.05, Math.min(1, p));
}

const HAND = [2.2, 1.2, 0.6]; // multiplier on the human release error
const TRIES = [25, 70, 160];
const legacySigma = (power: number) => 0.012 + 0.05 * power * power;

/** The June Dawood-bot, for games carried on from an old save. */
export function legacyBotFlick(s: LegacyState, level: 0 | 1 | 2, seed = Date.now()): LegacyFlick {
  const rand = rng(seed);
  const mine = alive(s, s.current);
  const foes = alive(s, s.current === 0 ? 1 : 0);
  let best: LegacyFlick | null = null, bestScore = -Infinity;
  for (let i = 0; i < TRIES[level]; i++) {
    const me = mine[Math.floor(rand() * mine.length)];
    const foe = foes[Math.floor(rand() * foes.length)];
    const shoot = rand() < 0.8;
    const power = shoot ? 0.2 + rand() * 0.8 : 0.3 + rand() * 0.5;
    const toward = Math.atan2(foe.y - me.y, foe.x - me.x);
    const f: LegacyFlick = { soldierId: me.id, kind: shoot ? "shoot" : "move", angle: toward + (rand() - 0.5) * 0.25, length: legacyReach(shoot ? "shoot" : "move", power), bend: 0 };
    const o = preview(s, f);
    let score = o.killed.length * 10 - (o.lost ? 50 : 0);
    if (o.movedTo) score += 2 - Math.hypot(o.movedTo.x - foe.x, o.movedTo.y - foe.y) / 400;
    score += rand() * 0.5;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  const f = best!;
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());
  return {
    ...f,
    angle: f.angle + g * legacySigma(0.7) * HAND[level],
    length: f.length * (1 + (rand() - 0.5) * 0.12 * HAND[level]),
    bend: (rand() * 2 - 1) * 0.03,
  };
}
