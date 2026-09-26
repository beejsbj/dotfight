import { describe, expect, it } from "vitest";
import { apply, flurryFrame, fold, frameAt, hashFor, inv, leaves, maxPos, mul, pageOf, pagesAt, posOfPage } from "./book";
import { HeightSink, paginate, type Item, type Sized } from "./paginate";

describe("the book's leaves", () => {
  it("turns single pages on a phone, the cover first", () => {
    const ls = leaves("single", 3);
    expect(ls).toHaveLength(4);
    expect(ls[0]).toEqual({ front: { kind: "cover" }, back: { kind: "inside" } });
    expect(ls[2]).toEqual({ front: { kind: "page", n: 2 }, back: { kind: "ghost", n: 2 } });
    expect(maxPos("single", 3)).toBe(3);
  });

  it("opens to spreads on a wide screen: each leaf's back is the next left-hand page", () => {
    const ls = leaves("spread", 4); // cover, inside, 1 2 3 4
    expect(ls.map((l) => [l.front, l.back])).toEqual([
      [{ kind: "cover" }, { kind: "inside" }],
      [{ kind: "page", n: 1 }, { kind: "page", n: 2 }],
      [{ kind: "page", n: 3 }, { kind: "page", n: 4 }],
    ]);
    // an odd page out gets a blank back
    expect(leaves("spread", 3).at(-1)).toEqual({ front: { kind: "page", n: 3 }, back: { kind: "blank" } });
  });

  it("finds each page's position, and the pages at each position", () => {
    for (const n of [1, 4, 7, 12]) {
      for (const mode of ["single", "spread"] as const) {
        for (let p = 0; p <= n; p++) expect(pagesAt(mode, posOfPage(mode, p), n), `${mode} ${n} p${p}`).toContain(p);
        expect(pagesAt(mode, maxPos(mode, n), n)).toContain(n);
      }
    }
    expect(pagesAt("spread", 0, 5)).toEqual([0]);
    expect(pagesAt("spread", 1, 5)).toEqual([1]); // the inside cover on the left
    expect(pagesAt("spread", 2, 5)).toEqual([2, 3]);
    expect(pagesAt("spread", 3, 5)).toEqual([4, 5]);
    expect(pagesAt("single", 4, 5)).toEqual([4]);
  });
});

describe("addresses", () => {
  // page 0 cover; 1: origin, page, setup; 2: setup continues, turn; 3: snipe, lunge; 4: lunge continues
  const ids = [["cover-id"], ["origin", "page", "setup"], ["turn"], ["snipe", "lunge"], []];
  const contents = new Set(["page", "setup", "turn", "snipe", "lunge"]);

  it("names the first contents entry that starts on the pages facing you", () => {
    expect(hashFor([1], ids, contents)).toBe("page");
    expect(hashFor([2, 3], ids, contents)).toBe("turn");
    expect(hashFor([3], ids, contents)).toBe("snipe");
  });

  it("names the section running on when nothing new starts", () => {
    expect(hashFor([4], ids, contents)).toBe("lunge");
  });

  it("gives the cover no address", () => {
    expect(hashFor([0], ids, contents)).toBe("");
  });

  it("finds the page any id is on, and round-trips with the address", () => {
    expect(pageOf("snipe", ids)).toBe(3);
    expect(pageOf("origin", ids)).toBe(1);
    expect(pageOf("nope", ids)).toBeUndefined();
    for (const id of contents) {
      const p = pageOf(id, ids)!;
      expect(pageOf(hashFor([p], ids, contents), ids)).toBe(p);
    }
  });
});

describe("turning", () => {
  it("lies open at whole positions and has one leaf in the air between", () => {
    expect(frameAt(2)).toEqual({ turning: [], right: 2, left: 1 });
    const f = frameAt(2.25);
    expect(f.turning).toHaveLength(1);
    expect(f.turning[0].leaf).toBe(2);
    expect(f.turning[0].t).toBeCloseTo(0.25);
    expect(f.right).toBe(3);
  });

  it("flurries forward: starts flat, ends with every leaf over, several in the air between", () => {
    expect(flurryFrame(1, 4, 0).turning.every((x) => x.t === 0)).toBe(true);
    expect(flurryFrame(1, 4, 1).turning.every((x) => x.t === 1)).toBe(true);
    expect(flurryFrame(1, 4, 0.5).turning.filter((x) => x.t > 0 && x.t < 1).length).toBeGreaterThan(1);
    expect(flurryFrame(1, 4, 0.5)).toMatchObject({ right: 4, left: 0 });
  });

  it("flurries back the other way, the top of the left pile first", () => {
    const f = flurryFrame(5, 1, 0.2);
    expect(f.turning[0].leaf).toBe(4);
    expect(f.turning[0].t).toBeLessThan(f.turning.at(-1)!.t);
    expect(flurryFrame(5, 1, 1).turning.every((x) => x.t === 0)).toBe(true);
  });

  it("keeps a long flurry to a handful of leaves: the first and the last few", () => {
    const leavesInAir = flurryFrame(0, 20, 0.5).turning.map((x) => x.leaf);
    expect(leavesInAir).toEqual([0, 16, 17, 18, 19]);
  });
});

