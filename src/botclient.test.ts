import { describe, expect, it, vi } from "vitest";
import { botAction, botArrange, botBase, botShape, BOT_THINK_MS } from "./bot";
import { botMoveLater } from "./botclient";
import { answer } from "./botask";
import { act, canPlaceBase, newGame } from "./game";
import * as game from "./game";
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


it("scores walking targets at the returned release time without changing the input page", () => {
  const s = longWar(3);
  const own = s.bases.filter((b) => b.owner === s.current);
  const route = own.flatMap((from) => own.map((to) => ({ from: from.id, to: to.id })))
    .find(({ from, to }) => game.canSend(s, from, to, 1) === null)!;
  expect(route).toBeDefined();
  act(s, { t: "send", ...route, n: 1 });
  act(s, { t: "stop" });
  s.sent = true; // only examine the flick search
  s.clock = 700;
  const before = structuredClone(s);
  const spy = vi.spyOn(game, "preview");
  try {
    const a = botAction(s, 0, 123);
    expect(a.t).toBe("flick");
    if (a.t !== "flick") return;
    expect(a.ms).toBe(700 + BOT_THINK_MS);
    expect(spy.mock.calls.length).toBeGreaterThan(10);
    const atRelease = game.marchView(s, a.ms);
    for (const [view, f] of spy.mock.calls) {
      expect(f.ms).toBe(a.ms);
      for (const id of s.convoys[0].ids) expect(view.soldiers[id]).toEqual(atRelease.soldiers[id]);
    }
    expect(s).toEqual(before);
  } finally { spy.mockRestore(); }
});
