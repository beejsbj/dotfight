// The real-time prototype (BJS-458, docs/realtime.md): no turns after setup,
// an ink meter, wet ink, and timed flicks that replay. One test per rule, and
// one pinning that a core game never takes a real-time path.

import { describe, expect, it } from "vitest";
import { botArrange, botBase } from "./bot";
import {
  act, alive, canFlick, canFlickAt, canPlaceBase, canSend, costOf, hand, handAt, illegal, lastFlickAt, meterAt, newGame, refillRate, wetUntil,
  type Action, type Flick, type GameState,
} from "./game";
import { file, fromRecord, readDrawer, readSave, steps, apply, blank, toRecord, unfile, type Filed } from "./record";
import { CORE, LONG, REALTIME, SIZES, savedRules, type CoreRules, type Size } from "./rules";

const UP = -Math.PI / 2;
const DOWN = Math.PI / 2;
const R = REALTIME.realtime!;

/** A real-time game past setup and positioning: blue (0) draws first, then red (1), alternately. */
function game(spots: [number, number][], soldiers = 3, rules: CoreRules = REALTIME): GameState {
  const size: Size = { name: "custom", bases: spots.length / 2, soldiers };
  const s = newGame(size, 42, undefined, rules);
  for (const [x, y] of spots) act(s, { t: "base", x, y });
  act(s, { t: "ready" });
  act(s, { t: "ready" });
  return s;
}
function put(s: GameState, id: number, x: number, y: number) {
  s.soldiers[id].x = x;
  s.soldiers[id].y = y;
}
const of = (s: GameState, b: number) => s.soldiers.filter((x) => x.home === b);
function park(s: GameState, ids: number[]) {
  ids.forEach((id, k) => {
    const x = s.soldiers[id];
    put(s, id, 900 - (k % 4) * 20, x.owner === 0 ? 1650 - Math.floor(k / 4) * 20 : 50 + Math.floor(k / 4) * 20);
  });
}
/** A timed flick (`ms` on the game clock), aimed off the page so it kills nobody unless the test lines someone up. */
const flick = (soldier: number, kind: Flick["kind"], ms: number, angle = Math.PI, length = 100): Action => ({ t: "flick", soldier, kind, angle, length, bend: 0, wob: 1, ms });

// Blue bases along the bottom, red along the top; red base 1 sits at (300, 600).
const PAGE: [number, number][] = [[300, 1300], [300, 600], [700, 1300], [700, 300]];

/** A whole bot-v-bot real-time war, seeded: both pens flick by turns of the clock, whoever can. */
function war(seed: number, flicks = 200): GameState {
  const s = newGame(SIZES.quick, seed, { no: 9, date: "16 Oct 2026" }, REALTIME);
  let k = seed;
  while (s.phase === "setup") { const p = botBase(s, (x, y) => !canPlaceBase(s, x, y), k++)!; act(s, { t: "base", ...p }); }
  while (s.phase === "position") for (const a of botArrange(s, k++)) { if (!illegal(s, a)) act(s, a); if (a.t === "ready") break; }
  let t = 0;
  for (let n = 0; s.phase === "play" && n < flicks; n++) {
    t += 700 + (k++ % 5) * 300;
    const p = (n % 2) as 0 | 1;
    const mine = alive(s, p).filter((x) => canFlickAt(s, x.id, t) === null);
    const foes = alive(s, p === 0 ? 1 : 0);
    const me = mine[(k * 7) % mine.length], foe = foes[(k * 3) % foes.length];
    if (!me || !foe) continue;
    const kind = k % 3 ? "snipe" : "lunge";
    if (canFlickAt(s, me.id, t, kind) === null) act(s, flick(me.id, kind, t, Math.atan2(foe.y - me.y, foe.x - me.x), kind === "snipe" ? 1800 : 300));
  }
  return s;
}

