// The core rules (RULES.md, "Core rules"), one test per rule and its edges.

import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase } from "./bot";
import {
  act, alive, owedFlick, canArrange, canFlick, canPlaceBase, canSend, columnSpots, garrison, hand, illegal, isRing, newGame, pathLen, preview, replay,
  type Action, type Flick, type GameState, type Player,
} from "./game";
import { CORE, RULES, SIZES, type CoreRules, type Size } from "./rules";

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;

/** A game past setup and positioning: blue (0) draws first, then red (1), alternately. */
function game(spots: [number, number][], soldiers = 3, rules: Partial<CoreRules> = {}): GameState {
  const size: Size = { name: "custom", bases: spots.length / 2, soldiers };
  const s = newGame(size, 42, undefined, { ...CORE, ...rules });
  for (const [x, y] of spots) act(s, { t: "base", x, y });
  act(s, { t: "ready" });
  act(s, { t: "ready" });
  return s;
}

/** Stand soldier `id` exactly here (tests only: the page is arranged by hand). */
function put(s: GameState, id: number, x: number, y: number) {
  s.soldiers[id].x = x;
  s.soldiers[id].y = y;
}
/** Soldiers of `p` jotted into base `b`. */
const of = (s: GameState, b: number) => s.soldiers.filter((x) => x.home === b);
/** Park soldiers far away, in the corner of their own half, out of every line under test. */
function park(s: GameState, ids: number[]) {
  ids.forEach((id, k) => {
    const x = s.soldiers[id];
    put(s, id, 900 - (k % 4) * 20, x.owner === 0 ? 1650 - Math.floor(k / 4) * 20 : 50 + Math.floor(k / 4) * 20);
  });
}
const flick = (soldier: number, kind: Flick["kind"], angle: number, length: number, wob = 1): Action => ({ t: "flick", soldier, kind, angle, length, bend: 0, wob });
const still = { lungeWallShake: 0, lungeKillShake: 0 };

// Blue bases along the bottom, red along the top; red base 1 sits at (300, 600).
const PAGE: [number, number][] = [[300, 1300], [300, 600], [700, 1300], [700, 300]];

describe("setup and positioning", () => {
  it("offers Quick (3 x 8) and Classic (5 x 10)", () => {
    expect(SIZES.quick).toMatchObject({ bases: 3, soldiers: 8 });
    expect(SIZES.classic).toMatchObject({ bases: 5, soldiers: 10 });
  });

  it("alternates bases, jots each full, then positions: blue arranges first, red sees it, then blue flicks", () => {
    const s = newGame(SIZES.quick, 7);
    const spots: [number, number][] = [[300, 1300], [300, 300], [700, 1300], [700, 300], [500, 1050], [500, 550]];
    spots.forEach(([x, y], k) => {
      expect(s.current).toBe((k % 2) as Player);
      act(s, { t: "base", x, y });
    });
    expect(alive(s, 0)).toHaveLength(24);
    expect(alive(s, 1)).toHaveLength(24);
    expect(s.phase).toBe("position");
    expect(s.current).toBe(0);
    act(s, { t: "ready" });
    expect(s.current).toBe(1);
    act(s, { t: "ready" });
    expect(s).toMatchObject({ phase: "play", current: 0, turn: 1, left: 1 });
  });

  it("custom sizes jot what you asked for", () => {
    const s = game([[300, 1300], [300, 300]], 12);
    expect(alive(s, 0)).toHaveLength(12);
    expect(s.bases).toHaveLength(2);
  });

  it("refuses bases over the margin, overlapping, or on top of the enemy", () => {
    const s = newGame(SIZES.quick, 1);
    expect(canPlaceBase(s, 40, 700)).toMatch(/edge/);
    act(s, { t: "base", x: 400, y: 700 });
    expect(canPlaceBase(s, 450, 700)).toMatch(/enemy/);
  });

  it("positioning: in the base or up to 20 outside its wall, never in theirs, never on someone", () => {
    const s = newGame({ name: "custom", bases: 1, soldiers: 3 }, 3);
    act(s, { t: "base", x: 300, y: 1300 });
    act(s, { t: "base", x: 300, y: 1000 - 100 });
    const [a, b] = of(s, 0);
    const r = RULES.baseRadius;
    expect(canArrange(s, a.id, 300, 1300)).toBeNull();
    expect(canArrange(s, a.id, 300 + r + 19, 1300)).toBeNull();
    expect(canArrange(s, a.id, 300 + r + 21, 1300)).toMatch(/too far/);
    expect(canArrange(s, a.id, b.x + 3, b.y)).toMatch(/on top/);
    expect(canArrange(s, of(s, 1)[0].id, 300, 1000)).toMatch(/not yours/);
    act(s, { t: "arrange", soldier: a.id, x: 300, y: 1300 - r - 15 });
    expect(s.soldiers[a.id].y).toBe(1300 - r - 15);
    act(s, { t: "ready" });
    // red, arranging second: toward blue's base is fine, into it isn't
    const red = of(s, 1)[0];
    expect(canArrange(s, red.id, 300, 900 + r + 10)).toBeNull();
    expect(canArrange(s, a.id, 300, 1300)).toMatch(/not yours/);
    act(s, { t: "ready" });
    expect(canArrange(s, red.id, 300, 900)).toMatch(/not now/);
  });
});

