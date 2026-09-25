// The desk lamp, and later the dawn. Light is multiplied over the whole desk,
// so it tints the paper, the wood and the ink alike. It never takes the page
// below readable: shadow is mood here, not fog of war.

import type { Pose } from "./camera";

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

// multiply stops: what fraction of each channel survives, by distance from the pool's centre
const LAMP: [number, RGB][] = [[0, [255, 248, 232]], [0.36, [246, 226, 192]], [0.66, [168, 128, 92]], [0.88, [62, 46, 35]], [1, [26, 20, 16]]];
const DAY: [number, RGB][] = [[0, [250, 251, 253]], [0.42, [242, 244, 247]], [0.7, [208, 212, 220]], [0.9, [150, 156, 168]], [1, [104, 110, 124]]];
const OFF: RGB = [16, 13, 12];

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
  return { x, y, h, cx, cy, r: h * (0.9 + dawn * 1.2), dawn, on };
}

/** Multiply this over the desk. */
export function lightGradient(g: CanvasRenderingContext2D, l: Lamp) {
  const grad = g.createRadialGradient(l.cx, l.cy, 0, l.cx, l.cy, l.r);
  for (let i = 0; i < LAMP.length; i++) {
    const lit = mix(LAMP[i][1], DAY[i][1], l.dawn);
    grad.addColorStop(LAMP[i][0], css(mix(OFF, lit, l.on)));
  }
  return grad;
}

/** The light's colour where there is no lamp (screen-edge fade, body background). */
export function farColour(l: Lamp) {
  return css(mix(OFF, mix(LAMP[LAMP.length - 1][1], DAY[DAY.length - 1][1], l.dawn), l.on));
}

/** Light falling on a point, 0..1: for sheen strength and the like. */
export function lightAt(l: Lamp, x: number, y: number) {
  const d = Math.hypot(x - l.cx, y - l.cy) / l.r;
  return l.on * Math.max(0, Math.min(1, 1 - Math.pow(Math.max(0, d - 0.3) / 0.6, 1.5)));
}