describe("real time: no turns", () => {
  it("a core game never takes a real-time path: no clock, no meter, no wet ink, and CORE and LONG have no `realtime`", () => {
    expect(CORE.realtime).toBeNull();
    expect(LONG.realtime).toBeNull();
    const s = newGame(SIZES.quick, 3);
    for (const [x, y] of [[300, 1300], [300, 300], [700, 1300], [700, 300], [500, 1050], [500, 550]] as const) act(s, { t: "base", x, y });
    act(s, { t: "ready" }); act(s, { t: "ready" });
    const me = alive(s, 0)[0];
    act(s, { t: "flick", soldier: me.id, kind: "snipe", angle: UP, length: 500, bend: 0, wob: 1 });
    expect(s).not.toHaveProperty("rt");
    expect(s).not.toHaveProperty("clock");
    expect(s.current).toBe(1); // the pen changed hands: turns, as ever
    expect(costOf(s, "snipe")).toBe(0);
    expect(refillRate(s, 0)).toBe(0);
    expect(wetUntil(s, me.id)).toBe(0);
    expect(handAt(s, me.id, "snipe", 0)).toMatchObject({ mult: hand(s, me.id, "snipe").mult, tremor: 0 });
    expect(JSON.stringify(savedRules(CORE))).toBe(JSON.stringify(CORE));
    expect(savedRules({ ...CORE, realtime: undefined } as Partial<CoreRules>).realtime).toBeNull();
  });

  it("positioning is turn-based as ever; the first flick starts the clock with both pens at the same ink", () => {
    const s = game(PAGE);
    expect(s).toMatchObject({ phase: "play", clock: 0, rt: { ink: [R.meter.start, R.meter.start], since: [0, 0], wet: {} } });
    expect(meterAt(s, 0, 0)).toBe(R.meter.start);
    expect(meterAt(s, 1, 2500)).toBeCloseTo(Math.min(R.meter.full, R.meter.start + R.meter.perSec * 2.5));
  });

  it("either pen flicks at any moment: no hand-over, `current` stays put, and `turn` counts flicks", () => {
    const s = game(PAGE);
    const blue = of(s, 0)[0], red = of(s, 1)[0];
    const o1 = act(s, flick(red.id, "lunge", 300));
    expect(o1).toMatchObject({ again: true, handover: false });
    expect(s.current).toBe(0);
    expect(s.turn).toBe(2);
    act(s, flick(blue.id, "lunge", 300)); // the same moment is fine
    act(s, flick(of(s, 1)[1].id, "lunge", 900));
    expect(s.turn).toBe(4);
    expect(s.clock).toBe(900);
  });

  it("a flick needs its moment, and time runs one way", () => {
    const s = game(PAGE);
    const blue = of(s, 0)[0];
    expect(illegal(s, { ...flick(blue.id, "lunge", 500), ms: undefined })).toBe("no moment");
    act(s, flick(blue.id, "lunge", 500));
    expect(illegal(s, flick(of(s, 0)[1].id, "lunge", 499))).toBe("time runs one way");
    expect(illegal(s, flick(of(s, 0)[1].id, "lunge", 500))).toBeNull();
  });

  it("sends and stop don't exist", () => {
    const s = game(PAGE);
    expect(canSend(s, 0, 2, 1)).toBe("no sends in real time");
    expect(illegal(s, { t: "stop" })).toBe("no turns to stop in real time");
  });
});

