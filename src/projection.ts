// Where the page is on screen. The desk is a plane seen by a camera that can
// sit down at it: the stage canvas draws the plane flat (2D camera: focus,
// zoom, rotation), and CSS tilts that canvas back in perspective. This module
// is the single source of truth for both directions, so touches, the standing
// pen, and the CSS transform always agree. Pure: no DOM.

import type { Pt } from "./game";

export interface View {
  /** Stage canvas placement: its local origin sits at screen (-ox, -oy). */
  ox: number;
  oy: number;
  /** World point in focus, and where it appears on screen (the pivot). */
  x: number;
  y: number;
  px: number;
  py: number;
  /** CSS px per world unit on the plane at the pivot. */
  z: number;
  /** Page rotation on screen, radians. */
  rot: number;
  /** How far the desk is tilted away from you, radians. 0 = looking straight down. */
  tilt: number;
  /** Perspective distance, CSS px. */
  d: number;
}

export interface Projected extends Pt {
  /** CSS px per world unit at this point (perspective shrinks far things). */
  k: number;
}

/** World point to stage-canvas local CSS px (before the tilt). */
export function toLocal(v: View, x: number, y: number): Pt {
  const dx = x - v.x, dy = y - v.y, c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.px + v.ox + v.z * (c * dx - s * dy), y: v.py + v.oy + v.z * (s * dx + c * dy) };
}

/** Stage-canvas local CSS px back to the world. */
export function fromLocal(v: View, ex: number, ey: number): Pt {
  const u = (ex - v.px - v.ox) / v.z, w = (ey - v.py - v.oy) / v.z, c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.x + c * u + s * w, y: v.y - s * u + c * w };
}

/**
 * A world point, `h` world units above the page, to the screen. The same maths
 * as CSS `perspective(d) rotateX(tilt)` about the pivot.
 */
export function project(v: View, x: number, y: number, h = 0): Projected {
  const l = toLocal(v, x, y);
  const u = l.x - v.px - v.ox, w0 = l.y - v.py - v.oy, hz = h * v.z;
  const c = Math.cos(v.tilt), s = Math.sin(v.tilt);
  const yy = w0 * c - hz * s, zz = w0 * s + hz * c;
  const w = Math.max(1e-3, 1 - zz / v.d);
  return { x: v.px + u / w, y: v.py + yy / w, k: v.z / w };
}

/** A screen point back onto the page plane, or null if it's above the horizon. */
export function unproject(v: View, sx: number, sy: number): Pt | null {
  const X = sx - v.px, Y = sy - v.py, c = Math.cos(v.tilt), s = Math.sin(v.tilt);
  const den = c + (Y * s) / v.d;
  if (den <= 1e-6) return null;
  const w0 = Y / den;
  const w = 1 - (w0 * s) / v.d;
  if (w <= 1e-6) return null;
  return fromLocal(v, X * w + v.px + v.ox, w0 + v.py + v.oy);
}

/** The CSS that tilts the stage canvas to match `project`. */
export function stageCss(v: View) {
  const flat = Math.abs(v.tilt) < 1e-4;
  return {
    transform: flat ? "none" : `perspective(${v.d.toFixed(2)}px) rotateX(${v.tilt.toFixed(5)}rad)`,
    origin: `${(v.px + v.ox).toFixed(2)}px ${(v.py + v.oy).toFixed(2)}px`,
  };
}

// --- layers the GPU moves ----------------------------------------------------
// A canvas drawn in page space (the sheet, the desk) is never redrawn when the
// camera moves: the compositor carries it there with one CSS matrix3d.

type M4 = number[]; // column-major, CSS matrix3d order

function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/**
 * The matrix that places a page-space canvas on screen: canvas pixel (u, w)
 * is page point (u / s + offX, w / s + offY). Use with transform-origin 0 0
 * on an element at the screen's top-left, CSS size = canvas pixel size.
 */
export function layerMatrix(v: View, s: number, offX = 0, offY = 0): M4 {
  const c = Math.cos(v.rot) * v.z / s, sn = Math.sin(v.rot) * v.z / s;
  const dx = offX - v.x, dy = offY - v.y;
  const A: M4 = [c, sn, 0, 0, -sn, c, 0, 0, 0, 0, 1, 0,
    v.px + v.z * (Math.cos(v.rot) * dx - Math.sin(v.rot) * dy), v.py + v.z * (Math.sin(v.rot) * dx + Math.cos(v.rot) * dy), 0, 1];
  if (Math.abs(v.tilt) < 1e-5) return A;
  const ct = Math.cos(v.tilt), st = Math.sin(v.tilt);
  const T = (x: number, y: number): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1];
  const R: M4 = [1, 0, 0, 0, 0, ct, st, 0, 0, -st, ct, 0, 0, 0, 0, 1];
  const P: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / v.d, 0, 0, 0, 1];
  return mul(T(v.px, v.py), mul(P, mul(R, mul(T(-v.px, -v.py), A))));
}

export const cssMatrix = (m: M4) => `matrix3d(${m.map((x) => +x.toFixed(9)).join(",")})`;

/** Apply a layer matrix to a canvas pixel (for tests and hit-checks). */
export function applyMatrix(m: M4, u: number, w: number) {
  const x = m[0] * u + m[4] * w + m[12], y = m[1] * u + m[5] * w + m[13], q = m[3] * u + m[7] * w + m[15];
  return { x: x / q, y: y / q };
}

/**
 * Which way a drag on screen points on the page, measured at `at`: the world
 * direction whose on-screen image, starting at `at`, runs along (dx, dy).
 * This keeps "the pen points where your thumb says" true under perspective.
 */
export function screenDirToWorld(v: View, at: Pt, dx: number, dy: number): number {
  const p = project(v, at.x, at.y);
  const l = Math.hypot(dx, dy) || 1;
  const step = 12; // px: small enough to be local, large enough to be stable
  const q = unproject(v, p.x + (dx / l) * step, p.y + (dy / l) * step);
  if (!q) return Math.atan2(dy, dx) - v.rot;
  return Math.atan2(q.y - at.y, q.x - at.x);
}