describe("snipe", () => {
  it("pierces: every enemy on the line is crossed out, and the sniper stays put", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0], [a, b] = of(s, 1);
    park(s, s.soldiers.filter((x) => x.id !== me.id && x.id !== a.id && x.id !== b.id).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, a.id, 150, 800); put(s, b.id, 150, 700);
    const o = act(s, flick(me.id, "snipe", UP, 600));
    expect(o.killed.sort()).toEqual([a.id, b.id].sort());
    expect(s.soldiers[me.id]).toMatchObject({ x: 150, y: 1000, alive: true });
  });

  it("power loss: a wall costs 10% of what's left, a soldier 5%, in order along the line", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0], [inside, beyond] = of(s, 1);
    park(s, s.soldiers.filter((x) => ![me.id, inside.id, beyond.id].includes(x.id)).map((x) => x.id));
    // from the open, straight up through red base 1 (walls at d = 338 and 462), a man at its centre (d = 400)
    put(s, me.id, 300, 1000); put(s, inside.id, 300, 600); put(s, beyond.id, 300, 350);
    let end = 700;
    end = 338 + (end - 338) * 0.9; // in through the wall
    end = 400 + (end - 400) * 0.95; // a man crossed out
    end = 462 + (end - 462) * 0.9; // out through the far wall
    const o = preview(s, { soldier: me.id, kind: "snipe", angle: UP, length: 700, bend: 0, wob: 0 });
    expect(o.killed).toEqual([inside.id]);
    expect(pathLen(o.path)).toBeCloseTo(end, 3);
    expect(o.events.map((e) => e.kind)).toEqual(["wall", "kill", "wall"]);
    // at full strength the line would have reached the man beyond (d = 650); tapered, it falls short
    expect(o.killed).not.toContain(beyond.id);
    const plain = preview({ ...s, rules: { ...s.rules, snipeWallLoss: 0, snipeKillLoss: 0 } }, { soldier: me.id, kind: "snipe", angle: UP, length: 700, bend: 0, wob: 0 });
    expect(plain.killed).toContain(beyond.id);
  });

  it("the wall at your back is free: a line leaving your own base keeps its length", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    put(s, me.id, 700, 1300);
    const o = preview(s, { soldier: me.id, kind: "snipe", angle: Math.PI / 4, length: 400, bend: 0, wob: 0 });
    expect(o.events).toEqual([expect.objectContaining({ kind: "wall", free: true })]);
    expect(pathLen(o.path)).toBeCloseTo(400, 3);
  });

  it("two with one bullet: a snipe that takes two flicks again, and it chains", () => {
    const s = game(PAGE, 4);
    const me = of(s, 0)[0];
    const reds = alive(s, 1);
    park(s, s.soldiers.filter((x) => x.owner === 1 || (x.id !== me.id && x.owner === 0)).map((x) => x.id));
    put(s, me.id, 150, 1000);
    put(s, reds[0].id, 150, 900); put(s, reds[1].id, 150, 850);
    let o = act(s, flick(me.id, "snipe", UP, 300));
    expect(o.killed).toHaveLength(2);
    expect(o).toMatchObject({ earned: true, again: true });
    expect(s).toMatchObject({ current: 0, left: 1 });
    put(s, reds[2].id, 450, 1000); put(s, reds[3].id, 500, 1000);
    expect(owedFlick(s)).toEqual({ soldier: me.id, n: 1 });
    o = act(s, flick(me.id, "snipe", 0, 400));
    expect(o).toMatchObject({ earned: true, again: true });
    expect(owedFlick(s)).toEqual({ soldier: me.id, n: 1 });
    // one isn't enough
    put(s, reds[4].id, 150, 700);
    o = act(s, flick(me.id, "snipe", UP, 400));
    expect(o.killed).toEqual([reds[4].id]);
    expect(o).toMatchObject({ earned: false, again: false, handover: true });
    expect(s.current).toBe(1);
    expect(owedFlick(s)).toBeUndefined();
  });

  it("owedFlick: nothing owed on a fresh turn, one owed after a two-kill snipe", () => {
    const s = game(PAGE, 4);
    expect(owedFlick(s)).toBeUndefined();
    const me = of(s, 0)[0];
    const reds = alive(s, 1);
    park(s, s.soldiers.filter((x) => x.owner === 1 || (x.id !== me.id && x.owner === 0)).map((x) => x.id));
    put(s, me.id, 150, 1000);
    put(s, reds[0].id, 150, 900); put(s, reds[1].id, 150, 850);
    act(s, flick(me.id, "snipe", UP, 300));
    expect(owedFlick(s)).toEqual({ soldier: me.id, n: 1 });
  });
});

