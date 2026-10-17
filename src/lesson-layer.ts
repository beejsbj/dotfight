// The lesson's pencil (tutorial.ts): the step's heading and margin note,
// loose rings round the men it's about, and an arrow for the shot it asks
// for. All on small page-space canvases of their own, cropped to what's on
// them and placed by the camera's CSS matrix like the other pencil layers, so
// a camera move costs a style write. Each is repainted only when what's on it
// changes, or while a note is being written on.
//
// Two of them:
// - `page`: the note where it lives on the page, sized to read from
//   bird's-eye like the soldiers' own notes (scene.ts NOTE).
// - `near`: leaned in over a man to aim, the note is usually off screen or in
//   the fog. A copy is written beside him, in the view the camera is settling
//   on, upright on screen and sized in screen px, just above him and clear of
//   the pen, the thumb and the HUD. It is placed once per pick-up and stays put
//   on the page while you aim (the page turns under the thumb, and so does it).

import type { Pt } from "./game";
import { handText, lead, pencilArrow, pencilLine, pencilLoop } from "./ink";
import { PencilLayer } from "./pencil-layer";
import { cssMatrix, layerMatrix, project, unproject, type View } from "./projection";
import { RULES } from "./rules";
import { theme } from "./theme";
import type { Marks } from "./tutorial";

/**
 * The note's hand. On the page in page units: about 23 css px from
 * bird's-eye on a 390 px phone, as big as a soldier's note (scene.ts writes
 * those at 25 px). Beside the man in css px. Lines wider than `wide` are
 * written smaller.
 */
export const LESSON_NOTE = {
  page: { head: 72, body: 64, wide: 860 },
  /** Beside a held man: a column `col` px wide, `pen` px left of him (the pen stands straight up from him), its last line `above` px over him (clear of his camp's ring). */
  near: { head: 24, body: 22, col: 170, pen: 26, above: 100, pad: 12 },
  weight: 700,
};

const FONT = (size: number) => `${LESSON_NOTE.weight} ${size}px Caveat, "Patrick Hand", cursive`;
let measurer: CanvasRenderingContext2D | null = null;
/** How wide a line is in this size of the hand. */
function width(text: string, size: number) {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  measurer.font = FONT(size);
  return measurer.measureText(text).width;
}

/** A note laid out: the heading and the lines, with their sizes, baselines and widest line. */
interface Lay { rows: { text: string; size: number; y: number; head: boolean }[]; w: number; h: number; asc: number }
function lay(title: string, lines: string[], head: number, body: number, wide: number, wrap = false): Lay {
  const fit = (t: string, s: number) => Math.min(s, (s * wide) / Math.max(1, width(t, s)));
  // `wrap`: a narrow column, broken between words (a lone long word is written smaller)
  const split = (t: string, s: number) => {
    if (!wrap) return [t];
    const out: string[] = [];
    let cur = "";
    for (const w of t.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && width(next, s) > wide) { out.push(cur); cur = w; } else cur = next;
    }
    return cur ? [...out, cur] : out;
  };
  const rows: Lay["rows"] = [];
  let y = 0;
  // a heading too wide for the column breaks at its colon first ("lesson 1 of 6:" / "the flick")
  const heads = wrap && width(title, head) > wide && title.includes(": ") ? title.replace(": ", ":\n").split("\n").flatMap((t) => split(t, head)) : split(title, head);
  for (const t of heads) { rows.push({ text: t, size: fit(t, head), y, head: true }); y += head * 1.05; }
  y += head * 0.1;
  for (const l of lines) for (const t of split(l, body)) { rows.push({ text: t, size: fit(t, body), y, head: false }); y += body * 1.02; }
  const w = Math.max(...rows.map((r) => width(r.text, r.size)));
  return { rows, w, h: y - body * 1.02, asc: head * 0.8 };
}

/** Write a laid-out note centred on x = 0, first baseline at y = 0, up to `p` (0..1, row by row). */
function write(g: CanvasRenderingContext2D, L: Lay, p: number, seed: number) {
  const pencil = lead(theme).note;
  const n = L.rows.length;
  L.rows.forEach((r, i) => {
    const upTo = p * (n + 0.5) - i;
    if (upTo <= 0) return;
    const w = handText(g, r.text, 0, r.y, r.size, pencil, { upTo, weight: LESSON_NOTE.weight, rot: r.head ? -0.025 : -0.012 + (i % 2) * 0.008, align: "center" });
    // the heading is ruled off, the way a kid rules off a new topic
    if (r.head && upTo >= 1) pencilLine(g, { x: -w / 2, y: r.y + r.size * 0.2 }, { x: w / 2, y: r.y + r.size * 0.14 }, Math.max(1.4, r.size * 0.045), seed, false);
  });
}

