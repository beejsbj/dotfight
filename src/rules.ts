// Every tunable rule lives here. Change numbers here, not in logic.
//
// - RULES: the page's geometry (shared by every game, never change it: saved
//   pages replay against it), plus the June prototype's rules, which old saves
//   and drawer pages still play and replay by (src/legacy.ts).
// - CORE: the core rules (Quick battle, RULES.md). A new game copies these
//   numbers into its own state, so tuning them later never changes how an
//   older page replays.
// - LONG: the long war's rules (RULES.md, "Long war rules"): CORE plus a
//   `long` block. Every long-war behaviour hangs off `rules.long`, so a core
//   game (where it's null) never meets any of it.
// - SIZES: the Quick battle sizes, and the long war's.

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
  maxPullPx: 240, // screen px of pull for full power (a thumb can travel this far on a 390x844 phone)
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
  /** Bumped when a rule's *logic* changes, so old records can be told apart. 2: shorter pull reach. */
  version: 2,
  /** Shared snipe/lunge reach; short lines get more of the thumb's travel. Version 1 keeps 300–1800 on its 0.9 curve. */
  reach: { min: 200, max: 1200, curve: 1.5 },
  /**
   * Snipe power loss (to test): the share of what's left of the line lost at
   * each soldier it crosses out, and at each wall *when the game has no
   * `garrison`* (games begun before garrisoned walls, which keep flat walls).
   */
  snipeWallLoss: 0.1,
  snipeKillLoss: 0.05,
  /** A snipe that crosses out at least this many earns another flick ("two with one bullet"). */
  snipeEarnAt: 2,
  /** Lunge shake (to test): radians (1 sd) the lunger's heading jolts at each soldier he crosses out, and at each wall when the game has no `garrison` (flat walls). */
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
  /**
   * Garrisoned walls (to test): a wall is as tough as the men inside it. At
   * the moment a line crosses, a base's garrison is its own living soldiers
   * inside the wall (not those just outside it or out on a road, and not the
   * man flicking), less any this same line already crossed out. With
   * `f = min(1, garrison / soldiers a base starts with) ^ curve`, a snipe loses
   * `snipeLoss[0] + (snipeLoss[1] - snipeLoss[0]) * f` of what's left of it,
   * and a lunger's heading jolts by `lungeShake` the same way (radians, 1 sd).
   * [0] is an empty ring, [1] a full base. The wall at your back is still free.
   * `null` (or missing, in a game begun before them): flat walls,
   * `snipeWallLoss` and `lungeWallShake`.
   * Round 4 of the rules lab (docs/rules-lab/round-4.md) picked a straight
   * line from nearly paper (3%, 0.02 rad) to a full base eating 85% of a
   * snipe and jolting a lunger 1 rad (1 sd).
   */
  garrison: { snipeLoss: [0.03, 0.85], lungeShake: [0.02, 1.0], curve: 1 } as Garrison | null,
  /** The long war's rules (`LONG`); null in a core game, and in every record made before the long war. */
  long: null as Long | null,
};

/** How a wall's toughness follows its garrison (see `CORE.garrison`). */
export interface Garrison {
  /** Share of a snipe's remaining length lost at a wall: [empty ring, full base]. */
  snipeLoss: [number, number];
  /** A lunger's heading jolt at a wall, radians (1 sd): [empty ring, full base]. */
  lungeShake: [number, number];
  /** Shape: 1 straight, below 1 a few men already make it tough, above 1 only a full base is. */
  curve: number;
}

export type CoreRules = typeof CORE;

/** A long war base's shape: a circle (camp), a triangle (prism), a hexagon (cushion), a square (the ruler), a pentagon (the star). */
export type Shape = "camp" | "prism" | "cushion" | "square" | "pentagon";
export const SHAPES: readonly Shape[] = ["camp", "prism", "cushion", "square", "pentagon"];

