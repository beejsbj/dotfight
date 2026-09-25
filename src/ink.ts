// Ballpoint and pencil marks. Everything is seeded so a mark redraws the same
// way every frame: the page is a record, not an animation.

import { rng, type Pt } from "./game";

export const INK = {
  paper: "#f5f0e3",
  rule: "rgba(92, 140, 196, 0.38)",
  margin: "rgba(206, 70, 70, 0.55)",
  pencil: "rgba(70, 68, 66, 0.55)",
  pens: ["#1f3a9e", "#c2252f"] as const, // blue ballpoint, red ballpoint
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

// A hand-drawn circle: never quite round, never quite closed. `upTo` (0..1)
// draws it on: the first loop, then a lighter second pass overlapping its end.
// Every seeded value is taken before anything is skipped, so a half-drawn
// circle is exactly the start of the finished one.
export function inkCircle(ctx: Ctx, cx: number, cy: number, r: number, color: string, seed: number, width = 2.6, passes = 2, upTo = 1) {
  const rand = rng(seed);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let p = 0; p < passes; p++) {
    const w = wave(seed + p * 31);
    const start = rand() * Math.PI * 2;
    const sweep = Math.PI * 2 * (1.03 + rand() * 0.1); // overshoot
    const squash = 1 + (rand() - 0.5) * 0.08;
    const tilt = rand() * Math.PI;
    const done = upTo >= 1 ? 1 : p === 0 ? clamp01(upTo / 0.72) : clamp01((upTo - 0.62) / 0.38);
    if (done <= 0) continue;
    const steps = 64;
    const at = (t: number): [number, number] => {
      const a = start + sweep * t;
      const rr = r * (1 + w(t * 2.2) * 0.035 + p * 0.025);
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

// A soldier: a pressed ballpoint dot, slightly lumpy.
// `grow` (0..1) jots it: the ball presses in and spreads.
export function inkDot(ctx: Ctx, x: number, y: number, r: number, color: string, seed: number, alpha = 1, grow = 1) {
  if (grow <= 0) return;
  const rand = rng(seed);
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
export function inkCross(ctx: Ctx, x: number, y: number, size: number, color: string, seed: number, width = 2.4, alpha = 1, upTo = 1) {
  if (upTo <= 0) return;
  const rand = rng(seed);
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
export function inkFlick(ctx: Ctx, pts: Pt[], color: string, seed: number, width: number, upTo = 1, alpha = 1) {
  if (pts.length < 2) return;
  const rand = rng(seed);
  const w = wave(seed + 7);
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
    const j = w(t * 3) * width * 0.35;
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

// A ballpoint pen lying on the page, tip at (x,y), pointing along `angle`.
// `pull` (0..1) slides it back as the flick charges. `lift` (0..1) takes it
// off the page: the shadow drops away and the pen fades.
export function drawPen(ctx: Ctx, x: number, y: number, angle: number, pull: number, cap: string, scale: number, lift = 0) {
  if (lift >= 1) return;
  const A = 1 - lift * lift;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI); // body extends behind the tip
  const back = pull * 26 * scale;
  ctx.translate(back, 0);
  const L = 150 * scale, R = 6.5 * scale;
  // shadow: further from the pen, and softer, the higher it is lifted
  ctx.globalAlpha = 0.18 * A;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(L * 0.55 + (4 + lift * 10) * scale, (7 + lift * 18) * scale, L * 0.5, R * (0.9 + lift * 0.8), 0, 0, Math.PI * 2);
  ctx.fill();
  const up = 1 + lift * 0.07;
  ctx.scale(up, up);
  ctx.globalAlpha = A;
  // tip cone
  ctx.fillStyle = "#c9c2b0";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(18 * scale, -R * 0.8);
  ctx.lineTo(18 * scale, R * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(1.2 * scale, 0, 1.3 * scale, 0, Math.PI * 2);
  ctx.fill();
  // translucent hex barrel
  ctx.fillStyle = "rgba(235, 238, 240, 0.85)";
  ctx.strokeStyle = "rgba(60, 60, 60, 0.5)";
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.rect(18 * scale, -R, L - 18 * scale, R * 2);
  ctx.fill();
  ctx.stroke();
  // ink refill inside the barrel
  ctx.fillStyle = cap;
  ctx.globalAlpha = 0.7 * A;
  ctx.fillRect(22 * scale, -1.3 * scale, L * 0.8, 2.6 * scale);
  ctx.globalAlpha = A;
  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillRect(20 * scale, -R * 0.65, L - 24 * scale, 1.4 * scale);
  // end cap + clip
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.roundRect(L - 4 * scale, -R * 1.05, 16 * scale, R * 2.1, 3 * scale);
  ctx.fill();
  ctx.fillRect(L - 30 * scale, -R * 1.25 - 3 * scale, 34 * scale, 3 * scale);
  ctx.restore();
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
