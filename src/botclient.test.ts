import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase, botShape } from "./bot";
import { botMoveLater } from "./botclient";
import { answer } from "./botask";
import { act, canPlaceBase, newGame } from "./game";
import { rng } from "./geom";
import { LONG, SIZES } from "./rules";

function longWar(seed: number) {
  const s = newGame(SIZES.long, seed, undefined, LONG);
  const rand = rng(seed);
  while (s.phase === "setup") {
    const shape = botShape(rand);
    const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y, shape), (rand() * 2 ** 32) >>> 0)!;
    act(s, { t: "base", x: spot.x, y: spot.y, shape });
  }
  while (s.phase === "position") for (const a of botArrange(s, (rand() * 2 ** 32) >>> 0)) { act(s, a); if (a.t === "ready") break; }
  return s;
}

describe("Dawood-bot off the page's thread", () => {
  it("the worker's answer is the action the page would work out itself", () => {
    const s = longWar(3);
    const m = { id: 7, s: structuredClone(s), level: 1 as const, seed: 99 };
    expect(answer(m)).toEqual({ id: 7, a: botAction(s, 1, 99) });
  });

  it("with no Worker it still answers, and with the same action", async () => {
    const s = longWar(5);
    expect(await botMoveLater(s, 1, 1234)).toEqual(botAction(s, 1, 1234));
  });
});
