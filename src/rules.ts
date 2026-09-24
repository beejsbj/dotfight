// Every tunable rule lives here. Most are guesses from Burooj's memory of
// Daud's game (2026-06-07 transcript); the ones marked ASK DAUD are open
// questions tracked in RULES.md / BJS-128. Change them here, not in logic.

export const RULES = {
  // The page, in world units. A5-ish portrait notebook page.
  pageW: 1000,
  pageH: 1400,
  margin: 70, // left red margin line; bases can't be drawn over it

  // Setup: players alternate drawing bases.
  basesPerPlayer: 3,
  soldiersPerBase: 10,
  baseRadius: 62,
  soldierRadius: 7,
  minBaseGap: 40, // clear paper between any two bases
  minEnemyBaseGap: 180, // ASK DAUD: could you build right next to an enemy?

  // Shoot: the soldier stays put, the line runs "almost to the end of the page".
  shootMinLen: 700,
  shootMaxLen: 1500,
  // Move: shorter; the soldier ends up where the ink stops.
  moveMinLen: 60,
  moveMaxLen: 380,

  // ASK DAUD: did movement lines kill, or only shots? Transcript reads as both.
  moveKills: true,
  // ASK DAUD: could you hit your own soldiers?
  friendlyFire: false,
  // ASK DAUD: did a shot stop at the first body? Default: a line is a line.
  shotPierces: true,
  // ASK DAUD: what happened if your flick left the page? Default: soldier is lost.
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
