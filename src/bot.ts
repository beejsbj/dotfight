// Dawood-bot, for the core rules. Ported from the rules lab (rules/lab-2) and
// taught the core rules: it imagines a spread of snipes and lunges, previews
// each with the real engine (walls, power loss, lunge shake, where a lunger
// lands), re-tries the promising ones with a shaky hand to see how often
// they'd come off, and weighs where everyone ends up. It sends convoys when
// the road is worth the risk, turns down an earned lunge that looks bad, and
// arranges its soldiers before the first flick without emptying a base.
// In the long war it also picks each base's shape, and aims off its target
// (round a camp's well) and at cushions (a bank shot), since a straight aim
// rarely finds a line the page bends.
// Pure and seeded: the same state and seed always give the same action.

import { sigma } from "./flick";
import {
  canArrange, canSend, capacity, columnAt, corners, dist, flickers, garrison, hand, hitReach, inside, isRing, maxReach, other, powerFor, preview, reachOf, wildOfLength, sendMax, whoGoes, columnSpots, roadBetween,
  type Action, type Base, type Flick, type GameState, type Kind, type Outcome, type Player, type Pt,
} from "./game";
import { gauss, polyHits, rng } from "./geom";
import { FEEL, RULES, type Shape } from "./rules";

export interface Skill {
  /** Candidate flicks imagined. */
  tries: number;
  /** How many of the best get re-tried with a shaky hand. */
  keep: number;
  /** Shaky-hand samples per kept candidate. */
  samples: number;
  /** Multiplier on the pen's own release error (1 = a human's). */
  hand: number;
  /** Extra aiming error by eye, radians (1 sd). */
  aim: number;
  /** Extra error judging power, as a fraction of length (1 sd). */
  judge: number;
}

// A person playing on a phone: the pen's release error, plus judging the
// angle and the power by eye. This is what the rules lab plays with.
export const HUMAN: Skill = { tries: 64, keep: 8, samples: 6, hand: 1, aim: 0.02, judge: 0.05 };

export type Level = 0 | 1 | 2; // sloppy, steady, sharp
export const LEVELS = ["sloppy", "steady", "sharp"] as const;
export const SKILLS: Record<Level, Skill> = {
  0: { tries: 28, keep: 4, samples: 4, hand: 1.7, aim: 0.035, judge: 0.08 },
  1: HUMAN,
  2: { tries: 120, keep: 10, samples: 8, hand: 0.75, aim: 0.012, judge: 0.035 },
};

interface Intent { kind: Kind; soldier: number; angle: number; power: number }

/** Turn an intended flick into what a shaky hand actually does. */
export function shake(s: GameState, it: Intent, sk: Skill, rand: () => number): Flick {
  const h = hand(s, it.soldier, it.kind);
  const sa = Math.hypot(Math.hypot(sigma(h.wild(it.power)) * sk.hand, sk.aim) * h.mult, h.tremor);
  const sl = Math.hypot(FEEL.lengthJitter * sk.hand, sk.judge) * h.mult;
  return {
    soldier: it.soldier,
    kind: it.kind,
    angle: it.angle + gauss(rand) * sa,
    length: reachOf(s.rules, it.power) * Math.max(0.2, 1 + gauss(rand) * sl),
    bend: (rand() * 2 - 1) * FEEL.bendMax * (0.3 + 0.7 * h.wild(it.power)),
    wob: (rand() * 2 ** 32) >>> 0,
  };
}

// --- how good is a position? -------------------------------------------------

function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

interface Dot extends Pt { id: number; w: number; walk?: boolean }

interface Ctx {
  s: GameState;
  me: Player;
  sk: Skill;
  reach: number;
  phit?: Map<number, Float64Array>;
}

/** Chance a flick aimed at something `d` away passes within `reach` of it. */
function pHit(c: Ctx, d: number, steady = 1) {
  const k = Math.min(400, Math.round(d / 8));
  const table = (c.phit ??= new Map()).get(steady) ?? new Float64Array(401).fill(-1);
  c.phit.set(steady, table);
  if (table[k] < 0) {
    const dd = Math.max(1, k * 8);
    const p = wildOfLength(dd + 60);
    const sd = Math.hypot(sigma(p) * c.sk.hand, c.sk.aim) * steady * dd;
    table[k] = erf(c.reach / (Math.SQRT2 * sd));
  }
  return table[k];
}