/** Where a man is held, for the copy beside him. */
export interface Held {
  id: number;
  at: Pt;
  /** The view the camera is settling on (its target pose), not the one it's passing through. */
  view: View;
  /** Screen size and the HUD bars (css px). */
  W: number;
  H: number;
  top: number;
  bottom: number;
  /** Aiming: the copy stays where it was put. */
  hold: boolean;
}

export class LessonLayer {
  page = new PencilLayer();
  near = new PencilLayer();
  private css = ["", ""];
  private memo: { key: string; marks: Marks; lay: Lay[] } | null = null;
  /** The copy beside the man: placed for this man and step, at this spot on the page. */
  private placed: { key: string; at: Pt; ex: Pt; ey: Pt } | null = null;

  constructor(host: HTMLElement) {
    host.append(this.page.c, this.near.c);
  }

  /**
   * Draw the step's marks (worked out once per `key`: the step and the move
   * count, since where everyone stands is what they point at) written on to
   * `p` (0..1). `key` null: nothing on the page. `held`: a man is in hand,
   * leaned in over him.
   */
  render(v: View, key: string | null, title: string, marks: () => Marks, p: number, S: number, epoch: number, held?: Held) {
    if (key === null) this.memo = null;
    else if (this.memo?.key !== key) {
      const m = marks();
      const P = LESSON_NOTE.page;
      this.memo = { key, marks: m, lay: m.notes.map((n, i) => lay(i === 0 ? title : "", n.lines, P.head, P.body, P.wide)) };
    }
    const memo = this.memo;
    // the page may be turned: a note is written the right way up for whoever it faces
    const flip = Math.cos(v.rot) < 0;
    const pts: Pt[] = [];
    if (memo) {
      memo.marks.notes.forEach((n, i) => {
        const L = memo.lay[i];
        pts.push({ x: n.at.x - L.w / 2, y: n.at.y - L.asc - (flip ? L.h : 0) }, { x: n.at.x + L.w / 2, y: n.at.y + L.h + 24 + (flip ? L.asc : 0) });
      });
      for (const r of memo.marks.rings) pts.push({ x: r.at.x - r.r, y: r.at.y - r.r }, { x: r.at.x + r.r, y: r.at.y + r.r });
      for (const a of memo.marks.arrows) pts.push(a.from, a.to);
    }
    const k = memo && pts.length ? `${theme.id}|${epoch}|${S}|${key}|${flip}|${p.toFixed(2)}` : "";
    this.page.draw(k, pts, S, 24, (g) => {
      const mk = memo!.marks;
      mk.notes.forEach((n, i) => {
        g.save();
        g.translate(n.at.x, n.at.y);
        if (flip) g.rotate(Math.PI);
        write(g, memo!.lay[i], p, 501 + i);
        g.restore();
      });
      // the rings and the arrow once the words are mostly down
      const rest = Math.max(0, Math.min(1, (p - 0.45) / 0.45));
      mk.rings.forEach((r, j) => pencilLoop(g, r.at.x, r.at.y, r.r, 462 + j * 31 + Math.round(r.at.x), 2.6, rest, 0.85));
      mk.arrows.forEach((a, j) => pencilArrow(g, a.from, a.to, 0.08, 480 + j * 7, 3, rest, 0.9));
    });
    this.renderNear(memo && held ? held : undefined, memo, title, S, epoch, pts);
    this.place(v, 0, this.page);
    this.place(v, 1, this.near);
  }

