import { describe, expect, it } from "vitest";
import { act, newGame } from "./game";
import { CORE } from "./rules";
import { UNIT_CAM, facing, phaseAt, rotFacing } from "./unitcam";

const { drop, hold, rise } = UNIT_CAM;

describe("the unit cam's beat", () => {
  it("drops, holds, rises, and is done", () => {
    expect(phaseAt(0).phase).toBe("drop");
    expect(phaseAt(drop - 1).phase).toBe("drop");
    expect(phaseAt(drop).phase).toBe("hold");
    expect(phaseAt(drop + hold - 1).phase).toBe("hold");
    expect(phaseAt(drop + hold).phase).toBe("rise");
    expect(phaseAt(drop + hold + rise).phase).toBe("done");
  });

  it("is quick: under two and a half seconds, start to finish", () => {
    expect(drop + hold + rise).toBeLessThan(2500);
  });

  it("a touch cuts it short: it rises from there, whether it was on its way down or holding", () => {
    expect(phaseAt(200, 150)).toEqual({ phase: "rise", since: 50 });
    expect(phaseAt(150 + rise, 150).phase).toBe("done");
    expect(phaseAt(drop + 300, drop + 100)).toEqual({ phase: "rise", since: 200 });
    // a touch while it's already rising changes nothing
    expect(phaseAt(drop + hold + 100, drop + hold + 50)).toEqual(phaseAt(drop + hold + 100));
  });
});

describe("where he looks", () => {
  const s = newGame({ name: "custom", bases: 3, soldiers: 10 }, 42, undefined, { ...CORE });
  for (const [x, y] of [[300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400]]) act(s, { t: "base", x, y });
  act(s, { t: "ready" });
  act(s, { t: "ready" });
  const me = s.soldiers.find((x) => x.owner === 0)!;

  it("down the line last pulled on him, if there was one", () => {
    expect(facing(s, me.id, 0.7)).toBe(0.7);
  });

  it("otherwise at the nearest living enemy", () => {
    const a = facing(s, me.id);
    const foes = s.soldiers.filter((x) => x.owner === 1);
    const near = foes.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0];
    expect(a).toBeCloseTo(Math.atan2(near.y - me.y, near.x - me.x));
    near.alive = false;
    expect(facing(s, me.id)).not.toBeCloseTo(a, 5);
  });

  it("turns the page so that's straight up the screen, the short way round", () => {
    for (const face of [0, 1, -2, 3]) for (const cur of [0, Math.PI, 7, -5]) {
      const r = rotFacing(face, cur);
      // screen up, in page terms, is (-sin r, -cos r)
      expect(-Math.sin(r)).toBeCloseTo(Math.cos(face));
      expect(-Math.cos(r)).toBeCloseTo(Math.sin(face));
      expect(Math.abs(r - cur)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});
