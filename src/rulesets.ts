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
  motto: "Five bases, ten dots each. A kill earns another flick.",
  basesPerPlayer: 5, // canon (Dawood)
  soldiersPerBase: 10, // canon
  // canon (Burooj): a move goes as far as a shot. GUESS: a soft flick makes a 300-long line.
  shoot: { min: 300, max: 1800 },
  move: { min: 300, max: 1800 },
  moveKills: true, // canon (Burooj)
  extraTurn: "chain", // canon: a kill gives another turn. GUESS: it keeps chaining.
  transfer: { max: 5, ambush: "all" }, // canon: transfers exist. GUESS: up to 5; a cut road kills the convoy.
});

export const RULESETS: RuleSet[] = [CLASSIC];

export function ruleSet(id: string | undefined): RuleSet {
  return RULESETS.find((r) => r.id === id) ?? (id === PROTOTYPE.id ? PROTOTYPE : CLASSIC);
}
