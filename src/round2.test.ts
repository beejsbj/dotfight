// Round 2: lunge and snipe, free walking sends, empty rings, positioning, and
// ink physics (wobble, Dawood's boost/drag, groove gravity, scribble cover,
// taper, billiards, prisms, wall wobble). Soldiers are put exactly where a
// test needs them, so each line is known.

import { describe, expect, it } from "vitest";
import {
  act, alive, arrange, canAct, canArrange, canTransfer, doneArranging, garrison, kitLeft, newGame, pass, placeBase,
  preview, ready, replay, standing, steadiness, transfer, type Flick, type GameState, type Soldier,
} from "./game";
import { dist, distToSeg, pathLen, type Pt } from "./geom";
import { variant, type RuleSet } from "./rules";
import { CLASSIC } from "./rulesets";

const quiet = (r: Parameters<typeof variant>[1] extends infer C ? Omit<C & object, "id" | "name" | "motto"> : never) =>
  variant(CLASSIC, { id: "t", name: "t", motto: "t", transfer: null, extraTurn: "none", ...r });

const SPOTS = [[200, 1500], [200, 200], [500, 1500], [500, 200], [800, 1500], [800, 200], [350, 1250], [350, 450], [650, 1250], [650, 450]];
function setup(R: RuleSet): GameState {
  const s = newGame(R, 7);
  let i = 0;
  while (s.phase === "setup") {
    const [x, y] = SPOTS[i++];
    placeBase(s, x, y, kitLeft(s, s.current)[0]);
  }
  if (s.phase === "position") { doneArranging(s); doneArranging(s); }
  return s;
}
const at = (s: GameState, x: Soldier, p: Pt) => { s.soldiers[x.id].x = p.x; s.soldiers[x.id].y = p.y; };
/** Everyone off to the far corners, out of the way, except the soldiers a test uses. */
function clear(s: GameState, keep: Soldier[]) {
  s.soldiers.forEach((x, i) => {
    if (keep.some((k) => k.id === x.id)) return;
    x.x = x.owner === 0 ? 90 + (i % 10) * 3 : 990 - (i % 10) * 3;
    x.y = x.owner === 0 ? 1690 - Math.floor(i / 10) * 3 : 10 + Math.floor(i / 10) * 3;
  });
}
const flick = (me: Soldier, angle: number, length: number, kind: Flick["kind"] = "shoot", wob?: number): Flick =>
  ({ soldierId: me.id, kind, angle, length, bend: 0, ...(wob !== undefined && { wob }) });
const line = (s: GameState, owner: 0 | 1, pts: Pt[]) => s.marks.push({ t: "stroke", kind: "shoot", owner, pts, seed: 1, turn: 0 });
const hline = (y: number, x0 = 150, x1 = 850) => Array.from({ length: 33 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 32, y }));
const endOf = (pts: Pt[]) => pts[pts.length - 1];
/** How far a path strays sideways from the straight ray it was aimed along. */
const stray = (from: Pt, angle: number, pts: Pt[]) => Math.max(...pts.map((p) => Math.abs((p.x - from.x) * Math.sin(angle) - (p.y - from.y) * Math.cos(angle))));

// A blue soldier alone at the bottom middle of the page, and an empty page.
function lone(r: Parameters<typeof quiet>[0]) {
  const s = setup(quiet(r));
  const me = alive(s, 0)[0];
  clear(s, [me]);
  at(s, me, { x: 500, y: 1500 });
  return { s, me };
}