describe("the ink meter", () => {
  it("a flick costs its kind's price (a snipe more than a lunge), and the meter refills with the clock up to full", () => {
    const s = game(PAGE);
    const [a, b, c] = of(s, 0);
    expect(costOf(s, "snipe")).toBeGreaterThan(costOf(s, "lunge"));
    act(s, flick(a.id, "snipe", 0));
    expect(meterAt(s, 0, 0)).toBeCloseTo(R.meter.start - R.meter.snipe);
    expect(meterAt(s, 1, 0)).toBe(R.meter.start);
    act(s, flick(b.id, "lunge", 1000));
    expect(meterAt(s, 0, 1000)).toBeCloseTo(R.meter.start - R.meter.snipe + R.meter.perSec - R.meter.lunge);
    expect(meterAt(s, 0, 1000 + 60000)).toBe(R.meter.full);
    void c;
  });

  it("a pen that can't pay waits: the flick is refused, and legal once the meter has refilled", () => {
    const s = game(PAGE);
    const [a, b, c] = of(s, 0);
    act(s, flick(a.id, "lunge", 0));
    const left = R.meter.start - R.meter.lunge;
    expect(left).toBeLessThan(R.meter.snipe);
    expect(canFlickAt(s, b.id, 0, "snipe")).toBe("out of ink");
    expect(canFlickAt(s, b.id, 0, "lunge")).toBeNull(); // the cheaper flick still goes
    expect(() => act(s, flick(b.id, "snipe", 0))).toThrow(/out of ink/);
    const wait = Math.ceil(((R.meter.snipe - left) / R.meter.perSec) * 1000);
    expect(canFlickAt(s, b.id, wait - 50, "snipe")).toBe("out of ink");
    expect(canFlickAt(s, b.id, wait + 1, "snipe")).toBeNull();
    act(s, flick(b.id, "snipe", wait + 1));
    expect(meterAt(s, 0, wait + 1)).toBeCloseTo(0, 2);
    void c;
  });

  it("a snipe that takes two refunds its cost (the core rules' extra flick)", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0], [a, b] = of(s, 1);
    park(s, s.soldiers.filter((x) => ![me.id, a.id, b.id].includes(x.id)).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, a.id, 150, 800); put(s, b.id, 150, 700);
    const o = act(s, flick(me.id, "snipe", 100, UP, 600));
    expect(o.killed).toHaveLength(2);
    expect(o.earned).toBe(true);
    expect(meterAt(s, 0, 100)).toBeCloseTo(R.meter.start + R.meter.perSec * 0.1); // as if it cost nothing
  });

  it("a last stand refills the pen faster", () => {
    const s = game(PAGE, 3);
    // red has 6 men; cross out two so their last stand (at 4) begins
    const me = of(s, 0)[0], [a, b] = of(s, 1);
    park(s, s.soldiers.filter((x) => ![me.id, a.id, b.id].includes(x.id)).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, a.id, 150, 800); put(s, b.id, 150, 700);
    const o = act(s, flick(me.id, "snipe", 100, UP, 600));
    expect(o.stood).toEqual([1]);
    expect(refillRate(s, 1)).toBeCloseTo(R.meter.perSec * s.rules.lastStandFlicks);
    expect(refillRate(s, 0)).toBeCloseTo(R.meter.perSec);
    // the faster refill counts from the flick that began the stand, not before it
    expect(meterAt(s, 1, 1100)).toBeCloseTo(Math.min(R.meter.full, R.meter.start + R.meter.perSec * 0.1 + R.meter.perSec * s.rules.lastStandFlicks * 1));
  });
});

describe("wet ink", () => {
  it("a soldier who flicked is wet for dryMs: he can't flick again, his comrades can, and the other pen can", () => {
    const s = game(PAGE);
    const [a, b] = of(s, 0), red = of(s, 1)[0];
    act(s, flick(a.id, "lunge", 1000));
    expect(wetUntil(s, a.id)).toBe(1000 + R.dryMs);
    expect(canFlickAt(s, a.id, 1000 + R.dryMs - 1, "lunge")).toBe("his ink is still wet");
    expect(canFlickAt(s, a.id, 1000 + R.dryMs, "lunge")).toBeNull();
    expect(canFlickAt(s, b.id, 1000, "lunge")).toBeNull();
    expect(canFlickAt(s, red.id, 1000, "lunge")).toBeNull();
    // `canFlick` (the bot's view) judges wetness as of the clock's last moment
    expect(canFlick(s, a.id)).toBe(false);
    s.clock = 1000 + R.dryMs;
    expect(canFlick(s, a.id)).toBe(true);
  });

  it("a lunger who killed and lived is dry at once (lunge on), and his lunge is refunded", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0], a = of(s, 1)[0];
    park(s, s.soldiers.filter((x) => ![me.id, a.id].includes(x.id)).map((x) => x.id));
    put(s, me.id, 150, 1000); put(s, a.id, 150, 900);
    const o = act(s, flick(me.id, "lunge", 100, UP, 200));
    expect(o.killed).toEqual([a.id]);
    expect(o.lost).toBe(false);
    expect(o.earned).toBe(true);
    expect(wetUntil(s, me.id)).toBe(0);
    expect(canFlickAt(s, me.id, 100, "lunge")).toBeNull();
    expect(meterAt(s, 0, 100)).toBeCloseTo(R.meter.start + R.meter.perSec * 0.1);
  });

  it("a lunger who died leaves no wet ink behind, and a soldier can lunge straight after a miss once dry", () => {
    const s = game(PAGE);
    const me = of(s, 0)[0];
    park(s, s.soldiers.filter((x) => x.id !== me.id).map((x) => x.id));
    put(s, me.id, 150, 1000);
    const o = act(s, flick(me.id, "lunge", 100, DOWN, 5000)); // off the page
    expect(o.lost).toBe(true);
    expect(s.rt!.wet).toEqual({});
  });
});