/** Indices of the k smallest values. */
function smallest(vals: Float64Array, n: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (out.length < k) { out.push(i); out.sort((a, b) => vals[a] - vals[b]); continue; }
    if (v >= vals[out[k - 1]]) continue;
    out[k - 1] = i;
    for (let j = k - 1; j > 0 && vals[out[j]] < vals[out[j - 1]]; j--) [out[j], out[j - 1]] = [out[j - 1], out[j]];
  }
  return out;
}

/** Expected crossings of the best shot `shooters` have at `targets`. Rough, fast. */
function bestShot(c: Ctx, shooters: Pt[], targets: Dot[], steady = 1): number {
  const ns = shooters.length, nt = targets.length;
  if (!ns || !nt) return 0;
  let cx = 0, cy = 0;
  for (const t of targets) { cx += t.x; cy += t.y; }
  cx /= nt; cy /= nt;
  const sd = new Float64Array(ns);
  for (let i = 0; i < ns; i++) sd[i] = Math.hypot(shooters[i].x - cx, shooters[i].y - cy);
  const max = c.s.rules.reach.max;
  const r = c.reach * 1.1;
  const td = new Float64Array(nt);
  let best = 0;
  for (const si of smallest(sd, ns, 6)) {
    const a = shooters[si];
    for (let j = 0; j < nt; j++) td[j] = Math.hypot(targets[j].x - a.x, targets[j].y - a.y);
    for (const ti of smallest(td, nt, 7)) {
      const d = td[ti];
      if (d > max || d < 1) continue;
      const t = targets[ti];
      const ux = (t.x - a.x) / d, uy = (t.y - a.y) / d;
      let n = 0;
      for (let j = 0; j < nt; j++) {
        const u = targets[j];
        const px = u.x - a.x, py = u.y - a.y;
        const along = px * ux + py * uy;
        if (along < 14 || along > max) continue;
        if (Math.abs(px * uy - py * ux) <= r) n += u.w;
      }
      const ev = pHit(c, d, steady) * n;
      if (ev > best) best = ev;
    }
  }
  return best;
}

/**
 * How much a soldier standing here is worth as a target. In the open a lunger
 * can take him and live, and nothing slows the line. Inside his own base a
 * lunger who lands among them is shot, and the wall takes its toll: with
 * garrisoned walls, the fuller his base (`men` of its own standing in it),
 * the more a line through it falls short or shakes, so the less he's worth
 * aiming at. A thinned base is worth going after; an empty ring is barely a
 * wall. On flat walls every wall is the same (0.9).
 */
function worth(s: GameState, x: Pt & { owner: Player }, men?: (b: Base) => number): number {
  for (const b of s.bases) {
    if (b.owner !== x.owner || !inside(b, x)) continue;
    const G = s.rules.garrison;
    if (!G) return 0.9;
    const n = men ? men(b) : garrison(s, b).length;
    const f = Math.pow(Math.min(1, n / Math.max(1, capacity(s, b))), G.curve);
    // the snipe's loss at this wall, against the flat 0.1 that made a man inside worth 0.9
    const loss = G.snipeLoss[0] + (G.snipeLoss[1] - G.snipeLoss[0]) * f;
    const shake = G.lungeShake[0] + (G.lungeShake[1] - G.lungeShake[0]) * f;
    return Math.max(0.3, Math.min(1.25, 1.3 - 0.3 - 1.0 * loss - 0.5 * shake));
  }
  return 1.3;
}

/** Soldiers of `p` inside each of their bases, among these dots. */
function manning(s: GameState, p: Player, ds: Pt[]) {
  const n = new Map<number, number>();
  for (const b of s.bases) if (b.owner === p) n.set(b.id, ds.filter((d) => inside(b, d)).length);
  return (b: Base) => n.get(b.id) ?? 0;
}

