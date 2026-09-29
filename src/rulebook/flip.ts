// The rulebook as a book you turn. The rules stay plain HTML in reading order;
// this flows them onto pages, binds the pages into leaves, and turns the leaves
// like paper bound at one edge: the leaf lifts about the spine, its corner curls
// over along a fold and stands up off the page, showing its back, throwing
// shadows, all seen in perspective from above; then it settles.
// Scrolling, swiping, the arrow keys, tapping a page's edge and the contents
// slip all move one number, the position, so a turn follows your finger or
// wheel and then settles. Only transforms and opacity change while a leaf is in
// the air, so the compositor does the work.

import { css, css4, eye, hinge, flurryFrame, fold, frameAt, from2d, hashFor, inv, leaves, maxPos, mul, mul4, pageOf, pagesAt, posOfPage, tr, type Frame, type Leaf, type Mat, type Mat4, type Mode, type Side } from "./book";
import { paginate, type Box, type Item, type Sink } from "./paginate";
import { clock } from "./clock";
import * as sfx from "../sound";

export interface BookOpts {
  /** reduced motion: pages change at once, nothing curls */
  still: boolean;
  /** the pages have been laid out afresh: size the drawings */
  laidOut(): void;
  /** these pages now face the reader: draw their drawings */
  opened(sides: Element[]): void;
  /** draw a figure finished, faintly, for the ink showing through a page's back */
  ghost(canvas: HTMLCanvasElement): void;
}

interface LeafEl {
  root: HTMLElement;
  clipF: HTMLElement; unF: HTMLElement; front: HTMLElement;
  clipB: HTMLElement; unB: HTMLElement; back: HTMLElement;
  crease: HTMLElement;
  cast: HTMLElement;
  state: string;
  ghosted: boolean;
}

const el = (tag: string, cls = "") => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (u: number) => u * u * (3 - 2 * u);
const out = (u: number) => 1 - Math.pow(1 - u, 2.4);
/** matrix for a 100×100 box stretched to w×h, then placed by m */
const box = (m: Mat, x: number, y: number, w: number, h: number) => mul(m, [w / 100, 0, 0, h / 100, x, y]);

// --- the rules as a tree the flow understands ---------------------------------------

function tree(e: Element): Item<Element> {
  if (e.matches("section, ul, ol") && e.children.length > 1) return { kind: "box", ref: e, kids: [...e.children].map(tree) };
  return { kind: "atom", ref: e, heading: /^H\d$/.test(e.tagName) };
}

/** Put a box's children back inside it, in order, wherever the last layout left them. */
function restore(it: Item<Element>) {
  if (it.kind === "atom") { (it.ref as HTMLElement).style.zoom = ""; return; }
  for (const k of it.kids) { restore(k); it.ref.append(k.ref); }
}

/** The rest of a section or list, carried overleaf: same look, no id, no number in the margin. */
function continued(e: Element, placed: number) {
  const c = e.cloneNode(false) as HTMLElement;
  c.removeAttribute("id");
  c.classList.add("cont");
  if (c.tagName === "OL") { c.setAttribute("start", String(placed + 1)); c.style.counterReset = `s ${placed}`; }
  return c;
}

/** Lays the rules onto real pages and measures them. */
class DomSink implements Sink<Element> {
  pages: HTMLElement[] = [];
  private flow!: HTMLElement;
  private limit = 0;
  private count = 0;
  private stack: { orig: Element; copy: Element }[] = [];
  private started = new Set<Element>();
  private placed = new Map<Element, number>();
  private log: Element[] = [];
  constructor(private make: (n: number) => HTMLElement) { this.newPage(); }

