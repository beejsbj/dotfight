import { describe, expect, it } from "vitest";
import { pointAlong } from "./geom";
import { act, alive, canPlaceBase, newGame, placeBase, preview, type LegacyState as GameState } from "./legacy";
import { RULES } from "./rules";

// The June prototype's rules, which old saves still play by (src/legacy.ts).
// Two bases each, far apart, so tests can aim precisely.
function setup(): GameState {
  const s = newGame(42);
  const spots = [
    [300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400],
  ];
  for (const [x, y] of spots.slice(0, RULES.basesPerPlayer * 2)) placeBase(s, x, y);
  return s;
}

describe("setup", () => {
  it("alternates bases and fills them with soldiers", () => {
    const s = setup();
    expect(s.phase).toBe("play");
    expect(s.bases.map((b) => b.owner)).toEqual([0, 1, 0, 1, 0, 1].slice(0, RULES.basesPerPlayer * 2));
    expect(alive(s, 0)).toHaveLength(RULES.basesPerPlayer * RULES.soldiersPerBase);
    for (const x of s.soldiers) {
      const b = s.bases.find((b) => Math.hypot(b.x - x.x, b.y - x.y) < b.r)!;
      expect(b.owner).toBe(x.owner);
    }
  });

  it("refuses bases over the margin, overlapping, or on top of the enemy", () => {
    const s = newGame(1);
    expect(canPlaceBase(s, 40, 700)).toMatch(/edge/);
    placeBase(s, 400, 700);
    expect(canPlaceBase(s, 450, 700)).toMatch(/enemy/);
  });
});

describe("flicks", () => {
  it("a shot straight at an enemy kills it and leaves the shooter in place", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const foe = alive(s, 1)[0];
    const angle = Math.atan2(foe.y - me.y, foe.x - me.x);
    const o = act(s, { soldierId: me.id, kind: "shoot", angle, length: 3000, bend: 0 });
    expect(o.killed).toContain(foe.id);
    expect(s.soldiers[foe.id].alive).toBe(false);
    expect([me.x, me.y]).toEqual([s.soldiers[me.id].x, s.soldiers[me.id].y]);
    expect(s.current).toBe(1);
  });

  it("shots stop at the page edge", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const o = preview(s, { soldierId: me.id, kind: "shoot", angle: Math.PI / 2, length: 5000, bend: 0 });
    expect(o.path.at(-1)!.y).toBeCloseTo(RULES.pageH, 1);
  });

  it("move relocates the soldier and crosses out the old spot", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const from = { x: me.x, y: me.y };
    act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 150, bend: 0 });
    expect(s.soldiers[me.id].y).toBeCloseTo(from.y - 150, 5);
    expect(s.marks.some((m) => m.t === "cross" && m.kind === "moved" && m.x === from.x)).toBe(true);
  });

  it("moving off the page loses the soldier", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const o = act(s, { soldierId: me.id, kind: "move", angle: Math.PI / 2, length: 2000, bend: 0 });
    expect(o.lost).toBe(true);
    expect(s.soldiers[me.id].alive).toBe(false);
  });

  it("no friendly fire by default", () => {
    const s = setup();
    const [a, b] = alive(s, 0);
    const o = preview(s, { soldierId: a.id, kind: "shoot", angle: Math.atan2(b.y - a.y, b.x - a.x), length: 3000, bend: 0 });
    expect(o.killed).not.toContain(b.id);
  });

  it("only the current player's living soldiers can flick", () => {
    const s = setup();
    const foe = alive(s, 1)[0];
    expect(() => act(s, { soldierId: foe.id, kind: "shoot", angle: 0, length: 100, bend: 0 })).toThrow();
  });

  it("wiping out the enemy ends the game", () => {
    const s = setup();
    for (const x of s.soldiers) if (x.owner === 1) x.alive = false;
    const last = s.soldiers.find((x) => x.owner === 1)!;
    last.alive = true;
    const me = alive(s, 0)[0];
    act(s, { soldierId: me.id, kind: "shoot", angle: Math.atan2(last.y - me.y, last.x - me.x), length: 3000, bend: 0 });
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(0);
  });
});

describe("pointAlong", () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
  it("clamps before the start and past the end", () => {
    // regression: a negative animation progress crashed the render loop on moves
    expect(pointAlong(path, -0.01)).toEqual(path[0]);
    expect(pointAlong(path, 1.5)).toEqual(path[2]);
    expect(pointAlong(path, NaN)).toEqual(path[0]);
    expect(pointAlong(path, 0.5)).toEqual(path[1]);
  });
});
