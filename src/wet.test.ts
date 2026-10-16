// Wet ink (the real-time prototype): the pure parts of the gloss layer.

import { describe, expect, it } from "vitest";
import { dried, WET, wetKey, wetMen, wetness } from "./wet";

describe("wet ink", () => {
  it("wetness runs from 1 at the flick to 0 when dry, and never outside", () => {
    expect(wetness(5000, 1000, 4000)).toBe(1);
    expect(wetness(5000, 3000, 4000)).toBeCloseTo(0.5);
    expect(wetness(5000, 5000, 4000)).toBe(0);
    expect(wetness(5000, 9000, 4000)).toBe(0);
    expect(wetness(5000, 0, 4000)).toBe(1);
    expect(wetness(5000, 1000, 0)).toBe(0);
  });

  it("the wet men at a moment are those not yet dry, each with how wet", () => {
    const wet = { 3: 5000, 7: 2000, 9: 8000 };
    expect(wetMen(wet, 1000, 4000)).toEqual([{ id: 3, w: 1 }, { id: 7, w: 0.25 }, { id: 9, w: 1 }]);
    expect(wetMen(wet, 2000, 4000).map((m) => m.id)).toEqual([3, 9]);
    expect(wetMen(wet, 8000, 4000)).toEqual([]);
    expect(wetMen(undefined, 0, 4000)).toEqual([]);
  });

  it("dried names who dried between two moments, once", () => {
    const wet = { 3: 5000, 7: 2000, 9: 8000 };
    expect(dried(wet, 0, 1999)).toEqual([]);
    expect(dried(wet, 1999, 2000)).toEqual([7]);
    expect(dried(wet, 2000, 8000)).toEqual([3, 9]);
    expect(dried(wet, 8000, 9000)).toEqual([]);
    expect(dried(undefined, 0, 1e9)).toEqual([]);
  });

  it("the layer's key only changes when its look does: who, how wet in steps, and the crawl frame", () => {
    const a = wetKey([{ id: 1, w: 0.5 }], 3), b = wetKey([{ id: 1, w: 0.5 - 0.5 / WET.steps / 3 }], 3);
    expect(a).toBe(b);
    expect(wetKey([{ id: 1, w: 0.5 }], 4)).not.toBe(a);
    expect(wetKey([{ id: 1, w: 0.4 }], 3)).not.toBe(a);
    expect(wetKey([{ id: 2, w: 0.5 }], 3)).not.toBe(a);
    expect(wetKey([{ id: 1, w: 0.5 }], 3, "x")).not.toBe(a);
  });
});
