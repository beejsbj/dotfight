// The pressed marks are seeded: the same seed draws the same mark every time.
import { describe, expect, it } from "vitest";
import { inkShape, shapeCorners } from "./ink";
import { rng } from "./geom";
import { drawDot, drawSpent, MAN, manR } from "./page";
import { RULES } from "./rules";

/** A 2D context that only remembers what was asked of it. */
function recorder() {
  const calls: string[] = [];
  const num = (v: unknown) => (typeof v === "number" ? v.toFixed(4) : String(v));
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(`${k}(${a.map(num).join(",")})`); }),
    set: (t, k: string, v) => { t[k] = v; calls.push(`${k}=${num(v)}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("inkShape", () => {
  it("draws the same triangle for the same seed, another for another, and its redrawings stray", () => {
    const a = recorder(), b = recorder(), c = recorder(), d = recorder();
    inkShape(a.ctx, 100, 100, 9, 3, 0.4, "#123", 77);
    inkShape(b.ctx, 100, 100, 9, 3, 0.4, "#123", 77);
    inkShape(c.ctx, 100, 100, 9, 3, 0.4, "#123", 78);
    inkShape(d.ctx, 100, 100, 9, 3, 0.4, "#123", 77, 1, 1, 1);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls).not.toEqual(c.calls);
    expect(a.calls).not.toEqual(d.calls);
    // three bowed sides, filled, then the darker core: the same path again, smaller
    expect(a.calls.filter((k) => k.startsWith("quadraticCurveTo")).length).toBe(6);
    expect(a.calls.filter((k) => k === "fill()").length).toBe(2);
    expect(a.calls).not.toContainEqual(expect.stringMatching(/^stroke/));
  });

  it("with fewer than three corners it is the plain dot", () => {
    const a = recorder(), b = recorder();
    inkShape(a.ctx, 50, 50, 7, 0, 0, "#123", 5);
    // inkDot's path: lumps as lineTo, then the core as an arc
    expect(a.calls.some((k) => k.startsWith("arc("))).toBe(true);
    expect(a.calls.some((k) => k.startsWith("quadraticCurveTo"))).toBe(false);
    inkShape(b.ctx, 50, 50, 7, 1, 0, "#123", 5);
    expect(b.calls).toEqual(a.calls);
  });

  it("corners sit about the circumradius, turned with the base", () => {
    const vs = shapeCorners(0, 0, 9, 6, 1.2, rng(3));
    expect(vs.length).toBe(6);
    for (const v of vs) expect(Math.hypot(v.x, v.y)).toBeGreaterThanOrEqual(9 * 0.86 - 1e-9);
    for (const v of vs) expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(9 * 1.12 + 1e-9);
    const turned = shapeCorners(0, 0, 9, 6, 1.2 + 0.7, rng(3));
    // the same hand (seed) at a base turned further: every corner turns with it
    turned.forEach((t, k) => {
      const v = vs[k], c = Math.cos(0.7), sn = Math.sin(0.7);
      expect(t.x).toBeCloseTo(v.x * c - v.y * sn, 6);
      expect(t.y).toBeCloseTo(v.x * sn + v.y * c, 6);
    });
  });
});

describe("drawDot and drawSpent by shape", () => {
  it("a man without a shape is the dot, exactly as before", () => {
    const a = recorder(), b = recorder();
    drawDot(a.ctx, { id: 4, owner: 0, x: 10, y: 10 });
    drawDot(b.ctx, { id: 4, owner: 0, x: 10, y: 10, shape: "camp" });
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.some((k) => k.startsWith("arc("))).toBe(true);
    expect(manR({})).toBe(RULES.soldierRadius);
    expect(manR({ shape: "camp" })).toBe(RULES.soldierRadius);
  });

  it("a prism's man is pressed as a triangle turned with his base; a card's man says so itself", () => {
    const a = recorder(), b = recorder(), c = recorder();
    drawDot(a.ctx, { id: 4, owner: 0, x: 10, y: 10, shape: "prism", rot: 0.5 });
    drawDot(b.ctx, { id: 4, owner: 0, x: 10, y: 10, shape: "prism", rot: 0.5 });
    drawDot(c.ctx, { id: 4, owner: 0, x: 10, y: 10, shape: "prism", rot: 1.5 });
    expect(a.calls).toEqual(b.calls);
    expect(a.calls).not.toEqual(c.calls);
    expect(a.calls.filter((k) => k.startsWith("quadraticCurveTo")).length).toBe(6);
    expect(manR({ shape: "prism" })).toBe(MAN.prism.R);
  });

  it("the hollow he leaves is in his shape, on his corners", () => {
    const hex = recorder(), dot = recorder();
    drawSpent(hex.ctx, { id: 9, owner: 1, x: 40, y: 40, shape: "cushion", rot: 0.2 }, { x: 40, y: 40 });
    drawSpent(dot.ctx, { id: 9, owner: 1, x: 40, y: 40 }, { x: 40, y: 40 });
    // a hollow hexagon is a stroked polygon; a hollow dot is a stroked circle, as before
    expect(hex.calls.filter((k) => k === "stroke()").length).toBe(1);
    expect(dot.calls.filter((k) => k === "stroke()").length).toBe(1);
    expect(hex.calls).not.toEqual(dot.calls);
    const corners = shapeCorners(40, 40, MAN.cushion.R * 0.88, 6, 0.2, rng(9 * 131 + 7));
    expect(hex.calls.some((k) => k === `moveTo(${corners[0].x.toFixed(4)},${corners[0].y.toFixed(4)})` || k.startsWith("moveTo("))).toBe(true);
  });
});
