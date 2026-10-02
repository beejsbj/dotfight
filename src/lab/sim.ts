// The rules lab (rounds 3 and 4): bot-vs-bot games on the core rules as the
// game plays them (src/game.ts), headless, and what they tell us. Pure and
// seeded: the same size, rules, stances and seed always play the same game.

import { botAction, botArrange, botBase, botShape, HUMAN, STANCES, type Skill, type Stance } from "../bot";
import { act, alive, canPlaceBase, garrison, inside, newGame, type Action, type GameState, type Player } from "../game";
import { rng } from "../geom";
import { CORE, type CoreRules, type Shape, type Size } from "../rules";

export interface GameStats {
  label: string;
  seed: number;
  /** -1: nobody won before the turn cap. */
  winner: Player | -1;
  /** Pen hand-overs. */
  turns: number;
  flicks: number;
  snipes: number;
  lunges: number;
  sends: number;
  stops: number;
  /** Soldiers crossed out by each flick. */
  perFlick: number[];
  /** Snipes that took two or more (and so earned a flick). */
  doubles: number;
  /** Lunge chains: lunges in a row by one soldier (1 = a lunge that earned nothing). */
  lungeChains: number[];
  /** Lungers shot where they landed, and flicked off the page. */
  crashes: number;
  offPage: number;
  /** Walkers crossed out on the road. */
  roadKills: number;
  /** Most flicks one player made in one turn. */
  longestTurn: number;
  /** Which sides' last stand began (0, 1, or both). */
  stands: Player[];
  /** Soldiers moved in positioning, and left outside their walls when the first flick came. */
  arranged: number;
  outside: number;
  /** Did the side ahead at half-time lose? null when level. */
  midLeaderLost: boolean | null;
  army: number;
  /** Round 4. Enemy soldiers standing in their own base's garrison / anywhere else, summed over every flick (soldier-flicks exposed), and those crossed out. */
  expIn: number;
  expOut: number;
  killsIn: number;
  killsOut: number;
  /** Bases on the page, and for each the turn it was first emptied (an empty ring), or null if it never was. */
  bases: number;
  emptiedAt: (number | null)[];
  /** Soldiers of each side inside their base when the first flick came. */
  insideAtStart: [number, number];
}

export type Agent = (s: GameState, seed: number) => Action;
export const botAgent = (sk: Skill = HUMAN): Agent => (s, seed) => botAction(s, sk, seed);

export interface Opts {
  maxTurns?: number;
  agents?: [Agent, Agent];
  rules?: CoreRules;
  label?: string;
  stances?: [Stance, Stance];
  /** The long war: each side's shapes, in the order it draws them (default: the bot picks). */
  kit?: [Shape[], Shape[]];
}

