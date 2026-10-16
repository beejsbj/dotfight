// Volleys (docs/volleys.md): both sides aim in secret, then both lines go at
// once, traced against the page as the volley began. One test per rule and
// each awkward case the rules pick an answer for.

import { describe, expect, it } from "vitest";
import { botAction, botArrange, botBase } from "./bot";
import {
  act, alive, canFlick, canPlaceBase, illegal, linesFor, newGame, planIllegal, volleys,
  type Action, type Flick, type GameState, type Plan, type Player,
} from "./game";
import { file, fromRecord, readDrawer, readSave, steps, toRecord, unfile } from "./record";
import { CORE, LONG, SIZES, VOLLEY, type CoreRules, type Size } from "./rules";
import { botPlan, Draft } from "./volley";

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const RIGHT = 0;

// flat walls and no shake: a lunger runs dead straight
const still: Partial<CoreRules> = { lungeWallShake: 0, lungeKillShake: 0, garrison: null };
const VOLLEYS: Partial<CoreRules> = { ...still, volley: VOLLEY };

/** A game past setup and positioning: blue (0) draws first, then red (1), alternately. */
function game(spots: [number, number][], soldiers = 3, rules: Partial<CoreRules> = VOLLEYS): GameState {
  const size: Size = { name: "custom", bases: spots.length / 2, soldiers };
  const s = newGame(size, 42, undefined, { ...CORE, ...rules });
  for (const [x, y] of spots) act(s, { t: "base", x, y });
  act(s, { t: "ready" });
  act(s, { t: "ready" });
  return s;
}
function put(s: GameState, id: number, x: number, y: number) {
  s.soldiers[id].x = x;
  s.soldiers[id].y = y;
}
/** Park everyone else far away in a corner of their own half, out of every line under test. */
function parkBut(s: GameState, keep: number[]) {
  let k = 0;
  for (const x of s.soldiers) {
    if (keep.includes(x.id)) continue;
    put(s, x.id, 940 - (k % 3) * 22, x.owner === 0 ? 1660 - Math.floor(k / 3) * 22 : 40 + Math.floor(k / 3) * 22);
    k++;
  }
}
const f = (soldier: number, kind: Flick["kind"], angle: number, length: number): Flick => ({ soldier, kind, angle, length, bend: 0, wob: 1 });
const line = (...flicks: Flick[]): Plan => ({ flicks });
const vol = (a: Plan | null, b: Plan | null): Action => ({ t: "volley", a, b });
const blue = (s: GameState) => s.soldiers.filter((x) => x.owner === 0).map((x) => x.id);
const red = (s: GameState) => s.soldiers.filter((x) => x.owner === 1).map((x) => x.id);

// Blue bases along the bottom, red along the top; red base 1 sits at (300, 600).
const PAGE: [number, number][] = [[300, 1300], [300, 600], [700, 1300], [700, 300]];

describe("volleys: gated on rules.volley", () => {
  it("no game played by turns has volleys: core and long rules carry none", () => {
    expect(CORE.volley).toBeNull();
    expect(LONG.volley).toBeNull();
    const s = game(PAGE, 3, still);
    expect(volleys(s)).toBe(false);
    expect(s.vol).toBeUndefined();
    expect(illegal(s, vol(null, null))).toBe("not a volley");
  });

  it("a core war, bot v bot, never takes a volley path", () => {
    const s = newGame(SIZES.quick, 11);
    let k = 11;
    while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
    while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
    while (s.phase === "play" && s.turn < 400) { act(s, botAction(s, 1, k++)); expect(s.vol).toBeUndefined(); }
    expect(s.actions.some((a) => a.t === "volley")).toBe(false);
    expect(toRecord(s).v).toBe(2);
  });

  it("a long war never plays in volleys, even with the block set", () => {
    const s = newGame(SIZES.long, 3, undefined, { ...LONG, volley: VOLLEY });
    expect(volleys(s)).toBe(false);
  });

  it("after positioning, play waits for a volley: no lone flick, send or stop", () => {
    const s = game(PAGE);
    expect(s).toMatchObject({ phase: "play", turn: 1, current: 0, vol: { first: 0, stage: "aim" } });
    const me = blue(s)[0];
    expect(canFlick(s, me)).toBe(true); // the page aims with the ordinary checks
    expect(illegal(s, { t: "flick", ...f(me, "snipe", UP, 300) })).toMatch(/volley/);
    expect(illegal(s, { t: "send", from: 0, to: 2, n: 1 })).toMatch(/volley/);
    expect(illegal(s, { t: "stop" })).toMatch(/volley/);
    expect(illegal(s, vol(null, null))).toBeNull();
  });
});

