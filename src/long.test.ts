import { describe, expect, it } from "vitest";
import { act, canArrange, roadBetween, columnAt, capacity, corners, illegal, inside, newGame, preview, scatterIn, trace, wallGap, wallStrength, type Base, type Flick, type GameState, type Player } from "./game";
import { inBase, pickSoldier } from "./hand";
import { passesAll } from "./life";
import { dist, insidePoly, offsetPolygon, pathLen, polyHits, polygon, type Pt } from "./geom";
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

/** Fill a base with its own men, as jotted. */
function fill(s: GameState, base: number, n = capacity(s, s.bases[base])) {
  const b = s.bases[base];
  for (const p of scatterIn(b, n, 77 + base)) man(s, b.owner, p.x, p.y, base);
}

const shot = (soldier: number, angle: number, length: number, kind: Flick["kind"] = "snipe", wob = 1): Flick => ({ soldier, kind, angle, length, bend: 0, wob });
const heading = (pts: Pt[]) => { const a = pts[pts.length - 2], b = pts[pts.length - 1]; return Math.atan2(b.y - a.y, b.x - a.x); };
const stroke = (s: GameState, owner: Player, pts: Pt[]) => s.marks.push({ t: "stroke", kind: "snipe", owner, pts, seed: 1, turn: 0 });

describe("a camp's well", () => {
  // a snipe along y = 1000, passing 110 units above a camp's centre (48 outside its wall)
  const page = (men: number) => {
    const s = field([["camp", 1, 500, 1110]]);
    fill(s, 0, men);
    return { s, me: man(s, 0, 150, 1000) };
  };

  it("bends a passing line toward the camp, harder the fuller it is", () => {
    const full = page(12), thin = page(4), empty = page(0);
    const bend = ({ s, me }: { s: GameState; me: number }) => heading(trace(s, shot(me, 0, 700)).pts);
    expect(bend(full)).toBeGreaterThan(bend(thin));
    expect(bend(thin)).toBeGreaterThan(bend(empty));
    expect(bend(empty)).toBeGreaterThan(0); // an empty ring keeps the dent in the paper
    expect(bend(full)).toBeLessThan(LONG.long!.well.maxTurn + 1e-9);
  });

  it("never turns a line more than maxTurn in all", () => {
    const { s, me } = page(12);
    s.rules.long!.well.pull = 1;
    const tr = trace(s, shot(me, 0, 1100));
    expect(Math.abs(heading(tr.pts))).toBeLessThanOrEqual(LONG.long!.well.maxTurn + 1e-9);
  });

  it("doesn't pull a line still leaving its own camp, nor one inside a camp's wall", () => {
    const s = field([["camp", 0, 500, 1000]]);
    const me = man(s, 0, 500, 1000, 0);
    fill(s, 0);
    const tr = trace(s, shot(me, 0, 300));
    expect(heading(tr.pts)).toBeCloseTo(0, 9);
  });
});

describe("a cushion", () => {
  // a hexagon at (500, 800) with a flat wall facing +x at x = 500 + r·cos 30°
  const page = () => {
    const s = field([["cushion", 1, 500, 800, Math.PI / 6]]);
    return { s, me: man(s, 0, 800, 800), wallX: 500 + s.bases[0].r * Math.cos(Math.PI / 6) };
  };

  it("banks a glancing line, and lets a square one in", () => {
    const { s, me, wallX } = page();
    // aim at the wall's middle from above-right, 0.9 rad off square
    const from = { x: 800, y: 800 - (800 - wallX) * Math.tan(0.9) };
    s.soldiers[me].x = from.x; s.soldiers[me].y = from.y;
    const g = trace(s, shot(me, Math.PI - 0.9, 600));
    expect(g.events.map((e) => e.kind)).toEqual(["bank"]);
    expect(heading(g.pts)).toBeCloseTo(0.9, 6); // mirrored off a vertical wall, heading back out to the right
    s.soldiers[me].x = 800; s.soldiers[me].y = 800;
    const sq = trace(s, shot(me, Math.PI, 600));
    expect(sq.events[0]).toMatchObject({ kind: "wall", base: 0 });
    expect(sq.pts[sq.pts.length - 1].x).toBeLessThan(500);
  });

  it("banks at most maxBanks times a line", () => {
    const { s, me } = page();
    s.rules.long!.cushion.maxBanks = 0;
    s.soldiers[me].y = 800 - (800 - (500 + s.bases[0].r * Math.cos(Math.PI / 6))) * Math.tan(0.9);
    expect(trace(s, shot(me, Math.PI - 0.9, 600)).events.some((e) => e.kind === "bank")).toBe(false);
  });
});

