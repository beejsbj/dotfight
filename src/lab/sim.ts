// The rules lab: bot-vs-bot games, headless, and what they tell us.
// Pure and seeded: the same rules and seed always play the same game.

import { botAction, botArrange, botBase, HUMAN, type Skill } from "../bot";
import { act, alive, apply, canPlaceBase, newGame, pass, stuck, transfer, type Action, type GameState, type Player } from "../game";
import { rng } from "../geom";
import type { RuleSet } from "../rules";

export interface GameRecord {
  rules: string;
  seed: number;
  /** -1: nobody won before the turn cap. */
  winner: Player | -1;
  /** Player turns (a turn is everything one player does before the pen passes). */
  turns: number;
  actions: number;
  /** Soldiers crossed out by each flick (kills, convoy kills; wounds count half). */
  perFlick: number[];
  shots: number;
  moves: number;
  transfers: number;
  /** Player turns in which the soldier count (or a wound) changed. */
  materialTurns: number;
  /** Did the side ahead at half-time lose? null when level at half-time. */
  midLeaderLost: boolean | null;
  /** Same, only when the half-time lead was at least 15% of an army. */
  bigLeadLost: boolean | null;
  /** Turns from when either side first had <= 3 soldiers to the end. */
  drag: number;
  /** The same stretch, counted in actions (flicks and sends). */
  dragActs: number;
  lostOffPage: number;
  bounces: number;
  splits: number;
  stops: number;
  cuts: number;
  wounds: number;
  fell: number;
  founded: number;
  lastStands: number;
  /** Turns with more than one action (extra turns). */
  chainTurns: number;
  longestChain: number;
  /** Soldiers each side started with. */
  army: number;
  // round 2
  /** Lengths of each lunge chain: lunges in a row by one player in one turn (1 = a lunge that earned nothing). */
  lungeChains: number[];
  /** Shots that crossed out two or more. */
  doubles: number;
  /** Grooves the pen ran in for 40+ units, and all groove contacts. */
  grooves: number;
  grooveTouches: number;
  /** Bank-wall bounces (billiards). */
  banks: number;
  /** Hand jolts from crossing ink or walls. */
  wobbles: number;
  /** Lines soaked up by scribbles. */
  absorbs: number;
  /** Lungers who died at an enemy wall. */
  crashes: number;
  /** Empty rings filled again by their own side. */
  refilled: number;
  /** Soldiers moved in the positioning phase. */
  arranged: number;
  /** Most flicks one player made in one turn (sends not counted). */
  longestFlicks: number;
  /** Shots by length band (300-600, -900, -1200, -1500, more) and how many of them crossed someone out. */
  shotBands: number[];
  shotBandHits: number[];
}

export type Agent = (s: GameState, seed: number) => Action;
export const botAgent = (sk: Skill = HUMAN): Agent => (s, seed) => botAction(s, sk, seed);

export interface Opts { maxTurns?: number; agents?: [Agent, Agent] }

