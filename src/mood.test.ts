// Dawood's mood (src/mood.ts): how it leans on your results, and that a
// page's seed always gives the same mood and line.

import { describe, expect, it } from "vitest";
import { LEVELS } from "./bot";
import { MOOD_LINES, MOOD_WEIGHTS, MOOD_WORD, moodLine, moodWeights, results, rollMood } from "./mood";
import type { Filed, Mode } from "./record";
import { CORE, SIZES } from "./rules";

const page = (mode: Mode, winner?: 0 | 1): Filed => ({ v: 2, seed: 1, size: { ...SIZES.classic }, rules: CORE, actions: [], mode, ...(winner !== undefined && { winner }), turns: 9, at: 0 });
const bot = (winner?: 0 | 1) => page({ kind: "bot", level: 1 }, winner);

describe("Dawood's mood", () => {
  it("reads your results against him from the drawer, newest first: not the lesson, pass & play, rooms or unfinished pages", () => {
    const drawer = [bot(0), page({ kind: "pnp" }, 1), page({ kind: "bot", level: 0, lesson: true }, 0), bot(), bot(1), page({ kind: "room", code: "abc123" }, 1), bot(1)];
    expect(results(drawer)).toEqual([true, false, false]);
    expect(results([])).toEqual([]);
  });

  it("leans gentle after two losses running, sharp after two wins, even-ish otherwise", () => {
    expect(moodWeights([false, false])).toBe(MOOD_WEIGHTS.kind);
    expect(moodWeights([false, false, true, true])).toBe(MOOD_WEIGHTS.kind);
    expect(moodWeights([true, true])).toBe(MOOD_WEIGHTS.sharp);
    expect(moodWeights([true, true, false])).toBe(MOOD_WEIGHTS.sharp);
    expect(moodWeights([true, false])).toBe(MOOD_WEIGHTS.even);
    expect(moodWeights([false, true, true])).toBe(MOOD_WEIGHTS.even);
    expect(moodWeights([false])).toBe(MOOD_WEIGHTS.even);
    expect(moodWeights([])).toBe(MOOD_WEIGHTS.even);
    for (const w of Object.values(MOOD_WEIGHTS)) expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 9);
    expect(MOOD_WEIGHTS.kind[0]).toBeGreaterThan(MOOD_WEIGHTS.even[0]);
    expect(MOOD_WEIGHTS.sharp[2]).toBeGreaterThan(MOOD_WEIGHTS.even[2]);
  });

  it("the same seed and results always roll the same mood", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const res of [[], [true, true], [false, false], [true, false]]) expect(rollMood(seed * 7919, res)).toBe(rollMood(seed * 7919, res));
    }
  });

  it("over many games the rolls follow the weights", () => {
    const N = 6000;
    for (const [res, w] of [[[], MOOD_WEIGHTS.even], [[false, false], MOOD_WEIGHTS.kind], [[true, true], MOOD_WEIGHTS.sharp]] as const) {
      const n = [0, 0, 0];
      for (let seed = 0; seed < N; seed++) n[rollMood((seed * 2654435761) >>> 0, res)]++;
      n.forEach((c, i) => expect(Math.abs(c / N - w[i])).toBeLessThan(0.03));
    }
  });

  it("every level has a few lines in his voice, picked by the page's seed, and a word for the drawer", () => {
    for (const level of [0, 1, 2] as const) {
      expect(MOOD_LINES[level].length).toBeGreaterThanOrEqual(3);
      for (const l of MOOD_LINES[level]) { expect(l).toMatch(/^Dawood/); expect(l.length).toBeLessThanOrEqual(30); }
      const seen = new Set<string>();
      for (let seed = 0; seed < 400; seed++) {
        const line = moodLine(level, seed);
        expect(MOOD_LINES[level]).toContain(line);
        expect(moodLine(level, seed)).toBe(line);
        seen.add(line);
      }
      expect(seen.size).toBe(MOOD_LINES[level].length);
      expect(MOOD_WORD[level]).toBeTruthy();
    }
    expect(LEVELS).toHaveLength(3);
  });
});