describe("volleys: both lines against the page as it began", () => {
  it("mutual kills: each sniper crosses the other out, and both lines are drawn", () => {
    const s = game(PAGE);
    const [a] = blue(s), [b] = red(s);
    parkBut(s, [a, b]);
    put(s, a, 500, 1000);
    put(s, b, 500, 700);
    const o = act(s, vol(line(f(a, "snipe", UP, 400)), line(f(b, "snipe", DOWN, 400))));
    expect(s.soldiers[a].alive).toBe(false);
    expect(s.soldiers[b].alive).toBe(false);
    expect(o.volley!.lines.map((l) => [l.owner, l.o.killed])).toEqual([[0, [b]], [1, [a]]]);
    const added = s.marks.slice(-4);
    expect(added.map((m) => m.t)).toEqual(["stroke", "stroke", "cross", "cross"]);
    // neither took two: the volley is over and whoever aimed second aims first next
    expect(s).toMatchObject({ turn: 2, current: 1, vol: { first: 1, stage: "aim" } });
  });

  it("a lunger crossed out as he goes still runs: crossed where he stood, his kills stand", () => {
    const s = game(PAGE);
    const [sn] = blue(s), [r] = red(s), x = blue(s)[1];
    parkBut(s, [sn, r, x]);
    put(s, sn, 200, 700);
    put(s, r, 500, 700);
    put(s, x, 500, 900);
    const o = act(s, vol(line(f(sn, "snipe", RIGHT, 500)), line(f(r, "lunge", DOWN, 400))));
    const L = o.volley!.lines[1];
    expect(L.fell).toBe(true);
    expect(L.o.killed).toEqual([x]);
    expect(s.soldiers[x].alive).toBe(false);
    expect(s.soldiers[r]).toMatchObject({ alive: false, x: 500, y: 700 });
    // no cross for where he left, no stand where he'd have landed: one cross, blue's, where he stood
    expect(s.marks.filter((m) => m.t === "cross" && (m.kind === "moved" || m.kind === "lost"))).toHaveLength(0);
    expect(L.earned).toBeFalsy(); // a lunger who fell earns nothing
  });

  it("enemy ink finds a lunger where he set off, never where he lands", () => {
    const s = game(PAGE);
    const [sn] = blue(s), [r] = red(s);
    parkBut(s, [sn, r]);
    put(s, sn, 200, 1000);
    put(s, r, 500, 700); // lunges down onto blue's line, which runs where he lands
    const o = act(s, vol(line(f(sn, "snipe", RIGHT, 600)), line(f(r, "lunge", DOWN, 300))));
    expect(o.volley!.lines[0].o.killed).toEqual([]);
    expect(s.soldiers[r]).toMatchObject({ alive: true, x: 500, y: 1000 });
  });

  it("lines never meet lines: two lungers' paths cross and both run on", () => {
    const s = game(PAGE);
    const [l1] = blue(s), [l2] = red(s);
    parkBut(s, [l1, l2]);
    put(s, l1, 400, 1000);
    put(s, l2, 300, 800);
    act(s, vol(line(f(l1, "lunge", UP, 300)), line(f(l2, "lunge", RIGHT, 300))));
    expect(s.soldiers[l1]).toMatchObject({ alive: true, x: 400, y: 700 });
    expect(s.soldiers[l2]).toMatchObject({ alive: true, x: 600, y: 800 });
  });

  it("a lunger landing in a base its men are leaving this volley is shot: they were home at 'three'", () => {
    const s = game(PAGE);
    const home1 = s.soldiers.filter((x) => x.home === 1).map((x) => x.id); // red base 1 at (300, 600)
    const [l] = blue(s);
    parkBut(s, [l, home1[0]]);
    put(s, l, 300, 900);
    put(s, home1[0], 330, 590); // red's only man home, lunging out of it
    const o = act(s, vol(line(f(l, "lunge", UP, 300)), line(f(home1[0], "lunge", RIGHT, 300))));
    expect(o.volley!.lines[0].o.crashed).toBe(1);
    expect(s.soldiers[l].alive).toBe(false);
    expect(s.soldiers[home1[0]]).toMatchObject({ alive: true, x: 630 }); // he got away
  });

  it("a last stand's sniper empties a base and its lunger lands there: still shot, they fire as they fall", () => {
    const s = game(PAGE);
    s.stand[0] = 1; // blue's last stand: two lines
    const home1 = s.soldiers.filter((x) => x.home === 1).map((x) => x.id);
    const [l, sn] = blue(s);
    parkBut(s, [l, sn, home1[0], home1[1]]);
    put(s, l, 300, 900);
    put(s, sn, 100, 590);
    put(s, home1[0], 270, 590);
    put(s, home1[1], 330, 590);
    const o = act(s, vol(line(f(sn, "snipe", RIGHT, 400), f(l, "lunge", UP, 300)), null));
    expect(o.volley!.lines[0].o.killed.sort()).toEqual([...home1.slice(0, 2)].sort());
    expect(o.volley!.lines[1].o.crashed).toBe(1);
    expect(s.soldiers[l].alive).toBe(false);
  });
});

