import { describe, expect, it } from "vitest";
import { GAME, nameHtml } from "../name";
import { FIGURES } from "./figures";
import core from "../../rules.html?raw";
import advanced from "../../rules/advanced.html?raw";
import index from "../../index.html?raw";
import manifest from "../../public/manifest.webmanifest?raw";

const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
const figs = (html: string) => all(html.replace(/<div id="og"[\s\S]*?<\/div>\s*<\/div>/, ""), /data-fig="([^"]+)"/g);
const books = { core, advanced };

// A 2D context that accepts every call, so figures can be drawn in node.
function fakeCtx() {
  const calls = { stroke: 0, fill: 0 };
  const ctx: Record<string | symbol, unknown> = {};
  const proxy = new Proxy(ctx, {
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

describe("the rulebooks", () => {
  for (const [name, html] of Object.entries(books)) {
    describe(name, () => {
      it("draws every figure it names", () => {
        const named = all(html, /data-fig="([^"]+)"/g);
        expect(named.length).toBeGreaterThan(4);
        for (const n of named) expect(FIGURES[n], n).toBeDefined();
      });

      it("links its contents to sections that exist", () => {
        const ids = new Set(all(html, /<section id="([^"]+)"/g));
        const links = all(html, /<a href="#([^"]+)"/g);
        expect(links.length).toBeGreaterThan(5);
        for (const href of links) expect(ids.has(href), href).toBe(true);
      });

      it("numbers its figures in order", () => {
        const nos = all(html, /fig\. (\d+) ·/g).map(Number);
        expect(nos).toEqual(nos.map((_, i) => i + 1));
      });

      it("spells Dawood's name right", () => {
        expect(html).toContain("Dawood");
        expect(html).not.toMatch(/Daud/);
      });
    });
  }

  it("deep-links every rule", () => {
    const ids = (html: string) => new Set(all(html, /<section id="([^"]+)"/g));
    for (const id of ["setup", "snipe", "lunge", "send", "bases", "last-stand", "winning", "quick-battle", "how-you-play", "open"]) expect(ids(core).has(id), id).toBe(true);
    for (const id of ["long-war", "send", "ink", "drawing", "shapes", "circle", "prism", "cushion", "square", "pentagon", "soldiers", "open"]) expect(ids(advanced).has(id), id).toBe(true);
  });

  it("calls book 2 the long war rules, at its old address", () => {
    expect(advanced).toContain("<title>Long war rules");
    expect(advanced).toContain("<b>Long War Rules</b>");
    expect(core).toContain("Book 2: long war rules");
    for (const text of [core, advanced]) expect(text.toLowerCase()).not.toMatch(/advanced rules/);
  });

  it("ends each book with its tactics, in the contents, before what's still to test", () => {
    for (const text of [core, advanced]) {
      expect(text).toContain('<a href="#tactics">Tactics</a>');
      expect(text.indexOf('id="tactics"')).toBeLessThan(text.indexOf('id="open"'));
    }
  });

  it("links each book to the other", () => {
    expect(core).toContain('href="/rules/advanced"');
    expect(advanced).toContain('href="/rules"');
  });

  it("keeps the long war out of the core rules, apart from the pointer", () => {
    const longWar = ["groove", "well", "prism", "cushion", "ruler", "star", "soldiers", "send-long"];
    for (const f of figs(core)) expect(longWar, f).not.toContain(f);
    for (const word of ["hexagon", "triangle", "gravity", "being designed", 'id="ink"', 'id="shapes"']) expect(core, word).not.toContain(word);
    for (const f of ["well", "prism", "cushion", "ruler", "star", "soldiers", "groove"]) expect(figs(advanced)).toContain(f);
  });

  it("settles the lunge and send rules the core book used to leave open", () => {
    expect(core).toMatch(/they shoot him on the spot/);
    expect(core).toMatch(/empty enemy ring nothing happens/);
    expect(core).toMatch(/up to 5 soldiers/);
    expect(core).toMatch(/exactly one enemy turn/);
    expect(advanced).toMatch(/several turns/);
    expect(advanced).toMatch(/pull is its garrison/);
    expect(core).toContain('data-fig="lunge-through"');
  });

  it("gets the game's name from one place", () => {
    for (const text of [core, advanced, index]) {
      expect(text).not.toContain(GAME.name);
      expect(text).toContain("%GAME_NAME");
    }
    const m = JSON.parse(manifest);
    expect(m.name).toBe(GAME.name);
    expect(m.short_name).toBe(GAME.short);
    expect(nameHtml("Pen Flick Tactics")).toBe("Pen Flick <em>Tactics</em>");
    expect(nameHtml("Inkwar")).toBe("<em>Inkwar</em>");
    expect(nameHtml()).toBe("Dot<em>fight</em>");
  });

  it("gives each book its own share card", () => {
    const img = (html: string) => all(html, /property="og:image" content="([^"]+)"/g)[0];
    expect(img(core)).toMatch(/og-rules\.jpg$/);
    expect(img(advanced)).toMatch(/og-rules-advanced\.jpg$/);
    expect(advanced).toContain('content="https://dotfight.vercel.app/rules/advanced"');
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