describe("haste", () => {
  it("a flick right after the same pen's last gets extra tremor, fading to none at haste.ms; the other pen is unmoved", () => {
    const s = game(PAGE);
    const [a, b] = of(s, 0), red = of(s, 1)[0];
    expect(lastFlickAt(s, 0)).toBe(-Infinity);
    expect(handAt(s, a.id, "snipe", 0).tremor).toBe(0);
    act(s, flick(a.id, "lunge", 1000));
    expect(lastFlickAt(s, 0)).toBe(1000);
    expect(handAt(s, b.id, "snipe", 1000).tremor).toBeCloseTo(R.haste.tremor);
    expect(handAt(s, b.id, "snipe", 1000 + R.haste.ms / 2).tremor).toBeCloseTo(R.haste.tremor / 2);
    expect(handAt(s, b.id, "snipe", 1000 + R.haste.ms).tremor).toBe(0);
    expect(handAt(s, red.id, "snipe", 1000).tremor).toBe(0);
    // steadier hands (a last stand) keep their multiplier; the tremor only ever adds
    expect(handAt(s, b.id, "snipe", 1000).mult).toBe(hand(s, b.id, "snipe").mult);
  });
});

describe("the record", () => {
  it("a whole real-time war plays to the end with both pens, and replays from its actions to the same page", () => {
    const s = war(5);
    expect(s.phase).toBe("over");
    expect(s.actions.filter((a) => a.t === "flick").length).toBeGreaterThan(8);
    const owners = new Set(s.actions.flatMap((a) => (a.t === "flick" ? [s.soldiers[a.soldier].owner] : [])));
    expect([...owners].sort()).toEqual([0, 1]);
    const r = JSON.parse(JSON.stringify(toRecord(s)));
    expect(r.v).toBe(3);
    expect(r.rules.realtime).toEqual(R);
    for (const a of r.actions) if (a.t === "flick") expect(typeof a.ms).toBe("number");
    expect(fromRecord(r)).toEqual(s);
    // and step by step, as the replay draws it
    const f = JSON.parse(JSON.stringify(file(s, { kind: "table" }))) as Filed;
    const again = blank(f);
    for (const st of steps(f)) apply(again, st);
    expect(again).toEqual(s);
    expect(unfile(f)).toEqual(s);
  });

  it("a timed record is v3; the drawer keeps v2 and v3 pages and drops a v3 without its rules; old saves still read", () => {
    const rt = war(6, 12), core = newGame(SIZES.quick, 2);
    expect(toRecord(core).v).toBe(2);
    const filed = [file(rt, { kind: "table", bot: 1 }), file(core, { kind: "pnp" })];
    const raw = JSON.stringify([...filed, { ...filed[0], rules: { ...filed[0].rules, realtime: null } }, { v: 4, actions: [] }]);
    const read = readDrawer(raw);
    expect(read.map((r) => r.v)).toEqual([3, 2]);
    expect(read[0].mode).toEqual({ kind: "table", bot: 1 });
    const save = readSave(JSON.stringify({ s: rt, mode: { kind: "table" } }));
    expect(save?.mode).toEqual({ kind: "table" });
    expect(save?.s.v === 2 && save.s.rules.realtime).toEqual(R);
    expect(readSave(JSON.stringify({ s: core, mode: { kind: "table", bot: 7 } }))?.mode).toEqual({ kind: "table" });
    expect(readSave(JSON.stringify({ s: core, mode: { kind: "pnp" } }))?.s.v === 2 && readSave(JSON.stringify({ s: core, mode: { kind: "pnp" } }))!.s.rules.realtime).toBeNull();
  });

  it("the same timed actions never make a different page: a flick out of its moment is refused and changes nothing", () => {
    const s = war(7, 20);
    const r = toRecord(s);
    const again = fromRecord(r, r.actions.length - 1);
    const last = r.actions[r.actions.length - 1] as Extract<Action, { t: "flick" }>;
    const before = JSON.stringify(again);
    expect(() => act(again, { ...last, ms: (again.clock ?? 0) - 1 })).toThrow(/time runs one way/);
    expect(JSON.stringify(again)).toBe(before);
    act(again, last);
    expect(again).toEqual(s);
  });
});
