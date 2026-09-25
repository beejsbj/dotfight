// The rules of the game, as data. A RuleSet is plain JSON so a saved game
// carries its own rules and a replay needs nothing else. Every option is
// documented here; RULES.md explains where each one came from (Dawood's
// canon, Burooj's memory, or invented in the rules lab).
//
// The page and the pen's feel are not rules: they stay constants below.

export const RULES = {
  // The page, in world units. A tall pocket-notebook page, to suit a phone.
  pageW: 1000,
  pageH: 1700,
  margin: 70, // left red margin line; bases can't be drawn over it
  inkWidth: 3.2,
} as const;

export type Shape = "circle" | "tri" | "square" | "hex";

export interface ShapeRule {
  /** Soldiers jotted into a fresh base of this shape. */
  soldiers: number;
  /** Circumradius as a multiple of `baseRadius` (a triangle needs more room). */
  size: number;
  /** What its walls do to an enemy line: nothing, stop it, or bounce it. Each wall edge works once, then it's breached. */
  wall: "none" | "stop" | "mirror";
  /** Your own shot leaving this base splits in two. */
  prism: boolean;
}

export interface RuleSet {
  id: string;
  name: string;
  /** One line: what this rule set is about. */
  motto: string;

  // --- setup ---------------------------------------------------------------
  /** Bases each player draws (ignored when `kit` is set: the kit's length is used). */
  basesPerPlayer: number;
  /** Soldiers in a circle base. */
  soldiersPerBase: number;
  /** Shaped bases: the shapes each player draws, in any order. null = all circles. */
  kit: Shape[] | null;
  /** What each shape does. */
  shapes: Record<Shape, ShapeRule>;
  baseRadius: number;
  soldierRadius: number;
  /** Clear paper between two of your own bases. */
  minBaseGap: number;
  /** Clear paper between your base and an enemy's. */
  minEnemyBaseGap: number;

  // --- flicks --------------------------------------------------------------
  /** Line length range for a shot, from the softest to the hardest flick. */
  shoot: { min: number; max: number };
  /** Line length range for a move. Dawood classic: same as a shot. */
  move: { min: number; max: number };
  /** A move's line crosses out enemies like a shot's. */
  moveKills: boolean;
  /** How many soldiers one line can cross out before it stops. 0 = no limit (a line is a line). */
  pierce: number;
  /** Your lines can cross out your own soldiers. */
  friendlyFire: boolean;
  /** A move that runs off the page loses the soldier. */
  offPageMoveKills: boolean;
  /** Generosity of a hit: world units beyond the dot and half the ink width. */
  hitSlop: number;

  // --- turns ---------------------------------------------------------------
  /** A flick that crosses someone out earns another flick: never, once per turn, or every time. */
  extraTurn: "none" | "once" | "chain";
  /** With "chain": most extra flicks in one turn (0 = no limit). */
  chainCap: number;

  // --- transfers (Dawood canon: exists; the details are designed) ----------
  /** Instead of flicking, send soldiers from one of your bases to another. They arrive after the opponent's next action. */
  transfer: null | {
    /** Most soldiers one transfer can send. The base they leave keeps at least one. */
    max: number;
    /** An enemy line crossing the road while they're on it kills: nobody, one per crossing, or the whole convoy. */
    ambush: "none" | "one" | "all";
  };

  // --- bases ---------------------------------------------------------------
  /** How you win: cross out every enemy soldier, or leave the enemy no standing base. */
  win: "soldiers" | "bases";
  /** A soldier who moves into a fallen base re-founds it for his side. */
  capture: boolean;

  // --- last stand (Burooj) -------------------------------------------------
  lastStand: null | {
    /** Kicks in when a side is down to this many soldiers. */
    at: number;
    /** Hits it takes to cross out one of them (the first is a wound). */
    hits: number;
    /** Multiplier on their hand error: < 1 is steadier. The flick is still a flick. */
    steady: number;
    /** Flicks per turn for that side. */
    shots: number;
    /** Multiplier on their dot's size (bigger is easier to hit). */
    grow: number;
  };

  // --- ink as terrain ------------------------------------------------------
  ink: {
    /** Range a line loses each time it crosses dried ink it doesn't bounce off or stop at. */
    friction: number;
    /** Times a line can bounce off your own dried ink. */
    ownBounces: number;
    /** Enemy dried ink stops your line dead. */
    enemyStops: boolean;
    /** Times a line can bounce off the edge of the page instead of leaving it. */
    edgeBounces: number;
    /** Dried ink this close to where the pen rests doesn't count (your own lines all start near you). */
    clear: number;
  };
  /** Who flicks first once the bases are drawn: whoever drew first (0) or whoever drew last (1). */
  firstFlick: 0 | 1;
  /** Angle between the two halves of a split line (radians). */
  prismSpread: number;
}

export const SHAPES_DEFAULT: Record<Shape, ShapeRule> = {
  circle: { soldiers: 10, size: 1, wall: "none", prism: false },
  tri: { soldiers: 6, size: 1.35, wall: "none", prism: true },
  square: { soldiers: 8, size: 1.15, wall: "stop", prism: false },
  hex: { soldiers: 8, size: 1.1, wall: "mirror", prism: false },
};

// The rules the June 2026 prototype played. Old saves load with these, and
// any field missing from a saved rule set falls back to them.
export const PROTOTYPE: RuleSet = {
  id: "prototype",
  name: "Prototype (June)",
  motto: "What the first build guessed: 3 bases, short moves.",
  basesPerPlayer: 3,
  soldiersPerBase: 10,
  kit: null,
  shapes: SHAPES_DEFAULT,
  baseRadius: 62,
  soldierRadius: 7,
  minBaseGap: 40,
  minEnemyBaseGap: 180,
  shoot: { min: 700, max: 1800 },
  move: { min: 60, max: 380 },
  moveKills: true,
  pierce: 0,
  friendlyFire: false,
  offPageMoveKills: true,
  hitSlop: 1.5,
  extraTurn: "none",
  chainCap: 0,
  transfer: null,
  win: "soldiers",
  capture: false,
  lastStand: null,
  ink: { friction: 0, ownBounces: 0, enemyStops: false, edgeBounces: 0, clear: 14 },
  firstFlick: 0,
  prismSpread: 0.2,
};

/** Fill any missing fields with the prototype's, so older saves and partial sets still play. */
export function resolveRules(r?: Partial<RuleSet> | null): RuleSet {
  const p = PROTOTYPE;
  if (!r) return structuredClone(p);
  const shapes = { ...p.shapes };
  for (const k of Object.keys(shapes) as Shape[]) shapes[k] = { ...p.shapes[k], ...(r.shapes?.[k] ?? {}) };
  return structuredClone({
    ...p,
    ...r,
    shoot: { ...p.shoot, ...(r.shoot ?? {}) },
    move: { ...p.move, ...(r.move ?? {}) },
    ink: { ...p.ink, ...(r.ink ?? {}) },
    shapes,
    transfer: r.transfer === undefined ? p.transfer : r.transfer && { ...r.transfer },
    lastStand: r.lastStand === undefined ? p.lastStand : r.lastStand && { ...r.lastStand },
  });
}

/** A new rule set from a parent plus changes. */
export type Change = Omit<Partial<RuleSet>, "ink"> & { ink?: Partial<RuleSet["ink"]> };
export function variant(parent: RuleSet, change: Change & { id: string; name: string; motto: string }): RuleSet {
  return resolveRules({ ...parent, ...change, ink: { ...parent.ink, ...(change.ink ?? {}) } });
}

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
