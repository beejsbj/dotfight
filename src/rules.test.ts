// Every rule, one at a time. Tests put soldiers exactly where they need them
// so a flick's line is known; the pen's imprecision lives outside the engine.

import { describe, expect, it } from "vitest";
import { baseEdges } from "./bases";
import {
  act, alive, allotment, canTransfer, garrison, kitLeft, migrate, newGame, placeBase, preview, ready, replay,
  standing, steadiness, transfer, type Flick, type GameState, type Soldier,
} from "./game";
import { PROTOTYPE, resolveRules, variant, type RuleSet } from "./rules";
import { CLASSIC } from "./rulesets";

const quiet = (r: Partial<RuleSet>) => variant(CLASSIC, { id: "t", name: "t", motto: "t", transfer: null, extraTurn: "none", ...r });

// Bases far apart: blue along the bottom, red along the top.
const SPOTS = [[200, 1500], [200, 200], [500, 1500], [500, 200], [800, 1500], [800, 200], [350, 1250], [350, 450], [650, 1250], [650, 450]];
function setup(R: RuleSet): GameState {
  const s = newGame(R, 7);
  let i = 0;
  while (s.phase === "setup") {
    const [x, y] = SPOTS[i++];
    placeBase(s, x, y, kitLeft(s, s.current)[0]);
  }
  return s;
}
const at = (s: GameState, x: Soldier, p: { x: number; y: number }) => { s.soldiers[x.id].x = p.x; s.soldiers[x.id].y = p.y; };
const aim = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
const shot = (me: Soldier, to: { x: number; y: number }, length = 3000, kind: Flick["kind"] = "shoot"): Flick => ({ soldierId: me.id, kind, angle: aim(me, to), length, bend: 0 });
/** Everyone off to the far corners, out of the way, except the soldiers a test uses. */
function clear(s: GameState, keep: Soldier[]) {
  s.soldiers.forEach((x, i) => {
    if (keep.some((k) => k.id === x.id)) return;
    x.x = x.owner === 0 ? 90 + (i % 10) * 3 : 990 - (i % 10) * 3;
    x.y = x.owner === 0 ? 1690 - Math.floor(i / 10) * 3 : 10 + Math.floor(i / 10) * 3;
  });
}

describe("rule sets as data", () => {
  it("fills missing fields with the prototype's (old saves keep their behaviour)", () => {
    const r = resolveRules({ basesPerPlayer: 4 });
    expect(r.basesPerPlayer).toBe(4);
    expect(r.move).toEqual(PROTOTYPE.move);
    expect(r.extraTurn).toBe("none");
    expect(r.transfer).toBeNull();
    expect(resolveRules({ ink: { friction: 5 } as RuleSet["ink"] }).ink.ownBounces).toBe(0);
  });

  it("a v1 save (before rule sets) loads, plays on with the prototype's rules, and replays", () => {
    const s0 = newGame(PROTOTYPE, 42);
    for (const [x, y] of SPOTS.slice(0, 6)) placeBase(s0, x, y);
    const me = alive(s0, 0)[0], foe = alive(s0, 1)[0];
    act(s0, shot(me, foe));
    // as it would have been saved in June
    const v1 = {
      v: 1, seed: s0.seed, phase: s0.phase, current: s0.current, turn: s0.turn,
      bases: s0.bases.map(({ id, owner, x, y, r, seed }) => ({ id, owner, x, y, r, seed })),
      soldiers: s0.soldiers.map(({ id, owner, x, y, alive }) => ({ id, owner, x, y, alive })),
      marks: s0.marks, flicks: s0.actions.filter((a) => a.t === "flick").map(({ t: _t, ...f }) => f),
    };
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.v).toBe(2);
    expect(s.rules.id).toBe("prototype");
    expect(s.actions.filter((a) => a.t === "base")).toHaveLength(6);
    const again = replay(s.rules, s.seed, s.actions);
    expect(again.soldiers.map((x) => [x.x, x.y, x.alive])).toEqual(s.soldiers.map((x) => [x.x, x.y, x.alive]));
    const next = alive(s, 1)[0];
    expect(() => act(s, shot(next, alive(s, 0)[0]))).not.toThrow();
  });
});

