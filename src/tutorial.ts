// The lesson (BJS-462): a first-time player learns the core rules by playing
// a short, scripted battle against a gentle Dawood-bot, with pencil notes
// in the margin showing only what's needed next. The rulebook is the
// reference; this is the teacher.
//
// The lesson is data: one fixed page (seed, camps, where every man stands),
// and a list of steps. Each step has a pencil note (and rings or an arrow
// pointing at what it means), a check on the game state or the last flick's
// outcome that says it's been done, and what Dawood-bot does meanwhile. A
// lesson game is a normal core game on the normal engine: every move is a
// legal action, so it saves, files and replays like any page. The page is
// laid out so each asked-for shot is there to be made (src/tutorial.test.ts
// measures how often a real hand makes it), and the bot's replies are scripted
// and seeded, so the lesson can't go badly wrong, while the flick itself
// stays real: nothing is on rails.
//
// Pure: no DOM. main.ts runs it (startLesson, lessonTick); lesson-layer.ts draws it.

import { act, canArrange, dist, garrison, inside, isRing, maxReach, newGame, preview, reachOf, type Action, type Base, type Flick, type GameState, type Outcome, type Player, type Pt } from "./game";
import { gauss, rng } from "./geom";
import type { Mode } from "./record";
import { CORE, RULES, type Size } from "./rules";

// --- the page ----------------------------------------------------------------------

/** 3 camps of 4 a side: short enough to finish in a few minutes, enough men for every lesson. */
export const LESSON_SIZE: Size = { name: "custom", bases: 3, soldiers: 4 };
export const LESSON_SEED = 462;

/** Camp centres, in the order they're drawn (blue, red, blue, red, blue, red). */
export const CAMPS: { x: number; y: number; owner: Player; name: string }[] = [
  { x: 250, y: 1420, owner: 0, name: "B1" },
  { x: 260, y: 330, owner: 1, name: "R1" }, // full: the wall lesson
  { x: 700, y: 1480, owner: 0, name: "B2" },
  { x: 740, y: 380, owner: 1, name: "R2" }, // two in, two out on the paper
  { x: 520, y: 1120, owner: 0, name: "B3" }, // blue's forward camp: most lessons are shot from here
  { x: 520, y: 760, owner: 1, name: "R3" }, // all four stand outside: an empty ring from the start
];
const B3 = 4, R2 = 3, R3 = 5;

/** A point `r` from a camp's centre at angle `a` (radians, y down the page). */
const around = (b: Pt, r: number, a: number): Pt => ({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r });
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Where the men the lessons lean on stand (the rest are jotted by the seed),
 * chosen on the page as drawn, so none lands on a jotted man. Everyone stands
 * within `positionReach` of his own wall, as the rules allow: a man outside at
 * 77 from the centre is 15 past a 62 wall.
 */
