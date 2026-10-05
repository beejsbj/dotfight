// The rules lab (rounds 3 to 6): bot-vs-bot games on the core and long-war rules as the
// game plays them (src/game.ts), headless, and what they tell us. Pure and
// seeded: the same size, rules, stances and seed always play the same game.

import { botAction, botArrange, botBase, botShape, HUMAN, STANCES, type Skill, type Stance } from "../bot";
import { act, alive, canPlaceBase, garrison, inside, newGame, type Action, type GameState, type Player } from "../game";
import { rng } from "../geom";
import { CORE, LONG, SIZES, type CoreRules, type Shape, type Size } from "../rules";

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
  /** Round 5 (the long war; zero in a core game). Banks off cushions, prism splits and ink jolts, summed over every flick. */
  banks: number;
  splits: number;
  jolts: number;
  /** Round 6. Passes out through the mover's own square (`rule` events) and pentagon (`home` events), summed over every flick. */
  rules: number;
  homes: number;
  /** Flicks whose line was ruled (a `rule` event, or flicked from inside the square), and the soldiers those lines crossed out; flicks with a `home` event, and theirs. */
  ruledFlicks: number;
  ruledKills: number;
  homeFlicks: number;
  homeKills: number;
  /** Soldiers sent down a road (the walkers). */
  walkersSent: number;
  /** Total radians that camps' wells turned lines, flicks a well turned more than 0.05 rad, and units of line run riding a groove (and the part on enemy ink). */
  wellBent: number;
  bentFlicks: number;
  rode: number;
  rodeFoe: number;
  /** Convoys of the enemy out on the road at the start of each turn, summed; and the walkers in them. */
  convoyTurns: number;
  walkerTurns: number;
  /** Soldiers each side began the war with. */
  armies: [number, number];
  /** The long war: set when played on `long` rules; each seat's kit as given ("mix": the bot picks); and whether the seats were swapped for this game. */
  long?: true;
  kits?: [string, string];
  swap?: true;
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
  kit?: [Shape[] | null, Shape[] | null];
  /** Each seat's kit as the command line gave it, for the record. */
  kitNames?: [string, string];
  swap?: boolean;
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
    banks: 0, splits: 0, jolts: 0, rules: 0, homes: 0, ruledFlicks: 0, ruledKills: 0, homeFlicks: 0, homeKills: 0, walkersSent: 0, wellBent: 0, bentFlicks: 0, rode: 0, rodeFoe: 0, convoyTurns: 0, walkerTurns: 0, armies: [alive(s, 0).length, alive(s, 1).length],
    ...(s.rules.long && { long: true as const }), ...(opts.kitNames && { kits: opts.kitNames }), ...(opts.swap && { swap: true as const }),
  };
  st.army = (st.armies[0] + st.armies[1]) / 2;
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
  let counted = 0;
  while (s.phase === "play" && s.turn <= maxTurns) {
    const turn = s.turn;
    if (turn !== counted) {
      // the foe's convoys out on the road as this turn begins: they're what this turn's lines can catch
      counted = turn;
      for (const c of s.convoys) if (c.owner !== s.current && c.state === "road") { st.convoyTurns++; st.walkerTurns += c.ids.filter((id) => s.soldiers[id].alive && s.soldiers[id].convoy === c.id).length; }
    }
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
      let ruled = !!o.ruled, homed = false;
      for (const e of o.events) {
        if (e.kind === "bank") st.banks++;
        else if (e.kind === "split") st.splits++;
        else if (e.kind === "ink") st.jolts++;
        else if (e.kind === "rule") { st.rules++; ruled = true; }
        else if (e.kind === "home") { st.homes++; homed = true; }
      }
      if (ruled) { st.ruledFlicks++; st.ruledKills += o.killed.length; }
      if (homed) { st.homeFlicks++; st.homeKills += o.killed.length; }
      st.wellBent += o.bent ?? 0;
      if ((o.bent ?? 0) > 0.05) st.bentFlicks++;
      st.rode += o.rode ?? 0;
      st.rodeFoe += o.rodeFoe ?? 0;
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
    } else if (a.t === "send") { st.sends++; st.walkersSent += a.n; }
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
    /** Round 5, per game: banks, splits, jolts, well-bent flicks, units ridden in grooves (and on enemy ink), total well turning. */
    banks: mean(recs.map((r) => r.banks)),
    splits: mean(recs.map((r) => r.splits)),
    jolts: mean(recs.map((r) => r.jolts)),
    /** Round 6, per game: rule and home events, and flicks ruled / homed (with the kills a flick of each kind made). */
    rules: mean(recs.map((r) => r.rules ?? 0)),
    homes: mean(recs.map((r) => r.homes ?? 0)),
    ruledFlicks: mean(recs.map((r) => r.ruledFlicks ?? 0)),
    ruledKillsPerFlick: recs.reduce((a, r) => a + (r.ruledKills ?? 0), 0) / Math.max(1, recs.reduce((a, r) => a + (r.ruledFlicks ?? 0), 0)),
    homeFlicks: mean(recs.map((r) => r.homeFlicks ?? 0)),
    homeKillsPerFlick: recs.reduce((a, r) => a + (r.homeKills ?? 0), 0) / Math.max(1, recs.reduce((a, r) => a + (r.homeFlicks ?? 0), 0)),
    walkersSent: mean(recs.map((r) => r.walkersSent ?? 0)),
    /** Share of the soldiers sent down a road that were crossed out on it. */
    walkersLostShare: recs.reduce((a, r) => a + r.roadKills, 0) / Math.max(1, recs.reduce((a, r) => a + (r.walkersSent ?? 0), 0)),
    bentFlicks: mean(recs.map((r) => r.bentFlicks)),
    bentShare: recs.reduce((a, r) => a + r.bentFlicks, 0) / Math.max(1, flicks),
    wellBent: mean(recs.map((r) => r.wellBent)),
    rode: mean(recs.map((r) => r.rode)),
    rodeFoe: mean(recs.map((r) => r.rodeFoe)),
    convoyTurns: mean(recs.map((r) => r.convoyTurns)),
    walkerTurns: mean(recs.map((r) => r.walkerTurns)),
    /** Walkers crossed out per walker-turn on the road, and per convoy-turn (a convoy a turn out on the road). */
    roadKillRate: recs.reduce((a, r) => a + r.roadKills, 0) / Math.max(1, recs.reduce((a, r) => a + r.walkerTurns, 0)),
    roadKillPerConvoyTurn: recs.reduce((a, r) => a + r.roadKills, 0) / Math.max(1, recs.reduce((a, r) => a + r.convoyTurns, 0)),
    armyMean: mean(recs.map((r) => r.army)),
    /** Per kit (games where the seats' kits differ): games played, won, stalled. Win rate is of the decided ones. */
    kits: (() => {
      const k: Record<string, { games: number; wins: number; stalled: number }> = {};
      for (const r of recs) {
        if (!r.kits || r.kits[0] === r.kits[1]) continue;
        for (const seat of [0, 1] as const) {
          const e = (k[r.kits[seat]] ??= { games: 0, wins: 0, stalled: 0 });
          e.games++;
          if (r.winner === -1) e.stalled++;
          else if (r.winner === seat) e.wins++;
        }
      }
      return k;
    })(),
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

