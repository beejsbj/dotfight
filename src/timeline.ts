// When each mark is being drawn. The page itself never animates: a mark is
// either settled (drawn whole, seeded) or being drawn, and this says how far
// along it is. Time comes in from outside, so it is plain and testable.

export type Ease = "linear" | "out" | "out2";

const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  out2: (t) => 1 - Math.pow(1 - t, 2),
};

interface Item { t0: number; dur: number; ease: Ease }

export class Timeline {
  private items = new Map<string, Item>();
  /** Multiplies every duration and delay added from now on (reduced motion). */
  speed = 1;

  /** Draw `key` starting `delay` ms after `now`, over `dur` ms. Returns when it ends. */
  add(key: string, now: number, delay: number, dur: number, ease: Ease = "linear") {
    const it = { t0: now + delay * this.speed, dur: Math.max(1, dur * this.speed), ease };
    this.items.set(key, it);
    return it.t0 + it.dur;
  }

  /** 0 before it starts, 1 once done or if nothing is scheduled for `key`. */
  p(key: string, now: number) {
    const it = this.items.get(key);
    if (!it) return 1;
    const t = (now - it.t0) / it.dur;
    return t <= 0 ? 0 : t >= 1 ? 1 : EASE[it.ease](t);
  }

  /** Is `key` still to finish (including not yet started)? */
  pending(key: string, now: number) {
    const it = this.items.get(key);
    return !!it && now < it.t0 + it.dur;
  }

  /** Keys still being drawn or waiting their turn; everything else is settled. */
  live(now: number) {
    const out = new Set<string>();
    for (const [k, it] of this.items) {
      if (now < it.t0 + it.dur) out.add(k);
      else this.items.delete(k);
    }
    return out;
  }

  /** When the last scheduled mark finishes (or `now` if idle). */
  end(now: number) {
    let e = now;
    for (const it of this.items.values()) e = Math.max(e, it.t0 + it.dur);
    return e;
  }

  clear() { this.items.clear(); }
}

/** A path drawn with eased progress reaches index `i` of `n` segments at this raw time fraction. */
export function reachFraction(i: number, n: number) {
  const e = Math.max(0, Math.min(1, i / n));
  return 1 - Math.sqrt(1 - e); // inverse of "out2"
}


/** The displayed convoy walker, including the eased march and small step bob. */
export function walkerAt(from: { x: number; y: number }, to: { x: number; y: number }, p: number) {
  const e = p * p * (3 - 2 * p);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e - Math.abs(Math.sin(p * Math.PI * 7)) * 2.5 * (1 - p),
  };
}

/**
 * May a won page's signature be on the page yet? Not while a war is being played
 * or replayed until its finale starts writing it: the state turns "over" with the
 * winning flick, long before the morning, and the page must not sign itself then.
 * A page just looked at (drawer, kept) is signed already.
 */
export const signable = (screen: string, begun: boolean) => begun || (screen !== "game" && screen !== "replay");
