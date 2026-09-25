// The named rule sets you can pick on the new-game screen. Each is a
// complete, plain RuleSet; see RULES.md for where every choice came from and
// docs/rules-lab/report.md for the simulations behind them.

import { PROTOTYPE, variant, type RuleSet } from "./rules";

/**
 * Dawood classic: the canon as Dawood and Burooj remember it, with every
 * unknown filled by a labelled guess (see RULES.md).
 */
export const CLASSIC: RuleSet = variant(PROTOTYPE, {
  id: "classic",
  name: "Dawood classic",
  motto: "Five bases, ten dots each. Every kill earns another flick.",
  basesPerPlayer: 5, // canon (Dawood)
  soldiersPerBase: 10, // canon
  // canon (Burooj): a move goes as far as a shot. GUESS: a soft flick makes a 300-long line.
  shoot: { min: 300, max: 1800 },
  move: { min: 300, max: 1800 },
  moveKills: true, // canon (Burooj)
  extraTurn: "chain", // canon: a kill gives another turn. GUESS: it keeps chaining.
  transfer: { max: 5, ambush: "all" }, // canon: transfers exist. GUESS: up to 5; a cut road kills the convoy.
});

// What every evolved set shares: the canon, but a hot streak stops after two
// extra flicks, and the opening turn can't earn one (the first-move edge).
const EVOLVED = variant(CLASSIC, {
  id: "evolved", name: "evolved", motto: "",
  chainCap: 2,
  openingExtra: false,
});

/** Burooj's last stand: down to four, the survivors fight harder. */
export const LAST_STAND: RuleSet = variant(EVOLVED, {
  id: "last-stand",
  name: "Last stand",
  motto: "Down to four, they lost their comrades: two flicks a turn, steadier hands.",
  lastStand: { at: 4, hits: 1, steady: 0.6, shots: 2, grow: 1 },
});

/** Shaped bases, each with a property. */
export const GEOMETRY: RuleSet = variant(EVOLVED, {
  id: "geometry",
  name: "Geometry set",
  motto: "Camps, a fort, a mirror and a prism. Walls change where the ink goes.",
  kit: ["circle", "circle", "tri", "square", "hex"],
});

/** Lines as terrain, but only while they're wet. */
export const WET_INK: RuleSet = variant(EVOLVED, {
  id: "wet-ink",
  name: "Wet ink",
  motto: "Your newest line is a mirror. Theirs is a wall.",
  ink: { ownBounces: 1, enemyStops: true, fresh: 1 },
});

/** Bases are everything. */
export const SIEGE: RuleSet = variant(EVOLVED, {
  id: "siege",
  name: "Siege",
  motto: "Take their bases, not their dots. Walk into ruins to claim them.",
  win: "bases",
  capture: true,
  transfer: { max: 5, ambush: "all", free: true },
});

export const RULESETS: RuleSet[] = [CLASSIC, LAST_STAND, GEOMETRY, WET_INK, SIEGE];

export function ruleSet(id: string | undefined): RuleSet {
  return RULESETS.find((r) => r.id === id) ?? (id === PROTOTYPE.id ? PROTOTYPE : CLASSIC);
}