describe("ink physics: crossing a line jolts the hand (wobble), it doesn't cost range", () => {
  const up = -Math.PI / 2 + 0.3; // steep to a horizontal line
  it("a steep crossing turns the line by a random jolt from the flick's seed; the length stays", () => {
    const { s, me } = lone({ ink: { wobble: 0.15 } });
    line(s, 1, hline(1000));
    const calm = preview(s, flick(me, up, 1200));
    const shaken = preview(s, flick(me, up, 1200, "shoot", 12345));
    expect(stray(me, up, calm.path)).toBeLessThan(0.5);
    expect(stray(me, up, shaken.path)).toBeGreaterThan(3);
    expect(pathLen(shaken.path)).toBeCloseTo(1200, 0);
    const cross = shaken.events.find((e) => e.kind === "cross")!;
    expect(cross.jolt).not.toBe(0);
    expect(cross.at.y).toBeCloseTo(1000, 0);
    // the same seed, the same line: replayable
    expect(preview(s, flick(me, up, 1200, "shoot", 12345)).path).toEqual(shaken.path);
    // and it's straight before the crossing
    expect(stray(me, up, shaken.path.filter((p) => p.y > 1001))).toBeLessThan(0.5);
  });
  it("a wobbling act leaves a kink mark where the hand jolted", () => {
    const { s, me } = lone({ ink: { wobble: 0.15 } });
    line(s, 1, hline(1000));
    act(s, flick(me, up, 1200, "shoot", 777));
    expect(s.marks.some((m) => m.t === "kink" && m.kind === "wobble" && Math.abs(m.y - 1000) < 1)).toBe(true);
  });
});

describe("ink physics: Dawood's version, friendly ink boosts and enemy ink slows", () => {
  const up = -Math.PI / 2 + 0.3;
  const len = (owner: 0 | 1) => {
    const { s, me } = lone({ ink: { boost: 150, drag: 150 } });
    line(s, owner, hline(1000));
    return pathLen(preview(s, flick(me, up, 1000)).path);
  };
  it("crossing your own line extends it", () => expect(len(0)).toBeCloseTo(1150, 0));
  it("crossing theirs shortens it", () => expect(len(1)).toBeCloseTo(850, 0));
});

describe("ink physics: grooves pull like gravity", () => {
  const G = { groove: 0.35, grooveReach: 24, groovePull: 0.03 };
  // an old line running straight up the page at x = 500
  function along(angle: number, ink: Parameters<typeof quiet>[0]["ink"] = {}, owner: 0 | 1 = 1, length = 1300) {
    const { s, me } = lone({ ink: { ...G, ...ink } });
    at(s, me, { x: 470, y: 1500 });
    line(s, owner, Array.from({ length: 33 }, (_, i) => ({ x: 500, y: 1400 - i * 40 })));
    return { s, me, o: preview(s, flick(me, angle, length)) };
  }
  const onLine = (pts: Pt[]) => pts.filter((p) => Math.abs(p.x - 500) < 3 && p.y < 1300).length;
  it("a pen meeting a line nearly parallel is drawn into it and runs along it", () => {
    const { o } = along(-Math.PI / 2 + 0.12);
    expect(o.events.some((e) => e.kind === "groove" && (e.len ?? 0) > 40)).toBe(true);
    expect(onLine(o.path)).toBeGreaterThan(10);
  });
  it("a steep meeting is a crossing instead: no pull, it goes straight over", () => {
    const { s, me } = lone({ ink: G });
    line(s, 1, Array.from({ length: 33 }, (_, i) => ({ x: 500, y: 1400 - i * 40 })));
    at(s, me, { x: 300, y: 1300 });
    const a = -Math.PI / 2 + 0.9;
    const o = preview(s, flick(me, a, 700));
    expect(o.events.some((e) => e.kind === "groove")).toBe(false);
    expect(stray(me, a, o.path)).toBeLessThan(0.5);
  });
  it("with no groove rule, ink doesn't pull at all", () => {
    const { o } = along(-Math.PI / 2 + 0.12, { groove: 0 });
    expect(onLine(o.path)).toBeLessThan(3);
  });
  it("a fast pen slips free where a slow one is caught", () => {
    // the same meeting, in a hard flick (fast) and a soft one (slow)
    const fast = along(-Math.PI / 2 + 0.2, {}, 1, 1700).o;
    const slow = along(-Math.PI / 2 + 0.2, {}, 1, 500).o;
    const rode = (o: typeof fast) => Math.max(0, ...o.events.filter((e) => e.kind === "groove").map((e) => e.len ?? 0));
    expect(rode(slow)).toBeGreaterThan(60);
    expect(rode(fast)).toBeLessThan(30);
  });
  it("your own groove carries you further, theirs cuts you short", () => {
    const own = along(-Math.PI / 2 + 0.12, { grooveOwn: 0.5, grooveEnemy: 1.5 }, 0).o;
    const theirs = along(-Math.PI / 2 + 0.12, { grooveOwn: 0.5, grooveEnemy: 1.5 }, 1).o;
    expect(endOf(own.path).y).toBeLessThan(endOf(theirs.path).y - 200);
  });
});

