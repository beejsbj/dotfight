// The desk lamp, and later the dawn. Light is multiplied over the whole desk,
// so it tints the paper, the wood and the ink alike. It never takes the page
// below readable: shadow is mood here, not fog of war. On screen it's painted
// into a tiny canvas the browser stretches over everything (a gradient needs
// no resolution), so moving the lamp costs almost nothing.

import type { Pose } from "./camera";
import { project, type View } from "./projection";
import { theme } from "./theme";

export interface Lamp {
  /** Where the lamp stands, in page units, and how high. */
  x: number;
  y: number;
  h: number;
  /** Centre and radius of the pool of light on the page. */
  cx: number;
  cy: number;
  r: number;
  /** 0 = tungsten lamplight, 1 = morning. */
  dawn: number;
  /** 0 = lamp off (the title), 1 = on. */
  on: number;
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Multiply stops (what fraction of each channel survives, by distance from the
// pool's centre) come from the theme: tungsten, a banker's lamp, a tube light, daylight.

/** Where the lamp sits for a camera pose: up-left of the focus on screen, high when you stand, low when you sit. */
export function lampFor(p: Pose, dawn: number, on: number): Lamp {
  const sitting = Math.min(1, p.tilt / 0.5);
  const zoom = Math.min(1, (p.m - 1) / 1.3);
  const low = Math.max(sitting, zoom * 0.7);
  const h = 1900 - low * 1000;
  // "up-left on screen" in page coordinates: rotate by the page's turn
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot);
  const ux = -0.5, uy = -0.86, reach = h * 0.42;
  const x = p.x + (c * ux - s * uy) * reach, y = p.y + (s * ux + c * uy) * reach;
  // the pool leans from under the lamp toward what you're looking at
  const cx = x + (p.x - x) * 0.72, cy = y + (p.y - y) * 0.72;
  return { x, y, h, cx, cy, r: h * (0.9 + dawn * 1.2) * theme.light.reach, dawn, on };
}

/** The light's colour where there is no lamp (screen-edge fade, body background). */
export function farColour(l: Lamp) {
  const { lamp, day, off } = theme.light;
  return css(mix(off, mix(lamp[lamp.length - 1][1], day[day.length - 1][1], l.dawn), l.on));
}

/** Light falling on a point, 0..1: for sheen strength and the like. */
export function lightAt(l: Lamp, x: number, y: number) {
  const d = Math.hypot(x - l.cx, y - l.cy) / l.r;
  return l.on * Math.max(0, Math.min(1, 1 - Math.pow(Math.max(0, d - 0.3) / 0.6, 1.5)));
}

/** Paint the lamp (multiply) into a small canvas that covers the screen. */
export function paintLight(g: CanvasRenderingContext2D, w: number, h: number, k: number, l: Lamp, v: View, tint: [number, number, number]) {
  const c = project(v, l.cx, l.cy);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const grad = g.createRadialGradient(c.x * k, c.y * k, 0, c.x * k, c.y * k, l.r * c.k * k);
  const tinted = (rgb: RGB): RGB => [rgb[0] * tint[0], rgb[1] * tint[1], rgb[2] * tint[2]];
  const { lamp, day, off } = theme.light;
  for (let i = 0; i < lamp.length; i++) {
    const lit = mix(lamp[i][1], day[i][1], l.dawn);
    grad.addColorStop(lamp[i][0], css(tinted(mix(off, lit, l.on))));
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/**
 * Paint the fog (normal blend) for a camera leaning in to aim: clear round
 * the pen, thickening with distance and toward the far edges of the desk into
 * the dark room, so distant camps are dim shapes in the gloom rather than gone. At dawn it
 * carries the window's light instead. Returns whether anything was painted.
 */
export function paintHaze(g: CanvasRenderingContext2D, w: number, h: number, k: number, v: View, lean: number, dawn: number, tip?: { x: number; y: number }) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  let any = false;
  // the room beyond the light, in the theme's colour: near, mid, far, and the edge
  const fog = theme.light.fog;
  const room = (k: number, a: number) => `rgba(${(fog[0] * k) | 0}, ${(fog[1] * k) | 0}, ${(fog[2] * k) | 0}, ${a})`;
  if (lean > 0.02 && tip) {
    any = true;
    const R = Math.max(w, h);
    // as thick as the old low camera had it: far camps sink into the dark room,
    // still there as shapes, but only the pool round the pen is really lit
    const f = lean * (1 - dawn * 0.6);
    const rad = g.createRadialGradient(tip.x * k, tip.y * k, R * 0.14, tip.x * k, tip.y * k, R * 0.85);
    rad.addColorStop(0, room(1, 0));
    rad.addColorStop(0.3, room(1, 0.3 * f));
    rad.addColorStop(0.6, room(0.75, 0.7 * f));
    rad.addColorStop(1, room(0.6, 0.92 * f));
    g.fillStyle = rad;
    g.fillRect(0, 0, w, h);
    // depth: the far edge of the desk dissolves into the dark room
    const depth = g.createLinearGradient(0, 0, 0, tip.y * k);
    depth.addColorStop(0, room(0.55, f));
    depth.addColorStop(0.18, room(0.55, 0.92 * f));
    depth.addColorStop(0.5, room(0.75, 0.45 * f));
    depth.addColorStop(0.85, room(1, 0.08 * f));
    depth.addColorStop(1, room(1, 0));
    g.fillStyle = depth;
    g.fillRect(0, 0, w, h);
    // and the sides, as the old tilted desk had them
    const ex = w * 0.12;
    for (const [x0, x1] of [[0, ex], [w, w - ex]]) {
      const side = g.createLinearGradient(x0, 0, x1, 0);
      side.addColorStop(0, room(0.55, 0.75 * f));
      side.addColorStop(1, room(0.55, 0));
      g.fillStyle = side;
      g.fillRect(Math.min(x0, x1), 0, ex, h);
    }
  }
  if (dawn > 0.01) {
    any = true;
    // four panes of morning laid across the desk, soft-edged by the low resolution
    const O = { x: 180, y: 120 }, u = { x: 820, y: 170 }, vv = { x: -300, y: 1180 };
    const gap = 0.035;
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const a0 = i * 0.5 + gap, a1 = i * 0.5 + 0.5 - gap, b0 = j * 0.5 + gap, b1 = j * 0.5 + 0.5 - gap;
      const P = (a: number, b: number) => project(v, O.x + u.x * a + vv.x * b, O.y + u.y * a + vv.y * b);
      const c = [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
      g.fillStyle = `rgba(255, 244, 222, ${0.3 * dawn})`;
      g.beginPath();
      c.forEach((q, n) => (n ? g.lineTo(q.x * k, q.y * k) : g.moveTo(q.x * k, q.y * k)));
      g.closePath();
      g.fill();
    }
  }
  return any;
}
