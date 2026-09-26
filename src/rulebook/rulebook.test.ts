import { describe, expect, it } from "vitest";
import { GAME, nameHtml } from "../name";
import { FIGURES } from "./figures";
import html from "../../rules.html?raw";
import index from "../../index.html?raw";

const all = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);

// A 2D context that accepts every call, so figures can be drawn in node.
function fakeCtx() {
  const calls = { stroke: 0, fill: 0 };
  const ctx: Record<string | symbol, unknown> = {};
  const proxy: CanvasRenderingContext2D = new Proxy(ctx, {
    get(t, k) {
      if (k === "measureText") return (s: string) => ({ width: s.length * 8 });
      if (k === "stroke" || k === "fill") return () => { calls[k]++; };
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { proxy, calls };
}

describe("the rulebook page", () => {
  it("draws every figure it names", () => {
    const named = all(/data-fig="([^"]+)"/g);
    expect(named.length).toBeGreaterThan(8);
    for (const n of named) expect(FIGURES[n], n).toBeDefined();
  });

  it("links its contents to sections that exist, and deep-links the main rules", () => {
    const ids = new Set(all(/<section id="([^"]+)"/g));
    for (const href of all(/<a href="#([^"]+)"/g)) expect(ids.has(href), href).toBe(true);
    for (const id of ["snipe", "lunge", "send", "bases", "ink", "last-stand", "shapes", "modes", "open"]) expect(ids.has(id), id).toBe(true);
  });

  it("gets the game's name from one place", () => {
    for (const text of [html, index]) {
      expect(text).not.toContain(GAME.name);
      expect(text).toContain("%GAME_NAME");
    }
    expect(nameHtml("Pen Flick Tactics")).toBe("Pen Flick <em>Tactics</em>");
    expect(nameHtml("Inkwar")).toBe("<em>Inkwar</em>");
  });

  it("spells Dawood's name right", () => {
    expect(html).toContain("Dawood");
    expect(html).not.toMatch(/Daud/);
  });

  it("draws each figure from blank to finished without failing, adding ink as it goes", () => {
    for (const [name, fig] of Object.entries(FIGURES)) {
      let before = -1;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const { proxy, calls } = fakeCtx();
        expect(() => fig.draw(proxy, t), `${name} at ${t}`).not.toThrow();
        const marks = calls.stroke + calls.fill;
        expect(marks, `${name} at ${t}`).toBeGreaterThanOrEqual(before);
        before = marks;
      }
    }
  });
});
