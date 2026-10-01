import { describe, expect, it } from "vitest";
import { CORE } from "../rules";
import { playGame, type Agent } from "./sim";

describe("rules lab measurements", () => {
  it("records a base emptied by a flick on the action's turn before handover", () => {
    let target = -1;
    const emptyBase: Agent = (s) => {
      const me = s.soldiers.find((x) => x.owner === s.current)!;
      const foe = s.soldiers.find((x) => x.owner !== s.current)!;
      target = foe.home!;
      const b = s.bases[target];
      foe.x = b.x; foe.y = b.y;
      me.x = b.x; me.y = b.y + 200;
      for (const x of s.soldiers) if (x.id !== me.id && x.id !== foe.id) {
        x.x = 50; x.y = 50;
      }
      return { t: "flick", soldier: me.id, kind: "snipe", angle: -Math.PI / 2, length: 400, bend: 0, wob: 0 };
    };
    const { st, s } = playGame({ name: "custom", bases: 2, soldiers: 1 }, 31, {
      maxTurns: 1, agents: [emptyBase, emptyBase],
      rules: { ...CORE, garrison: null, snipeWallLoss: 0, lastStandAt: 0 },
    });
    expect(st.perFlick).toEqual([1]);
    expect(s.turn).toBe(2);
    expect(st.emptiedAt[target]).toBe(1);
  });
});
