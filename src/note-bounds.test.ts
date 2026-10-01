import { describe, expect, it } from "vitest";
import { inscribedBounds } from "./note-bounds";
import type { Pt } from "./geom";

const diagonal = [{ x: 0, y: -4 }, { x: 4, y: 0 }, { x: 0, y: 4 }, { x: -4, y: 0 }];
const tilted = [{ x: -5, y: -3 }, { x: 4, y: -1 }, { x: 2, y: 6 }, { x: -2, y: 4 }];

describe("initial note bounds", () => {
  it.each([[diagonal], [tilted], [[...tilted].reverse()]])("keeps all four corners inside every polygon edge", (pts: Pt[]) => {
    const B = inscribedBounds(pts);
    expect(B.x1).toBeGreaterThan(B.x0);
    expect(B.y1).toBeGreaterThan(B.y0);
    const center = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
    const corners = [{ x: B.x0, y: B.y0 }, { x: B.x1, y: B.y0 }, { x: B.x1, y: B.y1 }, { x: B.x0, y: B.y1 }];
    let closest = Infinity;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const cross = (p: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const sign = Math.sign(cross(center));
      for (const p of corners) {
        const inside = sign * cross(p);
        expect(inside).toBeGreaterThanOrEqual(-1e-10);
        closest = Math.min(closest, Math.abs(inside));
      }
    });
    // At least one corner reaches an edge: further homothetic growth cannot fit.
    expect(closest).toBeLessThan(1e-10);
  });

  it("inscribes the diagonal diamond exactly", () => {
    expect(inscribedBounds(diagonal)).toEqual({ x0: -2, x1: 2, y0: -2, y1: 2 });
  });
});