describe("Dawood classic", () => {
  it("five bases of ten each", () => {
    const s = setup(CLASSIC);
    expect(s.bases).toHaveLength(10);
    expect(alive(s, 0)).toHaveLength(50);
  });

  it("a move goes as far as a shot, and relocates to where the ink stops", () => {
    expect(CLASSIC.move).toEqual(CLASSIC.shoot);
    const s = setup(quiet({}));
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: 500, y: 1600 });
    const o = act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 1500, bend: 0 });
    expect(o.movedTo!.y).toBeCloseTo(100, 3);
    expect(s.soldiers[me.id].y).toBeCloseTo(100, 3);
  });

  it("a move's line kills what it crosses", () => {
    const s = setup(quiet({}));
    const me = alive(s, 0)[0], foe = alive(s, 1)[0];
    clear(s, [me, foe]);
    at(s, me, { x: 500, y: 1500 });
    at(s, foe, { x: 500, y: 900 });
    const o = act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 1000, bend: 0 });
    expect(o.killed).toEqual([foe.id]);
  });
});

describe("extra turn on a kill", () => {
  function killTwice(extraTurn: RuleSet["extraTurn"]) {
    const s = setup(quiet({ extraTurn }));
    const [a, b] = alive(s, 0), [x, y, z] = alive(s, 1);
    clear(s, [a, b, x, y, z]);
    at(s, a, { x: 300, y: 1500 }); at(s, b, { x: 700, y: 1500 });
    at(s, x, { x: 300, y: 800 }); at(s, y, { x: 310, y: 820 }); at(s, z, { x: 700, y: 800 });
    const o1 = act(s, shot(a, x));
    const after1 = s.current, owed1 = s.owed;
    const o2 = s.current === 0 ? act(s, shot(b, z)) : null;
    return { o1, o2, after1, owed1, after2: s.current, s };
  }
  it("none: the pen passes even after a kill", () => {
    const r = killTwice("none");
    expect(r.o1.killed.length).toBe(2);
    expect(r.after1).toBe(1);
  });
  it("killing several with one flick still earns one extra flick", () => {
    const r = killTwice("once");
    expect(r.o1.killed.length).toBe(2);
    expect(r.o1.again).toBe(true);
    expect(r.owed1).toBe(1);
  });
  it("once: a kill on the extra flick doesn't earn another", () => {
    const r = killTwice("once");
    expect(r.after1).toBe(0);
    expect(r.o2!.killed).toHaveLength(1);
    expect(r.after2).toBe(1);
  });
  it("chain: every kill earns another", () => {
    const r = killTwice("chain");
    expect(r.after1).toBe(0);
    expect(r.after2).toBe(0);
  });
  it("a miss passes the pen", () => {
    const s = setup(quiet({ extraTurn: "chain" }));
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: 500, y: 1000 });
    act(s, { soldierId: me.id, kind: "shoot", angle: 0, length: 400, bend: 0 });
    expect(s.current).toBe(1);
  });
});

describe("pierce", () => {
  function line(pierce: number) {
    const s = setup(quiet({ pierce }));
    const me = alive(s, 0)[0], foes = alive(s, 1).slice(0, 3);
    clear(s, [me, ...foes]);
    at(s, me, { x: 500, y: 1500 });
    foes.forEach((f, i) => at(s, f, { x: 500, y: 1100 - i * 200 }));
    return { s, o: act(s, { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2, length: 1400, bend: 0 }), foes };
  }
  it("0: a line is a line, it takes everything it crosses", () => expect(line(0).o.killed).toHaveLength(3));
  it("1: stops in the first body, and the ink stops there too", () => {
    const { o, foes } = line(1);
    expect(o.killed).toEqual([foes[0].id]);
    expect(o.path.at(-1)!.y).toBeGreaterThan(1080);
  });
  it("2: takes two", () => expect(line(2).o.killed).toHaveLength(2));
});

describe("friendly fire and the page edge", () => {
  it("off-page move loses the soldier (classic guess)", () => {
    const s = setup(quiet({}));
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: 500, y: 1600 });
    const o = act(s, { soldierId: me.id, kind: "move", angle: Math.PI / 2, length: 1000, bend: 0 });
    expect(o.lost).toBe(true);
    expect(s.soldiers[me.id].alive).toBe(false);
  });
  it("friendly fire, when on, crosses out your own", () => {
    const s = setup(quiet({ friendlyFire: true }));
    const [me, mate] = alive(s, 0);
    clear(s, [me, mate]);
    at(s, me, { x: 500, y: 1500 }); at(s, mate, { x: 500, y: 1200 });
    expect(act(s, shot(me, mate)).killed).toContain(mate.id);
  });
});