export function arrangements(s: GameState): { soldier: number; x: number; y: number }[] {
  const r3 = CAMPS[R3], r2 = CAMPS[R2], b3 = CAMPS[B3];
  const out: { soldier: number; x: number; y: number }[] = [];
  const stood = (id: number) => { const a = out.find((o) => o.soldier === id); return a ? { x: a.x, y: a.y } : { x: s.soldiers[id].x, y: s.soldiers[id].y }; };
  /** The first of the spots this man can stand on, clear of everyone placed so far. */
  const put = (id: number, spots: Pt[]) => {
    const trial: GameState = { ...s, phase: "position", current: s.soldiers[id].owner, soldiers: s.soldiers.map((x) => ({ ...x, ...stood(x.id) })) };
    const p = spots.find((q) => !canArrange(trial, id, q.x, q.y));
    if (!p) throw new Error(`nowhere for ${id} to stand`);
    out.push({ soldier: id, ...p });
    return p;
  };
  // B3's shooter, a little up and to the right of its centre
  const shooter = put(16, [10, 40, 25, -5, -30].map((dx) => ({ x: b3.x + dx, y: b3.y - 25 })));
  // R3's four stand outside the ring on blue's side. Two of them are on a chord
  // that clears the wall, in a row from the shooter: "two with one line".
  const off = 71, far = 77; // the chord passes 71 from R3's centre (the wall is 62); the men sit 77 out
  const L = dist(shooter, r3);
  const toC = Math.atan2(r3.y - shooter.y, r3.x - shooter.x);
  const h = toC + Math.asin(off / L); // the chord's heading from the shooter, passing to the right of the ring (the other two stand lower left)
  const ux = Math.cos(h), uy = Math.sin(h);
  const along = Math.sqrt(far * far - off * off);
  const mid = Math.sqrt(L * L - off * off); // along the chord from the shooter to its foot
  put(20, [{ x: shooter.x + ux * (mid + along), y: shooter.y + uy * (mid + along) }]);
  put(21, [{ x: shooter.x + ux * (mid - along), y: shooter.y + uy * (mid - along) }]);
  put(22, [112, 118, 106].map((a) => around(r3, far, rad(a))));
  put(23, [150, 156, 144].map((a) => around(r3, far, rad(a))));
  // R2: two step out onto the paper on blue's side (free to shoot); two stay in
  put(12, [104, 110, 98].map((a) => around(r2, far, rad(a))));
  put(13, [136, 142, 130].map((a) => around(r2, far, rad(a))));
  return out;
}

/** The lesson's setup: the camps drawn, the men arranged, both sides ready. Applied to `s` as it goes. */
export function setupActions(s = newGame(LESSON_SIZE, LESSON_SEED, undefined, CORE)): Action[] {
  const out: Action[] = [];
  const go = (a: Action) => { act(s, a); out.push(a); };
  for (const c of CAMPS) go({ t: "base", x: c.x, y: c.y });
  const arr = arrangements(s);
  // blue arranges first, then red
  for (const p of [0, 1] as Player[]) {
    for (const a of arr) if (s.soldiers[a.soldier].owner === p) go({ t: "arrange", ...a });
    go({ t: "ready" });
  }
  return out;
}

/** A fresh lesson page, ready for the first flick. */
export function lessonGame(page?: GameState["page"]): GameState {
  const s = newGame(LESSON_SIZE, LESSON_SEED, page, CORE);
  setupActions(s);
  return s;
}

/** A lesson is a bot game with `lesson` set (record.ts keeps it on a saved page). */
export const isLesson = (m: Mode) => m.kind === "bot" && !!m.lesson;
export const LESSON_MODE: Mode = { kind: "bot", level: 0, lesson: true };

// --- the steps -----------------------------------------------------------------------

/** The last thing that happened on the page: a flick and what it did, or another action. */
export type Last = { who: Player; f: Flick; o: Outcome } | { who: Player; a: Action };

/** Pencil on the page: notes (lines of text, centred at `at`), loose rings, and arrows. */
export interface Marks {
  /** `rot`: turned on the page (radians; -π/2 reads up the margin). `scale`: smaller or bigger than a lesson's note. `plain`: the heading isn't ruled off. */
  notes: { at: Pt; lines: string[]; rot?: number; scale?: number; plain?: boolean }[];
  rings: { at: Pt; r: number }[];
  arrows: { from: Pt; to: Pt }[];
}

export interface Step {
  id: string;
  /** The note's heading, pencilled on the page and ruled off ("lesson 4 of 6: the lunge"). */
  title: string;
  /** What's pencilled on the page for it (from where everyone stands now). */
  marks: (s: GameState) => Marks;
  /** Done? Judged on the state, and on the last thing that happened. */
  done: (s: GameState, last: Last | null) => boolean;
  /** What Dawood-bot does on his go during this step (default: a gentle snipe). */
  foe?: (s: GameState, rand: () => number) => Action | null;
}

const isFlick = (l: Last | null, who: Player, kind?: Flick["kind"]): l is { who: Player; f: Flick; o: Outcome } =>
  !!l && "f" in l && l.who === who && (!kind || l.f.kind === kind);