  /** The copy beside a held man, unless the note is already in his view. */
  private renderNear(held: Held | undefined, memo: LessonLayer["memo"], title: string, S: number, epoch: number, notePts: Pt[]) {
    const N = LESSON_NOTE.near;
    if (!held || !memo || !memo.marks.notes.length) { this.placed = null; this.near.draw("", [], S, 0, () => undefined); return; }
    const lines = memo.marks.notes[0].lines;
    const L = lay(title, lines, N.head, N.body, Math.min(N.col, held.W / 2 - N.pen - N.pad), true);
    const want = `${memo.key}|${held.id}`;
    // placed once per man and step; while aiming it stays on the page as it turns, unless that takes it out of view
    if (!this.placed || (this.placed.key !== want && !held.hold) || (held.hold && !this.inView(held, L))) this.placed = this.spot(held, L, notePts, want);
    const at = this.placed?.at;
    if (!at) { this.near.draw("", [], S, 0, () => undefined); return; }
    const { ex, ey } = this.placed!;
    // the note's box, mapped onto the page by the view's local stretch there
    const map = (x: number, y: number): Pt => ({ x: at.x + ex.x * x + ey.x * y, y: at.y + ex.y * x + ey.y * y });
    const box = [map(-L.w / 2 - 6, -L.asc - 4), map(L.w / 2 + 6, -L.asc - 4), map(L.w / 2 + 6, L.h + 10), map(-L.w / 2 - 6, L.h + 10)];
    // the page's own resolution is already chosen to be sharp leaned in (main.ts resize)
    const SS = S;
    this.near.draw(`${theme.id}|${epoch}|${SS}|${want}|${at.x.toFixed(1)},${at.y.toFixed(1)}`, box, SS, 4, (g) => {
      g.save();
      g.transform(ex.x, ex.y, ey.x, ey.y, at.x, at.y);
      write(g, L, 1, 611);
      g.restore();
    });
  }

  /**
   * Where the copy goes: centred across the screen, its last line `gap` px
   * above the man (clear of the pen standing on him, and of the thumb pulling
   * below), never under the top bar. Null when the page note is already in view.
   */
  private spot(h: Held, L: Lay, notePts: Pt[], key: string) {
    const N = LESSON_NOTE.near, v = h.view;
    const top = h.top + 10, bottom = h.H - h.bottom - 10;
    const seen = (q: Pt) => { const s = project(v, q.x, q.y); return s.x >= 0 && s.x <= h.W && s.y >= top && s.y <= bottom; };
    const noteBox = notePts.slice(0, 2);
    if (noteBox.length === 2) {
      const [a, b] = noteBox;
      if ([a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }].every(seen)) return null;
    }
    const m = project(v, h.at.x, h.at.y);
    let y0 = m.y - N.above - L.h; // the first baseline
    if (y0 - L.asc < top) y0 = top + L.asc;
    // a column to the left of the pen, centred in the space between the screen's edge and it
    const x0 = (N.pad + (m.x - N.pen)) / 2;
    const at = unproject(v, x0, y0);
    const r = 20, px = unproject(v, x0 + r, y0), nx = unproject(v, x0 - r, y0), py = unproject(v, x0, y0 + r), ny = unproject(v, x0, y0 - r);
    if (!at || !px || !nx || !py || !ny) return null;
    const ex = { x: (px.x - nx.x) / (2 * r), y: (px.y - nx.y) / (2 * r) }, ey = { x: (py.x - ny.x) / (2 * r), y: (py.y - ny.y) / (2 * r) };
    // off the paper altogether (a man in the page's corner): no copy
    if (at.x < 0 || at.x > RULES.pageW || at.y < 0 || at.y > RULES.pageH) return null;
    return { key, at, ex, ey };
  }

  /** Is the placed copy all on screen in this view? */
  private inView(h: Held, L: Lay) {
    const p = this.placed;
    if (!p) return false;
    const map = (x: number, y: number): Pt => ({ x: p.at.x + p.ex.x * x + p.ey.x * y, y: p.at.y + p.ex.y * x + p.ey.y * y });
    return [map(-L.w / 2, -L.asc), map(L.w / 2, -L.asc), map(L.w / 2, L.h), map(-L.w / 2, L.h)].every((q) => {
      const s = project(h.view, q.x, q.y);
      return s.x >= 0 && s.x <= h.W && s.y >= h.top && s.y <= h.H - h.bottom;
    });
  }

  private place(v: View, i: number, layer: PencilLayer) {
    const c = layer.c;
    const vis = layer.empty ? "hidden" : "";
    if (c.style.visibility !== vis) c.style.visibility = vis;
    if (layer.empty) return;
    const css = cssMatrix(layerMatrix(v, layer.S, layer.ox, layer.oy));
    if (css !== this.css[i]) { c.style.transform = css; this.css[i] = css; }
  }
}
