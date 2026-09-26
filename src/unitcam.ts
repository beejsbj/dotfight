// The unit cam: tap the man in your hand again, and the eye drops right down
// to the page beside him, turned to look where he looks (down the line you
// last pulled, or at the nearest enemy), for a beat. The squares of the maths
// paper run away to the horizon, his camp's ring is a fence round him, the
// enemy's camps are low grey shapes in the lamp's fog. Then it stands back up
// to where you were. Any touch skips it.
//
// Pure: a timeline and some angles. main.ts moves the camera.

import type { GameState, Pt } from "./game";

export const UNIT_CAM = {
  /** Down to his level, hold there, back up (ms). The camera's own easing does the moving. */
  drop: 520,
  hold: 1500,
  rise: 420,
  /** The eye: how close, how far tilted toward the horizon, and where on screen he stands (fraction of height). */
  m: 5.5,
  tilt: 1.15,
  fy: 0.76,
  /** Reduced motion or tilt off: a flat, close look instead, no swoop. */
  flatM: 4,
};

export type Phase = "drop" | "hold" | "rise" | "done";

/**
 * Where the unit cam is, `t` ms after it began. `skip`: when a touch cut it
 * short (ms since it began): it rises from there. Pure.
 */
export function phaseAt(t: number, skip?: number): { phase: Phase; since: number } {
  const { drop, hold, rise } = UNIT_CAM;
  const up = skip !== undefined ? Math.min(skip, drop + hold) : drop + hold;
  if (t < 0) return { phase: "drop", since: 0 };
  if (t < Math.min(drop, up)) return { phase: "drop", since: t };
  if (t < up) return { phase: "hold", since: t - drop };
  if (t < up + rise) return { phase: "rise", since: t - up };
  return { phase: "done", since: t - up - rise };
}

/**
 * Which way he looks (page radians): down the line last pulled on him, if
 * there was one; otherwise at the nearest living enemy. Pure.
 */
export function facing(s: GameState, id: number, lastAim?: number): number {
  const me = s.soldiers[id];
  if (lastAim !== undefined) return lastAim;
  let best: Pt | undefined, bd = Infinity;
  for (const x of s.soldiers) {
    if (!x.alive || x.owner === me.owner) continue;
    const d = Math.hypot(x.x - me.x, x.y - me.y);
    if (d < bd) { bd = d; best = x; }
  }
  // nobody left to look at: up the page, away from his own side
  if (!best) return me.owner === 0 ? -Math.PI / 2 : Math.PI / 2;
  return Math.atan2(best.y - me.y, best.x - me.x);
}

/**
 * The page's turn on screen that puts page direction `face` straight up the
 * screen, taken the short way round from `cur`. Pure.
 */
export function rotFacing(face: number, cur: number) {
  // screen up is page (-sin rot, -cos rot); that's `face` when rot = -face - pi/2
  const TAU = Math.PI * 2;
  const r = -face - Math.PI / 2;
  return r + Math.round((cur - r) / TAU) * TAU;
}
