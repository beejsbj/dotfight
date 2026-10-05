import { describe, expect, it } from "vitest";
import { LIFT_MS, SETTLE_MS, lift, settle, shiver } from "./pen";

describe("the pen's own life", () => {
  it("set down, it rocks a few times and dies away to standing", () => {
    const rocks = Array.from({ length: SETTLE_MS / 10 }, (_, i) => settle(i * 10));
    let flips = 0;
    for (let i = 1; i < rocks.length; i++) if (Math.sign(rocks[i]) !== Math.sign(rocks[i - 1]) && rocks[i] !== 0) flips++;
    expect(flips).toBeGreaterThanOrEqual(3);
    expect(Math.max(...rocks.map(Math.abs))).toBeLessThan(0.1);
    expect(Math.abs(settle(SETTLE_MS - 10))).toBeLessThan(0.003);
    expect(settle(SETTLE_MS)).toBe(0);
    expect(settle(-5)).toBe(0);
  });

  it("shivers only near full pull, and only a hair", () => {
    for (let ms = 0; ms < 1000; ms += 7) {
      expect(shiver(ms, 0.85)).toBe(0);
      expect(Math.abs(shiver(ms, 1))).toBeLessThanOrEqual(0.004);
    }
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(shiver(i * 7, 1))))).toBeGreaterThan(0.002);
    // and slow: from one 60 fps frame to the next it moves a fraction of its swing, never across it
    for (let ms = 0; ms < 1000; ms += 5) expect(Math.abs(shiver(ms + 1000 / 60, 1) - shiver(ms, 1))).toBeLessThan(0.005);
  });

  it("lifted off, it rises and fades, then it's gone", () => {
    const a = lift(10)!, b = lift(LIFT_MS / 2)!;
    expect(b.h).toBeGreaterThan(a.h);
    expect(b.alpha).toBeLessThan(a.alpha);
    expect(lift(LIFT_MS)).toBeNull();
  });
});
