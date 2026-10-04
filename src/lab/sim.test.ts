import { describe, expect, it } from "vitest";
import { CORE, LONG } from "../rules";
import { parseKits, parseSet, playGame, sizeOf, summarise, type Agent } from "./sim";

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

  it("reads dotted long keys, booleans and the sizes of the long war", () => {
    const r = parseSet("long.well.pull=0.002,long.cushion.maxBanks=0,long.prism.ownFree=false,long.sendPace=250,snipeKillLoss=0.1", "long");
    expect(r.long!.well.pull).toBe(0.002);
    expect(r.long!.well.reach).toBe(LONG.long!.well.reach);
    expect(r.long!.cushion.maxBanks).toBe(0);
    expect(r.long!.prism.ownFree).toBe(false);
    expect(r.long!.sendPace).toBe(250);
    expect(r.snipeKillLoss).toBe(0.1);
    expect(LONG.long!.well.pull).toBe(0.004); // the shipped numbers aren't touched
    expect(() => parseSet("long.well.pul=1", "long")).toThrow(/unknown rule/);
    expect(() => parseSet("long.nope.pull=1", "long")).toThrow(/unknown rule/);
    expect(() => parseSet("long.well.pull=1", "core")).toThrow(/--rules long/);
    expect(() => parseSet("long.prism.ownFree=maybe", "long")).toThrow(/true or false/);
    expect(() => parseSet("long.well.pull=x", "long")).toThrow(/a number/);
    expect(sizeOf("long")).toMatchObject({ bases: 6, soldiers: 12 });
    expect(sizeOf("long6").bases).toBe(6);
    expect(() => sizeOf("longer")).toThrow();
  });

  it("plays each side's kit in draw order, and records it", () => {
    expect(parseKits("cph:mix")).toEqual([["camp", "prism", "cushion"], null]);
    expect(() => parseKits("cx:c")).toThrow(/unknown shape/);
    expect(() => parseKits("c")).toThrow();
    const kit = parseKits("cc:hp")!;
    const { st, s } = playGame(sizeOf("long2"), 3, { rules: LONG, maxTurns: 1, kit, kitNames: ["cc", "hp"] });
    expect(s.bases.filter((b) => b.owner === 0).map((b) => b.shape)).toEqual(["camp", "camp"]);
    expect(s.bases.filter((b) => b.owner === 1).map((b) => b.shape)).toEqual(["cushion", "prism"]);
    expect(st).toMatchObject({ long: true, kits: ["cc", "hp"], armies: [24, 14] });
    expect(st.army).toBe(19);
    const flip = playGame(sizeOf("long2"), 3, { rules: LONG, maxTurns: 1, kit: [kit[1], kit[0]], kitNames: ["hp", "cc"], swap: true }).st;
    expect(flip.swap).toBe(true);
    // each kit's wins are counted over the games where the seats differ, whichever seat it sat in
    const won = (g: typeof st, seat: 0 | 1) => ({ ...g, winner: seat });
    expect(summarise([won(st, 0), won(flip, 0)]).kits).toEqual({ cc: { games: 2, wins: 1, stalled: 0 }, hp: { games: 2, wins: 1, stalled: 0 } });
    expect(summarise([won(st, 0), won(flip, 1)]).kits.cc.wins).toBe(2);
  });
});