describe("lunge", () => {
  it("runs as far as a shot, crosses out whoever he passes, and stands where the ink stops", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0], foe = of(s, 1)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id && x.id !== foe.id).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, foe.id, 150, 800);
    const o = act(s, flick(me.id, "lunge", UP, 400));
    expect(o.killed).toEqual([foe.id]);
    expect(o.movedTo!.y).toBeCloseTo(600, 5);
    expect(s.soldiers[me.id].alive).toBe(true);
    expect(s.soldiers[me.id].x).toBeCloseTo(150, 6);
    expect(s.marks.some((m) => m.t === "cross" && m.kind === "moved" && m.id === me.id && m.y === 1000)).toBe(true);
  });

  it("a lunge kill earns another lunge by the same soldier, shakier each link; stop turns it down", () => {
    const s = game(PAGE, 3, still);
    const [me, mate] = of(s, 0), foe = of(s, 1)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id && x.id !== foe.id && x.id !== mate.id).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, foe.id, 150, 800);
    const o = act(s, flick(me.id, "lunge", UP, 400));
    expect(o).toMatchObject({ earned: true, again: true });
    expect(s.chain).toEqual({ soldier: me.id, link: 1 });
    expect(canFlick(s, mate.id)).toBe(false);
    expect(canFlick(s, me.id, "snipe")).toBe(false);
    expect(canFlick(s, me.id, "lunge")).toBe(true);
    expect(hand(s, me.id, "lunge").tremor).toBeCloseTo(CORE.lungeLinkTremor, 9);
    expect(illegal(s, flick(mate.id, "snipe", 0, 400))).toMatch(/earned lunge/);
    const stop = act(s, { t: "stop" });
    expect(stop.handover).toBe(true);
    expect(s.current).toBe(1);
    expect(s.chain).toBeUndefined();
  });

  it("a miss ends the chain", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0], foe = of(s, 1)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id && x.id !== foe.id).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, foe.id, 150, 800);
    act(s, flick(me.id, "lunge", UP, 400));
    const o = act(s, flick(me.id, "lunge", 0, 300));
    expect(o).toMatchObject({ earned: false, handover: true });
  });

  it("through a base: legal, kills inside, pays shake at both walls, lives if he lands beyond", () => {
    const s = game(PAGE, 3);
    const me = of(s, 0)[0], [a, b, c] = of(s, 1);
    park(s, s.soldiers.filter((x) => ![me.id, a.id, b.id, c.id].includes(x.id)).map((x) => x.id));
    put(s, me.id, 300, 1000); put(s, a.id, 300, 630); put(s, b.id, 302, 580); put(s, c.id, 340, 610);
    const o = act(s, flick(me.id, "lunge", UP, 750, 12345));
    const walls = o.events.filter((e) => e.kind === "wall");
    expect(walls).toHaveLength(2);
    for (const w of walls) expect(Math.abs(w.jolt!)).toBeGreaterThan(0);
    expect(o.killed).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(o.lost).toBe(false);
    expect(s.soldiers[me.id].alive).toBe(true);
    // he lands beyond the base: nowhere near its wall
    expect(Math.hypot(o.movedTo!.x - 300, o.movedTo!.y - 600)).toBeGreaterThan(RULES.baseRadius);
  });

  it("landing inside an enemy base with its men at home: they shoot him, but his kills on the way stand", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0], [onPath, home] = of(s, 1);
    park(s, s.soldiers.filter((x) => ![me.id, onPath.id, home.id].includes(x.id)).map((x) => x.id));
    put(s, me.id, 300, 1000); put(s, onPath.id, 300, 800); put(s, home.id, 335, 600);
    const o = act(s, flick(me.id, "lunge", UP, 400));
    expect(o).toMatchObject({ lost: true, crashed: 1, killed: [onPath.id], earned: false, handover: true });
    expect(o.movedTo).toBeUndefined();
    expect(s.soldiers[onPath.id].alive).toBe(false);
    expect(s.soldiers[me.id].alive).toBe(false);
    const lost = s.marks.filter((m) => m.t === "cross" && m.kind === "lost");
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ x: 300 });
  });

  it("landing in an empty ring is safe", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    put(s, me.id, 300, 1000);
    expect(isRing(s, s.bases[1])).toBe(true);
    const o = act(s, flick(me.id, "lunge", UP, 400));
    expect(o).toMatchObject({ lost: false });
    expect(o.crashed).toBeUndefined();
    expect(s.soldiers[me.id]).toMatchObject({ alive: true });
  });

  it("killing the last man inside on the way in makes it a ring: he lands safely, and lunges again", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0], last = of(s, 1)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id && x.id !== last.id).map((x) => x.id));
    put(s, me.id, 300, 1000); put(s, last.id, 300, 640);
    expect(garrison(s, s.bases[1])).toHaveLength(1);
    const o = act(s, flick(me.id, "lunge", UP, 400));
    expect(o).toMatchObject({ lost: false, killed: [last.id], earned: true });
  });

  it("off the page, he's gone", () => {
    const s = game(PAGE, 3, still);
    const me = of(s, 0)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    put(s, me.id, 300, 1000);
    const o = act(s, flick(me.id, "lunge", DOWN, 1800));
    expect(o).toMatchObject({ lost: true });
    expect(o.crashed).toBeUndefined();
    expect(s.soldiers[me.id]).toMatchObject({ alive: false, y: 1000 });
  });

  it("the same flick and seed always shake the same way", () => {
    const s = game(PAGE, 3);
    const me = of(s, 0)[0];
    put(s, me.id, 300, 1000);
    const f = { soldier: me.id, kind: "lunge" as const, angle: UP, length: 750, bend: 0.02, wob: 99 };
    expect(preview(s, f)).toEqual(preview(s, f));
    expect(preview(s, f).path).not.toEqual(preview(s, { ...f, wob: 100 }).path);
  });
});