export function playGame(rules: RuleSet, seed: number, opts: Opts = {}): { rec: GameRecord; s: GameState } {
  const maxTurns = opts.maxTurns ?? 400;
  const agents = opts.agents ?? [botAgent(), botAgent()];
  const s = newGame(rules, seed);
  const rand = rng(seed ^ 0x9e3779b9);
  while (s.phase === "setup") {
    const spot = botBase(s, (x, y, sh) => !canPlaceBase(s, x, y, sh), (rand() * 2 ** 32) >>> 0);
    if (!spot) throw new Error(`no room for a base (seed ${seed})`);
    apply(s, { t: "base", x: spot.x, y: spot.y, shape: spot.shape });
  }
  const army = alive(s, 0).length;
  const rec: GameRecord = {
    rules: rules.id, seed, winner: -1, turns: 0, actions: 0, perFlick: [], shots: 0, moves: 0, transfers: 0,
    materialTurns: 0, midLeaderLost: null, bigLeadLost: null, drag: 0, dragActs: 0, lostOffPage: 0, bounces: 0, splits: 0,
    stops: 0, cuts: 0, wounds: 0, fell: 0, founded: 0, lastStands: 0, chainTurns: 0, longestChain: 0, army,
    lungeChains: [], doubles: 0, grooves: 0, grooveTouches: 0, banks: 0, wobbles: 0, absorbs: 0, crashes: 0, refilled: 0, arranged: 0,
    longestFlicks: 0, shotBands: [0, 0, 0, 0, 0], shotBandHits: [0, 0, 0, 0, 0],
  };
  // positioning: each side arranges its soldiers in one go
  while (s.phase === "position") {
    for (const a of botArrange(s, (rand() * 2 ** 32) >>> 0)) {
      try { apply(s, a); if (a.t === "arrange") rec.arranged++; } catch { /* a spot another move took */ }
      if (a.t === "ready") break;
    }
  }
  const counts: [number, number][] = []; // alive at the end of each turn
  let dragFrom = -1, dragFromActs = -1;
  let turnActs = 0, turnFlicks = 0, turnChanged = false, lungeRun = 0;
  const hpSum = (p: Player) => alive(s, p).reduce((a, x) => a + (x.hp ?? 1), 0);
  let lastHp = [hpSum(0), hpSum(1)];
  while (s.phase === "play" && s.turn <= maxTurns) {
    const turn = s.turn;
    if (stuck(s)) pass(s);
    else {
      const a = agents[s.current](s, (rand() * 2 ** 32) >>> 0);
      const o = a.t === "flick" ? act(s, a) : a.t === "transfer" ? transfer(s, a.from, a.to, a.n) : (pass(s), undefined);
      rec.actions++;
      turnActs++;
      if (a.t === "flick" && o) {
        turnFlicks++;
        const took = o.killed.length + o.cut.reduce((n, c) => n + c.ids.length, 0) + o.wounded.length * 0.5;
        if (a.kind === "shoot") {
          rec.shots++;
          if (took >= 2) rec.doubles++;
          const band = Math.min(4, Math.max(0, Math.floor((a.length - 300) / 300)));
          rec.shotBands[band]++;
          if (took > 0) rec.shotBandHits[band]++;
          if (lungeRun) { rec.lungeChains.push(lungeRun); lungeRun = 0; }
        } else { rec.moves++; lungeRun++; }
        rec.perFlick.push(took);
        if (o.lost && o.crashed === undefined) rec.lostOffPage++;
        if (o.crashed !== undefined) rec.crashes++;
        for (const e of o.events) {
          if (e.kind === "bounce") { rec.bounces++; if (e.on === "bank") rec.banks++; }
          else if (e.kind === "split") rec.splits++;
          else if (e.kind === "stop") rec.stops++;
          else if (e.kind === "groove") { rec.grooveTouches++; if ((e.len ?? 0) >= 40) rec.grooves++; }
          else if (e.kind === "absorb") rec.absorbs++;
          if (e.jolt) rec.wobbles++;
        }
        rec.cuts += o.cut.length;
        rec.wounds += o.wounded.length;
      } else if (a.t === "transfer") rec.transfers++;
      if (o) {
        rec.fell += o.fell?.length ?? 0;
        rec.founded += o.founded?.length ?? 0;
        rec.refilled += o.refilled?.length ?? 0;
        rec.lastStands += o.stood?.length ?? 0;
      }
    }
    const hp = [hpSum(0), hpSum(1)];
    if (hp[0] !== lastHp[0] || hp[1] !== lastHp[1]) turnChanged = true;
    lastHp = hp;
    if (dragFrom < 0 && Math.min(alive(s, 0).length, alive(s, 1).length) <= 3) { dragFrom = s.turn; dragFromActs = rec.actions; }
    if (s.turn !== turn || s.phase !== "play") {
      counts.push([alive(s, 0).length, alive(s, 1).length]);
      if (turnChanged) rec.materialTurns++;
      if (turnFlicks > 1) rec.chainTurns++;
      rec.longestChain = Math.max(rec.longestChain, turnActs);
      rec.longestFlicks = Math.max(rec.longestFlicks, turnFlicks);
      if (lungeRun) { rec.lungeChains.push(lungeRun); lungeRun = 0; }
      turnActs = 0;
      turnFlicks = 0;
      turnChanged = false;
    }
  }
  rec.turns = Math.min(s.turn, maxTurns);
  rec.winner = s.phase === "over" ? s.winner! : -1;
  rec.drag = dragFrom < 0 ? 0 : rec.turns - dragFrom + 1;
  rec.dragActs = dragFromActs < 0 ? 0 : rec.actions - dragFromActs;
  if (rec.winner !== -1 && counts.length >= 2) {
    const mid = counts[Math.floor(counts.length / 2) - 1];
    if (mid[0] !== mid[1]) {
      const leader: Player = mid[0] > mid[1] ? 0 : 1;
      rec.midLeaderLost = leader !== rec.winner;
      if (Math.abs(mid[0] - mid[1]) >= army * 0.15) rec.bigLeadLost = leader !== rec.winner;
    }
  }
  return { rec, s };
}

