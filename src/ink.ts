// Ballpoint and pencil marks. Everything is seeded so a mark redraws the same
// way every frame: the page is a record, not an animation. The one exception
// is the line boil (boil.ts): a few numbered redrawings of the same shape.

import { rng, type Pt } from "./game";

export const INK = {
  paper: "#f3efe4",
  grid: "rgba(84, 128, 168, 0.30)", // squared maths paper
  gridBold: "rgba(84, 128, 168, 0.42)",
  margin: "rgba(200, 64, 64, 0.5)",
  pencil: "rgba(58, 56, 54, 0.62)",
  pens: ["#1b3899", "#c01e2a"] as const, // blue ballpoint, red ballpoint
  names: ["Blue", "Red"] as const,
};

type Ctx = CanvasRenderingContext2D;

// Smooth 1-D noise from a seed: sum of a few sines with random phase.
function wave(seed: number) {
  const r = rng(seed);
  const f = [r() * 2 + 1, r() * 5 + 3, r() * 11 + 7];
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const amp = [1, 0.45, 0.18];
  return (t: number) => (Math.sin(t * f[0] + ph[0]) * amp[0] + Math.sin(t * f[1] + ph[1]) * amp[1] + Math.sin(t * f[2] + ph[2]) * amp[2]) / 1.63;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Line boil: the same shape drawn again by the same hand. How far each
// redrawing strays from the first, per kind of mark, in units of the seeded
// random values the drawing is built from. Small on purpose: the shape stays,
// only the line that forms it shifts.
export const REDRAW = {
  dot: 0.5, // a soldier's lumps and core
  circle: 0.02, // a camp's start, tilt and squash
  ring: 0.012, // and its radius, as a fraction of it
  cross: 0.2,
  flick: 0.3, // a line's sideways jitter, as a fraction of its width
  lap: 0.04, // a camp drawn round and round: how far one lap strays from the next, as a fraction of its radius
  scribble: 0.24, // a dot scribbled round and round: how far its loop wanders, as a fraction of its size
};

/**
 * The seeded values for redrawing `wob` of a shape: the first drawing's
 * values, each nudged by up to `amt / 2`. Drawing 0 is the first drawing,
 * exactly, so the page and the boil agree on what a thing looks like.
 */
export function redrawn(seed: number, wob: number, amt: number) {
  const r = rng(seed);
  if (!wob) return r;
  const j = rng((seed ^ Math.imul(wob, 0x9e3779b1)) >>> 0);
  return () => r() + (j() - 0.5) * amt;
}

// A hand-drawn circle: never quite round, never quite closed. `upTo` (0..1)
// draws it on: the first loop, then a lighter second pass overlapping its end.
// Every seeded value is taken before anything is skipped, so a half-drawn
// circle is exactly the start of the finished one.
export function inkCircle(ctx: Ctx, cx: number, cy: number, r: number, color: string, seed: number, width = 2.6, passes = 2, upTo = 1, wob = 0) {
  const rand = redrawn(seed, wob, REDRAW.circle);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let p = 0; p < passes; p++) {
    const w = wave(seed + p * 31);
    const wb = wob ? wave(seed * 3 + wob * 101 + p) : null;
    const start = rand() * Math.PI * 2;
    const sweep = Math.PI * 2 * (1.03 + rand() * 0.1); // overshoot
    const squash = 1 + (rand() - 0.5) * 0.08;
    const tilt = rand() * Math.PI;
    const done = upTo >= 1 ? 1 : p === 0 ? clamp01(upTo / 0.72) : clamp01((upTo - 0.62) / 0.38);
    if (done <= 0) continue;
    const steps = 64;
    const at = (t: number): [number, number] => {
      const a = start + sweep * t;
      const rr = r * (1 + w(t * 2.2) * 0.035 + p * 0.025 + (wb ? wb(t * 3.1) * REDRAW.ring : 0));
      const x = Math.cos(a) * rr * squash, y = Math.sin(a) * rr / squash;
      return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
    };
    ctx.globalAlpha = p === 0 ? 0.92 : 0.55;
    ctx.lineWidth = width * (p === 0 ? 1 : 0.7);
    ctx.beginPath();
    const last = Math.floor(steps * done);
    for (let i = 0; i <= last; i++) {
      const [x, y] = at(i / steps);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (last < steps) ctx.lineTo(...at(done));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A hand-drawn polygon (a prism, a cushion): each side a slightly bowed
// stroke, corners a touch off, the last side overshooting the start the way a
// hand closes a shape. `upTo` (0..1) draws it on, side by side.
export function inkPolygon(ctx: Ctx, corners: Pt[], color: string, seed: number, width = 2.6, passes = 2, upTo = 1) {
  if (upTo <= 0 || corners.length < 3) return;
  const rand = rng(seed);
  const n = corners.length;
  let cx = 0, cy = 0;
  for (const c of corners) { cx += c.x / n; cy += c.y / n; }
  const size = Math.max(...corners.map((c) => Math.hypot(c.x - cx, c.y - cy)));
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let p = 0; p < passes; p++) {
    const w = wave(seed + p * 31);
    const off = corners.map(() => ({ x: (rand() - 0.5) * size * 0.05, y: (rand() - 0.5) * size * 0.05 }));
    const pts = corners.map((c, i) => ({ x: c.x + off[i].x, y: c.y + off[i].y }));
    const over = 0.12 + rand() * 0.1; // the closing overshoot, as a share of a side
    const total = n + over;
    const done = upTo >= 1 ? 1 : p === 0 ? clamp01(upTo / 0.75) : clamp01((upTo - 0.6) / 0.4);
    if (done <= 0) continue;
    const at = (u: number) => {
      const i = Math.floor(u) % n, f = u - Math.floor(u);
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const bow = Math.sin(f * Math.PI) * w(u * 1.7) * size * 0.035;
      return { x: a.x + dx * f - (dy / l) * bow, y: a.y + dy * f + (dx / l) * bow };
    };
    ctx.globalAlpha = p === 0 ? 0.92 : 0.5;
    ctx.lineWidth = width * (p === 0 ? 1 : 0.7);
    ctx.beginPath();
    const steps = Math.ceil(total * 16), last = total * done;
    for (let k = 0; k <= steps; k++) {
      const u = Math.min(last, (k / steps) * total);
      const q = at(u);
      if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      if (u >= last) break;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A stretch of a path traced in a few bands, each band one stroke: `bands`
// is [from, to, alpha, width] in the path's own units.
// Vertices sit on a fixed grid along the path (plus the band's own ends), so
// the same stretch is always the same polyline however the bands are cut.
function tracePath(ctx: Ctx, at: (t: number) => [number, number], bands: [number, number, number, number][], stepsPerUnit: number) {
  for (const [t0, t1, alpha, width] of bands) {
    if (t1 <= t0 || alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...at(t0));
    for (let k = Math.floor(t0 * stepsPerUnit) + 1; k < t1 * stepsPerUnit; k++) ctx.lineTo(...at(k / stepsPerUnit));
    ctx.lineTo(...at(t1));
    ctx.stroke();
  }
}

/**
 * The path of a pen going round a camp without lifting: where it is `t` turns
 * in. The circle's shape is the camp's own (the same start, squash and tilt as
 * its settled drawing); its radius drifts with the turns, never repeating, so
 * no two laps are the same circle.
 */
export function lapPath(cx: number, cy: number, r: number, seed: number) {
  const rand = rng(seed);
  const start = rand() * Math.PI * 2;
  rand(); // the settled circle's overshoot: a pen going round doesn't have one
  const squash = 1 + (rand() - 0.5) * 0.08;
  const tilt = rand() * Math.PI;
  const w = wave(seed), drift = wave(seed + 999);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // the pen passes the same grid points tick after tick: work each out once
  const memo = new Map<number, [number, number]>();
  return (t: number): [number, number] => {
    let p = memo.get(t);
    if (p) return p;
    const a = start + Math.PI * 2 * t;
    const rr = r * (1 + w(t * 2.2) * 0.035 + drift(t * 0.83) * REDRAW.lap);
    const x = Math.cos(a) * rr * squash, y = Math.sin(a) * rr / squash;
    p = [cx + x * ct - y * st, cy + x * st + y * ct];
    if (memo.size > 600) memo.clear();
    memo.set(t, p);
    return p;
  };
}

/** How far round, behind and ahead of the head, a lap's look changes as the head moves on (turns). */
export const LAP_CHANGES = { behind: 0.1, ahead: 0.02 };

/**
 * A camp being drawn round and round, the pen's head `u` turns in. What shows
 * is the last two laps: the newest full, and wet at the head, and the one
 * before it faint beneath, the way a second pass sits under a circle drawn by
 * hand, overtaken as the head comes round. Everything that changes as the head moves on is within
 * LAP_CHANGES of it; `near` (turns behind, ahead) traces only that much.
 */
export function inkLaps(ctx: Ctx, at: (t: number) => [number, number], u: number, color: string, width = 2.8, near?: [number, number]) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const W = width;
  let bands: [number, number, number, number][] = [
    // the lap before, a fainter second pass beneath the whole ring
    [u - 2, u - 1, 0.45, W * 0.7],
    // the newest lap, settled
    [u - 1, u - LAP_CHANGES.behind, 0.92, W],
    // wet at the head: darker and bolder, still sitting on the paper; its
    // round end is the ball of the pen
    [u - LAP_CHANGES.behind, u, 1, W * 1.35],
  ];
  if (near) {
    // only the stretches of each lap within reach of the head's angle
    const spans = [0, 1, 2].map((k) => [u - k - near[0], u - k + near[1]]);
    bands = bands.flatMap(([a, b, al, wd]) => spans.flatMap(([s0, s1]): [number, number, number, number][] => {
      const x = Math.max(a, s0), y = Math.min(b, s1);
      return y > x ? [[x, y, al, wd]] : [];
    }));
  }
  tracePath(ctx, at, bands, 64);
  ctx.globalAlpha = 1;
}

/**
 * A soldier's dot being scribbled: a pen going round and round in a tight
 * loop, the stroke as wide as the loop, so the loop is the dot. The loop
 * wanders a little lap to lap, and the wet stretch at the head is bolder, so
 * the dot's edge shifts where the pen is, all the way round. `u` is in laps;
 * the wandering repeats every `period` laps, so a few frames can loop.
 */
export function inkScribbledDot(ctx: Ctx, x: number, y: number, r: number, color: string, seed: number, u: number, period = 2) {
  const rand = rng(seed ^ 0x5c1b);
  const a0 = rand() * Math.PI * 2;
  const ph = [rand(), rand(), rand(), rand()].map((v) => v * Math.PI * 2);
  const k = (Math.PI * 2) / period; // one wander a period
  const at = (t: number): [number, number] => {
    const rho = r * 0.5 * (1 + REDRAW.scribble * (0.7 * Math.sin(k * t + ph[0]) + 0.3 * Math.sin(3 * k * t + ph[1])));
    const ox = r * REDRAW.scribble * 0.55 * Math.cos(k * t + ph[2]), oy = r * REDRAW.scribble * 0.55 * Math.sin(k * t + ph[3]);
    const a = a0 + Math.PI * 2 * t;
    return [x + ox + Math.cos(a) * rho, y + oy + Math.sin(a) * rho];
  };
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  tracePath(ctx, at, [
    // the lap before, under it
    [u - 1.6, u - 0.9, 0.5, r * 0.9],
    // the last lap
    [u - 0.9, u - 0.2, 0.85, r * 0.95],
    // wet at the head, bolder: this is where the edge moves
    [u - 0.2, u, 0.95, r * 1.12],
  ], 24);
  // pressed hardest in the middle, as a ballpoint dot is
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A soldier: a pressed ballpoint dot, slightly lumpy.
// `grow` (0..1) jots it: the ball presses in and spreads.
export function inkDot(ctx: Ctx, x: number, y: number, r: number, color: string, seed: number, alpha = 1, grow = 1, wob = 0) {
  if (grow <= 0) return;
  const rand = redrawn(seed, wob, REDRAW.dot);
  if (grow < 1) {
    const e = 1 - Math.pow(1 - grow, 3);
    r *= 0.35 + 0.65 * e;
    alpha *= 0.5 + 0.5 * e;
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9 * alpha;
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.82 + rand() * 0.3);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // the pen goes round twice: a darker core
  ctx.globalAlpha = 0.5 * alpha;
  ctx.beginPath();
  ctx.arc(x + (rand() - 0.5) * r * 0.3, y + (rand() - 0.5) * r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A cross: two quick strokes. Kills are big and hard; "moved" is small and light.
// `upTo` (0..1) draws it the way a hand does: one stroke, a beat, the other.
export function inkCross(ctx: Ctx, x: number, y: number, size: number, color: string, seed: number, width = 2.4, alpha = 1, upTo = 1, wob = 0) {
  if (upTo <= 0) return;
  const rand = redrawn(seed, wob, REDRAW.cross);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.9 * alpha;
  const rot = (rand() - 0.5) * 0.5;
  let k = 0;
  for (const base of [Math.PI / 4, -Math.PI / 4]) {
    const a = base + rot + (rand() - 0.5) * 0.2;
    const l1 = size * (0.8 + rand() * 0.4), l2 = size * (0.8 + rand() * 0.4);
    const bow = (rand() - 0.5) * size * 0.3;
    const part = upTo >= 1 ? 1 : clamp01((upTo - k++ * 0.56) / 0.44);
    if (part <= 0) continue;
    const x1 = x - Math.cos(a) * l1, y1 = y - Math.sin(a) * l1;
    const x2 = x + Math.cos(a) * l2, y2 = y + Math.sin(a) * l2;
    const qx = x - Math.sin(a) * bow, qy = y + Math.cos(a) * bow;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (part >= 1) ctx.quadraticCurveTo(qx, qy, x2, y2);
    else {
      // the first `part` of the same curve (de Casteljau split)
      const t = 1 - Math.pow(1 - part, 2), u = 1 - t;
      ctx.quadraticCurveTo(x1 + (qx - x1) * t, y1 + (qy - y1) * t, u * u * x1 + 2 * u * t * qx + t * t * x2, u * u * y1 + 2 * u * t * qy + t * t * y2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A flicked ballpoint line. Heavy where the pen was resting, thinning and
// skipping as it lifts off. `upTo` (0..1) draws only the first part, for animation.
export function inkFlick(ctx: Ctx, pts: Pt[], color: string, seed: number, width: number, upTo = 1, alpha = 1, wob = 0) {
  if (pts.length < 2) return;
  const rand = rng(seed);
  const w = wave(seed + 7);
  const wb = wob ? wave(seed * 5 + wob * 211) : null;
  const n = pts.length - 1;
  if (upTo <= 0) return;
  const head = n * Math.min(1, upTo);
  const last = Math.ceil(head);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  // resting blob
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55 * alpha;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, width * 1.1, 0, Math.PI * 2);
  ctx.fill();
  // sub-sample each segment so width can taper smoothly
  const skipAt = 0.72 + rand() * 0.15; // where the ball starts skipping
  for (let i = 1; i <= last; i++) {
    const t = i / n;
    const a = pts[i - 1], b = pts[i];
    // jitter perpendicular a hair so it isn't a vector-perfect curve
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const j = w(t * 3) * width * 0.35 + (wb ? wb(t * 7) * width * REDRAW.flick : 0);
    if (t > skipAt && rand() < (t - skipAt) * 1.6) continue; // dry skip
    const taper = t < 0.08 ? 1.15 : 1 - Math.pow(t, 1.8) * 0.72;
    ctx.globalAlpha = (0.88 - t * 0.25 + (rand() - 0.5) * 0.1) * alpha;
    ctx.lineWidth = width * taper;
    const f = Math.min(1, head - (i - 1)); // the head of a line being drawn
    ctx.beginPath();
    ctx.moveTo(a.x - (dy / l) * j, a.y + (dx / l) * j);
    const ex = f >= 1 ? b.x : a.x + dx * f, ey = f >= 1 ? b.y : a.y + dy * f;
    ctx.lineTo(ex - (dy / l) * j, ey + (dx / l) * j);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Pencil guide: grainy, broken, clearly "not ink yet".
export function pencilLine(ctx: Ctx, a: Pt, b: Pt, width: number, seed: number, dash = true) {
  const rand = rng(seed);
  ctx.strokeStyle = INK.pencil;
  ctx.lineCap = "round";
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const seg = dash ? width * 4 : l;
  const gap = dash ? width * 3 : 0;
  for (let d = 0; d < l; d += seg + gap) {
    const t0 = d / l, t1 = Math.min(1, (d + seg) / l);
    ctx.globalAlpha = 0.5 + rand() * 0.35;
    ctx.lineWidth = width * (0.8 + rand() * 0.4);
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
    ctx.lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A loose pencil loop around something: the "these are yours" ring a hand
// draws. Grainy and uneven, lighter where the lead lands and lifts.
export function pencilLoop(ctx: Ctx, cx: number, cy: number, r: number, seed: number, width: number, upTo = 1, alpha = 1) {
  if (upTo <= 0 || alpha <= 0) return;
  const rand = rng(seed);
  const w = wave(seed + 3);
  const start = rand() * Math.PI * 2;
  const sweep = Math.PI * 2 * (1.05 + rand() * 0.1);
  const squash = 1 + (rand() - 0.5) * 0.1;
  const steps = Math.max(28, Math.round(r / 2.5));
  const shade = Array.from({ length: steps }, () => rand());
  const at = (t: number) => {
    const a = start + sweep * t, rr = r * (1 + w(t * 2) * 0.045);
    return { x: cx + Math.cos(a) * rr * squash, y: cy + Math.sin(a) * rr / squash };
  };
  const head = steps * Math.min(1, upTo);
  ctx.strokeStyle = INK.pencil;
  ctx.lineCap = "round";
  for (let i = 0; i < Math.ceil(head); i++) {
    const t0 = i / steps, t1 = Math.min(head, i + 1) / steps;
    const ends = Math.min(1, t0 / 0.08, (1 - t0) / 0.1); // pressure: light in, light out
    ctx.globalAlpha = alpha * (0.35 + shade[i] * 0.35) * (0.4 + 0.6 * Math.max(0, ends));
    ctx.lineWidth = width * (0.75 + shade[i] * 0.5);
    const a = at(t0), b = at(t1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// A pencil arrow, bowed a little, for notes in the margin.
export function pencilArrow(ctx: Ctx, from: Pt, to: Pt, bend: number, seed: number, width: number, upTo = 1, alpha = 1) {
  if (upTo <= 0 || alpha <= 0) return;
  const rand = rng(seed);
  const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1;
  const c = { x: (from.x + to.x) / 2 - (dy / l) * bend * l, y: (from.y + to.y) / 2 + (dx / l) * bend * l };
  const at = (t: number) => {
    const u = 1 - t;
    return { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y };
  };
  const steps = 16;
  const shade = Array.from({ length: steps + 2 }, () => rand());
  ctx.strokeStyle = INK.pencil;
  ctx.lineCap = "round";
  const head = steps * Math.min(1, upTo / 0.8);
  for (let i = 0; i < Math.ceil(head); i++) {
    const a = at(i / steps), b = at(Math.min(head, i + 1) / steps);
    ctx.globalAlpha = alpha * (0.5 + shade[i] * 0.35);
    ctx.lineWidth = width * (0.8 + shade[i] * 0.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const barbs = Math.min(1, Math.max(0, (upTo - 0.8) / 0.2));
  if (barbs > 0) {
    // the head: two flicks back from the tip, along the curve's last tangent
    const e = at(1), p = at(0.9);
    const ang = Math.atan2(e.y - p.y, e.x - p.x);
    const len = Math.min(width * 9, l * 0.25) * barbs;
    for (const [k, s] of [[0, 1], [1, -1]] as const) {
      const a = ang + Math.PI + s * (0.5 + shade[steps + k] * 0.15);
      ctx.globalAlpha = alpha * 0.75;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(a) * len, e.y + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Handwriting on the page (Caveat). `upTo` reveals it left to right, as if
// being written; `rot` tilts the line the way a hand drifts.
export function handText(
  ctx: Ctx, text: string, x: number, y: number, size: number, color: string,
  o: { upTo?: number; alpha?: number; weight?: number; rot?: number; align?: "left" | "center" | "right" } = {},
) {
  const { upTo = 1, alpha = 1, weight = 700, rot = 0, align = "left" } = o;
  if (upTo <= 0 || alpha <= 0) return 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${weight} ${size}px Caveat, "Patrick Hand", cursive`;
  const w = ctx.measureText(text).width;
  const x0 = align === "center" ? -w / 2 : align === "right" ? -w : 0;
  if (upTo < 1) {
    ctx.beginPath();
    ctx.rect(x0 - size, -size * 1.5, size + w * upTo, size * 3);
    ctx.clip();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x0, 0);
  ctx.restore();
  return w;
}

// Grain for the paper, rendered once.
export function paperGrain(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v < 0.5 ? 60 : 255;
    img.data[i + 3] = Math.floor(Math.pow(r(), 3) * 26);
  }
  g.putImageData(img, 0, 0);
  // a few soft foxing stains
  for (let k = 0; k < 5; k++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(170, 130, 60, 0.07)");
    grad.addColorStop(1, "rgba(170, 130, 60, 0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}
