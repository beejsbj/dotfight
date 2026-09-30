import { describe, expect, it } from "vitest";
import { gameLine, orderGames } from "./games";
import type { Saved } from "./room";

const room = (code: string, seat: 0 | 1 | null, next: 0 | 1 | null, winner?: 0 | 1, names: [string, string | null] = ["Me", "Ali"]): Saved => ({
  v: 1, code, seat, secret: null, engine: "core", setup: {} as Saved["setup"], names, log: [], applied: 0, pending: [], updated: 0,
  summary: { turn: 3, next, ...(winner === undefined ? {} : { winner }) },
});

describe("the cover's games with friends", () => {
  it("names the friend from your seat", () => {
    expect(gameLine(room("a", 0, 0)).foe).toBe("Ali");
    expect(gameLine(room("a", 1, 0, undefined, ["Sana", "Me"])).foe).toBe("Sana");
    expect(gameLine(room("a", null, 0)).foe).toBe("Me v Ali");
  });
  it("says whose go it is, and how a finished game went", () => {
    expect(gameLine(room("a", 0, 0)).standing).toBe("your go");
    expect(gameLine(room("a", 0, 1)).standing).toBe("their go");
    expect(gameLine(room("a", null, 1)).standing).toBe("watching");
    expect(gameLine(room("a", 1, null, 1)).standing).toBe("you won");
    expect(gameLine(room("a", 1, null, 0)).standing).toBe("they won");
    expect(gameLine(room("a", null, null, 0)).standing).toBe("done");
  });
  it("has no standing before the first summary", () => {
    const r = room("a", 0, 0); delete r.summary;
    expect(gameLine(r)).toMatchObject({ standing: "", running: true, yours: false, turn: null });
  });
  it("puts your go first, and finished games apart", () => {
    const { running, finished } = orderGames([room("t", 0, 1), room("d", 0, null, 0), room("y", 0, 0), room("w", 1, 0)]);
    expect(running.map((l) => l.code)).toEqual(["y", "t", "w"]);
    expect(finished.map((l) => l.code)).toEqual(["d"]);
  });
});
