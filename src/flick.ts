// The pen in the hand. Turns a pull-back gesture into a Flick, with the
// imprecision of a real pen flick: a visible wobble if you hold a charged
// flick too long, and a small unseen error on release.

import { reachOf, type ActionKind, type Flick } from "./game";
import { gauss } from "./geom";
import { FEEL, type RuleSet } from "./rules";

export interface Aim {
  soldierId: number;
  kind: ActionKind;
  ax: number; // where the finger went down (screen px)
  ay: number;
  x: number; // where it is now
  y: number;
  t0: number; // when the pull passed the dead zone (ms)
  charged: boolean;
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
  const amp = FEEL.wobbleMax * power * Math.min(1, held / FEEL.wobbleGrowMs);
  const t = now / 1000;
  return amp * (Math.sin(t * 5.3) * 0.6 + Math.sin(t * 8.9 + 1.3) * 0.3 + Math.sin(t * 15.1 + 0.4) * 0.1);
}

export function sigma(power: number) {
  return FEEL.jitterBase + FEEL.jitterPower * power * power;
}

export function reach(R: RuleSet, kind: ActionKind, power: number) {
  return reachOf(R, kind, power);
}

// Let go of the pen. `steady` < 1 narrows the hidden error (a last stand's
// focus); the engine never lets it reach zero, so a flick is never a click.
export function release(a: Aim, now: number, R: RuleSet, rand: () => number = Math.random, steady = 1): Flick | null {
  const p = pull(a);
  if (!p.live) return null;
  return {
    soldierId: a.soldierId,
    kind: a.kind,
    angle: p.angle + wobble(a, now) * steady + gauss(rand) * sigma(p.power) * steady,
    length: reach(R, a.kind, p.power) * (1 + gauss(rand) * FEEL.lengthJitter * steady),
    bend: (rand() * 2 - 1) * FEEL.bendMax * (0.3 + 0.7 * p.power),
  };
}