  private into() { return this.stack.length ? this.stack[this.stack.length - 1].copy : this.flow; }
  private put(e: Element) { this.into().append(e); this.log.push(e); }
  private tally() {
    this.count++;
    const top = this.stack[this.stack.length - 1];
    if (top) this.placed.set(top.orig, (this.placed.get(top.orig) ?? 0) + 1);
  }
  fits(it: Item<Element>) {
    restore(it);
    this.put(it.ref);
    if (it.ref.getBoundingClientRect().bottom <= this.limit + 0.5) { this.tally(); return true; }
    it.ref.remove();
    this.log.pop();
    return false;
  }
  open(b: Box<Element>) {
    let copy: Element;
    if (!this.started.has(b.ref)) { b.ref.replaceChildren(); copy = b.ref; this.started.add(b.ref); }
    else copy = continued(b.ref, this.placed.get(b.ref) ?? 0);
    this.put(copy);
    this.stack.push({ orig: b.ref, copy });
  }
  close() { this.stack.pop(); }
  squeeze(it: Item<Element>) {
    restore(it);
    this.put(it.ref);
    const r = it.ref.getBoundingClientRect();
    const room = this.limit - r.top;
    if (r.height > room) (it.ref as HTMLElement).style.zoom = String(Math.max(0.3, room / r.height));
    this.tally();
  }
  newPage() {
    const page = this.make(this.pages.length + 1);
    this.pages.push(page);
    this.flow = page.querySelector(".flow")!;
    this.limit = this.flow.getBoundingClientRect().bottom;
    this.count = 0;
    this.log = [];
    let into: Element = this.flow;
    for (const s of this.stack) { const c = continued(s.orig, this.placed.get(s.orig) ?? 0); into.append(c); s.copy = c; into = c; }
  }
  empty() { return this.count === 0; }
  mark() { return { n: this.log.length, count: this.count, stack: this.stack.map((s) => ({ ...s })), started: new Set(this.started), placed: new Map(this.placed) }; }
  rollback(m: unknown) {
    const s = m as ReturnType<DomSink["mark"]>;
    while (this.log.length > s.n) this.log.pop()!.remove();
    this.count = s.count; this.stack = s.stack; this.started = s.started; this.placed = s.placed;
  }
}

// --- the book -------------------------------------------------------------------------

