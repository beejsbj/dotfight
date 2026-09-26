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
  /**
   * What its walls do to a line. Round 1: nothing, stop an enemy line, or
   * bounce an enemy line (each edge once, then it's breached). Round 2:
   * "bank" is billiards: everyone's lines, yours included, glance off it by
   * the angle they come in at, and nothing breaks.
   */
  wall: "none" | "stop" | "mirror" | "bank";
  /** Your own shot passing out through this base splits in two (round 1: only from inside; any of your shots through it). */
  prism: boolean;
  /** Radians (1 sd) of wobble a line picks up passing through this base's wall. 0 = soft walls. */
  wobble?: number;
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
  /** Can the very first turn of the game earn an extra flick? (false softens the first-move edge) */
  openingExtra: boolean;

  // --- transfers (Dawood canon: exists; the details are designed) ----------
  /** Instead of flicking, send soldiers from one of your bases to another. They arrive after the opponent's next action. */
  transfer: null | {
    /** Most soldiers one transfer can send. The base they leave keeps at least one. */
    max: number;
    /** An enemy line crossing the road while they're on it kills: nobody, one per crossing, or the whole convoy. */
    ambush: "none" | "one" | "all";
    /** Sending doesn't use up your flick: send down one road, then flick as usual (one send a turn). */
    free?: boolean;
    /**
     * Round 2: the convoy walks the road on the page, this many world units
     * each time the pen changes hands, and any line that touches a walker
     * crosses him out (`ambush` is then unused). 0 = round 1: off the page,
     * arriving after the opponent's next action.
     */
    pace?: number;
    /** Where a send may go besides your standing bases: nowhere else, your own empty rings, or any empty ring (taking it). */
    refill?: "none" | "own" | "any";
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

  // --- round 2: lunge and snipe --------------------------------------------
  /**
   * The move becomes a lunge: it goes as far as a shot and crosses out
   * enemies along its path, and the soldier ends where the ink stops.
   * null = round 1's move.
   */
  lunge: null | {
    /** Lunging into a standing enemy base (one with defenders) kills the lunger at its wall. */
    baseDeath: boolean;
  };
  /**
   * What earns another flick, by kind. When set it replaces `extraTurn`
   * (`chainCap` and `openingExtra` still apply). null = round 1's rule.
   */
  earn: null | {
    /** A shot must cross out at least this many to earn another flick (0 = never). */
    shoot: number;
    /** Each extra flick already earned this turn raises that by this many (a streak gets harder to keep). */
    rise?: number;
    /** A lunge that crosses out at least this many earns another lunge (0 = never). */
    move: number;
    /** The earned lunge must be the same soldier lunging on (false: any of yours). */
    sameMover: boolean;
    /** Each link of a lunge chain shakes the hand more: error × (1 + shake·link). */
    shake: number;
  };
  /** An empty base: struck out and gone (round 1), left as an empty ring, or a crumbled ring whose walls no longer work. */
  empty: "gone" | "ring" | "crumble";
  /**
   * Before the first flick, each side may rearrange its soldiers, one side
   * after the other. `reach` is how far outside its own base's wall a
   * soldier may stand (0 = inside only). null = no positioning.
   */
  position: null | { reach: number };

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
    /** Wet ink: only each player's newest this-many lines act as terrain (0 = every line on the page). */
    fresh: number;
    // round 2: friction and grooves, not bounces
    /** Radians (1 sd) of extra aim error a line picks up each time it crosses another line, from that point on. */
    wobble?: number;
    /** Most crossings of ink that jolt one line (0 = every one): past that, the flick's momentum carries it steady. */
    joltMax?: number;
    /** Range gained crossing one of your own lines (Dawood: friendly ink boosts you). */
    boost?: number;
    /** Range lost crossing an enemy line (Dawood: enemy ink slows you). */
    drag?: number;
    /**
     * Grooves pull like gravity. A pen running near a line and within this
     * angle (radians) of parallel to it is drawn toward it and turned along
     * it; steeper than this it just crosses (and wobbles). 0 = off.
     */
    groove?: number;
    /** How far (world units) a line's pull reaches. */
    grooveReach?: number;
    /** Strongest pull, radians of turn per unit travelled (right on a line, parallel, and slow). */
    groovePull?: number;
    /** Range a groove costs per unit ridden: your own (below 1 carries you further) and the enemy's (above 1 is shorter). */
    grooveOwn?: number;
    grooveEnemy?: number;
    /** Scribbles are cover: crossing this many lines within `scribbleSpan` of travel stops the line. 0 = off. */
    scribble?: number;
    scribbleSpan?: number;
    /** Taper: the share of what's left of a line lost at each soldier it crosses out, and at each base wall it hits. */
    taperHit?: number;
    taperWall?: number;
  };
  /** Who flicks first once the bases are drawn: whoever drew first (0) or whoever drew last (1). */
  firstFlick: 0 | 1;
  /** Angle between the two halves of a split line (radians). */
  prismSpread: number;
  /** Billiards: a line coming in at a bank wall reflects only if it glances, more than this many radians off square; straighter lines go through. */
  bankGlance: number;
  /** Most bank-wall bounces one line makes. */
  bankMax: number;
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
  openingExtra: true,
  transfer: null,
  win: "soldiers",
  capture: false,
  lastStand: null,
  lunge: null,
  earn: null,
  empty: "gone",
  position: null,
  ink: {
    friction: 0, ownBounces: 0, enemyStops: false, edgeBounces: 0, clear: 14, fresh: 0,
    wobble: 0, boost: 0, drag: 0, groove: 0, grooveReach: 24, groovePull: 0.03, grooveOwn: 1, grooveEnemy: 1, scribble: 0, scribbleSpan: 40, taperHit: 0, taperWall: 0,
  },
  firstFlick: 0,
  prismSpread: 0.2,
  bankGlance: 0.6,
  bankMax: 3,
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
    lunge: r.lunge === undefined ? p.lunge : r.lunge && { ...r.lunge },
    earn: r.earn === undefined ? p.earn : r.earn && { ...r.earn },
    position: r.position === undefined ? p.position : r.position && { ...r.position },
  });
}

/** A new rule set from a parent plus changes. */
export type Change = Omit<Partial<RuleSet>, "ink" | "shapes"> & { ink?: Partial<RuleSet["ink"]>; shapes?: Partial<Record<Shape, Partial<ShapeRule>>> };
export function variant(parent: RuleSet, change: Change & { id: string; name: string; motto: string }): RuleSet {
  const shapes = { ...parent.shapes };
  for (const k of Object.keys(change.shapes ?? {}) as Shape[]) shapes[k] = { ...parent.shapes[k], ...change.shapes![k] };
  return resolveRules({ ...parent, ...change, ink: { ...parent.ink, ...(change.ink ?? {}) }, shapes });
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
