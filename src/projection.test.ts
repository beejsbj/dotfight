import { describe, expect, it } from "vitest";
import { fromLocal, project, screenDirToWorld, toLocal, unproject, type View } from "./projection";

const base: View = { ox: 100, oy: 300, x: 500, y: 850, px: 195, py: 520, z: 0.8, rot: 0.3, tilt: 0.5, d: 900 };

// CSS applies `transform-origin` then `perspective(d) rotateX(t)`. Rebuild that
// as plain 4x4 maths to check `project` against what the browser will draw.
function cssProject(v: View, ex: number, ey: number, ez: number) {
  const ox = v.px + v.ox, oy = v.py + v.oy;
  const [x, y, z] = [ex - ox, ey - oy, ez];
  const c = Math.cos(v.tilt), s = Math.sin(v.tilt);
  const [rx, ry, rz] = [x, y * c - z * s, y * s + z * c];
  const w = 1 - rz / v.d; // perspective: m34 = -1/d
  return { x: rx / w + ox - v.ox, y: ry / w + oy - v.oy };
}

describe("projection", () => {
  it("round-trips world and stage-local coordinates", () => {
    const l = toLocal(base, 321, 1234);
    const w = fromLocal(base, l.x, l.y);
    expect(w.x).toBeCloseTo(321, 6);
    expect(w.y).toBeCloseTo(1234, 6);
  });

  it("puts the focus on the pivot, whatever the tilt", () => {
    for (const tilt of [0, 0.3, 0.9]) {
      const p = project({ ...base, tilt }, base.x, base.y);
      expect(p.x).toBeCloseTo(base.px, 6);
      expect(p.y).toBeCloseTo(base.py, 6);
    }
  });

  it("matches the CSS perspective transform, including height above the page", () => {
    for (const [x, y, h] of [[100, 200, 0], [900, 1600, 0], [500, 400, 120], [250, 1300, 300]]) {
      const l = toLocal(base, x, y);
      const css = cssProject(base, l.x, l.y, h * base.z);
      const p = project(base, x, y, h);
      expect(p.x).toBeCloseTo(css.x, 6);
      expect(p.y).toBeCloseTo(css.y, 6);
    }
  });

  it("unprojects a touch back to the page point under it", () => {
    for (const [x, y] of [[100, 200], [900, 1600], [500, 700]]) {
      const p = project(base, x, y);
      const w = unproject(base, p.x, p.y)!;
      expect(w.x).toBeCloseTo(x, 4);
      expect(w.y).toBeCloseTo(y, 4);
    }
  });

  it("returns null above the horizon", () => {
    expect(unproject({ ...base, tilt: 1.2, d: 400 }, base.px, -5000)).toBeNull();
  });

  it("far things are smaller when tilted, and nothing changes when flat", () => {
    const tilted = { ...base, rot: 0 };
    const near = project(tilted, base.x, base.y + 300), far = project(tilted, base.x, base.y - 300);
    expect(far.k).toBeLessThan(near.k);
    const flat = { ...tilted, tilt: 0 };
    expect(project(flat, base.x, base.y + 300).k).toBeCloseTo(flat.z, 9);
  });

  it("a thumb drag maps to the page direction that looks the same on screen", () => {
    const flat = { ...base, tilt: 0, rot: 0 };
    expect(screenDirToWorld(flat, { x: 500, y: 850 }, 0, -1)).toBeCloseTo(-Math.PI / 2, 6);
    const turned = { ...flat, rot: Math.PI };
    // page upside down: dragging up the screen points down the page
    expect(Math.cos(screenDirToWorld(turned, { x: 500, y: 850 }, 0, -1) - Math.PI / 2)).toBeCloseTo(1, 6);
    // tilted: straight up the screen is still straight up the page (no rotation)
    const tilted = { ...base, rot: 0 };
    expect(screenDirToWorld(tilted, { x: 500, y: 850 }, 0, -1)).toBeCloseTo(-Math.PI / 2, 6);
  });
});
