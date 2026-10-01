import type { Pt } from "./game";

type Ctx = CanvasRenderingContext2D;
/** A cropped page-space pencil layer. Content changes repaint it; the camera only places it. */
export class PencilLayer {
  c = document.createElement("canvas");
  key = "";
  empty = true;
  S = 1;
  ox = 0;
  oy = 0;
  draw(key: string, points: Pt[], scale: number, padding: number, paint: (g: Ctx) => void) {
    if (key === this.key) return false;
    this.key = key;
    this.empty = !points.length;
    if (this.empty) return false;
    this.S = scale;
    this.ox = Math.floor(Math.min(...points.map((p) => p.x)) - padding);
    this.oy = Math.floor(Math.min(...points.map((p) => p.y)) - padding);
    const w = Math.ceil((Math.max(...points.map((p) => p.x)) + padding - this.ox) * scale);
    const h = Math.ceil((Math.max(...points.map((p) => p.y)) + padding - this.oy) * scale);
    // Reuse a stable-sized buffer during a moving streak; clear only this cropped layer.
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    const g = this.c.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    this.c.style.width = `${w}px`; this.c.style.height = `${h}px`;
    g.setTransform(scale, 0, 0, scale, -this.ox * scale, -this.oy * scale);
    paint(g);
    return true;
  }
}