describe("send", () => {
  // blue: base 0 (300, 1300) and base 2 (700, 1300); red base 3 at (700, 300)
  it("is free and once a turn, up to 5, and only between your own bases", () => {
    const s = game(PAGE, 8);
    expect(canSend(s, 0, 2, 6)).toMatch(/at most 5/);
    expect(canSend(s, 0, 1, 1)).toMatch(/yours/);
    act(s, { t: "send", from: 0, to: 2, n: 5 });
    expect(s).toMatchObject({ current: 0, left: 1, sent: true });
    expect(canSend(s, 2, 0, 1)).toMatch(/one send/);
    // the ones going stand at home until the pen changes hands, and can't flick
    const going = s.convoys[0].ids;
    expect(going).toHaveLength(5);
    for (const id of going) expect(canFlick(s, id)).toBe(false);
  });

  it("walks out between turns, is on the road for exactly one enemy turn, and a line across it crosses them out", () => {
    const s = game(PAGE, 8);
    park(s, of(s, 1).concat(of(s, 3)).map((x) => x.id));
    act(s, { t: "send", from: 0, to: 2, n: 3 });
    const ids = s.convoys[0].ids;
    const o = act(s, { t: "stop" });
    park(s, alive(s, 0).filter((x) => !ids.includes(x.id)).map((x) => x.id));
    expect(o.walked).toEqual([0]);
    expect(s.convoys[0].state).toBe("road");
    // on the road: a column across the middle, in the open
    const spots = columnSpots(s.convoys[0].road, 3);
    ids.forEach((id, k) => expect(s.soldiers[id]).toMatchObject(spots[k]));
    expect(ids.every((id) => !canFlick(s, id))).toBe(true);
    // red snipes along the road and takes two of them, which earns red another flick
    const red = alive(s, 1)[0];
    put(s, red.id, 150, 1300);
    const shot = act(s, flick(red.id, "snipe", 0, 700));
    expect(shot.killed).toHaveLength(3);
    expect(shot.again).toBe(true);
    expect(s.convoys[0].state).toBe("cut");
  });

  it("the survivors arrive at the start of your next turn, and an empty ring is manned again", () => {
    const s = game(PAGE, 4);
    park(s, of(s, 1).concat(of(s, 3)).map((x) => x.id));
    // empty blue base 2: its men stand off in the corner
    park(s, of(s, 2).map((x) => x.id));
    expect(isRing(s, s.bases[2])).toBe(true);
    act(s, { t: "send", from: 0, to: 2, n: 2 });
    const ids = s.convoys[0].ids;
    act(s, { t: "stop" });
    const o = act(s, { t: "stop" }); // red's turn passes; blue's convoy arrives
    expect(o.arrived).toEqual([0]);
    expect(s.current).toBe(0);
    for (const id of ids) {
      expect(Math.hypot(s.soldiers[id].x - 700, s.soldiers[id].y - 1300)).toBeLessThan(RULES.baseRadius);
      expect(canFlick(s, id)).toBe(true);
    }
    expect(isRing(s, s.bases[2])).toBe(false);
  });

  it("sending everyone who could flick ends the turn", () => {
    const s = game(PAGE, 2);
    park(s, of(s, 2).map((x) => x.id));
    for (const x of of(s, 2)) x.alive = false;
    const o = act(s, { t: "send", from: 0, to: 2, n: 2 });
    expect(o.handover).toBe(true);
    expect(s.current).toBe(1);
  });
});