describe("ink physics: scribbles are cover", () => {
  const up = -Math.PI / 2 + 0.3;
  function through(n: number) {
    const { s, me } = lone({ ink: { scribble: 3, scribbleSpan: 40 } });
    for (let k = 0; k < n; k++) line(s, 1, hline(1000 - k * 8));
    return preview(s, flick(me, up, 1200));
  }
  it("three lines in a short stretch soak the line up", () => {
    const o = through(3);
    expect(o.events.some((e) => e.kind === "absorb")).toBe(true);
    expect(endOf(o.path).y).toBeGreaterThan(975);
  });
  it("two don't", () => {
    const o = through(2);
    expect(o.events.some((e) => e.kind === "absorb")).toBe(false);
    expect(pathLen(o.path)).toBeCloseTo(1200, 0);
  });
});

describe("taper: every body and wall a line hits takes some of what's left", () => {
  function row(r: Parameters<typeof quiet>[0]) {
    const s = setup(quiet(r));
    const me = alive(s, 0)[0], foes = alive(s, 1).slice(0, 3);
    clear(s, [me, ...foes]);
    at(s, me, { x: 500, y: 1500 });
    foes.forEach((f, i) => at(s, f, { x: 500, y: 1300 - i * 150 }));
    return act(s, flick(me, -Math.PI / 2, 700));
  }
  it("no taper: a line is a line, all three go", () => expect(row({}).killed).toHaveLength(3));
  it("each kill shortens what's left: the third is out of reach", () => {
    const o = row({ ink: { taperHit: 0.5 } });
    expect(o.killed).toHaveLength(2);
    // 700 long: 200 to the first, then 500 → 250 left; 150 to the second, then 100 → 50 left
    expect(pathLen(o.path)).toBeCloseTo(200 + 150 + 50, 0);
  });
  it("with pierce 2, taper and pierce both apply (the stricter wins)", () => {
    expect(row({ pierce: 2, ink: { taperHit: 0.2 } }).killed).toHaveLength(2);
  });
  it("a base wall takes its share too", () => {
    const s = setup(quiet({ ink: { taperWall: 0.5 } }));
    const b = standing(s, 1)[0];
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: b.x, y: b.y + 400 });
    const o = preview(s, flick(me, -Math.PI / 2, 600));
    // 400 - r to the near wall: half the rest is left. Then the far wall takes half of what's left again.
    const near = 400 - b.r, e1 = near + (600 - near) / 2, far = near + 2 * b.r;
    expect(pathLen(o.path)).toBeCloseTo(far + (e1 - far) / 2, 0);
    expect(o.events.filter((e) => e.kind === "wall")).toHaveLength(2);
  });
});

