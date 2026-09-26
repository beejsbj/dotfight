import { describe, expect, it } from "vitest";
import { BOIL, BOILS, boilFrame, boldAt, lookAt, planBoil, spotKey, variantAt } from "./boil";
import { act, alive, newGame, placeBase, rng, type GameState } from "./game";
import { redrawn } from "./ink";
import { SETTLED, type Ink } from "./page";

function setup() {
  const s = newGame(42);
  for (const [x, y] of [[300, 1200], [300, 200], [700, 1200], [700, 200], [500, 1000], [500, 400]]) placeBase(s, x, y);
  return s;
}

/** Ink with some keys still being drawn, at progress `p`. */
const drawing = (p: Record<string, number>): Ink => ({ p: (k) => p[k] ?? 1, live: new Set(Object.keys(p)) });

const shootAt = (s: GameState, me: { id: number; x: number; y: number }, foe: { x: number; y: number }) =>
  act(s, { soldierId: me.id, kind: "shoot", angle: Math.atan2(foe.y - me.y, foe.x - me.x), length: 3000, bend: 0 });

describe("which side boils", () => {
  it("is the living, as Burooj asked", () => {
    expect(BOILS).toBe("living");
  });
});

describe("how it boils", () => {
  it("a living thing changes drawing at the boil rate, and a still thing never", () => {
    const changes = (boils: boolean) => {
      let n = 0, prev = lookAt(boils, "3@1,2", 0);
      for (let ms = 1; ms <= 1000; ms++) {
        const v = lookAt(boils, "3@1,2", ms);
        if (v !== prev) n++;
        prev = v;
      }
      return n;
    };
    expect(changes(true)).toBe(BOIL.fps);
    expect(changes(false)).toBe(0);
  });

  it("is boldest standing up and gentlest leaning in, never bolder as the camera comes closer", () => {
    expect(boldAt(1)).toBe(0); // the whole page
    expect(BOIL.bold[boldAt(2.3)].amp).toBe(1); // sat down behind a soldier (camera.sit)
    let prev = Infinity;
    for (let m = 0.8; m < 6; m += 0.05) {
      const amp = BOIL.bold[boldAt(m)].amp;
      expect(amp).toBeLessThanOrEqual(prev);
      prev = amp;
    }
  });

  it("a boldness is a different look, so a camera going up redraws the living; a still thing is still at any", () => {
    for (let ms = 0; ms < 1000; ms += 37) {
      expect(lookAt(true, "b1@5", ms, 0)).not.toBe(lookAt(true, "b1@5", ms, 2));
      expect(lookAt(false, "b1@5", ms, 0)).toBe(lookAt(false, "b1@5", ms, 2));
    }
  });
});

describe("the boil clock and its drawings", () => {
  it("ticks at the boil rate", () => {
    const step = 1000 / BOIL.fps;
    expect(boilFrame(0)).toBe(0);
    expect(boilFrame(step - 1)).toBe(0);
    expect(boilFrame(step)).toBe(1);
    expect(boilFrame(1000)).toBe(BOIL.fps);
  });

  it("is deterministic, in range, and changes drawing every frame", () => {
    for (const key of ["3@120,400", "b2@99", "m17@5"]) {
      const seen = new Set<number>();
      for (let f = 0; f < 12; f++) {
        const v = variantAt(f, key);
        expect(v).toBe(variantAt(f, key));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(BOIL.variants);
        if (f) expect(v).not.toBe(variantAt(f - 1, key));
        seen.add(v);
      }
      expect(seen.size).toBe(BOIL.variants);
      // a cycle: it comes back round
      expect(variantAt(BOIL.variants + 4, key)).toBe(variantAt(4, key));
    }
  });

  it("doesn't pulse in unison: neighbours show different drawings on the same frame", () => {
    const keys = Array.from({ length: 30 }, (_, i) => `${i}@${100 + i * 7},${300 + i * 3}`);
    for (let f = 0; f < 6; f++) expect(new Set(keys.map((k) => variantAt(f, k))).size).toBeGreaterThan(1);
    // and not all of them turn the same way
    const dirs = new Set(keys.map((k) => (variantAt(1, k) - variantAt(0, k) + BOIL.variants) % BOIL.variants));
    expect(dirs.size).toBe(2);
  });

  it("one drawing means holding still", () => {
    expect(variantAt(5, "x", 1)).toBe(0);
  });

  it("drawing 0 is the page's drawing exactly; the others stray only a little", () => {
    const a = rng(77), b = redrawn(77, 0, 0.5);
    for (let i = 0; i < 20; i++) expect(b()).toBe(a());
    const c = rng(77), d = redrawn(77, 2, 0.5);
    for (let i = 0; i < 50; i++) expect(Math.abs(d() - c())).toBeLessThanOrEqual(0.25);
  });
});

