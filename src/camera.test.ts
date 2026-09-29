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
});