describe("the fold", () => {
  const W = 370, H = 740;
  const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));

  it("carries the corner of the back to where the corner has got to", () => {
    for (const t of [0.05, 0.3, 0.5, 0.8, 0.97]) {
      for (const top of [false, true]) {
        const f = fold(t, W, H, top);
        // the outer corner is x = W on the front, x = 0 on the back
        near(apply(f.back, 0, top ? 0 : H), f.corner);
      }
    }
  });

  it("leaves the fold where it is: paper on the fold is on both sides at once", () => {
    const f = fold(0.4, W, H);
    for (const s of [-200, 0, 150]) {
      const [x, y] = apply(f.frame, 0, s); // a point on the fold, in page coordinates
      near(apply(f.back, W - x, y), [x, y]);
    }
  });

  it("clips along the fold, and its unclip undoes it", () => {
    const f = fold(0.6, W, H, false, 3000);
    near(apply(f.clip, 3000, 1500), apply(f.frame, 0, 0));
    near(mul(f.clip, f.unclip), [1, 0, 0, 1, 0, 0]);
    near(mul(inv(f.back), f.back), [1, 0, 0, 1, 0, 0]);
  });

  it("lays the leaf flat over the spine when it's all the way over", () => {
    const f = fold(1, W, H);
    near(f.back, [1, 0, 0, 1, -W, 0]);
    expect(f.lift).toBeCloseTo(0, 6);
  });

  it("never tears the paper: the corner stays within a page's width of the spine", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const [x, y] = fold(t, W, H).corner;
      expect(Math.hypot(x, y - H)).toBeLessThanOrEqual(W + 1e-6);
    }
  });
});

describe("pagination", () => {
  const atom = (id: string, h: number, heading = false): Item<Sized> => ({ kind: "atom", ref: { id, h }, heading });
  const box = (id: string, kids: Item<Sized>[], pad = 0): Item<Sized> => ({ kind: "box", ref: { id, h: 0, pad }, kids });
  const run = (items: Item<Sized>[], height = 100) => { const s = new HeightSink(height); paginate(items, s); return s.pages; };
  const atoms = (pages: string[][]) => pages.flat().filter((x) => !x.endsWith(">")).map((x) => x.replace(/~$/, ""));

  it("puts what fits on one page", () => {
    expect(run([atom("a", 30), atom("b", 30), atom("c", 30)])).toEqual([["a", "b", "c"]]);
  });

  it("carries a long section overleaf, continued, never cutting a paragraph", () => {
    const pages = run([box("s", [atom("h", 10, true), atom("p1", 40), atom("p2", 40), atom("p3", 40)])]);
    expect(pages).toEqual([["s>", "h", "p1", "p2"], ["s+>", "p3"]]);
  });

  it("never leaves a heading alone at the foot of a page", () => {
    const pages = run([atom("a", 80), box("s", [atom("h", 10, true), atom("p", 30)])]);
    expect(pages).toEqual([["a"], ["s>", "h", "p"]]);
    // even when the section is too long to keep whole
    const long = run([atom("a", 80), box("s", [atom("h", 10, true), atom("p1", 60), atom("p2", 60)])]);
    expect(long[0]).toEqual(["a"]);
    expect(long[1].slice(0, 3)).toEqual(["s>", "h", "p1"]);
  });

  it("breaks lists between items, and sections within sections", () => {
    const pages = run([
      box("shapes", [atom("h2", 10, true), atom("intro", 20), box("circle", [atom("h3", 10, true), atom("c1", 30)]), box("prism", [atom("h3b", 10, true), atom("p1", 30), atom("fig", 45)])]),
      box("list", [atom("li1", 20), atom("li2", 20), atom("li3", 20)]),
    ]);
    expect(atoms(pages)).toEqual(["h2", "intro", "h3", "c1", "h3b", "p1", "fig", "li1", "li2", "li3"]);
    expect(pages[0].at(-1)).not.toMatch(/^h/);
    expect(pages.flat()).toContain("shapes+>");
  });

  it("shrinks onto its own page a thing that fits on none", () => {
    const pages = run([atom("a", 50), atom("huge", 300), atom("b", 20)]);
    expect(pages).toEqual([["a"], ["huge~"], ["b"]]);
  });

  it("keeps everything, in order, whatever the page height", () => {
    const book = [
      box("origin", [atom("o1", 70), atom("o2", 30)]),
      box("page", [atom("h-page", 12, true), atom("pg1", 45)], 8),
      box("setup", [atom("h-setup", 12, true), box("steps", [atom("st1", 40), atom("st2", 55)]), atom("fig1", 80), atom("setup-p", 40)], 8),
      box("snipe", [atom("h-snipe", 12, true), atom("sn1", 30), atom("sn2", 60), atom("fig3", 90), atom("sn3", 45)], 8),
      atom("footer", 50),
    ];
    const order = ["o1", "o2", "h-page", "pg1", "h-setup", "st1", "st2", "fig1", "setup-p", "h-snipe", "sn1", "sn2", "fig3", "sn3", "footer"];
    for (const height of [95, 120, 160, 240, 400, 900]) {
      const pages = run(book, height);
      expect(atoms(pages), `height ${height}`).toEqual(order);
      for (const p of pages.slice(0, -1)) expect(p.at(-1), `height ${height}`).not.toMatch(/^h-/);
    }
  });
});
