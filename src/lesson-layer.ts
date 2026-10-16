// The lesson's pencil (tutorial.ts): margin notes, loose rings round the men
// a step is about, and an arrow for the shot it asks for. Drawn on one small
// page-space canvas of its own, cropped to what's on it and placed by the
// camera's CSS matrix like the other pencil layers, so it costs nothing while
// the camera moves. It's repainted only while a note is being written on (the
// step's `p` climbs for a second or so) or when the step changes.

import type { Pt } from "./game";
import { handText, lead, pencilArrow, pencilLoop } from "./ink";
import { PencilLayer } from "./pencil-layer";
import { cssMatrix, layerMatrix, type View } from "./projection";
import { theme } from "./theme";
import type { Marks } from "./tutorial";

/** The note's hand: page units. */
export const NOTE = { size: 38, line: 40 };

export class LessonLayer {
  layer = new PencilLayer();
  private css = "";
  private memo: { key: string; marks: Marks } | null = null;

  constructor(host: HTMLElement) {
    host.append(this.layer.c);
  }

  /**
   * Draw the step's marks (worked out once per `key`: the step and the move
   * count, since where everyone stands is what they point at) written on to
   * `p` (0..1). `key` null: nothing on the page.
   */
  render(v: View, key: string | null, marks: () => Marks, p: number, S: number, epoch: number) {
    let m: Marks | null = null;
    if (key !== null) {
      if (this.memo?.key !== key) this.memo = { key, marks: marks() };
      m = this.memo.marks;
    }
    const pts: Pt[] = [];
    if (m) {
      for (const n of m.notes) {
        const w = Math.max(0, ...n.lines.map((l) => l.length)) * NOTE.size * 0.46;
        pts.push({ x: n.at.x - w / 2, y: n.at.y - NOTE.size }, { x: n.at.x + w / 2, y: n.at.y + NOTE.line * n.lines.length });
      }
      for (const r of m.rings) pts.push({ x: r.at.x - r.r, y: r.at.y - r.r }, { x: r.at.x + r.r, y: r.at.y + r.r });
      for (const a of m.arrows) pts.push(a.from, a.to);
    }
    // the page may be turned: a note is written the right way up for whoever it faces
    const flip = Math.cos(v.rot) < 0;
    const k = m && pts.length ? `${theme.id}|${epoch}|${S}|${key}|${flip}|${p.toFixed(2)}` : "";
    this.layer.draw(k, pts, S, 24, (g) => {
      const mk = m!;
      const pencil = lead(theme).note;
      const lines = mk.notes.reduce((a, n) => a + n.lines.length, 0) || 1;
      let i = 0;
      for (const n of mk.notes) {
        g.save();
        g.translate(n.at.x, n.at.y);
        if (flip) g.rotate(Math.PI);
        n.lines.forEach((line, j) => {
          // one line after another, a shade quicker than the whole note's time
          handText(g, line, 0, j * NOTE.line, NOTE.size, pencil, { upTo: p * (lines + 1) - i, weight: 400, rot: -0.02 + (j % 2) * 0.01, align: "center" });
          i++;
        });
        g.restore();
      }
      // the rings and the arrow once the words are mostly down
      const rest = Math.max(0, Math.min(1, (p - 0.45) / 0.45));
      mk.rings.forEach((r, j) => pencilLoop(g, r.at.x, r.at.y, r.r, 462 + j * 31 + Math.round(r.at.x), 2.4, rest, 0.85));
      mk.arrows.forEach((a, j) => pencilArrow(g, a.from, a.to, 0.08, 480 + j * 7, 2.8, rest, 0.9));
    });
    const c = this.layer.c;
    const vis = this.layer.empty ? "hidden" : "";
    if (c.style.visibility !== vis) c.style.visibility = vis;
    if (this.layer.empty) return;
    const css = cssMatrix(layerMatrix(v, this.layer.S, this.layer.ox, this.layer.oy));
    if (css !== this.css) { c.style.transform = css; this.css = css; }
  }
}
