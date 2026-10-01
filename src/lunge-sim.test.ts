import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase } from "./bot";
import { act, canPlaceBase, illegal, newGame, trace, type GameState } from "./game";
import { CORE, SIZES, type CoreRules } from "./rules";

/** Seeded bot-v-bot wars: do they finish, and how many lunges run off the page? */
function wars(R: CoreRules, seeds: number[], level: 1 | 2) {
  let lunges = 0, off = 0, flicks = 0, finished = 0;
  for (const seed of seeds) {
    const s: GameState = newGame(SIZES.quick, seed, { no: 4, date: "26 Sep 2026" }, R);
    let k = seed;
    while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < 200) {
      const a = botAction(s, level, k++);
      if (a.t === "flick") { flicks++; if (a.kind === "lunge") { lunges++; if (trace(s, a).offPage) off++; } }
      act(s, a);
    }
    if (s.phase === "over") finished++;
  }
  return { lunges, off, flicks, finished, share: off / Math.max(1, lunges) };
}

const V1 = { ...CORE, version: 1, reach: { min: 300, max: 1800 } } as unknown as CoreRules;
const seeds = Array.from({ length: 8 }, (_, i) => 100 + i);

describe("bot v bot on the shared reach", () => {
  it("games finish, and lunges are not mostly suicides", () => {
    for (const level of [1] as const) {
      const before = wars(V1, seeds, level), after = wars(CORE, seeds, level);
      console.log(`level ${level}: v1 ${JSON.stringify(before)} | now ${JSON.stringify(after)}`);
      expect(after.finished).toBe(seeds.length);
      expect(before.finished).toBe(seeds.length);
      expect(after.lunges).toBeGreaterThan(20);
      expect(after.share).toBeLessThan(0.5);
    }
  }, 120000);
});
