import { afterEach, describe, expect, it } from "vitest";
import { act, newGame, placeBase, preview, type GameState } from "./game";
import {
  AMP, FRAME, KEYS, LAST_STAND, LIFE, LIFE_BOX, Life, MOURN, REACH, comrades, inLine, keyAt, lastStand, passes, planFlick, span,
  type Reaction, type Scene,
} from "./life";
import { RULES } from "./rules";

function setup() {
  const s = newGame(42);
  for (const [x, y] of [[300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400]]) placeBase(s, x, y);
  return s;
}
const scene = (s: GameState, o: Partial<Scene> = {}): Scene => ({ s, up: -Math.PI / 2, ...o });
const saved = { ...LIFE };
afterEach(() => Object.assign(LIFE, saved));

describe("key drawings", () => {
  it("a reaction shows one key a frame, on the 12 fps grid, then it's over", () => {
    const r: Reaction = { kind: "hop", t0: 1000, amp: 1 };
    expect(keyAt(r, 999)).toBeNull();
    KEYS.hop.forEach((k, i) => {
      expect(keyAt(r, 1000 + i * FRAME + 1)).toEqual(k);
      expect(keyAt(r, 1000 + (i + 1) * FRAME - 1)).toEqual(k);
    });
    expect(keyAt(r, 1000 + span(r))).toBeNull();
  });

  it("a cheer is hops back to back, each lower than the last", () => {
    const r: Reaction = { kind: "cheer", t0: 0, amp: 1, n: 3 };
    const peak = (i: number) => Math.max(...KEYS.hop.map((_, f) => keyAt(r, (i * KEYS.hop.length + f) * FRAME + 1)!.d ?? 0));
    expect(peak(0)).toBeGreaterThan(peak(1));
    expect(peak(1)).toBeGreaterThan(peak(2));
    expect(peak(2)).toBeGreaterThan(0);
  });

  it("mourning: the heart stops dead for a beat, then comes back slowly to itself", () => {
    const r: Reaction = { kind: "mourn", t0: 0, amp: 1 };
    expect(keyAt(r, 100)!.r).toBe(0);
    expect(keyAt(r, MOURN.still - 1)!.r).toBe(0);
    const mid = keyAt(r, MOURN.still + MOURN.low / 2)!.r!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(keyAt(r, MOURN.still + MOURN.low - 1)!.r).toBeCloseTo(1, 1);
    expect(keyAt(r, MOURN.still + MOURN.low)).toBeNull();
  });
});

describe("a soldier's pose", () => {
  it("never takes him out of his box on the boil layer, whatever piles up on him", () => {
    const s = setup();
    act(s, { soldierId: 0, kind: "shoot", angle: 0.3, length: 3000, bend: 0 });
    const life = new Life();
    const id = s.soldiers.find((x) => x.alive && x.owner === 1)!.id;
    const other = s.soldiers.find((x) => x.alive && x.owner === 1 && x.id !== id)!.id;
    const kinds: Reaction["kind"][] = ["hop", "flinch", "gasp", "recoil", "perk", "land", "cheer", "mourn"];
    kinds.forEach((kind, i) => life.add(id, { kind, t0: i * 7, dir: i, amp: 1.5, n: 3 }));
    life.see(scene(s, { zoom: 1, eager: 1, chosen: { id: other, t0: 0 }, aim: { angle: 0, power: 1, reach: 2000, spread: 0.5 } }), 0);
    for (let ms = 0; ms < 3000; ms += FRAME) {
      const q = life.pose(id, ms);
      expect(Math.hypot(q.ox, q.oy)).toBeLessThanOrEqual(REACH.offset + 1e-9);
      expect(q.st).toBeLessThanOrEqual(REACH.stretch);
      expect(q.k).toBeLessThanOrEqual(REACH.scale);
      expect(q.k).toBeGreaterThanOrEqual(1 / REACH.scale);
      // his scribble at its widest, off his spot, still inside the box
      expect(Math.hypot(q.ox, q.oy) + RULES.soldierRadius * 1.3 * q.st * q.k).toBeLessThan(LIFE_BOX);
    }
  });

  it("is the same for the same moment: nothing random that isn't seeded", () => {
    const s = setup();
    const a = new Life(), b = new Life();
    for (const l of [a, b]) { l.see(scene(s, { eager: 0 }), 0); l.add(3, { kind: "flinch", t0: 500, dir: 1, amp: 1 }); }
    for (let ms = 0; ms < 20000; ms += FRAME) expect(a.pose(3, ms)).toEqual(b.pose(3, ms));
  });

  it("breathes when nothing's happening, and a hop takes him up the screen", () => {
    const s = setup();
    const life = new Life();
    life.see(scene(s, { up: Math.PI / 2 }), 0);
    const ks = Array.from({ length: 60 }, (_, i) => life.pose(5, i * FRAME).k);
    expect(Math.max(...ks) - Math.min(...ks)).toBeGreaterThan(0.04);
    life.add(5, { kind: "hop", t0: 0, amp: 1 });
    const apex = life.pose(5, 2 * FRAME + 1);
    expect(apex.oy).toBeCloseTo(AMP.hop, 0); // up the screen is +y on the page here (the sheet is turned round)
  });

  it("switched off, a soldier just boils", () => {
    const s = setup();
    Object.assign(LIFE, { idle: false, line: false, crowd: false, chosen: false });
    const life = new Life();
    life.see(scene(s, { eager: 0, chosen: { id: 0, t0: 0 } }), 0);
    life.add(4, { kind: "cheer", t0: 0, amp: 1, n: 2 });
    expect(life.pose(4, 200)).toEqual({ ox: 0, oy: 0, k: 1, st: 1, ax: 0, rate: 1 });
    expect(life.scribble(4, 10)).toBe(10);
    expect(life.scribble(4, 11)).toBe(11);
  });
});