describe("last stand, and winning", () => {
  it("down to 4, a side flicks twice a turn with a steadier hand", () => {
    const s = game(PAGE, 3);
    const me = of(s, 0)[0];
    const reds = alive(s, 1);
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    for (const x of reds.slice(5)) x.alive = false; // red has 5
    put(s, me.id, 150, 1000); put(s, reds[0].id, 150, 800);
    const o = act(s, flick(me.id, "snipe", UP, 300));
    expect(o.stood).toEqual([1]);
    expect(s.stand[1]).toBeGreaterThan(0);
    expect(s.marks.at(-1)).toMatchObject({ t: "stand", owner: 1 });
    expect(s.current).toBe(1);
    expect(s.left).toBe(2);
    expect(hand(s, reds[1].id, "snipe").mult).toBe(CORE.lastStandSteady);
    act(s, flick(reds[1].id, "snipe", 0, 300));
    expect(s.current).toBe(1); // the second flick of the two
    act(s, flick(reds[1].id, "snipe", 0, 300));
    expect(s.current).toBe(0);
  });

  it("cross out every enemy soldier to win", () => {
    const s = game(PAGE, 3);
    const me = of(s, 0)[0];
    for (const x of alive(s, 1).slice(1)) x.alive = false;
    const last = alive(s, 1)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, last.id, 150, 800);
    const o = act(s, flick(me.id, "snipe", UP, 300));
    expect(o.again).toBe(false);
    expect(s).toMatchObject({ phase: "over", winner: 0 });
    expect(() => act(s, { t: "stop" })).toThrow();
  });
});

describe("the record", () => {
  function botWar(size: Size, seed: number, maxTurns = 300) {
    const s = newGame(size, seed);
    let k = seed;
    while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < maxTurns) act(s, botAction(s, 1, k++));
    return s;
  }

  it("a bot war plays to the end and replays from its actions to the same page", () => {
    const s = botWar(SIZES.quick, 5);
    expect(s.phase).toBe("over");
    const again = replay(s.size, s.seed, JSON.parse(JSON.stringify(s.actions)), s.rules);
    expect(again).toEqual(s);
  });

  it("actions are plain JSON, and illegal ones are refused without changing anything", () => {
    const s = game(PAGE, 3);
    const before = JSON.stringify(s);
    expect(() => act(s, flick(of(s, 1)[0].id, "snipe", 0, 300))).toThrow(/illegal/);
    expect(() => act(s, { t: "send", from: 1, to: 3, n: 1 })).toThrow(/illegal/);
    expect(() => act(s, { t: "flick", soldier: of(s, 0)[0].id, kind: "snipe", angle: NaN, length: 300, bend: 0, wob: 0 })).toThrow(/bad numbers/);
    expect(JSON.stringify(s)).toBe(before);
  });
});
