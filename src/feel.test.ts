import { describe, expect, it } from "vitest";
import { GAP, IOS, PATTERNS, TO_HAPTICS, allow, feel, setFeel, type Feel } from "./feel";
import { LIFE } from "./life";

describe("soldier life under the thumb", () => {
  it("is short and sparse: nothing longer than a last stand's two heartbeats", () => {
    for (const p of Object.values(PATTERNS)) {
      expect(p.length % 2).toBe(1); // ends on a pulse, not a pause
      expect(p.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(420);
      for (let i = 0; i < p.length; i += 2) expect(p[i]).toBeLessThanOrEqual(60);
    }
  });

  it("has an iPhone rhythm and a name in feel/haptics' vocabulary for every moment", () => {
    for (const k of Object.keys(PATTERNS) as Feel[]) {
      expect(IOS[k][0]).toBe(0);
      for (let i = 1; i < IOS[k].length; i++) expect(IOS[k][i] - IOS[k][i - 1]).toBeGreaterThanOrEqual(60);
      expect(TO_HAPTICS[k]).toBeTruthy();
    }
  });

  it("never piles up: one thing at a time, except a last stand", () => {
    expect(allow("cheer", 100, { ev: "flinch", at: 100 - GAP + 1 })).toBe(false);
    expect(allow("cheer", 100, { ev: "flinch", at: 100 - GAP })).toBe(true);
    expect(allow("stand", 100, { ev: "cheer", at: 99 })).toBe(true);
  });

  it("goes wherever it's routed, and nowhere when switched off", () => {
    const got: Feel[] = [];
    setFeel((ev) => got.push(ev));
    LIFE.haptics = false;
    expect(feel("unitcam")).toBe(false);
    LIFE.haptics = true;
    expect(feel("stand")).toBe(true);
    expect(got).toEqual(["stand"]);
  });
});
