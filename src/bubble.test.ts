import { describe, expect, it } from "vitest";
import { ANCHOR, BOTCH_LINES, BUBBLE, Bubbles, CLOCK_LINES, LINES, MOOD, PAPER_LINES, STREAK_LINES, botchOf, botchVoices, type BotchIn, type BotchKind, bubbleAt, countWord, heatOf, lineFor, linesFor, replyAt, showOf, strayKind, streakTier, streakVoices, type BubbleKind, type Context, type StreakKind } from "./bubble";
import { LIFE } from "./life";

const ctx: Context = { me: "Blue", them: "Red", paper: "lamplight", hour: 15, heat: 0 };
const kinds = Object.keys(LINES) as (keyof typeof LINES)[];
const streaks = Object.keys(STREAK_LINES) as StreakKind[];

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
      if (!["stand", "more"].includes(k)) expect(LINES[k].length).toBeGreaterThan(3);
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

  it("a streak: lines for every voice at every stage, the count filled in, louder as it goes", () => {
    for (const k of streaks) {
      expect(MOOD[k]).toBeDefined();
      expect(ANCHOR[k]).toBeDefined();
      for (const n of [2, 3, 4, 7]) {
        expect(linesFor(k, { ...ctx, streak: n }).length).toBeGreaterThan(4);
        for (let seed = 0; seed < 60; seed++) {
          const l = lineFor(k, seed, { ...ctx, streak: n });
          expect(l.text).not.toMatch(/\{/);
          expect(l.text).not.toMatch(/zero/);
        }
      }
    }
    expect(countWord(4)).toBe("four");
    expect(countWord(15)).toBe("15");
    expect([2, 3, 4, 9].map(streakTier)).toEqual([0, 1, 2, 2]);
    // link 2 is a mutter; four and on, mostly shouts and chants
    const loud = (n: number) => streaks.filter((k) => k !== "streakEnd").flatMap((k) => Array.from({ length: 100 }, (_, i) => lineFor(k, i, { ...ctx, streak: n }).mood)).filter((m) => m === "shout" || m === "chant").length;
    expect(loud(2)).toBeLessThan(40);
    expect(loud(5)).toBeGreaterThan(250);
    const counts = new Set(Array.from({ length: 300 }, (_, i) => lineFor("streakCamp", i, { ...ctx, streak: 4 }).text));
    expect([...counts].some((t) => t.includes("four"))).toBe(true);
    // who speaks: the streaker and the enemy early, the camps once it's long; never the one who just spoke first
    const firsts = (n: number) => new Set(Array.from({ length: 50 }, (_, i) => streakVoices(n, i / 50)[0]));
    expect(firsts(2)).toEqual(new Set(["streakMe", "streakFoe", "streakCamp"]));
    expect(firsts(5).has("streakFoe")).toBe(false);
    for (let i = 0; i < 20; i++) { const v = streakVoices(4, i / 20, "streakCamp"); expect(v[0]).not.toBe("streakCamp"); expect(v.length).toBe(3); }
  });

  it("a botch is graded by how bad the miss was", () => {
    // a snipe from (100, 800) aimed along +x; their man at (500, 800), another off to the side; his camp round (100, 800)
    const line = (x0: number, y0: number, x1: number, y1: number, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
    const base: BotchIn = { kind: "snipe", from: { x: 100, y: 800 }, aim: 0, path: line(100, 800, 520, 800), killed: 0, lost: false, crashed: false, offPage: false, foes: [{ x: 500, y: 800 }, { x: 500, y: 1400 }], own: [{ x: 100, y: 800, r: 62 }] };
    // a kill, or a lunger shot where he landed, is never a botch
    expect(botchOf({ ...base, killed: 1 }).grade).toBe(0);
    expect(botchOf({ ...base, kind: "lunge", crashed: true, lost: true }).grade).toBe(0);
    // grazing past him: the target's "phew", not the shooter's botch
    expect(botchOf({ ...base, path: line(100, 800, 520, 812) }).grade).toBe(0);
    // a little short, a little wide: a mutter
    const mild = botchOf({ ...base, path: line(100, 800, 330, 800) });
    expect(mild.grade).toBe(1);
    expect(mild.why).toContain("short");
    // dies way short, barely out of his camp: the full treatment
    const dud = botchOf({ ...base, path: line(100, 800, 150, 800) });
    expect(dud.grade).toBe(2);
    expect(dud.why).toEqual(expect.arrayContaining(["short", "wide"]));
    // off the page: the full treatment
    expect(botchOf({ ...base, path: line(100, 800, 100, 1720), offPage: true }).grade).toBe(2);
    // a lunge the shake threw wildly off line, stranded in the open
    const thrown = botchOf({ ...base, kind: "lunge", path: line(100, 800, 250, 400), foes: [{ x: 700, y: 800 }] });
    expect(thrown.grade).toBe(2);
    expect(thrown.why).toEqual(expect.arrayContaining(["offline", "stranded"]));
    // a lunge that loops back into his own camp
    const home = botchOf({ ...base, kind: "lunge", from: { x: 160, y: 800 }, aim: 0, path: [...line(160, 800, 300, 800, 6), ...line(300, 800, 110, 810, 6).slice(1)], foes: [{ x: 700, y: 800 }] });
    expect(home.why).toContain("home");
    expect(home.grade).toBe(2);
    // worse misses never grade lower
    let last = 0;
    for (const x of [500, 420, 330, 250, 180, 130]) { const g = botchOf({ ...base, path: line(100, 800, x, 800) }).grade; expect(g).toBeGreaterThanOrEqual(last); last = g; }
  });

  it("a botch: lines for every voice at both grades, the laughing camp at full, never the voice that just spoke", () => {
    for (const k of Object.keys(BOTCH_LINES) as BotchKind[]) {
      expect(MOOD[k]).toBeDefined();
      expect(ANCHOR[k]).toBeDefined();
      for (const grade of [1, 2]) for (let seed = 0; seed < 60; seed++) {
        const l = lineFor(k, seed, { ...ctx, botch: grade });
        expect(l.text).not.toMatch(/\{/);
        expect(l.text).not.toMatch(/Daud/);
      }
    }
    const full = new Set(Array.from({ length: 300 }, (_, i) => lineFor("botchFoeCamp", i, { ...ctx, botch: 2 }).text));
    expect(full).toContain("clap. clap. clap.");
    expect(full).toContain("Red can't aim! Red can't aim!");
    // the slow clap is written a word per slow beat: it takes longer than a chant and stays longer
    let seed = 0;
    while (lineFor("botchFoeCamp", seed, { ...ctx, botch: 2 }).text !== "clap. clap. clap.") seed++;
    const clap = new Bubbles().offer("botchFoeCamp", 1, 0, seed, { ...ctx, botch: 2 })!;
    expect(clap.slow).toBeGreaterThan(1);
    expect(showOf(clap)).toBeGreaterThan(BUBBLE.timing.chant.showMs);
    expect(bubbleAt(clap, BUBBLE.timing.chant.writeMs)!.p).toBeLessThan(0.5);
    // a mild one: the flicker or his camp mostly; a spectacular one: the enemy camp can laugh
    const firsts = (g: number) => new Set(Array.from({ length: 60 }, (_, i) => botchVoices(g, i / 60)[0]));
    expect(firsts(1).has("botchFoeCamp")).toBe(false);
    expect(firsts(2).has("botchFoeCamp")).toBe(true);
    for (let i = 0; i < 20; i++) expect(botchVoices(2, i / 20, "botchFoeCamp")[0]).not.toBe("botchFoeCamp");
  });

  it("a streak's line can't wait: the note up is rubbed out, and it's written straight after", () => {
    const b = new Bubbles();
    const a = b.offer("idle", 1, 1000, 3, ctx)!;
    const w = BUBBLE.timing[a.mood].writeMs;
    const u = b.urgent("streakMe", 2, 1000 + w + 300, 5, { ...ctx, streak: 3 })!;
    // the first is cut short, rubbed out from now, and the streak's follows it
    expect(showOf(a)).toBeLessThan(BUBBLE.timing[a.mood].showMs);
    expect(u.t0).toBe(1000 + showOf(a));
    expect(b.showing(1000 + w + 350)).toBe(a);
    expect(b.showing(u.t0 + 10)).toBe(u);
    // nothing else gets in while a streak's line waits
    const c = new Bubbles(); c.offer("idle", 1, 0, 3, ctx); c.urgent("streakCamp", 4, 100, 6, { ...ctx, streak: 4 });
    expect(c.offer("win", 2, 200, 1, ctx)).toBeNull();
    // a newer link replaces the one waiting
    const v = c.urgent("streakFoeCamp", 5, 300, 7, { ...ctx, streak: 5 })!;
    expect(c.next).toBe(v);
    // nothing up: straight on
    expect(new Bubbles().urgent("streakFoe", 1, 50, 8, { ...ctx, streak: 2 })!.t0).toBe(50);
  });

  it("fills in the sides' names and grows with the war", () => {
    const hot = { ...ctx, heat: 1 };
    const texts = (k: BubbleKind, c: Context) => new Set(Array.from({ length: 200 }, (_, i) => lineFor(k, i, c).text));
    expect([...texts("banter", ctx)].some((t) => t.includes("Red"))).toBe(true);
    expect([...texts("lunge", ctx)]).toContain("Lunge!");
    expect([...texts("lunge", ctx)]).not.toContain("Luuunge!");
    expect([...texts("lunge", hot)]).toContain("Luuunge!");
    expect([...texts("lunge", hot)]).toContain("fooor Dawood!");
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
    // two beats: the answer comes once the line is written; the line is rubbed out before the answer
    expect(a.reply!.t0).toBeGreaterThan(BUBBLE.timing[a.mood].writeMs);
    const firstEnd = BUBBLE.timing[a.mood].showMs + a.hold!, replyEnd = a.reply!.t0 + BUBBLE.timing[a.reply!.mood].showMs + a.reply!.hold;
    expect(replyEnd).toBeGreaterThan(firstEnd);
    expect(bubbleAt(a, firstEnd - 1)).not.toBeNull();
    expect(bubbleAt(a, firstEnd)).toBeNull();
    expect(showOf(a)).toBe(replyEnd);
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


it("a fresh page forgets queued notes, cooldown and its idle window", () => {
  const b = new Bubbles();
  b.offer("idle", 1, 1000, 3, ctx);
  b.urgent("streakCamp", 2, 1100, 6, { ...ctx, streak: 4 });
  expect(b.next).not.toBeNull();
  const due = b.idleDue(1000, 42);
  expect(b.idleDue(1000, 42)).toBe(false);
  b.reset();
  expect(b.cur).toBeNull();
  expect(b.next).toBeNull();
  expect(b.idleDue(1000, 42)).toBe(due);
  expect(b.offer("idle", 3, 1100, 3, ctx)).not.toBeNull();
});

describe("moments the field must announce", () => {
  it("are always written, and chatter gives way to them", () => {
    const b = new Bubbles();
    const chat = b.offer("idle", 1, 1000, 3, ctx)!;
    expect(chat).not.toBeNull();
    const m = b.moment("stand", 2, 1500, 9, "LAST STAND!")!;
    expect(b.showing(1600)?.text).toBe("LAST STAND!");
    expect(m.important).toBe(true);
    expect(b.pending).toHaveLength(0);
  });

  it("wait their turn rather than talk over each other, in order", () => {
    const b = new Bubbles();
    const a = b.moment("more", 1, 1000, 1, "One more!")!;
    const c = b.moment("stand", 2, 1100, 2, "LAST STAND!")!;
    expect(c.t0).toBeGreaterThanOrEqual(1000 + showOf(a));
    expect(b.showing(1200)?.text).toBe("One more!");
    expect(b.showing(c.t0 + showOf(a) + 1 > 0 ? 1000 + showOf(a) + 1 : 0)).toBeNull(); // the gap between them
    expect(b.showing(c.t0 + 10)?.text).toBe("LAST STAND!");
  });

  it("keep chatter quiet while one is waiting", () => {
    const b = new Bubbles();
    b.moment("more", 1, 1000, 1, "One more!");
    b.moment("stand", 2, 1100, 2, "LAST STAND!");
    expect(b.offer("idle", 3, 1000 + 20000, 5, ctx)).toBeNull();
  });
});


it("reset clears mandatory moments and a streak cannot interrupt one", () => {
  const b = new Bubbles();
  b.moment("more", 1, 1000, 1, "One more!", "say");
  b.moment("stand", 2, 1100, 2, "LAST STAND!");
  expect(b.urgent("streakMe", 1, 1200, 3, { ...ctx, streak: 2 })).toBeNull();
  expect(b.showing(1300)?.text).toBe("One more!");
  b.reset();
  expect(b.pending).toHaveLength(0);
  expect(b.showing(10000)).toBeNull();
});

it.each([-1, 0, 50])("urgent notes interrupt exchanges at reply begin %i ms", (offset) => {
  let seed = 0;
  while (!lineFor("chat", seed, ctx).reply) seed++;
  const bubbles = new Bubbles();
  const cur = bubbles.offer("chat", 1, 1000, seed, ctx, 2)!;
  const reply = cur.reply!;
  const at = reply.t0 + offset;
  const urgent = bubbles.urgent("streakMe", 3, at, 5, { ...ctx, streak: 3 })!;
  expect(urgent.t0).toBe(cur.t0 + showOf(cur));
  if (offset < 0) {
    expect(cur.reply).toBeUndefined();
    expect(replyAt(cur, reply.t0 + 50)).toBeNull();
    expect(urgent.t0).toBe(at + BUBBLE.timing[cur.mood].eraseMs);
  } else {
    expect(cur.reply).toBe(reply);
    expect(replyAt(cur, reply.t0 + 50)).not.toBeNull();
    expect(urgent.t0).toBeGreaterThanOrEqual(reply.t0 + BUBBLE.timing[reply.mood].writeMs + 120 + BUBBLE.timing[reply.mood].eraseMs);
  }
});


it("the bot callback follows the preceding botch erase without waiting for the ordinary note gap", () => {
  const b = new Bubbles();
  const original = b.urgent("botchMe", 1, 1000, 5, { ...ctx, botch: 2 })!;
  const callback = b.urgent("botchBack", 2, 1700, 8, ctx)!;
  expect(callback.t0).toBe(original.t0 + showOf(original));
  expect(callback.t0).toBeLessThan(original.t0 + BUBBLE.gapMs);
  expect(b.showing(callback.t0 - 1)).toBe(original);
  expect(b.showing(callback.t0)).toBe(callback);
  expect(b.next).toBeNull();
});
