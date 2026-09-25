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