describe("bases fall", () => {
  it("a base with no living soldier of its owner inside is gone, struck through", () => {
    const s = setup(quiet({}));
    const b = s.bases.find((b) => b.owner === 1)!;
    const inside = garrison(s, b);
    inside.slice(1).forEach((x) => (s.soldiers[x.id].alive = false));
    const me = alive(s, 0)[0];
    clear(s, [me, ...inside, ...alive(s, 1)]);
    at(s, me, { x: b.x, y: 1000 });
    const o = act(s, shot(me, inside[0]));
    expect(o.killed).toContain(inside[0].id);
    expect(s.bases[b.id].fallen).toBe(1);
    expect(s.marks.some((m) => m.t === "raze" && m.base === b.id && m.owner === 0)).toBe(true);
  });
});

describe("transfers", () => {
  function sent(ambush: "none" | "one" | "all") {
    const s = setup(quiet({ transfer: { max: 5, ambush } }));
    const [from, to] = standing(s, 0);
    const o = transfer(s, from.id, to.id, 4);
    return { s, from, to, o };
  }
  it("are legal only between your standing bases, leaving one behind, up to the max", () => {
    const s = setup(quiet({ transfer: { max: 5, ambush: "all" } }));
    const [a, b] = standing(s, 0);
    const r = standing(s, 1)[0];
    expect(canTransfer(s, a.id, b.id, 6)).toMatch(/at most/);
    expect(canTransfer(s, a.id, r.id, 1)).toMatch(/yours/);
    expect(canTransfer(s, a.id, a.id, 1)).toBeTruthy();
    expect(canTransfer(s, a.id, b.id, 3)).toBeNull();
    garrison(s, a).slice(2).forEach((x) => (s.soldiers[x.id].alive = false));
    expect(canTransfer(s, a.id, b.id, 2)).toMatch(/leave/);
  });
  it("take the soldiers off the page and hand the pen over", () => {
    const { s, from } = sent("all");
    expect(garrison(s, s.bases[from.id])).toHaveLength(6);
    expect(ready(s, 0)).toHaveLength(46);
    expect(alive(s, 0)).toHaveLength(50);
    expect(s.current).toBe(1);
    expect(s.marks.some((m) => m.t === "road")).toBe(true);
  });
  it("arrive after the opponent's next action", () => {
    const { s, to } = sent("all");
    const foe = alive(s, 1)[0];
    act(s, { soldierId: foe.id, kind: "shoot", angle: 0, length: 300, bend: 0 });
    expect(garrison(s, s.bases[to.id])).toHaveLength(14);
    expect(s.transits[0].state).toBe("arrived");
  });
  function cut(ambush: "none" | "one" | "all") {
    const { s, o } = sent(ambush);
    const road = s.transits[0].road;
    const mid = { x: (road[0].x + road[1].x) / 2, y: (road[0].y + road[1].y) / 2 };
    const foe = alive(s, 1)[0];
    clear(s, [foe]);
    at(s, foe, { x: mid.x, y: 700 });
    void o;
    return { s, o: act(s, { soldierId: foe.id, kind: "shoot", angle: Math.PI / 2, length: 1000, bend: 0 }) };
  }
  it("all: a line across the road kills the whole convoy", () => {
    const { s, o } = cut("all");
    expect(o.cut[0].ids).toHaveLength(4);
    expect(alive(s, 0)).toHaveLength(46);
    expect(s.transits[0].state).toBe("cut");
  });
  it("one: one per crossing; the rest arrive", () => {
    const { s, o } = cut("one");
    expect(o.cut[0].ids).toHaveLength(1);
    expect(alive(s, 0)).toHaveLength(49);
    expect(s.transits[0].state).toBe("arrived");
  });
  it("none: they're safe on the road", () => {
    const { o } = cut("none");
    expect(o.cut).toHaveLength(0);
  });
});