function dots(s: GameState, p: Player, drop: Set<number>, moved?: { id: number; to: Pt }): Dot[] {
  const out: Dot[] = [];
  for (const x of s.soldiers) {
    if (!x.alive || x.owner !== p || drop.has(x.id)) continue;
    const at = moved && moved.id === x.id ? { ...x, ...moved.to } : x;
    const walk = x.convoy !== undefined;
    out.push({ x: at.x, y: at.y, id: x.id, w: 1.3, ...(walk && { walk }) });
  }
  // a wall is as tough as whoever is left standing in it
  const men = manning(s, p, out.filter((d) => !d.walk));
  for (const d of out) if (!d.walk) d.w = worth(s, { ...d, owner: p }, men);
  return out;
}

const steadyOf = (s: GameState, p: Player) => (s.stand[p] ? s.rules.lastStandSteady : 1);

/** My outlook minus theirs. `again`: I keep the pen. `only`: my next flick must come from here (an earned lunge). */
function outlook(c: Ctx, mine: Dot[], theirs: Dot[], again: boolean, only?: { at: Pt; steady: number }): number {
  const s = c.s;
  const myStd = steadyOf(s, c.me), foeStd = steadyOf(s, other(c.me));
  const mineBest = only ? bestShot(c, [only.at], theirs, myStd * only.steady) : bestShot(c, mine.filter((d) => !d.walk), theirs, myStd);
  const theirBest = bestShot(c, theirs.filter((d) => !d.walk), mine, foeStd);
  // a last stand shoots twice
  const theirShots = s.stand[other(c.me)] ? 1.6 : 1;
  return again ? mineBest * 0.9 - theirBest * 0.5 * theirShots : mineBest * 0.45 - theirBest * 0.85 * theirShots;
}

/** Points for what a flick did right now, and how many it crossed out. */
function gain(o: Outcome): { v: number; hits: number } {
  const hits = o.killed.length;
  return { v: hits - (o.lost ? 1.1 : 0), hits };
}

/** Would this flick keep the pen? (an earned flick, or a last stand's second) */
function keeps(s: GameState, kind: Kind, o: Outcome) {
  if (s.left > 1) return true;
  return kind === "snipe" ? o.killed.length >= s.rules.snipeEarnAt : o.killed.length > 0 && !o.lost;
}
const earns = (s: GameState, kind: Kind, o: Outcome) => (kind === "snipe" ? o.killed.length >= s.rules.snipeEarnAt : o.killed.length > 0 && !o.lost);

// --- choosing ---------------------------------------------------------------

function intents(c: Ctx, rand: () => number): Intent[] {
  const s = c.s, R = s.rules;
  const mine = flickers(s);
  const foes = s.soldiers.filter((x) => x.alive && x.owner === other(c.me));
  const out: Intent[] = [];
  if (!mine.length) return out;
  const must = !!s.chain;
  // soldiers nearer the enemy get more looks: that's where the good lines are
  const cx = foes.reduce((a, t) => a + t.x, 0) / Math.max(1, foes.length);
  const cy = foes.reduce((a, t) => a + t.y, 0) / Math.max(1, foes.length);
  const ranked = [...mine].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const pickMine = () => ranked[Math.floor(Math.pow(rand(), 1.6) * ranked.length)];
  // targets by what they're worth: men in the open and in thinned bases get more looks than a full base's
  const ws = dots(s, other(c.me), new Set());
  const wt = new Map(ws.map((d) => [d.id, d.w * d.w]));
  const total = foes.reduce((a, f) => a + (wt.get(f.id) ?? 1), 0);
  const pickFoe = (r: () => number) => {
    let u = r() * total;
    for (const f of foes) { u -= wt.get(f.id) ?? 1; if (u <= 0) return f; }
    return foes[foes.length - 1];
  };
  for (let i = 0; i < c.sk.tries; i++) {
    const me = pickMine();
    const kind: Kind = must || rand() < 0.35 ? "lunge" : "snipe";
    if (foes.length && rand() > 0.06) {
      const foe = pickFoe(rand);
      const d = dist(me, foe);
      const angle = Math.atan2(foe.y - me.y, foe.x - me.x) + gauss(rand) * 0.025;
      // just past the target (steadier), or well past it (catch whatever's behind; a lunger through and out the far side)
      const want = rand() < 0.55 ? d + 40 + rand() * 60 : d + 150 + rand() * Math.max(0, maxReach(R) - d);
      out.push({ kind, soldier: me.id, angle, power: powerFor(R, want) });
    } else {
      out.push({ kind, soldier: me.id, angle: rand() * Math.PI * 2, power: rand() });
    }
  }
  if (s.rules.long && foes.length) out.push(...bentIntents(c, rand, pickMine, pickFoe, must));
  return out;
}

