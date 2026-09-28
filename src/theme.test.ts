import { describe, expect, it } from "vitest";
import { newGame } from "./game";
import { blank, file, readSave, unfile } from "./record";
import {
  applyTheme, chooseTheme, chosenTheme, currentTheme, DEFAULT_THEME, homeTheme, luma, resolveTheme, setRoomTheme,
  surprise, themeFromSeed, themeOf, THEMES, withTheme, theme,
} from "./theme";

// The shape of a theme: every key path down to the leaves, with the kind of leaf.
function shape(v: unknown, path = ""): string[] {
  if (Array.isArray(v)) return [`${path}:array`];
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => shape(x, `${path}.${k}`)).sort();
  return [`${path}:${typeof v}`];
}

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

// "#rrggbb" or "rgba(r, g, b, a)" over a paper colour, as it lands on the page.
function rgbOf(c: string): [number, number, number] {
  if (c.startsWith("#")) { const n = parseInt(c.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const [r, g, b] = c.match(/[\d.]+/g)!.map(Number);
  return [r, g, b];
}
const hex = (c: [number, number, number]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
function landed(ink: string, paper: string, blend: "multiply" | "screen") {
  const i = rgbOf(ink), p = rgbOf(paper);
  return hex(i.map((x, k) => (blend === "multiply" ? (x * p[k]) / 255 : 255 - ((255 - x) * (255 - p[k])) / 255)) as [number, number, number]);
}
const contrast = (a: string, b: string) => { const [x, y] = [luma(a), luma(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe("themes: every theme is a whole object", () => {
  it("has five to seven themes, with unique ids, including Lamplight and the quiet notebook", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
    expect(THEMES.length).toBeLessThanOrEqual(7);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEMES.map((t) => t.id)).toEqual(expect.arrayContaining(["lamplight", "notebook"]));
  });

  it("every theme defines every token Lamplight does, and nothing else", () => {
    const want = shape(themeOf("lamplight"));
    for (const t of THEMES) expect(shape(t), t.id).toEqual(want);
  });

  it("no token is left empty", () => {
    for (const t of THEMES) {
      for (const [k, v] of Object.entries(t.cover)) expect(String(v).length, `${t.id}.cover.${k}`).toBeGreaterThan(0);
      expect(t.ink.pens).toHaveLength(2);
      expect(t.ink.names).toHaveLength(2);
      expect(t.ink.body).toHaveLength(2);
      expect(t.hud.pens).toHaveLength(2);
      expect(t.light.lamp).toHaveLength(5);
      expect(t.light.day).toHaveLength(5);
      expect(t.light.lamp.map(([o]) => o)).toEqual([...t.light.lamp.map(([o]) => o)].sort());
      expect(t.light.lamp[0][0]).toBe(0);
      expect(t.light.lamp[4][0]).toBe(1);
    }
  });

  it("the two pens read on their paper, and apart from each other", () => {
    for (const t of THEMES) {
      const on = t.ink.pens.map((p) => landed(p, t.paper.colour, t.ink.blend));
      for (const c of on) expect(contrast(c, t.paper.colour), `${t.id} ink ${c}`).toBeGreaterThan(2.4);
      const [a, b] = t.ink.pens.map(rgbOf);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), `${t.id} pens apart`).toBeGreaterThan(120);
      for (const p of t.hud.pens) expect(contrast(p, t.hud.paper), `${t.id} hud ${p}`).toBeGreaterThan(3);
      expect(contrast(t.hud.ink, t.hud.paper), `${t.id} hud ink`).toBeGreaterThan(4.5);
      expect(contrast(t.cover.labelInk, t.cover.label), `${t.id} label`).toBeGreaterThan(4.5);
    }
  });
});

describe("themeFromSeed", () => {
  it("is deterministic: the same seed is always the same paper", () => {
    for (const seed of [0, 1, 7, 42, 123456, 0xffffffff]) expect(themeFromSeed(seed)).toBe(themeFromSeed(seed));
    // pinned, so a room made today opens on the same paper after an update
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(themeFromSeed)).toMatchSnapshot();
  });

  it("reaches every theme, roughly evenly", () => {
    const n = new Map<string, number>();
    for (let s = 0; s < 7000; s++) n.set(themeFromSeed(s), (n.get(themeFromSeed(s)) ?? 0) + 1);
    expect(n.size).toBe(THEMES.length);
    for (const c of n.values()) expect(c).toBeGreaterThan((7000 / THEMES.length) * 0.8);
  });

  it("a surprise never repeats the last paper", () => {
    for (let s = 0; s < 200; s++) {
      const last = themeFromSeed(s);
      expect(surprise(s, last)).not.toBe(last);
      expect(surprise(s, null)).toBe(themeFromSeed(s));
    }
  });
});

describe("which paper wins", () => {
  it("the room's paper, then your pick, then the surprise", () => {
    expect(resolveTheme({ surprise: "legal" })).toBe("legal");
    expect(resolveTheme({ chosen: "graph", surprise: "legal" })).toBe("graph");
    expect(resolveTheme({ room: "blueprint", chosen: "graph", surprise: "legal" })).toBe("blueprint");
    // junk from storage or a newer room falls through
    expect(resolveTheme({ room: "nope", chosen: "graph", surprise: "legal" })).toBe("graph");
    expect(resolveTheme({ chosen: "nope", surprise: "legal" })).toBe("legal");
    expect(resolveTheme({ surprise: "nope" })).toBe(DEFAULT_THEME);
  });

  it("a pick persists and overrides the surprise; clearing it brings the surprise back", () => {
    const m = memory();
    const first = homeTheme(m);
    expect(chosenTheme(m)).toBeNull();
    const other = THEMES.find((t) => t.id !== first)!.id;
    chooseTheme(other, m);
    expect(chosenTheme(m)).toBe(other);
    expect(homeTheme(m)).toBe(other);
    expect(currentTheme()).toBe(other);
    chooseTheme(null, m);
    expect(chosenTheme(m)).toBeNull();
    expect(homeTheme(m)).toBe(first); // the same surprise for the rest of this load
  });

  it("in a room the room's paper wins over a pick, and the pick comes back after", () => {
    const m = memory();
    chooseTheme("graph", m);
    setRoomTheme("legal");
    expect(currentTheme()).toBe("legal");
    expect(homeTheme(m)).toBe("legal");
    chooseTheme("copy", m); // picked while in the room: kept, not applied
    expect(chosenTheme(m)).toBe("copy");
    expect(currentTheme()).toBe("legal");
    setRoomTheme();
    expect(homeTheme(m)).toBe("copy");
  });
});

describe("a page keeps its paper", () => {
  it("the stamp carries the theme through saves, the drawer and replays", () => {
    const s = newGame(9, { no: 4, date: "26 Sep 2026", theme: "legal" });
    const r = JSON.parse(JSON.stringify(file(s, { kind: "pnp" })));
    expect(unfile(r).page?.theme).toBe("legal");
    expect(blank(r).page?.theme).toBe("legal");
    expect(readSave(JSON.stringify({ s, mode: { kind: "pnp" } }))!.s.page?.theme).toBe("legal");
  });

  it("an old page with no theme is on Lamplight's paper", () => {
    expect(themeOf(newGame(1, { no: 1, date: "" }).page?.theme).id).toBe("lamplight");
  });

  it("applyTheme with no id (a room from before themes) applies the paper you'd have anyway", () => {
    applyTheme("graph");
    applyTheme(undefined);
    expect(currentTheme()).toBe(homeTheme());
    applyTheme("nope");
    expect(currentTheme()).toBe(homeTheme());
  });

  it("withTheme draws in another paper and puts the room back", () => {
    applyTheme("copy");
    expect(withTheme("blueprint", () => theme.id)).toBe("blueprint");
    expect(theme.id).toBe("copy");
    applyTheme(DEFAULT_THEME);
  });
});
