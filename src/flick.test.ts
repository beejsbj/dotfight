import { describe, expect, it } from "vitest";
import { pull, pullSpan, type Aim } from "./flick";
import { FEEL } from "./rules";

const aimAt = (dy: number, span?: number): Aim => ({ soldierId: 0, kind: "snipe", ax: 0, ay: 0, x: 0, y: dy, t0: 0, charged: true, span });

describe("the pull", () => {
  it("takes the usual travel for full power when there's room below the thumb", () => {
    expect(pullSpan(300, 844)).toBe(FEEL.maxPullPx);
    expect(pull(aimAt(FEEL.maxPullPx, pullSpan(300, 844))).power).toBe(1);
    expect(pull(aimAt(FEEL.maxPullPx - 40)).power).toBeLessThan(1);
  });

  it("begun near the bottom of the screen, reaches full power in the room it has", () => {
    const y = 700, H = 844, span = pullSpan(y, H);
    expect(span).toBe(H - FEEL.pullEdgePx - y);
    expect(span).toBeLessThan(FEEL.maxPullPx);
    // the thumb can get there: full power before the screen's edge
    expect(pull(aimAt(span, span)).power).toBe(1);
    expect(y + span).toBeLessThanOrEqual(H - FEEL.pullEdgePx);
    // and half the room is about half the power
    expect(pull(aimAt(FEEL.minPullPx + (span - FEEL.minPullPx) / 2, span)).power).toBeCloseTo(0.5, 9);
  });

  it("never asks for less than the floor, however low the thumb starts", () => {
    expect(pullSpan(840, 844)).toBe(FEEL.minPullSpanPx);
  });
});