describe("siege: win by bases, capture the fallen", () => {
  it("you lose when your last base falls, even with soldiers in the field", () => {
    const s = setup(quiet({ win: "bases" }));
    const me = alive(s, 0)[0];
    // red has one base left with one soldier in it, and a soldier out in the field
    const last = standing(s, 1)[0];
    const keep = garrison(s, last)[0];
    const field = alive(s, 1).find((x) => !garrison(s, last).includes(x))!;
    for (const x of alive(s, 1)) if (x !== keep && x !== field) s.soldiers[x.id].alive = false;
    for (const b of standing(s, 1)) if (b !== last) b.fallen = 1;
    clear(s, [me, keep, field]);
    at(s, field, { x: 950, y: 900 });
    at(s, me, { x: keep.x, y: 1000 });
    act(s, shot(me, keep));
    expect(s.phase).toBe("over");
    expect(s.winner).toBe(0);
  });
  it("moving into a fallen base re-founds it for you", () => {
    const s = setup(quiet({ win: "bases", capture: true }));
    const b = standing(s, 1)[0];
    b.fallen = 1;
    for (const x of garrison(s, { ...b, fallen: undefined })) s.soldiers[x.id].alive = false;
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: b.x, y: b.y + 500 });
    const o = act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 500, bend: 0 });
    expect(o.founded).toEqual([b.id]);
    expect(s.bases[b.id].owner).toBe(0);
    expect(s.bases[b.id].founder).toBe(1);
    expect(s.marks.some((m) => m.t === "found")).toBe(true);
  });
});

describe("last stand", () => {
  const LS = quiet({ lastStand: { at: 3, hits: 2, steady: 0.6, shots: 2, grow: 1 } });
  function down(n: number) {
    const s = setup(LS);
    const reds = alive(s, 1);
    reds.slice(n + 1).forEach((x) => (s.soldiers[x.id].alive = false));
    const me = alive(s, 0)[0];
    const victim = reds[n];
    clear(s, [me, ...reds.slice(0, n + 1)]);
    at(s, me, { x: 500, y: 1500 });
    at(s, victim, { x: 500, y: 900 });
    return { s, me, victim, o: act(s, shot(me, victim)) };
  }
  it("begins when a side drops to the threshold", () => {
    const { s, o } = down(3);
    expect(alive(s, 1)).toHaveLength(3);
    expect(o.stood).toEqual([1]);
    expect(s.stand[1]).toBeGreaterThan(0);
    expect(s.marks.some((m) => m.t === "stand" && m.owner === 1)).toBe(true);
  });
  it("its soldiers take two hits: the first only wounds", () => {
    const { s, me } = down(3);
    s.current = 0;
    const hero = alive(s, 1)[0];
    at(s, hero, { x: 500, y: 700 });
    const o = act(s, shot(me, hero));
    expect(o.wounded).toEqual([hero.id]);
    expect(s.soldiers[hero.id].alive).toBe(true);
    s.current = 0; s.owed = 1;
    expect(act(s, shot(me, hero)).killed).toEqual([hero.id]);
  });
  it("they flick twice a turn, with a steadier hand", () => {
    const { s } = down(3);
    expect(allotment(s, 1)).toBe(2);
    expect(steadiness(s, alive(s, 1)[0].id)).toBeCloseTo(0.6);
    expect(steadiness(s, alive(s, 0)[0].id)).toBe(1);
  });
  it("never makes the hand perfectly steady", () => {
    const s = setup(quiet({ lastStand: { at: 3, hits: 1, steady: 0, shots: 1, grow: 1 } }));
    s.stand[1] = 1;
    expect(steadiness(s, alive(s, 1)[0].id)).toBeGreaterThan(0);
  });
});