/** Standard error of a win rate over n decided games, in points. */
export const se = (p: number, n: number) => (n ? Math.sqrt((p * (1 - p)) / n) * 100 : 0);

/** Round 5's table: the long war, and how often each mechanic happens a game. */
export function round5Table(sums: Summary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f1 = (x: number) => x.toFixed(1);
  const rows = [
    "| variant | games | turns mean (p90) | 1st wins ± se | stalled | lunge / snipe | kills/flick | sends (road kills) | banks | splits | jolts | rules | homes | well-bent flicks (share of flicks) | groove ridden (on enemy ink) | army |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const s of sums) {
    const n = Math.round(s.games * (1 - s.stalled));
    rows.push(`| ${s.label} | ${s.games} | ${f1(s.turns.mean)} (${s.turns.p90}) | ${pct(s.firstWins)} ± ${se(s.firstWins, n).toFixed(1)} | ${pct(s.stalled)} | ${pct(s.lungeShare)} / ${pct(s.snipeShare)} | ${s.killsPerFlick.toFixed(2)} | ${f1(s.sendsPerGame)} (${f1(s.roadKills)}) | ${f1(s.banks)} | ${f1(s.splits)} | ${f1(s.jolts)} | ${f1(s.rules)} | ${f1(s.homes)} | ${f1(s.bentFlicks)} (${pct(s.bentShare)}) | ${f1(s.rode)} (${f1(s.rodeFoe)}) | ${f1(s.armyMean)} |`);
  }
  return rows.join("\n");
}

/** Round 6's table: what the square and the pentagon do, and what the walking convoys lose. */
export function round6Table(sums: Summary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const f1 = (x: number) => x.toFixed(1);
  const rows = [
    "| variant | games | turns mean (p90) | rule events | flicks ruled (kills each) | home events | flicks homed (kills each) | walkers sent | road kills | share of walkers lost |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const s of sums) {
    rows.push(`| ${s.label} | ${s.games} | ${f1(s.turns.mean)} (${s.turns.p90}) | ${f1(s.rules)} | ${f1(s.ruledFlicks)} (${s.ruledKillsPerFlick.toFixed(2)}) | ${f1(s.homes)} | ${f1(s.homeFlicks)} (${s.homeKillsPerFlick.toFixed(2)}) | ${f1(s.walkersSent)} | ${f1(s.roadKills)} | ${pct(s.walkersLostShare)} |`);
  }
  return rows.join("\n");
}

