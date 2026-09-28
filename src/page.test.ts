import { describe, expect, it } from "vitest";
import { act, alive, newGame, placeBase } from "./legacy";
import { dotSpots, yellowing } from "./page";

function setup() {
  const s = newGame(42);
  for (const [x, y] of [[300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400]]) placeBase(s, x, y);
  return s;
}

describe("dotSpots: the page keeps every dot", () => {
  it("one dot per soldier on a fresh page", () => {
    const s = setup();
    expect(dotSpots(s)).toHaveLength(s.soldiers.length);
  });

  it("a moved soldier leaves his old dot and gains a new one", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const from = { x: me.x, y: me.y };
    act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 150, bend: 0 });
    const mine = dotSpots(s).filter((d) => d.id === me.id);
    expect(mine).toHaveLength(2);
    expect(mine.some((d) => d.x === from.x && d.y === from.y)).toBe(true);
    expect(mine.some((d) => d.x === s.soldiers[me.id].x && d.y === s.soldiers[me.id].y)).toBe(true);
  });

  it("a soldier flicked off the page leaves exactly one dot where he stood", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    act(s, { soldierId: me.id, kind: "move", angle: Math.PI / 2, length: 2000, bend: 0 });
    expect(dotSpots(s).filter((d) => d.id === me.id)).toHaveLength(1);
  });

  it("the dead keep their dot", () => {
    const s = setup();
    const me = alive(s, 0)[0], foe = alive(s, 1)[0];
    act(s, { soldierId: me.id, kind: "shoot", angle: Math.atan2(foe.y - me.y, foe.x - me.x), length: 3000, bend: 0 });
    expect(s.soldiers[foe.id].alive).toBe(false);
    expect(dotSpots(s).some((d) => d.id === foe.id)).toBe(true);
  });
});

describe("yellowing", () => {
  it("is white on a new page and warm on an old one", () => {
    expect(yellowing(0)).toEqual([1, 1, 1]);
    const [r, g, b] = yellowing(1);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0.7);
  });
});