describe("a prism", () => {
  const page = () => {
    const s = field([["prism", 0, 500, 1300, Math.PI / 2], ["camp", 1, 500, 300]]); // a corner down, a flat side facing up the page
    const me = man(s, 0, 500, 1300, 0);
    return { s, me };
  };

  it("splits your snipe leaving it, and both halves cross out", () => {
    const { s, me } = page();
    const first = trace(s, shot(me, -Math.PI / 2, 800));
    const split = first.events.find((e) => e.kind === "split")!;
    expect(split).toMatchObject({ base: 0 });
    expect(first.branches).toHaveLength(1);
    const sp = LONG.long!.prism.spread;
    expect(heading(first.pts)).toBeCloseTo(-Math.PI / 2 + sp, 6);
    expect(heading(first.branches![0])).toBeCloseTo(-Math.PI / 2 - sp, 6);
    // a man on each half's line
    const a = man(s, 1, split.at.x + Math.cos(-Math.PI / 2 + sp) * 300, split.at.y + Math.sin(-Math.PI / 2 + sp) * 300);
    const b = man(s, 1, split.at.x + Math.cos(-Math.PI / 2 - sp) * 300, split.at.y + Math.sin(-Math.PI / 2 - sp) * 300);
    const o = preview(s, shot(me, -Math.PI / 2, 800));
    expect(o.killed.sort()).toEqual([a, b].sort());
    expect(o.branches).toHaveLength(1);
  });

  it("a man the other half kills is met along that half, not the main line", () => {
    const { s, me } = page();
    const split = trace(s, shot(me, -Math.PI / 2, 800)).events.find((e) => e.kind === "split")!;
    const sp = LONG.long!.prism.spread;
    const b = man(s, 1, split.at.x + Math.cos(-Math.PI / 2 - sp) * 300, split.at.y + Math.sin(-Math.PI / 2 - sp) * 300);
    const o = act(s, { t: "flick", ...shot(me, -Math.PI / 2, 800) });
    expect(o.events.find((e) => e.kind === "kill" && e.soldier === b)?.branch).toBe(1);
    const ps = passesAll(s.soldiers, o.path, o.branches, me, o.killed, (id) => o.events.find((e) => e.kind === "kill" && e.soldier === id)?.branch ?? 0);
    const p = ps.find((q) => q.id === b)!;
    expect(p).toMatchObject({ fatal: true, branch: 1 });
    // he is some 300 u along the half, which the main line (parting from it) is far from
    expect(p.index).toBeGreaterThan(5);
    expect(p.d).toBeLessThan(1);
  });

  it("doesn't split a lunge, or an enemy's line", () => {
    const { s, me } = page();
    expect(trace(s, shot(me, -Math.PI / 2, 800, "lunge")).branches).toBeUndefined();
    s.current = 1;
    const foe = man(s, 1, 500, 1500);
    expect(trace(s, shot(foe, -Math.PI / 2, 800)).branches).toBeUndefined();
  });

  it("files both halves as strokes", () => {
    const { s, me } = page();
    act(s, { t: "flick", ...shot(me, -Math.PI / 2, 800) });
    expect(s.marks.filter((m) => m.t === "stroke")).toHaveLength(2);
  });
});