/** Round 5's shape-dominance table: each kit's wins over the games where the seats' kits differed (with --swap the first-player edge cancels). */
export function kitTable(sums: Summary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const rows = ["| matchup | kit | games | wins | win rate ± se (of decided) | stalled |", "|---|---|---|---|---|---|"];
  for (const s of sums) {
    for (const [kit, e] of Object.entries(s.kits)) {
      const n = e.games - e.stalled;
      const p = n ? e.wins / n : 0;
      rows.push(`| ${s.label} | ${kit} | ${e.games} | ${e.wins} | ${pct(p)} ± ${se(p, n).toFixed(1)} | ${e.stalled} |`);
    }
  }
  return rows.join("\n");
}

// --- command-line parsing (the lab runner's, here so it can be tested) --------------

/** Rules from `--rules` (core or long) and `--set a=1,long.well.pull=0.002,long.prism.ownFree=false`. Unknown keys and bad values throw. */
export function parseSet(spec: string | undefined, base: "core" | "long" = "core"): CoreRules {
  const r = structuredClone(base === "long" ? LONG : CORE) as unknown as Record<string, unknown>;
  for (const kv of (spec ?? "").split(",").filter(Boolean)) {
    const eq = kv.indexOf("=");
    if (eq < 0) throw new Error(`expected key=value, got ${kv}`);
    const k = kv.slice(0, eq), v = kv.slice(eq + 1);
    if (k === "reachMin" || k === "reachMax") { (r.reach as Record<string, number>)[k === "reachMin" ? "min" : "max"] = num(k, v); continue; }
    const path = k.split(".");
    let at: Record<string, unknown> = r;
    for (const [i, key] of path.slice(0, -1).entries()) {
      const next = at[key];
      if (typeof next !== "object" || next === null || Array.isArray(next)) throw new Error(`unknown rule ${k}${path[0] === "long" && i === 0 ? " (the long rules need --rules long)" : ""}`);
      at = next as Record<string, unknown>;
    }
    const last = path[path.length - 1];
    if (!(last in at)) throw new Error(`unknown rule ${k}`);
    const cur = at[last];
    if (typeof cur === "boolean") {
      if (v !== "true" && v !== "false") throw new Error(`${k} is true or false, got ${v}`);
      at[last] = v === "true";
    } else if (typeof cur === "number") at[last] = num(k, v);
    else throw new Error(`${k} isn't a number or a boolean`);
  }
  return r as unknown as CoreRules;
}
const num = (k: string, v: string) => {
  const x = Number(v);
  if (v === "" || !Number.isFinite(x)) throw new Error(`${k} is a number, got ${v}`);
  return x;
};

/** A size: `quick`, `classic`, `long` (5 bases), `longN` (N bases a side), or `AxB` (A bases of B soldiers). */
export function sizeOf(name: string): Size {
  if (name === "quick" || name === "classic" || name === "long") return { ...SIZES[name] };
  const l = /^long(\d+)$/.exec(name);
  if (l) return { ...SIZES.long, bases: +l[1] };
  const m = /^(\d+)x(\d+)$/.exec(name);
  if (!m) throw new Error(`unknown size ${name} (quick, classic, long, longN or e.g. 4x8)`);
  return { name: "custom", bases: +m[1], soldiers: +m[2] };
}

const SHAPE_OF: Record<string, Shape> = { c: "camp", p: "prism", h: "cushion", s: "square", t: "pentagon" };

/** `--kits A:B`: each side's shapes in draw order (c camp, p prism, h cushion, s square, t pentagon), or `mix` for the bot's own picks. */
export function parseKits(spec: string | undefined): [Shape[] | null, Shape[] | null] | undefined {
  if (spec === undefined) return undefined;
  const sides = spec.split(":");
  if (sides.length !== 2) throw new Error(`--kits wants A:B, got ${spec}`);
  const [a, b] = sides.map((side): Shape[] | null => {
    if (side === "mix") return null;
    if (!side) throw new Error(`empty kit in ${spec}`);
    return [...side].map((ch) => SHAPE_OF[ch] ?? (() => { throw new Error(`unknown shape ${ch} in ${spec} (c, p, h, s, t or mix)`); })());
  });
  return [a, b];
}
