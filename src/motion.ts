// Aiming with the phone itself: an experiment, off by default (BJS-459).
// Three levels, each optional, each on top of touch aiming:
//   nudge:  tilting the phone while you pull fine-tunes the angle and leans the pen
//   steady: the hand's real tremor scales the charged-flick wobble
//   gun:    point the phone to aim, flick the wrist to fire
// Sensors only ever produce a flick's *inputs* (angle, power, how steady the
// hand was). The flick that comes out is recorded like any touch flick, so
// replays and room links never see a sensor. Pure: no DOM.

export type Level = "nudge" | "steady" | "gun";
export const LEVELS: Level[] = ["nudge", "steady", "gun"];
/** Sensitivity presets: soft, normal, keen. */
export const SENS = [0.5, 1, 2] as const;

/** A `deviceorientation` reading, degrees (W3C: Z-X'-Y'' Euler angles). */
export interface Orientation { alpha: number; beta: number; gamma: number }
/** A `devicemotion` reading: rotation rate in deg/s, acceleration without gravity in m/s². */
export interface Motion { rate?: { alpha: number; beta: number; gamma: number } | null; accel?: { x: number; y: number; z: number } | null }

import type { Aim as Pull } from "./flick";
import type { Kind } from "./game";
import { FEEL } from "./rules";

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** An angle folded into (-π, π]. */
export const wrap = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * How the phone is held, free of Euler-angle gimbal lock:
 *  heading: which way the "barrel" points across the room (radians, counter-clockwise from above).
 *           The barrel is the top edge and the back of the phone together, so it points the
 *           same way whether you hold the phone flat like a remote or upright like a camera.
 *  pitch:   how far the barrel points up (+) or down (-).
 *  roll:    how far the right edge has dipped (+) below level, like a steering wheel.
 */
export function pose(o: Orientation) {
  const a = o.alpha * RAD, b = o.beta * RAD, g = o.gamma * RAD;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  // device axes in the earth frame (columns of Rz(α)·Rx(β)·Ry(γ))
  const xz = -cB * sG;
  const y = [-sA * cB, cA * cB, sB];
  const z = [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG];
  const bx = y[0] - z[0], by = y[1] - z[1], bz = y[2] - z[2];
  return {
    heading: Math.atan2(by, bx),
    pitch: Math.atan2(bz, Math.hypot(bx, by)),
    roll: Math.asin(clamp(-xz, -1, 1)),
  };
}
export type Pose = ReturnType<typeof pose>;

// --- level 1: the nudge ------------------------------------------------------------

export const NUDGE = {
  max: 7 * RAD, // most the phone can turn the aim, at normal sensitivity
  soft: 14 * RAD, // phone roll that gives ~76% of it (tanh knee)
  lean: 0.08, // most the pen leans sideways, radians: a hint, so it still reads as pointing where you aim
};

/**
 * Tilt nudge, relative to how the phone was held when the pull began, so any
 * comfortable grip is neutral. Bounded and smooth: the thumb sets the aim and
 * the tilt only trims it. Tilt right (right edge down) and the aim swings
 * clockwise on the page, and the pen leans that way too.
 */
export function nudge(from: Pose, now: Pose, sens = 1) {
  const d = now.roll - from.roll;
  return {
    angle: NUDGE.max * sens * Math.tanh(d / NUDGE.soft),
    side: clamp(d, -NUDGE.lean, NUDGE.lean),
  };
}

// --- level 2: the steady hand ---------------------------------------------------------

export const STEADY = {
  tau: 250, // ms: how quickly the tremor estimate follows the hand
  ref: 6, // deg/s of tremor that gives today's wobble, at normal sensitivity
  min: 0.25, // a phone flat on the table still wobbles a little: it's a pen on its tip
  max: 2.5,
};

/**
 * The hand's tremor, from the gyro: a smoothed rotation speed in deg/s.
 * `factor` scales the charged-flick wobble: under 1 for a steady hand, over 1 for a shaky one.
 */
export class Steadiness {
  tremor = STEADY.ref; // unknown until measured: start at "ordinary hand"
  private t = -1;
  feed(m: Motion, t: number) {
    const w = speed(m);
    if (w === undefined) return;
    const dt = this.t < 0 ? 16 : clamp(t - this.t, 0, 200);
    this.t = t;
    const k = 1 - Math.exp(-dt / STEADY.tau);
    this.tremor += (w - this.tremor) * k;
  }
  factor(sens = 1) {
    return clamp(STEADY.min + (this.tremor / STEADY.ref) * sens * (1 - STEADY.min), STEADY.min, STEADY.max);
  }
}

/** Rotation speed, deg/s; undefined when the phone has no gyro. */
function speed(m: Motion) {
  const r = m.rate;
  if (!r || r.alpha == null || r.beta == null || r.gamma == null) return undefined;
  return Math.hypot(r.alpha, r.beta, r.gamma);
}

// --- level 3: the gun hold ("pen falcon") ---------------------------------------------

export const GUN = {
  still: 45, // deg/s: slower than this counts as holding still
  armMs: 320, // hold still this long and the sight closes: armed
  fire: 220, // deg/s of wrist snap that fires, at normal sensitivity
  full: 3, // a snap this many times the trigger is full power
  accel: 14, // m/s²: the same, from a shake, for phones without a gyro
  burstMs: 150, // how long a snap is measured for its peak
  graceMs: 150, // a snap may begin this long after the sight was last closed
  lower: 40 * RAD, // tip the barrel this far below where you held it up, and the hold ends
  lowerMs: 280,
  roll: 0.6, // twisting the wrist aims too, a little slower than pointing
  smooth: 70, // ms: the sight follows the phone through a little damping
};

