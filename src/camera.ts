// The eye at the desk. Standing up it looks straight down at the whole page;
// sitting down it drops low behind a soldier and the page tilts away. Every
// parameter eases toward a target, so a camera move is never a cut.

import type { Pt } from "./game";
import { project, unproject, type Projected, type View } from "./projection";
import { RULES } from "./rules";

export interface Pose {
  x: number;
  y: number;
  /** Zoom as a multiple of the whole-page fit. */
  m: number;
  rot: number;
  tilt: number;
  /** Where the focus sits on screen, as a fraction of the screen height. */
  fy: number;
}

// how quickly each part of the pose catches up (per second)
const RATE = { pos: 6.5, m: 5.5, rot: 4.2, tilt: 4.5, fy: 5 };

export class Camera {
  W = 1;
  H = 1;
  /** Screen space the HUD leaves for the page at full view. */
  top = 0;
  bottom = 0;
  /** Stage canvas overhang, so a tilted desk still fills the screen. */
  ox = 0;
  oy = 0;
  ob = 0;
  /** Motion scale: 0 turns the tilt off entirely ("sit up straight"). */
  tiltScale = 1;
  cur: Pose = { x: RULES.pageW / 2, y: RULES.pageH / 2, m: 1, rot: 0, tilt: 0, fy: 0.5 };
  tgt: Pose = { ...this.cur };
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeSeed = 0;

  resize(W: number, H: number, top: number, bottom: number) {
    this.W = W;
    this.H = H;
    this.top = top;
    this.bottom = bottom;
    this.ox = Math.round(W * 0.2);
    this.oy = Math.round(H * 0.24);
    this.ob = Math.round(H * 0.04);
  }

  /** CSS px per world unit when the whole page fits between the HUD bars. */
  get fitZ() {
    const vh = Math.max(100, this.H - this.top - this.bottom);
    return Math.min(this.W / RULES.pageW, vh / RULES.pageH) * 0.95;
  }
  get fitFy() {
    return (this.top + (this.H - this.top - this.bottom) / 2) / this.H;
  }
  get d() {
    return Math.max(this.H, this.W) * 1.05;
  }

  view(p: Pose = this.cur): View {
    let px = this.W / 2, py = p.fy * this.H;
    if (this.shakeAmp > 0.01) {
      const t = this.shakeT * 0.06 + this.shakeSeed;
      px += Math.sin(t * 7.1) * this.shakeAmp;
      py += Math.cos(t * 9.3) * this.shakeAmp * 0.8;
    }
    return { ox: this.ox, oy: this.oy, x: p.x, y: p.y, px, py, z: this.fitZ * p.m, rot: p.rot, tilt: p.tilt * this.tiltScale, d: this.d };
  }

  // --- where to look -------------------------------------------------------

  /** Stand up: the whole page, flat. */
  overview(rot = this.tgt.rot) {
    // the same facing, reached the short way round from wherever we are
    const TAU = Math.PI * 2;
    const r = rot + Math.round((this.cur.rot - rot) / TAU) * TAU;
    this.tgt = { x: RULES.pageW / 2, y: RULES.pageH / 2, m: 1, rot: r, tilt: 0, fy: this.fitFy };
  }
  /** Sit down behind a soldier: low, close, the page running away from you. */
  sit(at: Pt, m = 2.3, tilt = 0.62, fy = 0.66) {
    this.tgt = { ...this.tgt, x: at.x, y: at.y, m, tilt, fy };
  }
  /** Chase something moving across the page (the head of the ink). */
  chase(at: Pt, m = 1.55, tilt = 0.3, fy = 0.55) {
    this.tgt = { ...this.tgt, x: at.x, y: at.y, m, tilt, fy };
  }
  /** Spin the sheet round to face the other side of the desk. Always the same way round. */
  turnTo(rot: number) {
    // unwrap so each hand-over turns the page clockwise
    let r = rot;
    while (r < this.tgt.rot - 1e-6) r += Math.PI * 2;
    while (r - this.tgt.rot > Math.PI * 2 - 1e-6) r -= Math.PI * 2;
    this.tgt.rot = r;
  }
  snap() {
    this.cur = { ...this.tgt };
  }
  shake(amp: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeSeed = Math.random() * 100;
  }

