// Every rule set: a bot-vs-bot game replays exactly from its action log, and
// no action ever takes ink off the page.

import { describe, expect, it } from "vitest";
import { botAction, botBase } from "./bot";
import { apply, canPlaceBase, newGame, pass, replay, stuck, type GameState } from "./game";
import { rng } from "./geom";
import { EXPERIMENTS } from "./lab/variants";
import { PROTOTYPE } from "./rules";
import { RULESETS } from "./rulesets";

const QUICK = { tries: 16, keep: 3, samples: 2, hand: 1, aim: 0.02, judge: 0.05 };

function play(rules: typeof PROTOTYPE, seed: number, maxActions: number, check?: (before: GameState, after: GameState) => void): GameState {
  const s = newGame(rules, seed, { no: 3, date: "25 Sep 2026" });
  const rand = rng(seed);
  let n = 0;
  while (s.phase !== "over" && n++ < maxActions) {
    const before = check && structuredClone(s);
    if (s.phase === "setup") {
      const spot = botBase(s, (x, y, sh) => !canPlaceBase(s, x, y, sh), (rand() * 2 ** 32) >>> 0)!;
      apply(s, { t: "base", x: spot.x, y: spot.y, shape: spot.shape });
    } else if (stuck(s)) pass(s);
    else apply(s, botAction(s, QUICK, (rand() * 2 ** 32) >>> 0));
    check?.(before!, s);
  }
  return s;
}

// Every named set and every round-1 experiment; for round 2, a sample that
// between them turns on every new option (the rest are one-number tweaks).
const R2_SAMPLE = ["r2", "r2-anylunger", "r2-costly", "r2-capture", "r2-crumble", "r2-pos", "r2-wobble-dawood", "r2-scribble", "r2-taper", "r2-shapes-glance30", "r2-rise", "f-pen", "h-pen4"];
const sets = [...RULESETS, ...EXPERIMENTS.filter((e) => !RULESETS.some((r) => r.id === e.id) && (!/^(r2|f|g|h)(-|$)/.test(e.id) || R2_SAMPLE.includes(e.id)))];

describe("replay determinism", () => {
  for (const rules of sets) {
    it(`${rules.id}: the action log rebuilds the page exactly`, () => {
      const s = play(rules, 11, 60);
      const again = replay(s.rules, s.seed, s.actions, s.page);
      expect(JSON.parse(JSON.stringify(again))).toEqual(JSON.parse(JSON.stringify(s)));
    });
  }
  it("a saved game round-trips through JSON and plays on identically", () => {
    const rules = RULESETS[0];
    const s = play(rules, 5, 25);
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    const a = botAction(s, QUICK, 99), b = botAction(loaded, QUICK, 99);
    expect(b).toEqual(a);
  });
});

describe("the lines stay", () => {
  for (const rules of sets) {
    it(`${rules.id}: marks are only ever added, never changed or removed`, () => {
      play(rules, 23, 50, (before, after) => {
        expect(after.marks.length).toBeGreaterThanOrEqual(before.marks.length);
        expect(after.marks.slice(0, before.marks.length)).toEqual(before.marks);
        expect(after.bases.length).toBeGreaterThanOrEqual(before.bases.length);
      });
    });
  }
});
