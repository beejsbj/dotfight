// Comic bubbles: now and then, a soldier says something in writing.
//
// A word or two written on the page beside the man who said it, in his side's
// pen inside a hand-drawn balloon whose tail points at him: "I'm ready" when you pick him
// up, "phew" after a near miss, "!" when a pen points at him, and the odd
// stray thought. Rare on purpose: one on screen at most, a long gap between
// them, and most chances pass. Seeded, cosmetic, never game state.
//
// It's a note, not a mark: drawn on the live layer (page space, the theme's
// pens and blend), written on, then faded, and the append-only page never
// keeps it, so a long war isn't cluttered with talk. It only redraws while
// being written or fading, on the 12 fps grid, or while the camera moves.

import { LIFE, unit } from "./life";

export type BubbleKind = "ready" | "phew" | "dread" | "idle";

export const BUBBLE = {
  /** At least this long between one bubble and the next (ms). */
  gapMs: 11000,
  /** On screen this long, all told (ms): written on, read, faded. */
  showMs: 1900,
  writeMs: 420,
  fadeMs: 360,
  /** Stray thoughts: a chance this often (ms), on your go while nothing's happening. */
  idleEveryMs: 8000,
  idleChance: 0.2,
  /** The grid it animates on: hand-drawn, on twos. */
  fps: 12,
};

export const LINES: Record<BubbleKind, readonly string[]> = {
  ready: ["I'm ready", "ready!", "me?", "ok!"],
  phew: ["phew", "phew!", "close one"],
  dread: ["!", "!!", "eep"],
  idle: ["for Dawood!", "mum?", "hold the line", "…", "not me", "hm", "is it lunch?"],
};

/** How often a chance to speak is taken. */
const CHANCE: Record<BubbleKind, number> = { ready: 0.3, phew: 0.55, dread: 0.3, idle: 1 };

export interface Bubble {
  kind: BubbleKind;
  id: number;
  text: string;
  /** Wall ms it starts being written. */
  t0: number;
  /** Which side of him it sits (screen): 1 right, -1 left. */
  side: 1 | -1;
  seed: number;
}

/** What a bubble looks like at wall `ms`: how much is written, how faded, and a key that changes only when that does. Pure. */
export function bubbleAt(b: Bubble, ms: number, reduced = false) {
  const dt = ms - b.t0;
  if (dt < 0 || dt >= BUBBLE.showMs) return null;
  const f = Math.floor((dt * BUBBLE.fps) / 1000), q = (f * 1000) / BUBBLE.fps;
  const p = reduced ? 1 : Math.min(1, q / BUBBLE.writeMs);
  const alpha = Math.min(1, (BUBBLE.showMs - q) / BUBBLE.fadeMs);
  return { p, alpha, key: `${b.seed}|${p.toFixed(3)}|${alpha.toFixed(3)}` };
}

/** One bubble at a time, rarely. */
export class Bubbles {
  cur: Bubble | null = null;
  private last = -Infinity;
  private window = -1;

  /**
   * Soldier `id` might say something of `kind`, starting at wall `t0`.
   * Returns the bubble if he does: not while another shows, not soon after
   * the last, and only on the seeded chance.
   */
  offer(kind: BubbleKind, id: number, t0: number, seed: number): Bubble | null {
    if (!LIFE.bubbles) return null;
    if (this.cur && t0 < this.cur.t0 + BUBBLE.showMs) return null;
    if (t0 - this.last < BUBBLE.gapMs) return null;
    if (unit(seed, 5) >= CHANCE[kind]) return null;
    const lines = LINES[kind];
    const text = lines[Math.floor(unit(seed, 7) * lines.length)];
    this.cur = { kind, id, text, t0, side: unit(seed, 11) < 0.5 ? -1 : 1, seed };
    this.last = t0;
    return this.cur;
  }

  /** Is it time for a stray thought? Once per window, on a seeded chance. */
  idleDue(ms: number, seed: number) {
    const w = Math.floor(ms / BUBBLE.idleEveryMs);
    if (w === this.window) return false;
    this.window = w;
    return unit(seed, w, 13) < BUBBLE.idleChance;
  }

  /** The bubble showing at `ms`, if any. */
  showing(ms: number) {
    if (this.cur && ms >= this.cur.t0 + BUBBLE.showMs) this.cur = null;
    return this.cur && ms >= this.cur.t0 ? this.cur : null;
  }

  clear() { this.cur = null; }
  /** Forget the last one too, so the next chance can be taken at once (dev captures). */
  reset() { this.cur = null; this.last = -Infinity; }
}