describe("billiards: a hexagon's walls bank everyone's ink by the angle it comes in at", () => {
  const BIL = { kit: ["hex", "circle", "circle", "circle", "circle"] as RuleSet["kit"], shapes: { hex: { wall: "bank" as const } }, bankGlance: 0.6 };
  // a flat-bottomed hex (owner's), and a blue soldier below-left of it, not inside it
  function flat(owner: 0 | 1) {
    const s = setup(quiet(BIL));
    const hex = s.bases.find((b) => b.owner === owner && b.shape === "hex")!;
    hex.rot = 0;
    const me = alive(s, 0).find((x) => !garrison(s, hex).some((g) => g.id === x.id))!;
    clear(s, [me]);
    const bottom = hex.y + hex.r * Math.sin(Math.PI / 3);
    at(s, me, { x: hex.x + 300, y: bottom + 100 });
    return { s, hex, me, bottom };
  }
  it("a glancing line banks off an enemy hex: angle in = angle out", () => {
    const { s, me, bottom } = flat(1);
    const a = Math.atan2(-100, -300); // about 72° off square
    const o = preview(s, flick(me, a, 500));
    const b = o.events.find((e) => e.kind === "bounce" && e.on === "bank")!;
    expect(b).toBeTruthy();
    expect(b.at.y).toBeCloseTo(bottom, 0);
    const out = o.path[o.path.findIndex((p) => dist(p, b.at) < 1e-6) + 1];
    expect(Math.atan2(out.y - b.at.y, out.x - b.at.x)).toBeCloseTo(-a, 3);
    expect(pathLen(o.path)).toBeCloseTo(500, 0);
  });
  it("your own hex banks your lines too", () => {
    const { s, me } = flat(0);
    const o = preview(s, flick(me, Math.atan2(-100, -300), 500));
    expect(o.events.some((e) => e.kind === "bounce" && e.on === "bank")).toBe(true);
  });
  it("a line coming in near square goes through the wall into the hex", () => {
    const { s, hex, me, bottom } = flat(1);
    at(s, me, { x: hex.x + 5, y: bottom + 300 });
    const o = preview(s, flick(me, -Math.PI / 2, 500));
    expect(o.events.some((e) => e.kind === "bounce")).toBe(false);
    expect(Math.min(...o.path.map((p) => dist(p, hex)))).toBeLessThan(10);
  });
  it("lines leaving a hex from inside pass out (only incoming lines bank)", () => {
    const s = setup(quiet(BIL));
    const hex = s.bases.find((b) => b.owner === 0 && b.shape === "hex")!;
    const me = garrison(s, hex)[0];
    for (let k = 0; k < 12; k++) {
      const o = preview(s, flick(me, (k / 12) * Math.PI * 2, 400));
      expect(o.events.some((e) => e.kind === "bounce" && e.on === "bank" && e.base === hex.id)).toBe(false);
    }
  });
  it("round 1's mirror still only bounces enemy lines", () => {
    const s = setup(quiet({ kit: ["hex", "circle", "circle", "circle", "circle"] }));
    const hex = s.bases.find((b) => b.owner === 0 && b.shape === "hex")!;
    hex.rot = 0;
    const me = alive(s, 0).find((x) => !garrison(s, hex).some((g) => g.id === x.id))!;
    clear(s, [me]);
    at(s, me, { x: hex.x + 300, y: hex.y + hex.r * Math.sin(Math.PI / 3) + 100 });
    expect(preview(s, flick(me, Math.atan2(-100, -300), 500)).events.some((e) => e.kind === "bounce")).toBe(false);
  });
});

describe("triangle: a prism for any of your lines passing through it", () => {
  const TRI = { kit: ["tri", "circle", "circle", "circle", "circle"] as RuleSet["kit"] };
  function through(owner: 0 | 1, kind: Flick["kind"] = "shoot") {
    const s = setup(quiet({ ...TRI, lunge: { baseDeath: false }, earn: { shoot: 2, move: 1, sameMover: true, shake: 0.3 } }));
    const tri = s.bases.find((b) => b.owner === owner && b.shape === "tri")!;
    const me = alive(s, 0).find((x) => !garrison(s, tri).some((g) => g.id === x.id))!;
    clear(s, [me]);
    // from the middle of the page, straight through it and out the far side
    const down = tri.y > 850 ? 1 : -1;
    at(s, me, { x: tri.x + 2, y: tri.y - down * 300 });
    return preview(s, flick(me, down * Math.PI / 2, 600, kind));
  }
  it("a shot from outside, through your own triangle, splits on the way out", () => {
    const o = through(0);
    expect(o.paths).toHaveLength(2);
    expect(o.events.some((e) => e.kind === "split")).toBe(true);
  });
  it("their triangle doesn't split your line", () => expect(through(1).paths).toHaveLength(1));
  it("a lunge through your own triangle doesn't split (the lunger is one body)", () => expect(through(0, "move").paths).toHaveLength(1));
});

describe("base walls have friction: passing through a wall wobbles the line; circles are soft", () => {
  const WW = { kit: ["tri", "circle", "circle", "circle", "circle"] as RuleSet["kit"], shapes: { tri: { wobble: 0.2, prism: false }, circle: { wobble: 0 } } };
  it("leaving your own triangle jolts your shot", () => {
    const s = setup(quiet(WW));
    const tri = s.bases.find((b) => b.owner === 0 && b.shape === "tri")!;
    const me = garrison(s, tri)[0];
    const o = preview(s, flick(me, -Math.PI / 2, 600, "shoot", 99));
    const w = o.events.find((e) => e.kind === "wall" && e.base === tri.id)!;
    expect(w.jolt).not.toBe(0);
  });
  it("a circle's soft wall doesn't", () => {
    const s = setup(quiet(WW));
    const c = s.bases.find((b) => b.owner === 0 && b.shape === "circle")!;
    const me = garrison(s, c)[0];
    const o = preview(s, flick(me, -Math.PI / 2, 600, "shoot", 99));
    expect(o.events.filter((e) => e.jolt)).toHaveLength(0);
  });
});

