import { describe, expect, it } from "vitest";
import { ANCHOR, BUBBLE, Bubbles, CLOCK_LINES, LINES, MOOD, PAPER_LINES, bubbleAt, heatOf, lineFor, linesFor, replyAt, showOf, strayKind, type BubbleKind, type Context } from "./bubble";
import { LIFE } from "./life";

const ctx: Context = { me: "Blue", them: "Red", paper: "lamplight", hour: 15, heat: 0 };
const kinds = Object.keys(LINES) as BubbleKind[];

describe("pencil notes", () => {
  it("one at a time, with a long gap between", () => {
    const b = new Bubbles();
    // idle always speaks when offered, so the gap is what's tested
    const a = b.offer("idle", 1, 1000, 3, ctx)!;
    expect(a).not.toBeNull();
    expect(b.offer("idle", 2, 1500, 4, ctx)).toBeNull(); // one on the page
    expect(b.offer("idle", 2, 1000 + showOf(a) + 10, 4, ctx)).toBeNull(); // too soon after
    expect(b.offer("idle", 2, 1000 + BUBBLE.gapMs + 10, 4, ctx)).not.toBeNull();
  });

  it("a shout or a chant may follow sooner, but never over another note", () => {
    const b = new Bubbles();
    const a = b.offer("idle", 1, 1000, 3, ctx)!;
    // win always speaks, and this seed is a shout
    let seed = 0;
    while (lineFor("win", seed, ctx).mood !== "shout") seed++;
    expect(b.offer("win", 2, 1000 + 500, seed, ctx)).toBeNull(); // one on the page
    expect(b.offer("win", 2, 1000 + showOf(a) + 10, seed, ctx)).toBeNull(); // still too soon
    const w = b.offer("win", 2, 1000 + BUBBLE.loudGapMs + 10, seed, ctx);
    expect(w?.mood).toBe("shout");
    expect(w?.anchor).toBe("base");
  });

  it("is rare: most chances to say something pass", () => {
    let n = 0;
    for (let seed = 0; seed < 1000; seed++) if (new Bubbles().offer("ready", 1, 0, seed, ctx)) n++;
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(450);
  });

  it("is seeded: the same chance says the same thing", () => {
    const a = new Bubbles().offer("idle", 1, 0, 42, ctx), b = new Bubbles().offer("idle", 1, 0, 42, ctx);
    expect(a).toEqual(b);
  });

  it("every moment has lines, in its mood unless a line says otherwise, and an anchor", () => {
    for (const k of kinds) {
      expect(LINES[k].length).toBeGreaterThan(3);
      for (let seed = 0; seed < 40; seed++) {
        const l = lineFor(k, seed, ctx);
        expect(l.text.length).toBeGreaterThan(0);
        expect(l.text).not.toMatch(/\{(me|them|paper)\}/);
        expect(["tiny", "whisper", "say", "shout", "chant"]).toContain(l.mood);
      }
      expect(MOOD[k]).toBeDefined();
      expect(ANCHOR[k]).toBeDefined();
    }
    // the loud moments shout, from a camp; a chant is a camp's too
    for (const k of ["lunge", "win", "snipe"] as const) { expect(lineFor(k, 1, { ...ctx, heat: 1 }).mood).toBe("shout"); expect(ANCHOR[k]).toBe("base"); }
    expect(ANCHOR.chant).toBe("base");
    expect(MOOD.chant).toBe("chant");
  });

  it("fills in the sides' names and grows with the war", () => {
    const hot = { ...ctx, heat: 1 };
    const texts = (k: BubbleKind, c: Context) => new Set(Array.from({ length: 200 }, (_, i) => lineFor(k, i, c).text));
    expect([...texts("banter", ctx)].some((t) => t.includes("Red"))).toBe(true);
    expect([...texts("lunge", ctx)]).toContain("Lunge!");
    expect([...texts("lunge", ctx)]).not.toContain("Luuunge!");
    expect([...texts("lunge", hot)]).toContain("Luuunge!");
    expect([...texts("lunge", hot)]).toContain("fooor Dawooood!");
    expect(heatOf(0, 0, 40, false)).toBe(0);
    expect(heatOf(30, 30, 40, true)).toBe(1);
    expect(heatOf(6, 4, 40, false)).toBeLessThan(BUBBLE.lateFrom);
  });

  it("knows the paper and the hour", () => {
    expect(linesFor("paper", { ...ctx, paper: "blueprint" })).toEqual(expect.arrayContaining([...PAPER_LINES.blueprint]));
    expect(linesFor("paper", { ...ctx, paper: "unknown" }).length).toBe(LINES.paper.length);
    expect(linesFor("clock", { ...ctx, hour: 2 })).toEqual(expect.arrayContaining([...CLOCK_LINES[0][2]]));
    expect(linesFor("clock", { ...ctx, hour: 15 }).length).toBe(LINES.clock.length);
  });

  it("an exchange: a nearby comrade replies while the line is read, and no third voice", () => {
    let seed = 0;
    while (!lineFor("chat", seed, ctx).reply) seed++;
    const b = new Bubbles();
    const a = b.offer("chat", 1, 0, seed, ctx, 2)!;
    expect(a.reply?.id).toBe(2);
    expect(a.reply!.t0).toBeGreaterThan(0);
    expect(a.reply!.t0).toBeLessThan(BUBBLE.timing[a.mood].showMs);
    expect(replyAt(a, a.reply!.t0 + 50)).not.toBeNull();
    expect(showOf(a)).toBeGreaterThan(BUBBLE.timing[a.mood].showMs);
    expect(b.offer("idle", 3, a.reply!.t0 + 100, 5, ctx)).toBeNull();
    // no mate about: no reply
    expect(new Bubbles().offer("chat", 1, 0, seed, ctx)!.reply).toBeUndefined();
  });

  it("stray thoughts: crickets in a long wait, a chant more when ahead, every kind reachable", () => {
    const seen = new Set<BubbleKind>();
    for (let i = 0; i < 400; i++) seen.add(strayKind(i / 400, { lead: 0, waited: 0, inBase: true, heat: 0 }));
    for (const k of ["idle", "ponder", "tired", "banter", "shapes", "paper", "home", "clock", "tiny", "chat", "chant"] as const) expect(seen.has(k)).toBe(true);
    expect(seen.has("wait")).toBe(false);
    let waits = 0, chantsAhead = 0, chantsEven = 0;
    for (let i = 0; i < 400; i++) {
      if (strayKind(i / 400, { lead: 0, waited: BUBBLE.longWaitMs + 1, inBase: false, heat: 0 }) === "wait") waits++;
      if (strayKind(i / 400, { lead: 5, waited: 0, inBase: false, heat: 0 }) === "chant") chantsAhead++;
      if (strayKind(i / 400, { lead: 0, waited: 0, inBase: false, heat: 0 }) === "chant") chantsEven++;
    }
    expect(waits).toBeGreaterThan(120);
    expect(chantsAhead).toBeGreaterThan(chantsEven);
    expect(strayKind(0.5, { lead: 0, waited: 0, inBase: false, heat: 0 })).not.toBe("home");
  });

  it("is written, held, rubbed out, on twos; gone after its time", () => {
    const b = new Bubbles().offer("idle", 1, 0, 7, ctx)!;
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

  it("a shout is written faster and stays longer; a chant takes its time", () => {
    expect(BUBBLE.timing.shout.writeMs).toBeLessThan(BUBBLE.timing.say.writeMs);
    expect(BUBBLE.timing.shout.showMs).toBeGreaterThan(BUBBLE.timing.say.showMs);
    expect(BUBBLE.timing.chant.writeMs).toBeGreaterThan(BUBBLE.timing.say.writeMs);
  });

  it("switches off", () => {
    LIFE.bubbles = false;
    expect(new Bubbles().offer("idle", 1, 0, 3, ctx)).toBeNull();
    LIFE.bubbles = true;
  });
});