describe("the heartbeat", () => {
  it("moves his scribble on by his rate: stopped while he holds his breath, racing when scared", () => {
    const s = setup();
    const life = new Life();
    Object.assign(LIFE, { idle: false });
    life.see(scene(s), 0);
    life.add(2, { kind: "mourn", t0: 0, amp: 1 });
    const at = (look: number) => life.scribble(2, look);
    const a = at(1), b = at(5);
    expect(b).toBe(a); // still
    life.add(7, { kind: "flinch", t0: 0, amp: 1 });
    const c = life.scribble(7, 1), d = life.scribble(7, 4);
    expect(d - c).toBeGreaterThan(3 * 1.9);
    // and never backwards
    expect(life.scribble(7, 5)).toBeGreaterThanOrEqual(d);
  });
});

describe("the pen round a camp", () => {
  it("goes briskly round a full camp and tiredly round an emptying one", () => {
    const s = setup();
    const life = new Life();
    life.see(scene(s), 0);
    const full = life.pace(0, 0);
    for (const x of s.soldiers) if (x.owner === 0 && Math.hypot(x.x - 300, x.y - 1200) < 70) x.alive = false;
    s.soldiers.find((x) => x.owner === 0 && Math.hypot(x.x - 300, x.y - 1200) < 70)!.alive = true;
    expect(life.pace(0, 0)).toBeLessThan(full * 0.6);
  });

  it("never jumps when its pace changes, and stops dead while the camp holds its breath", () => {
    const s = setup();
    const life = new Life();
    life.see(scene(s), 0);
    let prev = life.ring(0, 100, 1700, 0.3);
    life.hold(0, 110 * FRAME, 118 * FRAME);
    for (let look = 101; look < 140; look++) {
      const u = life.ring(0, look, 1700, 0.3);
      const step = u - prev;
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(0.1);
      if (look >= 111 && look < 118) expect(step).toBe(0);
      prev = u;
    }
    // asked again for a recent look: the same place; for one long gone: unknown, so it's redrawn whole
    expect(life.ring(0, 138, 1700, 0.3)).toBe(life.ring(0, 138, 1700, 0.3));
    expect(life.ring(0, 101, 1700, 0.3)).toBeNaN();
  });

  it("hurries while its men are in the line of fire", () => {
    const s = setup();
    const life = new Life();
    const me = s.soldiers.find((x) => x.owner === 1 && Math.hypot(x.x - 300, x.y - 200) < 70)!;
    const calm = (life.see(scene(s), 0), life.pace(0, 0));
    life.see(scene(s, { chosen: { id: me.id, t0: 0 }, aim: { angle: Math.atan2(1200 - me.y, 300 - me.x), power: 0.8, reach: 1800, spread: 0.05 } }), 0);
    expect(life.dreading.length).toBeGreaterThan(0);
    expect(life.pace(0, 0)).toBeGreaterThan(calm * 1.5);
  });
});

describe("who is in the line", () => {
  it("is the enemy in the cone ahead of him, not his own and not behind him", () => {
    const s = setup();
    const me = s.soldiers.find((x) => x.owner === 0 && Math.hypot(x.x - 300, x.y - 1200) < 70)!;
    const up = inLine(s, me.id, -Math.PI / 2, 1800, 0.02);
    expect(up.length).toBeGreaterThan(0);
    for (const id of up) {
      const x = s.soldiers[id];
      expect(x.owner).toBe(1);
      expect(x.y).toBeLessThan(me.y);
    }
    expect(inLine(s, me.id, Math.PI / 2, 1800, 0.02)).toEqual([]);
  });

  it("the ink's passes: who it crosses out, who it only frightens, and which way is away", () => {
    const s = setup();
    const me = s.soldiers.find((x) => x.owner === 0 && Math.hypot(x.x - 300, x.y - 1200) < 70)!;
    const f = { soldierId: me.id, kind: "shoot" as const, angle: -Math.PI / 2, length: 1800, bend: 0 };
    const o = preview(s, f);
    act(s, f);
    const ps = passes(s.soldiers, o.path, me.id, o.killed);
    expect(ps.filter((p) => p.fatal).map((p) => p.id).sort()).toEqual([...o.killed].sort());
    const near = ps.filter((p) => !p.fatal);
    expect(near.length).toBeGreaterThan(0);
    for (const p of near) {
      const x = s.soldiers[p.id];
      expect(x.alive).toBe(true);
      // away from a vertical line at x = me.x is left or right
      expect(Math.sign(Math.cos(p.away))).toBe(Math.sign(x.x - me.x) || Math.sign(Math.cos(p.away)));
    }
    expect(ps.some((p) => p.id === me.id)).toBe(false);
    for (let i = 1; i < ps.length; i++) expect(ps[i].index).toBeGreaterThanOrEqual(ps[i - 1].index);
  });
});

