import { describe, expect, it } from "vitest";
import { BUBBLE, Bubbles, LINES, bubbleAt } from "./bubble";
import { LIFE } from "./life";

describe("comic bubbles", () => {
  it("one at a time, with a long gap between", () => {
    const b = new Bubbles();
    // idle always speaks when offered, so the gap is what's tested
    expect(b.offer("idle", 1, 1000, 3)).not.toBeNull();
    expect(b.offer("idle", 2, 1500, 4)).toBeNull(); // one on screen
    expect(b.offer("idle", 2, 1000 + BUBBLE.showMs + 10, 4)).toBeNull(); // too soon after
    expect(b.offer("idle", 2, 1000 + BUBBLE.gapMs + 10, 4)).not.toBeNull();
  });

  it("is rare: most chances to say something pass", () => {
    let n = 0;
    for (let seed = 0; seed < 1000; seed++) if (new Bubbles().offer("ready", 1, 0, seed)) n++;
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(450);
  });

  it("is seeded: the same chance says the same thing", () => {
    const a = new Bubbles().offer("idle", 1, 0, 42), b = new Bubbles().offer("idle", 1, 0, 42);
    expect(a).toEqual(b);
    expect(LINES.idle).toContain(a!.text);
  });

  it("writes on, holds, fades, on twos; gone after its time", () => {
    const b = new Bubbles().offer("idle", 1, 0, 7)!;
    expect(bubbleAt(b, 0)!.p).toBe(0);
    expect(bubbleAt(b, BUBBLE.writeMs + 100)!.p).toBe(1);
    expect(bubbleAt(b, 900)!.alpha).toBe(1);
    expect(bubbleAt(b, BUBBLE.showMs - 50)!.alpha).toBeLessThan(0.5);
    expect(bubbleAt(b, BUBBLE.showMs)).toBeNull();
    // the look changes only on the 12 fps grid, and not at all while it holds
    const keys = new Set<string>();
    for (let ms = 700; ms < 1400; ms += 7) keys.add(bubbleAt(b, ms)!.key);
    expect(keys.size).toBe(1);
    expect(bubbleAt(b, 10, true)!.p).toBe(1); // reduced motion: written at once
  });

  it("switches off", () => {
    LIFE.bubbles = false;
    expect(new Bubbles().offer("idle", 1, 0, 3)).toBeNull();
    LIFE.bubbles = true;
  });
});