// --- summary ------------------------------------------------------------------

export interface Summary {
  rules: string;
  games: number;
  turns: { mean: number; p10: number; p50: number; p90: number };
  flicksPerGame: number;
  firstWins: number; // of decided games
  draws: number;
  perFlick: { zero: number; one: number; two: number; three: number; fourPlus: number; mean: number; max: number };
  comeback: number; // midLeaderLost rate
  bigComeback: number;
  drag: { mean: number; share: number; acts: number; actShare: number };
  moveShare: number;
  transferShare: number;
  materialShare: number;
  lostOffPage: number; // per game
  bounces: number; splits: number; stops: number; cuts: number; wounds: number; fell: number; founded: number;
  lastStandRate: number;
  chainShare: number; // share of turns with an extra flick
  longestChain: number; // mean per game (actions, sends included)
  // round 2
  longestFlicks: { mean: number; p90: number; max: number }; // flicks in one player's turn, worst of the game
  lungeChain: { n: number; mean: number; one: number; two: number; three: number; fourFive: number; sixPlus: number; max: number };
  doubleRate: number; // shots that took 2+
  transfersPerGame: number;
  grooves: number; grooveTouches: number; banks: number; wobbles: number; absorbs: number; crashes: number;
  refilled: number; refillGames: number; arranged: number;
  hitByLength: number[]; // share of shots that crossed someone out, by length band
}

const q = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rate = (xs: (boolean | null)[]) => {
  const d = xs.filter((x): x is boolean => x !== null);
  return d.length ? d.filter(Boolean).length / d.length : 0;
};