const FAN = [-0.4, -0.25, -0.12, 0.12, 0.25, 0.4];

/**
 * The long war's extra looks: aimed off the target, for a line a camp's well
 * will bend back onto it, and at a target's mirror image in a cushion's wall,
 * for a bank shot. The engine's preview says which of them come off.
 */
function bentIntents(c: Ctx, rand: () => number, pickMine: () => GameState["soldiers"][number], pickFoe: (r: () => number) => Pt, must: boolean): Intent[] {
  const s = c.s, R = s.rules;
  const cushions = s.bases.filter((b) => b.shape === "cushion");
  const out: Intent[] = [];
  for (let i = 0; i < Math.round(c.sk.tries * 0.6); i++) {
    const me = pickMine();
    const kind: Kind = must || rand() < 0.35 ? "lunge" : "snipe";
    let foe = pickFoe(rand);
    let off = FAN[Math.floor(rand() * FAN.length)];
    if (cushions.length && rand() < 0.4) {
      // the target seen in a cushion's wall
      const b = cushions[Math.floor(rand() * cushions.length)], vs = corners(b)!, e = Math.floor(rand() * vs.length);
      const p = vs[e], q = vs[(e + 1) % vs.length];
      const wx = q.x - p.x, wy = q.y - p.y, l2 = wx * wx + wy * wy;
      const t = ((foe.x - p.x) * wx + (foe.y - p.y) * wy) / l2;
      foe = { x: 2 * (p.x + wx * t) - foe.x, y: 2 * (p.y + wy * t) - foe.y };
      off = gauss(rand) * 0.02;
    }
    const d = dist(me, foe);
    const want = rand() < 0.55 ? d + 40 + rand() * 60 : d + 150 + rand() * Math.max(0, maxReach(R) - d);
    out.push({ kind, soldier: me.id, angle: Math.atan2(foe.y - me.y, foe.x - me.x) + off, power: powerFor(R, want) });
  }
  return out;
}

type Send = Extract<Action, { t: "send" }>;

function sends(c: Ctx): Send[] {
  const s = c.s;
  const out: Send[] = [];
  const mine = s.bases.filter((b) => b.owner === c.me);
  const size = new Map(mine.map((b) => [b.id, garrison(s, b).length]));
  for (const a of mine) {
    const max = sendMax(s, a.id);
    if (!max) continue;
    const others = mine.filter((b) => b !== a);
    if (!others.length) continue;
    const to = new Set<typeof a>();
    // worth a look: the nearest base (short road), the thinnest, and every empty ring
    to.add(others.reduce((p, q) => (dist(a, p) <= dist(a, q) ? p : q)));
    to.add(others.reduce((p, q) => (size.get(p.id)! <= size.get(q.id)! ? p : q)));
    for (const b of others) if (isRing(s, b)) to.add(b);
    for (const b of to) for (const n of new Set([1, Math.ceil(max / 2), max])) {
      if (!canSend(s, a.id, b.id, n)) out.push({ t: "send", from: a.id, to: b.id, n });
    }
  }
  return out;
}