describe("volleys: extra flicks, taken right after", () => {
  it("two with one bullet: blue's run comes after the volley, then the next volley", () => {
    const s = game(PAGE);
    const [a] = blue(s), [r1, r2] = red(s);
    parkBut(s, [a, r1, r2]);
    put(s, a, 500, 1000);
    put(s, r1, 500, 800);
    put(s, r2, 500, 700);
    const o = act(s, vol(line(f(a, "snipe", UP, 500)), null));
    expect(o.volley!.lines[0].earned).toBe(true);
    expect(s).toMatchObject({ current: 0, left: 1, sent: true, turn: 1, vol: { stage: "follow" } });
    expect(illegal(s, vol(null, null))).toBe("not a volley");
    expect(illegal(s, { t: "send", from: 0, to: 2, n: 1 })).toMatch(/volley/);
    act(s, { t: "flick", ...f(a, "snipe", RIGHT, 300) }); // a miss ends the run
    expect(s).toMatchObject({ turn: 2, current: 0, vol: { first: 0, stage: "aim" } }); // he held the pen last
  });

  it("both earned: the side that aimed second runs first, then the other", () => {
    const s = game(PAGE);
    const [a, b1, b2] = blue(s), [r, r1, r2] = red(s);
    parkBut(s, [a, b1, b2, r, r1, r2]);
    put(s, a, 400, 1000); put(s, r1, 400, 800); put(s, r2, 400, 700);
    put(s, r, 600, 700); put(s, b1, 600, 900); put(s, b2, 600, 1000);
    act(s, vol(line(f(a, "snipe", UP, 500)), line(f(r, "snipe", DOWN, 500))));
    expect(s).toMatchObject({ current: 1, left: 1, vol: { stage: "follow", then: { p: 0, left: 1 } } });
    act(s, { t: "stop" });
    expect(s).toMatchObject({ current: 0, left: 1, vol: { stage: "follow" } });
    expect(s.vol!.then).toBeUndefined();
    act(s, { t: "stop" });
    expect(s).toMatchObject({ turn: 2, current: 0, vol: { first: 0, stage: "aim" } });
  });

  it("a lunge that kills and lives earns lunge-on: a chain, as in a turn", () => {
    const s = game(PAGE);
    const [l] = blue(s), [r1, r2] = red(s);
    parkBut(s, [l, r1, r2]);
    put(s, l, 500, 1100);
    put(s, r1, 500, 950);
    put(s, r2, 500, 750);
    act(s, vol(line(f(l, "lunge", UP, 200)), null));
    expect(s).toMatchObject({ current: 0, left: 1, chain: { soldier: l, link: 1 }, vol: { stage: "follow" } });
    expect(canFlick(s, l, "snipe")).toBe(false);
    act(s, { t: "flick", ...f(l, "lunge", UP, 200) });
    expect(s.soldiers[r2].alive).toBe(false);
    expect(s).toMatchObject({ current: 0, left: 1, chain: { soldier: l, link: 2 } });
    act(s, { t: "stop" });
    expect(s).toMatchObject({ turn: 2, vol: { stage: "aim" } });
  });
});