export function playGame(size: Size, seed: number, opts: Opts = {}): { st: GameStats; s: GameState } {
  const maxTurns = opts.maxTurns ?? 400;
  const agents = opts.agents ?? [botAgent(), botAgent()];
  const s = newGame(size, seed, undefined, opts.rules ?? CORE);
  const rand = rng(seed ^ 0x9e3779b9);
  while (s.phase === "setup") {
    const n = s.bases.filter((b) => b.owner === s.current).length;
    const kit = opts.kit?.[s.current];
    const shape = s.rules.long ? (kit ? kit[n % kit.length] : botShape(rand)) : undefined;
    const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y, shape), (rand() * 2 ** 32) >>> 0);
    if (!spot) throw new Error(`no room for a base (seed ${seed})`);
    act(s, { t: "base", x: spot.x, y: spot.y, ...(shape && { shape }) });
  }
  const st: GameStats = {
    label: opts.label ?? size.name, seed, winner: -1, turns: 0, flicks: 0, snipes: 0, lunges: 0, sends: 0, stops: 0, perFlick: [], doubles: 0,
    lungeChains: [], crashes: 0, offPage: 0, roadKills: 0, longestTurn: 0, stands: [], arranged: 0, outside: 0, midLeaderLost: null, army: alive(s, 0).length,
    expIn: 0, expOut: 0, killsIn: 0, killsOut: 0, bases: s.bases.length, emptiedAt: s.bases.map(() => null), insideAtStart: [0, 0],
  };
  const stances = opts.stances ?? [STANCES.half, STANCES.half];
  while (s.phase === "position") {
    for (const a of botArrange(s, (rand() * 2 ** 32) >>> 0, stances[s.current])) {
      try { act(s, a); if (a.t === "arrange") st.arranged++; } catch { /* a spot another move took */ }
      if (a.t === "ready") break;
    }
  }
  st.outside = s.soldiers.filter((x) => !inside(s.bases[x.home!], x)).length;
  const manned = () => new Set(s.bases.flatMap((b) => garrison(s, b).map((x) => x.id)));
  for (const b of s.bases) st.insideAtStart[b.owner] += garrison(s, b).length;
  const counts: [number, number][] = [];
  let turnFlicks = 0, lungeRun = 0;
  const onRoad = new Set<number>();
  while (s.phase === "play" && s.turn <= maxTurns) {
    const turn = s.turn;
    const a = agents[s.current](s, (rand() * 2 ** 32) >>> 0);
    for (const c of s.convoys) if (c.state === "road") for (const id of c.ids) onRoad.add(id); else for (const id of c.ids) onRoad.delete(id);
    const home = a.t === "flick" ? manned() : null;
    const foe = s.current === 0 ? 1 : 0;
    const o = act(s, a);
    if (home) {
      for (const x of s.soldiers) if (x.owner === foe && (x.alive || o.killed.includes(x.id))) home.has(x.id) ? st.expIn++ : st.expOut++;
      for (const id of o.killed) home.has(id) ? st.killsIn++ : st.killsOut++;
    }
    for (const b of s.bases) if (st.emptiedAt[b.id] === null && garrison(s, b).length === 0) st.emptiedAt[b.id] = turn;
    if (a.t === "flick") {
      st.flicks++;
      turnFlicks++;
      st.perFlick.push(o.killed.length);
      st.roadKills += o.killed.filter((id) => onRoad.has(id)).length;
      if (a.kind === "snipe") {
        st.snipes++;
        if (o.killed.length >= s.rules.snipeEarnAt) st.doubles++;
        if (lungeRun) { st.lungeChains.push(lungeRun); lungeRun = 0; }
      } else {
        st.lunges++;
        lungeRun++;
        if (o.crashed !== undefined) st.crashes++;
        else if (o.lost) st.offPage++;
        if (!o.earned) { st.lungeChains.push(lungeRun); lungeRun = 0; }
      }
      for (const p of o.stood) st.stands.push(p);
    } else if (a.t === "send") st.sends++;
    else if (a.t === "stop") { st.stops++; if (lungeRun) { st.lungeChains.push(lungeRun); lungeRun = 0; } }
    if (s.turn !== turn || s.phase !== "play") {
      counts.push([alive(s, 0).length, alive(s, 1).length]);
      st.longestTurn = Math.max(st.longestTurn, turnFlicks);
      if (lungeRun) { st.lungeChains.push(lungeRun); lungeRun = 0; }
      turnFlicks = 0;
    }
  }
  st.turns = Math.min(s.turn, maxTurns);
  st.winner = s.phase === "over" ? s.winner! : -1;
  if (st.winner !== -1 && counts.length >= 2) {
    const mid = counts[Math.floor(counts.length / 2) - 1];
    if (mid[0] !== mid[1]) st.midLeaderLost = (mid[0] > mid[1] ? 0 : 1) !== st.winner;
  }
  return { st, s };
}

// --- summary ------------------------------------------------------------------