describe("old ink", () => {
  it("a dot just past where the line stops is still crossed out, as in the core rules", () => {
    const s = field([]);
    const me = man(s, 0, 500, 850);
    for (let k = 0; k < 40; k++) {
      const a = -Math.PI / 2 + (k - 20) * 0.03, len = 100 + k * 7;
      s.soldiers = s.soldiers.slice(0, 1);
      const foe = man(s, 1, 500 + Math.cos(a) * (len + 6), 850 + Math.sin(a) * (len + 6));
      expect(trace(s, shot(me, a, len)).hits, `angle ${a}, length ${len}`).toEqual([foe]);
    }
  });

  it("a steep crossing jolts the line, at most joltMax times", () => {
    const s = field([]);
    const me = man(s, 0, 150, 1000);
    stroke(s, 1, [{ x: 400, y: 900 }, { x: 400, y: 1100 }]);
    stroke(s, 1, [{ x: 600, y: 900 }, { x: 600, y: 1100 }]);
    const tr = trace(s, shot(me, 0, 700, "snipe", 12345));
    const jolts = tr.events.filter((e) => e.kind === "ink");
    expect(jolts).toHaveLength(LONG.long!.ink.joltMax);
    expect(jolts[0].at.x).toBeCloseTo(400, 6);
    expect(jolts[0].jolt).not.toBe(0);
    expect(heading(tr.pts)).toBeCloseTo(jolts[0].jolt!, 9);
  });

  it("riding your own groove carries a line further; theirs cuts it short", () => {
    const run = (owner: Player) => {
      const s = field([]);
      const me = man(s, 0, 150, 1000);
      stroke(s, owner, [{ x: 150, y: 1002 }, { x: 1000, y: 1002 }]);
      return pathLen(trace(s, shot(me, 0, 600)).pts);
    };
    const bare = (() => { const s = field([]); return pathLen(trace(s, shot(man(s, 0, 150, 1000), 0, 600)).pts); })();
    expect(bare).toBeCloseTo(600, 6);
    expect(run(0)).toBeGreaterThan(bare + 50);
    expect(run(1)).toBeLessThan(bare - 50);
  });
});

describe("long war lines keep the core's walls and kills", () => {
  it("a snipe through a full enemy camp loses what a core one would", () => {
    const s = field([["camp", 1, 500, 1000]]);
    fill(s, 0);
    const me = man(s, 0, 150, 1000);
    const tr = trace(s, shot(me, 0, 1000));
    const wall = tr.events.find((e) => e.kind === "wall")!;
    expect(wall.cost).toBeCloseTo(LONG.garrison!.snipeLoss[1], 9);
    expect(tr.hits.length).toBeGreaterThan(0);
    expect(dist(tr.pts[0], s.soldiers[me])).toBe(0);
  });

  it("a lunger landing inside a manned enemy triangle is shot", () => {
    const s = field([["prism", 1, 500, 1000, 0]]);
    fill(s, 0);
    const me = man(s, 0, 150, 1000);
    const o = preview(s, shot(me, 0, 340, "lunge"));
    expect(o.crashed).toBe(0);
  });
});

