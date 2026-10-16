// Wet ink (the real-time prototype, docs/realtime.md): a soldier who just
// flicked has a glossy dot, still wet under the lamp, until he dries and can
// act again. The gloss is a highlight on the lamp side of his dot and a thin
// sheen round it, both fading as the ink dries; while it's wet the highlight
// crawls a little, the way light moves on a drying bead of ballpoint.
//
// The page is append-only, so nothing of this touches it: the gloss goes on a
// small page-space layer of its own (a cropped canvas round the wet men, like
// the pencil layers), redrawn only when a man's wetness ticks (8 fps, the
// boil's rate) or someone dries. Pure parts (what's wet, how wet) are tested.

import type { Pt } from "./game";
import { INK } from "./ink";
import { PencilLayer } from "./pencil-layer";
import { RULES } from "./rules";
import { theme } from "./theme";

export const WET = {
  /** Redraws a second while anything is wet. */
  fps: 8,
  /** How wet a dot looks is quantised to this many steps, so a frame only redraws when the look changes. */
  steps: 12,
};

/** How wet a soldier's ink is at clock `t`: 1 just flicked, 0 dry. Pure. */
export function wetness(until: number, t: number, dryMs: number) {
  if (dryMs <= 0) return 0;
  return Math.max(0, Math.min(1, (until - t) / dryMs));
}

/** The wet men at clock `t`, each with how wet, from the engine's `rt.wet` (id → dries at). Pure. */
export function wetMen(wet: Record<number, number> | undefined, t: number, dryMs: number): { id: number; w: number }[] {
  const out: { id: number; w: number }[] = [];
  for (const [k, until] of Object.entries(wet ?? {})) {
    const w = wetness(until, t, dryMs);
    if (w > 0) out.push({ id: +k, w });
  }
  return out;
}

/** The men whose ink dried between clock `t0` (exclusive) and `t1` (inclusive). Pure. */
export function dried(wet: Record<number, number> | undefined, t0: number, t1: number): number[] {
  return Object.entries(wet ?? {}).filter(([, until]) => until > t0 && until <= t1).map(([k]) => +k);
}

/** A key that changes only when the layer's look does: who, how wet (quantised), and the crawl frame. */
export function wetKey(men: { id: number; w: number }[], frame: number, extra = "") {
  return `${extra}|${frame}|${men.map((m) => `${m.id}:${Math.ceil(m.w * WET.steps)}`).join()}`;
}

export class WetLayer {
  layer = new PencilLayer();
  get c() { return this.layer.c; }
  get empty() { return this.layer.empty; }
  get S() { return this.layer.S; }
  get ox() { return this.layer.ox; }
  get oy() { return this.layer.oy; }

  /**
   * Draw the gloss on every wet man. `at` gives each man's dot on the page;
   * `lamp` is where the light comes from; `frame` is the crawl frame (hold it
   * still under reduced motion). Returns whether anything was redrawn.
   */
  draw(men: { id: number; w: number; owner: 0 | 1 }[], at: (id: number) => Pt | undefined, lamp: Pt, S: number, frame: number, still: boolean) {
    const spots = men.map((m) => ({ ...m, p: at(m.id) })).filter((m): m is { id: number; w: number; owner: 0 | 1; p: Pt } => !!m.p);
    const key = wetKey(spots, still ? 0 : frame, `${theme.id}|${S}`);
    const r = RULES.soldierRadius;
    return this.layer.draw(key, spots.map((m) => m.p), S, r * 2.5, (g) => {
      const sh = theme.light.sheen;
      for (const m of spots) {
        const { x, y } = m.p;
        const ang = Math.atan2(lamp.y - y, lamp.x - x) + (still ? 0 : Math.sin(frame * 0.9 + m.id) * 0.25);
        // the bead of ink still standing proud of the paper: a halo in his own ink, shrinking as it dries
        g.strokeStyle = INK.pens[m.owner];
        g.globalAlpha = 0.18 + 0.3 * m.w;
        g.lineWidth = 1.6 + 2.2 * m.w;
        g.beginPath();
        g.arc(x, y, r * (1.15 + 0.45 * m.w), 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        // the sheen round the dot, thinning as it dries
        g.strokeStyle = `rgba(${sh[0]}, ${sh[1]}, ${sh[2]}, ${0.35 * m.w * theme.ink.gloss})`;
        g.lineWidth = 1.2 + 1.3 * m.w;
        g.beginPath();
        g.arc(x, y, r * 0.95, ang - 1.9, ang + 1.9);
        g.stroke();
        // the highlight where the lamp catches it
        g.fillStyle = `rgba(255, 255, 255, ${Math.min(0.95, (0.35 + 0.6 * m.w) * theme.ink.gloss)})`;
        g.beginPath();
        g.ellipse(x + Math.cos(ang) * r * 0.42, y + Math.sin(ang) * r * 0.42, r * (0.22 + 0.16 * m.w), r * (0.14 + 0.1 * m.w), ang, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
}