describe("shaped bases", () => {
  const SH = quiet({ kit: ["square", "hex", "tri", "circle", "circle"] });
  it("each player draws the kit, and each shape gets its own number of soldiers", () => {
    const s = setup(SH);
    expect(s.bases.map((b) => b.shape).slice(0, 6)).toEqual(["square", "square", "hex", "hex", "tri", "tri"]);
    expect(garrison(s, s.bases[0])).toHaveLength(SH.shapes.square.soldiers);
    expect(garrison(s, s.bases[2])).toHaveLength(SH.shapes.hex.soldiers);
    expect(garrison(s, s.bases[4])).toHaveLength(SH.shapes.tri.soldiers);
    expect(() => placeBase(newGame(SH, 1), 500, 800, "tri")).not.toThrow();
  });
  function towards(shape: "square" | "hex") {
    const s = setup(SH);
    const b = s.bases.find((b) => b.owner === 1 && b.shape === shape)!;
    const me = alive(s, 0)[0];
    clear(s, [me, ...garrison(s, b)]);
    at(s, me, { x: b.x + 3, y: b.y + 600 });
    return { s, b, me, o: act(s, shot(me, b)) };
  }
  it("a fort's wall stops an enemy line, then is breached", () => {
    const { s, b, o } = towards("square");
    expect(o.killed).toHaveLength(0);
    expect(o.events.some((e) => e.kind === "stop" && e.base === b.id)).toBe(true);
    expect(s.bases[b.id].breached).toHaveLength(1);
    expect(s.marks.some((m) => m.t === "notch")).toBe(true);
    // the same line again goes through the gap, into the fort (the far wall still holds)
    s.current = 0; s.owed = 1;
    const me = alive(s, 0)[0];
    const first = o.events.find((e) => e.kind === "stop")!;
    const again = preview(s, shot(me, b));
    const stop2 = again.events.find((e) => e.kind === "stop" && e.base === b.id);
    expect(stop2?.edge).not.toBe(first.edge);
    expect(again.path.at(-1)!.y).toBeLessThan(first.at.y - 20);
  });
  it("a mirror's wall bounces an enemy line away", () => {
    const { b, o } = towards("hex");
    expect(o.events.some((e) => e.kind === "bounce" && e.base === b.id)).toBe(true);
    expect(o.path.length).toBeGreaterThan(2);
  });
  it("your own line leaving your prism splits in two", () => {
    const s = setup(SH);
    const tri = s.bases.find((b) => b.owner === 0 && b.shape === "tri")!;
    const me = garrison(s, tri)[0];
    const o = act(s, { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2, length: 900, bend: 0 });
    expect(o.paths).toHaveLength(2);
    expect(s.marks.filter((m) => m.t === "stroke")).toHaveLength(2);
  });
  it("your own walls don't stop your own lines", () => {
    const s = setup(SH);
    const fort = s.bases.find((b) => b.owner === 0 && b.shape === "square")!;
    const me = garrison(s, fort)[0];
    const o = preview(s, { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2, length: 900, bend: 0 });
    expect(o.events.filter((e) => e.kind === "stop")).toHaveLength(0);
    expect(baseEdges(fort)).toHaveLength(4);
  });
});

describe("ink as terrain", () => {
  function across(ink: Partial<RuleSet["ink"]>, owner: 0 | 1) {
    const s = setup(quiet({ ink: { ...CLASSIC.ink, ...ink } }));
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: 500, y: 1500 });
    // an old horizontal line at y=1000
    s.marks.push({ t: "stroke", kind: "shoot", owner, pts: Array.from({ length: 33 }, (_, i) => ({ x: 150 + i * 22, y: 1000 })), seed: 1, turn: 0 });
    return { s, o: preview(s, { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2 + 0.3, length: 1200, bend: 0 }) };
  }
  it("friction: dragging across dried ink costs range", () => {
    const plain = across({}, 1).o, rough = across({ friction: 200 }, 1).o;
    const len = (p: { x: number; y: number }[]) => p.reduce((a, q, i) => (i ? a + Math.hypot(q.x - p[i - 1].x, q.y - p[i - 1].y) : 0), 0);
    expect(len(plain.path)).toBeGreaterThan(len(rough.path) + 150);
    expect(rough.events.some((e) => e.kind === "friction")).toBe(true);
  });
  it("your own old ink bounces your line", () => {
    const { o } = across({ ownBounces: 1 }, 0);
    expect(o.events[0].kind).toBe("bounce");
    expect(o.path.at(-1)!.y).toBeGreaterThan(1000);
  });
  it("enemy ink stops it, when trenches are on", () => {
    const { o } = across({ enemyStops: true }, 1);
    expect(o.events[0].kind).toBe("stop");
    expect(o.path.at(-1)!.y).toBeCloseTo(1000, 0);
  });
  it("wet ink: only a player's newest line counts", () => {
    const { s } = across({ ownBounces: 1, fresh: 1 }, 0);
    const me = alive(s, 0)[0];
    const f: Flick = { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2 + 0.3, length: 1200, bend: 0 };
    expect(preview(s, f).events[0]?.kind).toBe("bounce");
    // a newer blue line somewhere else: the old one has dried
    s.marks.push({ t: "stroke", kind: "shoot", owner: 0, pts: [{ x: 900, y: 100 }, { x: 950, y: 150 }], seed: 2, turn: 1 });
    expect(preview(s, f).events.some((e) => e.kind === "bounce")).toBe(false);
  });
  it("the page edge can bounce a line", () => {
    const s = setup(quiet({ ink: { ...CLASSIC.ink, edgeBounces: 1 } }));
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: 900, y: 1000 });
    const o = preview(s, { soldierId: me.id, kind: "shoot", angle: 0, length: 400, bend: 0 });
    expect(o.events[0].kind).toBe("bounce");
    expect(o.path.at(-1)!.x).toBeCloseTo(700, 0);
  });
});

