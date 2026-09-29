import { describe, expect, it } from "vitest";
import { BUBBLE, Bubbles, LINES, MOOD, bubbleAt, lineFor, showOf } from "./bubble";
import { LIFE } from "./life";

describe("pencil notes", () => {
  it("one at a time, with a long gap between", () => {
    const b = new Bubbles();
    // idle always speaks when offered, so the gap is what's tested
    const a = b.offer("idle", 1, 1000, 3)!;
    expect(a).not.toBeNull();
    expect(b.offer("idle", 2, 1500, 4)).toBeNull(); // one on the page
    expect(b.offer("idle", 2, 1000 + showOf(a) + 10, 4)).toBeNull(); // too soon after
    expect(b.offer("idle", 2, 1000 + BUBBLE.gapMs + 10, 4)).not.toBeNull();
  });

  it("a shout may follow sooner, but never over another note", () => {
    const b = new Bubbles();
    const a = b.offer("idle", 1, 1000, 3)!;
    // win always speaks, and every seed here is a shout
    let seed = 0;
    while (lineFor("win", seed).mood !== "shout") seed++;
    expect(b.offer("win", 2, 1000 + 500, seed)).toBeNull(); // one on the page
    expect(b.offer("win", 2, 1000 + showOf(a) + 10, seed)).toBeNull(); // still too soon
    const w = b.offer("win", 2, 1000 + BUBBLE.loudGapMs + 10, seed);
    expect(w?.mood).toBe("shout");
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
    expect(LINES.idle.map((l) => (typeof l === "string" ? l : l.t))).toContain(a!.text);
  });

  it("every moment has lines, in its mood unless a line says otherwise", () => {
    for (const k of Object.keys(LINES) as (keyof typeof LINES)[]) {
      expect(LINES[k].length).toBeGreaterThan(3);
      for (let seed = 0; seed < 40; seed++) {
        const l = lineFor(k, seed);
        expect(l.text.length).toBeGreaterThan(0);
        expect(["whisper", "say", "shout"]).toContain(l.mood);
      }
      expect(MOOD[k]).toBeDefined();
    }
    // the loud moments shout
    for (const k of ["lunge", "win", "snipe"] as const) expect(lineFor(k, 1).mood).toBe("shout");
  });

  it("is written, held, rubbed out, on twos; gone after its time", () => {
    const b = new Bubbles().offer("idle", 1, 0, 7)!;
    const { showMs, writeMs } = BUBBLE.timing[b.mood];
    expect(bubbleAt(b, 0)!.p).toBe(0);
    expect(bubbleAt(b, writeMs + 100)!.p).toBe(1);
    expect(bubbleAt(b, 900)!.e).toBe(0);
    expect(bubbleAt(b, showMs - 50)!.e).toBeGreaterThan(0.5);
    expect(bubbleAt(b, showMs - 1)!.e).toBeGreaterThan(0.8); // the last frame on the 12 fps grid
    expect(bubbleAt(b, showMs)).toBeNull();
    // the look changes only on the 12 fps grid, and not at all while it holds
    const keys = new Set<string>();
    for (let ms = 700; ms < 1400; ms += 7) keys.add(bubbleAt(b, ms)!.key);
    expect(keys.size).toBe(1);
    // reduced motion: written at once, and no scrub: there, then gone
    expect(bubbleAt(b, 10, true)!.p).toBe(1);
    expect(bubbleAt(b, showMs - 10, true)!.e).toBe(0);
  });

  it("a shout is written faster and stays longer", () => {
    expect(BUBBLE.timing.shout.writeMs).toBeLessThan(BUBBLE.timing.say.writeMs);
    expect(BUBBLE.timing.shout.showMs).toBeGreaterThan(BUBBLE.timing.say.showMs);
  });

  it("switches off", () => {
    LIFE.bubbles = false;
    expect(new Bubbles().offer("idle", 1, 0, 3)).toBeNull();
    LIFE.bubbles = true;
  });
});
