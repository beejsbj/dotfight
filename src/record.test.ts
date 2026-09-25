import { describe, expect, it } from "vitest";
import { botBase, botFlick } from "./bot";
import { canPlaceBase, newGame, type GameState } from "./game";
import { inkTime, totalHold, wallTime } from "./inkclock";
import { addToDrawer, apply, blank, file, readDrawer, readSave, steps, unfile } from "./record";

// A whole bot-vs-bot war, seeded, so the test is the same every run.
function war(seed: number, maxTurns = 400): GameState {
  const s = newGame(seed, { no: 3, date: "25 Sep 2026" });
  let k = seed;
  while (s.phase === "setup") {
    const spot = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!;
    apply(s, { t: "base", x: spot.x, y: spot.y });
  }
  while (s.phase === "play" && s.turn < maxTurns) apply(s, { t: "flick", f: botFlick(s, 1, k++) });
  return s;
}

describe("record", () => {
  it("replaying a filed page redraws every mark exactly", () => {
    const s = war(7);
    expect(s.marks.length).toBeGreaterThan(20);
    const again = unfile(JSON.parse(JSON.stringify(file(s, { kind: "bot", level: 1 }))));
    expect(again).toEqual(s);
  });

  it("steps replay one at a time to the same page", () => {
    const s = war(11, 30);
    const r = blank(s);
    for (const st of steps(s)) apply(r, st);
    expect(r.marks).toEqual(s.marks);
    expect(r.soldiers).toEqual(s.soldiers);
  });

  it("loads old saves as they were written, and ignores junk", () => {
    const s = war(3, 10);
    const old = JSON.stringify({ s, mode: { kind: "pnp" } });
    expect(readSave(old)!.s).toEqual(s);
    expect(readSave(JSON.stringify({ s, mode: { kind: "bot", level: 9 } }))!.mode).toEqual({ kind: "bot", level: 1 });
    expect(readSave("{nope")).toBeNull();
    expect(readSave(JSON.stringify({ s: { ...s, v: 2 } }))).toBeNull();
    expect(readSave(null)).toBeNull();
  });

  it("the drawer keeps one copy of a page, newest first, capped", () => {
    const a = file(war(1, 4), { kind: "pnp" }, 1);
    const b = file(war(2, 4), { kind: "pnp" }, 2);
    let d = addToDrawer([], a);
    d = addToDrawer(d, b);
    d = addToDrawer(d, { ...a, at: 3 });
    expect(d.map((r) => r.at)).toEqual([3, 2]);
    expect(addToDrawer(d, b, 1)).toHaveLength(1);
    expect(readDrawer(JSON.stringify([...d, { v: 9 }, null]))).toHaveLength(2);
    expect(readDrawer("x")).toEqual([]);
  });
});

describe("ink clock", () => {
  const snags = [{ at: 100, hold: 50 }, { at: 300, hold: 200 }];
  it("runs, holds on each snag, then runs again", () => {
    expect(inkTime(50, snags)).toBe(50);
    expect(inkTime(120, snags)).toBe(100); // held on the first snag
    expect(inkTime(160, snags)).toBe(110);
    expect(inkTime(400, snags)).toBe(300); // held on the second
    expect(inkTime(700, snags)).toBe(450);
    expect(totalHold(snags)).toBe(250);
  });
  it("wallTime is when the ink first reaches a point", () => {
    for (const ink of [0, 99, 100, 101, 299, 300, 301, 600]) expect(inkTime(wallTime(ink, snags), snags)).toBe(ink);
  });
});