describe("lunge: goes as far as a shot, crosses out what it passes, and chains with a shakier hand", () => {
  const LUNGE = { lunge: { baseDeath: true }, earn: { shoot: 2, move: 1, sameMover: true, shake: 0.3 }, extraTurn: "chain" as const, empty: "ring" as const, capture: true };
  function field() {
    const s = setup(quiet(LUNGE));
    const me = alive(s, 0)[0], [x, y] = alive(s, 1);
    clear(s, [me, x, y]);
    at(s, me, { x: 500, y: 1300 });
    at(s, x, { x: 500, y: 1000 }); // out in the open
    at(s, y, { x: 700, y: 800 });
    return { s, me, x, y };
  }
  it("crosses out an enemy in the open, survives, and stands where the ink stops", () => {
    const { s, me, x } = field();
    const o = act(s, flick(me, -Math.PI / 2, 500, "move"));
    expect(o.killed).toEqual([x.id]);
    expect(s.soldiers[me.id].alive).toBe(true);
    expect(s.soldiers[me.id].y).toBeCloseTo(800, 3);
  });
  it("a lunge kill earns another lunge, by the same soldier, and it must be a lunge", () => {
    const { s, me } = field();
    act(s, flick(me, -Math.PI / 2, 500, "move"));
    expect(s.current).toBe(0);
    expect(s.must).toEqual({ soldier: me.id });
    const mate = alive(s, 0).find((x) => x.id !== me.id)!;
    expect(canAct(s, mate.id)).toBe(false);
    expect(canAct(s, me.id, "shoot")).toBe(false);
    expect(canAct(s, me.id, "move")).toBe(true);
    expect(() => act(s, flick(me, 0, 300, "shoot"))).toThrow();
  });
  it("each link shakes the hand more", () => {
    const { s, me, y } = field();
    const base = steadiness(s, me.id, "move");
    act(s, flick(me, -Math.PI / 2, 500, "move"));
    expect(steadiness(s, me.id, "move")).toBeCloseTo(base * 1.3);
    act(s, flick(me, Math.atan2(y.y - 800, y.x - 500), dist({ x: 500, y: 800 }, y) + 40, "move"));
    expect(s.current).toBe(0);
    expect(steadiness(s, me.id, "move")).toBeCloseTo(base * 1.6);
  });
  it("you can stop instead of lunging again (pass ends the turn)", () => {
    const { s, me } = field();
    act(s, flick(me, -Math.PI / 2, 500, "move"));
    pass(s);
    expect(s.current).toBe(1);
    expect(s.must).toBeUndefined();
    expect(s.link).toBe(0);
  });
  it("a lunge that kills nobody ends the turn", () => {
    const { s, me } = field();
    act(s, flick(me, 0, 300, "move"));
    expect(s.current).toBe(1);
  });
  it("lunging into a standing enemy base is death at its wall; what it crossed before the wall still goes", () => {
    const s = setup(quiet(LUNGE));
    const b = standing(s, 1)[0];
    const me = alive(s, 0)[0], open = alive(s, 1).find((x) => !garrison(s, b).includes(x))!;
    clear(s, [me, open, ...garrison(s, b)]);
    at(s, me, { x: b.x, y: b.y + 500 });
    at(s, open, { x: b.x, y: b.y + 250 });
    const o = act(s, flick(me, -Math.PI / 2, 700, "move"));
    expect(o.killed).toEqual([open.id]);
    expect(o.crashed).toBe(b.id);
    expect(s.soldiers[me.id].alive).toBe(false);
    expect(endOf(o.path).y).toBeCloseTo(b.y + b.r, 0);
    expect(s.marks.some((m) => m.t === "kink" && m.kind === "crash")).toBe(true);
    expect(s.current).toBe(1); // the chain dies with him
  });
  it("an empty ring isn't deadly: lunge in and (with capture) it's yours", () => {
    const s = setup(quiet(LUNGE));
    const b = standing(s, 1)[0];
    for (const x of garrison(s, b)) s.soldiers[x.id].alive = false;
    b.fallen = 1;
    const me = alive(s, 0)[0];
    clear(s, [me]);
    at(s, me, { x: b.x, y: b.y + 400 });
    const o = act(s, flick(me, -Math.PI / 2, 400, "move"));
    expect(o.crashed).toBeUndefined();
    expect(o.founded).toContain(b.id);
    expect(s.bases[b.id].owner).toBe(0);
  });
  it("off the page still kills the lunger", () => {
    const { s, me } = field();
    at(s, me, { x: 500, y: 1600 });
    const o = act(s, flick(me, Math.PI / 2, 600, "move"));
    expect(o.lost).toBe(true);
  });
});

