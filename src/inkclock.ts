// Ink time. While a flick resolves, the ink runs on its own clock so it can
// catch for a beat on every soldier it crosses (a hit-stop), the way a pen
// snags on a pressed dot. Pure: elapsed wall time in, ink time out.

export interface Snag {
  /** Ink time (ms since the flick) at which the ink catches. */
  at: number;
  /** How long it holds, in wall ms. */
  hold: number;
}

/** Wall ms since the flick began → ink ms. Snags must be sorted by `at`. */
export function inkTime(elapsed: number, snags: readonly Snag[]): number {
  let held = 0;
  for (const s of snags) {
    const reached = s.at + held; // wall time when the ink gets to this snag
    if (elapsed < reached) break;
    if (elapsed < reached + s.hold) return s.at;
    held += s.hold;
  }
  return elapsed - held;
}

/** Ink ms → the wall ms at which the ink first gets there. */
export function wallTime(ink: number, snags: readonly Snag[]): number {
  let held = 0;
  for (const s of snags) {
    if (ink <= s.at) break;
    held += s.hold;
  }
  return ink + held;
}

/** Total wall time the snags add. */
export const totalHold = (snags: readonly Snag[]) => snags.reduce((a, s) => a + s.hold, 0);