describe("found in review", () => {
  it("a mover who crosses out a base's last defender and stands in it takes it", () => {
    const s = setup(quiet({ win: "bases", capture: true }));
    const b = standing(s, 1)[0];
    const [last, ...rest] = garrison(s, b);
    rest.forEach((x) => (s.soldiers[x.id].alive = false));
    const me = alive(s, 0)[0];
    clear(s, [me, last, ...alive(s, 1)]);
    at(s, last, { x: b.x, y: b.y + 20 });
    at(s, me, { x: b.x, y: b.y + 320 });
    const o = act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 320, bend: 0 });
    expect(o.killed).toContain(last.id);
    expect(o.fell).toContain(b.id);
    expect(o.founded).toContain(b.id);
    expect(s.bases[b.id].owner).toBe(0);
  });
  it("a convoy arriving at a base that fell to this strike walks into the ruins (and retakes it with capture)", () => {
    const s = setup(quiet({ transfer: { max: 5, ambush: "none" }, capture: true }));
    const [from, to] = standing(s, 0);
    transfer(s, from.id, to.id, 3);
    const gar = garrison(s, s.bases[to.id]);
    gar.slice(1).forEach((x) => (s.soldiers[x.id].alive = false));
    const foe = alive(s, 1)[0];
    clear(s, [foe, gar[0], ...alive(s, 0).filter((x) => x.transit !== undefined)]);
    at(s, foe, { x: gar[0].x, y: gar[0].y - 400 });
    const o = act(s, { soldierId: foe.id, kind: "shoot", angle: Math.PI / 2, length: 500, bend: 0 });
    expect(o.fell).toContain(to.id);
    expect(o.arrived).toHaveLength(3);
    expect(o.founded).toContain(to.id);
    expect(s.bases[to.id].fallen).toBeUndefined();
  });
  it("a free send keeps the flick, once a turn, and isn't a strike", () => {
    const s = setup(quiet({ transfer: { max: 5, ambush: "all", free: true } }));
    const [a, b, c] = standing(s, 0);
    const o = transfer(s, a.id, b.id, 2);
    expect(o.again).toBe(true);
    expect(s.current).toBe(0);
    expect(canTransfer(s, c.id, b.id, 1)).toMatch(/one send/);
    const me = ready(s, 0)[0];
    act(s, { soldierId: me.id, kind: "shoot", angle: 0, length: 300, bend: 0 });
    expect(s.current).toBe(1);
    expect(s.transits[0].state).toBe("road");
  });
  it("a split line's two halves each get their own page-edge bounce", () => {
    const s = setup(quiet({ kit: ["tri", "circle", "circle", "circle", "circle"], ink: { ...CLASSIC.ink, edgeBounces: 1 } }));
    const tri = s.bases.find((b) => b.owner === 0 && b.shape === "tri")!;
    const me = garrison(s, tri)[0];
    const o = preview(s, { soldierId: me.id, kind: "shoot", angle: -Math.PI / 2, length: 3200, bend: 0 });
    expect(o.paths).toHaveLength(2);
    expect(new Set(o.events.filter((e) => e.kind === "bounce").map((e) => e.branch)).size).toBe(2);
  });
});