describe("snipe: another flick only when one line takes two or more", () => {
  const SNIPE = { earn: { shoot: 2, move: 1, sameMover: true, shake: 0.3 }, extraTurn: "chain" as const };
  function snipe(n: number) {
    const s = setup(quiet(SNIPE));
    const me = alive(s, 0)[0], foes = alive(s, 1).slice(0, n);
    clear(s, [me, ...foes]);
    at(s, me, { x: 500, y: 1500 });
    foes.forEach((f, i) => at(s, f, { x: 500, y: 1100 - i * 100 }));
    const o = act(s, flick(me, -Math.PI / 2, 800));
    return { s, o };
  }
  it("one kill: the pen passes", () => {
    const { s, o } = snipe(1);
    expect(o.killed).toHaveLength(1);
    expect(s.current).toBe(1);
  });
  it("two with one bullet: go again, anything you like, and no shakier", () => {
    const { s, o } = snipe(2);
    expect(o.killed).toHaveLength(2);
    expect(s.current).toBe(0);
    expect(s.must).toBeUndefined();
    const me = alive(s, 0)[0];
    expect(steadiness(s, me.id, "shoot")).toBe(1);
  });
  it("with rise 1, each extra flick needs one more: two, then three", () => {
    const s = setup(quiet({ earn: { shoot: 2, move: 1, sameMover: true, shake: 0.3, rise: 1 }, extraTurn: "chain" }));
    const me = alive(s, 0)[0], foes = alive(s, 1).slice(0, 4);
    clear(s, [me, ...foes]);
    at(s, me, { x: 500, y: 1500 });
    foes.slice(0, 2).forEach((f, i) => at(s, f, { x: 500, y: 1100 - i * 100 }));
    foes.slice(2).forEach((f, i) => at(s, f, { x: 300, y: 1100 - i * 100 }));
    act(s, flick(me, -Math.PI / 2, 800));
    expect(s.current).toBe(0);
    at(s, me, { x: 300, y: 1500 });
    act(s, flick(me, -Math.PI / 2, 800));
    expect(s.current).toBe(1);
  });
  it("chains for as long as it keeps taking two (no cap)", () => {
    const { s } = snipe(2);
    for (let k = 0; k < 4; k++) {
      const me = alive(s, 0)[0], foes = alive(s, 1).slice(0, 2);
      foes.forEach((f, i) => at(s, f, { x: 300, y: 1100 - i * 100 }));
      at(s, me, { x: 300, y: 1500 });
      act(s, flick(me, -Math.PI / 2, 800));
      expect(s.current).toBe(0);
    }
  });
});