// A send's worth: where everyone stands while the convoy is on the road for
// the enemy's turn, and once it has arrived, against the same measure before.
function scoreSend(c: Ctx, a: Send, base: { mine: Dot[]; theirs: Dot[] }, before: number): number {
  const s = c.s;
  const from = s.bases[a.from], to = s.bases[a.to];
  const go = whoGoes(s, a.from, a.to, a.n);
  const ids = new Set(go.map((x) => x.id));
  const mine = base.mine.filter((d) => !ids.has(d.id));
  const road = roadBetween(from, to);
  const long = s.rules.long;
  const spots = long ? columnAt(road, long.sendPace, go.length) : columnSpots(road, go.length);
  const walkers: Dot[] = go.map((x, k) => ({ ...spots[k], id: x.id, w: 1.3, walk: true }));
  const there: Dot[] = go.map((x, k) => {
    const ang = k * 2.4;
    const r = to.r * (to.shape ? 0.35 : 0.5);
    return { x: to.x + Math.cos(ang) * r, y: to.y + Math.sin(ang) * r, id: x.id, w: 0.9 };
  });
  // with garrisoned walls, both bases' walls change: the one left thinner, the one manned up
  const reweigh = (ds: Dot[]) => { const men = manning(s, c.me, ds.filter((d) => !d.walk)); for (const d of ds) if (!d.walk) d.w = worth(s, { ...d, owner: c.me }, men); return ds; };
  const onRoad = outlook(c, reweigh([...mine.map((d) => ({ ...d })), ...walkers]), base.theirs, false);
  const later = outlook(c, reweigh([...mine.map((d) => ({ ...d })), ...there]), base.theirs, false);
  // a ring manned again is a wall between them and a lunge; a base left empty is not
  const refill = isRing(s, to) ? 0.4 * a.n : 0;
  const left = garrison(s, from).filter((x) => !ids.has(x.id)).length;
  const emptied = left === 0 ? -0.6 : 0;
  // a long road is out for more of the enemy's turns
  const out = long ? Math.min(0.8, 0.3 * Math.ceil(dist(road[0], road[1]) / long.sendPace)) : 0.5;
  return out * onRoad + (1 - out) * later + refill + emptied - before;
}

/** What Dawood-bot does now. Always a legal action. */
export function botAction(s: GameState, level: Level | Skill = 1, seed = Date.now()): Action {
  const sk = typeof level === "number" ? SKILLS[level] : level;
  const rand = rng(seed);
  const me = s.current;
  const c: Ctx = { s, me, sk, reach: hitReach() };
  if (s.phase === "position") return botArrange(s, seed)[0] ?? { t: "ready" };
  const base = { mine: dots(s, me, new Set()), theirs: dots(s, other(me), new Set()) };
  if (!s.sent && !s.chain) {
    // a free send comes before the flick: take it if it's worth anything
    const before = outlook(c, base.mine, base.theirs, false);
    let pick: Send | null = null, pv = 0.2;
    for (const t of sends(c)) {
      const v = scoreSend(c, t, base, before);
      if (v > pv) { pv = v; pick = t; }
    }
    if (pick) return pick;
  }
  const cands = intents(c, rand);
  if (!cands.length) return { t: "stop" };
  // 1. noiseless: what would each do if the hand were perfect?
  const first = cands.map((it) => {
    const f: Flick = { soldier: it.soldier, kind: it.kind, angle: it.angle, length: reachOf(s.rules, it.power), bend: 0, wob: 0 };
    const o = preview(s, f);
    const g = gain(o);
    return { it, o, g: g.v + (keeps(s, it.kind, o) ? 0.4 : 0) };
  });
  first.sort((a, b) => b.g - a.g);
  // keep the best, plus a couple of lunges that live, so repositioning always gets a look
  const kept = first.slice(0, c.sk.keep);
  for (const x of first.filter((x) => x.it.kind === "lunge" && !x.o.lost).slice(0, 2)) if (!kept.includes(x)) kept.push(x);
  let best: { it: Intent; v: number } | null = null;
  const now0 = outlook(c, base.mine, base.theirs, false);
  for (const k of kept) {
    // 2. with a shaky hand, how often does it come off (and keep the pen)?
    let tot = 0, keep = 0, earned = 0;
    for (let j = 0; j < c.sk.samples; j++) {
      const o = preview(s, shake(s, k.it, sk, rand));
      tot += gain(o).v;
      if (keeps(s, k.it.kind, o)) keep++;
      if (earns(s, k.it.kind, o)) earned++;
    }
    const pKeep = keep / c.sk.samples, pEarn = earned / c.sk.samples;
    let v = tot / c.sk.samples;
    // 3. where does that leave everyone? (judged on the clean outcome)
    const o = k.o;
    const moved = o.movedTo ? { id: k.it.soldier, to: o.movedTo } : undefined;
    const mine = dots(s, me, o.lost ? new Set([k.it.soldier]) : new Set(), moved);
    const theirs = dots(s, other(me), new Set(o.killed));
    const again = pKeep > 0.5;
    // an earned lunge comes from the lunger, where he ends up, with a shakier hand
    const only = again && k.it.kind === "lunge" && o.movedTo && s.left <= 1
      ? { at: o.movedTo, steady: Math.hypot(1, (s.rules.lungeLinkTremor * ((s.chain?.link ?? 0) + 1)) / sigma(0.5)) } : undefined;
    v += outlook(c, mine, theirs, again, only) - now0;
    v += pEarn * 0.5;
    if (!best || v > best.v) best = { it: k.it, v };
  }
  // an earned lunge can be turned down: stopping is worth nothing either way
  if (s.chain && (!best || best.v < 0)) return { t: "stop" };
  const f = shake(s, best!.it, sk, rand);
  return { t: "flick", ...f };
}