/** The long war's numbers (RULES.md, "Long war rules"). All (to test): lab guesses, for round 5 to tune. */
export interface Long {
  /** Bumped when a long-war rule's *logic* changes. */
  version: number;
  /**
   * Per shape: soldiers jotted in it (also what "full" means for its wall), and its size as a multiple of `RULES.baseRadius` (circumradius for polygons).
   * The square (6 men, size 1.0) is the ruler: your lines passing out through it are ruled from its wall on, a man standing in it from the start (dead straight; see `traceLong`). Both numbers (to test).
   * The pentagon (8 men, size 1.05) is the star: your lines passing out through it home on the nearest enemy man ahead (see `pentagon`). Both numbers (to test).
   */
  shapes: Record<Shape, { soldiers: number; size: number }>;
  /**
   * A camp's gravity well. Outside the wall and within `reach` × its radius, a
   * line turns toward the camp by `pull` × g × w × sin(off) radians a unit, where
   * g is its garrison over a full camp (at least `floor`: an empty ring's dent in
   * the paper), w falls from 1 at the wall to 0 at reach as a square, and off is
   * the angle between the line and the camp's centre. No line turns more than
   * `maxTurn` in all from wells.
   */
  well: { pull: number; reach: number; floor: number; maxTurn: number };
  /** Your snipe leaving your own prism splits: the halves turn ± `spread` radians. `ownFree`: your own prism's walls cost your lines nothing. */
  prism: { spread: number; ownFree: boolean };
  /**
   * The star (to test). A line of yours passing out through your own pentagon, by any wall, turns
   * by the exact angle to the nearest living enemy man ahead of it (not yet crossed out by this
   * line) within `cone` radians of its heading and within what's left of the line, measured from
   * the wall; nearest wins, the lower id on a tie. The line then runs on as ever (the hand's arc,
   * wells), so it can still miss. Once a pentagon a line. `cone`: radians; 0.52 is about 30°.
   */
  pentagon: { cone: number };
  /** A line coming at a cushion's wall more than `glance` radians off square banks off it; at most `maxBanks` a line. */
  cushion: { glance: number; maxBanks: number };
  /**
   * Old ink. Crossing a line steeper than `groove` radians jolts the heading by
   * `jolt` (1 sd), at most `joltMax` times a line. Within `groove` of parallel and
   * `grooveReach` units, the pen is pulled into the line's groove (at most
   * `groovePull` a unit, less the faster it's going); riding it spends
   * `grooveOwn` (your ink) or `grooveEnemy` (theirs) of the line's length a unit.
   * Ink within `clear` of where a line starts doesn't count.
   */
  ink: { jolt: number; joltMax: number; groove: number; grooveReach: number; groovePull: number; grooveOwn: number; grooveEnemy: number; clear: number };
  /** How far a convoy walks along its road at each hand-over of the pen. */
  sendPace: number;
}

/**
 * The long war: the core rules, plus shaped bases, wells, grooves and long
 * roads. Round 2 of the rules lab measured the shapes, ink and pace on its own
 * engine; the well is new.
 */
export const LONG: CoreRules = {
  ...CORE,
  long: {
    version: 1,
    shapes: { camp: { soldiers: 12, size: 1 }, prism: { soldiers: 6, size: 1.35 }, cushion: { soldiers: 8, size: 1.1 }, square: { soldiers: 6, size: 1.0 }, pentagon: { soldiers: 8, size: 1.05 } },
    well: { pull: 0.004, reach: 3.5, floor: 0.12, maxTurn: 1.2 },
    prism: { spread: 0.2, ownFree: true },
    pentagon: { cone: 0.52 },
    cushion: { glance: 0.6, maxBanks: 3 },
    ink: { jolt: 0.03, joltMax: 1, groove: 0.12, grooveReach: 12, groovePull: 0.02, grooveOwn: 0.7, grooveEnemy: 1.4, clear: 14 },
    sendPace: 150,
  },
};

/**
 * A game's rule numbers from a saved record, room or save: today's CORE fills
 * any number it lacks, except `garrison` and `long`. A record without
 * `garrison` was played before garrisoned walls and keeps its flat walls; one
 * without `long` is a core game.
 */
export const savedRules = (r: Partial<CoreRules>): CoreRules => ({ ...CORE, ...r, garrison: r.garrison ?? null, long: r.long ?? null });

/** A war's size: bases a side and soldiers in each (in the long war, each base's shape says how many). */
export interface Size {
  name: "quick" | "classic" | "custom" | "long";
  bases: number;
  soldiers: number;
}

export const SIZES = {
  /** (to test) */
  quick: { name: "quick", bases: 3, soldiers: 8 },
  /** Dawood's own. */
  classic: { name: "classic", bases: 5, soldiers: 10 },
  /** The long war: six shaped bases a side (Burooj, 2026-10-02, after round 5: five fielded fewer men than Classic). `soldiers` is a camp's. */
  long: { name: "long", bases: 6, soldiers: 12 },
} as const satisfies Record<string, Size>;

/** What Custom lets you pick. */
export const CUSTOM = { bases: { min: 1, max: 6 }, soldiers: { min: 3, max: 12 } };