export function summarise(recs: GameRecord[]): Summary {
  const flicks = recs.flatMap((r) => r.perFlick);
  const decided = recs.filter((r) => r.winner !== -1);
  const turns = recs.map((r) => r.turns);
  const allFlicks = recs.reduce((a, r) => a + r.shots + r.moves, 0);
  const allActs = recs.reduce((a, r) => a + r.actions, 0) || 1;
  return {
    rules: recs[0]?.rules ?? "?",
    games: recs.length,
    turns: { mean: mean(turns), p10: q(turns, 0.1), p50: q(turns, 0.5), p90: q(turns, 0.9) },
    flicksPerGame: allFlicks / Math.max(1, recs.length),
    firstWins: decided.length ? decided.filter((r) => r.winner === 0).length / decided.length : 0,
    draws: (recs.length - decided.length) / Math.max(1, recs.length),
    perFlick: {
      zero: flicks.filter((k) => k < 0.75).length / (flicks.length || 1),
      one: flicks.filter((k) => k >= 0.75 && k < 1.75).length / (flicks.length || 1),
      two: flicks.filter((k) => k >= 1.75 && k < 2.75).length / (flicks.length || 1),
      three: flicks.filter((k) => k >= 2.75 && k < 3.75).length / (flicks.length || 1),
      fourPlus: flicks.filter((k) => k >= 3.75).length / (flicks.length || 1),
      mean: mean(flicks),
      max: flicks.reduce((a, b) => (b > a ? b : a), 0),
    },
    comeback: rate(recs.map((r) => r.midLeaderLost)),
    bigComeback: rate(recs.map((r) => r.bigLeadLost)),
    drag: {
      mean: mean(recs.map((r) => r.drag)), share: mean(recs.map((r) => r.drag / Math.max(1, r.turns))),
      acts: mean(recs.map((r) => r.dragActs)), actShare: mean(recs.map((r) => r.dragActs / Math.max(1, r.actions))),
    },
    moveShare: recs.reduce((a, r) => a + r.moves, 0) / Math.max(1, allFlicks),
    transferShare: recs.reduce((a, r) => a + r.transfers, 0) / allActs,
    materialShare: recs.reduce((a, r) => a + r.materialTurns, 0) / Math.max(1, recs.reduce((a, r) => a + r.turns, 0)),
    lostOffPage: mean(recs.map((r) => r.lostOffPage)),
    bounces: mean(recs.map((r) => r.bounces)),
    splits: mean(recs.map((r) => r.splits)),
    stops: mean(recs.map((r) => r.stops)),
    cuts: mean(recs.map((r) => r.cuts)),
    wounds: mean(recs.map((r) => r.wounds)),
    fell: mean(recs.map((r) => r.fell)),
    founded: mean(recs.map((r) => r.founded)),
    lastStandRate: mean(recs.map((r) => (r.lastStands > 0 ? 1 : 0))),
    chainShare: recs.reduce((a, r) => a + r.chainTurns, 0) / Math.max(1, recs.reduce((a, r) => a + r.turns, 0)),
    longestChain: mean(recs.map((r) => r.longestChain)),
    ...round2(recs),
  };
}

function round2(recs: GameRecord[]) {
  const chains = recs.flatMap((r) => r.lungeChains ?? []);
  const share = (f: (k: number) => boolean) => chains.filter(f).length / Math.max(1, chains.length);
  const lf = recs.map((r) => r.longestFlicks ?? 0);
  const shots = recs.reduce((a, r) => a + r.shots, 0);
  const bands = [0, 1, 2, 3, 4].map((b) => {
    const n = recs.reduce((a, r) => a + (r.shotBands?.[b] ?? 0), 0);
    return n ? recs.reduce((a, r) => a + (r.shotBandHits?.[b] ?? 0), 0) / n : 0;
  });
  return {
    longestFlicks: { mean: mean(lf), p90: q(lf, 0.9), max: lf.reduce((a, b) => Math.max(a, b), 0) },
    lungeChain: {
      n: chains.length, mean: mean(chains), one: share((k) => k === 1), two: share((k) => k === 2), three: share((k) => k === 3),
      fourFive: share((k) => k >= 4 && k <= 5), sixPlus: share((k) => k >= 6), max: chains.reduce((a, b) => Math.max(a, b), 0),
    },
    doubleRate: recs.reduce((a, r) => a + (r.doubles ?? 0), 0) / Math.max(1, shots),
    transfersPerGame: mean(recs.map((r) => r.transfers)),
    grooves: mean(recs.map((r) => r.grooves ?? 0)),
    grooveTouches: mean(recs.map((r) => r.grooveTouches ?? 0)),
    banks: mean(recs.map((r) => r.banks ?? 0)),
    wobbles: mean(recs.map((r) => r.wobbles ?? 0)),
    absorbs: mean(recs.map((r) => r.absorbs ?? 0)),
    crashes: mean(recs.map((r) => r.crashes ?? 0)),
    refilled: mean(recs.map((r) => r.refilled ?? 0)),
    refillGames: mean(recs.map((r) => ((r.refilled ?? 0) > 0 ? 1 : 0))),
    arranged: mean(recs.map((r) => r.arranged ?? 0)),
    hitByLength: bands,
  };
}
