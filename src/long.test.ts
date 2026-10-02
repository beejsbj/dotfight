import { describe, expect, it } from "vitest";
import { act, canArrange, capacity, corners, illegal, inside, newGame, wallGap, wallStrength, type Base, type GameState, type Player } from "./game";
import { insidePoly, polyHits, polygon } from "./geom";
import { LONG, RULES, SIZES, type Shape } from "./rules";

const L = LONG.long!;

/** A long-war page in play, built by hand: bases where you say, nobody on it yet. */
function field(bases: [Shape, Player, number, number, number?][]): GameState {
  const s = newGame(SIZES.long, 1, undefined, LONG);
  s.bases = bases.map(([shape, owner, x, y, rot], id): Base => ({ id, owner, x, y, r: RULES.baseRadius * L.shapes[shape].size, seed: id, shape, ...(shape !== "camp" && { rot: rot ?? 0 }) }));
  Object.assign(s, { phase: "play", turn: 1, current: 0, left: 1, ready: [true, true] });
  return s;
}

function man(s: GameState, owner: Player, x: number, y: number, home?: number) {
  const id = s.soldiers.length;
  s.soldiers.push({ id, owner, x, y, alive: true, ...(home !== undefined && { home }) });
  return id;
}

describe("shapes on the page", () => {
  it("polygons: corners on the circumradius, inside, and where a segment crosses", () => {
    const tri = polygon(3, { x: 0, y: 0 }, 10, 0);
    expect(tri[0]).toEqual({ x: 10, y: 0 });
    expect(insidePoly({ x: 0, y: 0 }, tri)).toBe(true);
    expect(insidePoly({ x: -6, y: 0 }, tri)).toBe(false); // the flat side is at x = -5
    const hits = polyHits({ x: -20, y: 0 }, { x: 20, y: 0 }, tri);
    expect(hits.map((h) => h.t)).toEqual([expect.closeTo(15 / 40, 9), expect.closeTo(1 - 10 / 40, 9)]);
  });

  it("a core base is still a plain circle", () => {
    const s = newGame(SIZES.quick, 3);
    act(s, { t: "base", x: 300, y: 300 });
    const b = s.bases[0];
    expect(b).not.toHaveProperty("shape");
    expect(corners(b)).toBeNull();
    expect(inside(b, { x: 300 + b.r * 1.04, y: 300 })).toBe(true);
    expect(inside(b, { x: 300 + b.r * 1.06, y: 300 })).toBe(false);
  });

  it("a hexagon's inside follows its walls, not its circumcircle", () => {
    const s = field([["cushion", 0, 500, 800, 0]]);
    const b = s.bases[0];
    const flat = b.r * Math.cos(Math.PI / 6); // corner at angle 0, so the top edge's middle is this far up
    expect(inside(b, { x: 500, y: 800 - flat + 1 }, 1)).toBe(true);
    expect(inside(b, { x: 500, y: 800 - flat - 1 }, 1)).toBe(false);
    expect(wallGap(b, { x: 500, y: 800 - flat - 5 })).toBeCloseTo(5, 6);
    expect(wallGap(b, { x: 500, y: 800 })).toBeCloseTo(-flat, 6);
  });
});

describe("long war setup", () => {
  it("a long war base must name its shape; a core one mustn't", () => {
    const s = newGame(SIZES.long, 4, undefined, LONG);
    expect(illegal(s, { t: "base", x: 300, y: 1300 })).toBe("pick a shape");
    expect(illegal(s, { t: "base", x: 300, y: 1300, shape: "pentagon" as Shape })).toBe("pick a shape");
    expect(illegal(s, { t: "base", x: 300, y: 1300, shape: "prism" })).toBeNull();
    expect(illegal(newGame(SIZES.quick, 4), { t: "base", x: 300, y: 1300, shape: "camp" })).toBe("no shapes in a quick battle");
  });

  it("each shape is jotted with its own garrison, inside its own walls, and that's what full means", () => {
    const s = newGame(SIZES.long, 5, undefined, LONG);
    const kit: [Shape, number, number][] = [["camp", 250, 1450], ["prism", 450, 300], ["cushion", 700, 1450], ["prism", 800, 300]];
    for (const [shape, x, y] of kit) act(s, { t: "base", x, y, shape });
    for (const b of s.bases) {
      const men = s.soldiers.filter((x) => x.home === b.id);
      expect(men.length).toBe(L.shapes[b.shape!].soldiers);
      expect(capacity(s, b)).toBe(L.shapes[b.shape!].soldiers);
      for (const m of men) expect(wallGap(b, m)).toBeLessThan(-RULES.soldierRadius * 2);
      expect(wallStrength(s, b)).toBe(1);
    }
    expect(s.bases.map((b) => [b.shape, b.r])).toEqual(kit.map(([sh]) => [sh, RULES.baseRadius * L.shapes[sh].size]));
    expect(s.bases[0].rot).toBeUndefined();
    expect(s.bases[1].rot).toBeTypeOf("number");
  });

  it("positioning measures the reach from a polygon's walls, and keeps out of enemy shapes", () => {
    const s = field([["prism", 0, 500, 1300], ["cushion", 1, 500, 400, 0]]);
    s.phase = "position";
    const id = man(s, 0, 500, 1300, 0);
    const vs = corners(s.bases[0])!; // corner 0 points along +x
    const tip = vs[0];
    expect(canArrange(s, id, tip.x + L.ink.clear, tip.y)).toBeNull();
    expect(canArrange(s, id, tip.x + s.rules.positionReach + 2, tip.y)).toBe("too far from his base");
    s.current = 1;
    const foe = man(s, 1, 500, 400, 1);
    expect(canArrange(s, foe, 500, 400 + 30)).toBeNull();
  });
});
