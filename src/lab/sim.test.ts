import { describe, expect, it } from "vitest";
import { columnAt, headAt, preview } from "../game";
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

  it("reads s and t as the square and the pentagon", () => {
    expect(parseKits("st:tsc")).toEqual([["square", "pentagon"], ["pentagon", "square", "camp"]]);
    expect(parseKits("ssssss:tttttt")![1]).toHaveLength(6);
    const { s, st } = playGame(sizeOf("long2"), 5, { rules: LONG, maxTurns: 1, kit: parseKits("ss:tt")!, kitNames: ["ss", "tt"] });
    expect(s.bases.filter((b) => b.owner === 0).map((b) => b.shape)).toEqual(["square", "square"]);
    expect(s.bases.filter((b) => b.owner === 1).map((b) => b.shape)).toEqual(["pentagon", "pentagon"]);
    expect(st.armies).toEqual([12, 16]);
  });

  it("counts rule and home events, per game", () => {
    const sq = playGame(sizeOf("long3"), 2, { rules: LONG, maxTurns: 12, kit: parseKits("sss:sss")!, kitNames: ["sss", "sss"] }).st;
    const pe = playGame(sizeOf("long3"), 2, { rules: LONG, maxTurns: 12, kit: parseKits("ttt:ttt")!, kitNames: ["ttt", "ttt"] }).st;
    expect(sq.rules).toBeGreaterThan(0);
    expect(sq.homes).toBe(0);
    expect(pe.homes).toBeGreaterThan(0);
    expect(pe.rules).toBe(0);
    expect(summarise([sq, pe]).rules).toBe(sq.rules / 2);
    expect(summarise([sq, pe]).homes).toBe(pe.homes / 2);
  }, 30_000);

  it("gives the bot's long-war flicks a moment, and lets a line catch a walker mid-walk", () => {
    const L = LONG.long!;
    const seen: { early?: number[]; late?: number[]; head?: number; headLate?: number } = {};
    let sent = false;
    const mover: Agent = (s) => {
      if (!sent) { sent = true; const from = s.bases.find((b) => b.owner === s.current && s.soldiers.filter((x) => x.home === b.id && x.alive).length > 1)!; const to = s.bases.find((b) => b.owner === s.current && b.id !== from.id)!; return { t: "send", from: from.id, to: to.id, n: 1 }; }
      return { t: "stop" };
    };
    const watcher: Agent = (s) => {
      const c = s.convoys.find((k) => k.state === "road")!;
      const foe = s.soldiers.find((x) => x.owner === s.current && x.alive)!;
      // aim at where the walker will stand when the walk ends: a line released then catches him; one released at once, 150 units short of him, doesn't
      const at = columnAtEnd(s, c.id);
      const was = s.soldiers[c.ids[0]];
      // stand beside the spot, on the side away from where he is now, so the line runs along the road and nothing else is in the way
      const dx = at.x - was.x, dy = at.y - was.y, d = Math.hypot(dx, dy) || 1;
      foe.x = at.x + (dx / d) * 120; foe.y = at.y + (dy / d) * 120;
      for (const x of s.soldiers) if (x.id !== foe.id && x.id !== was.id) { x.x = -500; x.y = -500; }
      const angle = Math.atan2(at.y - foe.y, at.x - foe.x);
      const f = { soldier: foe.id, kind: "snipe" as const, angle, length: 120 + 40, bend: 0, wob: 0 };
      seen.early = preview(s, { ...f, ms: 0 }).killed;
      seen.late = preview(s, { ...f, ms: L.walkMs }).killed;
      seen.head = headAt(s, c, 0);
      seen.headLate = headAt(s, c, L.walkMs);
      return { t: "stop" };
    };
    const { s } = playGame(sizeOf("long3"), 4, { rules: LONG, maxTurns: 2, agents: [mover, watcher], kit: parseKits("ccc:ccc")! });
    expect(s.convoys.length).toBe(1);
    expect(seen.headLate! - seen.head!).toBeCloseTo(L.sendPace);
    expect(seen.late!.length).toBe(1);
    expect(seen.early!.length).toBe(0);
    // the bot's own flicks carry the moment they were let go
    const bot = playGame(sizeOf("long2"), 6, { rules: LONG, maxTurns: 8, kit: parseKits("cc:cc")! }).s;
    const flicks = bot.actions.filter((a) => a.t === "flick");
    expect(flicks.length).toBeGreaterThan(0);
    for (const f of flicks) expect(f.t === "flick" && Number.isFinite(f.ms)).toBe(true);
  }, 30_000);
});

function columnAtEnd(s: Parameters<typeof headAt>[0], id: number) {
  const c = s.convoys.find((k) => k.id === id)!;
  return columnAt(c.road, headAt(s, c, LONG.long!.walkMs), 1)[0];
}