describe("the living boil", () => {
  it("on a fresh page every soldier and every camp boils, and none of them is on the page yet", () => {
    const s = setup();
    const p = planBoil(s, SETTLED, { on: true });
    expect(p.dots).toHaveLength(s.soldiers.length);
    expect(p.dots.every((d) => d.boils)).toBe(true);
    expect(p.bases.map((b) => b.id)).toEqual(s.bases.map((b) => b.id));
    expect(p.hold.dots.size).toBe(s.soldiers.length);
    expect(p.hold.bases.size).toBe(s.bases.length);
    expect(p.hold.marks.size).toBe(0);
  });

  it("switched off, nothing boils and nothing is held", () => {
    const s = setup();
    const p = planBoil(s, SETTLED, { on: false });
    expect(p.dots).toHaveLength(0);
    expect(p.bases).toHaveLength(0);
    expect(p.hold.dots.size + p.hold.bases.size).toBe(0);
  });

  it("a soldier stops boiling when his cross lands, not when the flick is fired", () => {
    const s = setup();
    const me = alive(s, 0)[0], foe = alive(s, 1)[0];
    const first = s.marks.length;
    shootAt(s, me, foe);
    expect(s.soldiers[foe.id].alive).toBe(false);
    const kill = s.marks.findIndex((m, i) => i > first && m.t === "cross" && m.kind === "kill" && m.x === foe.x && m.y === foe.y);
    expect(kill).toBeGreaterThan(first);
    const key = spotKey(foe);
    // the ink hasn't reached him: still standing, still boiling
    const before = planBoil(s, drawing({ [`m${first}`]: 0.4, [`m${kill}`]: 0 }), { on: true });
    expect(before.hold.dots.has(key)).toBe(true);
    expect(before.dots.find((d) => d.spot.key === key)?.boils).toBe(true);
    // his cross is going on: still, and onto the page
    const during = planBoil(s, drawing({ [`m${kill}`]: 0.3 }), { on: true });
    expect(during.hold.dots.has(key)).toBe(false);
    expect(during.dots.some((d) => d.spot.key === key)).toBe(false);
    expect(planBoil(s, SETTLED, { on: true }).hold.dots.has(key)).toBe(false);
  });

  it("a moved soldier's old dot is dead ink; he boils where he stands now", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    const from = spotKey(me);
    act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 150, bend: 0 });
    const now = spotKey(s.soldiers[me.id]);
    expect(now).not.toBe(from);
    const p = planBoil(s, SETTLED, { on: true });
    expect(p.hold.dots.has(from)).toBe(false);
    expect(p.hold.dots.has(now)).toBe(true);
  });

  it("while he rides his ink he is held off the page but not drawn by the boil", () => {
    const s = setup();
    const me = alive(s, 0)[0];
    act(s, { soldierId: me.id, kind: "move", angle: -Math.PI / 2, length: 150, bend: 0 });
    const now = spotKey(s.soldiers[me.id]);
    for (const on of [true, false]) {
      const p = planBoil(s, SETTLED, { on, moving: me.id });
      expect(p.hold.dots.has(now)).toBe(true);
      expect(p.dots.some((d) => d.spot.key === now)).toBe(false);
    }
  });

  it("a dot still being jotted is held, but drawn by the live layer, not the boil", () => {
    const s = setup();
    const x = s.soldiers[3];
    const p = planBoil(s, drawing({ [`d${x.id}`]: 0.5 }), { on: true });
    expect(p.hold.dots.has(spotKey(x))).toBe(true);
    expect(p.dots.some((d) => d.spot.id === x.id)).toBe(false);
  });

  it("a camp stops boiling when it's emptied", () => {
    const s = setup();
    const b = s.bases[1];
    const garrison = s.soldiers.filter((x) => x.owner === b.owner && Math.hypot(x.x - b.x, x.y - b.y) <= b.r);
    expect(garrison.length).toBeGreaterThan(0);
    for (const x of garrison.slice(1)) x.alive = false;
    expect(planBoil(s, SETTLED, { on: true }).hold.bases.has(b.id)).toBe(true);
    garrison[0].alive = false;
    const p = planBoil(s, SETTLED, { on: true });
    expect(p.hold.bases.has(b.id)).toBe(false);
    expect(p.bases.some((x) => x.id === b.id)).toBe(false);
  });

  it("the plan's signature changes exactly when what boils does", () => {
    const s = setup();
    const a = planBoil(s, SETTLED, { on: true }), b = planBoil(s, SETTLED, { on: true });
    expect(a.sig).toBe(b.sig);
    expect(a.hold.sig).toBe(b.hold.sig);
    s.soldiers[0].alive = false;
    const c = planBoil(s, SETTLED, { on: true });
    expect(c.sig).not.toBe(a.sig);
    expect(c.hold.sig).not.toBe(a.hold.sig);
  });
});

describe("the other way round", () => {
  it("side 'dead': the lines and the dead boil, the living hold still, and all of it stays off the page", () => {
    const s = setup();
    const me = alive(s, 0)[0], foe = alive(s, 1)[0];
    shootAt(s, me, foe);
    const p = planBoil(s, SETTLED, { on: true, side: "dead" });
    expect(p.marks.length).toBe(s.marks.length);
    expect(p.marks.every((m) => m.boils)).toBe(true);
    expect(p.dots.find((d) => d.spot.key === spotKey(foe))?.boils).toBe(true);
    expect(p.dots.find((d) => d.spot.key === spotKey(me))?.boils).toBe(false);
    // a living soldier can still die, so even he isn't put on the page
    expect(p.hold.dots.has(spotKey(me))).toBe(true);
  });
});