const q = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarise(recs: GameStats[]) {
  const decided = recs.filter((r) => r.winner !== -1);
  const turns = recs.map((r) => r.turns);
  const flicks = recs.reduce((a, r) => a + r.flicks, 0);
  const chains = recs.flatMap((r) => r.lungeChains);
  const lt = recs.map((r) => r.longestTurn);
  const cb = recs.map((r) => r.midLeaderLost).filter((x): x is boolean => x !== null);
  const snipes = recs.reduce((a, r) => a + r.snipes, 0);
  return {
    label: recs[0]?.label ?? "?",
    games: recs.length,
    turns: { mean: mean(turns), p10: q(turns, 0.1), p50: q(turns, 0.5), p90: q(turns, 0.9) },
    flicksPerGame: flicks / Math.max(1, recs.length),
    firstWins: decided.length ? decided.filter((r) => r.winner === 0).length / decided.length : 0,
    stalled: (recs.length - decided.length) / Math.max(1, recs.length),
    killsPerFlick: mean(recs.flatMap((r) => r.perFlick)),
    lungeShare: recs.reduce((a, r) => a + r.lunges, 0) / Math.max(1, flicks),
    doubleRate: recs.reduce((a, r) => a + r.doubles, 0) / Math.max(1, snipes),
    sendsPerGame: mean(recs.map((r) => r.sends)),
    roadKills: mean(recs.map((r) => r.roadKills)),
    stopsPerGame: mean(recs.map((r) => r.stops)),
    longestTurn: { mean: mean(lt), p90: q(lt, 0.9), max: lt.reduce((a, b) => Math.max(a, b), 0) },
    chain: {
      mean: mean(chains),
      share: [1, 2, 3].map((k) => chains.filter((c) => c === k).length / Math.max(1, chains.length)).concat([chains.filter((c) => c >= 4).length / Math.max(1, chains.length)]),
      max: chains.reduce((a, b) => Math.max(a, b), 0),
    },
    crashes: mean(recs.map((r) => r.crashes)),
    offPage: mean(recs.map((r) => r.offPage)),
    standGames: mean(recs.map((r) => (r.stands.length ? 1 : 0))),
    standBoth: mean(recs.map((r) => (new Set(r.stands).size === 2 ? 1 : 0))),
    standWins: (() => {
      const g = recs.filter((r) => r.stands.length && r.winner !== -1);
      return g.length ? g.filter((r) => r.stands.includes(r.winner as Player)).length / g.length : 0;
    })(),
    comeback: cb.length ? cb.filter(Boolean).length / cb.length : 0,
    arranged: mean(recs.map((r) => r.arranged)),
    outside: mean(recs.map((r) => r.outside / Math.max(1, r.army * 2))),
    snipeShare: snipes / Math.max(1, flicks),
    /** Kills per soldier exposed to a flick: in a garrison, and anywhere else. */
    killRateIn: recs.reduce((a, r) => a + r.killsIn, 0) / Math.max(1, recs.reduce((a, r) => a + r.expIn, 0)),
    killRateOut: recs.reduce((a, r) => a + r.killsOut, 0) / Math.max(1, recs.reduce((a, r) => a + r.expOut, 0)),
    /** Share of all kills that were men inside a base. */
    killsInShare: recs.reduce((a, r) => a + r.killsIn, 0) / Math.max(1, recs.reduce((a, r) => a + r.killsIn + r.killsOut, 0)),
    /** Share of bases emptied at some point, and the turn a base empties (of those that do), also as a share of the game. */
    emptied: recs.reduce((a, r) => a + r.emptiedAt.filter((x) => x !== null).length, 0) / Math.max(1, recs.reduce((a, r) => a + r.bases, 0)),
    emptiedTurn: mean(recs.flatMap((r) => r.emptiedAt.filter((x): x is number => x !== null))),
    emptiedFrac: mean(recs.flatMap((r) => r.emptiedAt.filter((x): x is number => x !== null).map((x) => x / Math.max(1, r.turns)))),
    /** First base emptied in a game: the turn (games with one). */
    firstEmptied: mean(recs.map((r) => r.emptiedAt.filter((x): x is number => x !== null)).filter((x) => x.length).map((x) => Math.min(...x))),
    /** Share of each side's army inside at the first flick; and, in games where the sides differed, how often the side with more inside won. */
    insideShare: mean(recs.map((r) => (r.insideAtStart[0] + r.insideAtStart[1]) / Math.max(1, r.army * 2))),
    moreInsideWins: (() => {
      const g = recs.filter((r) => r.winner !== -1 && r.insideAtStart[0] !== r.insideAtStart[1]);
      return { games: g.length, rate: g.length ? g.filter((r) => (r.insideAtStart[0] > r.insideAtStart[1] ? 0 : 1) === r.winner).length / g.length : 0 };
    })(),
  };
}
export type Summary = ReturnType<typeof summarise>;

/** Round 4's table: whether bases matter. */
export function round4Table(sums: Summary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f1 = (x: number) => x.toFixed(1);
  const rows = [
    "| variant | games | turns (p90) | 1st wins | stalled | lunge / snipe | kills/flick | longest turn mean, max | 4+ chains | inside at start | kill rate in / out (per 100 exposed) | kills that were inside | bases emptied (turn; share of game) | first base emptied | more-inside side wins |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const s of sums) {
    rows.push(`| ${s.label} | ${s.games} | ${f1(s.turns.mean)} (${s.turns.p90}) | ${pct(s.firstWins)} | ${pct(s.stalled)} | ${pct(s.lungeShare)} / ${pct(s.snipeShare)} | ${s.killsPerFlick.toFixed(2)} | ${f1(s.longestTurn.mean)}, ${s.longestTurn.max} | ${pct(s.chain.share[3])} | ${pct(s.insideShare)} | ${(s.killRateIn * 100).toFixed(2)} / ${(s.killRateOut * 100).toFixed(2)} | ${pct(s.killsInShare)} | ${pct(s.emptied)} (t${f1(s.emptiedTurn)}; ${pct(s.emptiedFrac)}) | t${f1(s.firstEmptied)} | ${pct(s.moreInsideWins.rate)} of ${s.moreInsideWins.games} |`);
  }
  return rows.join("\n");
}