describe("free sends: the convoy walks the page, and can be cut down on the way", () => {
  const WALK = { transfer: { max: 5, ambush: "all" as const, free: true, pace: 150, refill: "own" as const }, empty: "ring" as const };
  it("sending doesn't use your flick; the walkers stand on the road, on the page", () => {
    const s = setup(quiet(WALK));
    const [a, b] = standing(s, 0);
    const o = transfer(s, a.id, b.id, 3);
    expect(o.again).toBe(true);
    expect(s.current).toBe(0);
    const walkers = s.soldiers.filter((x) => x.transit === 0);
    expect(walkers).toHaveLength(3);
    const road = s.transits[0].road;
    for (const w of walkers) expect(distToSeg(w, road[0], road[1])).toBeLessThan(0.01);
    expect(ready(s, 0)).toHaveLength(47);
  });
  it("they walk `pace` further every time the pen changes hands, then arrive", () => {
    const s = setup(quiet(WALK));
    const [a, , c] = standing(s, 0);
    transfer(s, a.id, c.id, 2);
    const t = s.transits[0];
    const len = dist(t.road[0], t.road[1]);
    const start = t.walked!;
    let turns = 0;
    while (t.state === "road" && turns < 20) {
      const before = t.walked!;
      pass(s);
      turns++;
      if (t.state === "road") expect(t.walked! - before).toBe(150);
    }
    expect(t.state).toBe("arrived");
    expect(turns).toBe(Math.ceil((len + 2.6 * 7 - start) / 150));
    expect(garrison(s, s.bases[c.id])).toHaveLength(12);
  });
  it("any line that touches a walker crosses him out, one by one", () => {
    const s = setup(quiet(WALK));
    const [a, , c] = standing(s, 0);
    transfer(s, a.id, c.id, 3);
    pass(s);
    const w = s.soldiers[s.transits[0].ids[1]];
    const foe = alive(s, 1)[0];
    clear(s, [foe, ...s.soldiers.filter((x) => x.transit === 0)]);
    at(s, foe, { x: w.x, y: w.y - 300 });
    const o = act(s, flick(foe, Math.PI / 2, 320));
    expect(o.killed).toContain(w.id);
    expect(s.soldiers.filter((x) => x.alive && x.transit === 0).length).toBeLessThan(3);
  });
  it("one free send a turn", () => {
    const s = setup(quiet(WALK));
    const [a, b, c] = standing(s, 0);
    transfer(s, a.id, b.id, 1);
    expect(canTransfer(s, c.id, b.id, 1)).toMatch(/one send/);
  });
});

describe("bases don't disappear: an empty base stays as a ring", () => {
  const RING = { empty: "ring" as const, transfer: { max: 5, ambush: "all" as const, free: true, pace: 400, refill: "own" as const } };
  function emptied(r: Parameters<typeof quiet>[0]) {
    const s = setup(quiet(r));
    const b = standing(s, 1)[0];
    const inside = garrison(s, b);
    inside.slice(1).forEach((x) => (s.soldiers[x.id].alive = false));
    const me = alive(s, 0)[0];
    clear(s, [me, inside[0]]);
    at(s, inside[0], { x: b.x, y: b.y });
    at(s, me, { x: b.x, y: b.y + 400 });
    const o = act(s, flick(me, -Math.PI / 2, 500));
    return { s, b, o };
  }
  it("it isn't struck out: an 'empty' mark instead of a raze", () => {
    const { s, b, o } = emptied(RING);
    expect(o.fell).toContain(b.id);
    expect(s.marks.some((m) => m.t === "raze")).toBe(false);
    expect(s.marks.some((m) => m.t === "empty" && m.base === b.id && !m.crumble)).toBe(true);
  });
  it("its walls still work: an empty hex still banks", () => {
    const s = setup(quiet({ ...RING, kit: ["hex", "circle", "circle", "circle", "circle"], shapes: { hex: { wall: "bank" } } }));
    const hex = s.bases.find((b) => b.owner === 1 && b.shape === "hex")!;
    hex.rot = 0;
    for (const x of garrison(s, hex)) s.soldiers[x.id].alive = false;
    hex.fallen = 1;
    const me = alive(s, 0)[0];
    clear(s, [me]);
    const bottom = hex.y + hex.r * Math.sin(Math.PI / 3);
    at(s, me, { x: hex.x + 300, y: bottom + 100 });
    const o = preview(s, flick(me, Math.atan2(-100, -300), 500));
    expect(o.events.some((e) => e.kind === "bounce" && e.on === "bank")).toBe(true);
  });
  it("crumbled: its walls stop working", () => {
    const s = setup(quiet({ ...RING, empty: "crumble", kit: ["hex", "circle", "circle", "circle", "circle"], shapes: { hex: { wall: "bank" } } }));
    const hex = s.bases.find((b) => b.owner === 1 && b.shape === "hex")!;
    hex.rot = 0;
    for (const x of garrison(s, hex)) s.soldiers[x.id].alive = false;
    hex.fallen = 1;
    const me = alive(s, 0)[0];
    clear(s, [me]);
    const bottom = hex.y + hex.r * Math.sin(Math.PI / 3);
    at(s, me, { x: hex.x + 300, y: bottom + 100 });
    expect(preview(s, flick(me, Math.atan2(-100, -300), 500)).events.some((e) => e.kind === "bounce")).toBe(false);
  });
  it("a send refills your own empty ring when it arrives", () => {
    const s = setup(quiet(RING));
    const [a, b] = standing(s, 0);
    for (const x of garrison(s, b)) s.soldiers[x.id].alive = false;
    b.fallen = 1;
    expect(canTransfer(s, a.id, b.id, 2)).toBeNull();
    transfer(s, a.id, b.id, 2);
    for (let k = 0; k < 6 && s.transits[0].state === "road"; k++) pass(s);
    expect(s.bases[b.id].fallen).toBeUndefined();
    expect(garrison(s, s.bases[b.id])).toHaveLength(2);
  });
  it("refill 'own' can't send into their empty ring; 'any' can, and takes it", () => {
    const s = setup(quiet(RING));
    const a = standing(s, 0)[0], r = standing(s, 1)[0];
    for (const x of garrison(s, r)) s.soldiers[x.id].alive = false;
    r.fallen = 1;
    expect(canTransfer(s, a.id, r.id, 2)).toMatch(/refill/);
    const s2 = setup(quiet({ ...RING, capture: true, transfer: { ...RING.transfer, refill: "any" } }));
    const a2 = standing(s2, 0)[0], r2 = standing(s2, 1)[0];
    for (const x of garrison(s2, r2)) s2.soldiers[x.id].alive = false;
    r2.fallen = 1;
    transfer(s2, a2.id, r2.id, 2);
    for (let k = 0; k < 10 && s2.transits[0].state === "road"; k++) pass(s2);
    expect(s2.bases[r2.id].owner).toBe(0);
    expect(s2.bases[r2.id].fallen).toBeUndefined();
  });
});

