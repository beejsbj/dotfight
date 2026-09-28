// Every tunable rule lives here. Change numbers here, not in logic.
//
// - RULES: the page's geometry (shared by every game, never change it: saved
//   pages replay against it), plus the June prototype's rules, which old saves
//   and drawer pages still play and replay by (src/legacy.ts).
// - CORE: the core rules (Quick battle, RULES.md). A new game copies these
//   numbers into its own state, so tuning them later never changes how an
//   older page replays.
// - SIZES: the Quick battle sizes.

export const RULES = {
  // The page, in world units. A tall pocket-notebook page, to suit a phone.
  pageW: 1000,
  pageH: 1700,
  margin: 70, // left red margin line; bases can't be drawn over it

  // Setup: players alternate drawing bases.
  basesPerPlayer: 3,
  soldiersPerBase: 10,
  baseRadius: 62,
  soldierRadius: 7,
  minBaseGap: 40, // clear paper between any two bases
  minEnemyBaseGap: 180, // ASK DAWOOD: could you build right next to an enemy?

  // Shoot: the soldier stays put, the line runs "almost to the end of the page".
  shootMinLen: 700,
  shootMaxLen: 1800,
  // Move: shorter; the soldier ends up where the ink stops.
  moveMinLen: 60,
  moveMaxLen: 380,

  // ASK DAWOOD: did movement lines kill, or only shots? Transcript reads as both.
  moveKills: true,
  // ASK DAWOOD: could you hit your own soldiers?
  friendlyFire: false,
  // ASK DAWOOD: did a shot stop at the first body? Default: a line is a line.
  shotPierces: true,
  // ASK DAWOOD: what happened if your flick left the page? Default: soldier is lost.
  offPageMoveKills: true,

  // How generous a hit is: ink line vs dot, in world units beyond both radii.
  hitSlop: 1.5,
  inkWidth: 3.2,
} as const;

// Flick feel. Not game rules — how the pen behaves in the hand.
export const FEEL = {
  maxPullPx: 150, // screen px of pull for full power
  minPullPx: 16, // below this, release cancels
  // Angular error (radians, 1 sigma) hidden from the player on release.
  jitterBase: 0.012,
  jitterPower: 0.05, // added at full power (scaled by power^2)
  // Visible wobble of the aim once you hold a charged flick: balancing a pen.
  wobbleStartMs: 450,
  wobbleGrowMs: 1600,
  wobbleMax: 0.07,
  lengthJitter: 0.07, // relative sd of flick length
  bendMax: 0.05, // flicked lines curve a little, as a fraction of length
};

export type RulesT = typeof RULES;

/**
 * The core rules' numbers (RULES.md, "Core rules"). Values marked (to test)
 * are lab guesses nobody has felt at a real table; round 3 of the rules lab
 * (docs/rules-lab/round-3.md) measured these exact numbers.
 */
export const CORE = {
  /** Bumped when a rule's *logic* changes, so old records can be told apart. */
  version: 1,
  /** Line length from the softest to the hardest flick. A lunge goes as far as a shot. */
  reach: { min: 300, max: 1800 },
  /** Snipe power loss (to test): the share of what's left of the line lost at each wall it passes, and at each soldier it crosses out. Walls cost more. */
  snipeWallLoss: 0.1,
  snipeKillLoss: 0.05,
  /** A snipe that crosses out at least this many earns another flick ("two with one bullet"). */
  snipeEarnAt: 2,
  /** Lunge shake (to test): radians (1 sd) the lunger's heading jolts at each wall he crosses, and at each soldier he crosses out. */
  lungeWallShake: 0.08,
  lungeKillShake: 0.04,
  /** Each link of a lunge chain adds this much aim error (radians, 1 sd), however soft the flick. */
  lungeLinkTremor: 0.05,
  /** Most soldiers in one send (to test). */
  sendMax: 5,
  /** How far outside its own base's wall a soldier may be arranged (to test). */
  positionReach: 20,
  /** Last stand: at this many soldiers left, that side flicks this many times a turn, with its hand error multiplied by `lastStandSteady`. */
  lastStandAt: 4,
  lastStandFlicks: 2,
  lastStandSteady: 0.6,
};

export type CoreRules = typeof CORE;

/** A Quick battle's size: bases a side and soldiers in each. */
export interface Size {
  name: "quick" | "classic" | "custom";
  bases: number;
  soldiers: number;
}

export const SIZES = {
  /** (to test) */
  quick: { name: "quick", bases: 3, soldiers: 8 },
  /** Dawood's own. */
  classic: { name: "classic", bases: 5, soldiers: 10 },
} as const satisfies Record<string, Size>;

/** What Custom lets you pick. */
export const CUSTOM = { bases: { min: 1, max: 6 }, soldiers: { min: 3, max: 12 } };
