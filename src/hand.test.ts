import { describe, expect, it } from "vitest";
import { alive, newGame, placeBase, type GameState } from "./game";
import { jotOrder, pickSoldier } from "./hand";
import { PROTOTYPE as RULES } from "./rules";
import { Timeline, reachFraction } from "./timeline";

function setup(): GameState {
  const s = newGame(RULES, 42);
  const spots = [[300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400]];
  for (const [x, y] of spots.slice(0, RULES.basesPerPlayer * 2)) placeBase(s, x, y);
  return s;
}

describe("pickSoldier", () => {
  const tight = { soldier: 12, base: 0 };
  const loose = { soldier: 12, base: 30 };

  it("picks the soldier under the finger", () => {
    const s = setup();
    const me = alive(s, 0)[3];
    expect(pickSoldier(s, { x: me.x + 4, y: me.y - 3 }, tight)).toBe(me.id);
  });

  it("a tap anywhere in your base picks that base's nearest living soldier", () => {
    const s = setup();
    const b = s.bases.find((b) => b.owner === 0)!;
    const tap = { x: b.x + b.r * 0.9, y: b.y };
    const id = pickSoldier(s, tap, loose)!;
    expect(id).toBeDefined();
    const x = s.soldiers[id];
    expect(x.owner).toBe(0);
    expect(Math.hypot(x.x - b.x, x.y - b.y)).toBeLessThan(b.r);
    // nearest among that base's soldiers
    for (const o of alive(s, 0)) {
      if (Math.hypot(o.x - b.x, o.y - b.y) > b.r) continue;
      expect(Math.hypot(o.x - tap.x, o.y - tap.y)).toBeGreaterThanOrEqual(Math.hypot(x.x - tap.x, x.y - tap.y));
    }
  });

  it("a tap just outside the circle still counts, within the slop", () => {
    const s = setup();
    const b = s.bases.find((b) => b.owner === 0)!;
    expect(pickSoldier(s, { x: b.x, y: b.y + b.r + 20 }, loose)).toBeDefined();
    expect(pickSoldier(s, { x: b.x, y: b.y + b.r + 45 }, loose)).toBeUndefined();
  });

  it("never picks the dead, or the enemy's soldiers", () => {
    const s = setup();
    const b = s.bases.find((b) => b.owner === 0)!;
    for (const x of s.soldiers) if (Math.hypot(x.x - b.x, x.y - b.y) < b.r) x.alive = false;
    expect(pickSoldier(s, { x: b.x, y: b.y }, loose)).toBeUndefined();
    const foe = s.bases.find((b) => b.owner === 1)!;
    expect(pickSoldier(s, { x: foe.x, y: foe.y }, loose)).toBeUndefined();
  });

  it("the base fallback can be turned off (a soldier is already in hand)", () => {
    const s = setup();
    const b = s.bases.find((b) => b.owner === 0)!;
    const far = alive(s, 0).every((x) => Math.hypot(x.x - b.x - b.r * 0.95, x.y - b.y) > 12);
    if (far) expect(pickSoldier(s, { x: b.x + b.r * 0.95, y: b.y }, tight)).toBeUndefined();
  });
});

describe("jotOrder", () => {
  it("visits every dot once, starting top-left, stepping to the nearest", () => {
    const pts = [{ x: 50, y: 50 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 40, y: 45 }, { x: 12, y: 30 }];
    const o = jotOrder(pts);
    expect([...o].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(o[0]).toBe(1);
    expect(o[1]).toBe(2);
  });
  it("handles nothing", () => expect(jotOrder([])).toEqual([]));
});

describe("Timeline", () => {
  it("reports progress, settled keys, and the end", () => {
    const t = new Timeline();
    const end = t.add("a", 1000, 100, 200);
    expect(end).toBe(1300);
    expect(t.p("a", 1050)).toBe(0);
    expect(t.p("a", 1200)).toBeCloseTo(0.5);
    expect(t.p("a", 5000)).toBe(1);
    expect(t.p("unknown", 0)).toBe(1);
    expect(t.live(1050).has("a")).toBe(true); // waiting its turn is still live
    expect(t.end(1000)).toBe(1300);
    expect(t.live(1300).has("a")).toBe(false);
    expect(t.end(2000)).toBe(2000);
  });

  it("speed shortens delays and durations", () => {
    const t = new Timeline();
    t.speed = 0.25;
    expect(t.add("a", 0, 400, 400)).toBe(200);
  });

  it("reachFraction inverts the out2 ease", () => {
    const t = new Timeline();
    t.add("s", 0, 0, 1000, "out2");
    for (const i of [0, 3, 16, 31, 32]) {
      const f = reachFraction(i, 32);
      expect(t.p("s", f * 1000)).toBeCloseTo(i / 32, 5);
    }
  });
});