// --- positioning ----------------------------------------------------------------

/**
 * How many of each base's men stand inside its wall when the first flick
 * comes, as shares of the base: at least `minIn`, at most `maxIn`. Within
 * that, where each man stands is the bot's own judgement.
 * - HALF (Dawood-bot's own): never fewer than half inside, the rest free.
 * - ALL: everyone stays inside.
 * - SPREAD: at most a quarter inside, the rest on the paper just outside.
 */
export interface Stance { minIn: number; maxIn: number }
export const STANCES = { half: { minIn: 0.5, maxIn: 1 }, all: { minIn: 1, maxIn: 1 }, spread: { minIn: 0, maxIn: 0.25 } } as const satisfies Record<string, Stance>;

/**
 * How Dawood-bot arranges his soldiers before the first flick: one at a
 * time, each to whichever of a few spots near his base leaves the enemy the
 * worst best line, keeping clear of his mates (a line through two earns a
 * snipe another flick). A man inside is worth less to the enemy the fuller
 * his base's wall (garrisoned walls), and a lunger who lands among them is
 * shot; he never empties a base unless the stance says so. Returns the
 * arrange actions, then ready.
 */
export function botArrange(s: GameState, seed = Date.now(), stance: Stance = STANCES.half): Action[] {
  if (s.phase !== "position") return [{ t: "ready" }];
  const rand = rng(seed);
  const me = s.current;
  const c: Ctx = { s, me, sk: HUMAN, reach: hitReach() };
  const reach = s.rules.positionReach;
  const out: Action[] = [];
  const pos = new Map(s.soldiers.filter((x) => x.alive && x.owner === me).map((x) => [x.id, { x: x.x, y: x.y }]));
  const foes = s.soldiers.filter((x) => x.alive && x.owner !== me).map((x) => ({ x: x.x, y: x.y }));
  // inside as the wall's garrison counts it (the engine's `inside`)
  const insideHome = (id: number, p: Pt) => inside(s.bases[s.soldiers[id].home!], p);
  const score = (id: number, p: Pt) => {
    const at = [...pos].map(([k, q]) => ({ ...(k === id ? p : q), id: k }));
    const men = manning(s, me, at);
    const mine: Dot[] = at.map((d) => ({ ...d, w: worth(s, { ...d, owner: me }, men) }));
    let crowd = 0;
    for (const [k, q] of pos) if (k !== id) { const d = dist(p, q); if (d < 60) crowd += (60 - d) / 60; }
    return bestShot(c, foes, mine) + 0.15 * crowd;
  };
  const order = [...pos.keys()].sort(() => rand() - 0.5);
  for (const id of order) {
    const x = s.soldiers[id];
    const home = s.bases[x.home ?? -1];
    if (!home) continue;
    const mates = [...pos].filter(([k]) => s.soldiers[k].home === home.id);
    const inNow = mates.filter(([k, q]) => k !== id && insideHome(k, q)).length;
    const mayLeave = inNow >= Math.ceil(mates.length * stance.minIn);
    const mayStay = inNow + 1 <= Math.floor(mates.length * stance.maxIn);
    const ok = (p: Pt) => (insideHome(id, p) ? mayStay : mayLeave);
    let bestP = pos.get(id)!, bestV = ok(bestP) ? score(id, bestP) : Infinity;
    const tries = bestV === Infinity ? 40 : 10;
    for (let t = 0; t < tries; t++) {
      const a = rand() * Math.PI * 2;
      const wall = edgeAt(home, a);
      // forced out: a spot on the paper just outside the wall
      const r = bestV === Infinity && !mayStay ? wall * 1.05 + 1 + rand() * Math.max(0, wall * -0.05 + reach - 2) : Math.sqrt(rand()) * (wall + reach * 0.9);
      const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (!ok(p)) continue;
      if ([...pos].some(([k, q]) => k !== id && dist(q, p) < RULES.soldierRadius * 2.6)) continue;
      const trial = { ...s, soldiers: s.soldiers.map((o) => (pos.has(o.id) ? { ...o, ...pos.get(o.id)! } : o)) };
      if (canArrange(trial, id, p.x, p.y)) continue;
      const v = score(id, p);
      if (v < bestV - 0.01) { bestV = v; bestP = p; }
    }
    if (bestP.x !== x.x || bestP.y !== x.y) { pos.set(id, bestP); out.push({ t: "arrange", soldier: id, x: bestP.x, y: bestP.y }); }
  }
  out.push({ t: "ready" });
  return out;
}

