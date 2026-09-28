import { describe, expect, it } from "vitest";
import { FORMANTS, GAP, MAX_VOICES, SPACING, allowed, curate, phrase, voicePitch, type Say } from "./voice";

const ALL: Say[] = ["hup", "murmur", "eep", "gasp", "oh", "cheer", "wheee", "land", "uhoh", "look", "phew", "jab"];

describe("voices", () => {
  it("every man has his own pitch, and keeps it", () => {
    const ps = Array.from({ length: 60 }, (_, id) => voicePitch(id, (id % 2) as 0 | 1));
    expect(new Set(ps.map((p) => p.toFixed(1))).size).toBeGreaterThan(50);
    expect(voicePitch(7, 0)).toBe(voicePitch(7, 0));
    for (const p of ps) { expect(p).toBeGreaterThan(300); expect(p).toBeLessThan(720); }
  });

  it("says the same thing the same way on the same seed, and something a little different on another", () => {
    for (const w of ALL) expect(phrase(w, 500, 3)).toEqual(phrase(w, 500, 3));
    const a = ALL.map((w) => JSON.stringify(phrase(w, 500, 3))), b = ALL.map((w) => JSON.stringify(phrase(w, 500, 4)));
    expect(a.filter((x, i) => x !== b[i]).length).toBeGreaterThan(2);
  });

  it("is short, small and in a tiny voice's range", () => {
    for (const w of ALL) for (let seed = 0; seed < 20; seed++) {
      const syl = phrase(w, 560, seed, 0.8);
      expect(syl.length).toBeGreaterThan(0);
      const end = Math.max(...syl.map((s) => s.at + s.dur));
      expect(end).toBeLessThanOrEqual(1.05);
      for (const s of syl) {
        expect(s.dur).toBeGreaterThan(0.03);
        expect(s.gain).toBeGreaterThan(0);
        expect(s.gain).toBeLessThanOrEqual(1);
        for (const f of [s.f0, s.f1]) { expect(f).toBeGreaterThan(250); expect(f).toBeLessThan(1400); }
        expect(FORMANTS[s.vowel]).toBeDefined();
      }
    }
  });

  it("goes up for a cheer and a question, down for a sigh", () => {
    const rise = (w: Say) => { const s = phrase(w, 500, 1); return s[s.length - 1].f1 - s[0].f0; };
    expect(rise("cheer")).toBeGreaterThan(0);
    expect(rise("hup")).toBeGreaterThan(0);
    expect(rise("oh")).toBeLessThan(0);
  });

  it("a crowd is a few voices at most, and the same word twice at once is said once", () => {
    const busy = Array.from({ length: MAX_VOICES }, () => 10);
    expect(allowed(1, busy, undefined, 0.1)).toBe(false);
    expect(allowed(1, busy.slice(1), undefined, 0.1)).toBe(true);
    expect(allowed(11, busy, undefined, 0.1)).toBe(true);
    expect(allowed(1, [], 0.95, 0.1)).toBe(false);
    expect(allowed(1.2, [], 0.95, 0.1)).toBe(true);
  });

  it("is occasional, never a chorus: two at once at most, spaced, with long cooldowns", () => {
    expect(MAX_VOICES).toBeLessThanOrEqual(2);
    expect(allowed(1, [], undefined, 0.1, 1 - SPACING / 2)).toBe(false);
    expect(allowed(1, [], undefined, 0.1, 1 - SPACING * 2)).toBe(true);
    for (const w of ALL) expect(GAP[w]).toBeGreaterThanOrEqual(2);
  });

  it("a crowd moment gets one voice, now and then two, never everyone", () => {
    // a shot through a full camp: gasps, eeps, a phew, ohs and a cheer, all planned
    const cues = [
      { at: 300, id: 1, say: "gasp" as Say }, { at: 310, id: 2, say: "gasp" as Say },
      { at: 420, id: 3, say: "eep" as Say }, { at: 430, id: 4, say: "eep" as Say }, { at: 440, id: 5, say: "eep" as Say },
      { at: 1100, id: 6, say: "phew" as Say }, { at: 900, id: 7, say: "oh" as Say }, { at: 1000, id: 8, say: "oh" as Say },
      { at: 700, id: 9, say: "cheer" as Say }, { at: 770, id: 10, say: "cheer" as Say }, { at: 840, id: 11, say: "cheer" as Say },
    ];
    let twos = 0;
    for (let seed = 0; seed < 200; seed++) {
      const out = curate(cues, seed);
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(out.length).toBeLessThanOrEqual(2);
      expect(out.some((c) => c.say === "gasp")).toBe(true); // the one that matters
      if (out.length === 2) {
        twos++;
        expect(out[0].say).not.toBe(out[1].say);
        expect(out[1].at - out[0].at).toBeGreaterThanOrEqual(SPACING * 1000);
      }
      expect(curate(cues, seed)).toEqual(out);
    }
    expect(twos).toBeGreaterThan(20);
    expect(twos).toBeLessThan(140);
    expect(curate([], 1)).toEqual([]);
  });
});