export type GunEvent = { t: "fire"; delta: number; power: number } | { t: "lowered" };

/**
 * Point the phone to aim; hold still to arm; snap the wrist (or shake) to fire.
 * `delta` is the aim, as an angle on the page relative to straight ahead when
 * the hold began (clockwise positive, like the page). Feed it every sensor
 * reading with a clock in ms.
 */
export class GunHold {
  delta = 0; // smoothed, what the sight shows
  armed = 0; // 0..1: the sight closing as you hold still
  private raw = 0;
  private zero: Pose | null = null;
  private high = -Infinity; // the highest the barrel has been held
  private to = -1;
  private tm = -1;
  private stillAim = 0; // the aim just before any fast movement began
  private burst: { t0: number; peak: number; aim: number } | null = null;
  private lowSince = -1;
  private armedT = -Infinity; // the last moment the sight was fully closed
  private pending: GunEvent | null = null;
  private over = false;

  constructor(public sens = 1) {}

  get ready() { return this.zero !== null; }

  /** Re-centre: wherever the phone points now is straight ahead. */
  centre(o: Orientation) {
    this.zero = pose(o);
    this.high = this.zero.pitch;
    this.raw = this.delta = this.stillAim = 0;
    this.armed = 0;
    this.burst = null;
    this.lowSince = -1;
    this.armedT = -Infinity;
    this.pending = null;
    this.over = false;
  }

  /** The next thing that happened (a shot or a lowered phone), once. */
  take(): GunEvent | null {
    const e = this.pending;
    this.pending = null;
    return e;
  }

  private end(e: GunEvent) {
    this.pending = e;
    this.over = true;
    this.burst = null;
  }

  feed(o: Orientation | null, m: Motion | null, t: number) {
    if (!this.zero) { if (o) this.centre(o); return; }
    if (this.over) return; // it fired or was lowered: centre() starts another
    // orientation and motion arrive as separate events: each keeps its own clock
    if (o) {
      const dt = this.to < 0 ? 16 : clamp(t - this.to, 0, 200);
      this.to = t;
      const p = pose(o);
      const turn = -wrap(p.heading - this.zero.heading) + GUN.roll * (p.roll - this.zero.roll);
      this.raw = clamp(turn * this.sens, -2.6, 2.6);
      this.delta += (this.raw - this.delta) * (1 - Math.exp(-dt / GUN.smooth));
      // lowering: slow and sustained, so a snap of the wrist doesn't count
      this.high = Math.max(this.high, p.pitch);
      if (p.pitch < this.high - GUN.lower && !this.burst) {
        if (this.lowSince < 0) this.lowSince = t;
        if (t - this.lowSince >= GUN.lowerMs) { this.end({ t: "lowered" }); return; }
      } else this.lowSince = -1;
    }
    if (!m) return;
    const dt = this.tm < 0 ? 16 : clamp(t - this.tm, 0, 200);
    this.tm = t;
    const w = speed(m);
    const a = m.accel ? Math.hypot(m.accel.x ?? 0, m.accel.y ?? 0, m.accel.z ?? 0) : 0;
    const snap = Math.max(w === undefined ? 0 : w / (GUN.fire / this.sens), a / (GUN.accel / this.sens));
    if (this.burst) {
      this.burst.peak = Math.max(this.burst.peak, snap);
      if (t - this.burst.t0 >= GUN.burstMs || snap < 0.5) {
        const power = clamp(0.2 + 0.8 * (this.burst.peak - 1) / (GUN.full - 1), 0.2, 1);
        this.end({ t: "fire", delta: this.burst.aim, power });
      }
      return;
    }
    // armed, or was a moment ago: a snap starts slower than it peaks
    if (snap >= 1 && (this.armed >= 1 || t - this.armedT <= GUN.graceMs)) {
      // the aim you held, not wherever the snap itself swung the phone
      this.burst = { t0: t, peak: snap, aim: this.stillAim };
      return;
    }
    const still = (w ?? 0) < GUN.still && a < GUN.accel * 0.35;
    if (still) {
      this.armed = Math.min(1, this.armed + dt / GUN.armMs);
      if (this.armed >= 1) this.armedT = t;
      this.stillAim = this.delta;
    } else {
      if (this.armed >= 1) this.armedT = t; // the grace runs from the first moving sample
      this.armed = Math.max(0, this.armed - dt / 200);
    }
  }
}

/** The pen, tipped sideways by `side` radians about its own lean: the nudge you can see. */
export function tip<P extends { ax: number; ay: number; az: number }>(p: P, toward: number, side: number): P {
  if (!side) return p;
  const nx = -Math.sin(toward), ny = Math.cos(toward); // the page's "right" of the aim
  const c = Math.cos(side), s = Math.sin(side);
  // rotate the pen's axis toward the page's right, about the aim direction
  const ax = p.ax + nx * s * p.az, ay = p.ay + ny * s * p.az, az = p.az * c;
  const l = Math.hypot(ax, ay, az) || 1;
  return { ...p, ax: ax / l, ay: ay / l, az: az / l };
}

/**
 * The pull-back a gun-hold shot stands for: pointing `angle` (world) with
 * `power`. It goes through `release()` like a thumb's pull, so a shot from the
 * phone gets the same hidden release error, and is recorded the same way.
 */
export function gunPull(soldierId: number, kind: Kind, angle: number, power: number, now: number, steady = 1): Pull {
  const d = FEEL.minPullPx + clamp(power, 0, 1) * (FEEL.maxPullPx - FEEL.minPullPx);
  return { soldierId, kind, ax: 0, ay: 0, x: -Math.cos(angle) * d, y: -Math.sin(angle) * d, t0: now, charged: true, steady };
}