describe("volleys: sends on the road for exactly one volley", () => {
  it("home through the volley it's sent in, on the road through the next, in after it", () => {
    const s = game(PAGE);
    const plan: Plan = { send: { from: 0, to: 2, n: 2 }, flicks: [] };
    expect(planIllegal(s, 0, plan)).toBeNull();
    act(s, vol(plan, null));
    const c = s.convoys[0];
    expect(c).toMatchObject({ owner: 0, state: "road" });
    expect(c.ids.every((id) => Math.abs(s.soldiers[id].y - 1300) < 1 && s.soldiers[id].x > 400 && s.soldiers[id].x < 600)).toBe(true);
    expect(c.ids.every((id) => !canFlick(s, id))).toBe(true);
    act(s, vol(null, null));
    expect(c.state).toBe("arrived");
    expect(c.ids.every((id) => s.soldiers[id].home === 2 && s.soldiers[id].convoy === undefined)).toBe(true);
  });

  it("a convoy on the road is a target in the next volley", () => {
    const s = game(PAGE);
    act(s, vol({ send: { from: 0, to: 2, n: 2 }, flicks: [] }, null));
    const c = s.convoys[0];
    const [r] = red(s);
    put(s, r, 500, 1100);
    act(s, vol(null, line(f(r, "snipe", DOWN, 300))));
    expect(c.ids.every((id) => !s.soldiers[id].alive)).toBe(true);
    expect(c.state).toBe("cut");
  });

  it("a send never takes the man drawing a line, and must still find its men without him", () => {
    const s = game(PAGE);
    const home0 = s.soldiers.filter((x) => x.home === 0).map((x) => x.id);
    expect(planIllegal(s, 0, { send: { from: 0, to: 2, n: 3 }, flicks: [f(home0[0], "snipe", UP, 300)] })).toMatch(/not that many/);
    const d = new Draft(s.turn);
    expect(d.send(s, 0, { from: 0, to: 2, n: 2 })).toBeNull();
    const going = d.barred(s, 0);
    expect(going.size).toBe(2);
    // the page bars the two going; the one staying flicks, and the send still finds its two
    const stay = home0.find((id) => !going.has(id))!;
    expect(d.take(s, 0, f(stay, "snipe", UP, 300))).toBeNull();
    expect(d.barred(s, 0)).toEqual(new Set([...going, stay]));
    expect(d.take(s, 0, f([...going][0], "snipe", UP, 300))).toBe("one line a volley");
    act(s, d.action());
    expect(s.convoys[0].ids.sort()).toEqual([...going].sort());
  });
});

describe("volleys: last stand, draws, the end", () => {
  it("a side in its last stand draws two lines a volley, by two men; the other side one", () => {
    const s = game(PAGE);
    s.stand[0] = 1;
    const [a, b] = blue(s), [r, q] = red(s);
    expect(linesFor(s, 0)).toBe(2);
    expect(linesFor(s, 1)).toBe(1);
    expect(planIllegal(s, 0, line(f(a, "snipe", UP, 300), f(b, "snipe", UP, 300)))).toBeNull();
    expect(planIllegal(s, 0, line(f(a, "snipe", UP, 300), f(a, "lunge", UP, 300)))).toBe("one line a man");
    expect(planIllegal(s, 1, line(f(r, "snipe", DOWN, 300), f(q, "snipe", DOWN, 300)))).toBe("one line a volley");
    expect(planIllegal(s, 1, line(f(a, "snipe", DOWN, 300)))).toBe("not his to flick");
  });

  it("a volley that takes a side down to four begins its last stand", () => {
    const s = game(PAGE);
    const [a] = blue(s), reds = red(s);
    parkBut(s, [a, reds[0], reds[1]]);
    put(s, a, 500, 1000); put(s, reds[0], 500, 800); put(s, reds[1], 500, 700);
    const o = act(s, vol(line(f(a, "snipe", UP, 500)), null));
    expect(alive(s, 1)).toHaveLength(4);
    expect(o.stood).toEqual([1]);
    act(s, { t: "stop" });
    expect(linesFor(s, 1)).toBe(2);
  });

  it("crossed out on both sides in the same volley: a draw, filed and shown as one", () => {
    const s = game([[300, 1300], [300, 300]], 1);
    const [a] = blue(s), [b] = red(s);
    put(s, a, 500, 1000);
    put(s, b, 500, 700);
    act(s, vol(line(f(a, "snipe", UP, 400)), line(f(b, "snipe", DOWN, 400))));
    expect(s.phase).toBe("over");
    expect(s.drawn).toBe(true);
    expect(s.winner).toBeUndefined();
    const r = file(s, { kind: "pnp" });
    expect(r).toMatchObject({ v: 3, drawn: true });
    expect(r.winner).toBeUndefined();
  });

  it("one side crossed out: the other holds the page, as ever", () => {
    const s = game([[300, 1300], [300, 300]], 1);
    const [a] = blue(s), [b] = red(s);
    put(s, a, 500, 1000);
    put(s, b, 500, 700);
    act(s, vol(line(f(a, "snipe", UP, 400)), line(f(b, "snipe", RIGHT, 400))));
    expect(s).toMatchObject({ phase: "over", winner: 0 });
    expect(s.drawn).toBeUndefined();
  });
});

