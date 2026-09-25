// Dawood-bot. Plans like a player who knows the rules: it imagines a spread of
// flicks, previews each one with the real engine (so walls, mirrors, prisms,
// dried ink and ambushes are all understood), re-tries the promising ones
// with a shaky hand to see how often they'd actually come off, and weighs
// where its soldiers end up. Then it flicks with the same shaky hand.
// Pure and seeded: the same state and seed always give the same action.

import { baseEdges, insideBase } from "./bases";
import { sigma } from "./flick";
import {
  canAct, canArrange, canTransfer, earns, exposed, garrison, other, powerFor, preview, reachOf, ready, roadBetween, standing, steadiness, transferMax,
  type Action, type ActionKind, type Flick, type GameState, type Outcome, type Player,
} from "./game";
import { dist, gauss, reflectPt, rng, segHit, type Pt } from "./geom";
import { FEEL, RULES, type RuleSet, type Shape } from "./rules";

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

interface Intent { kind: ActionKind; soldierId: number; angle: number; power: number }

/** Turn an intended flick into what a shaky hand actually does. */
export function shake(s: GameState, it: Intent, sk: Skill, rand: () => number): Flick {
  const st = steadiness(s, it.soldierId, it.kind);
  const sa = Math.hypot(sigma(it.power) * sk.hand, sk.aim) * st;
  const sl = Math.hypot(FEEL.lengthJitter * sk.hand, sk.judge) * st;
  return {
    soldierId: it.soldierId,
    kind: it.kind,
    angle: it.angle + gauss(rand) * sa,
    length: reachOf(s.rules, it.kind, it.power) * Math.max(0.2, 1 + gauss(rand) * sl),
    bend: (rand() * 2 - 1) * FEEL.bendMax * (0.3 + 0.7 * it.power),
    wob: (rand() * 2 ** 32) >>> 0,
  };
}

// --- how good is a position? -------------------------------------------------

function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

interface Dot extends Pt { id: number; w: number; base?: number; walk?: boolean }

interface Ctx {
  s: GameState;
  R: RuleSet;
  me: Player;
  sk: Skill;
  reach: number;
  bases: number; // value of a base in "bases" games
  phit?: Map<number, Float64Array>;
}

