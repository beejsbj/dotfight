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

// --- round 2 (Burooj's new direction; docs/rules-lab/round-2.md) ----------------
// The round-2 foundation: the canon's five circles of ten, plus lunge and
// snipe (a lunge kill earns another lunge by the same soldier, shakier each
// link; a shot earns another flick only by taking two), free sends that walk
// the page, and empty bases left as rings you can refill. No streak cap.
export const ROUND2_BASE: RuleSet = variant(CLASSIC, {
  id: "r2", name: "r2", motto: "",
  lunge: { baseDeath: true },
  earn: { shoot: 2, move: 1, sameMover: true, shake: 0.35 },
  extraTurn: "chain",
  chainCap: 0,
  transfer: { max: 5, ambush: "all", free: true, pace: 150, refill: "own" },
  empty: "ring",
});

/**
 * Lunge and snipe on the classic page, with what the lab added to keep it
 * fair and short (docs/rules-lab/round-2.md): each further snipe in a turn
 * needs one more kill, each lunge link adds a tremor however soft the
 * flick, round 1's last stand, and soldiers arranged before the first flick.
 */
export const LUNGE_SNIPE: RuleSet = variant(ROUND2_BASE, {
  id: "lunge-snipe",
  name: "Lunge & snipe",
  motto: "Lunge through them and go again, shakier. Snipe two with one line and go again.",
  earn: { shoot: 2, move: 1, sameMover: true, shake: 0.35, rise: 1, tremor: 0.05 },
  lastStand: { at: 4, hits: 1, steady: 0.6, shots: 2, grow: 1 },
  position: { reach: 20 },
});

/** Ink as a real pen on paper: jolts, grooves, scribbles, tapering lines. */
export const PEN_PHYSICS: RuleSet = variant(LUNGE_SNIPE, {
  id: "pen-physics",
  name: "Pen physics",
  motto: "Crossing ink jolts your hand; running along it pulls you into its groove.",
  // the lightest of each that still reads on the page: every ink effect makes games
  // longer (ink piles up in front of the targets), so scribble cover and taper are
  // left out and a line jolts at most once (docs/rules-lab/round-2.md)
  ink: { wobble: 0.03, joltMax: 1, groove: 0.12, grooveReach: 12, groovePull: 0.02, grooveOwn: 0.7, grooveEnemy: 1.4 },
  shapes: { circle: { wobble: 0.03 } },
});

/** Camps, a prism and cushions: bank shots and split lines. */
export const BILLIARDS: RuleSet = variant(LUNGE_SNIPE, {
  id: "billiards",
  name: "Billiards",
  motto: "Bank shots off hexagons (yours too), split lines through your triangle.",
  kit: ["circle", "circle", "tri", "hex", "hex"],
  soldiersPerBase: 12,
  shapes: { circle: { wobble: 0 }, tri: { soldiers: 6, prism: true, wobble: 0.04 }, hex: { soldiers: 8, wall: "bank", prism: false, wobble: 0.04 } },
});

export const ROUND2_SETS: RuleSet[] = [LUNGE_SNIPE, PEN_PHYSICS, BILLIARDS];
export const RULESETS: RuleSet[] = [...ROUND2_SETS, CLASSIC, LAST_STAND, GEOMETRY, WET_INK, SIEGE];

export function ruleSet(id: string | undefined): RuleSet {
  return RULESETS.find((r) => r.id === id) ?? (id === PROTOTYPE.id ? PROTOTYPE : CLASSIC);
}
