import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase, botShape } from "./bot";
import { act, canPlaceBase, illegal, newGame, rng, type GameState } from "./game";
import { inkTime, totalHold, wallTime } from "./inkclock";
import * as legacy from "./legacy";
import { hash } from "./room-engine";
import { addToDrawer, apply, blank, file, fromRecord, readDrawer, readSave, settleSave, steps, toRecord, unfile, type Filed, type GameRecord } from "./record";
import { CORE, LONG, SIZES, savedRules } from "./rules";
// two wars (Quick, Classic) recorded on origin/main's engine before garrisoned walls, with how they ended
import beforeRaw from "./__fixtures__/core-v1-wars.json?raw";

// four wars (two Quick, two Classic) on core-4, garrisoned walls, with the page's hash after every action (scripts/fixture-core-wars.ts)
import core4Raw from "./__fixtures__/core-4-wars.json?raw";

const before = JSON.parse(beforeRaw) as { record: GameRecord; end: { winner: number; turn: number; marks: number; soldiers: number[][] } }[];
const core4 = JSON.parse(core4Raw) as { record: GameRecord; hashes: string[]; end: { winner: number; turn: number; marks: number } }[];

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

  it("a record from before garrisoned walls (no `garrison`) keeps flat walls, never today's", () => {
    const { garrison: _g, ...old } = CORE;
    void _g;
    expect(savedRules(old).garrison).toBeNull();
    expect(savedRules(CORE).garrison).toEqual(CORE.garrison);
    expect(CORE.garrison).not.toBeNull();
    const r = JSON.parse(JSON.stringify({ ...toRecord(newGame(SIZES.quick, 5)), rules: { ...old, version: 1 } }));
    expect(fromRecord(r).rules.garrison).toBeNull();
    expect(blank({ ...r, mode: { kind: "pnp" }, turns: 0, at: 0 } as Filed)).toMatchObject({ rules: { garrison: null } });
  });

  it("wars recorded on the engine before garrisoned walls replay exactly as they were played", () => {
    for (const { record, end } of before) {
      expect(record.rules).not.toHaveProperty("garrison");
      const s = fromRecord(record);
      expect(s.phase).toBe("over");
      expect({ winner: s.winner, turn: s.turn, marks: s.marks.length }).toEqual({ winner: end.winner, turn: end.turn, marks: end.marks });
      s.soldiers.forEach((x, i) => {
        expect(x.x).toBeCloseTo(end.soldiers[i][0], 2);
        expect(x.y).toBeCloseTo(end.soldiers[i][1], 2);
        expect(x.alive ? 1 : 0).toBe(end.soldiers[i][2]);
      });
    }
  });

  it("core-4 wars recorded before the long war replay step by step to the same page", () => {
    for (const { record, hashes, end } of core4) {
      expect(record.rules).not.toHaveProperty("long");
      const s = newGame(record.size, record.seed, record.page, savedRules(record.rules));
      record.actions.forEach((a, i) => {
        act(s, a);
        expect(hash(s), `${record.size.name} ${record.seed}, action ${i}`).toBe(hashes[i]);
      });
      expect({ winner: s.winner, turn: s.turn, marks: s.marks.length }).toEqual(end);
    }
  });

  it("a page played on version-1 rules (one reach, curve 0.9) still replays on its own numbers", () => {
    const v1 = { ...CORE, version: 1, reach: { min: 300, max: 1800 } } as unknown as typeof CORE;
    const s = newGame(SIZES.quick, 21, undefined, v1);
    let k = 21;
    while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < 60) act(s, botAction(s, 1, k++));
    expect(s.turn).toBeGreaterThan(3);
    const r = JSON.parse(JSON.stringify(toRecord(s)));
    expect(r.rules.version).toBe(1);
    expect(r.rules.reach).toEqual({ min: 300, max: 1800 });
    const same = (a: GameState) => expect(a).toEqual(s);
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

  it("a save left terminal (closed before the finale) is filed in the drawer and cleared; a live one is not", () => {
    const over = war(5);
    expect(over.phase).toBe("over");
    const mode = { kind: "bot", level: 1 } as const;
    const out = settleSave({ s: over, mode }, [], 9);
    expect(out.filed).toBe(true);
    expect(out.save).toBeNull();
    expect(out.drawer).toHaveLength(1);
    expect(unfile(out.drawer[0])).toEqual(over);
    // filing it twice (a second launch before the first finished) leaves one copy
    expect(settleSave({ s: over, mode }, out.drawer, 10).drawer).toHaveLength(1);
    const live = war(5, 6);
    expect(live.phase).toBe("play");
    const kept = settleSave({ s: live, mode }, [], 9);
    expect(kept).toMatchObject({ filed: false, drawer: [] });
    expect(kept.save?.s).toBe(live);
    expect(settleSave(null, []).filed).toBe(false);
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

describe("record (the long war)", () => {
  // A long war, bot v bot, seeded: the bot fields every shape and banks on purpose, so the page gains pencil stars.
  function longWar(seed: number, maxTurns = 400): GameState {
    const s = newGame(SIZES.long, seed, { no: 5, date: "3 Oct 2026" }, LONG);
    let k = seed;
    while (s.phase === "setup") { const sh = botShape(rng(k++)); const p = botBase(s, (x, y) => !canPlaceBase(s, x, y, sh), k++)!; act(s, { t: "base", ...p, shape: sh }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < maxTurns) act(s, botAction(s, 1, k++));
    return s;
  }

  it("a filed long page replays to the same marks, pencil stars included, whole and step by step", { timeout: 60000 }, () => {
    const s = longWar(7, 14);
    const stars = s.marks.filter((m) => m.t === "star");
    expect(stars.length).toBeGreaterThan(0);
    expect(fromRecord(JSON.parse(JSON.stringify(toRecord(s))))).toEqual(s);
    const f = file(s, { kind: "bot", level: 1 });
    const r = blank(f);
    for (const st of steps(f)) apply(r, st);
    expect(r).toEqual(s);
    expect(r.marks.filter((m) => m.t === "star")).toEqual(stars);
  });
});