/** Chance a flick aimed at something `d` away passes within `reach` of it. */
function pHit(c: Ctx, d: number, steady = 1) {
  const k = Math.min(400, Math.round(d / 8));
  const table = (c.phit ??= new Map()).get(steady) ?? new Float64Array(401).fill(-1);
  c.phit.set(steady, table);
  if (table[k] < 0) {
    const dd = Math.max(1, k * 8);
    const p = powerFor(c.R, "shoot", dd + 60);
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
  const max = c.R.shoot.max;
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

/** How much a soldier standing here is worth as a target (walls and wounds make it less). */
function worth(s: GameState, x: { x: number; y: number; owner: Player; hp?: number }): { w: number; base?: number } {
  let w = x.hp && x.hp > 1 ? 0.5 : 1;
  let base: number | undefined;
  for (const b of s.bases) {
    if (b.fallen || b.owner !== x.owner || !insideBase(b, x)) continue;
    base = b.id;
    const rule = s.rules.shapes[b.shape];
    if (rule && (rule.wall === "stop" || rule.wall === "mirror")) {
      const sides = b.shape === "tri" ? 3 : b.shape === "square" ? 4 : 6;
      const intact = 1 - (b.breached?.length ?? 0) / sides;
      w *= 1 - 0.7 * intact;
    }
  }
  // out in the open, a lunge can take him (and chain on); behind a wall it can't
  if (base === undefined && s.rules.lunge?.baseDeath) w *= 1.3;
  return { w, base };
}

function dots(s: GameState, p: Player, drop: Set<number>, moved?: { id: number; to: Pt }): Dot[] {
  const out: Dot[] = [];
  for (const x of exposed(s, p)) {
    if (drop.has(x.id)) continue;
    const at = moved && moved.id === x.id ? { ...x, ...moved.to } : x;
    const { w, base } = worth(s, at);
    out.push({ x: at.x, y: at.y, id: x.id, w, base, ...(x.transit !== undefined && { walk: true }) });
  }
  return out;
}

/** My outlook minus theirs, after an action whose effects are summarised here. `only`: my next flick must come from here (an earned lunge). */
function outlook(c: Ctx, mine: Dot[], theirs: Dot[], again: boolean, only?: { at: Pt; steady: number }): number {
  const s = c.s;
  const myStd = inLast(s, c.me), foeStd = inLast(s, other(c.me));
  // my shooters are the ones who can flick (walkers can't); an earned lunge is one soldier, shakier
  const mineBest = only ? bestShot(c, [only.at], theirs, myStd * only.steady) : bestShot(c, mine.filter((d) => !d.walk), theirs, myStd);
  const theirBest = bestShot(c, theirs.filter((d) => !d.walk), mine, foeStd);
  let v = again ? mineBest * 0.9 - theirBest * 0.5 : mineBest * 0.45 - theirBest * 0.85;
  if (c.R.win === "bases") {
    const gar = (ds: Dot[], p: Player) => {
      const m = new Map<number, number>();
      for (const b of standing(s, p)) m.set(b.id, 0);
      for (const d of ds) if (d.base !== undefined && m.has(d.base)) m.set(d.base, m.get(d.base)! + 1);
      return m;
    };
    const risk = (b: number, n: number, enemies: Dot[]) => {
      if (n === 0) return 1;
      const base = s.bases[b];
      let dn = Infinity;
      for (const e of enemies) dn = Math.min(dn, dist(e, base));
      return Math.pow(pHit(c, dn), Math.max(1, n - 0.5));
    };
    const mg = gar(mine, c.me), tg = gar(theirs, other(c.me));
    let mv = 0, tv = 0;
    for (const [b, n] of mg) mv += n ? 1 - risk(b, n, theirs) * (again ? 0.5 : 0.9) : 0;
    for (const [b, n] of tg) tv += n ? 1 - risk(b, n, mine) * (again ? 0.9 : 0.4) : 0;
    v += c.bases * (mv - tv);
  }
  return v;
}

const inLast = (s: GameState, p: Player) => (s.rules.lastStand && s.stand[p] ? s.rules.lastStand.steady : 1);

/** Points for what a flick did right now, and how many it crossed out (what earns another flick). */
function gain(c: Ctx, o: Outcome, moverId: number): { v: number; hit: boolean; hits: number } {
  const s = c.s;
  let v = 0;
  let hits = 0;
  for (const id of o.killed) { const own = s.soldiers[id].owner === c.me; v += own ? -1 : 1; if (!own) hits++; }
  for (const id of o.wounded) { const own = s.soldiers[id].owner === c.me; v += own ? -0.5 : 0.5; if (!own) hits++; }
  for (const cut of o.cut) { v += cut.ids.length; hits += cut.ids.length; }
  const hit = hits > 0;
  if (o.lost) v -= 1.1;
  v += o.breaches.length * 0.15;
  if (c.R.win === "bases") {
    // a base emptied by this flick
    const killed = new Set([...o.killed, ...(o.lost ? [moverId] : [])]);
    const emptied = new Set<number>();
    for (const b of s.bases) {
      if (b.fallen) continue;
      const g = garrison(s, b);
      if (!g.length) continue;
      const left = g.filter((x) => !killed.has(x.id) && !(x.id === moverId && o.movedTo && !insideBase(b, o.movedTo)));
      if (!left.length) { v += b.owner === c.me ? -c.bases : c.bases; emptied.add(b.id); }
    }
    // standing in a fallen base (or one this very flick emptied) takes it
    if (o.movedTo && c.R.capture) {
      const b = s.bases.find((b) => (b.fallen || emptied.has(b.id)) && insideBase(b, o.movedTo!));
      if (b) v += c.bases * 0.9;
    }
  }
  return { v, hit, hits };
}

/** Would this flick keep the pen? (an earned flick, or a last stand's second) */
const bonusFor = (s: GameState, kind: ActionKind, hits: number, lost = false) => earns(s, kind, hits, !lost) || s.owed > 1;

// --- choosing ---------------------------------------------------------------

function intents(c: Ctx, rand: () => number): Intent[] {
  const s = c.s, R = c.R;
  // an earned lunge: only a lunge, and only by whoever earned it
  const mine = ready(s, c.me).filter((x) => canAct(s, x.id)), foes = exposed(s, other(c.me));
  const out: Intent[] = [];
  if (!mine.length) return out;
  const must = !!s.must;
  // soldiers nearer the enemy get more looks: that's where the good lines are
  const cx = foes.reduce((a, t) => a + t.x, 0) / Math.max(1, foes.length);
  const cy = foes.reduce((a, t) => a + t.y, 0) / Math.max(1, foes.length);
  const ranked = [...mine].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  const pickMine = () => ranked[Math.floor(Math.pow(rand(), 1.6) * ranked.length)];
  const walls = !!R.kit || R.ink.ownBounces > 0 || R.ink.edgeBounces > 0;
  for (let i = 0; i < c.sk.tries; i++) {
    const me = pickMine();
    const move = must || rand() < 0.35;
    const kind: ActionKind = move ? "move" : "shoot";
    const range = move ? R.move : R.shoot;
    if (foes.length && rand() > (walls ? 0.2 : 0.06)) {
      const foe = foes[Math.floor(rand() * foes.length)];
      const d = dist(me, foe);
      const angle = Math.atan2(foe.y - me.y, foe.x - me.x) + gauss(rand) * 0.025;
      // just past the target (steadier), or well past it (catch whatever's behind)
      const want = rand() < 0.55 ? d + 40 + rand() * 60 : d + 150 + rand() * (range.max - d);
      out.push({ kind, soldierId: me.id, angle, power: powerFor(R, kind, want) });
    } else {
      // anywhere: bank shots, prisms, or just getting somewhere
      out.push({ kind, soldierId: me.id, angle: rand() * Math.PI * 2, power: rand() });
    }
  }
  // bank shots: aim at a target's mirror image in a bank wall, if the line would glance off it
  const banks = s.bases.filter((b) => R.shapes[b.shape]?.wall === "bank" && (b.fallen === undefined || R.empty === "ring"));
  if (banks.length && foes.length) {
    for (let i = 0, n = 0; i < 60 && n < 10; i++) {
      const me = pickMine(), foe = foes[Math.floor(rand() * foes.length)];
      const b = banks[Math.floor(rand() * banks.length)];
      const edges = baseEdges(b);
      const [a, e] = edges[Math.floor(rand() * edges.length)];
      const img = reflectPt(foe, a, e);
      if (!segHit(me, img, a, e)) continue;
      const d = dist(me, img);
      if (d > (must ? R.move.max : R.shoot.max)) continue;
      const kind: ActionKind = must || rand() < 0.2 ? "move" : "shoot";
      out.push({ kind, soldierId: me.id, angle: Math.atan2(img.y - me.y, img.x - me.x), power: powerFor(R, kind, d + 40 + rand() * 80) });
      n++;
    }
  }
  // grooves: meet one of your own lines nearly parallel and let it carry you
  const groove = R.ink.groove ?? 0;
  if (groove > 0) {
    const lines = s.marks.filter((m) => m.t === "stroke" && m.owner === c.me) as Extract<GameState["marks"][number], { t: "stroke" }>[];
    for (let i = 0, n = 0; i < 60 && n < 8 && lines.length; i++) {
      const me = pickMine();
      const m = lines[Math.floor(rand() * lines.length)];
      const k = 1 + Math.floor(rand() * (m.pts.length - 2));
      const p = m.pts[k], q = m.pts[k + 1] ?? m.pts[k - 1];
      const d = dist(me, p);
      if (d < 40 || d > R.shoot.max * 0.7) continue;
      const aim = Math.atan2(p.y - me.y, p.x - me.x);
      let off = Math.abs(Math.atan2(Math.sin(aim - Math.atan2(q.y - p.y, q.x - p.x)), Math.cos(aim - Math.atan2(q.y - p.y, q.x - p.x))));
      if (off > Math.PI / 2) off = Math.PI - off;
      if (off > groove) continue;
      const kind: ActionKind = must || rand() < 0.4 ? "move" : "shoot";
      out.push({ kind, soldierId: me.id, angle: aim, power: powerFor(R, kind, d + 200 + rand() * 500) });
      n++;
    }
  }
  return out;
}

function transfers(c: Ctx): Action[] {
  const s = c.s;
  if (!c.R.transfer) return [];
  const out: Action[] = [];
  const mine = standing(s, c.me);
  const size = new Map(mine.map((b) => [b.id, garrison(s, b).length]));
  // round 2: empty rings a send may fill (yours, or anyone's)
  const rings = s.bases.filter((b) => b.fallen !== undefined && (c.R.empty ?? "gone") !== "gone");
  for (const a of mine) {
    const max = transferMax(s, a.id);
    if (!max) continue;
    const others = mine.filter((b) => b !== a);
    const to = new Set<typeof a>();
    if (others.length) {
      // worth a look: the nearest base (short, safe road), the thinnest, and any with walls
      to.add(others.reduce((p, q) => (dist(a, p) <= dist(a, q) ? p : q)));
      to.add(others.reduce((p, q) => (size.get(p.id)! <= size.get(q.id)! ? p : q)));
      for (const b of others) if (c.R.shapes[b.shape].wall !== "none") to.add(b);
    }
    for (const b of rings) if (!canTransfer(s, a.id, b.id, 1)) to.add(b);
    for (const b of to) for (const n of new Set([1, Math.ceil(max / 2), max])) {
      if (!canTransfer(s, a.id, b.id, n)) out.push({ t: "transfer", from: a.id, to: b.id, n });
    }
  }
  return out;
}

// A send's worth: where everyone stands after it (now, and once they arrive),
// minus what an ambush might cost, against the same measure before it.
// `again`: the sender still acts this turn (a free send, or shots left).
function scoreTransfer(c: Ctx, a: Extract<Action, { t: "transfer" }>, base: { mine: Dot[]; theirs: Dot[] }, again: boolean, before: number): number {
  const s = c.s;
  const from = s.bases[a.from], to = s.bases[a.to];
  const go = new Set(garrison(s, from).sort((p, q) => dist(p, to) - dist(q, to)).slice(0, a.n).map((x) => x.id));
  const mine = base.mine.filter((d) => !go.has(d.id));
  const T = c.R.transfer!;
  const walk = (T.pace ?? 0) > 0;
  // they'll stand in the destination soon: count them there for the long view
  const there = [...go].map((id, k) => {
    const ang = k * 2.4;
    const p = { x: to.x + Math.cos(ang) * to.r * 0.5, y: to.y + Math.sin(ang) * to.r * 0.5 };
    const { w } = worth(s, { ...p, owner: c.me });
    return { ...p, id, w, base: to.id };
  });
  const later: Dot[] = [...mine, ...there];
  if (walk) {
    // walkers are out on the road, in the open, for a few turns: price that as it is
    const road = roadBetween(from, to);
    const len = dist(road[0], road[1]);
    const turns = Math.max(1, Math.ceil(len / T.pace!));
    const walkers: Dot[] = [...go].map((id, k) => {
      const f = Math.min(1, (T.pace! * 0.5 + k * 18) / Math.max(1, len));
      const p = { x: road[0].x + (road[1].x - road[0].x) * f, y: road[0].y + (road[1].y - road[0].y) * f };
      return { ...p, id, w: 1.3, walk: true };
    });
    const road0 = outlook(c, [...mine, ...walkers], base.theirs, again);
    const next = outlook(c, later, base.theirs, again);
    // an empty ring filled again is a wall between them and a lunge
    const refill = to.fallen !== undefined ? 0.4 * a.n : 0;
    const w = Math.min(0.8, 0.3 + 0.15 * turns);
    return w * road0 + (1 - w) * next + refill - before;
  }
  const now = outlook(c, mine, base.theirs, again);
  const next = outlook(c, later, base.theirs, again);
  const road = dist(from, to);
  // an enemy who sees a convoy on the road will usually try to cut it
  const pCut = Math.min(0.9, 0.25 + road / 1400);
  const risk = T.ambush === "none" ? 0 : T.ambush === "all" ? a.n * pCut : Math.min(a.n, 1) * pCut;
  return 0.35 * now + 0.65 * next - risk - before;
}

/** Lab instrumentation: how the best flick and the best transfer scored. */
export const botDebug: { on?: (flick: number, send: number) => void } = {};

/** What Dawood-bot does now. Always a legal action. */
export function botAction(s: GameState, level: Level | Skill = 1, seed = Date.now()): Action {
  const sk = typeof level === "number" ? SKILLS[level] : level;
  const rand = rng(seed);
  const me = s.current;
  const c: Ctx = { s, R: s.rules, me, sk, reach: s.rules.soldierRadius + RULES.inkWidth / 2 + s.rules.hitSlop, bases: 2.5 };
  if (s.phase === "position") return botArrange(s, seed)[0] ?? { t: "ready" };
  const base = { mine: dots(s, me, new Set()), theirs: dots(s, other(me), new Set()) };
  const free = !!s.rules.transfer?.free;
  if (free && !s.sent) {
    // a free send comes before the flick: take it if it's worth anything
    const before = outlook(c, base.mine, base.theirs, true);
    let pick: Action | null = null, pv = 0.2;
    for (const t of transfers(c)) {
      const v = scoreTransfer(c, t as Extract<Action, { t: "transfer" }>, base, true, before);
      if (v > pv) { pv = v; pick = t; }
    }
    if (pick) return pick;
  }
  const cands = intents(c, rand);
  if (!cands.length) {
    const t = free || s.must ? null : transfers(c)[0];
    return t ?? { t: "pass" };
  }
  // 1. noiseless: what would each do if the hand were perfect?
  const first = cands.map((it) => {
    const f: Flick = { soldierId: it.soldierId, kind: it.kind, angle: it.angle, length: reachOf(s.rules, it.kind, it.power), bend: 0 };
    const o = preview(s, f);
    const g = gain(c, o, it.soldierId);
    return { it, o, g: g.v + (bonusFor(s, it.kind, g.hits, o.lost) ? 0.4 : 0) };
  });
  first.sort((a, b) => b.g - a.g);
  // keep the best, plus a couple of moves so repositioning always gets a look
  const kept = first.slice(0, c.sk.keep);
  for (const x of first.filter((x) => x.it.kind === "move" && !x.o.lost).slice(0, 2)) if (!kept.includes(x)) kept.push(x);
  let best: { act: Action | Intent; v: number } | null = null;
  const now0 = outlook(c, base.mine, base.theirs, false);
  for (const k of kept) {
    // 2. with a shaky hand, how often does it come off (and keep the pen)?
    let tot = 0, keeps = 0, earned = 0;
    for (let j = 0; j < c.sk.samples; j++) {
      const o = preview(s, shake(s, k.it, sk, rand));
      const g = gain(c, o, k.it.soldierId);
      tot += g.v;
      if (bonusFor(s, k.it.kind, g.hits, o.lost)) keeps++;
      if (earns(s, k.it.kind, g.hits, !o.lost)) earned++;
    }
    const pKeep = keeps / c.sk.samples, pEarn = earned / c.sk.samples;
    let v = tot / c.sk.samples;
    // 3. where does that leave everyone? (judged on the clean outcome)
    const o = k.o;
    const drop = new Set([...o.killed, ...o.cut.flatMap((x) => x.ids)]);
    const moved = o.movedTo ? { id: k.it.soldierId, to: o.movedTo } : undefined;
    const mine = dots(s, me, o.lost ? new Set([k.it.soldierId]) : new Set(), moved);
    const theirs = dots(s, other(me), drop);
    const again = pKeep > 0.5;
    // an earned lunge comes from the lunger, where he ends up, with a shakier hand
    const E = s.rules.earn;
    const only = again && E && k.it.kind === "move" && E.sameMover && o.movedTo
      ? { at: o.movedTo, steady: 1 + E.shake * ((s.link ?? 0) + 1) } : undefined;
    v += outlook(c, mine, theirs, again, only) - now0;
    v += pEarn * 0.5;
    if (!best || v > best.v) best = { act: k.it, v };
  }
  const bestFlick = best?.v ?? -Infinity;
  // an earned lunge can be turned down: stopping is worth nothing either way
  if (s.must && bestFlick < 0) return { t: "pass" };
  let bestSend = -Infinity;
  for (const t of free || s.must ? [] : transfers(c)) {
    const v = scoreTransfer(c, t as Extract<Action, { t: "transfer" }>, base, s.owed > 1, now0);
    bestSend = Math.max(bestSend, v);
    if (!best || v > best.v) best = { act: t, v };
  }
  botDebug.on?.(bestFlick, bestSend);
  const pick = best!.act;
  if ("t" in pick) return pick;
  return { t: "flick", ...shake(s, pick, sk, rand) };
}

/** Kept for callers that only want a flick. */
export function botFlick(s: GameState, level: Level = 1, seed = Date.now()): Flick {
  const a = botAction(s, level, seed);
  if (a.t === "flick") { const { t: _t, ...f } = a; void _t; return f; }
  const it = intents({ s, R: s.rules, me: s.current, sk: SKILLS[level], reach: 10, bases: 2.5 }, rng(seed))[0];
  return shake(s, it, SKILLS[level], rng(seed + 1));
}

// --- positioning ----------------------------------------------------------------

/**
 * How Dawood-bot arranges his soldiers before the first flick: one at a
 * time, each to whichever of a few spots near his base leaves the enemy the
 * worst best line, keeping clear of his mates (a line through two is what
 * earns a snipe its extra flick). Returns the arrange actions, then ready.
 */
export function botArrange(s: GameState, seed = Date.now()): Action[] {
  if (s.phase !== "position" || !s.rules.position) return [{ t: "ready" }];
  const rand = rng(seed);
  const me = s.current;
  const c: Ctx = { s, R: s.rules, me, sk: HUMAN, reach: s.rules.soldierRadius + RULES.inkWidth / 2 + s.rules.hitSlop, bases: 2.5 };
  const reach = s.rules.position.reach;
  const out: Action[] = [];
  const pos = new Map(ready(s, me).map((x) => [x.id, { x: x.x, y: x.y }]));
  const foes = ready(s, other(me)).map((x) => ({ x: x.x, y: x.y }));
  const score = (id: number, p: Pt) => {
    const mine: Dot[] = [...pos].map(([k, q]) => ({ ...(k === id ? p : q), id: k, w: 1 }));
    let crowd = 0;
    for (const [k, q] of pos) if (k !== id) { const d = dist(p, q); if (d < 60) crowd += (60 - d) / 60; }
    return bestShot(c, foes, mine) + 0.15 * crowd;
  };
  const order = [...pos.keys()].sort(() => rand() - 0.5);
  for (const id of order) {
    const x = s.soldiers[id];
    const home = s.bases[x.home ?? -1];
    if (!home) continue;
    let bestP = pos.get(id)!, bestV = score(id, bestP);
    for (let t = 0; t < 10; t++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (home.r + reach * 0.9);
      const p = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      // not on top of anyone where they'll stand after this shuffle
      if ([...pos].some(([k, q]) => k !== id && dist(q, p) < s.rules.soldierRadius * 2.6)) continue;
      const trial = { ...s, soldiers: s.soldiers.map((o) => (pos.has(o.id) ? { ...o, ...pos.get(o.id)! } : o)) };
      if (canArrange(trial, id, p.x, p.y)) continue;
      const v = score(id, p);
      if (v < bestV - 0.01) { bestV = v; bestP = p; }
    }
    if (bestP.x !== x.x || bestP.y !== x.y) { pos.set(id, bestP); out.push({ t: "arrange", id, x: bestP.x, y: bestP.y }); }
  }
  out.push({ t: "ready" });
  return out;
}

// --- setup ------------------------------------------------------------------

/** Which shape to draw next, and where: its own half, spread out; walls to the front. */
export function botBase(s: GameState, can: (x: number, y: number, shape: Shape) => boolean, seed = Date.now()) {
  const rand = rng(seed);
  const H = RULES.pageH;
  const left = [...new Set(s.rules.kit ? s.rules.kit.filter((k) => kitHas(s, k)) : ["circle" as Shape])];
  const shape = left[Math.floor(rand() * left.length)] ?? "circle";
  const front = s.rules.shapes[shape].wall !== "none";
  const top = s.current === 1;
  const band = front ? [0.3, 0.45] : [0.08, 0.4];
  const own = top ? [H * band[0], H * band[1]] : [H * (1 - band[1]), H * (1 - band[0])];
  const r = s.rules.baseRadius * 1.4;
  for (let i = 0; i < 400; i++) {
    const x = RULES.margin + r + rand() * (RULES.pageW - RULES.margin - 2 * r), y = own[0] + rand() * (own[1] - own[0]);
    if (can(x, y, shape)) return { x, y, shape };
  }
  const wide = top ? [H * 0.05, H * 0.47] : [H * 0.53, H * 0.95];
  for (let i = 0; i < 2000; i++) {
    const x = rand() * RULES.pageW, y = wide[0] + rand() * (wide[1] - wide[0]);
    if (can(x, y, shape)) return { x, y, shape };
  }
  for (let i = 0; i < 4000; i++) {
    const x = rand() * RULES.pageW, y = rand() * H;
    if (can(x, y, shape)) return { x, y, shape };
  }
  return null;
}

function kitHas(s: GameState, k: Shape) {
  const placed = s.bases.filter((b) => b.founder === s.current && b.shape === k).length;
  return s.rules.kit!.filter((x) => x === k).length > placed;
}