/** Enemy men standing on the open paper: outside every one of their camps' walls. */
export const outsideMen = (s: GameState, foe: Player) => s.soldiers.filter((x) => x.alive && x.owner === foe && !s.bases.some((b) => b.owner === foe && inside(b, x)));

/** The costliest wall this line crossed before its first kill (the wall at the shooter's back is free). */
function wallBeforeKill(o: Outcome) {
  const kill = o.events.find((e) => e.kind === "kill");
  let worst = 0;
  for (const e of o.events) {
    if (e.kind !== "wall" || e.free) continue;
    if (kill && e.d > kill.d) break;
    worst = Math.max(worst, e.cost ?? 0);
  }
  return worst;
}

/** A manned enemy wall: costs a snipe this much or more. */
const MANNED = 0.4;

/**
 * A snipe from one of `me`'s men that would cross out two or more, found with
 * the engine itself (steady hand): the shortest such line. Null if there's no row.
 */
export function findRow(s: GameState, me: Player): { soldier: number; angle: number; length: number; targets: number[] } | null {
  const mine = s.soldiers.filter((x) => x.alive && x.owner === me && x.convoy === undefined);
  const foes = s.soldiers.filter((x) => x.alive && x.owner !== me);
  let best: { soldier: number; angle: number; length: number; targets: number[] } | null = null;
  for (const m of mine) {
    for (const t of foes) {
      const angle = Math.atan2(t.y - m.y, t.x - m.x);
      const d = dist(m, t);
      // just past the second man, if one is there: the line gets its 5% at each kill and whatever the walls take
      for (const length of [d + 90, d + 160, d + 260]) {
        if (length > maxReach(s.rules)) continue;
        const o = preview(s, { soldier: m.id, kind: "snipe", angle, length, bend: 0, wob: 0 });
        if (o.killed.length < 2) continue;
        if (wallBeforeKill(o) >= MANNED) continue;
        if (!best || length < best.length) best = { soldier: m.id, angle, length, targets: o.killed };
        break;
      }
    }
  }
  return best;
}

/** A lunge by one of `me`'s men that crosses someone out and lands on open paper, alive: the shortest. */
export function findLunge(s: GameState, me: Player): { soldier: number; angle: number; length: number; target: number } | null {
  const mine = s.soldiers.filter((x) => x.alive && x.owner === me && x.convoy === undefined);
  const foes = outsideMen(s, me === 0 ? 1 : 0);
  let best: { soldier: number; angle: number; length: number; target: number } | null = null;
  for (const m of mine) {
    for (const t of foes) {
      const angle = Math.atan2(t.y - m.y, t.x - m.x);
      const length = dist(m, t) + 70;
      if (best && length >= best.length) continue;
      const o = preview(s, { soldier: m.id, kind: "lunge", angle, length, bend: 0, wob: 0 });
      if (o.lost || !o.killed.includes(t.id)) continue;
      best = { soldier: m.id, angle, length, target: t.id };
    }
  }
  return best;
}

/** The enemy's fullest camp: the wall lesson's target. */
function fullest(s: GameState, foe: Player): Base | undefined {
  return s.bases.filter((b) => b.owner === foe).sort((a, b) => garrison(s, b).length - garrison(s, a).length)[0];
}

/** An enemy ring with nobody inside, nearest `from`. */
export function emptyRing(s: GameState, foe: Player, from: Pt): Base | undefined {
  return s.bases.filter((b) => b.owner === foe && isRing(s, b)).sort((a, b) => dist(a, from) - dist(b, from))[0];
}

/** The player's man nearest a point (the one a hint points from), but no nearer than the shortest flick: a line is never shorter than `reach.min`. */
export function nearestMan(s: GameState, me: Player, to: Pt) {
  const mine = s.soldiers.filter((x) => x.alive && x.owner === me && x.convoy === undefined).sort((a, b) => dist(a, to) - dist(b, to));
  return mine.find((x) => dist(x, to) >= reachOf(s.rules, 0) + 30) ?? mine[0];
}