/** A whole war of volleys, bot v bot, seeded: each side's plan chosen from the page as the volley began. */
function volleyWar(seed: number, size: Size = SIZES.quick, max = 300): GameState {
  const s = newGame(size, seed, { no: 9, date: "16 Oct 2026" }, { ...CORE, volley: VOLLEY });
  let k = seed;
  while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
  while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
  while (s.phase === "play" && s.turn < max) {
    if (s.vol!.stage === "aim") act(s, vol(botPlan(s, 0, 1, k++), botPlan(s, 1, 1, k++)));
    else act(s, botAction(s, 1, k++));
  }
  return s;
}

describe("volleys: Dawood-bot, and the record", () => {
  it("the bot's plan is legal, seeded, and made from the start of the volley alone", () => {
    const s = game(PAGE, 3, { volley: VOLLEY });
    const before = JSON.stringify(s);
    const p1 = botPlan(s, 1, 1, 99);
    expect(JSON.stringify(s)).toBe(before); // it played on a copy
    expect(planIllegal(s, 1, p1)).toBeNull();
    // the other side's draft never reaches the page, so it can't reach the bot
    const d = new Draft(s.turn);
    d.take(s, 0, f(blue(s)[0], "snipe", UP, 600));
    expect(botPlan(s, 1, 1, 99)).toEqual(p1);
  });

  it("a war of volleys plays to the end and replays from its record, mark for mark", () => {
    for (const seed of [5, 17]) {
      const s = volleyWar(seed);
      expect(s.phase).toBe("over");
      expect(s.actions.filter((a) => a.t === "volley").length).toBeGreaterThan(3);
      const r = toRecord(s);
      expect(r.v).toBe(3);
      const back = fromRecord(JSON.parse(JSON.stringify(r)));
      expect(JSON.stringify(back.marks)).toBe(JSON.stringify(s.marks));
      expect({ winner: back.winner, drawn: back.drawn, turn: back.turn }).toEqual({ winner: s.winner, drawn: s.drawn, turn: s.turn });
    }
  });

  it("volley pages go in the drawer and come out again; saves keep their volleys", () => {
    const s = volleyWar(23, SIZES.quick, 4);
    const r = file(s, { kind: "bot", level: 1 });
    const [got] = readDrawer(JSON.stringify([r]));
    expect(got.v).toBe(3);
    expect(steps(got).some((a) => a.t === "volley")).toBe(true);
    expect(JSON.stringify((unfile(got) as GameState).marks)).toBe(JSON.stringify(s.marks));
    const saved = readSave(JSON.stringify({ s, mode: { kind: "pnp" } }))!;
    expect((saved.s as GameState).rules.volley).toEqual(VOLLEY);
  });

  it("the plans in each volley are whoever's turn it isn't to know: act ignores who the page was asking", () => {
    const a = game(PAGE), b = game(PAGE);
    b.current = 1 as Player; // the page asking red to aim changes nothing
    const [x] = blue(a), [y] = red(a);
    const v = vol(line(f(x, "snipe", UP, 600)), line(f(y, "snipe", DOWN, 600)));
    act(a, v);
    act(b, structuredClone(v));
    expect(JSON.stringify(b.marks)).toBe(JSON.stringify(a.marks));
    expect(b.current).toBe(a.current);
  });
});
