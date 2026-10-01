import { describe, expect, it } from "vitest";
import { Camera } from "./camera";
import { project } from "./projection";

const cam = () => { const c = new Camera(); c.resize(390, 844, 90, 190); return c; };
const wrap = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

describe("aiming turns the page so the shot goes up the screen", () => {
  for (const tilt of [0, 0.55]) for (const a of [-Math.PI / 2, 0, 1, 2.5, Math.PI / 2, -2.2]) {
    it(`angle ${a.toFixed(2)}, tilt ${tilt}`, () => {
      const c = cam();
      c.sit({ x: 300, y: 500 }, 2.1, tilt, 0.74);
      c.aimUp(a);
      c.snap();
      const me = { x: 300, y: 500 };
      const p0 = project(c.view(), me.x, me.y);
      const p1 = project(c.view(), me.x + Math.cos(a) * 120, me.y + Math.sin(a) * 120);
      // straight up: no sideways drift, and further up the screen
      expect(Math.abs(p1.x - p0.x)).toBeLessThan(0.01);
      expect(p1.y).toBeLessThan(p0.y - 20);
    });
  }

  it("a page the other player holds (rot pi) faces forward as angle +pi/2", () => {
    const c = cam();
    c.aimUp(Math.PI / 2);
    expect(wrap(c.tgt.rot - Math.PI)).toBeCloseTo(0, 9);
  });

  it("a continuous aim never spins the long way round", () => {
    const c = cam();
    let last = c.tgt.rot;
    for (let a = -Math.PI / 2; a < Math.PI * 1.6; a += 0.05) {
      c.aimUp(a);
      expect(Math.abs(c.tgt.rot - last)).toBeLessThan(0.1);
      last = c.tgt.rot;
    }
  });

  it("face() returns to the player's own way the short way", () => {
    const c = cam();
    c.aimUp(-Math.PI / 2 + 0.5);
    c.face(0);
    expect(Math.abs(c.tgt.rot)).toBeLessThan(0.01);
    expect(c.rotRate).toBeUndefined();
  });

  it("returns from the visible pose when a fast sweep's target crosses pi", () => {
    const c = cam();
    c.cur.rot = 1;
    c.tgt.rot = Math.PI + 0.2;
    c.face(0);
    expect(c.tgt.rot).toBe(0);
    expect(Math.abs(c.tgt.rot - c.cur.rot)).toBeLessThan(Math.PI);
  });

  it("snaps only the return rotation for reduced motion", () => {
    const c = cam();
    c.cur.rot = 1.4;
    c.tgt.rot = 1.8;
    c.tgt.m = 2.1;
    c.face(0, true);
    expect(c.cur.rot).toBe(c.tgt.rot);
    expect(c.cur.rot).toBe(0);
    expect(c.cur.m).toBe(1);
    expect(c.tgt.m).toBe(2.1);
  });
});

describe("standing up after a shot on a turned page", () => {
  for (const rot of [Math.PI / 3, -Math.PI / 3, 2 * Math.PI / 3, -2 * Math.PI / 3]) {
    for (const me of [{ x: 40, y: 40 }, { x: 960, y: 40 }, { x: 40, y: 1660 }, { x: 960, y: 1660 }]) {
      it(`keeps corner ${me.x},${me.y} clear of both HUD bars at rotation ${rot}`, () => {
        const c = cam();
        c.overview(rot, me);
        c.snap();
        const p = project(c.view(), me.x, me.y);
        expect(p.x).toBeGreaterThanOrEqual(89.9);
        expect(p.x).toBeLessThanOrEqual(300.1);
        expect(p.y).toBeGreaterThanOrEqual(c.top + 31.9);
        expect(p.y).toBeLessThanOrEqual(c.H - c.bottom - 31.9);
      });
    }
  }

  it("a forward shot, even from the margin: the page sits centred, as ever (it all fits)", () => {
    const c = cam();
    c.sit({ x: 80, y: 1500 }, 2.1, 0.55, 0.74);
    c.aimUp(-Math.PI / 2);
    c.overview(undefined, { x: 80, y: 1500 });
    expect(c.tgt.x).toBeCloseTo(500, 6);
    expect(c.tgt.y).toBeCloseTo(850, 6);
    expect(c.tgt.m).toBe(1);
    expect(c.tgt.tilt).toBe(0);
  });

  for (const [a, me] of [[0, { x: 300, y: 1550 }], [Math.PI, { x: 700, y: 150 }], [0.4, { x: 900, y: 1650 }], [-2.6, { x: 100, y: 60 }]] as const) {
    it(`a sideways shot (angle ${a}) from the page's far end: the soldier and his line stay on screen`, () => {
      const c = cam();
      c.sit(me, 2.1, 0.55, 0.74);
      c.aimUp(a);
      c.overview(undefined, me);
      c.snap();
      const p0 = project(c.view(), me.x, me.y);
      const p1 = project(c.view(), me.x + Math.cos(a) * 300, me.y + Math.sin(a) * 300);
      expect(p0.x).toBeGreaterThanOrEqual(89.9);
      expect(p0.x).toBeLessThanOrEqual(390 - 89.9);
      // still straight up the screen from him
      expect(Math.abs(p1.x - p0.x)).toBeLessThan(0.01);
      expect(p1.y).toBeLessThan(p0.y);
      // and without the keep, he'd have been off the side
      const d = cam();
      d.aimUp(a);
      d.overview();
      d.snap();
      const q = project(d.view(), me.x, me.y);
      expect(q.x < 90 || q.x > 300).toBe(true);
    });
  }
});

describe("reduced motion cuts every camera move", () => {
  it("lands a lean-in, a page turn and a stand-up in one tick", () => {
    const c = cam();
    c.cut = true;
    c.sit({ x: 300, y: 500 }, 2.1, 0.55, 0.74);
    c.turnTo(Math.PI);
    expect(c.tick(16)).toBe(true);
    expect(c.cur).toEqual(c.tgt);
    expect(c.cur.m).toBe(2.1);
    expect(c.cur.rot).toBeCloseTo(Math.PI, 9);
    c.overview();
    c.tick(16);
    expect(c.cur).toEqual(c.tgt);
    expect(c.cur.m).toBe(1);
  });

  it("without it the same move eases over many frames", () => {
    const c = cam();
    c.sit({ x: 300, y: 500 }, 2.1, 0.55, 0.74);
    c.tick(16);
    expect(c.cur.m).toBeGreaterThan(1);
    expect(c.cur.m).toBeLessThan(2.1);
    expect(c.settled).toBe(false);
  });
});