const ring = (p: Pt, r = RULES.soldierRadius + 12) => ({ at: p, r });
/** Where a note sits: the clear paper under blue's camps, or beside what it's about. */
/**
 * Where the note sits: the heading's baseline in the clear band of paper
 * between red's back camps and R3's men (y 470 to 690 on this page), across
 * the middle, where every lesson's shot is near. A note is a heading and at
 * most two short lines, a friend writing in the margin.
 */
const BAND = { x: 535, y: 532 };
const none: Marks = { notes: [], rings: [], arrows: [] };

export const STEPS: Step[] = [
  {
    id: "flick",
    title: "lesson 1 of 6: the flick",
    marks: () => ({ ...none, notes: [{ at: BAND, lines: ["tap one of yours, pull back, let go.", "soft is sure, hard is wild."] }] }),
    done: (_s, last) => isFlick(last, 0),
  },
  {
    id: "snipe",
    title: "lesson 2 of 6: the snipe",
    marks: (s) => {
      const b3 = s.bases[B3];
      const men = outsideMen(s, 1).sort((a, b) => dist(a, b3) - dist(b, b3)).slice(0, 2);
      return { ...none, notes: [{ at: BAND, lines: ["he stays put; the ink crosses", "out whoever it meets. get one."] }], rings: men.map((m) => ring(m)) };
    },
    done: (_s, last) => isFlick(last, 0, "snipe") && last.o.killed.length >= 1,
  },
  {
    id: "two",
    title: "lesson 2 of 6: two in a row",
    marks: (s) => {
      const row = findRow(s, 0);
      if (!row) return { ...none, notes: [{ at: BAND, lines: ["two with one line: flick again.", "look for two of theirs in a row."] }] };
      const me = s.soldiers[row.soldier];
      const ts = row.targets.map((id) => s.soldiers[id]);
      const far = ts.sort((a, b) => dist(b, me) - dist(a, me))[0];
      return {
        notes: [{ at: BAND, lines: ["two with one line: flick again.", "these two are in a row from him."] }],
        rings: [ring(me, RULES.soldierRadius + 14), ...ts.map((t) => ring(t))],
        arrows: [{ from: { x: me.x + (far.x - me.x) * 0.18, y: me.y + (far.y - me.y) * 0.18 }, to: { x: me.x + (far.x - me.x) * 0.72, y: me.y + (far.y - me.y) * 0.72 } }],
      };
    },
    done: (_s, last) => isFlick(last, 0, "snipe") && last.o.killed.length >= 2,
  },
  {
    id: "wall",
    title: "lesson 3 of 6: walls",
    marks: (s) => {
      const full = fullest(s, 1);
      if (!full || garrison(s, full).length < 2) return { ...none, notes: [{ at: BAND, lines: ["a full camp's wall eats a shot;", "a thinned one is nearly paper."] }] };
      const me = nearestMan(s, 0, full);
      return {
        notes: [{ at: BAND, lines: ["a full camp's wall eats a shot.", "try one into their full camp."] }],
        rings: [{ at: full, r: full.r + 16 }],
        arrows: me ? [{ from: { x: me.x + (full.x - me.x) * 0.15, y: me.y + (full.y - me.y) * 0.15 }, to: { x: me.x + (full.x - me.x) * 0.8, y: me.y + (full.y - me.y) * 0.8 } }] : [],
      };
    },
    done: (s, last) => (isFlick(last, 0, "snipe") && last.o.events.some((e) => e.kind === "wall" && !e.free && (e.cost ?? 0) >= MANNED)) || !fullest(s, 1) || garrison(s, fullest(s, 1)!).length < 2,
  },
  {
    id: "open",
    title: "lesson 3 of 6: the open",
    marks: (s) => ({
      ...none,
      notes: [{ at: BAND, lines: ["see? it fell short. men outside", "a wall are free. get one."] }],
      rings: outsideMen(s, 1).map((m) => ring(m)),
    }),
    done: (s, last) => (isFlick(last, 0, "snipe") && last.o.killed.length >= 1 && wallBeforeKill(last.o) < MANNED) || !outsideMen(s, 1).length,
  },
  {
    id: "lunge",
    title: "lesson 4 of 6: the lunge",
    marks: (s) => {
      const l = findLunge(s, 0);
      const t = l && s.soldiers[l.target];
      return {
        notes: [{ at: BAND, lines: ["tap lunge: he runs his ink and", "stands where it stops. land clear."] }],
        rings: t ? [ring(t)] : outsideMen(s, 1).map((m) => ring(m)),
        arrows: [],
      };
    },
    done: (_s, last) => isFlick(last, 0, "lunge") && last.o.killed.length >= 1 && !last.o.lost,
  },
  {
    id: "shot",
    title: "lesson 4 of 6: landing",
    marks: () => ({ ...none, notes: [{ at: BAND, lines: ["land among a camp's men and", "they shoot you. watch his man."] }] }),
    done: (_s, last) => isFlick(last, 1),
    foe: (s, rand) => crashLunge(s, rand),
  },
  {
    id: "ring",
    title: "lesson 4 of 6: empty rings",
    marks: (s) => {
      const b3 = s.bases[B3];
      const r = emptyRing(s, 1, b3);
      if (!r) return { ...none, notes: [{ at: BAND, lines: ["an empty ring is safe to land in,", "and a send can man it again."] }] };
      const me = nearestMan(s, 0, r);
      return {
        notes: [{ at: BAND, lines: ["an empty ring is safe to land in.", "lunge into theirs, stop inside."] }],
        rings: [{ at: r, r: r.r + 16 }],
        arrows: me ? [{ from: { x: me.x + (r.x - me.x) * 0.2, y: me.y + (r.y - me.y) * 0.2 }, to: { x: r.x + (me.x - r.x) * 0.15, y: r.y + (me.y - r.y) * 0.15 } }] : [],
      };
    },
    done: (s, last) => {
      if (!isFlick(last, 0, "lunge") || last.o.lost) return false;
      const end = last.o.movedTo;
      return !!end && (s.bases.some((b) => b.owner === 1 && dist(b, end) <= b.r) || !emptyRing(s, 1, end));
    },
  },
  {
    id: "send",
    title: "lesson 5 of 6: sends",
    marks: () => ({ ...none, notes: [{ at: BAND, lines: ["free, before your flick: 'send men',", "drag camp to camp, pick how many."] }] }),
    done: (_s, last) => !!last && "a" in last && last.who === 0 && last.a.t === "send",
  },
  {
    id: "road",
    title: "lesson 5 of 6: the road",
    marks: () => ({ ...none, notes: [{ at: BAND, lines: ["now flick. they walk his turn in", "the open: a target. then they're in."] }] }),
    done: (s) => s.convoys.some((c) => c.owner === 0 && (c.state === "arrived" || c.state === "cut")),
    foe: (s, rand) => roadShot(s, rand) ?? gentleSnipe(s, rand),
  },
  {
    id: "stand",
    title: "lesson 6 of 6: the last four",
    marks: (s) => {
      const theirs = s.soldiers.filter((x) => x.alive && x.owner === 1).length;
      const cut = s.convoys.some((c) => c.owner === 0 && c.state === "cut");
      const road = cut ? "he caught some." : "they made it.";
      return {
        ...none,
        notes: [{ at: BAND, lines: s.stand[1] ? ["their last four flick twice, steadier.", "catch them in the open. finish them."] : s.stand[0] ? ["your last four flick twice, steadier.", `${theirs} of theirs left.`] : [`${road} now they come out:`, `catch them in the open. ${theirs} left.`] }],
      };
    },
    done: (s) => s.phase === "over",
    foe: (s, rand) => sortie(s, rand) ?? gentleSnipe(s, rand),
  },
];