describe("positioning: rearrange your soldiers before the first flick", () => {
  const POS = { position: { reach: 40 } };
  function drawn() {
    const s = newGame(quiet(POS), 7);
    let i = 0;
    while (s.phase === "setup") { const [x, y] = SPOTS[i++]; placeBase(s, x, y); }
    return s;
  }
  it("after the bases, the first flicker arranges, then the other, then play begins", () => {
    const s = drawn();
    expect(s.phase).toBe("position");
    expect(s.current).toBe(0);
    doneArranging(s);
    expect(s.current).toBe(1);
    doneArranging(s);
    expect(s.phase).toBe("play");
    expect(s.current).toBe(0);
    expect(s.turn).toBe(1);
  });
  it("a soldier may go anywhere in his base or just outside its wall, not far, and not on anyone", () => {
    const s = drawn();
    const me = alive(s, 0)[0];
    const b = s.bases[me.home!];
    expect(canArrange(s, me.id, b.x + b.r + 30, b.y)).toBeNull();
    expect(canArrange(s, me.id, b.x + b.r + 60, b.y)).toMatch(/far/);
    const mate = alive(s, 0).find((x) => x.home === me.home && x.id !== me.id)!;
    expect(canArrange(s, me.id, mate.x + 3, mate.y)).toMatch(/top/);
    arrange(s, me.id, b.x + b.r + 30, b.y);
    expect(s.soldiers[me.id].x).toBe(b.x + b.r + 30);
    expect(canArrange(s, alive(s, 1)[0].id, 500, 500)).toMatch(/yours/);
  });
  it("the arrangement is in the action log: a replay rebuilds it", () => {
    const s = drawn();
    const me = alive(s, 0)[0];
    const b = s.bases[me.home!];
    arrange(s, me.id, b.x, b.y + b.r + 20);
    doneArranging(s);
    doneArranging(s);
    act(s, flick(alive(s, 0)[1], -Math.PI / 2, 600, "shoot", 5));
    const again = replay(s.rules, s.seed, s.actions);
    expect(JSON.parse(JSON.stringify(again))).toEqual(JSON.parse(JSON.stringify(s)));
  });
});