describe("long roads", () => {
  // two of player 0's camps 700 apart, one enemy camp out of the way
  const page = () => {
    const s = field([["camp", 0, 200, 1500], ["camp", 0, 900, 1100], ["camp", 1, 500, 200]]);
    for (const b of [0, 1, 2]) fill(s, b, 4);
    return s;
  };
  const handover = (s: GameState) => act(s, { t: "stop" });

  it("a road starts and ends six units off the walls, whatever the shape; a circle keeps r + 6", () => {
    const s = field([["prism", 0, 200, 1500, 0.4], ["cushion", 0, 900, 1100, 0.2], ["camp", 0, 600, 300]]);
    for (const [i, j] of [[0, 1], [1, 0], [0, 2], [2, 1]]) {
      const [p, q] = roadBetween(s.bases[i], s.bases[j]);
      expect(wallGap(s.bases[i], p)).toBeCloseTo(6, 4);
      expect(wallGap(s.bases[j], q)).toBeCloseTo(6, 4);
    }
    const [a, b] = [{ x: 0, y: 0, r: 80 }, { x: 300, y: 0, r: 80 }];
    expect(roadBetween(a, b)).toEqual([{ x: 86, y: 0 }, { x: 214, y: 0 }]);
  });

  it("a convoy walks the pace at every hand-over, exposed all the way, and goes in at the far wall", () => {
    const s = page();
    act(s, { t: "send", from: 0, to: 1, n: 3 });
    const c = s.convoys[0];
    const l = dist(c.road[0], c.road[1]);
    const pace = LONG.long!.sendPace;
    const seen: number[] = [];
    let o = handover(s);
    expect(o.walked).toEqual([0]);
    for (let k = 0; c.state === "road" && k < 20; k++) {
      seen.push(c.at!);
      const heads = columnAt(c.road, c.at!, 3);
      c.ids.forEach((id, i) => expect(dist(s.soldiers[id], heads[i])).toBeLessThan(1e-9));
      o = handover(s);
    }
    expect(c.state).toBe("arrived");
    expect(o.arrived).toEqual([0]);
    const legs = [Math.min(l, pace)];
    while (legs[legs.length - 1] + pace < l) legs.push(legs[legs.length - 1] + pace);
    expect(seen).toEqual(legs);
    for (const id of c.ids) expect(inside(s.bases[1], s.soldiers[id])).toBe(true);
  });

  it("a convoy on a road shorter than the pace is still out for one enemy turn", () => {
    const s = field([["camp", 0, 300, 1500], ["camp", 0, 300, 1300], ["camp", 1, 500, 200]]);
    for (const b of [0, 1, 2]) fill(s, b, 4);
    act(s, { t: "send", from: 0, to: 1, n: 2 });
    expect(handover(s).walked).toEqual([0]);
    expect(s.convoys[0].state).toBe("road");
    expect(handover(s).arrived).toEqual([0]);
  });

  it("a line along the road crosses walkers out, and an emptied convoy is cut", () => {
    const s = page();
    act(s, { t: "send", from: 0, to: 1, n: 2 });
    handover(s);
    const c = s.convoys[0];
    const [head, last] = c.ids.map((id) => s.soldiers[id]);
    // an enemy just behind the column's tail, flicking up the road
    const up = Math.atan2(head.y - last.y, head.x - last.x);
    const foe = man(s, 1, last.x - Math.cos(up) * 60, last.y - Math.sin(up) * 60);
    const o = act(s, { t: "flick", ...shot(foe, up, 120) });
    expect(o.killed.sort()).toEqual([head.id, last.id].sort());
    expect(c.state).toBe("cut");
  });
});