export const stepIndex = (id: string) => STEPS.findIndex((st) => st.id === id);

// --- Dawood-bot, held gentle ---------------------------------------------------------

/** A seeded source for the bot's go: the page and the move count, so a replayed lesson repeats. */
export const foeSeed = (s: GameState) => (s.seed * 2654435761 + s.actions.length * 40503) >>> 0;

/**
 * His usual go: a snipe at the blue man nearest one of his, with a sloppy
 * hand (about 1 in 3 lands), never a lunge or a send, so the page stays as the
 * lesson laid it out. He stops if he owes a lunge.
 */
export function gentleSnipe(s: GameState, rand: () => number): Action {
  if (s.chain) return { t: "stop" };
  const mine = s.soldiers.filter((x) => x.alive && x.owner === 1 && x.convoy === undefined);
  const theirs = s.soldiers.filter((x) => x.alive && x.owner === 0);
  if (!mine.length || !theirs.length) return { t: "stop" };
  let best: { m: typeof mine[number]; t: typeof theirs[number]; d: number } | null = null;
  for (const m of mine) for (const t of theirs) { const d = dist(m, t); if (!best || d < best.d) best = { m, t, d }; }
  const { m, t, d } = best!;
  const angle = Math.atan2(t.y - m.y, t.x - m.x) + gauss(rand) * 0.06;
  const length = Math.min(maxReach(s.rules), Math.max(reachOf(s.rules, 0), d + 120 + gauss(rand) * 40));
  return { t: "flick", soldier: m.id, kind: "snipe", angle, length, bend: (rand() * 2 - 1) * 0.02, wob: (rand() * 2 ** 32) >>> 0 };
}