describe("a flick, as the page feels it", () => {
  const shot = (s: GameState, angle: number, kind: "shoot" | "move" = "shoot", length = 1800) => {
    const me = s.soldiers.find((x) => x.owner === 0 && Math.hypot(x.x - 300, x.y - 1200) < 70)!;
    const f = { soldierId: me.id, kind, angle, length, bend: 0 };
    const o = act(s, f);
    return { me, o, plan: planFlick(s, o, me.id, kind, (i) => 100 + i * 20, 900) };
  };

  it("a kill: the shooter recoils, each man hit rears back just before the ink gets to him, his campmates hold still, and the shooter's camp cheers", () => {
    const s = setup();
    const { me, o, plan } = shot(s, -Math.PI / 2);
    expect(o.killed.length).toBeGreaterThan(0);
    const of = (id: number, kind: string) => plan.acts.filter((a) => a.id === id && a.r.kind === kind);
    expect(of(me.id, "recoil")[0].r.t0).toBe(0);
    for (const id of o.killed) {
      const g = of(id, "gasp")[0].r;
      const reach = 100 + passes(s.soldiers, o.path, me.id, o.killed).find((p) => p.id === id)!.index * 20;
      expect(g.t0 + span(g)).toBeCloseTo(reach, 5);
      expect(plan.cues.some((c) => c.id === id && c.say === "gasp")).toBe(true);
    }
    const mourners = plan.acts.filter((a) => a.r.kind === "mourn");
    expect(mourners.length).toBeGreaterThan(0);
    for (const m of mourners) expect(s.soldiers[m.id].owner).toBe(1);
    expect(plan.hush.length).toBeGreaterThan(0);
    const cheers = plan.acts.filter((a) => a.r.kind === "cheer");
    expect(cheers.some((c) => c.id === me.id)).toBe(true);
    for (const c of cheers) expect(s.soldiers[c.id].owner).toBe(0);
    expect(plan.cues.filter((c) => c.say === "cheer").length).toBeLessThanOrEqual(4);
  });

  it("a miss: nobody cheers and nobody mourns", () => {
    const s = setup();
    const { o, plan } = shot(s, Math.PI, "shoot", 250);
    expect(o.killed).toEqual([]);
    expect(plan.acts.some((a) => a.r.kind === "cheer" || a.r.kind === "mourn")).toBe(false);
  });

  it("a move: he says wheee all the way and lands where the ink stops", () => {
    const s = setup();
    const { me, plan } = shot(s, 0, "move", 120);
    expect(plan.cues.find((c) => c.say === "wheee")!.len).toBeCloseTo(0.9);
    expect(plan.acts.find((a) => a.id === me.id && a.r.kind === "land")!.r.t0).toBe(900);
    expect(plan.acts.some((a) => a.r.kind === "recoil")).toBe(false);
  });

  it("flicked off the page, he's mourned, and doesn't land", () => {
    const s = setup();
    const { me, o, plan } = shot(s, Math.PI, "move", 380);
    expect(o.lost).toBe(true);
    expect(plan.acts.some((a) => a.id === me.id && a.r.kind === "land")).toBe(false);
    expect(plan.acts.some((a) => a.r.kind === "mourn" && s.soldiers[a.id].owner === 0)).toBe(true);
  });
});

describe("a side's last few", () => {
  it("are at their last stand from three down, while the war is on", () => {
    const s = setup();
    expect(lastStand(s, 1)).toBe(false);
    const reds = s.soldiers.filter((x) => x.owner === 1);
    reds.slice(LAST_STAND).forEach((x) => (x.alive = false));
    expect(lastStand(s, 1)).toBe(true);
    reds.forEach((x) => (x.alive = false));
    expect(lastStand(s, 1)).toBe(false);
  });

  it("comrades are his own living side, nearest first", () => {
    const s = setup();
    const me = s.soldiers[3];
    const c = comrades(s, me.owner, me, 200, me.id);
    expect(c.every((x) => x.owner === me.owner && x.id !== me.id)).toBe(true);
    for (let i = 1; i < c.length; i++) expect(Math.hypot(c[i].x - me.x, c[i].y - me.y)).toBeGreaterThanOrEqual(Math.hypot(c[i - 1].x - me.x, c[i - 1].y - me.y));
  });
});
