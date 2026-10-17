// Dawood's mood (Burooj, 2026-10-17): there's no difficulty to pick. Each new
// game against Dawood-bot rolls how he plays, sloppy, steady or sharp
// (bot.ts LEVELS), leaning on how your last games against him went: lose two
// running and he's more likely to go easy on you; win two running and he's
// more likely to be sharp. The roll comes from the game's own seed, and the
// level is kept in the game's mode like any picked level was, so a page
// replays exactly and its mood is the same every time it's looked at.
//
// Pure, tested.

import type { Level } from "./bot";
import { rng } from "./geom";
import { unit } from "./life";
import type { Filed } from "./record";

/** Chances of sloppy, steady, sharp. */
export type Weights = readonly [number, number, number];
export const MOOD_WEIGHTS = {
  /** You lost your last two against him: he's more likely to go easy. */
  kind: [0.6, 0.3, 0.1],
  /** Anything else (a mixed run, or fewer than two games): even-ish, a little more often steady. */
  even: [0.3, 0.4, 0.3],
  /** You won your last two: he's more likely to be sharp. */
  sharp: [0.1, 0.3, 0.6],
} as const satisfies Record<string, Weights>;

/**
 * Your finished games against Dawood-bot, newest first (the drawer is kept
 * newest first): true for a win. The lesson doesn't count; you're always blue
 * (player 0) against him.
 */
export function results(drawer: readonly Filed[]): boolean[] {
  return drawer.filter((r) => r.mode.kind === "bot" && !r.mode.lesson && r.winner !== undefined).map((r) => r.winner === 0);
}

/** How his mood leans, by your last two results against him. */
export function moodWeights(res: readonly boolean[]): Weights {
  if (res.length >= 2 && !res[0] && !res[1]) return MOOD_WEIGHTS.kind;
  if (res.length >= 2 && res[0] && res[1]) return MOOD_WEIGHTS.sharp;
  return MOOD_WEIGHTS.even;
}

/** His mood for a game with this seed, after these results. Deterministic. */
export function rollMood(seed: number, res: readonly boolean[]): Level {
  const u = rng((seed ^ 0x6d6f6f64) >>> 0)();
  const [a, b] = moodWeights(res);
  return u < a ? 0 : u < a + b ? 1 : 2;
}

/** What's pencilled in the margin at the start of a game: a friend's aside, in the soldiers' notes' voice. */
export const MOOD_LINES: Record<Level, readonly string[]> = {
  0: ["Dawood's half asleep today", "Dawood had a late night", "Dawood's yawning. go easy?", "Dawood's not really looking"],
  1: ["Dawood's in his usual mood", "Dawood's paying attention", "Dawood's sharpening his pen", "Dawood's ready. are you?"],
  2: ["Dawood's sharp today", "Dawood means it today", "Dawood's not smiling", "Dawood's been practising"],
};

/** One of his mood's lines, picked by the page's seed (the same page always says the same). */
export const moodLine = (level: Level, seed: number) => {
  const lines = MOOD_LINES[level];
  return lines[Math.floor(unit(seed, 0x6d6f) * lines.length)];
};

/** His mood in a word, for the drawer's caption. */
export const MOOD_WORD: Record<Level, string> = { 0: "sleepy", 1: "steady", 2: "sharp" };