/**
 * The demonstration: one of his men lunges into one of blue's manned camps
 * and is shot where he lands. Searched with the engine (the jolt at the wall
 * is seeded by `wob`, so a few seeds are tried); null if none of his can reach.
 */
export function crashLunge(s: GameState, rand: () => number): Action | null {
  if (s.chain) return { t: "stop" };
  const mine = s.soldiers.filter((x) => x.alive && x.owner === 1 && x.convoy === undefined);
  const camps = s.bases.filter((b) => b.owner === 0 && garrison(s, b).length > 0);
  const tries: { m: typeof mine[number]; b: Base; d: number }[] = [];
  for (const m of mine) for (const b of camps) tries.push({ m, b, d: dist(m, b) });
  tries.sort((a, b) => a.d - b.d);
  for (const { m, b, d } of tries) {
    if (d > maxReach(s.rules)) continue;
    const angle = Math.atan2(b.y - m.y, b.x - m.x);
    for (let k = 0; k < 40; k++) {
      const f: Flick = { soldier: m.id, kind: "lunge", angle, length: d, bend: 0, wob: (rand() * 2 ** 32) >>> 0 };
      if (preview(s, f).crashed === b.id) return { t: "flick", ...f };
    }
  }
  return null;
}

/** Blue's convoy on the road: a snipe through the column from the man with the shortest line. Null if nothing's out. */
export function roadShot(s: GameState, rand: () => number): Action | null {
  if (s.chain) return { t: "stop" };
  const walkers = s.soldiers.filter((x) => x.alive && x.owner === 0 && x.convoy !== undefined && s.convoys[x.convoy]?.state === "road");
  if (!walkers.length) return null;
  const mid = { x: walkers.reduce((a, w) => a + w.x, 0) / walkers.length, y: walkers.reduce((a, w) => a + w.y, 0) / walkers.length };
  const mine = s.soldiers.filter((x) => x.alive && x.owner === 1 && x.convoy === undefined).sort((a, b) => dist(a, mid) - dist(b, mid));
  const m = mine[0];
  if (!m) return null;
  const angle = Math.atan2(mid.y - m.y, mid.x - m.x) + gauss(rand) * 0.02;
  return { t: "flick", soldier: m.id, kind: "snipe", angle, length: Math.min(maxReach(s.rules), dist(m, mid) + 200), bend: 0, wob: (rand() * 2 ** 32) >>> 0 };
}

