// The pen in the hand. Turns a pull-back gesture into a Flick, with the
// imprecision of a real pen flick: a visible wobble if you hold a charged
// flick too long, and a small unseen error on release.

import { gauss } from "./geom";
import type { Flick, Kind } from "./game";
import { FEEL } from "./rules";

export interface Aim {
  soldierId: number;
  kind: Kind;
  ax: number; // where the finger went down (screen px)
  ay: number;
  x: number; // where it is now
  y: number;
  t0: number; // when the pull passed the dead zone (ms)
  charged: boolean;
  /** How steady the hand is, from the phone's gyro: scales the wobble (1 = no sensor). */
  steady?: number;
}

export function pull(a: Aim) {
  const vx = a.ax - a.x, vy = a.ay - a.y;
  const d = Math.hypot(vx, vy);
  return {
    angle: Math.atan2(vy, vx),
    power: Math.min(1, Math.max(0, (d - FEEL.minPullPx) / (FEEL.maxPullPx - FEEL.minPullPx))),
    live: d >= FEEL.minPullPx,
  };
}

// The visible tremble: grows with power and with how long you've held it.
export function wobble(a: Aim, now: number) {
  const { power } = pull(a);
  const held = now - a.t0 - FEEL.wobbleStartMs;
  if (!a.charged || held <= 0) return 0;
  const amp = FEEL.wobbleMax * power * Math.min(1, held / FEEL.wobbleGrowMs) * (a.steady ?? 1);
  const t = now / 1000;
  return amp * (Math.sin(t * 5.3) * 0.6 + Math.sin(t * 8.9 + 1.3) * 0.3 + Math.sin(t * 15.1 + 0.4) * 0.1);
}

export function sigma(power: number) {
  return FEEL.jitterBase + FEEL.jitterPower * power * power;
}

/** How shaky the hand is: a multiplier on the release error, and a tremor (radians, 1 sd) added in quadrature. */
export interface Hand { mult: number; tremor: number }
export const STEADY: Hand = { mult: 1, tremor: 0 };

/** Radians (1 sd) of release error for a flick of this power by this hand. */
export const aimError = (power: number, h: Hand = STEADY) => Math.hypot(sigma(power) * h.mult, h.tremor);

// Let go of the pen. `lengthOf` turns power into a line length; every bit of
// randomness is resolved here, so the engine only ever sees a finished flick.
export function release(a: Aim, now: number, lengthOf: (power: number) => number, h: Hand = STEADY, rand: () => number = Math.random): Flick | null {
  const p = pull(a);
  if (!p.live) return null;
  return {
    soldier: a.soldierId,
    kind: a.kind,
    angle: p.angle + wobble(a, now) + gauss(rand) * aimError(p.power, h),
    length: lengthOf(p.power) * (1 + gauss(rand) * FEEL.lengthJitter * h.mult),
    bend: (rand() * 2 - 1) * FEEL.bendMax * (0.3 + 0.7 * p.power),
    wob: (rand() * 2 ** 32) >>> 0,
  };
}