/** How far from a base's centre its wall is, heading out at angle `a`. */
function edgeAt(b: Base, a: number) {
  const vs = corners(b);
  if (!vs) return b.r;
  const far = { x: b.x + Math.cos(a) * b.r * 2, y: b.y + Math.sin(a) * b.r * 2 };
  return (polyHits(b, far, vs)[0]?.t ?? 0.5) * b.r * 2;
}

// --- setup ------------------------------------------------------------------

/** The bot's shape for its next long-war base: mostly camps, some cushions, the odd prism. */
export function botShape(rand: () => number): Shape {
  const u = rand();
  return u < 0.45 ? "camp" : u < 0.8 ? "cushion" : "prism";
}

/** Where the bot draws its next base: its own half, spread out. */
export function botBase(s: GameState, can: (x: number, y: number) => boolean, seed = Date.now()) {
  const rand = rng(seed);
  const H = RULES.pageH;
  const top = s.current === 1;
  const own = top ? [H * 0.08, H * 0.42] : [H * 0.58, H * 0.92];
  const r = RULES.baseRadius * 1.4;
  for (let i = 0; i < 400; i++) {
    const x = RULES.margin + r + rand() * (RULES.pageW - RULES.margin - 2 * r), y = own[0] + rand() * (own[1] - own[0]);
    if (can(x, y)) return { x, y };
  }
  const wide = top ? [H * 0.05, H * 0.47] : [H * 0.53, H * 0.95];
  for (let i = 0; i < 2000; i++) {
    const x = rand() * RULES.pageW, y = wide[0] + rand() * (wide[1] - wide[0]);
    if (can(x, y)) return { x, y };
  }
  for (let i = 0; i < 4000; i++) {
    const x = rand() * RULES.pageW, y = rand() * H;
    if (can(x, y)) return { x, y };
  }
  return null;
}

/** For the UI: the power a flick of this length took (to animate the bot's pull-back). */
export const powerOf = (s: GameState, f: Flick) => Math.max(0.05, Math.min(1, powerFor(s.rules, f.length)));