/**
 * The end of the lesson: his men come out. One of his men in a camp lunges
 * at the nearest of blue's, landing on the open paper short of him (a shot
 * man, or one who lands among blue's, is his own lesson). Out in the open
 * the sure short flicks the lesson taught finish them; a war that ended by
 * shooting full camps down with wild hard flicks would run far too long.
 * Null once nobody's left inside: he snipes from where he stands.
 */
export function sortie(s: GameState, rand: () => number): Action | null {
  if (s.chain) return { t: "stop" };
  const inCamp = s.soldiers.filter((x) => x.alive && x.owner === 1 && x.convoy === undefined && s.bases.some((b) => b.owner === 1 && inside(b, x)));
  const theirs = s.soldiers.filter((x) => x.alive && x.owner === 0);
  if (!inCamp.length || !theirs.length) return null;
  let best: { m: typeof inCamp[number]; t: typeof theirs[number]; d: number } | null = null;
  for (const m of inCamp) for (const t of theirs) { const d = dist(m, t); if (!best || d < best.d) best = { m, t, d }; }
  const { m, t, d } = best!;
  const angle = Math.atan2(t.y - m.y, t.x - m.x) + gauss(rand) * 0.05;
  const length = Math.max(reachOf(s.rules, 0), Math.min(460, d * 0.5) + gauss(rand) * 25);
  return { t: "flick", soldier: m.id, kind: "lunge", angle, length, bend: (rand() * 2 - 1) * 0.02, wob: (rand() * 2 ** 32) >>> 0 };
}

/** Dawood-bot's go during a step. */
export function foeMove(s: GameState, step: number, seed = foeSeed(s)): Action {
  const rand = rng(seed);
  const st = STEPS[Math.max(0, Math.min(STEPS.length - 1, step))];
  return st.foe?.(s, rand) ?? gentleSnipe(s, rand);
}

// --- progress ---------------------------------------------------------------------------

/** Where a lesson stands: the step on now, and how many of the player's flicks it has taken. */
export interface Run {
  step: number;
  tries: number;
  /** The move count the last check ran on, so a thing is judged once. */
  seen: number;
}

/** Steps done so far, by the taught keys (`pft:taught:lesson:<id>`). */
export function firstUndone(taught: (key: string) => boolean): number {
  const i = STEPS.findIndex((st) => !taught(`lesson:${st.id}`));
  return i < 0 ? STEPS.length - 1 : i;
}

/**
 * Judge the step (and any after it the same move satisfied) on what just
 * happened. Returns the steps completed, in order; `run` moves on to the first
 * still undone. A move is judged once (by `run.seen`).
 */
export function advance(run: Run, s: GameState, last: Last | null): string[] {
  if (run.seen === s.actions.length) return [];
  run.seen = s.actions.length;
  if (last && "f" in last && last.who === 0) run.tries++;
  const done: string[] = [];
  // the same move may satisfy the next step too (one snipe that takes two is "snipe" and "two")
  while (run.step < STEPS.length && STEPS[run.step].done(s, last)) {
    done.push(STEPS[run.step].id);
    run.step++;
    run.tries = 0;
  }
  return done;
}

/** The step on now (the last one stays on once the lesson is through). */
export const current = (run: Run) => STEPS[Math.min(run.step, STEPS.length - 1)];
/** Every step done: the battle is over and the last note has been judged. */
export const finished = (run: Run) => run.step >= STEPS.length;
/** After three misses a step may be skipped, unless it's the last (there is nothing after it to skip to). */
export const canSkip = (run: Run) => run.tries >= 3 && run.step < STEPS.length - 1;
/** Give up on the step (it's not learned): the next one comes on. */
export function skipStep(run: Run) { if (run.step < STEPS.length - 1) { run.step++; run.tries = 0; } }
