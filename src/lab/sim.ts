// The rules lab: bot-vs-bot games, headless, and what they tell us.
// Pure and seeded: the same rules and seed always play the same game.

import { botAction, botBase, HUMAN, type Skill } from "../bot";
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
  };
  const counts: [number, number][] = []; // alive at the end of each turn
  let dragFrom = -1, dragFromActs = -1;
  let turnActs = 0, turnChanged = false;
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
        if (a.kind === "shoot") rec.shots++; else rec.moves++;
        rec.perFlick.push(o.killed.length + o.cut.reduce((n, c) => n + c.ids.length, 0) + o.wounded.length * 0.5);
        if (o.lost) rec.lostOffPage++;
        for (const e of o.events) {
          if (e.kind === "bounce") rec.bounces++;
          else if (e.kind === "split") rec.splits++;
          else if (e.kind === "stop") rec.stops++;
        }
        rec.cuts += o.cut.length;
        rec.wounds += o.wounded.length;
      } else if (a.t === "transfer") rec.transfers++;
      if (o) {
        rec.fell += o.fell?.length ?? 0;
        rec.founded += o.founded?.length ?? 0;
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
      if (turnActs > 1) rec.chainTurns++;
      rec.longestChain = Math.max(rec.longestChain, turnActs);
      turnActs = 0;
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
  chainShare: number; // share of turns with an extra action
  longestChain: number; // mean per game
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
  };
}
