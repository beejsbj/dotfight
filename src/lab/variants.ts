// Every rule set the lab has tried, named, so the report can point at them.
// The playable ones live in src/rulesets.ts; these are experiments.
// Run any of them: npm run lab -- --sets <id,id> --games 400

import { CLASSIC } from "../rulesets";
import { PROTOTYPE, variant, type Change, type RuleSet } from "../rules";

const v = (parent: RuleSet, id: string, change: Change) => variant(parent, { id, name: id, motto: id, ...change });

// Round 1: one change at a time against Dawood classic.
export const ROUND1: RuleSet[] = [
  PROTOTYPE,
  CLASSIC,
  // extra turn
  v(CLASSIC, "classic-once", { extraTurn: "once" }),
  v(CLASSIC, "classic-noextra", { extraTurn: "none" }),
  // flick length floor
  v(CLASSIC, "classic-floor700", { shoot: { min: 700, max: 1800 }, move: { min: 700, max: 1800 } }),
  v(CLASSIC, "classic-shortmove", { move: { min: 60, max: 380 } }),
  // pierce
  v(CLASSIC, "classic-pierce1", { pierce: 1 }),
  v(CLASSIC, "classic-pierce2", { pierce: 2 }),
  // transfers
  v(CLASSIC, "classic-ambush-one", { transfer: { max: 5, ambush: "one" } }),
  v(CLASSIC, "classic-ambush-none", { transfer: { max: 5, ambush: "none" } }),
  // last stand, piece by piece
  v(CLASSIC, "ls-armour", { lastStand: { at: 3, hits: 2, steady: 1, shots: 1, grow: 1 } }),
  v(CLASSIC, "ls-focus", { lastStand: { at: 3, hits: 1, steady: 0.5, shots: 1, grow: 1 } }),
  v(CLASSIC, "ls-fire", { lastStand: { at: 3, hits: 1, steady: 1, shots: 2, grow: 1 } }),
  v(CLASSIC, "ls-big", { lastStand: { at: 3, hits: 2, steady: 1, shots: 1, grow: 1.8 } }),
  v(CLASSIC, "ls-all", { lastStand: { at: 3, hits: 2, steady: 0.6, shots: 2, grow: 1 } }),
  v(CLASSIC, "ls-fire-focus-5", { lastStand: { at: 5, hits: 1, steady: 0.6, shots: 2, grow: 1 } }),
  // shaped bases
  v(CLASSIC, "shapes", { kit: ["circle", "circle", "tri", "square", "hex"] }),
  // ink as terrain
  v(CLASSIC, "ink-friction", { ink: { friction: 200 } }),
  v(CLASSIC, "ink-bounce", { ink: { ownBounces: 1 } }),
  v(CLASSIC, "ink-trench", { ink: { enemyStops: true } }),
  v(CLASSIC, "ink-both", { ink: { friction: 200, ownBounces: 1 } }),
  v(CLASSIC, "edge-bounce", { ink: { edgeBounces: 1 } }),
  // bases as the objective
  v(CLASSIC, "siege", { win: "bases", capture: true }),
  v(CLASSIC, "siege-nocapture", { win: "bases", capture: false }),
];

// Round 2: "once" won round 1 as a foundation (chain snowballs); build on it.
const ONCE = ROUND1.find((r) => r.id === "classic-once")!;
export const ROUND2: RuleSet[] = [
  v(CLASSIC, "chain3", { chainCap: 3 }),
  v(CLASSIC, "chain2", { chainCap: 2 }),
  v(ONCE, "once-redfirst", { firstFlick: 1 }),
  v(ONCE, "once-edge", { ink: { edgeBounces: 1 } }),
  v(ONCE, "once-ls-fire", { lastStand: { at: 3, hits: 1, steady: 0.6, shots: 2, grow: 1 } }),
  v(ONCE, "once-ls-fire5", { lastStand: { at: 5, hits: 1, steady: 0.6, shots: 2, grow: 1 } }),
  v(ONCE, "once-ls-all", { lastStand: { at: 3, hits: 2, steady: 0.6, shots: 2, grow: 1 } }),
  v(ONCE, "once-ls-big", { lastStand: { at: 4, hits: 2, steady: 0.6, shots: 2, grow: 1.6 } }),
  v(ONCE, "once-shapes", { kit: ["circle", "circle", "tri", "square", "hex"] }),
  v(ONCE, "once-shapes-edge", { kit: ["circle", "circle", "tri", "square", "hex"], ink: { edgeBounces: 1 } }),
  v(ONCE, "once-friction60", { ink: { friction: 60 } }),
  v(ONCE, "once-friction120", { ink: { friction: 120 } }),
  v(ONCE, "once-ownbounce-clear", { ink: { ownBounces: 1, clear: 160 } }),
  v(ONCE, "once-siege", { win: "bases", capture: true }),
  v(ONCE, "once-pierce2", { pierce: 2 }),
];

export const EXPERIMENTS: RuleSet[] = [...ROUND1, ...ROUND2];
export const byId = (id: string) => EXPERIMENTS.find((r) => r.id === id);