export function openBook(o: BookOpts) {
  const html = document.documentElement;
  const cover = document.querySelector<HTMLElement>("header.book")!;
  const main = document.querySelector<HTMLElement>("main")!;
  const sheets = [...main.querySelectorAll<HTMLElement>(":scope > .sheet")];
  const headTpl = sheets[0].querySelector(".head")!.cloneNode(true) as HTMLElement;
  const items = sheets.flatMap((s) => [...s.children].filter((c) => !c.classList.contains("head"))).map(tree);
  const contents = new Set([...cover.querySelectorAll<HTMLAnchorElement>('.slip a[href^="#"]')].map((a) => decodeURIComponent(a.hash.slice(1))));
  for (const s of sheets) s.remove();

  // the desk: an area for the book between the controls, the book on it
  const stage = el("div", "stage");
  const area = el("div", "area");
  const bk = el("div", "bk");
  const boardL = el("div", "board l"), boardR = el("div", "board r");
  const edgesL = el("div", "edges l"), edgesR = el("div", "edges r");
  const leavesBox = el("div", "leaves");
  const underClip = el("div", "under-clip"), under = el("div", "under");
  for (const d of [boardL, boardR, edgesL, edgesR, underClip]) d.setAttribute("aria-hidden", "true");
  underClip.append(under);
  bk.append(boardL, boardR, edgesL, edgesR, leavesBox, underClip);
  area.append(bk);
  stage.append(area);
  main.before(stage);

  // controls: back a page, the contents, where you are, on a page
  const asPage = document.querySelector<HTMLAnchorElement>(".tools .as-page");
  const turner = el("nav", "turner");
  turner.setAttribute("aria-label", "Pages");
  const prevB = el("button", "prev") as HTMLButtonElement;
  const tocB = el("button", "toc") as HTMLButtonElement;
  const where = el("span", "where");
  const nextB = el("button", "next") as HTMLButtonElement;
  prevB.type = tocB.type = nextB.type = "button";
  prevB.innerHTML = "<span aria-hidden=\"true\">‹</span>";
  nextB.innerHTML = "<span aria-hidden=\"true\">›</span>";
  prevB.setAttribute("aria-label", "Previous page");
  nextB.setAttribute("aria-label", "Next page");
  tocB.textContent = "contents";
  where.setAttribute("aria-live", "polite");
  turner.append(prevB, tocB, where, nextB);
  document.body.append(turner);

  let mode: Mode = "single";
  let W = 0, H = 0, L = 0, n = 0, max = 0;
  let pages: HTMLElement[] = [];
  let ids: string[][] = [];
  let book: Leaf[] = [];
  let les: LeafEl[] = [];
  let coverSide!: HTMLElement;
  let staging = el("div");

  function size() {
    const r = area.getBoundingClientRect();
    const h = Math.floor(r.height);
    const half = Math.floor(Math.min(h * 0.74, (r.width - 30) / 2));
    if (half >= 380 && r.width > r.height * 1.05) return { mode: "spread" as Mode, W: half, H: h, aw: r.width };
    return { mode: "single" as Mode, W: Math.floor(Math.min(r.width - 18, 660)), H: h, aw: r.width };
  }

  function makePage(num: number) {
    const pg = el("div", "side pg");
    pg.setAttribute("role", "group");
    pg.setAttribute("aria-label", `Page ${num}`);
    const head = headTpl.cloneNode(true) as HTMLElement;
    head.querySelector("b")!.textContent = String(num);
    const flow = el("div", "flow");
    pg.append(head, flow);
    staging.append(pg);
    return pg;
  }

  function ghostOf(pg: HTMLElement) {
    const g = el("div", "side pg ghost");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    const ink = el("div", "ink");
    for (const c of pg.children) ink.append(c.cloneNode(true));
    ink.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
    ink.querySelectorAll<HTMLCanvasElement>("canvas[data-fig]").forEach((c) => { c.dataset.ghost = c.dataset.fig; c.removeAttribute("data-fig"); c.removeAttribute("title"); });
    g.append(ink);
    return g;
  }

  function sideEl(s: Side): HTMLElement {
    switch (s.kind) {
      case "cover": { const d = el("div", "side cover"); d.append(cover); coverSide = d; return d; }
      case "inside": { const d = el("div", "side inside"); d.setAttribute("aria-hidden", "true"); return d; }
      case "blank": { const d = el("div", "side pg blank"); d.setAttribute("aria-hidden", "true"); return d; }
      case "page": return pages[s.n - 1];
      case "ghost": return ghostOf(pages[s.n - 1]);
    }
  }

  function leafEl(l: Leaf): LeafEl {
    const root = el("div", "leaf x");
    const clipF = el("div", "clip"), unF = el("div", "unclip"), front = sideEl(l.front);
    const clipB = el("div", "clip"), unB = el("div", "unclip"), back = sideEl(l.back);
    const crease = el("div", "crease");
    crease.setAttribute("aria-hidden", "true");
    // the shadow the lifted part throws on the rest of its own leaf
    const cast = el("div", "cast");
    cast.setAttribute("aria-hidden", "true");
    front.classList.add("recto");
    back.classList.add("verso");
    back.append(crease);
    unF.append(front, cast); clipF.append(unF);
    unB.append(back); clipB.append(unB);
    root.append(clipF, clipB);
    return { root, clipF, unF, front, clipB, unB, back, crease, cast, state: "x", ghosted: false };
  }

  /** The first thing on a page that isn't a continued shell: a stable place to come back to. */
  function anchorOf(p: number): Element | null {
    let e: Element | null = pages[p - 1]?.querySelector(".flow")?.firstElementChild ?? null;
    while (e?.classList.contains("cont")) e = e.firstElementChild;
    return e;
  }

  /** Flow the rules onto pages of the size the screen allows, and bind them. */
  function build(anchor: Element | null) {
    const s = size();
    mode = s.mode; W = s.W; H = s.H;
    L = Math.ceil(3 * (2 * W + H));
    const bw = mode === "spread" ? 2 * W : W;
    html.classList.toggle("spread", mode === "spread");
    html.classList.toggle("single", mode === "single");
    bk.style.setProperty("--pw", `${W}px`);
    bk.style.setProperty("--ph", `${H}px`);
    bk.style.setProperty("--L", `${L}px`);
    bk.style.setProperty("--sx", `${mode === "spread" ? W : 0}px`);
    view = eye(mode === "spread" ? 0 : W / 2, H * 0.45, 2.1 * Math.max(H, 1.4 * W));
    bk.style.width = `${bw}px`;
    bk.style.left = `${Math.round((s.aw - bw) / 2 + (mode === "single" ? 5 : 0))}px`;

    // take the last binding apart
    for (const it of items) restore(it);
    leavesBox.replaceChildren();
    main.replaceChildren();
    staging = el("div", "staging");
    bk.append(staging);

    // drawings no taller than about half a page
    const room = H - 53 - 24;
    for (const fig of items.flatMap((i) => [...(i.ref.matches("figure") ? [i.ref] : i.ref.querySelectorAll("figure"))]) as HTMLElement[]) {
      fig.style.maxWidth = fig.style.marginLeft = fig.style.marginRight = "";
      const c = fig.querySelector("canvas");
      const [fw, fh] = (c?.style.aspectRatio ?? "").split("/").map(Number);
      if (!fw || !fh) continue;
      const most = Math.floor(room * 0.52 * (fw / fh));
      if (most < W - 80) { fig.style.maxWidth = `${most}px`; fig.style.marginLeft = fig.style.marginRight = "auto"; }
    }

    const sink = new DomSink(makePage);
    paginate(items, sink);
    pages = sink.pages;
    n = pages.length;
    ids = [[], ...pages.map((pg) => [...pg.querySelectorAll("[id]")].map((e) => e.id))];
    max = maxPos(mode, n);

    book = leaves(mode, n);
    les = book.map(leafEl);
    les.forEach((le, j) => (j === 0 ? leavesBox : main).append(le.root));
    leavesBox.append(main);
    staging.remove();
    o.laidOut();

    shownKey = "";
    anim = null;
    let at = 0;
    const found = anchor ? pages.findIndex((pg) => pg.contains(anchor)) : -1;
    if (found >= 0) at = posOfPage(mode, found + 1);
    else {
      const id = decodeURIComponent(location.hash.slice(1));
      const p = id ? pageOf(id, ids) : undefined;
      if (p !== undefined) { at = posOfPage(mode, p); pinned = id; }
    }
    rest = -1;
    settle(at, false);
  }

  // --- drawing a moment of the book ----------------------------------------------------

  let shownKey = "";
  let top = false; // turning by the top corner

  /** Which leaves show which face, and in what order, for this picture. Changes
   *  only when a leaf lands or lifts, so style work stays off the moving frames. */
  function arrange(fr: Frame) {
    const want = new Map<number, [string, number]>();
    for (const { leaf } of fr.turning) want.set(leaf, ["t", 0]);
    const put = (j: number, s: string, z: number) => { if (j >= 0 && j < les.length && !want.has(j)) want.set(j, [s, z]); };
    // the open pages, and a couple under each so the next turn has them ready
    for (let k = 0; k < 3; k++) put(fr.right + k, "f", 50 - k);
    if (mode === "spread") for (let k = 0; k < 3; k++) put(fr.left - k, "b", 50 - k);
    else for (let k = 0; k < 2; k++) put(fr.left - k, "f", 47 - k); // turned leaves wait face up under the pile
    const N = les.length;
    les.forEach((le, j) => {
      const [s, z] = want.get(j) ?? ["x", 0];
      if (le.state !== s) {
        if (le.state === "t") for (const e of [le.clipF, le.unF, le.clipB, le.unB, le.back, le.crease, le.cast]) { e.style.transform = ""; e.style.opacity = ""; }
        le.root.className = `leaf ${s}`;
        le.state = s;
      }
      if (s === "t") { le.clipF.style.zIndex = String(100 + N - j); le.clipB.style.zIndex = String(300 + j); }
      else le.clipF.style.zIndex = le.clipB.style.zIndex = String(z);
      if (s !== "x" && !le.ghosted && mode === "single") { le.ghosted = true; later(() => le.back.querySelectorAll<HTMLCanvasElement>("canvas[data-ghost]").forEach(o.ghost)); }
    });
  }

  /** How far a leaf lifts about the spine at the middle of its turn, in radians. */
  const SPINE = 0.55;
  /** The reader's eye, above the middle of the book, in page coordinates. */
  let view: Mat4 = from2d([1, 0, 0, 1, 0, 0]);

  function bend(le: LeafEl, t: number) {
    const f = fold(t, W, H, top, L);
    const unclip = css(f.unclip);
    // the whole leaf lifts off the page about the spine, and the folded part stands up
    // further about the fold, like paper bound at one edge, all seen from above
    const lifted = mul4(view, hinge(0, 0, 0, -1, SPINE * Math.sin(Math.PI * t)));
    le.clipF.style.transform = css4(mul4(lifted, from2d(f.clip))); le.unF.style.transform = unclip;
    le.clipB.style.transform = css4(mul4(mul4(lifted, f.air), from2d(f.clip))); le.unB.style.transform = unclip;
    le.back.style.transform = css(f.back);
    // ...throwing its shadow on the leaf where it would lie flat, a little away from the lamp
    const sh = Math.sin(f.rise);
    le.cast.style.transform = css(mul(tr(4 + 10 * sh, 6 + 14 * sh), f.back));
    le.cast.style.opacity = (0.9 * sh).toFixed(3);
    // the crease: a band of shade and highlight along the fold, on the back
    const D = Math.hypot(W, H);
    const cw = Math.max(1, Math.min(f.depth, W * 0.5));
    le.crease.style.transform = css(mul(inv(f.back), box(f.frame, -cw, -D, cw, 2 * D)));
    le.crease.style.opacity = (0.35 + 0.65 * f.lift).toFixed(3);
    return f;
  }

  function render(fr: Frame) {
    const key = `${fr.turning.map((x) => x.leaf).join(",")}|${fr.right}|${fr.left}`;
    if (key !== shownKey) { shownKey = key; arrange(fr); }
    let nearest: { f: ReturnType<typeof fold>; leaf: number } | null = null;
    for (const { leaf, t } of fr.turning) {
      const f = bend(les[leaf], t);
      if (leaf === fr.right - 1) nearest = { f, leaf };
    }
    // the lifted leaf's shadow on the page it's uncovering
    if (nearest) {
      const D = Math.hypot(W, H);
      const uw = Math.max(1, Math.min(nearest.f.depth * 0.9, W * 0.4) * (0.3 + 0.7 * nearest.f.lift));
      under.style.transform = css(box(nearest.f.frame, 0, -D, uw, 2 * D));
      under.style.opacity = (0.25 + 0.75 * nearest.f.lift).toFixed(3);
    } else under.style.opacity = "0";
    // a closed book sits in the middle of the desk, and slides over as its cover opens
    if (mode === "spread") {
      const open = fr.left >= 0 ? 1 : fr.turning.find((x) => x.leaf === 0)?.t ?? 0;
      bk.style.transform = `translateX(${(-(1 - open) * W) / 2}px)`;
      // the cover's own board lands on the left only as the cover does
      boardL.style.opacity = String(clamp((open - 0.82) / 0.18, 0, 1));
    } else bk.style.transform = "";
  }

  // --- moving ---------------------------------------------------------------------------

  let pos = 0, rest = 0;
  let pinned: string | null = null; // the address asked for, kept while its page is open
  type Anim =
    | { kind: "to" | "flurry"; from: number; to: number; t0: number; dur: number; ease: (u: number) => number }
    // following a scroll: the leaf eases after the wheel, so notchy wheels still turn smoothly
    | { kind: "follow"; to: number; last: number };
  let anim: Anim | null = null;
  let raf = 0;

  function loop() {
    raf = 0;
    if (!anim) return;
    const a = anim;
    const now = clock.now();
    if (a.kind === "follow") {
      const k = 1 - Math.exp(-Math.max(0, now - a.last) / 70);
      a.last = now;
      pos += (a.to - pos) * k;
      if (Math.abs(a.to - pos) < 2e-4) { pos = a.to; anim = null; }
      render(frameAt(pos));
      if (anim) raf = requestAnimationFrame(loop);
      return;
    }
    const u = Math.min(1, (now - a.t0) / a.dur);
    const e = a.ease(u);
    pos = a.from + (a.to - a.from) * e;
    render(a.kind === "flurry" ? flurryFrame(a.from, a.to, e) : frameAt(pos));
    if (u < 1) { raf = requestAnimationFrame(loop); return; }
    anim = null;
    if (Number.isInteger(a.to)) settle(a.to);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  /** where the book is heading: the end of the running turn, or where it lies */
  const heading = () => (anim && anim.kind !== "follow" && Number.isInteger(anim.to) ? anim.to : Math.round(pos));

  function go(to: number, dur?: number, ease?: (u: number) => number) {
    to = clamp(to, 0, max);
    if (Number.isInteger(to) && to !== rest && to !== anim?.to) { rustle(1); open(to); }
    const d = Math.abs(to - pos);
    if (o.still || d < 1e-4) {
      anim = null; pos = to; render(frameAt(to));
      if (Number.isInteger(to)) settle(to);
      return;
    }
    anim = { kind: "to", from: pos, to, t0: clock.now(), dur: dur ?? 160 + 460 * Math.min(d, 2.5), ease: ease ?? (d > 0.7 ? smooth : out) };
    kick();
  }

  /** Straight to a page: a flurry of leaves if it's more than one away. */
  function jump(to: number) {
    to = clamp(to, 0, max);
    const from = heading();
    if (o.still || Math.abs(to - from) <= 1) { top = false; return go(to); }
    top = false;
    pos = from;
    render(frameAt(from));
    const k = Math.min(Math.abs(to - from), 5);
    anim = { kind: "flurry", from, to, t0: clock.now(), dur: 480 + 130 * k, ease: smooth };
    rustle(Math.min(3, k));
    kick();
  }

  const next = () => { top = false; go(heading() + 1); };
  const prev = () => { top = false; go(heading() - 1); };

  /** The pages facing you at k: their drawings start drawing. */
  function open(k: number) {
    const faces = pagesAt(mode, k, n);
    o.opened(faces.map((p) => (p === 0 ? coverSide : pages[p - 1])));
    return faces;
  }

  /** The book has come to rest open at k. */
  function settle(k: number, user = true) {
    const moved = k !== rest;
    rest = k; pos = k;
    render(frameAt(k));
    const faces = open(k);
    const shown = faces.filter((p) => p > 0);
    where.textContent = shown.length ? `${shown.join("–")} / ${n}` : "cover";
    tocB.setAttribute("aria-label", shown.length ? `Contents. You're on page ${shown.join(" and ")} of ${n}` : "Contents");
    prevB.disabled = k <= 0;
    nextB.disabled = k >= max;
    stacks();
    if (pinned && faces.includes(pageOf(pinned, ids) ?? -1)) { if (asPage) asPage.href = `?read=all#${pinned}`; return; }
    pinned = null;
    if (!moved && user) return;
    const h = hashFor(faces, ids, contents);
    if (asPage) asPage.href = `?read=all${h ? `#${h}` : ""}`;
    const url = h ? `#${h}` : location.pathname + location.search;
    if (location.hash.slice(1) !== h) history.replaceState(history.state, "", url);
  }

  /** The thickness of paper under each side. */
  function stacks() {
    const lines = (count: number, dir: number) => {
      const k = Math.min(7, Math.ceil(count / 2));
      if (!k) return "none";
      return Array.from({ length: k }, (_, i) => `${dir * (i + 1)}px ${i + 1}px 0 ${i % 2 ? "#e6dfd0" : "#c9c0ad"}`).join(",");
    };
    const leftCount = mode === "spread" ? rest : 0;
    const rightCount = les.length - rest - 1;
    edgesR.style.boxShadow = lines(rightCount, 1);
    edgesR.style.opacity = rightCount >= 0 ? "1" : "0";
    edgesL.style.boxShadow = lines(leftCount - 1, -1);
    edgesL.style.opacity = leftCount > 0 ? "1" : "0";
  }

  // --- sound: a quiet page rustle, only if the game's sound is on ----------------------

  const audible = () => !sfx.muted;
  const wake = () => { if (audible()) sfx.unlock(); };
  addEventListener("pointerdown", wake);
  addEventListener("keydown", wake);
  function rustle(count: number) {
    if (o.still || !audible()) return;
    for (let i = 0; i < count; i++) setTimeout(sfx.rustle, i * 140);
  }

  // --- reading gestures -----------------------------------------------------------------

  // Wheel and trackpad: scrolling turns the leaves, the page following the
  // scroll part of the way; when the scrolling stops the page finishes turning
  // (or, if you scrolled back, falls back). Scroll on and the next leaf lifts.
  let wg: { last: number; dir: number; to: number; done: boolean } | null = null;
  let watching = 0;
  const watch = () => {
    watching = 0;
    if (!wg) return;
    if (clock.now() - wg.last > 200) endWheel();
    else watching = requestAnimationFrame(watch);
  };
  addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch zoom
    e.preventDefault();
    if (anim?.kind === "flurry") return;
    const k = e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? H : 1;
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k;
    if (!d) return;
    const now = clock.now();
    if (!wg || now - wg.last > 200) {
      // a fresh scroll picks the page up wherever it is, even mid-turn
      wg = { last: now, dir: 0, to: anim && anim.kind === "to" ? pos : anim?.kind === "follow" ? anim.to : pos, done: false };
      if (anim?.kind === "to") anim = null;
      top = false;
    }
    wg.last = now; wg.dir = Math.sign(d);
    if (!watching) watching = requestAnimationFrame(watch);
    if (o.still) { if (!wg.done) { wg.done = true; go(heading() + wg.dir); } return; }
    const was = Math.floor(wg.to + 1e-6);
    wg.to = clamp(wg.to + d / Math.max(420, 0.72 * H), 0, max);
    const is = Math.floor(wg.to + 1e-6);
    if (is !== was) { rustle(1); open(Math.max(is, was)); } // a leaf went over: the pages it lays open start drawing
    if (anim?.kind === "follow") anim.to = wg.to;
    else { anim = { kind: "follow", to: wg.to, last: now }; kick(); }
  }, { passive: false });
  function endWheel() {
    const g = wg;
    wg = null;
    if (!g || g.done) return;
    const lo = Math.floor(g.to + 1e-6), frac = g.to - lo;
    if (frac < 1e-4) return go(lo);
    // a little way along the way you were scrolling is enough to turn it
    go(g.dir > 0 ? (frac > 0.12 ? lo + 1 : lo) : (frac < 0.88 ? lo : lo + 1));
  }

  // Touch: drag the page over, sideways or up; let go and it finishes or falls back.
  let drag: { id: number; x0: number; y0: number; p0: number; base: number; axis: "" | "x" | "y"; trail: [number, number][]; to: number } | null = null;
  let dragged = false;
  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !e.isPrimary || drag || anim?.kind === "flurry") return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos, base: heading(), axis: "", trail: [], to: pos };
    dragged = false;
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      stage.setPointerCapture(e.pointerId);
      dragged = true;
      anim = null;
      drag.p0 = pos;
      const y = drag.y0 - bk.getBoundingClientRect().top;
      top = drag.axis === "x" && y < H * 0.38;
    }
    const fwd = drag.axis === "x" ? -dx / (W * 0.9) : -dy / (Math.min(H, 760) * 0.55);
    const p = clamp(drag.p0 + fwd, Math.max(0, drag.base - 1), Math.min(max, drag.base + 1));
    // when the finger was there (the event's own time: a busy frame doesn't slow the flick)
    drag.trail.push([e.timeStamp, p]);
    while (drag.trail.length > 2 && e.timeStamp - drag.trail[0][0] > 120) drag.trail.shift();
    drag.to = p;
    if (o.still) return; // reduced motion: nothing curls; letting go turns the page at once
    pos = p;
    render(frameAt(p));
  });
  const release = (e: PointerEvent, cancelled: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const g = drag;
    drag = null;
    if (!g.axis) return;
    if (o.still) { if (!cancelled && Math.abs(g.to - g.base) > 0.08) go(g.base + Math.sign(g.to - g.base)); return; }
    const [a, b] = [g.trail[0], g.trail[g.trail.length - 1]];
    // how fast it was going as it left the finger, in leaves per ms; a finger that stopped has no flick
    const v = a && b && b[0] > a[0] && e.timeStamp - b[0] < 120 ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    let to = Math.round(pos);
    if (cancelled) to = g.base;
    else if (Math.abs(v) > 0.0009) to = v > 0 ? Math.ceil(pos - 1e-6) : Math.floor(pos + 1e-6);
    go(clamp(to, g.base - 1, g.base + 1));
  };
  stage.addEventListener("pointerup", (e) => release(e, false));
  stage.addEventListener("pointercancel", (e) => release(e, true));

  // Tap or click a page's outer edge to turn it; the cover opens anywhere.
  const spineAt = (x: number) => x - (bk.getBoundingClientRect().left + (mode === "spread" ? W : 0));
  stage.addEventListener("click", (e) => {
    if (dragged) { dragged = false; return; }
    const t = e.target as Element;
    if (t.closest("a, button, canvas, img.fig, input, select, textarea, summary")) return;
    if (!document.getSelection()?.isCollapsed) return;
    const x = spineAt(e.clientX), y = e.clientY - bk.getBoundingClientRect().top;
    top = y < H * 0.38;
    if (rest === 0 && x > 0) return next();
    if (x > W * 0.7) next();
    else if (mode === "spread" ? x < -W * 0.7 : x < W * 0.3) prev();
  });

  // With a mouse, the corner lifts a little when you reach for it.
  let peek: number | null = null;
  stage.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || o.still || wg || (anim && anim.kind === "flurry") || (anim && Number.isInteger(anim.to) && anim.to !== rest)) return;
    const x = spineAt(e.clientX), y = e.clientY - bk.getBoundingClientRect().top;
    const inside = y > 0 && y < H;
    const nextZone = inside && x > W * 0.7 && x < W && rest < max;
    const prevZone = inside && (mode === "spread" ? x < -W * 0.7 && x > -W : x < W * 0.3 && x > 0) && rest > 0;
    stage.style.cursor = nextZone || (prevZone && !(rest === 0)) ? "pointer" : "";
    const corner = (y > H - 120 || y < 120) && (nextZone ? x > W - 110 : prevZone && mode === "spread" && x < -W + 110);
    const want = corner ? rest + (nextZone ? 0.035 : -0.035) : null;
    if (want !== peek) {
      peek = want;
      if (want !== null) top = y < 120;
      go(want ?? rest, 280, out);
    }
  });
  stage.addEventListener("pointerleave", () => { if (peek !== null) { peek = null; go(rest, 280, out); } });

  // Keys, as in any reader.
  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as Element;
    if (t.closest?.("input, textarea, select, [contenteditable]")) return;
    const onControl = !!t.closest?.("a, button");
    const k = e.key;
    let act: (() => void) | null = null;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || (k === " " && !e.shiftKey && !onControl)) act = next;
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || (k === " " && e.shiftKey && !onControl)) act = prev;
    else if (k === "Home") act = () => jump(0);
    else if (k === "End") act = () => jump(max);
    if (act) { e.preventDefault(); act(); }
  });

  prevB.addEventListener("click", prev);
  nextB.addEventListener("click", next);
  tocB.addEventListener("click", () => { pinned = null; jump(0); });

  // The contents slip, and any link to a section: straight there, a flurry of pages.
  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a) return;
    const id = decodeURIComponent(a.hash.slice(1));
    const p = pageOf(id, ids);
    if (p === undefined) return;
    e.preventDefault();
    if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
    pinned = id;
    jump(posOfPage(mode, p));
  });
  const followHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) { pinned = null; if (heading() !== 0) jump(0); return; }
    const p = pageOf(id, ids);
    if (p === undefined) return;
    pinned = id;
    const k = posOfPage(mode, p);
    if (heading() !== k) jump(k);
    else if (asPage) asPage.href = `?read=all#${id}`;
  };
  addEventListener("popstate", followHash);
  addEventListener("hashchange", followHash);

  // Tabbing onto something on a page that's shut turns to that page.
  document.addEventListener("focusin", (e) => {
    const side = (e.target as Element).closest?.(".side");
    if (!side) return;
    const p = side === coverSide ? 0 : pages.indexOf(side as HTMLElement) + 1;
    if (p < 0 || (p === 0 && side !== coverSide)) return;
    if (!pagesAt(mode, rest, n).includes(p)) jump(posOfPage(mode, p));
  });

  // A new screen shape: flow the pages again, keeping your place.
  let rz = 0;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      const s = size();
      if (s.mode === mode && s.W === W && s.H === H) { bk.style.left = `${Math.round((s.aw - (mode === "spread" ? 2 * W : W)) / 2 + (mode === "single" ? 5 : 0))}px`; return; }
      const first = pagesAt(mode, rest, n).find((p) => p > 0);
      build((pinned && document.getElementById(pinned)) || (first ? anchorOf(first) : null));
    }, 200);
  });

  build(null);

  // a handle for filming and measuring
  const api = {
    get pos() { return pos; },
    get rest() { return rest; },
    get max() { return max; },
    get mode() { return mode; },
    get pages() { return n; },
    go, jump, next, prev, clock,
    show(p: number, fromTop = false) { anim = null; top = fromTop; pos = p; render(frameAt(p)); },
    flurryAt(from: number, to: number, u: number) { anim = null; render(flurryFrame(from, to, u)); },
    settle,
  };
  (window as unknown as { book: typeof api }).book = api;
  return api;
}

const later = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(() => f(), { timeout: 1200 }) : setTimeout(f, 60));
