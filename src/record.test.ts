import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase } from "./bot";
import { act, canPlaceBase, illegal, newGame, type GameState } from "./game";
import { inkTime, totalHold, wallTime } from "./inkclock";
import * as legacy from "./legacy";
import { addToDrawer, apply, blank, file, fromRecord, readDrawer, readSave, steps, toRecord, unfile, type Filed } from "./record";
import { CORE, SIZES } from "./rules";

// A whole June-prototype war (bot v bot), seeded: what old saves and drawer pages hold.
function oldWar(seed: number, maxTurns = 400): legacy.LegacyState {
  const s = legacy.newGame(seed, { no: 3, date: "25 Sep 2026" });
  let k = seed;
  while (s.phase === "setup") {
    const spot = botBase(s as unknown as GameState, (x, y) => !legacy.canPlaceBase(s, x, y), k++)!;
    legacy.placeBase(s, spot.x, spot.y);
  }
  while (s.phase === "play" && s.turn < maxTurns) legacy.act(s, legacy.legacyBotFlick(s, 1, k++));
  return s;
}

// A whole core-rules war, bot v bot, seeded.
function war(seed: number, maxTurns = 400): GameState {
  const s = newGame(SIZES.quick, seed, { no: 4, date: "26 Sep 2026" });
  let k = seed;
  while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
  while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
  while (s.phase === "play" && s.turn < maxTurns) act(s, botAction(s, 1, k++));
  return s;
}

describe("record (core rules)", () => {
  it("a filed page is seed + size + rules + actions, and replays to the same page exactly", () => {
    const s = war(7);
    const r = JSON.parse(JSON.stringify(file(s, { kind: "bot", level: 1 }))) as Filed;
    expect(r).toMatchObject({ v: 2, seed: 7, size: SIZES.quick, rules: CORE });
    expect(Object.keys(r).sort()).toEqual(["actions", "at", "mode", "page", "rules", "seed", "size", "turns", "v", "winner"]);
    expect(unfile(r)).toEqual(s);
  });

  it("an old record keeps the rule numbers it was played with, whatever CORE says now", () => {
    const s = war(9, 12);
    const r = JSON.parse(JSON.stringify(toRecord(s)));
    const was = CORE.snipeWallLoss;
    CORE.snipeWallLoss = 0.5;
    try {
      expect(fromRecord(r)).toEqual(s);
      expect(newGame(SIZES.quick, 1).rules.snipeWallLoss).toBe(0.5);
    } finally {
      CORE.snipeWallLoss = was;
    }
  });

  it("a page played on version-1 rules (one reach, curve 0.9) still replays on its own numbers", () => {
    const { lungeReach: _l, ...rest } = CORE;
    const v1 = { ...rest, version: 1, reach: { min: 300, max: 1800 } } as unknown as typeof CORE;
    const s = newGame(SIZES.quick, 21, undefined, v1);
    let k = 21;
    while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < 60) act(s, botAction(s, 1, k++));
    expect(s.turn).toBeGreaterThan(3);
    const r = JSON.parse(JSON.stringify(toRecord(s)));
    expect(r.rules.version).toBe(1);
    expect(r.rules.lungeReach).toBeUndefined();
    // the loader fills unnamed rules from today's CORE (lungeReach); version 1 must not read it
    // (the loader adds the unused lungeReach to the rules; everything the game did is the same)
    const same = (a: GameState) => expect({ ...a, rules: { ...a.rules, lungeReach: undefined } }).toEqual({ ...s, rules: { ...s.rules, lungeReach: undefined } });
    same(fromRecord(r));
    same(unfile(JSON.parse(JSON.stringify(file(s, { kind: "pnp" })))) as GameState);
    expect(fromRecord(r).rules.version).toBe(1);
  });

  it("steps replay one at a time to the same page", () => {
    const s = war(11, 30);
    const f = file(s, { kind: "pnp" });
    const r = blank(f);
    for (const st of steps(f)) apply(r, st);
    expect(r).toEqual(s);
  });

  it("saves in progress load as written", () => {
    const s = war(3, 10);
    const back = readSave(JSON.stringify({ s, mode: { kind: "pnp" } }))!;
    expect(back.s).toEqual(s);
  });
});

describe("record (old saves and drawer pages, June prototype)", () => {
  it("replaying a filed prototype page redraws every mark exactly", () => {
    const s = oldWar(7);
    expect(s.marks.length).toBeGreaterThan(20);
    const again = unfile(JSON.parse(JSON.stringify(file(s, { kind: "bot", level: 1 }))));
    expect(again).toEqual(s);
  });

  it("a prototype page as the old build filed it (no v2 fields at all) still loads and replays", () => {
    const s = oldWar(21, 40);
    // exactly the shape the June build wrote into pft:drawer
    const written = { v: 1, seed: s.seed, page: s.page, mode: { kind: "pnp" }, winner: s.winner, turns: s.turn, at: 1, bases: s.bases.map((b) => [b.x, b.y]), flicks: s.flicks };
    const [r] = readDrawer(JSON.stringify([written]));
    expect(unfile(r)).toEqual(s);
    const st = steps(r);
    expect(st[0]).toMatchObject({ t: "legacy-base" });
    const b = blank(r);
    for (const x of st) apply(b, x);
    expect(b).toEqual(s);
  });

  it("loads old saves as they were written, and ignores junk", () => {
    const s = oldWar(3, 10);
    const old = JSON.stringify({ s, mode: { kind: "pnp" } });
    expect(readSave(old)!.s).toEqual(s);
    expect(readSave(JSON.stringify({ s, mode: { kind: "bot", level: 9 } }))!.mode).toEqual({ kind: "bot", level: 1 });
    expect(readSave("{nope")).toBeNull();
    expect(readSave(JSON.stringify({ s: { ...s, v: 3 } }))).toBeNull();
    expect(readSave(JSON.stringify({ s: { ...s, v: 2 } }))).toBeNull(); // a v2 needs its actions
    expect(readSave(null)).toBeNull();
  });

  it("the drawer keeps one copy of a page, newest first, capped", () => {
    const a = file(oldWar(1, 4), { kind: "pnp" }, 1);
    const b = file(war(2, 4), { kind: "pnp" }, 2);
    let d = addToDrawer([], a);
    d = addToDrawer(d, b);
    d = addToDrawer(d, { ...a, at: 3 });
    expect(d.map((r) => r.at)).toEqual([3, 2]);
    expect(addToDrawer(d, b, 1)).toHaveLength(1);
    expect(readDrawer(JSON.stringify([...d, { v: 9 }, { v: 2 }, null]))).toHaveLength(2);
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