describe("shaped soldiers", () => {
  // four bases placed by the rules, then straight into play
  const page = () => {
    const s = newGame(SIZES.long, 5, undefined, LONG);
    const kit: [Shape, number, number][] = [["prism", 250, 1450], ["camp", 450, 300], ["cushion", 700, 1450], ["prism", 800, 300]];
    for (const [shape, x, y] of kit) act(s, { t: "base", x, y, shape });
    Object.assign(s, { phase: "play", turn: 1, current: 0, left: 1, ready: [true, true] });
    return s;
  };

  it("takes his base's shape and turn at the jot, in a long war only", () => {
    const s = page();
    for (const b of s.bases) {
      for (const x of s.soldiers.filter((m) => m.home === b.id)) {
        expect(x.shape).toBe(b.shape);
        if (b.shape === "camp") expect(x).not.toHaveProperty("rot");
        else expect(x.rot).toBe(b.rot);
      }
    }
    const core = newGame(SIZES.quick, 5);
    act(core, { t: "base", x: 300, y: 1300 });
    for (const x of core.soldiers) { expect(x).not.toHaveProperty("shape"); expect(x).not.toHaveProperty("rot"); }
  });

  it("keeps it across a send: a prism's men arrive at a cushion still triangles", () => {
    const s = page();
    const was = s.soldiers.filter((x) => x.home === 0).map((x) => ({ id: x.id, shape: x.shape, rot: x.rot }));
    act(s, { t: "send", from: 0, to: 2, n: 3 });
    const c = s.convoys[0];
    for (let k = 0; c.state !== "arrived" && k < 20; k++) act(s, { t: "stop" });
    expect(c.state).toBe("arrived");
    for (const id of c.ids) {
      const x = s.soldiers[id], w = was.find((m) => m.id === id)!;
      expect(x.home).toBe(2);
      expect(x.shape).toBe("prism");
      expect([x.shape, x.rot]).toEqual([w.shape, w.rot]);
    }
  });

  it("keeps it across a lunge onto open paper", () => {
    const s = page();
    const me = s.soldiers.filter((x) => x.home === 0).sort((p, q) => p.y - q.y)[0];
    const { shape, rot } = me;
    const o = act(s, { t: "flick", ...shot(me.id, -Math.PI / 2, 260, "lunge") });
    expect(o.movedTo).toBeDefined();
    expect(me.y).toBeLessThan(1300);
    expect([me.shape, me.rot]).toEqual([shape, rot]);
  });
});

describe("walls, not circumcircles", () => {
  it("a tap or a count at a triangle's corner-side outside its walls misses; inside its walls hits", () => {
    const s = field([["prism", 0, 500, 1300, Math.PI / 2]]); // a corner down: the flat side faces up the page, 41.9 u from the centre
    const me = man(s, 0, 500, 1300, 0);
    const inr = s.bases[0].r / 2;
    const out = { x: 500, y: 1300 - inr - 15 }; // inside the circumcircle, 15 u past the flat wall
    expect(inBase([{ ...out }], s.bases[0])).toHaveLength(0);
    expect(inBase([{ x: 500, y: 1300 - inr + 1 }], s.bases[0])).toHaveLength(1);
    const view = { current: 0 as Player, soldiers: s.soldiers, bases: s.bases };
    expect(pickSoldier(view, out, { soldier: 3, base: 5 })).toBeUndefined();
    expect(pickSoldier(view, out, { soldier: 3, base: 20 })).toBe(me);
  });

  it("the positioning zone is exactly where canArrange lets a man stand, corners rounded", () => {
    const s = field([["prism", 0, 500, 1300, Math.PI / 2]]);
    s.phase = "position";
    const b = s.bases[0], reach = s.rules.positionReach;
    const ring = offsetPolygon(corners(b)!, reach);
    for (const p of ring) expect(wallGap(b, p)).toBeCloseTo(reach, 6);
    const me = man(s, 0, 500, 1300, 0);
    // just inside the drawn corner is allowed; just outside it is refused
    const c = ring.reduce((a, p) => (p.y > a.y ? p : a));
    const dir = { x: c.x - b.x, y: c.y - b.y }, l = Math.hypot(dir.x, dir.y);
    const at = (k: number) => ({ x: c.x + (dir.x / l) * k, y: c.y + (dir.y / l) * k });
    expect(canArrange(s, me, at(-1).x, at(-1).y)).toBeNull();
    expect(canArrange(s, me, at(2).x, at(2).y)).not.toBeNull();
  });

  it("offsetPolygon is the set within pad of the wall, whichever way the corners run", () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    for (const vs of [sq, [...sq].reverse()]) {
      const ring = offsetPolygon(vs, 5);
      for (const p of ring) expect(Math.hypot(Math.max(0, -p.x, p.x - 10), Math.max(0, -p.y, p.y - 10))).toBeCloseTo(5, 6);
      expect(Math.min(...ring.map((p) => p.x))).toBeCloseTo(-5, 6);
      expect(Math.max(...ring.map((p) => p.y))).toBeCloseTo(15, 6);
    }
  });
});