  get settled() {
    const a = this.cur, b = this.tgt;
    // close enough that the last step is under half a pixel: snap it
    return Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6 && Math.abs(a.m - b.m) < 2e-3 &&
      Math.abs(a.rot - b.rot) < 1e-3 && Math.abs(a.tilt - b.tilt) < 1e-3 && Math.abs(a.fy - b.fy) < 1e-3 && this.shakeAmp < 0.05;
  }

  /** Ease toward the target. Returns true while anything is still moving. */
  tick(dt: number) {
    if (this.settled) {
      // keep the page's turn in [0, 2pi) so it never winds up over a long war
      const TAU = Math.PI * 2, k = Math.floor(this.tgt.rot / TAU) * TAU;
      this.tgt.rot -= k;
      this.cur = { ...this.tgt };
      return false;
    }
    const s = dt / 1000;
    const k = (r: number) => 1 - Math.exp(-r * s);
    const a = this.cur, b = this.tgt;
    a.x += (b.x - a.x) * k(RATE.pos);
    a.y += (b.y - a.y) * k(RATE.pos);
    a.m += (b.m - a.m) * k(RATE.m);
    a.rot += (b.rot - a.rot) * k(RATE.rot);
    a.tilt += (b.tilt - a.tilt) * k(RATE.tilt);
    a.fy += (b.fy - a.fy) * k(RATE.fy);
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-s * 14);
    return true;
  }

  // --- the hand on the camera --------------------------------------------

  toWorld(sx: number, sy: number): Pt | null {
    return unproject(this.view(), sx, sy);
  }
  toScreen(x: number, y: number, h = 0): Projected {
    return project(this.view(), x, y, h);
  }
  /** Pan by a screen delta (standing up only). */
  pan(dx: number, dy: number) {
    const z = this.fitZ * this.cur.m, c = Math.cos(this.cur.rot), s = Math.sin(this.cur.rot);
    this.cur.x -= (c * dx + s * dy) / z;
    this.cur.y -= (-s * dx + c * dy) / z;
    this.clamp();
    this.tgt = { ...this.tgt, x: this.cur.x, y: this.cur.y };
  }
  /** Zoom by `f` keeping the page point under (sx, sy) where it is. */
  zoomAt(sx: number, sy: number, f: number) {
    const before = this.toWorld(sx, sy);
    this.cur.m = Math.min(4, Math.max(1, this.cur.m * f));
    const after = this.toWorld(sx, sy);
    if (before && after) { this.cur.x += before.x - after.x; this.cur.y += before.y - after.y; }
    this.clamp();
    this.tgt = { ...this.tgt, x: this.cur.x, y: this.cur.y, m: this.cur.m };
  }

  /** Keep the page on screen when standing up; centre it when it fits. */
  clamp() {
    const p = this.cur;
    if (p.tilt > 1e-3) return;
    const z = this.fitZ * p.m, c = Math.abs(Math.cos(p.rot)), s = Math.abs(Math.sin(p.rot));
    const vw = this.W / z, vh = (this.H - this.top - this.bottom) / z;
    // the view's half-extent along page axes (rotation-aware bounding box)
    const hw = (c * vw + s * vh) / 2, hh = (s * vw + c * vh) / 2;
    const pad = 30;
    const cl = (v: number, half: number, size: number) =>
      half * 2 >= size + pad * 2 ? size / 2 : Math.min(size + pad - half, Math.max(half - pad, v));
    p.x = cl(p.x, hw, RULES.pageW);
    p.y = cl(p.y, hh, RULES.pageH);
  }
}
